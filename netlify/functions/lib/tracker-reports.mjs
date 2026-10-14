import {getStore} from '@netlify/blobs';
import Queue from './report-queue-core.cjs';
import Core from './job-moderation-core.cjs';
import {verifyCommunity} from './community-auth.mjs';
import {verifyOwner} from './job-moderation-auth.mjs';
import Native from './native-origin.cjs';
import Account from './account-state.cjs';
const SOURCES=['StillUnemployed.com','LinkedIn','Indeed','Company website','Referral','Other'];
export function validateInput(input){
  const j=input.job;if(!Queue.plain(j)||Object.keys(j).some(k=>!['link','company','role','source'].includes(k))||!['unavailable','suspicious','incorrect','other'].includes(input.reason)||!SOURCES.includes(j.source))throw Core.fail(400,'Invalid report');
  const company=Queue.text(j.company,200,{optional:true}),role=Queue.text(j.role,300,{optional:true});if(!company&&!role)throw Core.fail(400,'Include the company or role');
  return {requestId:input.requestId,job:{link:Queue.publicURL(j.link,{optional:true}),company,role,source:j.source},reason:input.reason};
}
export function createService({openStore=scope=>getStore({name:'su-tracker-reports-v1-'+scope,consistency:'strong'}),authenticate=verifyCommunity,owner=verifyOwner,now=Date.now}={}){
  return async(request,context)=>{try{
    const scope=Core.scopeFor(request,context);
    if(request.method==='GET'){Native.authorizeOrigin(request,{native:true,readOnly:true});if((await owner(request))?.role!=='owner')throw Core.fail(403,'Owner access required');return Queue.response(200,{...Queue.page((await Queue.read(openStore(scope))).state,request),scope});}
    if(request.method!=='POST')return Queue.response(405,{error:'Method not allowed'});
    Native.authorizeOrigin(request,{native:true});const account=await authenticate(request);if(!account?.uid)throw Core.fail(401,'Sign in to report this job');
    const input=validateInput(await Queue.body(request,['requestId','job','reason']));
    const accountDependencies=Account.enabled(process.env)?Account.dependencies():null;
    const result=await Account.runActive(account.uid,()=>Queue.mutate({store:openStore(scope),input,scope,uid:account.uid,ip:context.ip,now,guard:accountDependencies?()=>Account.assertActive(account.uid,accountDependencies):undefined,apply(state,{who,at,reportId}){
      const identity=Queue.hash(JSON.stringify({job:input.job,reason:input.reason})),prior=state.records.find(r=>r.actor===who&&r.identity===identity&&r.status==='pending_review');
      if(prior)return {reportId:prior.reportId,status:'pending_review',duplicate:true};
      state.records.push({reportId,identity,actor:who,job:input.job,reason:input.reason,status:'pending_review',receivedAt:new Date(at).toISOString()});return {reportId,status:'pending_review'};
    }}),accountDependencies);
    return Queue.response(202,result);
  }catch(e){return Queue.error(e);}};
}
export const handle=createService();
