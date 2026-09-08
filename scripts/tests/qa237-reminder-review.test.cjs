const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const runtimeSource=fs.readFileSync(path.join(__dirname,'../../js/board-runtime.js'),'utf8');
const reminderSource=fs.readFileSync(path.join(__dirname,'../../js/signin-reminder.js'),'utf8');
const receipt='su_signin_reminder_v1';
function fixture(options={}){
 let now=1000,nextTimer=1,ready=options.ready!==false,signedIn=false,blocked=false,mode='normal',signins=0;
 const data=options.data||new Map(),timers=new Map(),events={},panels=[];
 const storage={getItem(key){if(mode==='throw-read')throw Error('blocked');return data.has(key)?data.get(key):null;},setItem(key,value){if(mode==='throw-write')throw Error('quota');if(mode!=='drop-write')data.set(key,String(value));},removeItem:key=>data.delete(key)};
 const document={hidden:false,querySelector(selector){if(blocked){assert.match(selector,/\.su-launch-toast/,'the actual launch toast blocks the reminder');return {}; }return null;},createElement(){const buttons={};return {setAttribute(){},querySelector(selector){return buttons[selector]||(buttons[selector]={addEventListener(type,fn){this[type]=fn;}});},remove(){const index=panels.indexOf(this);if(index>=0)panels.splice(index,1);}};},body:{appendChild(panel){panels.push(panel);}}};
 const root={document,localStorage:storage,sessionStorage:storage,Date:{now:()=>now},setTimeout(fn,delay){const id=nextTimer++;timers.set(id,{at:now+delay,fn});return id;},clearTimeout:id=>timers.delete(id),addEventListener(name,fn){(events[name]||(events[name]=[])).push(fn);},SUAuth:{measurementReady:()=>ready,signedIn:()=>signedIn,signIn:()=>signins++}};
 root.window=root;vm.runInNewContext(runtimeSource,root);vm.runInNewContext(reminderSource,root);
 function advance(ms){const end=now+ms;for(;;){const item=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;timers.delete(item[0]);now=item[1].at;item[1].fn();}now=end;}
 function event(name,value={}){for(const fn of events[name]||[])fn(value);}
 return {root,data,panels,timers,advance,event,mode:value=>mode=value,ready:value=>ready=value,block:value=>blocked=value,account(value){signedIn=!!value;if(value)data.set('su_sync_owner',value);else data.set('su_sync_owner','null');event('su:auth-changed');},confirmed(){root.SUBoardRuntime.recordApplication();root.SUSigninReminder.afterApplication();},get signins(){return signins;}};
}
test('only the third newly confirmed guest application schedules a delayed reminder',()=>{
 const f=fixture();f.data.set('su_sync_owner','null');
 assert.equal(f.root.SUBoardRuntime.owner(),'guest','serialized null is a guest');
 for(let i=0;i<2;i++){f.confirmed();f.advance(1000);assert.equal(f.panels.length,0);}
 f.confirmed();f.advance(849);assert.equal(f.panels.length,0);f.advance(1);
 assert.equal(f.panels.length,1);assert.equal(f.data.get(receipt),'shown');
 f.panels[0].querySelector('[data-signin]').click({currentTarget:{}});assert.equal(f.signins,1);
});
test('dismissal and reload preserve the one-time receipt, without refresh counting',()=>{
 const f=fixture();for(let i=0;i<3;i++)f.confirmed();f.advance(850);assert.equal(f.panels.length,1);
 f.panels[0].querySelector('[data-dismiss]').click();assert.equal(f.panels.length,0);
 f.confirmed();f.advance(2000);assert.equal(f.panels.length,0);
 const count=f.root.SUBoardRuntime.applicationCount(),reload=fixture({data:f.data});reload.advance(20000);
 assert.equal(reload.root.SUBoardRuntime.applicationCount(),count);assert.equal(reload.panels.length,0);
 reload.confirmed();reload.advance(2000);assert.equal(reload.panels.length,0);
});
test('a pre-existing application count alone never displays a reminder on startup or refresh',()=>{
 const data=new Map([['su_tracker_hint_v1',JSON.stringify({owner:'guest',count:23})]]),f=fixture({data});
 f.event('focus');f.event('su:data-sync');f.event('su:auth-changed');f.advance(30000);
 assert.equal(f.panels.length,0);assert.equal(f.root.SUBoardRuntime.applicationCount(),23);assert.equal(data.has(receipt),false);
});
test('sign-in or a cross-tab owner change cancels pending and visible reminders',()=>{
 for(const visible of [false,true]){
  const f=fixture();for(let i=0;i<3;i++)f.confirmed();if(visible)f.advance(850);
  f.account('account-a');f.advance(2000);assert.equal(f.panels.length,0);assert.equal(f.root.SUBoardRuntime.applicationCount(),0);
  f.account(null);f.advance(2000);assert.equal(f.panels.length,0,'returning to guest cannot revive a stale timer');
 }
 const f=fixture();for(let i=0;i<3;i++)f.confirmed();f.data.set('su_sync_owner','other-account');f.event('storage',{key:'su_sync_owner'});f.advance(2000);assert.equal(f.panels.length,0);
});
test('pending Google authentication never shows a guest reminder and resolved sign-in cancels it',()=>{
 const f=fixture({ready:false});for(let i=0;i<3;i++)f.confirmed();f.advance(850);assert.equal(f.panels.length,0);assert.equal(f.data.has(receipt),false);
 f.ready(true);f.account('account-a');f.advance(2000);assert.equal(f.panels.length,0);
 const guest=fixture({ready:false});for(let i=0;i<3;i++)guest.confirmed();guest.advance(850);guest.ready(true);guest.event('su:auth-changed');assert.equal(guest.panels.length,1,'confirmed signed-out readiness can finish the pending attempt');
});
test('blocked storage or a silently dropped reminder receipt stays quiet',()=>{
 for(const mode of ['throw-read','throw-write','drop-write']){
  const f=fixture();for(let i=0;i<3;i++)f.confirmed();f.mode(mode);f.advance(2000);
  assert.equal(f.panels.length,0,mode);assert.equal(f.data.has(receipt),false,mode);
 }
});
test('an overlay defers the reminder, then displays after dismissal within its bounded window',()=>{
 const f=fixture();f.block(true);for(let i=0;i<3;i++)f.confirmed();f.advance(1850);
 assert.equal(f.panels.length,0);assert.equal(f.data.has(receipt),false);f.block(false);f.advance(500);assert.equal(f.panels.length,1);
 const expired=fixture();expired.block(true);for(let i=0;i<3;i++)expired.confirmed();expired.advance(16000);expired.block(false);expired.advance(2000);
 assert.equal(expired.panels.length,0);assert.equal(expired.data.has(receipt),false);assert.equal(expired.timers.size,0);
});
test('another tab recording the reminder cancels this tab without a duplicate panel',()=>{
 const f=fixture();for(let i=0;i<3;i++)f.confirmed();f.data.set(receipt,'shown');f.event('storage',{key:receipt});f.advance(2000);assert.equal(f.panels.length,0);assert.equal(f.timers.size,0);
});
