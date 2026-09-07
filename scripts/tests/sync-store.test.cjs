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
function reorderMaps(value) {
 if (Array.isArray(value)) return value.map(reorderMaps);
 if (!value || typeof value !== 'object') return value;
 return Object.fromEntries(Object.keys(value).sort().map(key=>[key,reorderMaps(value[key])]));
}
test('a remote echo with reordered saved maps and nested tracker fields does not write again',async()=>{
 const a=S.create(memory());a.saveSaved({z:true,a:true});
 a.saveTracker([{id:'manual',notes:'Friday',status:'Applied',details:{z:1,a:{second:2,first:1}}}]);
 let receive,writes=0;const statuses=[];
 const session=S.connect(a,{
  listen:fn=>{receive=fn;return()=>{};},
  transaction:async local=>{
   writes++;const remote=reorderMaps(local);
   // Bound a regression rather than letting a bad listener loop forever.
   if(writes<5)receive(S.payload(remote));
   return remote;
  }
 },s=>statuses.push(s));
 try {await session.flush();await tick();assert.equal(writes,1);assert.equal(statuses.at(-1),'synced');}
 finally {session.stop();}
});
test('reordered tracker fields create no new version or local change event',()=>{
 let notifications=[];const a=S.create(memory(),edit=>notifications.push(edit));
 const rows=[{id:'row',notes:'Keep this',status:'Applied',extra:{z:2,a:[{last:4,first:3}]}}];
 a.saveTracker(rows);const before=a.snapshot();notifications=[];
 a.saveTracker(reorderMaps(rows));
 assert.deepEqual(a.snapshot(),before);assert.deepEqual(notifications,[]);
 const changed=reorderMaps(rows);changed[0].extra.a.push({first:5});a.saveTracker(changed);
 assert.ok(a.snapshot().tracker.row.at>before.tracker.row.at);assert.deepEqual(notifications,[true]);
});
test('receiving reordered maps does not rewrite local views or announce a remote change',()=>{
 const storage=memory();let writes=0,notifications=[];const write=storage.setItem;
 storage.setItem=(...args)=>{writes++;write(...args);};
 const a=S.create(storage,edit=>notifications.push(edit));a.saveSaved({z:true,a:true});a.saveTracker([{id:'a',status:'Applied',notes:'Keep'}]);
 writes=0;notifications=[];a.receive(reorderMaps(a.snapshot()));
 assert.equal(writes,0);assert.deepEqual(notifications,[]);
});

test('stopped listeners and stale account callbacks cannot alter status or start transactions',async()=>{
 const storage=memory(),a=S.create(storage);a.activate('alice');let receive,failure,writes=0;const statuses=[];
 const session=S.connect(a,{listen:(ok,bad)=>{receive=ok;failure=bad;return()=>{};},transaction:async r=>{writes++;return r;}},s=>statuses.push(s));
 await session.flush();session.stop();const before=statuses.slice();
 failure(Error('late permission failure'));receive({saved:{late:true}});session.queue();await session.flush();
 assert.deepEqual(statuses,before);assert.equal(writes,1);
 const live=S.connect(a,{listen:(ok,bad)=>{receive=ok;failure=bad;return()=>{};},transaction:async r=>r},s=>statuses.push(s));
 const b=S.create(storage);b.activate('bob');const after=statuses.slice();
 failure(Error('old account listener'));receive({saved:{alice:true}});live.queue();await live.flush();
 assert.deepEqual(statuses,after);assert.deepEqual(b.view(),{saved:{},tracker:[]});live.stop();
});

test('a failed snapshot releases the in-flight guard so explicit retry can recover',async()=>{
 const a=S.create(memory());a.saveSaved({saved:true});const snapshot=a.snapshot;let fail=true,writes=0,status;
 a.snapshot=()=>{if(fail)throw Error('snapshot unavailable');return snapshot();};
 const session=S.connect(a,{listen:()=>()=>{},transaction:async r=>{writes++;return r;}},s=>status=s);
 await session.flush();assert.equal(status,'error');assert.equal(writes,0);
 fail=false;await session.flush();assert.equal(status,'synced');assert.equal(writes,1);session.stop();
});

test('canonical quota failures preserve committed state and allow retry without false success',()=>{
 const storage=memory();const write=storage.setItem;let failedKey='',notifications=[];
 storage.setItem=(key,value)=>{if(key===failedKey)throw Error('Quota exceeded');write(key,value);};
 const a=S.create(storage,edit=>notifications.push(edit));a.activate('alice');notifications=[];failedKey='su_sync_v2:alice';
 assert.throws(()=>a.saveSaved({lost:true}),/Quota/);assert.deepEqual(a.view().saved,{});
 assert.throws(()=>a.saveTracker([{id:'lost'}]),/Quota/);assert.deepEqual(a.view().tracker,[]);
 assert.throws(()=>a.setDiscovery('profile',{major:'Draft'}),/Quota/);assert.deepEqual(a.discovery(),{});
 assert.deepEqual(notifications,[]);failedKey='';a.saveSaved({kept:true});assert.deepEqual(a.view().saved,{kept:true});assert.deepEqual(notifications,[true]);
});

test('a legacy mirror failure keeps the durable account view authoritative and isolated',()=>{
 const storage=memory();const write=storage.setItem;const a=S.create(storage);a.activate('alice');
 storage.setItem=(key,value)=>{if(key==='su_saved_jobs'||key==='su_tracker')throw Error('Mirror full');write(key,value);};
 a.saveSaved({kept:true});a.saveTracker([{id:'manual',notes:'Saved'}]);
 assert.deepEqual(a.view(),{saved:{kept:true},tracker:[{id:'manual',notes:'Saved'}]});
 const exposed=a.view();exposed.saved.unsafe=true;exposed.tracker[0].notes='Not saved';assert.equal(a.view().tracker[0].notes,'Saved');assert.equal(a.view().saved.unsafe,undefined);
 assert.deepEqual(JSON.parse(storage.getItem('su_saved_jobs')),{});
});

test('cross-tab ownership blocks stale writes and hides the previous account immediately',()=>{
 const storage=memory({su_saved_jobs:{guest:true}}),a=S.create(storage),stale=S.create(storage);
 a.activate('alice');a.saveSaved({guest:true,alice:true});
 assert.equal(stale.current(),false);assert.deepEqual(stale.view(),{saved:{},tracker:[]});assert.deepEqual(stale.discovery(),{});
 assert.throws(()=>stale.saveSaved({wrong:true}),{code:'sync/account-changed'});
 stale.activate('bob');assert.deepEqual(stale.view().saved,{},'stale anonymous tab must not re-import consumed guest jobs');
 assert.throws(()=>a.saveTracker([{id:'alice'}]),{code:'sync/account-changed'});assert.deepEqual(a.view().tracker,[]);
 a.activate('alice');assert.deepEqual(a.view().saved,{guest:true,alice:true});
});

test('failed account activation never consumes guest jobs before the destination is durable',()=>{
 for(const failingKey of ['su_sync_v2:alice','su_sync_owner']) {
  const storage=memory({su_saved_jobs:{guest:true}});const write=storage.setItem;const a=S.create(storage);let fail=true;
  storage.setItem=(key,value)=>{if(fail&&key===failingKey)throw Error('Quota');write(key,value);};
  assert.throws(()=>a.activate('alice'),/Quota/);a.suspend();assert.deepEqual(a.view().saved,{});
  fail=false;a.activate('alice');assert.deepEqual(a.view().saved,{guest:true});
  a.activate(null);a.activate('bob');assert.deepEqual(a.view().saved,{});
 }
});
