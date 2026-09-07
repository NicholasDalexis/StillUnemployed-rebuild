const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../../js/board-runtime.js'),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 let now=Date.UTC(2026,8,6),nextTimer=0;const timers=new Map(),local=new Map(),session=new Map();
 const storage=map=>({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)});
 const root={localStorage:storage(local),sessionStorage:storage(session),scrollY:456,AbortController,setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
 const module={exports:{}};vm.runInNewContext(source,{module,Date:class extends Date{static now(){return now;}}});
 return{api:module.exports(root),root,local,session,advance:ms=>{now+=ms;},now:()=>now,timeout(){for(const [id,t]of [...timers])if(t.ms===20000){timers.delete(id);t.fn();}}};
}
test('equivalent in-flight reads are deduplicated, while finished results are never cached',async()=>{
 const h=harness(),a=deferred(),b=deferred();let calls=0;
 const first=h.api.request('jobs',()=>{calls++;return a.promise;});
 assert.equal(h.api.request('jobs',()=>{throw Error('duplicate loader ran');}),first);
 const other=h.api.request('internships',()=>b.promise);assert.notEqual(other,first);
 await tick();assert.equal(calls,1);a.resolve(['old']);b.resolve(['intern']);
 assert.deepEqual(await first,['old']);assert.deepEqual(await other,['intern']);
 const fresh=await h.api.request('jobs',()=>{calls++;return ['fresh'];});assert.deepEqual(fresh,['fresh']);assert.equal(calls,2);
});
test('timeout aborts one read and a late old resolution cannot replace or cancel its retry',async()=>{
 const h=harness(),old=deferred(),fresh=deferred();let signal;
 const first=h.api.request('jobs',s=>{signal=s;return old.promise;});await tick();
 const rejected=assert.rejects(first,/timed out/);h.timeout();await rejected;assert.equal(signal.aborted,true);
 let settled=false;const retry=h.api.request('jobs',()=>fresh.promise);retry.then(()=>{settled=true;});await tick();
 old.resolve(['retired old row']);await tick();assert.equal(settled,false);
 assert.equal(h.api.request('jobs',()=>{throw Error('retry lost');}),retry);
 fresh.resolve(['current row']);assert.deepEqual(await retry,['current row']);
});
test('failed reads release their key for recovery and storage failure never blocks navigation',async()=>{
 const h=harness();await assert.rejects(h.api.request('jobs',()=>Promise.reject(Error('offline'))),/offline/);
 assert.equal(await h.api.request('jobs',()=>42),42);
 for(const method of ['getItem','setItem','removeItem'])h.root.sessionStorage[method]=()=>{throw Error('storage unavailable');};
 assert.equal(h.api.read('jobs'),null);assert.doesNotThrow(()=>h.api.save('jobs',{q:'designer'}));assert.doesNotThrow(()=>h.api.clear());
});
test('tab view restoration is bounded, owner-specific, expires and never contains a job catalog',()=>{
 const h=harness();h.local.set('su_sync_owner','"alice"');
 h.api.save('jobs',{q:'designer',cat:'Social',ws:'Remote',pr:'Any',st:'all',fr:'Any',savedOnly:true,jobs:[{private:'snapshot'}],notes:'private notes'});
 let restored=h.api.read('jobs');assert.equal(restored.state.q,'designer');assert.equal(restored.state.savedOnly,true);assert.equal(restored.y,456);
 assert.doesNotMatch(h.session.get('su_view_jobs'),/snapshot|private|notes/);
 h.local.set('su_sync_owner','"bob"');assert.equal(h.api.read('jobs'),null);
 h.local.set('su_sync_owner','"alice"');h.advance(30*60000+1);assert.equal(h.api.read('jobs'),null);
 h.api.save('jobs',{q:'new'});h.api.save('internships',{q:'summer'});h.session.set('unrelated','kept');h.api.clear();
 assert.equal(h.api.read('jobs'),null);assert.equal(h.api.read('internships'),null);assert.equal(h.session.get('unrelated'),'kept');
});
test('malformed timestamps, future receipts and invalid view fields cannot evade view expiry',()=>{
 const h=harness(),base={v:1,owner:'guest',at:h.now(),state:{q:'designer',savedOnly:false},y:7};
 for(const value of [{...base,at:'bad'},{...base,at:null},{...base,at:h.now()+1},{...base,v:2},{...base,state:null}]){
  h.session.set('su_view_jobs',JSON.stringify(value));assert.equal(h.api.read('jobs'),null);
 }
 h.session.set('su_view_jobs',JSON.stringify({...base,state:{q:'x'.repeat(201),savedOnly:'true',cat:12},y:1e9}));
 const out=h.api.read('jobs');assert.deepEqual(Object.keys(out.state),[]);assert.equal(out.y,100000);
});
