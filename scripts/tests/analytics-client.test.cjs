const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(require.resolve('../../js/analytics.js'),'utf8');const P=require('../../js/personalization.js');const I=require('../../js/job-identity.js');
function storage(values={}){return {values,getItem:k=>values[k]??null,setItem:(k,v)=>{values[k]=v;},removeItem:k=>{delete values[k];}};}
function harness(local=storage(),session=storage(),responses=[],gpc=false){
 const wl={},dl={},intervals=[],requests=[];let now=1000000,signed=false;
 const window={crypto:crypto.webcrypto,SUJobIdentity:I,SUPersonalization:P,SUAuth:{signedIn:()=>signed,getToken:async()=>{if(!signed)throw Error();return 'synthetic';}},addEventListener:(n,f)=>{(wl[n]||=[]).push(f);},dispatchEvent:e=>(wl[e.type]||[]).forEach(f=>f(e))};
 const document={readyState:'loading',hidden:false,addEventListener:(n,f)=>{(dl[n]||=[]).push(f);}};
 vm.runInNewContext(source,{window,document,navigator:{globalPrivacyControl:gpc},localStorage:local,sessionStorage:session,location:{pathname:'/jobs.html'},setInterval:(f)=>intervals.push(f),Date:class extends Date{static now(){return now;}},CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},TextEncoder,Uint8Array,fetch:async(url,options)=>{requests.push({url,options});const response=responses.length?responses.shift():{ok:true,status:200};return {...response,json:async()=>({jobs:{}})};}});
 return {api:window.SUAnalytics,requests,local,session,window,document,intervals,tick:n=>{now+=n;intervals.forEach(f=>f());},start:()=>dl.DOMContentLoaded.forEach(f=>f()),auth:(value,changed=false)=>{signed=value;window.dispatchEvent({type:'su:auth-changed',detail:{signedIn:value,accountChanged:changed}});},consent:()=>window.dispatchEvent({type:'su:consent-changed'}),visibility:hidden=>{document.hidden=hidden;dl.visibilitychange.forEach(f=>f());}};
}
test('before consent no IDs, requests, queued events or pre-choice active time',async()=>{const h=harness();h.start();h.tick(30000);await h.api.flush();assert.equal(h.requests.length,0);assert.deepEqual(h.local.values,{});h.local.setItem('su_consent_v3','granted');h.consent();await h.api.flush();const events=h.requests.flatMap(r=>JSON.parse(r.options.body||'{"events":[]}').events||[]);assert.ok(events.some(e=>e.name==='page_view'));assert.equal(events.filter(e=>e.name==='page_engagement').length,0);});
test('same-account initial Firebase resolution preserves session across pages, transition rotates',async()=>{const local=storage({su_consent_v3:'granted'}),session=storage();let a=harness(local,session);a.auth(true,false);await a.api.flush();const first=JSON.parse(a.requests.find(r=>r.options.body).options.body).session;let b=harness(local,session);b.auth(true,false);await b.api.flush();assert.equal(JSON.parse(b.requests.find(r=>r.options.body).options.body).session,first);b.auth(false,true);await b.api.flush();assert.notEqual(JSON.parse(b.requests.at(-1).options.body).session,first);});
test('detail exploration recorded without Apply, aliases deduplicated and no text leaked',async()=>{const h=harness(storage({su_consent_v3:'granted'}));const job={link:'https://jobs.lever.co/acme/11111111-2222-3333-4444-555555555555',ind:'Social',role:'Role',co:'Company'};await h.api.registerJobs([job]);h.api.job('job_open',job.link+'?utm_source=example');h.api.job('job_open',job.link);h.api.emit('search_used', {query:'secret@example.invalid',notes:'private'});await h.api.flush();const text=h.requests[0].options.body;const body=JSON.parse(text);assert.equal(body.events.filter(e=>e.name==='job_open').length,1);assert.equal(body.events.filter(e=>e.name==='apply_click').length,0);assert.doesNotMatch(text,/secret|private|lever.co/);});
test('visible feedback popup does not produce away duration; observed return caps15min',async()=>{const h=harness(storage({su_consent_v3:'granted'}));const job={link:'https://example.com/job/1',ind:'Social'};await h.api.registerJobs([job]);h.api.job('apply_click',job.link);h.tick(240000);await h.api.flush();let events=h.requests.flatMap(r=>JSON.parse(r.options.body||'{"events":[]}').events||[]);assert.equal(events.filter(e=>e.name==='outbound_return').length,0);h.api.job('apply_click',job.link);h.visibility(true);h.tick(1200000);h.visibility(false);await h.api.flush();await h.api.flush();events=h.requests.flatMap(r=>JSON.parse(r.options.body||'{"events":[]}').events||[]);const away=events.find(e=>e.name==='outbound_return');assert.equal(away.seconds,900);assert.equal(away.capped,true);});

test('permanent4xxbatches are discarded so later valid events continue;429and5xxretry',async()=>{
  for(const status of [400,401,403,404,413]){
    const h=harness(storage({su_consent_v3:'granted'}),storage(),[{ok:false,status},{ok:true,status:200}]);
    h.api.emit('search_used',{});await h.api.flush();h.api.emit('theme_change',{theme:'original'});await h.api.flush();
    assert.equal(h.requests.length,2);const second=JSON.parse(h.requests[1].options.body);assert.equal(second.events.length,1);assert.equal(second.events[0].name,'theme_change');
  }
  for(const status of [429,500,503]){
    const h=harness(storage({su_consent_v3:'granted'}),storage(),[{ok:false,status},{ok:true,status:200}]);h.api.emit('search_used',{});await h.api.flush();await h.api.flush();
    assert.equal(h.requests.length,2);assert.equal(JSON.parse(h.requests[0].options.body).events[0].id,JSON.parse(h.requests[1].options.body).events[0].id);
  }
});

test('both theme votes use exact active keys, send promptly, and reject unknown values',async()=>{
 const h=harness(storage({su_consent_v3:'granted'}));
 const source=fs.readFileSync(require.resolve('../../js/app.js'),'utf8');
 const actions=[...source.matchAll(/data-act="(pick[A-Z][A-Za-z]+)"/g)].map(m=>m[1]);
 const themes=[...source.matchAll(/case '(pick[A-Z][A-Za-z]+)': self.setLook\('([^']+)'\)/g)].filter(m=>actions.includes(m[1])).map(m=>m[2]);
 assert.deepEqual(themes.slice().sort(),['original','girly','poker','mermaid','bratt','noir','beauty','chess'].sort());
 for(const theme of themes)for(const vote of ['up','down']){
   const before=h.requests.length;await h.window.suTrack('themevote',theme,vote,'https://private.invalid');
   assert.equal(h.requests.length,before+1,'explicit vote flushes without waiting for interval');
   const body=JSON.parse(h.requests.at(-1).options.body),event=body.events[0];
   assert.equal(event.name,'theme_vote');assert.equal(event.theme,theme);assert.equal(event.vote,vote);
   assert.deepEqual(body.consent,{analytics:true,personalization:false});assert.doesNotMatch(JSON.stringify(event),/private/);
 }
 const before=h.requests.length;
 for(const [theme,vote] of [['cod','up'],['Casino','up'],['poker','yes'],['noir',''],['__proto__','up']])await h.window.suTrack('themevote',theme,vote,'');
 assert.equal(h.requests.length,before);
});
test('theme votes remain off before analytics consent, after decline, with GPC/admin, and in personalization-only mode',async()=>{
 for(const [values,gpc,signed] of [[{},false,false],[{su_consent_v3:'denied'},false,false],[{su_consent_v3:'granted'},true,false],[{su_consent_v3:'granted',su_admin:'1'},false,false],[{su_personalization_v1:'granted'},false,true]]){
  const h=harness(storage(values),storage(),[],gpc);if(signed)h.auth(true);await Promise.resolve();
  for(const vote of ['up','down'])await h.window.suTrack('themevote','poker',vote,'');
  await h.api.flush();assert.equal(h.requests.filter(r=>r.options.method==='POST').length,0);
  assert.equal(h.local.values.su_analytics_visitor,undefined);
 }
});
test('failed theme vote retries retain event identity and withdrawal clears the pending vote',async()=>{
 const h=harness(storage({su_consent_v3:'granted'}),storage(),[{ok:false,status:503},{ok:true,status:200}]);
 await h.window.suTrack('themevote','noir','down','');await h.api.flush();
 assert.equal(JSON.parse(h.requests[0].options.body).events[0].id,JSON.parse(h.requests[1].options.body).events[0].id);
 const denied=harness(storage({su_consent_v3:'granted'}),storage(),[{ok:false,status:503}]);
 await denied.window.suTrack('themevote','beauty','up','');denied.local.setItem('su_consent_v3','denied');denied.consent();await denied.api.flush();
 assert.equal(denied.requests.length,1);
});

const responseActions=['preference_save','preference_clear','preference_skip','feedback_not_fit'];
const uxActions=['preferred_source_click','feedback_open','feedback_dismiss','feedback_unavailable',
 'feed_ready','feed_load_error','feed_retry','feed_refresh','search_empty','signin_start','signin_cancel','signin_error','signout_complete','signout_error',
 'sync_error','sync_retry','sync_recovered','preference_open','preference_error','newsletter_dismiss','bookmark_open','view_restored','render_error'];
test('UX decisions and recoveries send count-only payloads, including failed signed-out sign-in',async()=>{
 const h=harness(storage({su_consent_v3:'granted'}));
 for(const name of uxActions){
  h.api.emit(name,{message:'private failure',error:'private/token',url:'https://private.invalid/?token=secret',email:'private@example.invalid',jobId:'a'.repeat(64),theme:'poker',status:'Applied',seconds:400,outboundId:'private-outbound'});
  await h.api.flush();
 }
 const events=h.requests.flatMap(r=>JSON.parse(r.options.body).events);
 assert.deepEqual(events.map(e=>e.name),uxActions);
 for(const event of events)assert.deepEqual(Object.keys(event).sort(),['id','name','occurredAt','page']);
 assert.doesNotMatch(JSON.stringify(events),/private|secret|jobId|theme|seconds|outboundId/);
 assert.ok(h.requests.every(r=>!r.options.headers.Authorization),'failed sign-in does not require board authentication');
 assert.ok(!events.some(e=>/preferred_source_(added|complete|success)/.test(e.name)));
});
test('UX counts honor all analytics choices and never replay pre-consent actions',async()=>{
 for(const [values,gpc,signed] of [[{},false,false],[{su_consent_v3:'denied'},false,false],[{su_consent_v3:'granted'},true,false],[{su_consent_v3:'granted',su_admin:'1'},false,false],[{su_personalization_v1:'granted'},false,true]]){
  const h=harness(storage(values),storage(),[],gpc);if(signed)h.auth(true);await Promise.resolve();
  for(const name of uxActions)h.api.emit(name,{});
  await h.api.flush();assert.equal(h.requests.filter(r=>r.options.method==='POST').length,0);
  assert.equal(h.local.values.su_analytics_visitor,undefined);
 }
 const h=harness();for(const name of uxActions)h.api.emit(name,{});
 h.local.setItem('su_consent_v3','granted');h.consent();await h.api.flush();
 assert.ok(h.requests.every(r=>!JSON.parse(r.options.body).events.some(e=>uxActions.includes(e.name))));
});
test('pending UX counts keep their retry identity and cannot cross withdrawal or account changes',async()=>{
 for(const reset of ['withdraw','account']){
  const h=harness(storage({su_consent_v3:'granted'}),storage(),[{ok:false,status:503},{ok:false,status:503},{ok:true,status:200}]);
  h.api.emit('preferred_source_click',{});h.api.emit('sync_error',{});await h.api.flush();await h.api.flush();
  assert.deepEqual(JSON.parse(h.requests[0].options.body).events,JSON.parse(h.requests[1].options.body).events);
  if(reset==='withdraw'){h.local.setItem('su_consent_v3','denied');h.consent();}else h.auth(true,true);
  await h.api.flush();
  const later=h.requests.slice(2).flatMap(r=>JSON.parse(r.options.body||'{"events":[]}').events||[]);
  assert.ok(!later.some(e=>uxActions.includes(e.name)));
 }
});
test('response counts have no optional payload, even if callers pass typed or job data',async()=>{
 const h=harness(storage({su_consent_v3:'granted'}));
 for(const name of responseActions)h.api.emit(name,{major:'private study',location:'private location',info:'private notes',email:'private@example.invalid',jobId:'a'.repeat(64),url:'https://private.invalid',theme:'original',filter:'category',status:'Applied',seconds:15,capped:true,vote:'up',outboundId:'private-outbound'});
 await h.api.flush();
 const body=JSON.parse(h.requests[0].options.body);
 assert.deepEqual(body.events.map(e=>e.name),responseActions);
 for(const event of body.events)assert.deepEqual(Object.keys(event).sort(),['id','name','occurredAt','page']);
 assert.deepEqual(body.consent,{analytics:true,personalization:false});
 assert.doesNotMatch(JSON.stringify(body),/private|jobId|major|location|info|theme|filter|vote|outboundId/);
});
test('response actions stay off before consent, after decline, for GPC/admin and personalization-only',async()=>{
 for(const [values,gpc,signed] of [[{},false,false],[{su_consent_v3:'denied'},false,false],[{su_consent_v3:'granted'},true,false],[{su_consent_v3:'granted',su_admin:'1'},false,false],[{su_personalization_v1:'granted'},false,true]]){
  const h=harness(storage(values),storage(),[],gpc);if(signed)h.auth(true);await Promise.resolve();
  for(const name of responseActions)h.api.emit(name,{});
  await h.api.flush();assert.equal(h.requests.filter(r=>r.options.method==='POST').length,0);
  assert.equal(h.local.values.su_analytics_visitor,undefined);
 }
 const h=harness();for(const name of responseActions)h.api.emit(name,{});
 h.local.setItem('su_consent_v3','granted');h.consent();await h.api.flush();
 const events=h.requests.flatMap(r=>JSON.parse(r.options.body||'{"events":[]}').events||[]);
 assert.equal(events.filter(e=>responseActions.includes(e.name)).length,0,'opt-in never replays earlier actions');
});
test('response action retries preserve IDs and withdrawal/account changes discard queued actions',async()=>{
 const h=harness(storage({su_consent_v3:'granted'}),storage(),[{ok:false,status:503},{ok:true,status:200}]);
 for(const name of responseActions)h.api.emit(name,{});await h.api.flush();await h.api.flush();
 assert.deepEqual(JSON.parse(h.requests[0].options.body).events,JSON.parse(h.requests[1].options.body).events);
 for(const reset of ['withdraw','account']){
  const h=harness(storage({su_consent_v3:'granted'}),storage(),[{ok:false,status:503},{ok:true,status:200}]);
  for(const name of responseActions)h.api.emit(name,{});await h.api.flush();
  if(reset==='withdraw'){h.local.setItem('su_consent_v3','denied');h.consent();}else h.auth(true,true);
  await h.api.flush();
  const later=h.requests.slice(1).flatMap(r=>JSON.parse(r.options.body||'{"events":[]}').events||[]);
  assert.equal(later.filter(e=>responseActions.includes(e.name)).length,0);
 }
});
