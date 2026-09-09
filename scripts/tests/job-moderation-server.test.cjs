'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const Core=require('../../netlify/functions/lib/job-moderation-core.cjs');
const Identity=require('../../js/job-identity.js');
const modules=Promise.all([import('../../netlify/functions/lib/job-moderation.mjs'),import('../../netlify/functions/lib/job-moderation-auth.mjs'),import('jose')]);
const NOW=1788900000000,ORIGIN='https://preview--stillunemployed.netlify.app';
const context={site:{id:Core.SITE_ID,name:'stillunemployed'},deploy:{context:'branch-deploy',id:'deployment'}};
const jobs=[1,2].map(n=>({co:'Example '+n,role:'Designer',link:'https://example.com/jobs/'+n,pay:'$90K',loc:'New York, NY',identity:'url:https://example.com/jobs/'+n,sourceRevision:'source-'+n,aliases:['example-'+n]}));
const body=(extra={})=>({action:'report',link:jobs[0].link,requestId:randomUUID(),...extra});
function req(input,options={}){const method=options.method||(input?'POST':'GET');return new Request((options.origin||ORIGIN)+(options.path||'/api/job-moderation'),{method,headers:{...(input?{'Content-Type':'application/json',Origin:options.origin||ORIGIN}:{}),...options.headers},...(input?{body:JSON.stringify(input)}:{})});}
function storage(){let text=null,etag=0;return {reads:0,writes:0,conflicts:0,get text(){return text;},set text(value){text=value;etag++;},async getWithMetadata(){this.reads++;return text===null?null:{data:text,etag:String(etag)};},async setJSON(key,value,condition){assert.equal(key,'state');assert.equal(Boolean(condition.onlyIfMatch),!condition.onlyIfNew);if(this.conflicts-->0)return {modified:false};if(condition.onlyIfNew?text!==null:condition.onlyIfMatch!==String(etag))return {modified:false};text=JSON.stringify(value);etag++;this.writes++;return {modified:true,etag:String(etag)};}};}
async function fixture(options={}){const [{createService}]=await modules;const store=storage(),seen=[];const handler=createService({openStore:scope=>{seen.push(scope);return store;},authenticate:async()=>({role:'owner'}),getCatalog:async()=>({jobs,checkedAt:NOW}),now:()=>NOW,...options});return {store,seen,handler,async call(input,requestOptions={},ctx=context,extra){const r=await handler(req(input,requestOptions),ctx,extra);return {status:r.status,headers:r.headers,body:await r.json()};}};}

test('trusted deploy context determines namespace and rejects arbitrary host/site/client scope',()=>{
  assert.equal(Core.scopeFor(req(),context),'preview');
  assert.equal(Core.scopeFor(req(null,{origin:'https://stillunemployed.com'}),{...context,deploy:{context:'production'}}),'production');
  for(const c of [{}, {...context,site:{id:'other',name:'stillunemployed'}},{...context,deploy:{context:'dev'}}])assert.throws(()=>Core.scopeFor(req(),c));
  assert.throws(()=>Core.scopeFor(req(null,{origin:'https://evil.example'}),context));
  assert.throws(()=>Core.scopeFor(req(null,{origin:'https://stillunemployed.com'}),context));
});
test('empty public index is strict no-store with no writes or private fields',async()=>{
  const f=await fixture(),r=await f.call();assert.equal(r.status,200);assert.deepEqual(r.body,{schemaVersion:1,revision:0,removed:[],checkedAt:new Date(NOW).toISOString()});assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('access-control-allow-origin'),null);assert.equal(f.store.writes,0);assert.deepEqual(f.seen,['preview']);
});
test('origin, body scope, unknown actions and oversized input cannot write',async()=>{
  const f=await fixture();
  assert.equal((await f.call(body(),{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await f.call(body(),{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await f.call(body({scope:'production'}))).status,400);
  assert.equal((await f.call(body({action:'delete'}))).status,400);
  assert.equal((await f.call(body({link:'javascript:alert(1)'}))).status,400);
  assert.equal((await f.call(body({unknown:'x'.repeat(20000)}))).status,413);
  assert.equal((await f.call(body(),{headers:{'Content-Type':'text/plain'}})).status,415);assert.equal(f.store.writes,0);
});
test('rejected authentication opens no storage and production mutations stay disabled',async()=>{
  const f=await fixture({authenticate:async()=>{throw Core.fail(401,'Sign in again');}});assert.equal((await f.call(body())).status,401);assert.equal(f.seen.length,0);
  const g=await fixture();assert.equal((await g.call(body(),{origin:'https://stillunemployed.com'},{...context,deploy:{context:'production'}})).status,403);assert.equal(g.seen.length,0);
});
test('report matches current catalog and preserves private audit while publishing only suppression',async()=>{
  const f=await fixture(),input=body(),r=await f.call(input);assert.equal(r.status,200);assert.deepEqual(r.body,{reported:true,link:jobs[0].link,revision:1,requestId:input.requestId,scope:'preview'});
  const state=JSON.parse(f.store.text);assert.equal(state.records[0].metadata.co,'Example 1');assert.equal(state.history[0].actor,'owner');assert.equal(state.history[0].action,'report');assert.equal(state.records[0].removed,true);
  const publicResult=await f.call();assert.deepEqual(publicResult.body.removed,[{keys:Identity.keys(jobs[0].link),slugs:['example-1'],link:jobs[0].link}]);assert.ok(!JSON.stringify(publicResult.body).includes('owner'));assert.ok(!JSON.stringify(publicResult.body).includes(input.requestId));
});
test('duplicate request does not write twice and differing action cannot reuse its ID',async()=>{
  const f=await fixture(),input=body();const one=await f.call(input),two=await f.call(input);assert.deepEqual(two,one);assert.equal(f.store.writes,1);assert.equal((await f.call({...input,action:'restore',expectedRevision:1})).status,409);
});
test('duplicate report keeps one record with separate durable owner intent',async()=>{const f=await fixture();await f.call(body());await f.call(body());const state=JSON.parse(f.store.text);assert.equal(state.records.length,1);assert.equal(state.history.length,2);});
test('restore is revision guarded, reversible, and cannot replay a previous report after restore',async()=>{
  const f=await fixture(),input=body();await f.call(input);
  assert.equal((await f.call(body({action:'restore'}))).status,400);
  assert.equal((await f.call(body({action:'restore',expectedRevision:0}))).status,409);
  const restored=await f.call(body({action:'restore',expectedRevision:1}));assert.equal(restored.status,200);assert.equal(restored.body.restored,true);assert.equal((await f.call()).body.removed.length,0);
  assert.equal((await f.call(input)).status,409);assert.equal(JSON.parse(f.store.text).history.length,2);assert.equal(JSON.parse(f.store.text).records.length,1);
});
test('unknown, ambiguous and stale source catalogs never authorize unlisting',async()=>{
  for(const catalog of [{jobs:[],checkedAt:NOW},{jobs:[jobs[0],jobs[0]],checkedAt:NOW},{jobs,checkedAt:NOW-31000}]){const f=await fixture({getCatalog:async()=>catalog});assert.ok([409,503].includes((await f.call(body())).status));assert.equal(f.store.writes,0);}
  const f=await fixture({getCatalog:async()=>{throw Error('upstream secret text');}});const r=await f.call(body());assert.equal(r.status,503);assert.ok(!r.body.error.includes('secret'));
});
test('conditional writes preserve two concurrent removals',async()=>{
  const f=await fixture();const result=await Promise.all([f.call(body()),f.call(body({link:jobs[1].link}))]);assert.ok(result.every(r=>r.status===200));const state=JSON.parse(f.store.text);assert.equal(state.records.length,2);assert.equal(state.history.length,2);assert.equal(state.revision,2);
});
test('exhausted ETag conflicts return409 without overwriting state',async()=>{const f=await fixture();f.store.conflicts=4;assert.equal((await f.call(body())).status,409);assert.equal(f.store.writes,0);assert.equal(f.store.text,null);});
test('ambiguous write/readback failure returns error, and same request recovers without duplication',async()=>{
  const f=await fixture(),input=body(),normal=f.store.getWithMetadata.bind(f.store);let once=true;
  f.store.getWithMetadata=async()=>{if(f.store.writes&&once){once=false;throw Error('network failed');}return normal();};
  assert.equal((await f.call(input)).status,503);assert.equal(f.store.writes,1);assert.equal((await f.call(input)).status,200);assert.equal(f.store.writes,1);
});
test('corrupt or unavailable storage never returns empty successful index',async()=>{const f=await fixture();f.store.text='{}';assert.equal((await f.call()).status,503);f.store.text=JSON.stringify({...Core.empty(),revision:1});assert.equal((await f.call()).status,503);f.store.getWithMetadata=async()=>{throw Object.assign(Error('token=private'),{status:403});};assert.equal((await f.call()).status,503);assert.ok(!JSON.stringify((await f.call()).body).includes('private'));});
test('admin read supports ordinary same-origin GET but rejects explicit cross-origin and unverified owners',async()=>{
  const f=await fixture();await f.call(body());
  for(const headers of [{},{Origin:ORIGIN},{'Sec-Fetch-Site':'same-origin'}]){
    const r=await f.call(null,{headers},context,{admin:true});assert.equal(r.status,200);assert.equal(r.body.history.length,1);assert.equal(r.headers.get('access-control-allow-origin'),null);
  }
  for(const headers of [{Origin:'https://evil.example'},{Origin:'null'},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'}])assert.equal((await f.call(null,{headers},context,{admin:true})).status,403);
  const denied=await fixture({authenticate:async()=>{throw Core.fail(401,'Sign in again');}});
  assert.equal((await denied.call(null,{},context,{admin:true})).status,401);assert.equal(denied.seen.length,0);
  assert.equal((await f.call()).body.history,undefined);
});
test('read-only origin exception cannot authorize POST without exact Origin',async()=>{
  const f=await fixture();const request=req(body());request.headers.delete('Origin');
  assert.equal((await f.handler(request,context)).status,403);assert.equal(f.store.writes,0);assert.equal(f.seen.length,0);
});

async function authFixture(){const [,Auth,jose]=await modules;const {privateKey,publicKey}=await jose.generateKeyPair('RS256');const payload={sub:'synthetic-owner',email:Auth.OWNER,email_verified:true,auth_time:Math.floor(NOW/1000)-10,firebase:{sign_in_provider:'google.com'}};const token=await new jose.SignJWT(payload).setProtectedHeader({alg:'RS256',kid:'fixture'}).setAudience(Auth.PROJECT).setIssuer('https://securetoken.google.com/'+Auth.PROJECT).setIssuedAt(Math.floor(NOW/1000)-5).setExpirationTime(Math.floor(NOW/1000)+3600).sign(privateKey);const account={users:[{localId:payload.sub,email:Auth.OWNER,emailVerified:true,validSince:String(Math.floor(NOW/1000)-20),providerUserInfo:[{providerId:'google.com'}]}]};return {Auth,jose,payload,token,publicKey,account};}
test('real RS256 verification and current Google account lookup authorize only owner role',async()=>{
  const a=await authFixture(),calls=[];const result=await a.Auth.verifyOwner(req(body(),{headers:{Authorization:'Bearer '+a.token}}),{keys:a.publicKey,now:()=>NOW,fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(a.account),{headers:{'Content-Type':'application/json'}});}});assert.deepEqual(result,{role:'owner'});assert.equal(calls.length,1);assert.ok(calls[0].url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='));assert.deepEqual(JSON.parse(calls[0].options.body),{idToken:a.token});assert.equal(calls[0].options.redirect,'manual');
});
test('forged signature is rejected before sending token to account lookup',async()=>{const a=await authFixture();let fetched=false;const other=await a.jose.generateKeyPair('RS256');await assert.rejects(a.Auth.verifyOwner(req(body(),{headers:{Authorization:'Bearer '+a.token}}),{keys:other.publicKey,now:()=>NOW,fetchImpl:async()=>{fetched=true;}}),{status:401});assert.equal(fetched,false);});
test('claim validation rejects wrong project/provider/email/time and tenant',async()=>{
  const [,Auth]=await modules;const base={sub:'owner',aud:Auth.PROJECT,iss:'https://securetoken.google.com/'+Auth.PROJECT,email:Auth.OWNER,email_verified:true,exp:NOW/1000+3600,iat:NOW/1000,auth_time:NOW/1000-20,firebase:{sign_in_provider:'google.com'}};
  for(const extra of [{aud:'other'},{iss:'https://evil.example'},{sub:''},{exp:NOW/1000},{iat:NOW/1000+1},{auth_time:NOW/1000+1},{email_verified:false},{email:'not-owner@example.com'},{firebase:{sign_in_provider:'password'}},{firebase:{sign_in_provider:'google.com',tenant:'other'}}])assert.throws(()=>Auth.validateClaims({...base,...extra},NOW));
  assert.doesNotThrow(()=>Auth.validateClaims({...base,email:Auth.OWNER.toUpperCase()},NOW));
});
test('live account rejects revoked, disabled, removed provider, mismatched UID and unverified email',async()=>{
  const a=await authFixture();for(const extra of [{disabled:true},{localId:'other'},{email:'other@example.com'},{emailVerified:false},{providerUserInfo:[]},{validSince:String(NOW/1000)},{validSince:undefined}])assert.throws(()=>a.Auth.validateAccount(a.payload,{users:[{...a.account.users[0],...extra}]}));assert.throws(()=>a.Auth.validateAccount(a.payload,{users:[]}));
});
test('Google lookup rejects redirects, malformed/oversized payload and access errors',async()=>{
  const [,Auth]=await modules;
  for(const r of [new Response('{}',{status:302,headers:{location:'https://evil.example'}}),new Response('not-json',{headers:{'Content-Type':'application/json'}}),new Response('x'.repeat(70000),{headers:{'Content-Type':'application/json'}}),new Response('{}',{status:401,headers:{'Content-Type':'application/json'}})])await assert.rejects(Auth.boundedJSON('https://identitytoolkit.googleapis.com/v1/accounts:lookup',{},async()=>r));
});
