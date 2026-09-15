const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../../js/tracker-reports.js');
const requestId='10000000-0000-4000-8000-000000000001';
const job={link:'https://example.com/job',company:'Example',role:'Designer',source:'Me',notes:'Private recruiter details',status:'Offer',dateApplied:'2026-09-13'};
const receipt={schemaVersion:1,requestId,reportId:'a'.repeat(64),status:'pending_review',duplicate:false,scope:'preview'};
function fixture(options={}) {
  const calls=[],timers=[];let current=true;
  const root={location:{hostname:'preview--stillunemployed.netlify.app'},AbortController,
    setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},
    SUAuth:{signedIn:()=>true,accountCurrent:()=>current,getToken:async()=> 'test-token'},
    fetch:async(url,init)=>{calls.push({url,init});return {ok:true,status:202,text:async()=>JSON.stringify(receipt)}},...options};
  const client=create(root);
  return {root,client,calls,timers,changeAccount(){current=false;},report(j=job,extra={}){return client.report(j,{requestId,reason:'suspicious',current:()=>current,...extra});}};
}
test('report payload allowlist excludes notes, dates, statuses and normalizes legacy source',async()=>{
  const f=fixture();assert.deepEqual(await f.report(),receipt);
  const {url,init}=f.calls[0];assert.equal(url,'/api/tracker-reports');assert.equal(init.headers.Authorization,'Bearer test-token');assert.equal(init.redirect,'error');
  assert.deepEqual(JSON.parse(init.body),{requestId,reason:'suspicious',job:{link:job.link,company:'Example',role:'Designer',source:'Other'}});
  assert.doesNotMatch(init.body,/Private|notes|Offer|dateApplied/);
  await f.report({...job,source:'StillUnemployed'});assert.equal(JSON.parse(f.calls[1].init.body).job.source,'StillUnemployed.com');
});
test('external job and no-link manual record use the same review-only endpoint',async()=>{
  const f=fixture();await f.report({...job,link:'',company:'',source:'Referral'},{reason:'incorrect'});
  assert.equal(JSON.parse(f.calls[0].init.body).job.link,'');assert.equal(JSON.parse(f.calls[0].init.body).job.company,'');assert.equal(JSON.parse(f.calls[0].init.body).reason,'incorrect');
  assert.equal(job.status,'Offer');
});
test('signed-out or changed-account token acquisition never sends a request',async()=>{
  const f=fixture();f.root.SUAuth.getToken=async()=>{f.changeAccount();return'test-token';};
  await assert.rejects(f.report(),/Sign in again/);assert.equal(f.calls.length,0);
  const guest=fixture();guest.root.SUAuth.signedIn=()=>false;await assert.rejects(guest.report(),/Sign in again/);assert.equal(guest.calls.length,0);
});
test('late response from a previous account cannot acknowledge a current report',async()=>{
  const f=fixture();f.root.fetch=async()=>{f.changeAccount();return {ok:true,status:202,text:async()=>JSON.stringify(receipt)};};
  await assert.rejects(f.report(),/Sign in again/);
});
test('only the matching scoped pending-review receipt is accepted',async()=>{
  for(const response of [{}, {...receipt,requestId:'wrong'}, {...receipt,scope:'production'}, {...receipt,status:'published'}, {...receipt,reportId:'bad'}, {...receipt,duplicate:undefined}]) {
    const f=fixture({fetch:async()=>({ok:true,status:202,text:async()=>JSON.stringify(response)})});
    await assert.rejects(f.report(),/Receipt could not be confirmed/);
  }
});
test('rate and service errors retain a retryable same request ID',async()=>{
  for(const [status,message] of [[429,/Too many/],[503,/Receipt could not/],[401,/Sign in again/],[409,/reopen/]]) {
    const f=fixture({fetch:async()=>({ok:false,status,text:async()=> '{}'})});await assert.rejects(f.report(),message);
  }
  const f=fixture();let attempts=0;
  f.root.fetch=async(url,init)=>{f.calls.push(JSON.parse(init.body));if(!attempts++)throw Error('offline');return {ok:true,status:202,text:async()=>JSON.stringify({...receipt,duplicate:true})};};
  await assert.rejects(f.report(),/Receipt could not/);assert.equal((await f.report()).duplicate,true);assert.deepEqual(f.calls[0],f.calls[1]);
});
test('malformed request identity or reason cannot spend an authenticated request',async()=>{
  const f=fixture();await assert.rejects(f.report(job,{requestId:'bad'}),/prepare/);await assert.rejects(f.report(job,{reason:'send notes'}),/Choose a reason/);assert.equal(f.calls.length,0);
});
test('a stalled request times out without acknowledging a report',async()=>{
  const f=fixture({fetch:()=>new Promise(()=>{})});const pending=f.report();await new Promise(resolve=>setImmediate(resolve));f.timers[0]();await assert.rejects(pending,/Receipt could not be confirmed/);
});
