const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../../js/job-moderation.js'),Identity=require('../../js/job-identity.js');
const link='https://example.com/jobs/one',other='https://example.com/jobs/two',id='11111111-1111-4111-8111-111111111111';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture({host='preview--stillunemployed.netlify.app',handler}={}){
 const calls=[],timers=new Map(),intervals=new Map(),events={},docEvents={};let number=0;
 const popup={closed:false,document:{body:{}},opener:{},location:{replace(url){this.url=url;}},close(){this.closed=true;}};
 const root={SUJobIdentity:Identity,SUAuth:{qaAdmin:()=>true,getToken:async force=>{calls.push({tokenForce:force});return 'synthetic-only';}},AbortController,location:{hostname:host,protocol:'https:'},document:{hidden:false,addEventListener:(k,f)=>docEvents[k]=f,removeEventListener:k=>delete docEvents[k]},addEventListener:(k,f)=>events[k]=f,removeEventListener:k=>delete events[k],setInterval:f=>{intervals.set(++number,f);return number;},clearInterval:i=>intervals.delete(i),setTimeout:f=>{timers.set(++number,f);return number;},clearTimeout:i=>timers.delete(i),open:(...args)=>{calls.push({open:args});return popup;},fetch:async(url,options)=>{calls.push({url,options});return handler?handler(options,calls):response(index());}};
 const module=create(root);return{root,module,calls,popup,timers,intervals,events,docEvents};
}
const index=(revision=0,removed=[])=>({schemaVersion:1,revision,removed:removed.map(link=>({link,keys:Identity.keys(link),slugs:[]})),checkedAt:new Date().toISOString()});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('fresh equivalent reads dedupe, consume identity keys and never persist a catalog or cross an origin',async()=>{
 let finish;const f=fixture({handler:()=>new Promise(r=>finish=r)}),a=f.module.refresh(),b=f.module.refresh();assert.equal(a,b);assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'/api/job-moderation');assert.equal(f.calls[0].options.cache,'no-store');
 finish(response(index(2,[link])));await a;assert(f.module.blocked(link+'?utm_source=qa'));assert.deepEqual(f.module.filter([{link},{link:other}]),[{link:other}]);assert.equal(f.module.status().revision,2);
 const production=fixture({host:'stillunemployed.com'});assert(production.module.blocked(other));await production.module.refresh();assert(!production.module.blocked(link),'new origin starts with its own response');
});
test('a failed hosted read blocks all current outgoing jobs and a fresh read recovers',async()=>{
 let good=true;const f=fixture({handler:()=>good?response(index()):response({error:'private diagnostic must not reach UI'},503)});await f.module.refresh();good=false;await assert.rejects(f.module.refresh(),/Could not check/);assert.equal(f.module.status().status,'error');assert.deepEqual(f.module.filter([{link}]),[]);good=true;await f.module.refresh();assert(!f.module.blocked(link));
});
test('only explicit local-static 404 can skip an absent service; reports never fake local success',async()=>{
 for(const host of ['localhost','preview--stillunemployed.netlify.app']){const f=fixture({host,handler:()=>response({},404)});if(host==='localhost'){await f.module.refresh();assert.equal(f.module.status().status,'local');assert(!f.module.blocked(link));await assert.rejects(f.module.mutate('report',link,{requestId:id}),/local static/);}else{await assert.rejects(f.module.refresh());assert(f.module.blocked(link));}}
});
test('owner report refreshes the token, sends a stable request ID and accepts only durable matching preview acknowledgement',async()=>{
 const f=fixture({handler:opts=>opts.method==='POST'?response({reported:true,link,revision:1,requestId:id,scope:'preview'}):response(index(1,[link]))});
 const ack=await f.module.mutate('report',link,{requestId:id});assert.equal(ack.reported,true);assert.deepEqual(f.calls.find(c=>c.tokenForce!==undefined),{tokenForce:true});const post=f.calls.find(c=>c.options?.method==='POST');assert.equal(post.options.headers.Authorization,'Bearer synthetic-only');assert.deepEqual(JSON.parse(post.options.body),{action:'report',link,requestId:id});assert(f.module.blocked(link));
 const wrong=fixture({handler:()=>response({reported:true,link,revision:1,requestId:id,scope:'production'})});await assert.rejects(wrong.module.mutate('report',link,{requestId:id}),/Could not confirm/);
});
test('owner change while token refresh is pending prevents the POST; permission errors never acknowledge success',async()=>{
 let current=true,token;const f=fixture();f.root.SUAuth.getToken=()=>new Promise(r=>token=r);const work=f.module.mutate('report',link,{requestId:id,current:()=>current});current=false;token('stale-owner-token');await assert.rejects(work,/Account changed/);assert(!f.calls.some(c=>c.options?.method==='POST'));
 const denied=fixture({handler:()=>response({error:'secret diagnostics'},403)});await assert.rejects(denied.module.mutate('report',link,{requestId:id}),/cannot change/);assert.equal(denied.module.status().status,'unknown');
});
test('Undo carries the acknowledged revision and rejects conflict without claiming restoration',async()=>{
 const f=fixture({handler:()=>response({error:'conflict'},409)});await assert.rejects(f.module.mutate('restore',link,{requestId:id,expectedRevision:7}),/board changed/);assert.equal(JSON.parse(f.calls.find(c=>c.options).options.body).expectedRevision,7);
});
test('outgoing Apply reserves a safe tab in the gesture, verifies fresh status, then navigates or closes it',async()=>{
 let finish;const f=fixture({handler:()=>new Promise(r=>finish=r)});const work=f.module.navigate(link);assert.deepEqual(f.calls[0].open,['about:blank','_blank']);assert.equal(f.popup.opener,null);assert.equal(f.popup.location.url,undefined);finish(response(index()));await work;assert.equal(f.popup.location.url,link);
 const blocked=fixture({handler:()=>response(index(1,[link]))});await assert.rejects(blocked.module.navigate(link),/no longer listed/);assert(blocked.popup.closed);assert.equal(blocked.popup.location.url,undefined);
 const failed=fixture({handler:()=>response({},503)});await assert.rejects(failed.module.navigate(link));assert(failed.popup.closed);
});
test('a canceled outgoing intent or blocked popup never opens the employer',async()=>{
 let finish,current=true;const f=fixture({handler:()=>new Promise(r=>finish=r)}),work=f.module.navigate(link,{current:()=>current});current=false;finish(response(index()));await assert.rejects(work,/canceled/);assert(f.popup.closed);assert.equal(f.popup.location.url,undefined);const blocked=fixture();blocked.root.open=()=>null;await assert.rejects(blocked.module.navigate(link),/Allow a new tab/);assert.equal(blocked.calls.length,0);
});
test('an older in-flight GET cannot undo an acknowledged report or its newer index',async()=>{
 let old,reads=0;const f=fixture({handler:opts=>opts.method==='POST'?response({reported:true,link,revision:1,requestId:id,scope:'preview'}):++reads===1?new Promise(r=>old=r):response(index(1,[link]))});const previous=f.module.refresh();const pendingRejection=assert.rejects(previous,/Availability changed|Could not check/);await f.module.mutate('report',link,{requestId:id});old(response(index(0)));await pendingRejection;assert.equal(f.module.status().revision,1);assert(f.module.blocked(link));
});
test('active refresh timer pauses on pagehide, resumes once on pageshow and cleans up listeners',async()=>{
 const f=fixture(),stop=f.module.watch();await tick();assert.equal(f.intervals.size,1);f.events.pagehide();assert.equal(f.intervals.size,0);f.events.pageshow();await tick();assert.equal(f.intervals.size,1);f.events.pageshow();await tick();assert.equal(f.intervals.size,1);f.root.document.hidden=true;const count=f.calls.length;f.events.focus();assert.equal(f.calls.length,count);stop();assert.equal(f.intervals.size,0);assert.deepEqual(f.events,{});assert.deepEqual(f.docEvents,{});
});
test('the timeout covers response-body stalls and fails closed even if transport ignores abort',async()=>{
 const f=fixture({handler:()=>({ok:true,status:200,text:()=>new Promise(()=>{})})}),work=f.module.refresh(),rejection=assert.rejects(work,/Could not check/);await tick();for(const fn of f.timers.values())fn();await rejection;assert.equal(f.module.status().status,'error');
});


test('a later regressing GET never resurrects a removal already observed from another owner',async()=>{
 let revision=5;const f=fixture({handler:()=>response(index(revision,revision?[link]:[]))});
 await f.module.refresh();assert(f.module.blocked(link));revision=0;await assert.rejects(f.module.refresh());
 assert.equal(f.module.status().status,'error');assert.equal(f.module.status().revision,5);assert(f.module.blocked(link));
 revision=6;await f.module.refresh();assert.equal(f.module.status().status,'ready');assert(f.module.blocked(link));
});

test('an unchanged active-index poll does not emit UI updates or replace an open dialog',async()=>{
 const f=fixture();let updates=0;f.module.subscribe(()=>updates++);await f.module.refresh();await f.module.refresh();await f.module.refresh();
 assert.equal(f.calls.length,3,'fresh server reads still occur');assert.equal(updates,1,'only the initial ready transition repaints');
});
