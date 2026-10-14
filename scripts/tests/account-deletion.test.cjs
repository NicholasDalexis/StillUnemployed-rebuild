'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHmac,createHash,generateKeyPairSync}=require('node:crypto');
const {database}=require('./helpers/analytics-store.cjs');
const Account=require('../../netlify/functions/lib/account-state.cjs'),Queue=require('../../netlify/functions/lib/report-queue-core.cjs'),Core=require('../../netlify/functions/lib/job-moderation-core.cjs');
const modules=Promise.all([import('../../netlify/functions/lib/account-deletion.mjs'),import('../../netlify/functions/lib/account-report-erasure.mjs'),import('../../netlify/functions/lib/apple-revocation.mjs'),import('../../netlify/functions/lib/community-auth.mjs')]);
const NOW=Date.UTC(2026,8,30),uid='fixture-account',origin='https://stillunemployed.com';
const context={site:{id:Core.SITE_ID,name:'stillunemployed'},deploy:{context:'production'},ip:'192.0.2.50'};
const token='synthetic.firebase.idtoken',missing=()=>Object.assign(Error('not found'),{code:'auth/user-not-found'});
function request(input={},headers={}){return new Request(origin+'/api/account/delete',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+token,...headers},body:JSON.stringify({phase:'start',requestId:randomUUID(),confirm:true,...input})});}
async function fixture(options={}){
  const [Deletion]=await modules,env={SU_ACCOUNT_DELETION_ENABLED:'true',SU_ANALYTICS_SECRET:'fixture-only-secret'},db=database();
  let exists=true;const calls={deleted:0,reports:0,prepare:0,revoke:0};
  const account={uid,providerData:[{providerId:options.apple?'apple.com':'google.com',uid:'provider-fixture'}]};
  const claims={uid,auth_time:Math.floor(NOW/1000)-10,firebase:{sign_in_provider:options.apple?'apple.com':'google.com'}};
  const d={db,env,now:()=>NOW,auth:{async verifyIdToken(value,revoked){if(value!==token)throw Error('invalid');if(revoked&&!exists)throw missing();return claims;},async getUser(id){assert.equal(id,uid);if(!exists)throw missing();return account;},async deleteUser(){if(options.authFailure)throw Error('temporary');exists=false;calls.deleted++;}}};
  const eraseReports=async id=>{assert.equal(id,uid);calls.reports++;if(options.reportFailure)throw Error('temporary');};
  const appleRevoker={async prepare(input){calls.prepare++;if(!input)throw Core.fail(400,'Apple required');return 'fixture-sealed';},async revoke(){calls.revoke++;if(options.appleFailure)throw Core.fail(503,'Apple unavailable');}};
  const handle=Deletion.createService({getDependencies:()=>d,eraseReports,appleRevoker});
  const continuations=new Map();
  const raw=async(input={},headers={})=>{const response=await handle(request(input,headers),context);return {status:response.status,body:await response.json()};};
  return {d,calls,claims,options,raw,async call(input={},headers={}){
    input={requestId:randomUUID(),...input};let cap=continuations.get(input.requestId);
    if(!cap){const result=await raw(input,headers);if(!result.body.continuation)return result;cap=result.body.continuation;continuations.set(input.requestId,cap);}
    return raw({...input,phase:'process',continuation:cap},headers);
  }};
}
const hmac=value=>createHmac('sha256','fixture-only-secret').update(value).digest('hex');

test('deletion derives UID, erases private data and attribution rates, preserves others and verifies Auth removal',async()=>{
  const f=await fixture(),actor=hmac('account:'+uid),rate=hmac(actor);
  for(const [path,data] of [['users/'+uid,{tracker:'private'}],['users/other',{tracker:'other'}],['suAnalyticsEvents/owned',{actor}],['suAnalyticsEvents/other',{actor:'other'}],['suAnalyticsProfiles/'+actor,{jobs:{private:true}}],['suAnalyticsDaily/day',{counts:{page_view:5}}],...['', 'reset-', 'newsletter-'].map(prefix=>['suAnalyticsRates/'+prefix+rate,{count:1}]),['suAnalyticsRates/shared-ip',{count:5}]])f.d.db.data.set(path,data);
  const input={requestId:randomUUID()},one=await f.call(input);assert.equal(one.status,200);assert.equal(one.body.deleted,true);assert.equal(f.calls.deleted,1);
  for(const path of ['users/'+uid,'suAnalyticsEvents/owned','suAnalyticsProfiles/'+actor,...['','reset-','newsletter-'].map(p=>'suAnalyticsRates/'+p+rate)])assert.equal(f.d.db.data.has(path),false,path);
  for(const path of ['users/other','suAnalyticsEvents/other','suAnalyticsDaily/day','suAnalyticsRates/shared-ip'])assert.equal(f.d.db.data.has(path),true,path);
  const marker=f.d.db.data.get(Account.MARKERS+'/'+uid);assert.equal(marker.state,'complete');assert.equal(marker.expiresAt.getTime(),NOW+86400000);
  assert.equal((await f.call(input)).body.deleted,true,'lost final response recovers with original valid signed token');assert.equal(f.calls.deleted,1);
  assert.equal((await f.call({...input,uid:'other'})).status,400,'client cannot name another UID');
});
test('recent confirmation, valid token, exact origin, JSON and enabled configuration are required',async()=>{
  const f=await fixture();assert.equal((await f.call({confirm:false})).status,400);assert.equal((await f.call({}, {Authorization:'Bearer invalid-token-value'})).status,401);assert.equal((await f.call({}, {Origin:'https://evil.example'})).status,403);assert.equal((await f.call({}, {'Content-Type':'text/plain'})).status,415);
  f.claims.auth_time-=600;assert.equal((await f.call()).status,401);assert.equal(f.calls.deleted,0);assert.equal(f.d.db.data.has(Account.MARKERS+'/'+uid),false);
  f.d.env.SU_ACCOUNT_DELETION_ENABLED='false';assert.equal((await f.call()).status,503);
});
test('native transport still requires server verified token and never authorizes owner endpoints',async()=>{
  const f=await fixture(),native={Origin:'capacitor://localhost','X-SU-Native':'1'};assert.equal((await f.call({}, {...native,Authorization:'Bearer forged-token-value'})).status,401);assert.equal((await f.call({}, {...native,'Sec-Fetch-Site':'cross-site'})).status,403);assert.equal((await f.call({},native)).status,200);
});
test('Apple revocation persists progress, erasure failure stays pending and same request resumes without regrant',async()=>{
  const f=await fixture({apple:true,reportFailure:true}),input={requestId:randomUUID(),apple:{idToken:'synthetic-apple'}};
  f.d.db.data.set('users/'+uid,{saved:'private'});const first=await f.call(input);assert.equal(first.status,503);assert.equal(f.calls.deleted,0);assert.equal(f.calls.prepare,1);assert.equal(f.calls.revoke,1);assert.equal(f.d.db.data.get(Account.MARKERS+'/'+uid).appleRevoked,true);
  await assert.rejects(()=>Account.assertActive(uid,f.d),error=>error.status===403);
  f.options.reportFailure=false;assert.equal((await f.call({requestId:input.requestId})).body.deleted,true);assert.equal(f.calls.prepare,1);assert.equal(f.calls.revoke,1);assert.equal(f.calls.deleted,1);
});
test('Apple exchange/revoke failures preserve all private data and never delete Auth',async()=>{
  const f=await fixture({apple:true,appleFailure:true});f.d.db.data.set('users/'+uid,{private:true});const response=await f.call({apple:{idToken:'synthetic-apple'}});assert.equal(response.status,503);assert.equal(f.d.db.data.has('users/'+uid),true);assert.equal(f.calls.deleted,0);
});
test('deletion waits for in-flight reports, blocks new leases, bounds retries and final receipts bypass rate caps',async()=>{
  const f=await fixture(),input={requestId:randomUUID()};f.d.db.data.set(Account.OPERATIONS+'/'+uid,{leases:{fixture:NOW+30000}});
  assert.equal((await f.call(input)).status,202);await assert.rejects(()=>Account.runActive(uid,async()=>{},f.d),error=>error.status===403);
  for(let i=0;i<3;i++)assert.equal((await f.call(input)).status,202);assert.equal((await f.call(input)).status,429);assert.equal(f.calls.deleted,0);
  f.d.now=()=>NOW+60000;f.d.db.data.delete(Account.OPERATIONS+'/'+uid);assert.equal((await f.call(input)).body.deleted,true);assert.equal((await f.call(input)).status,200);
});
test('leases close correctly on request failure and prevent erasure before the last report finishes',async()=>{
  const f=await fixture();let release;const gate=new Promise(resolve=>{release=resolve;});const running=Account.runActive(uid,async()=>{await gate;throw Error('failure');},f.d);await new Promise(resolve=>setImmediate(resolve));assert.equal(Account.hasOperations(await f.d.db.doc(Account.OPERATIONS+'/'+uid).get(),NOW),true);release();await assert.rejects(()=>running,/failure/);assert.equal(Account.hasOperations(await f.d.db.doc(Account.OPERATIONS+'/'+uid).get(),NOW),false);
});
function store(initial){let text=JSON.stringify(initial),version=1;return {get data(){return JSON.parse(text);},async getWithMetadata(){return {data:text,etag:String(version)};},async setJSON(_key,value,condition){if(condition.onlyIfMatch!==String(version))return {modified:false};text=JSON.stringify(value);version++;return {modified:true};}};}
test('report erasure removes UID references and receipts while preserving quarantine and monotonic revisions',async()=>{
  const [,Erasure]=await modules,actor='account:'+uid,tracker=Queue.empty(),availability=Queue.empty();
  const reportId='a'.repeat(64),receipt={key:'b'.repeat(64),actor,fingerprint:'c'.repeat(64),reportId,at:new Date(NOW).toISOString(),response:{status:'pending_review'}};
  tracker.records=[{reportId,actor,status:'pending_review',receivedAt:new Date(NOW).toISOString(),job:{link:'https://example.com/job'},reason:'other'}];tracker.receipts=[receipt];tracker.revision=1;
  availability.records=[{reportId,status:'human_review',receivedAt:new Date(NOW).toISOString(),keys:['url:https://example.com/job'],slugs:[],link:'https://example.com/job',reporters:[actor,'account:other'],lastReviewedReporters:[actor],reviews:[],revision:1}];availability.receipts=[receipt];availability.revision=1;
  const stores=new Map([['su-tracker-reports-v1-production',store(tracker)],['su-job-availability-v1-production',store(availability)]]);
  await Erasure.eraseReportAttribution(uid,{scopes:['production'],openStore:name=>stores.get(name)});
  const t=stores.get('su-tracker-reports-v1-production').data,a=stores.get('su-job-availability-v1-production').data;
  assert.equal(t.revision,2);assert.equal(a.revision,2);assert.equal(t.receipts.length,0);assert.equal(a.receipts.length,0);assert.equal(t.records.length,1);assert.equal(t.records[0].actor,undefined);assert.deepEqual(a.records[0].reporters,['account:other']);assert.equal(a.records[0].holdAuthorized,true);assert.equal(a.records[0].status,'human_review');assert.doesNotMatch(JSON.stringify([t,a]),new RegExp(uid));Queue.validate(t);Queue.validate(a);
});
test('AES-GCM revocation material is confidential, authenticated and rejects wrong keys',async()=>{
  const [,,Apple]=await modules,env={SU_ACCOUNT_ERASURE_KEY:Buffer.alloc(32,7).toString('base64')},value={token:'synthetic-private-token'};const sealed=Apple.seal(value,env);assert.doesNotMatch(sealed,/synthetic/);assert.deepEqual(Apple.unseal(sealed,env),value);assert.throws(()=>Apple.unseal(sealed,{SU_ACCOUNT_ERASURE_KEY:Buffer.alloc(32,8).toString('base64')}));
});
test('Apple community authentication verifies matching provider claims without granting owner roles',async()=>{
  const [,,,Auth]=await modules,t=Math.floor(NOW/1000),claims={sub:uid,email:'relay@privaterelay.appleid.com',email_verified:true,auth_time:t-10,iat:t,exp:t+300,aud:'stillunemployed-17de9',iss:'https://securetoken.google.com/stillunemployed-17de9',firebase:{sign_in_provider:'apple.com'}};Auth.validateClaims(claims,NOW);
  assert.deepEqual(Auth.validateAccount(claims,{users:[{localId:uid,email:claims.email,emailVerified:true,validSince:String(t-20),providerUserInfo:[{providerId:'apple.com'}]}]}),{uid});assert.throws(()=>Auth.validateAccount(claims,{users:[{localId:uid,email:claims.email,emailVerified:true,validSince:String(t-20),providerUserInfo:[{providerId:'google.com'}]}]}));
});

test('multiple-accounts-per-email mode authenticates provider UID without relying on omitted profile fields',async()=>{
  const [,,,Auth]=await modules,t=Math.floor(NOW/1000),claims={sub:uid,auth_time:t-10,iat:t,exp:t+300,aud:'stillunemployed-17de9',iss:'https://securetoken.google.com/stillunemployed-17de9',firebase:{sign_in_provider:'apple.com',identities:{'apple.com':['provider-fixture']}}};
  Auth.validateClaims(claims,NOW);const account={localId:uid,validSince:String(t-20),providerUserInfo:[{providerId:'apple.com',rawId:'provider-fixture'}]};assert.deepEqual(Auth.validateAccount(claims,{users:[account]}),{uid});assert.throws(()=>Auth.validateAccount(claims,{users:[{...account,providerUserInfo:[{providerId:'apple.com',rawId:'other-user'}]}]}));assert.throws(()=>Auth.validateClaims({...claims,firebase:{sign_in_provider:'apple.com'}},NOW));
});

test('confirmed start returns a bound continuation before any erasure and process recovers Auth deletion without a Firebase token',async()=>{
  const f=await fixture(),requestId=randomUUID(),start=await f.raw({requestId});assert.equal(start.status,202);assert.equal(f.calls.deleted,0);assert.equal(f.calls.reports,0);
  const input={phase:'process',requestId,continuation:start.body.continuation};
  assert.equal((await f.raw({...input,requestId:randomUUID()},{Authorization:''})).status,401);
  assert.equal((await f.raw({...input,continuation:input.continuation+'x'},{Authorization:''})).status,401);
  assert.equal((await f.raw(input,{Authorization:''})).body.deleted,true);assert.equal(f.calls.deleted,1);
  assert.equal((await f.raw(input,{Authorization:''})).body.deleted,true);assert.equal(f.calls.deleted,1);
  f.d.now=()=>NOW+86400000;assert.equal((await f.raw(input,{Authorization:''})).status,401,'expiry enforced even if completed marker remains');
});
test('Apple web access token must match the verified ID token at_hash before any revocation material is sealed',async()=>{
  const [,,Apple]=await modules,{privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),env={SU_APPLE_WEB_CLIENT_ID:'fixture.web',SU_APPLE_TEAM_ID:'fixture',SU_APPLE_KEY_ID:'fixture',SU_APPLE_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}),SU_ACCOUNT_ERASURE_KEY:Buffer.alloc(32,8).toString('base64')};
  const access='synthetic-valid-access-token',claims={sub:'provider-fixture',iat:Math.floor(NOW/1000),at_hash:createHash('sha256').update(access).digest().subarray(0,16).toString('base64url')};
  const revoker=Apple.createAppleRevoker({verify:async()=>({payload:claims}),now:()=>NOW}),account={providerData:[{providerId:'apple.com',uid:claims.sub}]};
  await assert.rejects(()=>revoker.prepare({idToken:'synthetic-id',accessToken:'unrelated-access-token'},account,env),e=>e.status===401);
  const sealed=await revoker.prepare({idToken:'synthetic-id',accessToken:access},account,env);assert.equal(Apple.unseal(sealed,env).token,access);
  delete claims.at_hash;await assert.rejects(()=>revoker.prepare({idToken:'synthetic-id',accessToken:access},account,env),e=>e.status===401);
});

test('expired incomplete operation renews only through current same-UID Firebase authentication and keeps Apple revoked',async()=>{
  const f=await fixture({apple:true,reportFailure:true}),requestId=randomUUID(),start=await f.raw({requestId,apple:{idToken:'synthetic-apple'}}),old={phase:'process',requestId,continuation:start.body.continuation};
  assert.equal((await f.raw(old,{Authorization:''})).status,503);assert.equal(f.calls.revoke,1);assert.equal(f.calls.prepare,1);
  f.d.now=()=>NOW+86400001;assert.equal((await f.raw(old,{Authorization:''})).status,401);
  assert.equal((await f.raw({requestId},{Authorization:''})).status,401);const renewed=await f.raw({requestId});assert.equal(renewed.status,202);assert.notEqual(renewed.body.continuation,old.continuation);
  f.options.reportFailure=false;assert.equal((await f.raw({...old,continuation:renewed.body.continuation},{Authorization:''})).body.deleted,true);assert.equal(f.calls.revoke,1);assert.equal(f.calls.prepare,1);
});

test('account receipt cleanup remains available with optional analytics ingestion disabled',async()=>{
  const f=await fixture();f.d.env.SU_ANALYTICS_ENABLED='false';f.d.db.data.set(Account.MARKERS+'/expired',{state:'complete',expiresAt:new Date(NOW-1)});f.d.db.data.set(Account.MARKERS+'/pending',{state:'erased'});
  assert.equal(await Account.cleanupExpired(f.d),1);assert.equal(f.d.db.data.has(Account.MARKERS+'/expired'),false);assert.equal(f.d.db.data.has(Account.MARKERS+'/pending'),true);
});
