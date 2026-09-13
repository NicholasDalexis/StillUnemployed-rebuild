import {getStore} from '@netlify/blobs';
import Core from './job-moderation-core.cjs';
import Queue from './report-queue-core.cjs';
import Outbox from './availability-outbox.cjs';
import {verifyCommunity} from './community-auth.mjs';
import {verifyOwner} from './job-moderation-auth.mjs';
import {currentCatalog} from './job-moderation.mjs';
import Identity from '../../../js/job-identity.js';
import Availability from './job-availability-core.cjs';
const {validate,publicIndex,hidden,same}=Availability;
// An observation is not a diagnosis. The owner review endpoint accepts explicit
// ATS/page evidence only; UNKNOWN never restores or permanently retires a role.
export function reviewInput(input,now){
  if(!['open','closed','unknown'].includes(input.result)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||!Queue.plain(input.evidence)||Object.keys(input.evidence).some(k=>!['url','type','checkedAt','excerpt'].includes(k)))throw Core.fail(400,'Invalid review');
  const e=input.evidence,types={open:['explicit_open'],closed:['explicit_closed','job_not_found','workday_unavailable'],unknown:['unknown']};
  if(!types[input.result].includes(e.type)||!Number.isFinite(Date.parse(e.checkedAt))||Date.parse(e.checkedAt)>now+1000||now-Date.parse(e.checkedAt)>3600000)throw Core.fail(400,'Use fresh authoritative evidence');
  const excerpt=Queue.text(e.excerpt,1000,{optional:input.result==='unknown'}),url=Queue.publicURL(e.url);
  if(!Identity.equivalent(url,input.link))throw Core.fail(400,'Evidence must identify this exact posting');
  if(e.type==='job_not_found'&&!/^job not found[.!]?$/i.test(excerpt)||e.type==='workday_unavailable'&&!/^postingAvailable\s*:\s*false$/.test(excerpt)||e.type==='explicit_closed'&&!/no longer (available|accepting applications)|position (has been |is )?(filled|closed)|job (has been |is )?(closed|removed)|posting (has )?expired/i.test(excerpt))throw Core.fail(400,'Closure needs explicit posting evidence');
  return {...input,evidence:{url,type:e.type,checkedAt:new Date(Date.parse(e.checkedAt)).toISOString(),excerpt}};
}
export function createService({openStore=scope=>getStore({name:'su-job-availability-v1-'+scope,consistency:'strong'}),authenticate=verifyCommunity,owner=verifyOwner,getCatalog=currentCatalog,now=Date.now}={}){
  return async function handle(request,context,{admin=false,review=false}={}){try{
    const scope=Core.scopeFor(request,context);
    if(admin){if(request.method!=='GET')return Queue.response(405,{error:'Method not allowed'});Core.authorizeOrigin(request,{readOnly:true});if((await owner(request))?.role!=='owner')throw Core.fail(403,'Owner access required');return Queue.response(200,{...Queue.page(validate((await Queue.read(openStore(scope))).state),request),scope});}
    if(!review&&request.method==='GET')return Queue.response(200,publicIndex((await Queue.read(openStore(scope))).state,now()));
    if(request.method!=='POST')return Queue.response(405,{error:'Method not allowed'});
    Core.authorizeOrigin(request);
    let account=null;if(review){if((await owner(request))?.role!=='owner')throw Core.fail(403,'Owner access required');account={uid:'review-owner'};}else if(request.headers.has('authorization')){account=await authenticate(request);if(!account?.uid)throw Core.fail(401,'Sign in with Google again');}
    let input=await Queue.body(request,review?['requestId','link','expectedRevision','result','evidence']:['requestId','link']);input.link=Queue.publicURL(input.link);
    if(review)input=reviewInput(input,now());
    let catalog;
    const result=await Queue.mutate({store:openStore(scope),input,scope,uid:account?.uid,ip:context.ip,now,rateExempt:review,apply:async(state,{who,at,reportId,uid})=>{
      validate(state);const keys=Identity.keys(input.link);const matches=state.records.filter(r=>same(r.keys,keys));if(matches.length>1)throw Core.fail(409,'Posting identity is ambiguous');let record=matches[0];if(record&&record.holdAuthorized===undefined)record.holdAuthorized=Availability.authorizedHold(record);
      if(review){
        if(!record||record.revision!==input.expectedRevision)throw Core.fail(409,'Refresh this report before reviewing');
        if(record.reviews.length>=100)throw Core.fail(503,'Review history is full');
        if(input.result==='open')record.holdAuthorized=false;record.status=input.result==='open'?'restored':input.result==='closed'?'retired':'human_review';record.revision++;record.reviews.push({result:input.result,evidence:input.evidence,at:new Date(at).toISOString(),actor:'owner'});record.lastReviewedReporters=record.reporters.slice();record.needsCheck=input.result==='unknown';record.humanReviewRequired=input.result==='unknown';if(record.humanReviewRequired)Outbox.ensureAlert(record,'unknown_evidence',at);
      }else{
        // Always resolve against the authoritative catalog, never an arbitrary URL.
        catalog ||= await Core.within(()=>getCatalog(input.link),12000);
        if(!catalog||!Array.isArray(catalog.jobs)||!Number.isFinite(catalog.checkedAt)||at-catalog.checkedAt>30000||catalog.checkedAt>at+1000)throw Core.unavailable();
        const found=catalog.jobs.filter(j=>same(Identity.keys(j.link),keys));
        if(found.length!==1)throw Core.fail(409,'This posting is not on the current board. Refresh to check it.');
        if(!record){const source=Core.sourceRecord(found[0]);record={reportId,keys:source.keys,slugs:source.slugs,link:source.link,status:uid?'quarantined':'queued_check',receivedAt:new Date(at).toISOString(),holdAuthorized:!!uid,reporters:[],reviews:[],revision:1,metadata:source.metadata};state.records.push(record);}
        else if(uid&&record.status==='queued_check'){record.status='quarantined';record.revision++;}
        else if(uid&&record.status==='restored'&&!record.reporters.includes(who)){record.status='human_review';record.revision++;Outbox.ensureAlert(record,'contradictory_report',at);}
        if(uid){record.holdAuthorized=true;if(!record.reporters.includes(who))record.reporters.push(who);}
        if(record.status!=='retired'){record.needsCheck=true;record.checkRequestedAt=new Date(at).toISOString();record.humanReviewRequired=record.status==='human_review';}
      }
      validate(state);return {reportId:record.reportId,status:record.status,extra:{globallyHidden:hidden(record)}};
    }});return Queue.response(202,result);
  }catch(e){return Queue.error(e);}};
}
export const handle=createService();
export {availabilityIndex} from './job-availability-index.mjs';
