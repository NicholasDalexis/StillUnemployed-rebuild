const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Identity=require('../../js/job-identity.js');
const Internships=require('../../js/internships.js');
const mod=import('../../netlify/functions/lib/public-counts.mjs');
const snapshot=JSON.parse(fs.readFileSync('internships-data.json'));
// The complete catalog can include newer approvals than this test's original
// clock. Count them after their actual verification/export, never in the past.
const now=Math.max(Date.parse('2026-10-14T01:00:00Z'),Date.parse(snapshot.sourceExportedAt)||0,...snapshot.jobs.map(job=>Date.parse(job.verification.checkedAt)||0));
const later=days=>new Date(now+days*86400000).toISOString().slice(0,10);
const index=()=>({schemaVersion:1,revision:2,checkedAt:new Date(now).toISOString(),removed:[]});
const source=()=>({checkedAt:now,jobs:[{co:'One',link:'https://example.com/job/1'},{co:'One alias',link:'https://example.com/job/1?utm_source=test'},{co:'Two',link:'https://example.com/job/2'}]});
const getInternships=()=>({statusCode:200,body:JSON.stringify(snapshot)});
test('board counter keeps one representative for admitted Active aliases without counting pending source history',async()=>{
 const {catalogFromCSV}=await mod,Discovery=require('../../netlify/functions/lib/job-discovery.cjs');
 const row=(link,status,pay)=>['Example','Designer',link,'New York, NY','Hybrid',pay,'1','Design','','',status,'','','',''];
 const rows=[Discovery.EXPECTED,row('https://example.com/jobs/1','Active','$65K'),row('https://example.com/jobs/1?utm_source=alias','Active','$65,000'),row('https://example.com/jobs/2','Pending','$70K'),row('https://example.com/jobs/3','Dead','$70K')];
 const csv=rows.map(row=>row.map(value=>'"'+value.replace(/"/g,'""')+'"').join(',')).join('\n');
 assert.equal(catalogFromCSV(csv).length,1);
 assert.equal((await Discovery.catalogFromCSV(csv)).length,0,'separate discovery API still applies its original stricter conflict policy');
});
async function handler(overrides={}){return (await mod).createHandler({now:()=>now,getJobs:source,getInternships,getIndex:index,...overrides});}
test('complete counts deduplicate aliases, respect global removals and include published Upcoming internships',async()=>{
 const internship=Internships.jobs(snapshot,now)[0];
 const getIndex=()=>({...index(),removed:[{keys:Identity.keys('https://example.com/job/2'),slugs:[]},{keys:Identity.keys(internship.link),slugs:[]}]});
 const reply=await (await handler({getIndex}))(new Request('https://stillunemployed.com/api/public-counts'));
 const body=await reply.json();assert.equal(reply.status,200);assert.equal(body.jobs.count,1);
 const rows=require('../../js/job-deadlines.js').current(Internships.jobs(snapshot,now),now).filter(j=>!Identity.equivalent(j.link,internship.link));
 assert.equal(body.internships.count,rows.length);assert.equal(body.internships.upcoming,Internships.counts(rows,now).upcoming);
 assert.equal(reply.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(Object.keys(body).sort(),['checkedAt','internships','jobs','schemaVersion']);
 assert.doesNotMatch(JSON.stringify(body),/example\.com|email|identity|sourceUrl|salary/);
});
test('source failures keep missing counts unavailable while a healthy lane can still report',async()=>{
 for(const getJobs of [()=>{throw Error('private source error');},()=>({...source(),checkedAt:now-20000}),()=>({checkedAt:now,jobs:[{link:'javascript:alert(1)'}]})]){
  const reply=await (await handler({getJobs}))(new Request('https://stillunemployed.com/api/public-counts'));
  const body=await reply.json();assert.equal(reply.status,503);assert.deepEqual(body.jobs,{status:'unavailable',count:null});assert.equal(body.internships.status,'ready');
 }
 for(const getIndex of [()=>{throw Error('index unavailable');},()=>({...index(),checkedAt:new Date(now-6000).toISOString()})]){
  const body=await (await (await handler({getIndex}))(new Request('https://stillunemployed.com/api/public-counts'))).json();
  assert.equal(body.jobs.count,null);assert.equal(body.internships.count,null);
 }
});
test('verified empty catalogs are zero; missing verification is unavailable, not zero',async()=>{
 const getJobs=()=>({checkedAt:now,jobs:[]});
 const verified=()=>({statusCode:200,body:JSON.stringify({schemaVersion:2,status:'verified',jobs:[]})});
 const body=await (await (await handler({getJobs,getInternships:verified}))(new Request('https://stillunemployed.com/api/public-counts'))).json();
 assert.equal(body.jobs.count,0);assert.equal(body.internships.count,0);
 const pending=()=>({statusCode:200,body:JSON.stringify({schemaVersion:2,status:'awaiting_verification',jobs:[]})});
 const result=await (await (await handler({getInternships:pending}))(new Request('https://stillunemployed.com/api/public-counts'))).json();assert.equal(result.internships.count,null);
});
test('an approved future-opening internship is included in the public total',async()=>{
 const job=structuredClone(snapshot.jobs[0]);job.applicationStatus='upcoming';
 job.verification={...job.verification,status:'upcoming',sourceAnnounced:true,upcomingApproved:true};
 job.applicationsOpenISO=later(20);job.deadlineISO=later(50);job.startDateISO=later(51);
 const getInternships=()=>({statusCode:200,body:JSON.stringify({...snapshot,jobs:[job]})});
 const reply=await (await handler({getInternships}))(new Request('https://stillunemployed.com/api/public-counts'));
 const body=await reply.json();assert.equal(reply.status,200);assert.deepEqual(body.internships,{status:'ready',count:1,upcoming:1});
});
test('requests cannot filter counts or cause write work, and a stalled source ends unavailable',async()=>{
 let calls=0;const getJobs=()=>{calls++;return new Promise(()=>{});};
 const handle=await handler({getJobs,timeoutMs:10});
 assert.equal((await handle(new Request('https://stillunemployed.com/api/public-counts',{method:'POST'}))).status,405);
 assert.equal((await handle(new Request('https://stillunemployed.com/api/public-counts?q=design'))).status,400);assert.equal(calls,0);
 const reply=await handle(new Request('https://stillunemployed.com/api/public-counts'));assert.equal(reply.status,503);assert.equal((await reply.json()).jobs.count,null);
});
test('version footer addition is idempotent and targets the bottom even if version appears in navigation',async()=>{
 const {ensureVersionFooter}=await import('../version.mjs');
 const start='<html><body><nav><a data-su-version href="old">Version old</a></nav><footer><a href="/suggest">Suggest a job</a></footer></body></html>';
 const html=ensureVersionFooter(start,'2.7.7.17');assert.match(html,/<footer>[\s\S]*data-su-version/);
 assert.match(html,/href="\/versions.html#version-2-7-7-17"/);assert.equal(ensureVersionFooter(html,'2.7.7.17'),html);
 assert.match(ensureVersionFooter('<html><body>404</body></html>','2.7.7.17'),/<footer[^>]*>[\s\S]*Version 2.7.7.17/);
});
