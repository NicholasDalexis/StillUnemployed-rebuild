const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Sync=require('../../js/sync-store.js');

// Minimal DOM adapter for the real tracker module. It models replacement of
// controls and focus on innerHTML assignment; it is not a visual browser test.
function tracker(initialRows=[]) {
 const values=new Map([['su_tracker',JSON.stringify(initialRows)]]);
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const events={},windowEvents={},timers=[];let nodes=[],exportedBlob;
 const unescape=s=>String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 const emit=(type,target)=>{for(const fn of events[type]||[])fn({target,preventDefault(){},stopPropagation(){}});};
 const body={appendChild(){},removeChild(){}};const document={readyState:'loading',body,activeElement:body,
  addEventListener(type,fn){(events[type]??=[]).push(fn);},
  createElement(){return{click(){}};},
  getElementById(id){return id==='board'?board:nodes.find(n=>n.id===id)||null;}
 };
 class Control {
  constructor(tag,attrs,content='') {
   this.tagName=tag.toUpperCase();this.attrs=attrs;this.id=attrs.id||'';this.className=attrs.class||'';
   this.value=unescape(tag==='textarea'?content:attrs.value||'');this.textContent=unescape(content);
   this.selectionStart=0;this.selectionEnd=0;this.selectionDirection='none';this.scrollTop=0;this.scrollHeight=60;this.style={};
   this.classList={contains:name=>this.className.split(/\s+/).includes(name)};
  }
  getAttribute(key){return this.attrs[key]??null;}
  focus(){document.activeElement=this;emit('focusin',this);}
  setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;}
  closest(selector){return selector==='[data-act]'&&this.attrs['data-act']?this:null;}
 }
 const board={style:{setProperty(){}},contains(node){return nodes.includes(node);},
  querySelectorAll(selector){
   if(selector==='[data-id], [data-act]')return nodes.filter(n=>n.attrs['data-id']||n.attrs['data-act']);
   if(selector==='textarea.trk-notes.open')return nodes.filter(n=>n.tagName==='TEXTAREA'&&n.classList.contains('open'));
   return [];
  },
  set innerHTML(html){
   this.html=html;if(this.contains(document.activeElement))document.activeElement=body;nodes=[];
   for(const match of html.matchAll(/<(input|textarea|select|button|p)\b([^>]*)>/g)) {
    const attrs={};for(const a of match[2].matchAll(/([\w-]+)="([^"]*)"/g))attrs[a[1]]=unescape(a[2]);
    const start=match.index+match[0].length,end=html.indexOf('</'+match[1]+'>',start);
    nodes.push(new Control(match[1],attrs,match[1]==='input'?'':html.slice(start,end)));
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
  emit,runRemoval(){for(const timer of timers.splice(0))if(timer.ms===650)timer.fn();},receive(rows){const remote=Sync.merge(Sync.empty(),window.SUStore.snapshot());const now=Date.now()+10000;for(const op of Object.values(remote.tracker))op.value=null,op.at=now;for(const row of rows)remote.tracker[row.link||row.id]={value:row,at:now+1,tag:'remote'};window.SUStore.receive(remote);for(const fn of windowEvents['su:data-sync']||[])fn();},
  storageChange(key){for(const fn of windowEvents.storage||[])fn({key});},
  async exportText(){app.exportCsv();return exportedBlob.text();}
 };
}
const application={id:'existing',company:'Example',role:'Designer',link:'https://example.com/job',status:'Offer',notes:'Recruiter call Friday',dateApplied:'2026-09-05'};

test('remote sync preserves all unfinished add fields and the focused selection',()=>{
 const t=tracker();
 t.input('trk-co').value='A & B <Studio>';t.input('trk-role').value='Product designer';t.input('trk-link').value='example.com/new';
 const input=t.input('trk-role');input.focus();input.setSelectionRange(2,9,'backward');
 t.receive([application]);
 assert.equal(t.input('trk-co').value,'A & B <Studio>');assert.equal(t.input('trk-role').value,'Product designer');assert.equal(t.input('trk-link').value,'example.com/new');
 assert.notEqual(t.document.activeElement,input);assert.equal(t.document.activeElement,t.input('trk-role'));
 assert.equal(t.document.activeElement.selectionStart,2);assert.equal(t.document.activeElement.selectionEnd,9);assert.equal(t.document.activeElement.selectionDirection,'backward');
 assert.equal(t.app.rows[0].id,'existing');
});
test('notes keep focus, caret and scroll when another application arrives',()=>{
 const t=tracker([application]);const before=t.rowControl('TEXTAREA','existing');before.focus();before.setSelectionRange(5,9,'forward');before.scrollTop=12;
 t.receive([application,{...application,id:'second',link:'https://example.com/second'}]);
 const after=t.rowControl('TEXTAREA','existing');assert.equal(t.document.activeElement,after);assert.equal(after.selectionStart,5);assert.equal(after.selectionEnd,9);assert.equal(after.scrollTop,12);
 assert.equal(after.value,application.notes);
});
test('a remote note edit updates the text and safely clamps the existing selection',()=>{
 const t=tracker([application]);const before=t.rowControl('TEXTAREA','existing');before.focus();before.setSelectionRange(8,14,'forward');
 t.receive([{...application,notes:'Done'}]);
 const after=t.rowControl('TEXTAREA','existing');assert.equal(after.value,'Done');assert.equal(t.document.activeElement,after);assert.equal(after.selectionStart,4);assert.equal(after.selectionEnd,4);
});
test('a remotely removed focused application returns focus to the add control',()=>{
 const t=tracker([application]);t.rowControl('TEXTAREA','existing').focus();t.receive([]);
 assert.equal(t.document.activeElement,t.input('trk-add'));
});
test('a cross-tab look update keeps an unfinished tracker draft',()=>{
 const t=tracker();t.input('trk-co').value='Still typing';t.input('trk-co').focus();t.input('trk-co').setSelectionRange(6,6,'none');
 t.storage.setItem('su_look','poker');t.storageChange('su_look');
 assert.equal(t.input('trk-co').value,'Still typing');assert.equal(t.document.activeElement.selectionStart,6);assert.equal(t.app.look,'poker');
});
test('duplicate manual posting keeps the original application and explains why',()=>{
 const t=tracker([application]);t.input('trk-co').value='Replacement';t.input('trk-role').value='New title';t.input('trk-link').value='EXAMPLE.com/job';
 t.app.addRow();const rows=JSON.parse(t.storage.getItem('su_tracker'));
 assert.deepEqual(rows,[application]);assert.match(t.input('trk-form-feedback').textContent,/already in your tracker/);
 assert.equal(t.input('trk-co').value,'Replacement');
});
test('a new manual posting is added once and clears the completed draft',()=>{
 const t=tracker([application]);t.input('trk-co').value='New employer';t.input('trk-role').value='Designer';t.input('trk-link').value='example.com/second';
 t.app.addRow();const rows=JSON.parse(t.storage.getItem('su_tracker'));
 assert.equal(rows.length,2);assert.equal(rows.find(r=>r.link==='https://example.com/second').company,'New employer');
 assert.equal(t.input('trk-co').value,'');assert.equal(t.input('trk-role').value,'');assert.equal(t.input('trk-link').value,'');assert.equal(t.document.activeElement,t.input('trk-co'));
});
test('manual tracker addition recognizes a different URL for the same requisition without altering existing user state',()=>{
 const existing={...application,link:'https://boards.greenhouse.io/glossier/jobs/8054875'};
 const t=tracker([existing]);const before=t.storage.getItem('su_tracker');
 t.input('trk-co').value='Glossier';t.input('trk-role').value='Social Media Manager';
 t.input('trk-link').value='https://boards.greenhouse.io/glossier/jobs/8054875?gh_jid=8054875';
 t.app.addRow();assert.equal(t.storage.getItem('su_tracker'),before);
 assert.match(t.app.formMessage,/already in your tracker/);
 t.input('trk-link').value='https://boards.greenhouse.io/glossier/jobs/8077849';
 t.app.addRow();const rows=JSON.parse(t.storage.getItem('su_tracker'));
 assert.equal(rows.length,2);assert.deepEqual(rows.find(r=>r.id==='existing'),existing);
});
test('missing identity dependency prevents an unchecked linked tracker addition',()=>{
 const t=tracker();delete t.window.SUJobIdentity;
 t.input('trk-co').value='Example';t.input('trk-role').value='Role';t.input('trk-link').value='https://example.com/job';
 t.app.addRow();assert.equal(JSON.parse(t.storage.getItem('su_tracker')).length,0);
 assert.match(t.app.formMessage,/Reload and try again/);
});
test('note expansion and removal render as named native buttons',()=>{
 const t=tracker([application]);const expand=t.rowControl('BUTTON','existing','toggleNote'),remove=t.rowControl('BUTTON','existing','delRow');
 assert.equal(expand.getAttribute('type'),'button');assert.equal(expand.getAttribute('aria-label'),'Expand notes');assert.equal(remove.getAttribute('aria-label'),'Remove application');
 expand.focus();t.emit('click',expand);
 assert.equal(t.rowControl('BUTTON','existing','toggleNote').getAttribute('aria-expanded'),'true');assert.equal(t.document.activeElement,t.rowControl('BUTTON','existing','toggleNote'));
});
test('CSV export treats formula prefixes and whitespace/control-prefixed formulas as text',async()=>{
 const t=tracker();
 const cases=[['=1+1',"'=1+1"],['+1',"'+1"],['-1',"'-1"],['@A1',"'@A1"],
  ['  =1',"'  =1"],['\t+1',"'\t+1"],['\r-1','"\'\r-1"'],['\n@A1','"\'\n@A1"'],['\x01=1',"'\x01=1"],['\x85=1',"'\x85=1"]];
 t.app.rows=cases.map(([company])=>({company}));
 const text=await t.exportText();
 assert.equal(text,['Company,Role,Link,Source,Date Applied,Status,Notes',...cases.map(([,safe])=>safe+',,,,,,')].join('\r\n'));
});
test('CSV export protects every cell while retaining ordinary quotes, commas and newlines',async()=>{
 const t=tracker();t.app.rows=[{company:'=1',role:'+1',link:'@A1',source:'-1',dateApplied:' =1',status:'\t=1',notes:'=SUM(1,2)'},
  {company:'Example, Inc.',role:'Designer',link:'https://example.com/job',source:'Me',dateApplied:'2026-09-05',status:'Applied',notes:'He said "hello"\nNext step'}];
 assert.equal(await t.exportText(),[
  'Company,Role,Link,Source,Date Applied,Status,Notes',
  "'=1,'+1,'@A1,'-1,' =1,'\t=1,\"'=SUM(1,2)\"",
  '"Example, Inc.",Designer,https://example.com/job,Me,2026-09-05,Applied,"He said ""hello""\nNext step"'
 ].join('\r\n'));
 assert.equal(t.app.rows[0].company,'=1');
});

test('failed manual additions keep the complete draft and do not announce success',()=>{
 const t=tracker();const events=[];t.window.suTrack=(...args)=>events.push(args);
 t.input('trk-co').value='Draft employer';t.input('trk-role').value='Draft role';t.input('trk-link').value='example.com/new';
 const save=t.window.SUStore.saveTracker;t.window.SUStore.saveTracker=()=>{throw Error('Quota');};t.app.addRow();
 assert.equal(t.app.rows.length,0);assert.equal(t.input('trk-co').value,'Draft employer');assert.equal(t.input('trk-role').value,'Draft role');
 assert.match(t.input('trk-form-feedback').textContent,/Could not save/);assert.equal(events.length,0);
 t.window.SUStore.saveTracker=save;t.app.addRow();assert.equal(t.app.rows.length,1);assert.equal(t.input('trk-co').value,'');assert.equal(events.length,1);
});

test('failed note writes remain editable across remote refreshes and a retry persists the draft',()=>{
 const t=tracker([application]);const save=t.window.SUStore.saveTracker;const events=[];t.window.SUAnalytics={emit:name=>events.push(name)};
 t.window.SUStore.saveTracker=()=>{throw Error('Quota');};const note=t.rowControl('TEXTAREA','existing');note.value='Keep my unsaved note';note.focus();t.emit('input',note);
 assert.equal(t.window.SUStore.view().tracker[0].notes,application.notes);assert.equal(t.app.noteDrafts.existing,'Keep my unsaved note');
 assert.equal(t.input('trk-sync-retry').hidden,false);assert.equal(events.length,0);
 t.receive([application,{...application,id:'new',link:'https://example.com/new'}]);assert.equal(t.rowControl('TEXTAREA','existing').value,'Keep my unsaved note');
 t.window.SUStore.saveTracker=save;t.app.retrySave();assert.equal(t.window.SUStore.view().tracker.find(r=>r.id==='existing').notes,'Keep my unsaved note');
 assert.deepEqual(Object.keys(t.app.noteDrafts),[]);assert.equal(t.input('trk-sync-retry').hidden,true);assert.deepEqual(events,['tracker_note_edit']);
});

test('failed status writes restore the committed status and do not emit successful changes',()=>{
 const t=tracker([{...application,status:'Applied'}]);const events=[];t.window.suTrack=(...args)=>events.push(args);
 t.window.SUStore.saveTracker=()=>{throw Error('Quota');};const status=t.rowControl('SELECT','existing');status.value='Offer';t.emit('change',status);
 assert.equal(t.app.rows[0].status,'Applied');assert.equal(t.window.SUStore.view().tracker[0].status,'Applied');assert.equal(events.length,0);
 assert.match(t.input('trk-sync-feedback').textContent,/Could not save/);
});

test('an account switch clears private drafts and invalidates an already queued removal',()=>{
 const t=tracker([application]);t.window.SUStore.activate('alice');t.storageChange('su_sync_owner');
 t.input('trk-co').value='Alice unfinished draft';t.app.delRow('existing');
 t.window.SUStore.activate('bob');t.window.SUStore.saveTracker([{...application,company:'Bob own record'}]);t.storageChange('su_sync_owner');
 assert.equal(t.input('trk-co').value,'');t.runRemoval();assert.equal(t.window.SUStore.view().tracker[0].company,'Bob own record');
 assert.equal(t.app.rows.length,1);assert.equal(t.app.rows[0].company,'Bob own record');
});

test('the tracker distinguishes durable local changes from confirmed cloud sync',()=>{
 const t=tracker([application]);let state='saving',retries=0;t.window.SUAuth={signedIn:()=>true,syncState:()=>state,retrySync:()=>retries++};
 t.app.setField('existing','notes','Updated');assert.match(t.input('trk-sync-feedback').textContent,/on this device.*Syncing/);
 state='error';t.app.refreshStatus();assert.match(t.input('trk-sync-feedback').textContent,/sync paused/);assert.equal(t.input('trk-sync-retry').hidden,false);
 t.app.retrySave();assert.equal(retries,1);state='synced';t.app.refreshStatus();assert.equal(t.input('trk-sync-feedback').textContent,'Tracker synced to your account.');
});

test('a remote removal preserves a failed note as copyable text without resurrecting the application',()=>{
 const t=tracker([application]);const save=t.window.SUStore.saveTracker;t.window.SUStore.saveTracker=()=>{throw Error('Quota');};
 const note=t.rowControl('TEXTAREA','existing');note.value='Only unsaved copy';t.emit('input',note);t.window.SUStore.saveTracker=save;t.receive([]);
 assert.equal(t.window.SUStore.view().tracker.length,0);assert.match(t.board.html,/Copy your unsaved note/);assert.match(t.board.html,/Only unsaved copy/);
 assert.equal(t.input('trk-sync-retry').hidden,true);t.app.retrySave();assert.equal(t.window.SUStore.view().tracker.length,0);
 t.emit('click',t.rowControl('BUTTON','existing','dismissDraft'));assert.doesNotMatch(t.board.html,/Only unsaved copy/);
});
