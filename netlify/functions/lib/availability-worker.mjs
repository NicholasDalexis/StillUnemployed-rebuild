import {getStore} from '@netlify/blobs';
import {randomUUID} from 'node:crypto';
import Core from './job-moderation-core.cjs';
import Queue from './report-queue-core.cjs';
import Availability from './job-availability-core.cjs';
import Outbox from './availability-outbox.cjs';
import {verifyPosting} from './availability-verifier.mjs';
function boundedStore(store){return {getWithMetadata:(...args)=>Core.within(()=>store.getWithMetadata(...args),1500),setJSON:(...args)=>Core.within(()=>store.setJSON(...args),1500)};}
function scopeFor(context){const branch=['branch-deploy','deploy-preview'].includes(context?.deploy?.context);return Core.scopeFor(new Request(branch?'https://preview--stillunemployed.netlify.app/api/job-availability':'https://stillunemployed.com/api/job-availability'),context);}
export function createWorker({openStore=scope=>getStore({name:'su-job-availability-v1-'+scope,consistency:'strong'}),verify=verifyPosting,env,now=Date.now}={}){
  return async function run(context){
    const scope=scopeFor(context),enabled=env?env.SU_AVAILABILITY_CHECKS_ENABLED:globalThis.Netlify?.env?.get('SU_AVAILABILITY_CHECKS_ENABLED');if(enabled!=='true')return {state:'disabled',scope};
    const store=boundedStore(openStore(scope)),startedAt=now(),runId=randomUUID();let outcome='idle',reportId=null;
    try{
      const snapshot=Availability.validate((await Queue.read(store)).state);
      const record=snapshot.records.filter(r=>r.needsCheck&&!r.humanReviewRequired&&r.status!=='retired').sort((a,b)=>Date.parse(a.checkRequestedAt||a.receivedAt)-Date.parse(b.checkRequestedAt||b.receivedAt))[0];
      if(record){
        reportId=record.reportId;const observation=await verify(record.link,{now});
        if(!['open','closed','unknown'].includes(observation?.result)||!observation.evidence||!Number.isFinite(Date.parse(observation.evidence.checkedAt))||Math.abs(now()-Date.parse(observation.evidence.checkedAt))>60000)throw Core.unavailable();
        const input={requestId:runId,link:record.link,expectedRevision:record.revision,...observation};
        await Queue.mutate({store,input,scope,uid:'availability-verifier',rateExempt:true,attempts:1,now,apply(state,{at}){
          Availability.validate(state);const current=state.records.find(r=>r.reportId===record.reportId);
          if(!current||current.revision!==record.revision||current.humanReviewRequired||!current.needsCheck)throw Core.conflict();
          if(current.reviews.length>=100)throw Core.unavailable();
          current.holdAuthorized=observation.result==='open'?false:Availability.authorizedHold(current);
          current.status=observation.result==='open'?'restored':observation.result==='closed'?'retired':'human_review';current.revision++;
          current.needsCheck=false;current.humanReviewRequired=observation.result==='unknown';current.lastReviewedReporters=current.reporters.slice();
          current.reviews.push({result:observation.result,evidence:observation.evidence,at:new Date(at).toISOString(),actor:'scheduled-verifier',runId});
          if(current.humanReviewRequired)Outbox.ensureAlert(current,'unknown_evidence',at);
          outcome=observation.result;return {reportId:current.reportId,status:current.status,extra:{globallyHidden:Availability.hidden(current)}};
        }});
      }
      const receipt={schemaVersion:1,runId,scope,state:'completed',outcome,reportId,startedAt:new Date(startedAt).toISOString(),finishedAt:new Date(now()).toISOString()};await Core.within(()=>store.setJSON('last-check-run',receipt));return receipt;
    }catch(e){const receipt={schemaVersion:1,runId,scope,state:e.status===409?'superseded':'failed',outcome:'unknown',reportId,startedAt:new Date(startedAt).toISOString(),finishedAt:new Date(now()).toISOString()};await Core.within(()=>store.setJSON('last-check-run',receipt));if(e.status===409)return receipt;throw Core.unavailable();}
  };
}
export const run=createWorker();
