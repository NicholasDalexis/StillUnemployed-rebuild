'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const Account=require('../../netlify/functions/lib/account-state.cjs');
const Queue=require('../../netlify/functions/lib/report-queue-core.cjs');
const Core=require('../../netlify/functions/lib/job-moderation-core.cjs');
const {database}=require('./helpers/analytics-store.cjs');
const modules=Promise.all([
  import('../../netlify/functions/lib/account-deletion.mjs'),
  import('../../netlify/functions/lib/account-report-erasure.mjs')
]);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function conditionalStore(initial,{delayFirstWrite=false}={}){
  let text=initial?JSON.stringify(initial):null,version=initial?1:0,writes=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const results=[];
  return {
    results,release,
    get data(){return text===null?null:JSON.parse(text);},
    async getWithMetadata(){return text===null?null:{data:text,etag:String(version)};},
    async setJSON(_key,value,condition){
      const serial=++writes;
      if(delayFirstWrite&&serial===1)await gate;
      const matches=condition.onlyIfNew?text===null:condition.onlyIfMatch===String(version);
      if(matches){text=JSON.stringify(value);version++;}
      const result={modified:matches};results.push({serial,...result});return result;
    }
  };
}

for(const absent of [false,true])test('erasure fences a timed-out report CAS against an '+(absent?'absent':'unchanged')+' queue',async()=>{
  const [,Erasure]=await modules,uid='fixture-late-report',d={db:database(),env:{SU_ACCOUNT_DELETION_ENABLED:'true'},now:Date.now};
  const tracker=conditionalStore(absent?null:Queue.empty(),{delayFirstWrite:true});
  const availability=conditionalStore(Queue.empty());
  const originalWithin=Core.within;
  // Exercise the real timeout behavior with a shorter local fixture deadline.
  // The pending conditional write remains alive after Promise.race rejects.
  Core.within=(work,ms)=>originalWithin(work,Math.min(ms??Core.LIMITS.ioMs,50));
  try{
    await assert.rejects(()=>Account.runActive(uid,()=>Queue.mutate({
      store:tracker,input:{requestId:randomUUID()},scope:'production',uid,ip:'192.0.2.50',
      guard:()=>Account.assertActive(uid,d),
      apply(state,{who,at,reportId}){
        state.records.push({reportId,actor:who,status:'pending_review',receivedAt:new Date(at).toISOString()});
        return {reportId,status:'pending_review'};
      }
    }),d),error=>error.status===503);
    assert.equal(Account.hasOperations(await d.db.doc(Account.OPERATIONS+'/'+uid).get(),Date.now()),false);
    await d.db.doc(Account.MARKERS+'/'+uid).set({state:'complete',requestId:randomUUID()});
    await Erasure.eraseReportAttribution(uid,{scopes:['production'],openStore:name=>name.includes('tracker-reports')?tracker:availability});
    tracker.release();await tick();await tick();
    assert.equal(tracker.results.find(write=>write.serial===1)?.modified,false,'a pre-erasure CAS cannot commit after the erasure fence');
    assert.ok(tracker.data?.revision>=1,'even an untouched queue gets a durable revision fence');
    assert.equal(tracker.data.records.some(row=>row.actor==='account:'+uid),false);
    assert.equal(tracker.data.receipts.some(row=>row.actor==='account:'+uid),false);
    Queue.validate(tracker.data);
  }finally{tracker.release();Core.within=originalWithin;}
});

test('overlapping confirmed deletion processes serialize and cannot regress completion',async()=>{
  const [Deletion]=await modules,uid='fixture-overlapping-delete',requestId=randomUUID(),now=Date.now();
  let exists=true,revokeCalls=0,reportCalls=0,failReports=false,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const missing=()=>Object.assign(Error('Fixture user missing'),{code:'auth/user-not-found'});
  const token='synthetic.firebase.idtoken';
  const d={db:database(),env:{SU_ACCOUNT_DELETION_ENABLED:'true',SU_ANALYTICS_SECRET:'synthetic-fixture-secret'},now:()=>now,auth:{
    async verifyIdToken(value,checkRevoked){
      if(value!==token)throw Error('Invalid fixture token');
      if(checkRevoked&&!exists)throw missing();
      return {uid,auth_time:Math.floor(now/1000),firebase:{sign_in_provider:'apple.com'}};
    },
    async getUser(){if(!exists)throw missing();return {uid,providerData:[{providerId:'apple.com',uid:'synthetic-apple-sub'}]};},
    async deleteUser(){exists=false;}
  }};
  const handle=Deletion.createService({getDependencies:()=>d,
    eraseReports:async()=>{reportCalls++;if(failReports)throw Core.fail(503,'Fixture erasure outage');},
    appleRevoker:{async prepare(){return 'synthetic-sealed-credential';},async revoke(){revokeCalls++;await gate;}}
  });
  const context={site:{id:Core.SITE_ID,name:'stillunemployed'},deploy:{context:'production'},ip:'192.0.2.50'};
  const request=(phase,continuation)=>new Request('https://stillunemployed.com/api/account/delete',{
    method:'POST',headers:{Origin:'capacitor://localhost','X-SU-Native':'1','Content-Type':'application/json',...(phase==='start'?{Authorization:'Bearer '+token}:{})},
    body:JSON.stringify({phase,requestId,confirm:true,...(continuation?{continuation}:{apple:{idToken:'synthetic-apple-token'}})})
  });
  const start=await handle(request('start'),context),receipt=await start.json();
  assert.equal(start.status,202);assert.equal(revokeCalls,0);assert.equal(exists,true);
  assert.equal(typeof receipt.continuation,'string');
  const first=handle(request('process',receipt.continuation),context);
  for(let attempt=0;revokeCalls===0&&attempt<100;attempt++)await tick();
  assert.equal(revokeCalls,1);
  const overlap=await handle(request('process',receipt.continuation),context);
  assert.equal(overlap.status,202,'overlapping work receives processing without a second Apple revocation');
  assert.equal(revokeCalls,1);
  release();const complete=await first;
  assert.equal(complete.status,200);assert.equal((await complete.json()).deleted,true);
  assert.equal(exists,false);assert.equal(reportCalls,1);
  const marker=d.db.data.get(Account.MARKERS+'/'+uid);assert.equal(marker.state,'complete');
  failReports=true;
  const recovered=await handle(request('process',receipt.continuation),context);
  assert.equal(recovered.status,200);assert.equal((await recovered.json()).deleted,true);
  assert.equal(reportCalls,1,'completion recovery never restarts erasure');
  assert.equal(revokeCalls,1);assert.equal(d.db.data.get(Account.MARKERS+'/'+uid).state,'complete');
  assert.equal(d.db.data.get(Account.MARKERS+'/'+uid).processingKey,undefined);
});
