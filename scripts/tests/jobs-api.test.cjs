const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const D=require('../../netlify/functions/lib/job-discovery.cjs');
const NOW=Date.parse('2026-09-21T22:00:00Z');
const api=()=>import('../../netlify/functions/lib/jobs-api.mjs');
const row=(changes={})=>Object.assign({company:'Example','job title':'Designer',link:'https://boards.greenhouse.io/example/jobs/123',location:'New York, NY',type:'Hybrid',salary:'$80K-90K','years of experience':'1-3 yrs',category:'UX/UI Design',description:'Design useful interfaces.','active/dead':'Active','tl;dr':'Work with product teams.','date posted':'September 18, 2026'},changes);
const csv=rows=>[D.EXPECTED,...rows.map(r=>D.EXPECTED.map(k=>r[k]||''))].map(cells=>cells.map(x=>'"'+x.replace(/"/g,'""')+'"').join(',')).join('\r\n');
const index=(revision=0,removed=[])=>({schemaVersion:1,revision,removed,checkedAt:new Date(NOW).toISOString()});
const req=(path='/api/jobs/search',method='GET')=>new Request('https://stillunemployed.com'+path,{method});
async function setup(rows=[row()],changes={}){
  const jobs=await D.catalogFromCSV(csv(rows));
  const options={getCatalog:async()=>({jobs,checkedAt:NOW}),getModeration:async()=>index(),getAvailability:async()=>index(),now:()=>NOW,...changes};
  return {jobs,options,handler:(await api()).createJobsHandler(options)};
}
const body=async(response,status=200)=>{assert.equal(response.status,status);return response.json();};

test('search and detail expose only the documented public fields with honest availability',async()=>{
  const {handler,jobs}=await setup();
  jobs[0].privateNote='SECRET';jobs[0].reporters=['PRIVATE'];
  const response=await handler(req());const data=await body(response);
  assert.equal(data.total,1);assert.equal(data.jobs[0].availability,'listed');assert.equal(data.jobs[0].employer_verified_at,null);
  assert.equal(data.jobs[0].salary.min,80000);assert.equal(data.jobs[0].experience.minimum_years,1);
  assert.equal(new URL(data.jobs[0].board_url).hostname,'stillunemployed.com');
  assert.doesNotMatch(JSON.stringify(data),/SECRET|PRIVATE|sourceRevision|identity|aliases|reporters|docs\.google/);
  const detail=await body(await handler(req('/api/jobs/'+jobs[0].id)));
  assert.equal(detail.job.description,'Design useful interfaces.');assert.equal(detail.job.date_posted_text,'September 18, 2026');
  for(const name of ['cache-control','cdn-cache-control','netlify-cdn-cache-control'])assert.equal(response.headers.get(name),'no-store');
});

test('every suppression authority blocks search and details by identity or historical alias',async()=>{
  for(const authority of ['getModeration','getAvailability'])for(const by of ['key','slug']){
    const {jobs,options}=await setup();
    options[authority]=async()=>index(3,[{keys:by==='key'?[jobs[0].identity]:['url:https://example.com/old'],slugs:by==='slug'?[jobs[0].aliases[0]]:[]}]);
    const handler=(await api()).createJobsHandler(options);
    assert.equal((await body(await handler(req()))).total,0);
    const detail=await body(await handler(req('/api/jobs/'+jobs[0].id)),404);
    assert.doesNotMatch(JSON.stringify(detail),/Designer|greenhouse|80K/);
  }
});

test('visibility is rechecked even when the source is cached; a restored listing can return',async()=>{
  const {jobs}=await setup();let calls=0,removed=false;
  const source=(await api()).createCatalogCache({load:async()=>{calls++;return{jobs,checkedAt:NOW};},now:()=>NOW});
  const handler=(await api()).createJobsHandler({getCatalog:source,getModeration:async()=>index(removed?1:2,removed?[{keys:[jobs[0].identity],slugs:[]}]:[]),getAvailability:async()=>index(),now:()=>NOW});
  assert.equal((await body(await handler(req()))).total,1);removed=true;
  assert.equal((await body(await handler(req()))).total,0);removed=false;
  assert.equal((await body(await handler(req()))).total,1);assert.equal(calls,1);
});

test('stale, missing, malformed and failing visibility authorities never expose listings',async()=>{
  for(const value of [null,index(-1),{...index(),schemaVersion:2},{...index(),removed:null},{...index(),checkedAt:new Date(NOW-5001).toISOString()},{...index(),checkedAt:new Date(NOW+2000).toISOString()},index(1,[{keys:['not-an-identity'],slugs:[]}]),index(1,[{keys:['url:https://example.com'],slugs:['../../secret']}])]){
    const {handler}=await setup(undefined,{getAvailability:async()=>value});
    const data=await body(await handler(req()),503);assert.doesNotMatch(JSON.stringify(data),/Example|Designer|greenhouse/);
  }
  const {handler}=await setup(undefined,{getModeration:async()=>{throw Error('PRIVATE TOKEN');}});
  assert.doesNotMatch(JSON.stringify(await body(await handler(req()),503)),/PRIVATE TOKEN/);
  assert.equal((await (await api()).createJobsHandler({getCatalog:async()=>{throw Error();}})(req())).status,503);
});

test('stale/future source and hanging authorities fail with retry guidance',async()=>{
  const {jobs}=await setup();
  for(const checkedAt of [NOW-15001,NOW+2000,NaN]){
    const {handler}=await setup(undefined,{getCatalog:async()=>({jobs,checkedAt})});assert.equal((await handler(req())).status,503);
  }
  const {handler}=await setup(undefined,{getAvailability:()=>new Promise(()=>{}),timeoutMs:10});
  const response=await handler(req());assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'30');
});

test('catalog cache coalesces parallel reads and does not serve expired data after a failure',async()=>{
  let now=NOW,calls=0,fail=false;const {jobs}=await setup();
  const cached=(await api()).createCatalogCache({now:()=>now,load:async()=>{calls++;await new Promise(r=>setTimeout(r,5));if(fail)throw Error('offline');return {jobs,checkedAt:now};}});
  await Promise.all([cached(),cached(),cached()]);assert.equal(calls,1);
  now+=15001;fail=true;await assert.rejects(cached());assert.equal(calls,2);
  fail=false;await cached();assert.equal(calls,3);
});

test('input validation rejects unknown, repeated, oversized and inconsistent filters before source reads',async()=>{
  let calls=0;const {handler}=await setup(undefined,{getCatalog:async()=>{calls++;throw Error('should not run');}});
  for(const query of ['token=secret','q=a&q=b','limit=0','limit=26','limit=2.5','limit=1e2','offset=-1','offset=1','max_experience=4','work_mode=anything','min_salary=90000&max_salary=70000','q='+ 'a'.repeat(161),'q=%00','snapshot=oops','min_salary='])assert.equal((await handler(req('/api/jobs/search?'+query))).status,400,query);
  assert.equal(calls,0);
});

test('geography does not confuse CA with skincare or DC with Washington state',async()=>{
  const {handler}=await setup([
    row({link:'https://example.com/1',location:'Los Angeles, CA'}),
    row({link:'https://example.com/2',company:'Skincare',location:'New York, NY'}),
    row({link:'https://example.com/3',location:'Washington, DC'}),
    row({link:'https://example.com/4',location:'Remote, US',type:'Remote'}),
    row({link:'https://example.com/5',location:'Seattle, WA'})
  ]);
  for(const query of ['location=CA','location=California','q=design+CA'])assert.equal((await body(await handler(req('/api/jobs/search?'+query)))).total,1);
  for(const query of ['location=DC','location=WA','location=NYC'])assert.equal((await body(await handler(req('/api/jobs/search?'+query)))).total,1);
  assert.equal((await body(await handler(req('/api/jobs/search?location=CA&work_mode=remote')))).total,0,'generic remote does not assert California eligibility');
});

test('structured filters combine; annual range overlap excludes hourly and ambiguous currencies',async()=>{
  const {handler}=await setup([
    row({link:'https://example.com/1'}),
    row({link:'https://example.com/2',salary:'$50/hr'}),
    row({link:'https://example.com/3',salary:'CAD $100K-120K'}),
    row({link:'https://example.com/4',salary:'$100K+',type:'Remote',location:'Remote, US','years of experience':'Early career'}),
    row({link:'https://example.com/5',salary:'$120K',type:'In-person','years of experience':'3+ yrs'})
  ]);
  assert.equal((await body(await handler(req('/api/jobs/search?min_salary=85000&max_salary=95000')))).total,1);
  assert.equal((await body(await handler(req('/api/jobs/search?min_salary=200000')))).total,1,'open-ended range remains open-ended');
  assert.equal((await body(await handler(req('/api/jobs/search?work_mode=hybrid&max_experience=2&category=UX%2FUI%20Design&min_salary=70000')))).total,1);
  assert.equal((await body(await handler(req('/api/jobs/search?work_mode=remote&max_experience=2')))).total,0,'unknown minimum does not become zero');
});

test('salary and experience parsers preserve uncertainty',async()=>{
  const {salaryFacts,minimumExperience}=await api();
  for(const text of ['$30/hr','$200/day','$5000 per month','Paid','Up to $80K','$80K plus 10% bonus','CAD $90K'])assert.equal(salaryFacts(text).min,null,text);
  for(const [text,value]of [['3+ yrs',3],['one to three years',1],['No experience required',0],['Early career',null],['2 preferred; 4 required',null],['three years of experience',3]])assert.equal(minimumExperience(text),value,text);
});

test('pagination has stable ordering, no duplicates, and detects changes before the second page',async()=>{
  let revision=0;const {handler,options}=await setup([row({link:'https://example.com/1'}),row({link:'https://example.com/2'}),row({link:'https://example.com/3'})],{getAvailability:async()=>index(revision)});
  const first=await body(await handler(req('/api/jobs/search?limit=2')));assert.equal(first.next_offset,2);
  const path='/api/jobs/search?limit=2&offset=2&snapshot='+first.snapshot;
  const second=await body(await handler(req(path)));assert.equal(second.next_offset,null);
  assert.equal(new Set([...first.jobs,...second.jobs].map(job=>job.id)).size,3);
  revision=1;await body(await handler(req(path)),409);
  revision=0;const catalog=await options.getCatalog();catalog.jobs.reverse();
  const reversed=(await api()).createJobsHandler({...options,getCatalog:async()=>catalog});
  assert.equal((await body(await reversed(req()))).snapshot,first.snapshot);
});

test('source admission excludes nonactive, senior, conflicting and missing-pay records',async()=>{
  const {handler}=await setup([row(),row({link:'https://example.com/dead','active/dead':'Dead'}),row({link:'https://example.com/senior','job title':'Senior Designer'}),row({link:'https://example.com/hold','active/dead':'Hold'}),row({link:'https://example.com/nopay',salary:''})]);
  assert.equal((await body(await handler(req()))).total,1);
  const {handler:conflict}=await setup([row(),row({link:'https://job-boards.greenhouse.io/example/jobs/123','active/dead':'Dead'})]);
  assert.equal((await body(await conflict(req()))).total,0);
});

test('HEAD gates visibility; writes, arbitrary paths and detail query parameters are rejected',async()=>{
  let checks=0;const {handler,jobs}=await setup(undefined,{getAvailability:async()=>{checks++;return index();}});
  const head=await handler(req('/api/jobs/search','HEAD'));assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(checks,1);
  for(const method of ['POST','PUT','DELETE','OPTIONS'])assert.equal((await handler(req('/api/jobs/search',method))).status,405);
  assert.equal((await handler(req('/api/jobs/../../private'))).status,404);
  assert.equal((await handler(req('/api/jobs/'+jobs[0].id+'?token=x'))).status,400);
});

test('OpenAPI schemas match actual payloads and advertise only the two read operations',async()=>{
  const {openapi}=await import('../../netlify/functions/lib/jobs-openapi.mjs');const {handler,jobs}=await setup();
  assert.equal(openapi.openapi,'3.1.0');assert.deepEqual(Object.keys(openapi.paths),['/api/jobs/search','/api/jobs/{id}']);
  assert.deepEqual(openapi.security,[]);
  const schema=openapi.components.schemas;
  const search=await body(await handler(req())),detail=await body(await handler(req('/api/jobs/'+jobs[0].id)));
  for(const [name,value]of [['SearchResult',search],['JobResult',detail],['Job',search.jobs[0]],['JobDetail',detail.job]])assert.deepEqual(Object.keys(value).sort(),Object.keys(schema[name].properties).sort(),name);
});

test('deployment entrypoint is disabled by default and declares hosting rate limits',async()=>{
  const module=await import('../../netlify/functions/jobs-api.mts');
  assert.equal((await module.default(req(),{})).status,503);
  const disabledHead=await module.default(req('/api/jobs/search','HEAD'),{});
  assert.equal(disabledHead.status,503);assert.equal(await disabledHead.text(),'');
  assert.deepEqual(module.config.rateLimit,{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']});
  assert(module.config.path.includes('/api/jobs/:id'));
  const source=readFileSync(require.resolve('../../netlify/functions/lib/jobs-api.mjs'),'utf8');
  assert.doesNotMatch(source,/console\.(?:log|error|warn)|firebase|setJSON|\.mutate\(/);
});

test('real local HTTP server serves search and docs but blocks file reads and foreign origins',async()=>{
  const {createReviewServer}=await import('../serve-jobs-connector.mjs');const {handler}=await setup();const server=createReviewServer({handler});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  try{
    const search=await body(await fetch(origin+'/api/jobs/search'));assert.equal(search.total,1);
    const specification=await body(await fetch(origin+'/api/jobs/openapi.json'));assert.equal(specification.servers[0].url,origin);
    for(const path of ['/.env','/docs/jobs-connector.md','/package.json','/netlify/functions/lib/jobs-api.mjs'])assert.equal((await fetch(origin+path)).status,404);
    assert.equal((await fetch(origin+'/api/jobs/search',{headers:{Origin:'https://evil.example'}})).status,403);
    const foreignHostStatus=await new Promise((resolve,reject)=>{const call=require('node:http').get(origin+'/api/jobs/search',{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode);});call.on('error',reject);});
    assert.equal(foreignHostStatus,403);
    assert.equal((await fetch(origin+'/')).status,200);assert.equal((await fetch(origin+'/css/brand.css')).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
