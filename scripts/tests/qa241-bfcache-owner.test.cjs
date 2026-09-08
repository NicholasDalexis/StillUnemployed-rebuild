const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
function helpers(name,exports,transform=source=>source){
 const fixture=path.join(__dirname,name),source=fs.readFileSync(fixture,'utf8');
 const first=source.indexOf('\ntest(');assert(first>0);
 const module={exports:{}};
 vm.runInNewContext(transform(source.slice(0,first))+'\nmodule.exports={'+exports+'};',{
  module,require:createRequire(fixture),__dirname,Buffer,Blob,URL,URLSearchParams,setImmediate,clearTimeout,console
 },{filename:fixture});
 return module.exports;
}
const {board,job}=helpers('board-qa.test.cjs','board,job');
const {tracker}=helpers('tracker-native-select.test.cjs','tracker',source=>{
 const revised=source.replace('return {app,storage,document,board,window,',
  'return {fireWindow(name,event){for(const fn of windowEvents[name]||[])fn(event);},app,storage,document,board,window,');
 assert.notEqual(revised,source);return revised;
});

test('BFCache return rechecks ownership before painting, even without an auth/storage callback or a due feed request',async()=>{
 for(const priorSection of ['jobs','tracker']){
  const b=board(),session=new Map();b.localStorage.setItem('su_sync_owner','"alice"');
  Object.assign(b.window,{localStorage:b.localStorage,sessionStorage:{getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)},setTimeout,clearTimeout});
  const store=b.window.SUStore=require('../../js/sync-store.js').create(b.localStorage);
  store.saveSaved({[job().link]:true},job());
  b.window.SUBoardRuntime=require('../../js/board-runtime.js')(b.window);
  await b.boot();b.app.setState({q:'Alice private query',cat:'Social',st:'NY',savedOnly:true});
  b.fireWindow('pagehide');
  b.localStorage.setItem('su_sync_owner','"bob"'); // Change while the original page is suspended.
  b.window.SUBoardRuntime.enterSection(priorSection);
  b.fireWindow('pageshow',{persisted:true});
  assert.equal(b.app.state.q,'',priorSection);assert.equal(b.app.state.cat,'all');assert.equal(b.app.state.st,'all');assert.equal(b.app.state.savedOnly,false);
  assert.equal(Object.keys(b.app.state.saved).length,0,'the stale account store cannot expose Alice bookmarks');
  assert.equal(b.document.getElementById('su-search').value,'','visible query clears on the same restored turn');
  assert.doesNotMatch(b.grid.textContent,/Saved Section/);assert.equal(b.requests.length,1,'the test is inside the background refresh throttle');
  assert.equal(b.window.SUBoardRuntime.read('jobs'),null);
 }
});

test('Tracker BFCache return preserves a same-owner native control but refreshes previous-owner rows immediately',()=>{
 const alice={id:'same-row-id',company:'Alice private employer',role:'Designer',link:'https://example.com/alice',status:'Interview 1',notes:'Alice private notes',dateApplied:'2026-09-08'};
 const t=tracker([alice]);t.window.SUStore.activate('alice');t.storageChange('su_sync_owner');
 const select=t.rowControl('SELECT','same-row-id');select.focus();
 t.fireWindow('pageshow',{persisted:true});assert.equal(t.rowControl('SELECT','same-row-id'),select);assert.equal(select.focusCalls,1);
 t.window.SUStore.activate('bob');t.window.SUStore.saveTracker([{...alice,company:'Bob employer',link:'https://example.com/bob',notes:'Bob notes',status:'Applied'}]);
 t.fireWindow('pageshow',{persisted:true});
 assert.equal(t.app.rows[0].company,'Bob employer');assert.equal(t.rowControl('TEXTAREA','same-row-id').value,'Bob notes');
 assert.equal(t.rowControl('SELECT','same-row-id').value,'Applied');assert.notEqual(t.rowControl('SELECT','same-row-id'),select);
 assert.doesNotMatch(t.board.html,/Alice private/);assert.equal(t.document.activeElement,t.document.body);
});
