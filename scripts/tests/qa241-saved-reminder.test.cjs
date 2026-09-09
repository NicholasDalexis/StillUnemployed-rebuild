const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
function fixture(){
 let now=0,next=0,blocked=false;const data=new Map(),timers=new Map(),events={},panels=[];
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const control={focused:false,scrolled:false,focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;}};
 const document={hidden:false,querySelector(s){return s==='[data-act="toggleSavedOnly"]'?control:blocked?{}:null;},body:{appendChild:p=>panels.push(p)},createElement(){const buttons={};return{setAttribute(){},querySelector(s){return buttons[s]||(buttons[s]={addEventListener(k,fn){this[k]=fn;}});},remove(){const i=panels.indexOf(this);if(i>=0)panels.splice(i,1);}};}};
 const root={document,localStorage:storage,sessionStorage:storage,Date:{now:()=>now},setTimeout(fn,ms){const id=++next;timers.set(id,{at:now+ms,fn});return id;},clearTimeout:id=>timers.delete(id),addEventListener(k,f){(events[k]||=[]).push(f);},SUApp:{state:{savedOnly:false,saved:{one:true}},setState(value){Object.assign(this.state,value);}}};root.window=root;
 for(const file of ['board-runtime.js','saved-reminder.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../js',file),'utf8'),root);
 function advance(ms){const end=now+ms;for(;;){const item=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;timers.delete(item[0]);now=item[1].at;item[1].fn();}now=end;}
 return{root,data,panels,control,advance,block:v=>blocked=v,event(k,v={}){for(const f of events[k]||[])f(v);}};
}
test('saved reminder is quiet until a cadence save, opens Saved and preserves bookmarks',()=>{
 const f=fixture();f.advance(10000);assert.equal(f.panels.length,0);
 f.root.SUSavedReminder.afterSave();f.advance(849);assert.equal(f.panels.length,0);f.advance(1);assert.equal(f.panels.length,1);assert.match(f.panels[0].innerHTML,/Save for Later/);
 f.panels[0].querySelector('.su-saved-shortcut').click();assert.equal(f.panels.length,0);assert.equal(f.root.SUApp.state.savedOnly,true);assert.equal(f.root.SUApp.state.saved.one,true);assert(f.control.focused&&f.control.scrolled);
 f.root.SUApp.state.savedOnly=false;for(let i=2;i<=5;i++){f.root.SUSavedReminder.afterSave();f.advance(850);assert.equal(f.panels.length,i===5?1:0);}
 f.advance(9000);assert.equal(f.panels.length,0);
});
test('saved reminder defers to overlays and existing hints, expires and skips an empty Saved list',()=>{
 const f=fixture();f.block(true);f.root.SUSavedReminder.afterSave();f.advance(2000);assert.equal(f.panels.length,0);f.block(false);f.advance(500);assert.equal(f.panels.length,1);
 const expired=fixture();expired.block(true);expired.root.SUSavedReminder.afterSave();expired.advance(16000);expired.block(false);expired.advance(1000);assert.equal(expired.panels.length,0);
 const empty=fixture();empty.root.SUSavedReminder.afterSave();empty.root.SUApp.state.saved={};empty.advance(850);assert.equal(empty.panels.length,0);
});
test('account changes, navigation and dismissal cancel pending or visible saved hints',()=>{
 for(const visible of [false,true])for(const event of ['su:auth-changed','pagehide','storage']){
  const f=fixture();f.root.SUSavedReminder.afterSave();if(visible)f.advance(850);f.event(event,{key:'su_sync_owner'});f.advance(1000);assert.equal(f.panels.length,0,event);
 }
 const f=fixture();f.root.SUSavedReminder.afterSave();f.data.set('su_sync_owner','another');f.advance(850);assert.equal(f.panels.length,0);
 const dismiss=fixture();dismiss.root.SUSavedReminder.afterSave();dismiss.advance(850);dismiss.panels[0].querySelector('[data-dismiss]').click();assert.equal(dismiss.panels.length,0);
});
// Exercise actual save outcome and BFCache handler in the established board DOM fixture.
const fixturePath=path.join(__dirname,'board-qa.test.cjs'),source=fs.readFileSync(fixturePath,'utf8');
const exported={exports:{}};vm.runInNewContext(source.slice(0,source.indexOf('\ntest('))+'\nmodule.exports={board,job};',{module:exported,require:createRequire(fixturePath),__dirname,Buffer,URL,URLSearchParams,setImmediate},{filename:fixturePath});
const{board,job}=exported.exports;
test('only successful new saves request a reminder, never unsaves or failed saves',()=>{
 const b=board();let hints=0;b.window.SUSavedReminder={afterSave(){hints++;}};b.init();
 b.app.toggleSave(job().link);assert.equal(hints,1);b.app.toggleSave(job().link);assert.equal(hints,1);
 b.window.SUStore={saveSaved(){throw Error('quota');}};assert.equal(b.app.toggleSave(job().link),false);assert.equal(hints,1);assert.equal(b.app.isSaved(job().link),false);
});
test('BFCache section return refreshes the rendered Saved grid even after navigation cleared its state',async()=>{
 const b=board();let section='jobs';b.window.SUBoardRuntime={request:(_k,load)=>load(),read:()=>null,enterSection(s){const changed=section!==s;section=s;return changed;},save(){},clearSavedViews(){}};
 await b.boot();b.app.state.saved={[job().link]:true};b.app.setState({savedOnly:true});assert.match(b.grid.textContent,/Saved Section/);
 b.app.state.savedOnly=false;section='tracker';b.fireWindow('pageshow',{persisted:true});assert.equal(b.app.state.savedOnly,false);assert.doesNotMatch(b.grid.textContent,/Saved Section/);assert.equal(b.app.isSaved(job().link),true);
});
