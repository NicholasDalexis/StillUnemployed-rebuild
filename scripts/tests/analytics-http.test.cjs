/* Real loopback HTTP, injected synthetic identity, durable file store. Never deployed. */
const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {database}=require('./helpers/analytics-store.cjs');const S=require('../../netlify/functions/lib/analytics-service.cjs');const C=require('../../netlify/functions/lib/analytics-core.cjs');const P=require('../../js/personalization.js');
test('HTTP collection survives store restart and feeds private aggregate plus account ranking',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'su-private-analytics-test-')),file=path.join(dir,'events.json');fs.chmodSync(dir,0o700);
  const jobs=[{role:'Social Media Coordinator',co:'Fixture Brand',link:'https://fixture.example/social',ind:'Social',pay:'$70K-90K'},{role:'Fashion Designer',co:'Fixture Fashion',link:'https://fixture.example/fashion',ind:'Fashion Design',pay:'$80K-85K'}];
  const now=Date.now();let d={env:{SU_ANALYTICS_SECRET:'fixture-only',SU_ANALYTICS_ADMIN_UIDS:'owner'},db:database(),jobs:C.catalog(jobs),now:()=>now,auth:{verifyIdToken:async t=>{if(!['owner','alice','bob'].includes(t))throw Error();return {uid:t};}}};
  const server=http.createServer(async(req,res)=>{let text='';for await(const part of req)text+=part;const request={httpMethod:req.method,headers:req.headers,body:text};try{const action=req.url==='/collect'?S.collect:req.url==='/profile'?S.profile:S.admin;const output=await action(request,d);fs.writeFileSync(file,JSON.stringify(Object.fromEntries(d.db.data)),{mode:0o600});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'private,no-store'});res.end(JSON.stringify(output));}catch(e){res.writeHead(e.status||503);res.end(JSON.stringify({error:'unavailable'}));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;d.env.SU_ALLOWED_ORIGINS=origin;
  const headers={Origin:origin,Authorization:'Bearer alice','Content-Type':'application/json'};
  try{
    const response=await fetch(origin+'/collect',{method:'POST',headers,body:JSON.stringify({session:'fixture-session-1234',visitor:'fixture-visitor-1234',consent:{analytics:true,personalization:true},events:[{id:'fixture-event-123456',name:'job_open',page:'board',jobId:C.jobId(jobs[0]),occurredAt:now}]})});assert.equal(response.status,200);assert.equal((await response.json()).accepted,1);
    const stored=JSON.parse(fs.readFileSync(file));for(const value of Object.values(stored))if(value.expiresAt)value.expiresAt=new Date(value.expiresAt);d.db=database(stored);
    assert.equal(fs.statSync(file).mode&0o777,0o600);
    const profile=await(await fetch(origin+'/profile',{headers})).json();assert.equal(profile.jobs[C.jobId(jobs[0])].weight,1);assert.equal(P.rank(jobs.slice().reverse(),profile.jobs,{now})[0].ind,'Social');
    const bob=await(await fetch(origin+'/profile',{headers:{...headers,Authorization:'Bearer bob'}})).json();assert.deepEqual(bob.jobs,{});
    assert.equal((await fetch(origin+'/admin',{headers})).status,403);
    const aggregate=await(await fetch(origin+'/admin',{headers:{...headers,Authorization:'Bearer owner'}})).json();assert.equal(aggregate.totals.job_opens,1);assert.equal(aggregate.totals.events,1);assert.deepEqual(aggregate.fields,[]);assert.doesNotMatch(JSON.stringify(aggregate),/alice|fixture-session/);
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true});}
});
