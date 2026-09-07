const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {catalogFromCSV,fetchCatalog,createHandler,EXPECTED,LIMITS}=require('../../netlify/functions/lib/job-discovery.cjs');
const NOW=Date.parse('2026-09-06T23:00:00Z');
const row=(changes={})=>Object.assign({company:'Example','job title':'Designer',link:'https://boards.greenhouse.io/example/jobs/123',location:'New York, NY',type:'Hybrid',salary:'$80K-90K','years of experience':'1-3',category:'UX/UI Design',description:'Create useful interfaces.','active/dead':'Active','tl;dr':'Design interfaces.\nWork with product teams.','date posted':''},changes);
const csv=(rows=[],header=EXPECTED)=>[header,...rows.map(r=>header.map(k=>r[k]||''))].map(cells=>cells.map(x=>'"'+x.replace(/"/g,'""')+'"').join(',')).join('\r\n');
const upstream=text=>new Response(text,{status:200,headers:{'content-type':'text/csv; charset=utf-8'}});

test('source reader rejects nonactive and conflicting aliases before admitting job content',async()=>{
 const active=row(),alias=row({link:'https://job-boards.greenhouse.io/example/jobs/123'});
 let jobs=await catalogFromCSV(csv([active,alias]));assert.equal(jobs.length,1);assert.equal(jobs[0].aliases.length,2);
 const stable=jobs[0].id;
 assert.equal((await catalogFromCSV(csv([alias,active])))[0].id,stable);
 for(const status of ['Dead','Hold','Unknown','','Quarantined','Inactive'])assert.equal((await catalogFromCSV(csv([active,row({...alias,'active/dead':status})]))).length,0,status);
 assert.equal((await catalogFromCSV(csv([active,row({...alias,salary:'$120K'})]))).length,0);
 assert.equal((await catalogFromCSV(csv([row({salary:''})]))).length,0);
 assert.equal((await catalogFromCSV(csv([]))).length,0);
 await assert.rejects(catalogFromCSV(csv([row({link:'javascript:alert(1)'})])));
 await assert.rejects(catalogFromCSV(csv([],EXPECTED.slice(0,-1))));
});

test('fixed fresh feed fetch is bounded and rejects redirects, HTML, oversized and unavailable responses',async()=>{
 const calls=[];const out=await fetchCatalog({now:()=>NOW,fetchImpl:async(url,options)=>{calls.push({url,options});return upstream(csv([row()]));}});
 assert.equal(out.jobs.length,1);assert.equal(out.checkedAt,NOW);
 assert.equal(new URL(calls[0].url).hostname,'docs.google.com');assert.equal(new URL(calls[0].url).searchParams.get('gid'),'2134483974');
 assert.equal(calls[0].options.redirect,'manual');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.cache,'no-store');
 for(const fetchImpl of [async()=>new Response('private',{status:503}),async()=>new Response('<html>failure</html>',{headers:{'content-type':'text/html'}}),async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/secrets'}}),async()=>new Response(csv([row()]),{headers:{'content-type':'text/csv','content-length':'9000000'}})])await assert.rejects(fetchCatalog({fetchImpl}));
 await assert.rejects(fetchCatalog({limits:{...LIMITS,timeoutMs:10},fetchImpl:()=>new Promise(()=>{})}));
});

test('single-job scaffold is closed without an authoritative gate and does not fall back',async()=>{
 let sourceCalls=0;const jobs=await catalogFromCSV(csv([row()])),job=jobs[0];
 const event={httpMethod:'GET',path:'/job/'+job.id};
 const getCatalog=async()=>{sourceCalls++;return{jobs,checkedAt:NOW};};
 assert.equal((await createHandler({getCatalog,now:()=>NOW})(event)).statusCode,503);assert.equal(sourceCalls,0);
 assert.equal((await createHandler({getCatalog,now:()=>NOW,availability:()=>new Promise(()=>{}),gateTimeoutMs:10})(event)).statusCode,503,'a stalled availability authority must not leave the request hanging');
 for(const availability of [async()=>null,async()=>{throw Error('private secret');},async input=>({...input,state:'open',revision:1,checkedAt:NOW-6000}),async input=>({...input,state:'open',sourceRevision:'old',revision:1,checkedAt:NOW})]){
  const response=await createHandler({getCatalog,availability,now:()=>NOW})(event);
  assert.equal(response.statusCode,503);assert.doesNotMatch(response.body,/Example|Designer|80K|greenhouse|private secret/);
 }
 for(const state of ['quarantined','closed']){
  const response=await createHandler({getCatalog,now:()=>NOW,availability:async input=>({...input,state,revision:2,checkedAt:NOW})})(event);
  assert.equal(response.statusCode,state==='closed'?410:404);assert.doesNotMatch(response.body,/Example|Designer|80K|greenhouse|JobPosting/);
 }
});

test('source content is escaped; changed source facts invalidate the availability decision',async()=>{
 const jobs=await catalogFromCSV(csv([row({'job title':'Designer <img src=x onerror=alert(1)>','tl;dr':'<script>alert(1)</script>'})]));
 const job=jobs[0],event={httpMethod:'GET',path:'/job/'+job.id};
 const gate={identity:job.identity,sourceRevision:job.sourceRevision,state:'open',revision:1,checkedAt:NOW};
 const handler=createHandler({getCatalog:async()=>({jobs,checkedAt:NOW}),availability:async()=>gate,now:()=>NOW});
 const result=await handler(event);assert.equal(result.statusCode,200);
 assert.match(result.body,/&lt;script&gt;/);assert.doesNotMatch(result.body,/<script>|<img|JobPosting|datePosted|validThrough/);
 assert.equal(result.headers['X-Robots-Tag'],'noindex, nofollow');assert.equal(result.headers['Cache-Control'],'no-store');
 jobs[0].sourceRevision='changed';assert.equal((await handler(event)).statusCode,503);
 assert.equal((await handler({httpMethod:'POST',path:event.path})).statusCode,405);
});

test('real local HTTP route honors fresh removal, quarantine and upstream outage without stale content',async()=>{
 const job=(await catalogFromCSV(csv([row()])))[0];let mode='open';
 const handler=createHandler({now:()=>NOW,getCatalog:async()=>{if(mode==='outage')throw Error('offline');return{jobs:mode==='removed'?[]:[job],checkedAt:NOW};},availability:async input=>({...input,state:mode==='quarantined'?'quarantined':'open',revision:1,checkedAt:NOW})});
 const server=http.createServer(async(req,res)=>{const out=await handler({httpMethod:req.method,path:req.url});res.writeHead(out.statusCode,out.headers);res.end(out.body);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/job/'+job.id;
  for(const [state,status] of [['open',200],['removed',404],['quarantined',404],['outage',503]]){mode=state;const result=await fetch(url);assert.equal(result.status,status);const text=await result.text();if(status===200)assert.match(text,/Designer/);else assert.doesNotMatch(text,/Designer|greenhouse|80K/);}
 }finally{await new Promise(resolve=>server.close(resolve));}
});
