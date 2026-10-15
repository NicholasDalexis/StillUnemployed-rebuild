import {getStore} from '@netlify/blobs';
import Queue from './report-queue-core.cjs';
import Core from './job-moderation-core.cjs';
import Availability from './job-availability-core.cjs';
export async function eraseReportAttribution(uid,{openStore=name=>getStore({name,consistency:'strong'}),scopes=['production','preview']}={}){
  const who='account:'+uid;
  for(const scope of scopes)for(const kind of ['tracker-reports','job-availability']){
    const store=openStore('su-'+kind+'-v1-'+scope);
    let complete=false;
    for(let attempt=0;attempt<5;attempt++){
      const {state,etag}=await Queue.read(store);let changed=false;
      if(kind==='job-availability')Availability.validate(state);
      for(const r of state.records){
        if(kind==='job-availability'){
          // Preserve the visibility decision before removing who reported it.
          const hold=Availability.authorizedHold(r);
          for(const key of ['reporters','lastReviewedReporters'])if(Array.isArray(r[key])&&r[key].includes(who)){r[key]=r[key].filter(x=>x!==who);changed=true;r.holdAuthorized=hold;}
          for(const review of r.reviews||[])if(review.actor===who){review.actor='erased';changed=true;}
        }else if(r.actor===who){delete r.actor;changed=true;}
      }
      const receipts=state.receipts.filter(r=>r.actor!==who);
      if(receipts.length!==state.receipts.length){state.receipts=receipts;changed=true;}
      // Always CAS a fence, including an unchanged or previously absent queue.
      // A report commit already in flight when its function timed out must lose
      // its old ETag/onlyIfNew before deletion can be reported complete.
      state.revision++;Queue.validate(state);if(kind==='job-availability')Availability.validate(state);
      const saved=await Core.within(()=>store.setJSON('state',state,etag?{onlyIfMatch:etag}:{onlyIfNew:true}));
      if(!saved?.modified)continue;
      const check=(await Queue.read(store)).state;
      if(check.receipts.some(r=>r.actor===who)||check.records.some(r=>r.actor===who||(r.reporters||[]).includes(who)||(r.lastReviewedReporters||[]).includes(who)))throw Core.unavailable();
      complete=true;break;
    }
    if(!complete)throw Core.fail(503,'Deletion is still processing. Please retry.');
  }
}
