const {test}=require('node:test');const assert=require('node:assert/strict');const S=require('../../netlify/functions/lib/analytics-service.cjs');const C=require('../../netlify/functions/lib/analytics-core.cjs');
const now=Date.UTC(2026,8,5),job={link:'https://job-boards.greenhouse.io/acme/jobs/12345',ind:'Social',role:'Social Media',pay:'$80K-90K'},jobId=C.jobId(job);
const {database}=require('./helpers/analytics-store.cjs');
function deps(){return {env:{SU_ALLOWED_ORIGINS:'http://localhost:8013',SU_ANALYTICS_SECRET:'synthetic-test-only-secret',SU_ANALYTICS_ADMIN_UIDS:'owner'},db:database(),jobs:C.catalog([job]),now:()=>now,auth:{verifyIdToken:async(token,check)=>{assert.equal(check,true);if(!['alice','bob','owner'].includes(token))throw Error('invalid');return {uid:token};},getUser:async()=>({metadata:{creationTime:new Date(now-1000).toISOString()}})}};}
function request(token='alice',events=[{name:'job_open',jobId}],extra={}){return {httpMethod:'POST',headers:{origin:'http://localhost:8013',authorization:'Bearer '+token},body:JSON.stringify({session:'session1234567890',visitor:'visitor1234567890',consent:{analytics:true,personalization:true},events:events.map((e,i)=>({id:'testevent123456789'+i,page:'board',occurredAt:now,...e})),...extra})};}
test('collector verifies token, derives account from token and deduplicates retries',async()=>{const d=deps(),r=request();assert.equal((await S.collect(r,d)).accepted,1);assert.equal((await S.collect(r,d)).accepted,0);const profile=await S.profile({...r,httpMethod:'GET'},d);assert.equal(profile.jobs[jobId].weight,1);const other=await S.profile({...request('bob'),httpMethod:'GET'},d);assert.deepEqual(other.jobs,{});});
test('invalid tokens, cross-origin, missing consent and forged unknown jobs fail closed',async()=>{const d=deps();await assert.rejects(()=>S.collect(request('forged'),d),e=>e.status===401);const r=request();r.headers.origin='https://evil.example';await assert.rejects(()=>S.collect(r,d),e=>e.status===403);await assert.rejects(()=>S.collect(request('alice',undefined,{consent:{}}),d),e=>e.status===403);await assert.rejects(()=>S.collect(request('alice',[{name:'job_open',jobId:'f'.repeat(64)}]),d),e=>e.status===400);assert.equal(d.db.data.size,0);});
test('PII and client-supplied fields are excluded and employer metadata is trusted',async()=>{const d=deps();await S.collect(request('alice',[{name:'job_open',jobId,email:'secret@example.invalid',notes:'private',url:'https://secret',field:'Fake',uid:'bob'}]),d);const text=JSON.stringify([...d.db.data]);assert.doesNotMatch(text,/secret|private|Fake|"bob"/);assert.match(text,/Marketing/);});
test('response action events discard every optional payload field at the server',()=>{
 const names=['preference_save','preference_clear','preference_skip','feedback_not_fit'];
 for(const name of names){
  const input={id:'response-event-12345',name,page:'board',jobId,major:'private study',location:'private place',info:'private note',notes:'private note',email:'private@example.invalid',uid:'alice',url:job.link,field:'Private',theme:'original',filter:'category',status:'Applied',seconds:123,capped:true,vote:'up',outboundId:'outbound-event-12345'};
  assert.deepEqual(C.cleanEvent(input,C.catalog([job])),{id:input.id,name,page:'board'});
 }
 assert.throws(()=>C.cleanEvent({id:'response-event-12345',name:'preference_major',page:'board'},{}),e=>e.status===400);
});
test('response actions aggregate by type, deduplicate retries, and never update interest profiles',async()=>{
 const d=deps(),names=['preference_save','preference_clear','preference_skip','feedback_not_fit'];
 const r=request('alice',names.map(name=>({name,jobId,major:'private typed answer'})));
 assert.equal((await S.collect(r,d)).accepted,4);assert.equal((await S.collect(r,d)).accepted,0);
 let out=await S.admin({...request('owner'),httpMethod:'GET'},d);
 assert.deepEqual(out.events,names.map(label=>({label,count:1})));
 assert.equal(out.totals.reported_applied,0);assert.deepEqual(out.jobs,[]);
 assert.deepEqual((await S.profile({...request(),httpMethod:'GET'},d)).jobs,{});
 assert.doesNotMatch(JSON.stringify([...d.db.data]),/private typed answer|major|jobId|jobLabel/);
 await S.collect(request('alice',[{name:'preference_save',id:'new-response-123456'}]),d);
 out=await S.admin({...request('owner'),httpMethod:'GET'},d);
 assert.equal(out.events.find(row=>row.label==='preference_save').count,2,'a new action is distinct from retrying one event');
});
test('personalization-only requests retain no response behavior in storage or owner counts',async()=>{
 const d=deps();
 await S.collect(request('alice',['preference_save','preference_clear','preference_skip','feedback_not_fit'].map(name=>({name,jobId,info:'private typed answer'})),{consent:{analytics:false,personalization:true}}),d);
 const out=await S.admin({...request('owner'),httpMethod:'GET'},d);
 assert.equal(out.totals.events,0);assert.deepEqual(out.events,[]);
 assert.deepEqual((await S.profile({...request(),httpMethod:'GET'},d)).jobs,{});
 for(const [key,value] of d.db.data)if(key.startsWith('suAnalyticsEvents/'))assert.equal(value.name,undefined);
 assert.doesNotMatch(JSON.stringify([...d.db.data]),/preference_save|preference_clear|preference_skip|feedback_not_fit|private typed answer|jobId/);
});
test('personalization-only produces a profile without owner-report behavior',async()=>{const d=deps();await S.collect(request('alice',undefined,{consent:{analytics:false,personalization:true}}),d);const admin=await S.admin({...request('owner'),httpMethod:'GET'},d);assert.equal(admin.totals.events,0);assert.equal((await S.profile({...request(),httpMethod:'GET'},d)).jobs[jobId].weight,1);});
const uxActions=['preferred_source_click','feedback_open','feedback_dismiss','feedback_unavailable',
 'feed_ready','feed_load_error','feed_retry','feed_refresh','search_empty','signin_start','signin_cancel','signin_error','signout_complete','signout_error',
 'sync_error','sync_retry','sync_recovered','preference_open','preference_error','newsletter_dismiss','bookmark_open','view_restored','render_error'];
test('UX counts accept guests, remove optional data, deduplicate, and never claim a Google selection or application',async()=>{
 const d=deps(),r=request('alice',uxActions.map(name=>({name,jobId,theme:'poker',status:'Applied',seconds:99,outboundId:'private-outbound',message:'private failure',url:'https://private.invalid',query:'private question'})),{consent:{analytics:true,personalization:false}});
 delete r.headers.authorization;
 assert.equal((await S.collect(r,d)).accepted,uxActions.length);assert.equal((await S.collect(r,d)).accepted,0);
 const out=await S.admin({...request('owner'),httpMethod:'GET'},d);
 assert.deepEqual(out.events,uxActions.map(label=>({label,count:1})));
 assert.equal(out.totals.reported_applied,0);assert.equal(out.totals.logins,0);assert.deepEqual(out.jobs,[]);assert.deepEqual(out.themes,[]);
 assert.deepEqual(out.timing,{returned:0,unknown:0,capped:0,meanAwaySeconds:null});
 for(const [key,value] of d.db.data)if(key.startsWith('suAnalyticsEvents/'))assert.deepEqual(Object.keys(value).sort(),['actor','analytics','at','expiresAt','id','name','page','session']);
 assert.doesNotMatch(JSON.stringify([...d.db.data]),/private|jobId|jobLabel|outboundId|poker/);
 for(const name of ['preferred_source_added','preferred_source_complete','preferred_source_success'])assert.throws(()=>C.cleanEvent({name,id:'invalid-event-12345',page:'board'},{}),e=>e.status===400);
});
test('forged UX metadata cannot train recommendations in personalization-only requests',async()=>{
 const d=deps();await S.collect(request('alice',uxActions.map(name=>({name,jobId,notes:'private',status:'Applied'})),{consent:{analytics:false,personalization:true}}),d);
 assert.deepEqual((await S.profile({...request(),httpMethod:'GET'},d)).jobs,{});
 const out=await S.admin({...request('owner'),httpMethod:'GET'},d);assert.equal(out.totals.events,0);assert.deepEqual(out.events,[]);
 for(const [key,value] of d.db.data)if(key.startsWith('suAnalyticsEvents/'))assert.equal(value.name,undefined);
 assert.doesNotMatch(JSON.stringify([...d.db.data]),/private|jobId|jobLabel|preferred_source|signin_|sync_error/);
});
test('owner allowlist is server-enforced and query excludes other private metadata',async()=>{const d=deps();await S.collect(request(),d);await assert.rejects(()=>S.admin({...request('alice'),httpMethod:'GET'},d),e=>e.status===403);const out=await S.admin({...request('owner'),httpMethod:'GET'},d);assert.equal(out.totals.job_opens,1);assert.deepEqual(out.fields,[]);assert.doesNotMatch(JSON.stringify(out),/alice|visitor123|session123|testevent/);});
test('signup counts require verified Auth creation and ignores browser-declared signup',async()=>{const d=deps();await S.collect(request('alice',[{name:'auth_signup'},{name:'auth_login'}]),d);const out=await S.admin({...request('owner'),httpMethod:'GET'},d);assert.equal(out.totals.signups,1);assert.equal(out.totals.logins,1);});
test('reset clears profile and raw data, preserves other tenant and blocks queued older event',async()=>{const d=deps();await S.collect(request(),d);await S.collect(request('bob'),d);const out=await S.profile({...request(),httpMethod:'DELETE'},d);assert.equal(out.reset,true);assert.deepEqual((await S.profile({...request(),httpMethod:'GET'},d)).jobs,{});assert.equal((await S.profile({...request('bob'),httpMethod:'GET'},d)).jobs[jobId].weight,1);assert.equal((await S.collect(request('alice',[{name:'job_save',jobId,id:'newreceipt12345678'}]),d)).accepted,0);});
test('scheduled cleanup deletes expired analytics only',async()=>{const d=deps();d.db.data.set('suAnalyticsEvents/old',{expiresAt:new Date(now-1)});d.db.data.set('suAnalyticsEvents/current',{expiresAt:new Date(now+1)});d.db.data.set('users/alice',{notes:'private'});assert.equal((await S.cleanup(d)).deleted,1);assert.equal(d.db.data.has('users/alice'),true);assert.equal(d.db.data.has('suAnalyticsEvents/current'),true);});
test('outbound unknown intervals never become zero or completed applications',()=>{const base={actor:'a',session:'s',at:now,analytics:true};const out=C.reduceRows([{...base,name:'outbound_started',outboundId:'x'},{...base,name:'outbound_started',outboundId:'y'},{...base,name:'outbound_return',outboundId:'y',seconds:900,capped:true},{...base,at:now-31*86400000,name:'page_view'}],30,now);assert.equal(out.totals.events,3);assert.deepEqual(out.timing,{returned:1,unknown:1,capped:1,meanAwaySeconds:900});assert.equal(out.totals.reported_applied,0);});
test('same-origin browser GET without Origin accepted; foreign site denied',()=>{assert.doesNotThrow(()=>C.authorizeOrigin({httpMethod:'GET',headers:{host:'localhost:8013','sec-fetch-site':'same-origin'}},{SU_ALLOWED_ORIGINS:'http://localhost:8013'}));assert.throws(()=>C.authorizeOrigin({httpMethod:'GET',headers:{host:'localhost:8013','sec-fetch-site':'cross-site'}},{SU_ALLOWED_ORIGINS:'http://localhost:8013'}));});
module.exports={database,deps,request,jobId,now};

test('signal expiry survives unrelatedday89activity and keepsnewersignals duringday91cleanup',async()=>{
 const d=deps();let time=now;d.now=()=>time;
 await S.collect(request(),d);
 const newer={...job,link:'https://job-boards.greenhouse.io/acme/jobs/23456'},newId=C.jobId(newer);d.jobs={...d.jobs,...C.catalog([newer])};
 time=now+50*86400000;await S.collect(request('alice',[{id:'newer-event-123456',name:'job_open',jobId:newId,occurredAt:time}]),d);
 time=now+89*86400000;await S.collect(request('alice',[{id:'pageview-event-123456',name:'page_view',occurredAt:time}],{consent:{analytics:true,personalization:false}}),d);
 const actor=S.hmac(d.env,'account:alice'),ref='suAnalyticsProfiles/'+actor;
 assert.equal(+d.db.data.get(ref).expiresAt,now+179*86400000);assert.equal(+d.db.data.get(ref).nextSignalExpiryAt,now+90*86400000);
 time=now+91*86400000;const result=await S.cleanup(d);assert.equal(result.pruned,1);
 const retained=d.db.data.get(ref);assert.equal(retained.jobs[jobId],undefined);assert.equal(retained.jobs[newId].at,now+50*86400000);assert.equal(+retained.nextSignalExpiryAt,now+140*86400000);
});

test('realshareCSVloader preserves careerCategory for the servercatalog',async()=>{
 const {loadJobs}=await import('../gen-share.mjs');
 const text='Company,Job Title,Link,Salary,Active/Dead,Category\nExample,Social Media Coordinator,https://example.com/jobs/1,$70K-85K,Active,Social';
 const jobs=await loadJobs(null,async()=>({ok:true,text:async()=>text}));
 assert.equal(jobs[0].ind,'Social');const catalog=C.catalog(jobs),meta=Object.values(catalog)[0];
 assert.equal(meta.field,'Marketing');assert.equal(meta.role,'Social Media');
});
