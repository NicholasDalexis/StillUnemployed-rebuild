const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../../js/sync-store.js');
function memory(seed={}) { const m=new Map(Object.entries(seed).map(([k,v])=>[k,JSON.stringify(v)])); return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}; }
const view=s=>S.view(s.snapshot());
const tick=()=>new Promise(r=>setImmediate(r));
test('four anonymous saved jobs reach a second device; both devices retain their jobs',()=>{
 const a=S.create(memory({su_saved_jobs:{a:true,b:true,c:true,d:true}}));a.activate('same-account');
 const b=S.create(memory({su_saved_jobs:{e:true}}));b.activate('same-account');
 const union=S.merge(a.snapshot(),b.snapshot());a.receive(union);b.receive(union);
 assert.deepEqual(view(a).saved,{a:true,b:true,c:true,d:true,e:true});assert.deepEqual(view(b).saved,view(a).saved);
});
test('unsave and application removal survive a stale device reconnect',()=>{
 const a=S.create(memory());a.saveSaved({job:true});a.saveTracker([{link:'job',id:'a',status:'Applied'}]);
 const stale=a.snapshot();a.saveSaved({});a.saveTracker([]);a.receive(stale);
 assert.deepEqual(view(a),{saved:{},tracker:[]});
});
test('linkless manual applications survive; tracker status and notes propagate',()=>{
 const a=S.create(memory());a.saveTracker([{id:'manual',link:'',status:'Applied',notes:''}]);
 const b=S.create(memory());b.receive(a.snapshot());b.saveTracker([{id:'manual',link:'',status:'Interview',notes:'Friday'}]);
 a.receive(b.snapshot());assert.equal(view(a).tracker[0].status,'Interview');assert.equal(view(a).tracker[0].notes,'Friday');
});
test('switching accounts does not import the previous account or consumed guest jobs',()=>{
 const m=memory({su_saved_jobs:{guest:true}});const a=S.create(m);a.activate('alice');a.saveSaved({guest:true,alice:true});
 a.activate(null);assert.deepEqual(view(a).saved,{});a.activate('bob');assert.deepEqual(view(a).saved,{});
 a.activate('alice');assert.deepEqual(view(a).saved,{guest:true,alice:true});
});
test('a second change during a slow write is flushed, not dropped',async()=>{
 const a=S.create(memory()); let pending=[],server=S.empty();
 const session=S.connect(a,{listen:()=>()=>{},transaction:local=>new Promise(resolve=>pending.push(()=>{server=S.merge(server,local);resolve(server);}))},()=>{});
 a.saveSaved({a:true});session.flush();await tick();a.saveSaved({a:true,b:true});session.queue();pending.shift()();await tick();
 assert.equal(pending.length,1);pending.shift()();await tick();assert.deepEqual(S.view(server).saved,{a:true,b:true});session.stop();
});
test('failed sync retains local data, reports failure and recovers on retry',async()=>{
 const a=S.create(memory());a.saveSaved({a:true});let fail=true,status=[];
 const session=S.connect(a,{listen:()=>()=>{},transaction:async local=>{if(fail)throw Error('offline');return local;}},s=>status.push(s));
 await session.flush();assert.equal(status.at(-1),'error');assert.deepEqual(view(a).saved,{a:true});fail=false;await session.flush();assert.equal(status.at(-1),'synced');session.stop();
});
test('remote changes arrive on an already open second device',async()=>{
 let receive;const a=S.create(memory());const session=S.connect(a,{listen:fn=>{receive=fn;return ()=>{};},transaction:async local=>local},()=>{});
 await session.flush();const b=S.create(memory());b.saveSaved({remote:true});receive(S.payload(b.snapshot()));
 assert.deepEqual(view(a).saved,{remote:true});session.stop();
});
test('account change while a write is pending cannot overwrite the new account view',async()=>{
 const a=S.create(memory());a.activate('alice');a.saveSaved({alice:true});let complete;
 const session=S.connect(a,{listen:()=>()=>{},transaction:local=>new Promise(r=>complete=()=>r(local))},()=>{});
 session.flush();session.stop();a.activate('bob');complete();await tick();assert.deepEqual(view(a).saved,{});
});
test('legacy Firestore data migrates without discarding tracker rows',()=>{
 const r=S.decode({saved:{old:true},tracker:[{id:'offline',company:'Test',link:''}]});assert.equal(S.view(r).tracker.length,1);assert.equal(S.view(r).saved.old,true);
});
test('editing the same in-memory tracker row stamps a new version',()=>{
 const a=S.create(memory());const rows=[{link:'job',status:'Applied'}];a.saveTracker(rows);const old=a.snapshot();rows[0].status='Offer';a.saveTracker(rows);
 assert.ok(a.snapshot().tracker.job.at>old.tracker.job.at);assert.equal(S.view(S.merge(old,a.snapshot())).tracker[0].status,'Offer');
});
test('an edit from a stale tab preserves a newly saved job in the other tab',()=>{
 const storage=memory();const a=S.create(storage),b=S.create(storage);
 a.saveSaved({first:true});b.saveSaved({second:true});
 assert.deepEqual(view(b).saved,{first:true,second:true});
});
test('an edit from a stale tab preserves a newly added application in the other tab',()=>{
 const storage=memory();const a=S.create(storage),b=S.create(storage);
 a.saveTracker([{id:'first',status:'Applied'}]);b.saveTracker([{id:'second',status:'Interview'}]);
 assert.deepEqual(new Set(view(b).tracker.map(r=>r.id)),new Set(['first','second']));
});
