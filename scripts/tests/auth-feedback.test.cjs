const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');

// Reuse the board's offline DOM adapter. Both real scripts run; only Firebase
// loading and browser services are mocked. No account, network or site data writes.
const fixturePath=path.join(__dirname,'board-qa.test.cjs');
const fixtureSource=fs.readFileSync(fixturePath,'utf8');
const firstTest=fixtureSource.indexOf('\ntest(');
assert(firstTest>0);
const fixtureModule={exports:{}};
vm.runInNewContext(fixtureSource.slice(0,firstTest).replace('return{app:window.SUApp','return{window,app:window.SUApp')+'\nmodule.exports={board,job};',{
  require:createRequire(fixturePath),module:fixtureModule,__dirname,
  Buffer,URL,URLSearchParams,setImmediate
},{filename:fixturePath});
const {board,job}=fixtureModule.exports;
const authSource=fs.readFileSync(path.join(__dirname,'../../js/auth.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const redirectKey='su_feedback_auth_redirect_v1';
function tabStorage(data=new Map()) { return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)}; }

async function feedbackUI(options={}) {
  const b=board();
  b.window.sessionStorage=options.tabStorage||tabStorage();
  const proto=Object.getPrototypeOf(b.document.body);
  Object.defineProperties(proto,{
    nodeType:{get(){return 1;}},
    dataset:{get(){const self=this;return new Proxy({}, {set(_obj,key,value){self.setAttribute('data-'+key,value);return true;},get(_obj,key){return self.getAttribute('data-'+key);}});}},
    hidden:{get(){return this.getAttribute('hidden')!==null;},set(value){value?this.setAttribute('hidden',''):this.removeAttribute('hidden');}},
    disabled:{get(){return this.getAttribute('disabled')!==null;},set(value){value?this.setAttribute('disabled',''):this.removeAttribute('disabled');if(value&&b.document.activeElement===this)b.document.activeElement=b.document.body;}}
  });
  proto.getClientRects=function(){for(let el=this;el;el=el.parentElement)if(el.hidden||el.style.display==='none')return[];return[{}];};
  proto.click=function(){
    if(this.disabled)return;
    const event={target:this,preventDefault(){},stopPropagation(){this.stopped=true;}};
    for(let el=this;el;el=el.parentElement)for(const fn of el.listeners.click||[]){event.currentTarget=el;fn(event);}
    if(!event.stopped)b.fire('click',this);
  };
  b.init([job()]);
  function open(){b.app.setState({detailOpen:false,feedbackOpen:true,feedbackCo:'Example',feedbackLink:'https://example.com/job'});}
  open();
  b.document.readyState='complete';
  const calls={imports:0,popups:0,redirects:0,alerts:[],confirms:0,syncs:0,signouts:0,events:[],initializations:0};
  const timers=new Map(),windowEvents={};let timerID=0,resolveSignout,rejectSignout,syncCallback;
  let authListener,mutationListener,owner=null,resolvePopup,rejectPopup,releaseSdk;
  const sdkGate=options.deferSdk?new Promise(resolve=>{releaseSdk=resolve;}):Promise.resolve();
  const store={owner:()=>owner,current:()=>options.cacheCurrent!==false,ownershipCurrent:()=>options.ownerMatches!==false,activate(value){owner=value;options.cacheCurrent=true;options.ownerMatches=true;b.app.render();if(mutationListener)mutationListener([{addedNodes:[b.grid]}]);}};
  const sdk={getAuth:()=>({}),GoogleAuthProvider:function GoogleAuthProvider(){},
    getRedirectResult:async()=>null,
    onAuthStateChanged(_auth,fn){authListener=fn;fn(options.initialUser||null);},
    signInWithPopup(){calls.popups++;return options.popupError?Promise.reject({code:options.popupError}):new Promise((resolve,reject)=>{resolvePopup=resolve;rejectPopup=reject;});},
    signInWithRedirect:async()=>{calls.redirects++;if(options.redirectError)throw{code:options.redirectError};},signOut:()=>{calls.signouts++;return new Promise((resolve,reject)=>{resolveSignout=resolve;rejectSignout=reject;});}
  };
  const window={SUApp:b.app,SUStore:store,SUAnalytics:{emit:(name,payload)=>calls.events.push({name,payload})},addEventListener(name,fn){(windowEvents[name]??=[]).push(fn);},SUSync:{connect(_store,_adapter,status){calls.syncs++;syncCallback=status;status(options.syncFailure?'error':'synced');return{stop(){},queue(){}};}}};
  const hostname=options.hostname||'preview--stillunemployed.netlify.app';
  vm.runInNewContext(authSource.replace(/import\((['"])([^'"]+)\1\)/g,'__loadSdk($1$2$1)'),{
    location:{hostname,host:hostname},window,document:b.document,
    setTimeout:options.manualTimers?(fn,ms)=>{const id=++timerID;timers.set(id,{fn,ms});return id;}:setTimeout,clearTimeout:options.manualTimers?id=>timers.delete(id):clearTimeout,
    console:{warn(){}},alert:message=>calls.alerts.push(message),confirm:()=>{calls.confirms++;return !!options.confirm;},
    MutationObserver:class{constructor(fn){mutationListener=fn;}observe(){}},
    __loadSdk:async url=>{
      calls.imports++;await sdkGate;if(options.sdkFailure)throw Error('offline SDK');
      return url.endsWith('firebase-app.js')?{initializeApp:()=>{calls.initializations++;return {};}}:url.endsWith('firebase-auth.js')?sdk:{getFirestore:()=>({}),doc:()=>({})};
    }
  },{filename:'js/auth.js'});
  await tick();await tick();
  const slot=()=>b.overlay.querySelector('.su-feedback-account');
  const google=()=>slot().querySelector('.su-auth-button');
  const close=()=>slot().querySelector('.su-feedback-close');
  const notify=node=>mutationListener&&mutationListener([{addedNodes:[node]}]);
  return{b,calls,slot,google,close,open,notify,releaseSdk,tabStorage:b.window.sessionStorage,auth:window.SUAuth,
    nav:()=>b.grid.querySelector('.su-auth-button'),
    bootTimeout(){for(const t of timers.values())if(t.ms===20000)t.fn();},
    syncStatus(next){syncCallback(next);},fireWindow(name,event={}){for(const fn of windowEvents[name]||[])fn(event);},
    finishSignout(){authListener(null);resolveSignout();},failSignout(){rejectSignout(Error('offline'));},
    signIn(user){authListener(user);},finishPopup(){if(resolvePopup)resolvePopup();},
    failPopup(code){rejectPopup({code});},
    dialog:()=>b.overlay.querySelector('[role="dialog"]')};
}

test('signed-out feedback uses the existing Google popup action and changes to X without replacing the note',async()=>{
  const ui=await feedbackUI();const {b}=ui;
  const note=ui.dialog(),google=ui.google(),applied=note.querySelector('[data-act="markApplied"]');
  assert.equal(google.hidden,false);assert.equal(ui.close().hidden,true);
  assert.equal(google.getAttribute('aria-label'),'Sign in with Google');
  assert.equal(google.getAttribute('title'),null);assert.equal(google.getAttribute('data-su-help'),'Sign in to keep your saved jobs and tracker together.');
  assert.equal(google.disabled,false);
  google.focus();google.click();assert.equal(ui.calls.popups,1);
  assert.equal(google.disabled,true);assert.equal(b.app.state.feedbackOpen,true);
  assert.equal(ui.dialog(),note,'click does not open a second product modal');
  const writes=b.overlay.writes;
  ui.signIn({uid:'mock-user',email:'mock@example.invalid'});ui.finishPopup();await tick();
  assert.equal(ui.dialog(),note,'account activation refreshes the board but preserves its note');
  assert.equal(b.overlay.writes,writes);
  assert.equal(note.querySelector('[data-act="markApplied"]'),applied);
  assert.equal(google.hidden,true);assert.equal(ui.close().hidden,false);
  assert.equal(b.document.activeElement,ui.close());
  assert.equal(b.app.state.feedbackLink,'https://example.com/job');
  ui.close().click();assert.equal(b.app.state.feedbackOpen,false);
  assert.equal(ui.calls.confirms,0);
});

test('all three feedback responses work while signed out without opening Google',async()=>{
  for(const response of ['markApplied','reportBroken','notFit']){
    const ui=await feedbackUI();const {b}=ui;
    const action=ui.dialog().querySelector('[data-act="'+response+'"]');
    action.click();assert.equal(b.app.state.feedbackOpen,false,response+' closes normally');
    assert.equal(ui.calls.popups,0);assert.equal(ui.calls.redirects,0);
    if(response==='markApplied')assert.equal(JSON.parse(b.localStorage.getItem('su_tracker'))[0].link,'https://example.com/job');
    if(response==='reportBroken')assert.equal(b.app.jobs.length,0);
  }
});

test('late sign-in completion neither reopens dismissed feedback nor steals focus from a response',async()=>{
  for(const dismiss of [false,true]){
    const ui=await feedbackUI();const applied=ui.dialog().querySelector('[data-act="markApplied"]');
    ui.google().focus();ui.google().click();
    if(dismiss)ui.b.fire('keydown',ui.dialog(),{key:'Escape'});else applied.focus();
    ui.signIn({uid:'late-user'});ui.finishPopup();await tick();
    assert.equal(ui.b.app.state.feedbackOpen,!dismiss);
    if(dismiss)assert.equal(ui.dialog(),null);else assert.equal(ui.b.document.activeElement,applied);
  }
});

test('Escape and backdrop close the signed-out note while clicking inside keeps it open',async()=>{
  const ui=await feedbackUI();const {b}=ui;
  ui.dialog().click();assert.equal(b.app.state.feedbackOpen,true);
  b.fire('keydown',ui.dialog(),{key:'Escape'});assert.equal(b.app.state.feedbackOpen,false);
  ui.open();ui.notify(b.overlay);b.overlay.children[0].click();assert.equal(b.app.state.feedbackOpen,false);
  assert.equal(ui.calls.popups,0);
});

test('cancelled Google popups restore the optional control and leave every response available',async()=>{
  for(const popupError of ['auth/popup-closed-by-user','auth/cancelled-popup-request']){
    const ui=await feedbackUI({popupError});const note=ui.dialog();ui.google().focus();ui.google().click();await tick();
    assert.equal(ui.dialog(),note);assert.equal(ui.google().disabled,false);assert.equal(ui.google().hidden,false);
    assert.equal(ui.b.document.activeElement,ui.google());
    assert.equal(ui.calls.alerts.length,0);assert.equal(ui.calls.redirects,0);
    note.querySelector('[data-act="markApplied"]').click();assert.equal(ui.b.app.state.feedbackOpen,false);
  }
});

test('Google failures and unsupported popup environments reuse existing recovery without gating feedback',async()=>{
  for(const popupError of ['auth/unauthorized-domain','auth/popup-blocked','auth/operation-not-supported-in-this-environment']){
    const ui=await feedbackUI({popupError});const note=ui.dialog();ui.google().click();await tick();await tick();
    assert.equal(ui.dialog(),note);assert.equal(ui.google().disabled,false);
    assert.equal(ui.calls.redirects,popupError==='auth/unauthorized-domain'?0:1);
    assert.equal(ui.calls.alerts.length,0);
    if(popupError==='auth/unauthorized-domain')assert.match(ui.slot().querySelector('.su-auth-feedback').textContent,/could not finish/);
    ui.b.fire('keydown',note,{key:'Escape'});assert.equal(ui.b.app.state.feedbackOpen,false);
  }
});

test('loading, unavailable SDK and production auth gates retain the visible fallback X',async()=>{
  for(const options of [{deferSdk:true},{sdkFailure:true},{hostname:'stillunemployed.com'},{hostname:'www.stillunemployed.com'}]){
    const ui=await feedbackUI(options);
    assert.equal(!!ui.close().hidden,false);assert.equal(ui.close().disabled,false);
    assert(!ui.google()||ui.google().hidden);
    if(options.hostname)assert.equal(ui.calls.imports,0);
    if(options.deferSdk){ui.close().focus();ui.releaseSdk();await tick();await tick();assert.equal(ui.b.document.activeElement,ui.google());}
    ui.b.fire('keydown',ui.dialog(),{key:'Escape'});assert.equal(ui.b.app.state.feedbackOpen,false);
  }
});

test('already signed-in and newly mounted feedback slots show X; observer mounts once without loops',async()=>{
  const ui=await feedbackUI({initialUser:{uid:'existing-user'}});
  assert.equal(ui.google().hidden,true);assert.equal(ui.close().hidden,false);
  ui.close().click();ui.open();ui.notify(ui.b.overlay);
  const google=ui.google(),slot=ui.slot();assert.equal(google.hidden,true);assert.equal(ui.close().hidden,false);
  ui.notify(slot);ui.notify(google);ui.notify(google.querySelector('svg'));
  assert.equal(slot.querySelectorAll('.su-auth-button').length,1);assert.equal(ui.google(),google);
  ui.close().focus();ui.signIn(null);assert.equal(ui.google().hidden,false);assert.equal(ui.b.document.activeElement,google);
});

function reloadBoard(storage) {
  const next=board();next.window.sessionStorage=storage;
  let welcomeAttempts=0;next.window.SUWelcome={maybeShow(){welcomeAttempts++;}};
  next.init([job()]);return{...next,welcomeAttempts};
}

test('only feedback redirect fallback stores the canonical question, then a fresh board restores it exactly once',async()=>{
  const ui=await feedbackUI({popupError:'auth/popup-blocked'});
  assert.equal(ui.tabStorage.getItem(redirectKey),null,'ordinary opening stores nothing');
  ui.b.app.jobs[0].co='  Example   Inc  ';
  ui.b.app.jobs[0]._aliases=['https://example.com/job','https://example.com/alias'];
  ui.b.app.state.feedbackLink='https://example.com/alias';
  assert.equal(ui.b.document.activeElement,ui.dialog(),'a pointer click need not focus Google');
  ui.google().click();await tick();await tick();
  assert.equal(ui.calls.redirects,1);
  const pending=JSON.parse(ui.tabStorage.getItem(redirectKey));
  assert.deepEqual(Object.keys(pending).sort(),['at','co','link','v']);
  assert.equal(pending.co,'Example Inc');assert.equal(pending.link,'https://example.com/job');
  const next=reloadBoard(ui.tabStorage);
  assert.equal(next.app.state.feedbackOpen,true);assert.equal(next.app.state.feedbackCo,'Example Inc');
  assert.equal(next.app.state.feedbackLink,'https://example.com/job');
  assert.equal(next.overlay.querySelector('[role="dialog"]').getAttribute('aria-label'),'Application feedback');
  assert.equal(next.welcomeAttempts,0,'welcome does not cover the restored question');
  assert.equal(ui.tabStorage.getItem(redirectKey),null,'consumed before showing');
  assert.equal(reloadBoard(ui.tabStorage).app.state.feedbackOpen,false,'later reload does not repeat');
});

test('expired, future, malformed and unsafe feedback redirect receipts are removed without reopening',()=>{
  const valid={v:1,at:Date.now(),co:'Example',link:'https://example.com/job'};
  const invalid=['','not JSON','null',...[
    {v:2},{at:Date.now()-600001},{at:Date.now()+60000},{at:'now'},
    {co:''},{co:'x'.repeat(201)},{link:'javascript:alert(1)'},
    {link:'https://user:pass@example.com/job'},{link:'https://example.com/'+'x'.repeat(4096)}
  ].map(patch=>JSON.stringify({...valid,...patch}))];
  for(const raw of invalid){
    const storage=tabStorage(new Map([[redirectKey,raw]]));
    assert.equal(reloadBoard(storage).app.state.feedbackOpen,false,raw.slice(0,80));
    assert.equal(storage.getItem(redirectKey),null);
  }
});

test('failed or silently blocked redirect receipt writes keep feedback in place; navigation redirect stays independent',async()=>{
  for(const storage of [
    {...tabStorage(),setItem(){throw Error('storage blocked');}},
    {...tabStorage(),setItem(){}},
    {...tabStorage(),getItem(){throw Error('storage blocked');}}
  ]){
    const ui=await feedbackUI({popupError:'auth/popup-blocked',tabStorage:storage});
    ui.google().click();await tick();await tick();
    assert.equal(ui.calls.redirects,0);assert.equal(ui.b.app.state.feedbackOpen,true);
    assert.match(ui.slot().querySelector('.su-auth-feedback').textContent,/allow popups/);assert.equal(ui.calls.alerts.length,0);assert.equal(ui.google().disabled,false);
  }
  const ui=await feedbackUI({popupError:'auth/popup-blocked'});
  ui.b.fire('keydown',ui.dialog(),{key:'Escape'});
  ui.b.grid.querySelector('.su-auth-button').click();await tick();await tick();
  assert.equal(ui.calls.redirects,1);assert.equal(ui.tabStorage.getItem(redirectKey),null);
});

test('a receipt that cannot be consumed does not reopen repeatedly',()=>{
  const storage=tabStorage(new Map([[redirectKey,JSON.stringify({v:1,at:Date.now(),co:'Example',link:'https://example.com/job'})]]));
  storage.removeItem=()=>{};
  assert.equal(reloadBoard(storage).app.state.feedbackOpen,false);
  assert.equal(reloadBoard(storage).app.state.feedbackOpen,false);
});

test('redirect rejection and every feedback dismissal invalidate the pending question',async()=>{
  const failed=await feedbackUI({popupError:'auth/popup-blocked',redirectError:'auth/unauthorized-domain'});
  failed.google().click();await tick();await tick();
  assert.equal(failed.calls.redirects,1);assert.equal(failed.tabStorage.getItem(redirectKey),null);
  assert.equal(failed.b.app.state.feedbackOpen,true);assert.equal(failed.google().disabled,false);
  for(const action of ['markApplied','reportBroken','notFit','escape','backdrop','x']){
    const ui=await feedbackUI({popupError:'auth/popup-blocked'});
    ui.google().click();await tick();await tick();assert(ui.tabStorage.getItem(redirectKey));
    if(action==='escape')ui.b.fire('keydown',ui.dialog(),{key:'Escape'});
    else if(action==='backdrop')ui.b.overlay.children[0].click();
    else if(action==='x'){ui.signIn({uid:'mock-user'});ui.close().click();}
    else if(action==='notFit')ui.dialog().querySelector('[data-act="notFit"]').click();
    else ui.dialog().querySelector('[data-act="'+action+'"]').click();
    assert.equal(ui.tabStorage.getItem(redirectKey),null,action+' clears pending redirect');
    assert.equal(reloadBoard(ui.tabStorage).app.state.feedbackOpen,false,action+' stays closed after reload');
  }
});

test('a late popup-blocked result after an answer cannot create a stale receipt or redirect',async()=>{
  const ui=await feedbackUI();ui.google().click();
  ui.dialog().querySelector('[data-act="markApplied"]').click();
  ui.failPopup('auth/popup-blocked');await tick();await tick();
  assert.equal(ui.calls.redirects,0);assert.equal(ui.tabStorage.getItem(redirectKey),null);
  assert.equal(ui.b.app.state.feedbackOpen,false);
});

test('failed SDK loading offers a real retry and never labels an unresolved account as signed in',async()=>{
 const options={sdkFailure:true};const ui=await feedbackUI(options);
 assert.equal(ui.nav().querySelector('.su-auth-label').textContent,'Retry sign-in');assert.equal(ui.nav().disabled,false);
 assert.equal(ui.auth.signedIn(),false);assert.match(ui.nav().closest('.su-account-slot').querySelector('.su-auth-feedback').textContent,/could not load/);
 options.sdkFailure=false;ui.nav().click();assert.equal(ui.nav().querySelector('.su-auth-label').textContent,'Loading…');assert.equal(ui.nav().disabled,true);
 await tick();await tick();assert.equal(ui.nav().querySelector('.su-auth-label').textContent,'Sign in');assert.equal(ui.calls.initializations,1);
});

test('bootstrap timeout unlocks retry and an obsolete SDK load cannot initialize a second session',async()=>{
 const options={deferSdk:true,manualTimers:true};const ui=await feedbackUI(options);
 assert.equal(ui.nav().disabled,true);ui.bootTimeout();
 assert.equal(ui.nav().disabled,false);assert.equal(ui.nav().querySelector('.su-auth-label').textContent,'Retry sign-in');
 ui.nav().click();ui.releaseSdk();await tick();await tick();
 assert.equal(ui.calls.initializations,1);assert.equal(ui.nav().querySelector('.su-auth-label').textContent,'Sign in');
});

test('late popup rejection cannot replace a newly authenticated account with an error',async()=>{
 const ui=await feedbackUI();ui.google().click();ui.signIn({uid:'new-account'});
 ui.failPopup('auth/unauthorized-domain');await tick();
 assert.equal(ui.auth.signedIn(),true);assert.equal(ui.auth.syncState(),'synced');assert.equal(ui.nav().dataset.state,'synced');
 assert(!ui.calls.events.some(e=>e.name==='signin_error'));assert.equal(ui.calls.redirects,0);
});

test('sign-out remains pending until Firebase confirms it and reports failure without false completion',async()=>{
 const ui=await feedbackUI({initialUser:{uid:'alice'},confirm:true});
 ui.nav().click();assert.equal(ui.nav().querySelector('.su-auth-label').textContent,'Signing out…');assert.equal(ui.nav().disabled,true);await tick();
 assert.equal(ui.auth.signedIn(),true);assert(!ui.calls.events.some(e=>e.name==='signout_complete'));
 ui.failSignout();await tick();assert.equal(ui.auth.signedIn(),true);assert.equal(ui.nav().disabled,false);
 assert.match(ui.nav().closest('.su-account-slot').querySelector('.su-auth-feedback').textContent,/still signed in/);
 assert.equal(ui.calls.events.filter(e=>e.name==='signout_error').length,1);
 ui.nav().click();await tick();ui.finishSignout();await tick();
 assert.equal(ui.auth.signedIn(),false);assert.equal(ui.nav().querySelector('.su-auth-label').textContent,'Sign in');
 assert.equal(ui.calls.events.filter(e=>e.name==='signout_complete').length,1);
 assert(!ui.calls.events.some(e=>e.name==='auth_logout'));assert(ui.calls.events.every(e=>Object.keys(e.payload).length===0));
});

test('one sync failure and recovery episode emits count-only events once across retries',async()=>{
 const options={initialUser:{uid:'alice'},syncFailure:true};const ui=await feedbackUI(options);
 ui.syncStatus('error');ui.auth.retrySync();ui.syncStatus('error');
 assert.equal(ui.calls.events.filter(e=>e.name==='sync_error').length,1);assert.equal(ui.calls.events.filter(e=>e.name==='sync_retry').length,1);
 ui.syncStatus('saving');ui.syncStatus('synced');ui.syncStatus('synced');
 assert.equal(ui.calls.events.filter(e=>e.name==='sync_recovered').length,1);
 assert(ui.calls.events.every(e=>Object.keys(e.payload).length===0));
});

test('online recovery cannot reclaim a cache owned by a different account in another tab',async()=>{
 const options={initialUser:{uid:'alice',getIdToken:async()=> 'alice-fixture-token'}};const ui=await feedbackUI(options);const syncs=ui.calls.syncs;
 options.cacheCurrent=false;options.ownerMatches=false;ui.fireWindow('storage',{key:'su_sync_owner'});ui.fireWindow('online');
 assert.equal(ui.calls.syncs,syncs);assert.equal(ui.auth.accountCurrent(),false);assert.equal(ui.auth.syncReady(),false);assert.equal(ui.nav().disabled,true);
 await assert.rejects(()=>ui.auth.getToken(),/Sign in required/);
 ui.signIn({uid:'bob'});assert.equal(ui.auth.accountCurrent(),true);assert.equal(ui.auth.syncReady(),true);assert.equal(ui.nav().disabled,false);
});

test('cancelling a retry clears the earlier sign-in error without claiming success',async()=>{
 const options={popupError:'auth/unauthorized-domain'};const ui=await feedbackUI(options);ui.google().click();await tick();
 assert.equal(ui.auth.syncState(),'error');assert.equal(ui.slot().querySelector('.su-auth-feedback').hidden,false);
 options.popupError='auth/popup-closed-by-user';ui.google().click();assert.equal(ui.auth.syncState(),'signing-in');await tick();
 assert.equal(ui.auth.syncState(),'signed-out');assert.equal(ui.auth.signedIn(),false);assert.equal(ui.slot().querySelector('.su-auth-feedback').hidden,true);
 assert.equal(ui.calls.events.filter(e=>e.name==='signin_start').length,2);assert.equal(ui.calls.events.filter(e=>e.name==='signin_cancel').length,1);
});


test('public signIn action starts the existing popup once and never signs out an account',async()=>{
 const ui=await feedbackUI({confirm:true});const trigger=ui.google();trigger.focus();
 ui.auth.signIn(trigger);ui.auth.signIn(trigger);
 assert.equal(ui.calls.popups,1);assert.equal(trigger.querySelector('.su-auth-label').textContent,'Signing in…');assert.equal(trigger.disabled,true);
 ui.failPopup('auth/popup-closed-by-user');await tick();await tick();
 assert.equal(ui.auth.signedIn(),false);assert.equal(trigger.disabled,false);assert.equal(trigger.querySelector('.su-auth-label').textContent,'Sign in');
 ui.signIn({uid:'qa',email:'NicholasdAlexis@gmail.com',emailVerified:true});
 assert.equal(ui.nav().querySelector('.su-auth-label').textContent,'Account');assert.equal(ui.nav().querySelector('.su-auth-qa').hidden,false);
 ui.auth.signIn(ui.nav());await tick();assert.equal(ui.calls.popups,1);assert.equal(ui.calls.signouts,0);assert.equal(ui.calls.confirms,0);
});
