'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const Identity=require('../../js/job-identity.js');
const request=new Request('https://preview--stillunemployed.netlify.app/j/beauty/1rc6eq5t9w8p3.html');
const site={id:'13d48d6e-e0ac-4d52-8a65-4fcbb9fdbc16'};
const source=readFileSync(require.resolve('../../netlify/edge-functions/job-share-moderation.js'),'utf8');
const gate=()=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function index(slugs=[]){return {schemaVersion:1,revision:slugs.length?1:0,removed:slugs.length?[{keys:[],slugs,link:'https://example.com/job'}]:[],checkedAt:new Date().toISOString()};}
function json(body){return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});}
test('share gate runs before static pages, matches every theme and never renders removed employer content',async()=>{
  const {shareGate}=await gate();let next=0;
  for(const theme of ['original','beauty','casino','mermaid']){
    const req=new Request(request.url.replace('beauty',theme));
    const res=await shareGate(req,{site,next:async()=>{next++;return new Response('employer apply');}},async url=>{assert.equal(url,'https://preview--stillunemployed.netlify.app/api/job-moderation');return json(index(['1rc6eq5t9w8p3']));});
    assert.equal(res.status,410);assert.equal(res.headers.get('cache-control'),'no-store');assert.doesNotMatch(await res.text(),/employer apply/);
  }
  assert.equal(next,0);
});
test('share gate fails closed on unavailable, malformed, redirected and stale index',async()=>{
  const {shareGate}=await gate();let next=0;
  for(const response of [()=>new Response('',{status:503}),()=>new Response('not JSON'),()=>json({...index(),removed:[{slugs:['../bad']}]}),()=>json({...index(),checkedAt:'2020-01-01T00:00:00Z'}),()=>new Response('',{status:302,headers:{Location:'https://attacker.example'}})]){
    const res=await shareGate(request,{site,next:()=>{next++;return new Response('private');}},async()=>response());
    assert.equal(res.status,503);
  }
  assert.equal(next,0);
});
test('extensionless and encoded aliases cannot bypass an existing static share removal',async()=>{
  const {shareGate}=await gate();let next=0;
  for(const path of ['/j/beauty/1rc6eq5t9w8p3','/j/beauty/1rc6eq5t9w8p3/','/j/beauty/%31rc6eq5t9w8p3.html']){
    const res=await shareGate(new Request('https://preview--stillunemployed.netlify.app'+path),{site,next:()=>{next++;return new Response('bad');}},async()=>json(index(['1rc6eq5t9w8p3'])));
    assert.equal(res.status,410);
  }
  const invalid=await shareGate(new Request('https://preview--stillunemployed.netlify.app/j/beauty/%2531rc6eq5t9w8p3.html'),{site,next:()=>{next++;return new Response('bad');}},async()=>json(index()));
  assert.equal(invalid.status,404);assert.equal(next,0);
});
test('share gate passes live static page without caching and rejects untrusted self-fetch origins',async()=>{
  const {shareGate}=await gate();let requests=0;
  const fetch=async()=>{requests++;return json(index());};
  const res=await shareGate(request,{site,next:async()=>new Response('open role')},fetch);
  assert.equal(res.status,200);assert.equal(await res.text(),'open role');assert.equal(res.headers.get('Cache-Control'),'no-store');
  for(const url of ['https://attacker.example/j/beauty/abc.html','https://preview--stillunemployed.netlify.app.attacker.example/j/beauty/abc.html'])assert.equal((await shareGate(new Request(url),{site,next:()=>{throw Error('unexpected');}},fetch)).status,503);
  assert.equal(requests,1);
});
test('internship endpoint filters owner removals in its server response and survives restore',async()=>{
  const {createHandler}=await import('../../netlify/functions/lib/internship-catalog-moderated.mjs');
  const link='https://example.com/internship/1',second='https://example.com/internship/2';let removed=true;
  const handler=createHandler({catalog:async()=>({statusCode:200,body:JSON.stringify({jobs:[{link},{link:second}]})}),index:async()=>({...index(),removed:removed?[{keys:Identity.keys(link)}]:[]})});
  const req=new Request('https://preview--stillunemployed.netlify.app/.netlify/functions/internships-catalog');
  let res=await handler(req,{});assert.deepEqual((await res.json()).jobs,[{link:second}]);
  removed=false;res=await handler(req,{});assert.equal((await res.json()).jobs.length,2);assert.equal(res.headers.get('Cache-Control'),'no-store');
});
test('internship endpoint cannot return stale catalog if either authority is unavailable; non-GET performs no reads',async()=>{
  const {createHandler}=await import('../../netlify/functions/lib/internship-catalog-moderated.mjs');let calls=0;
  const handler=createHandler({catalog:async()=>{calls++;return {statusCode:200,body:JSON.stringify({jobs:[{link:'https://example.com'}]})};},index:async()=>{throw Error('private internal failure');}});
  const url='https://preview--stillunemployed.netlify.app/.netlify/functions/internships-catalog';
  const denied=await handler(new Request(url,{method:'POST'}),{});assert.equal(denied.status,405);assert.equal(calls,0);
  const res=await handler(new Request(url),{});assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/private internal|example.com/);
});
