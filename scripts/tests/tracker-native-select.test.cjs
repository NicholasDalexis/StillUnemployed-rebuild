const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Sync=require('../../js/sync-store.js');

// Native-select lifecycle adapter for the real tracker and store modules.
// Element identity, focus calls and committed values are observable independently
// from generated HTML. A separate browser receipt covers actual DOM behavior.
function tracker(initialRows=[]) {
 const values=new Map([['su_tracker',JSON.stringify(initialRows)]]);
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const events={},windowEvents={},timers=[];let nodes=[],exportedBlob,remoteClock=0;
 const unescape=s=>String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 const emit=(type,target,extra={})=>{const event={target,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...extra};for(const fn of events[type]||[])fn(event);return event;};
 const body={appendChild(){},removeChild(){}};const document={readyState:'loading',body,activeElement:body,
  addEventListener(type,fn){(events[type]??=[]).push(fn);},
  createElement(){return{click(){}};},
  getElementById(id){return id==='board'?board:nodes.find(n=>n.id===id)||null;}
 };
 class Control {
  constructor(tag,attrs,content='') {
   this.tagName=tag.toUpperCase();this.attrs=attrs;this.id=attrs.id||'';this.className=attrs.class||'';
   const selected=tag==='select'&&content.match(/<option value="([^"]+)" selected/);
   this.value=unescape(tag==='textarea'?content:selected?selected[1]:attrs.value||'');this.textContent=unescape(content);
   this.selectionStart=0;this.selectionEnd=0;this.selectionDirection='none';this.scrollTop=0;this.scrollHeight=60;this.style={};
   this.classList={contains:name=>this.className.split(/\s+/).includes(name)};
  }
  getAttribute(key){return this.attrs[key]??null;}
  showModal(){this.open=true;this.modal=true;}
  querySelectorAll(selector){return selector==='button:not(:disabled)'?nodes.filter(n=>n.tagName==='BUTTON'&&n.start>this.start&&n.end<this.end&&n.attrs.disabled===undefined):[];}
  focus(){this.focusCalls=(this.focusCalls||0)+1;document.activeElement=this;emit('focusin',this);}
  setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;}
  closest(selector){return selector==='[data-act]'&&this.attrs['data-act']?this:null;}
 }
 const board={style:{setProperty(){}},contains(node){return nodes.includes(node);},
  querySelectorAll(selector){
   if(selector==='[data-id], [data-act]')return nodes.filter(n=>n.attrs['data-id']||n.attrs['data-act']);
   if(selector==='select.trk-status')return nodes.filter(n=>n.tagName==='SELECT'&&n.classList.contains('trk-status'));
   if(selector==='textarea.trk-notes')return nodes.filter(n=>n.tagName==='TEXTAREA'&&n.classList.contains('trk-notes'));
   return [];
  },
  set innerHTML(html){
   this.html=html;if(this.contains(document.activeElement))document.activeElement=body;nodes=[];
   for(const match of html.matchAll(/<(input|textarea|select|button|p|dialog|b)\b([^>]*)>/g)) {
    const attrs={};for(const a of match[2].matchAll(/([\w-]+)="([^"]*)"/g))attrs[a[1]]=unescape(a[2]);
    const start=match.index+match[0].length,end=html.indexOf('</'+match[1]+'>',start);
    const node=new Control(match[1],attrs,match[1]==='input'?'':html.slice(start,end));node.start=match.index;node.end=end;nodes.push(node);
   }
  }
 };
 const window={addEventListener(type,fn){(windowEvents[type]??=[]).push(fn);},matchMedia(){return{matches:true};}};
 window.SUStore=Sync.create(storage);
 window.SUJobIdentity=require('../../js/job-identity.js');
 class TestURL extends URL {}
 TestURL.createObjectURL=blob=>{exportedBlob=blob;return'blob:tracker-test';};TestURL.revokeObjectURL=()=>{};
 const context={window,document,localStorage:storage,URL:TestURL,Blob,Date,console,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout,location:{href:''}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../js/tracker.js'),'utf8'),context);
 const app=window.SUTracker;app.init();
 return {app,storage,document,board,window,input:id=>document.getElementById(id),
  rowControl:(tag,id,act)=>nodes.find(n=>n.tagName===tag&&n.getAttribute('data-id')===id&&(!act||n.getAttribute('data-act')===act)),
  emit,runRemoval(){for(const timer of timers.splice(0))if(timer.ms===650)timer.fn();},receive(rows){const remote=Sync.merge(Sync.empty(),window.SUStore.snapshot());const now=remoteClock=Math.max(Date.now()+10000,remoteClock+2);for(const op of Object.values(remote.tracker))op.value=null,op.at=now;for(const row of rows)remote.tracker[row.link||row.id]={value:row,at:now+1,tag:'remote'};window.SUStore.receive(remote);for(const fn of windowEvents['su:data-sync']||[])fn();},
  fire(name){for(const fn of windowEvents[name]||[])fn();},
  storageChange(key){for(const fn of windowEvents.storage||[])fn({key});},
  resize(){for(const fn of windowEvents.resize||[])fn();},
  async exportText(){app.exportCsv();return exportedBlob.text();}
 };
}
const application={id:'existing',company:'Example',role:'Designer',link:'https://example.com/job',status:'Offer',notes:'Recruiter call Friday',dateApplied:'2026-09-05'};


test('repeated status choices keep one native select and focus while updating saved values, colors and summary counts',()=>{
 const t=tracker([{...application,status:'Applied'}]);
 const control=t.rowControl('SELECT','existing');control.focus();
 const measurements=[];t.window.suTrack=(...args)=>measurements.push(args);
 for(const [status,klass,interviews,offers] of [
  ['Interview 1','st-int','1','0'],['Interview 2','st-int','1','0'],
  ['Offer','st-offer','0','1'],['Applied','st-applied','0','0']
 ]) {
  control.value=status;t.emit('change',control);
  assert.equal(t.rowControl('SELECT','existing'),control,status+' retains its native control');
  assert.equal(t.document.activeElement,control);assert.equal(control.focusCalls,1,'no replacement refocus');
  assert.equal(control.value,status);assert.equal(t.window.SUStore.view().tracker[0].status,status);
  assert.equal(control.classList.contains(klass),true);
  assert.equal(t.input('trk-count-total').textContent,'1');
  assert.equal(t.input('trk-count-interviews').textContent,interviews);assert.equal(t.input('trk-count-offers').textContent,offers);
 }
 assert.deepEqual(measurements.map(args=>args[2]),['Interview 1','Interview 2','Offer','Applied']);
});

test('same-owner auth, sync and cross-tab echoes preserve an open picker and an uncommitted selection',()=>{
 const t=tracker([{...application,status:'Interview 1'}]);const control=t.rowControl('SELECT','existing');control.focus();
 control.value='Interview 2'; // Native UI has moved but has not emitted change yet.
 for(const name of ['su:auth-changed','su:data-sync']) t.fire(name);
 t.storageChange('su_tracker');t.storageChange('su_sync_owner');
 assert.equal(t.rowControl('SELECT','existing'),control);assert.equal(control.focusCalls,1);
 assert.equal(control.value,'Interview 2');assert.equal(t.window.SUStore.view().tracker[0].status,'Interview 1');
 t.emit('change',control);assert.equal(t.window.SUStore.view().tracker[0].status,'Interview 2');
});

test('a remote status-only change updates the existing native control without a new focus call',()=>{
 const t=tracker([{...application,status:'Applied'}]);const control=t.rowControl('SELECT','existing');control.focus();
 t.receive([{...application,status:'Interview 3',updated:'2026-09-08T13:00:00Z'}]);
 assert.equal(t.rowControl('SELECT','existing'),control);assert.equal(t.document.activeElement,control);assert.equal(control.focusCalls,1);
 assert.equal(control.value,'Interview 3');assert.equal(control.classList.contains('st-int'),true);
 assert.equal(t.input('trk-count-interviews').textContent,'1');assert.equal(t.input('trk-count-offers').textContent,'0');
});

test('failed status persistence restores the committed value without replacing or refocusing the native select',()=>{
 const t=tracker([{...application,status:'Interview 1'}]);const control=t.rowControl('SELECT','existing');control.focus();
 const measurements=[];t.window.suTrack=(...args)=>measurements.push(args);
 t.window.SUStore.saveTracker=()=>{throw Error('Quota exceeded');};
 control.value='Offer';t.emit('change',control);
 assert.equal(t.rowControl('SELECT','existing'),control);assert.equal(t.document.activeElement,control);assert.equal(control.focusCalls,1);
 assert.equal(control.value,'Interview 1');assert.equal(t.window.SUStore.view().tracker[0].status,'Interview 1');
 assert.match(t.input('trk-sync-feedback').textContent,/Could not save/);assert.deepEqual(measurements,[]);
 assert.equal(t.input('trk-count-interviews').textContent,'1');assert.equal(t.input('trk-count-offers').textContent,'0');
});

test('a real row-content change still refreshes displayed notes and preserves unfinished add fields',()=>{
 const t=tracker([application]);const control=t.rowControl('SELECT','existing');control.focus();
 t.input('trk-co').value='Unfinished company';
 t.receive([{...application,notes:'New interview details'}]);
 assert.notEqual(t.rowControl('SELECT','existing'),control);assert.equal(t.rowControl('TEXTAREA','existing').value,'New interview details');
 assert.equal(t.input('trk-co').value,'Unfinished company');assert.equal(t.document.activeElement,t.rowControl('SELECT','existing'));
 t.receive([]);assert.equal(t.document.activeElement,t.input('trk-add'));assert.equal(t.input('trk-count-total').textContent,'0');
});

test('an old native change event cannot write into a newly active account with the same row id',()=>{
 const t=tracker([application]);t.window.SUStore.activate('alice');t.storageChange('su_sync_owner');
 const control=t.rowControl('SELECT','existing');control.focus();
 t.window.SUStore.activate('bob');t.window.SUStore.saveTracker([{...application,company:'Bob own record',status:'Applied'}]);
 const measurements=[];t.window.suTrack=(...args)=>measurements.push(args);
 control.value='Interview 2';t.emit('change',control);
 assert.equal(t.window.SUStore.view().tracker[0].status,'Applied');assert.equal(t.window.SUStore.view().tracker[0].company,'Bob own record');
 assert.deepEqual(measurements,[]);assert.notEqual(t.rowControl('SELECT','existing'),control);
 assert.equal(t.document.activeElement,t.document.body);
});

test('a detached native select cannot persist its queued change after a structural refresh',()=>{
 const t=tracker([application]);const stale=t.rowControl('SELECT','existing');
 t.receive([{...application,notes:'Updated remotely',status:'Interview 1'}]);
 const current=t.rowControl('SELECT','existing');assert.notEqual(current,stale);
 stale.value='Offer';t.emit('change',stale);
 assert.equal(t.window.SUStore.view().tracker[0].status,'Interview 1');assert.equal(t.rowControl('SELECT','existing'),current);
 assert.equal(current.value,'Interview 1');
});
