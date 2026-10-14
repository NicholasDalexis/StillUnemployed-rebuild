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
// Offline fixtures use a reserved, non-deliverable QA email. Tokens below are synthetic.
const authSource=fs.readFileSync(path.join(__dirname,'../../js/auth.js'),'utf8').replace(/[A-Za-z0-9_.+%-]+@gmail\.com/gi, 'qa@example.invalid');
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
  proto.remove=function(){if(this.parentElement)this.parentElement.removeChild(this);};
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
  const store={owner:()=>owner,current:()=>options.cacheCurrent!==false,ownershipCurrent:()=>options.ownerMatches!==false,suspend(){options.cacheCurrent=false;},activate(value){owner=value;options.cacheCurrent=true;options.ownerMatches=true;b.app.render();if(mutationListener)mutationListener([{addedNodes:[b.grid]}]);}};
  const sdk={getAuth:()=>({}),GoogleAuthProvider:function GoogleAuthProvider(){},
    getRedirectResult:async()=>null,
    onAuthStateChanged(_auth,fn){authListener=fn;fn(options.initialUser||null);},
    signInWithPopup(){calls.popups++;return options.popupError?Promise.reject({code:options.popupError}):new Promise((resolve,reject)=>{resolvePopup=resolve;rejectPopup=reject;});},
    signInWithRedirect:async()=>{calls.redirects++;if(options.redirectError)throw{code:options.redirectError};},signOut:()=>{calls.signouts++;if(options.immediateSignout){authListener(null);return Promise.resolve();}return new Promise((resolve,reject)=>{resolveSignout=resolve;rejectSignout=reject;});},
    signInWithCredential:async(_auth,credential)=>{calls.credential=credential;authListener(options.nativeUser);return {user:options.nativeUser};},
    linkWithCredential:async(current,credential)=>{calls.linked={uid:current.uid,credential};return {user:current};},
    reauthenticateWithCredential:async(current,credential)=>{calls.reauthenticated={uid:current.uid,credential};return {user:current};},
    reauthenticateWithPopup:async current=>{if(options.reauthError)throw {code:options.reauthError};return {user:current};}
  };
  sdk.GoogleAuthProvider.credential=(idToken,accessToken)=>({providerId:'google.com',idToken,accessToken});
  sdk.OAuthProvider=class{constructor(id){this.id=id;}addScope(){}credential(value){return {providerId:this.id,...value};}static credentialFromResult(){return {idToken:'synthetic-apple-token',accessToken:'synthetic-apple-access'};}};
  const window={SUApp:b.app,SUStore:store,SUAnalytics:{emit:(name,payload)=>calls.events.push({name,payload})},addEventListener(name,fn){(windowEvents[name]??=[]).push(fn);},SUSync:{connect(_store,_adapter,status){calls.syncs++;syncCallback=status;status(options.syncFailure?'error':'synced');return{stop(){},queue(){}};}}};
  const hostname=options.hostname||'preview--stillunemployed.netlify.app';
  if(options.native)window.SUNative={isNative:true,ready:Promise.resolve(),firebase:{app:{initializeApp:()=>({})},auth:sdk,firestore:{getFirestore:()=>({}),doc:()=>({})}},auth:{signIn:options.nativeSignIn,reauthenticate:options.nativeSignIn,clearProviderSession:async()=>{calls.providerCleared=true;}},request:options.request,storage:{flush:async()=>{calls.flushes=(calls.flushes||0)+1;if(options.flushError)throw Error("Native storage unavailable");}}};
  vm.runInNewContext(authSource.replace(/import\((['"])([^'"]+)\1\)/g,'__loadSdk($1$2$1)'),{
    location:{hostname,host:hostname},window,document:b.document,localStorage:b.localStorage,sessionStorage:b.window.sessionStorage,crypto:require('node:crypto'),fetch:options.request,
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
    signIn(user){authListener(user);},finishPopup(user){if(resolvePopup)resolvePopup(user?{user}:undefined);},
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
  for(const response of ['markApplied','reportBroken','feedbackSave']){
    const ui=await feedbackUI();const {b}=ui;
    const action=ui.dialog().querySelector('[data-act="'+response+'"]');
    action.click();await tick();await tick();assert.equal(b.app.state.feedbackOpen,false,response+' closes normally');
    assert.equal(ui.calls.popups,0);assert.equal(ui.calls.redirects,0);
    if(response==='markApplied')assert.equal(JSON.parse(b.localStorage.getItem('su_tracker'))[0].link,'https://example.com/job');
    if(response==='reportBroken')assert.equal(b.app.computeShown().shown.length,0);
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

test('loading and unavailable SDK retain the visible fallback X',async()=>{
  for(const options of [{deferSdk:true},{sdkFailure:true}]){
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
  assert.equal(slot.querySelectorAll('.su-auth-button').length,3);assert.equal(slot.querySelectorAll('.su-auth-apple').length,1);assert.equal(slot.querySelectorAll('.su-account-settings').length,1);assert.equal(ui.google(),google);
  ui.close().focus();ui.signIn(null);assert.equal(ui.google().hidden,false);assert.equal(ui.b.document.activeElement,google);
});

test('native Google and Apple deliver credentials to one Firebase session without a web popup',async()=>{
  for(const provider of ['google.com','apple.com']){
    const nativeUser={uid:'same-firebase-user',providerData:[{providerId:provider}]};
    let requested;const ui=await feedbackUI({hostname:'localhost',native:true,nativeUser,nativeSignIn:async id=>{requested=id;return {provider:id,idToken:'synthetic-provider-id',accessToken:'synthetic-provider-access',rawNonce:'synthetic-nonce',authorizationCode:'synthetic-code'};}});
    assert.equal(ui.calls.imports,0,'packaged Firebase modules are used');
    const button=provider==='apple.com'?ui.slot().querySelector('.su-auth-apple'):ui.google();button.click();await tick();await tick();
    assert.equal(requested,provider);assert.equal(ui.calls.popups,0);assert.equal(ui.calls.redirects,0);assert.equal(ui.calls.credential.providerId,provider);assert.equal(ui.auth.signedIn(),true);assert.equal(ui.auth.syncReady(),true);
    if(provider==='apple.com')assert.equal(ui.calls.credential.rawNonce,'synthetic-nonce');
  }
});

test('linking is explicit and preserves the Firebase UID; cancellation never links',async()=>{
  for(const consent of [false,true]){
    const initialUser={uid:'existing-google-uid',providerData:[{providerId:'google.com'}]},ui=await feedbackUI({native:true,hostname:'localhost',initialUser,confirm:consent,nativeSignIn:async id=>({provider:id,idToken:'synthetic-apple-id',rawNonce:'nonce',authorizationCode:'code'})});
    await ui.auth.linkProvider('apple.com');
    assert.equal(ui.calls.confirms,1);assert.equal(!!ui.calls.linked,consent);
    if(consent)assert.equal(ui.calls.linked.uid,initialUser.uid);
    assert.equal(ui.auth.accountCurrent(),true);
  }
});

test('cancelled deletion reauthentication leaves account sync and local jobs available',async()=>{
  const initialUser={uid:'member',providerData:[{providerId:'google.com'}]},ui=await feedbackUI({initialUser,confirm:true,reauthError:'auth/popup-closed-by-user'});
  await ui.auth.deleteAccount();assert.equal(ui.auth.accountCurrent(),true);assert.equal(ui.auth.syncReady(),true);assert.equal(ui.b.localStorage.getItem('su_delete_request:member'),null);
});

test('deletion completion clears private caches and provider session only after verified server success',async()=>{
  const uid='delete-fixture',initialUser={uid,providerData:[{providerId:'google.com'}],getIdToken:async()=>'synthetic-firebase-token'};
  const sent=[];const ui=await feedbackUI({initialUser,native:true,hostname:'localhost',confirm:true,immediateSignout:true,nativeSignIn:async id=>({provider:id,idToken:'synthetic-google-id',accessToken:'access'}),request:async(url,request)=>{sent.push({url,request});return {ok:true,status:JSON.parse(request.body).phase==='start'?202:200,json:async()=>JSON.parse(request.body).phase==='start'?{deleted:false,continuation:'synthetic-continuation'}:{deleted:true}};}});
  ui.b.localStorage.setItem('su_sync_v2:'+uid,'private-account-data');ui.b.localStorage.setItem('su_discovery_guest','private-preferences');ui.b.localStorage.setItem('su_analytics_visitor','private-attribution');
  await ui.auth.deleteAccount();assert.equal(sent[0].url,'/api/account/delete');assert.equal(sent[0].request.headers.Authorization,'Bearer synthetic-firebase-token');assert.equal(JSON.parse(sent[0].request.body).confirm,true);assert.equal(sent[1].request.headers.Authorization,undefined);assert.equal(JSON.parse(sent[1].request.body).continuation,'synthetic-continuation');assert.equal(ui.calls.flushes,4);assert.equal(ui.auth.signedIn(),false);assert.equal(ui.calls.providerCleared,true);
  for(const key of ['su_sync_v2:'+uid,'su_discovery_guest','su_analytics_visitor','su_delete_request:'+uid])assert.equal(ui.b.localStorage.getItem(key),null);
});

test('interrupted deletion retains private cache, freezes writes and permits a same-request retry',async()=>{
  const uid='retry-fixture',initialUser={uid,providerData:[{providerId:'google.com'}],getIdToken:async()=>'synthetic-firebase-token'};
  const ids=[],ui=await feedbackUI({initialUser,native:true,hostname:'localhost',confirm:true,nativeSignIn:async id=>({provider:id,idToken:'synthetic-google-id',accessToken:'access'}),request:async(_url,request)=>{ids.push(JSON.parse(request.body).requestId);return {ok:false,json:async()=>({error:'Please retry'})};}});
  ui.b.localStorage.setItem('su_sync_v2:'+uid,'recoverable');await ui.auth.deleteAccount();assert.equal(ui.auth.signedIn(),true);assert.equal(ui.auth.accountCurrent(),false);assert.equal(ui.b.localStorage.getItem('su_sync_v2:'+uid),'recoverable');
  await ui.auth.deleteAccount();assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.equal(ui.calls.providerCleared,undefined);
});

test('confirmed pre-start failure restores sync and next deletion obtains fresh authorization',async()=>{
  let authorizations=0;const initialUser={uid:'not-started',providerData:[{providerId:'google.com'}],getIdToken:async()=>'synthetic-firebase-token'};
  const ui=await feedbackUI({initialUser,native:true,hostname:'localhost',confirm:true,nativeSignIn:async id=>{authorizations++;return {provider:id,idToken:'synthetic-google-id',accessToken:'access'};},request:async()=>({ok:false,status:503,json:async()=>({error:'Configuration unavailable',pending:false})})});
  await ui.auth.deleteAccount();assert.equal(ui.auth.accountCurrent(),true);assert.equal(ui.b.localStorage.getItem('su_delete_request:not-started'),null);await ui.auth.deleteAccount();assert.equal(authorizations,2);
});

test('lost final deletion response resumes with persisted continuation after Firebase refresh fails and auth state disappears',async()=>{
  let authorizations=0,requests=0,tokens=0,ui;
  const initialUser={uid:'apple-lost-response',providerData:[{providerId:'apple.com'}],getIdToken:async force=>{assert.equal(force,false);tokens++;if(tokens>1)throw {code:'auth/user-not-found'};return 'synthetic-cached-token';}};
  ui=await feedbackUI({initialUser,native:true,hostname:'localhost',confirm:true,immediateSignout:true,nativeSignIn:async id=>{authorizations++;return {provider:id,idToken:'synthetic-apple-id',rawNonce:'nonce',authorizationCode:'one-use-code'};},request:async(_url,request)=>{
    requests++;const input=JSON.parse(request.body);
    if(input.phase==='start')return {ok:true,status:202,json:async()=>({deleted:false,continuation:'synthetic-resume-capability'})};
    assert.equal(request.headers.Authorization,undefined);assert.equal(input.continuation,'synthetic-resume-capability');
    if(requests===2){ui.signIn(null);throw Error('lost final response');}
    return {ok:true,status:200,json:async()=>({deleted:true})};
  }});
  await ui.auth.deleteAccount();assert.equal(ui.auth.signedIn(),false);assert.equal(ui.auth.accountCurrent(),false);assert.equal(ui.auth.measurementReady(),false);assert.equal(JSON.parse(ui.b.localStorage.getItem('su_delete_operation')).continuation,'synthetic-resume-capability');
  await ui.auth.deleteAccount();assert.equal(ui.auth.signedIn(),false);assert.equal(ui.auth.measurementReady(),true);assert.equal(authorizations,1);assert.equal(tokens,1);assert.equal(requests,3);assert.equal(ui.b.localStorage.getItem('su_delete_operation'),null);
});
test('native continuation must flush durably before the server may revoke or erase account',async()=>{
  let requests=0;const initialUser={uid:'storage-failure',providerData:[{providerId:'google.com'}],getIdToken:async()=>'synthetic-firebase-token'};
  const ui=await feedbackUI({initialUser,native:true,hostname:'localhost',confirm:true,flushError:true,nativeSignIn:async id=>({provider:id,idToken:'synthetic-google-id',accessToken:'access'}),request:async()=>{requests++;return {ok:true,status:202,json:async()=>({deleted:false,continuation:'synthetic-resume-capability'})};}});
  await ui.auth.deleteAccount();assert.equal(requests,0);assert.equal(ui.auth.accountCurrent(),false);assert.equal(ui.calls.providerCleared,undefined);assert.ok(ui.b.localStorage.getItem('su_delete_request:'+initialUser.uid));
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
  for(const action of ['markApplied','reportBroken','feedbackSave','escape','backdrop','x']){
    const ui=await feedbackUI({popupError:'auth/popup-blocked'});
    ui.google().click();await tick();await tick();assert(ui.tabStorage.getItem(redirectKey));
    if(action==='escape')ui.b.fire('keydown',ui.dialog(),{key:'Escape'});
    else if(action==='backdrop')ui.b.overlay.children[0].click();
    else if(action==='x'){ui.signIn({uid:'mock-user'});ui.close().click();}
    else if(action==='feedbackSave')ui.dialog().querySelector('[data-act="feedbackSave"]').click();
    else ui.dialog().querySelector('[data-act="'+action+'"]').click();
    await tick();await tick();
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
 ui.signIn({uid:'qa',email:'qa@example.invalid',emailVerified:true});
 assert.equal(ui.nav().querySelector('.su-auth-label').textContent,'Account');assert.equal(ui.nav().querySelector('.su-auth-qa').hidden,false);
 ui.auth.signIn(ui.nav());await tick();assert.equal(ui.calls.popups,1);assert.equal(ui.calls.signouts,0);assert.equal(ui.calls.confirms,0);
});


test('successful Google login is counted once after both popup and account activation, in either callback order',async()=>{
 for(const first of ['popup','account']){
  const ui=await feedbackUI();const user={uid:'measured-user',getIdToken:async()=> 'synthetic'};ui.google().click();
  if(first==='popup'){ui.finishPopup(user);await tick();assert.equal(ui.calls.events.filter(e=>e.name==='auth_login').length,0);ui.signIn(user);}
  else{ui.signIn(user);assert.equal(ui.calls.events.filter(e=>e.name==='auth_login').length,0);ui.finishPopup(user);}
  await tick();assert.equal(ui.auth.measurementReady(),true);assert.equal(ui.calls.events.filter(e=>e.name==='auth_login').length,1);
  ui.signIn(user);await tick();assert.equal(ui.calls.events.filter(e=>e.name==='auth_login').length,1,'ordinary auth refresh is not a new login');
 }
});

test('prior-account deletion recovery never targets or clears a different resolved account',async()=>{
  const prior={uid:'prior-delete',providerData:[{providerId:'google.com'}],getIdToken:async()=>'synthetic-firebase-token'},other={uid:'other-account',providerData:[{providerId:'google.com'}]};let requests=0;
  const ui=await feedbackUI({initialUser:prior,native:true,hostname:'localhost',confirm:true,nativeSignIn:async id=>({provider:id,idToken:'synthetic-google-id',accessToken:'access'}),request:async(_url,request)=>{requests++;return JSON.parse(request.body).phase==='start'?{ok:true,status:202,json:async()=>({deleted:false,continuation:'synthetic-continuation'})}:{ok:true,status:202,json:async()=>({deleted:false,processing:true})};}});
  await ui.auth.deleteAccount();ui.signIn(other);ui.b.localStorage.setItem('su_sync_v2:'+other.uid,'other-private-cache');assert.equal(ui.auth.accountCurrent(),true);await ui.auth.deleteAccount();assert.equal(requests,2);assert.equal(ui.auth.signedIn(),true);assert.equal(ui.auth.accountCurrent(),true);assert.equal(ui.b.localStorage.getItem('su_sync_v2:'+other.uid),'other-private-cache');assert.equal(ui.calls.signouts,0);
});

test('expired confirmed deletion renews through the same existing Firebase UID without granting Apple again',async()=>{
  let authorizations=0,starts=0,processes=0;const initialUser={uid:'expired-incomplete',providerData:[{providerId:'apple.com'}],getIdToken:async()=>'synthetic-firebase-token'};
  const ui=await feedbackUI({initialUser,native:true,hostname:'localhost',confirm:true,immediateSignout:true,nativeSignIn:async id=>{authorizations++;return {provider:id,idToken:'synthetic-apple-id',rawNonce:'nonce',authorizationCode:'first-code'};},request:async(_url,request)=>{
    const input=JSON.parse(request.body);
    if(input.phase==='start'){starts++;if(starts===2)assert.equal(input.apple,undefined,'renewal supplies no new provider authorization');return {ok:true,status:202,json:async()=>({deleted:false,continuation:starts===1?'expired-capability':'renewed-capability'})};}
    processes++;if(processes===1)return {ok:true,status:202,json:async()=>({deleted:false,processing:true})};
    if(input.continuation==='expired-capability')return {ok:false,status:401,json:async()=>({error:'Expired',pending:true})};
    assert.equal(input.continuation,'renewed-capability');return {ok:true,status:200,json:async()=>({deleted:true})};
  }});
  await ui.auth.deleteAccount();assert.equal(ui.auth.accountCurrent(),false);await ui.auth.deleteAccount();assert.equal(ui.auth.signedIn(),false);assert.equal(starts,2);assert.equal(processes,3);assert.equal(authorizations,1);assert.equal(ui.b.localStorage.getItem('su_delete_operation'),null);
});

test('expired recovery after Auth has disappeared cannot claim deletion success or clear private cache',async()=>{
  const initialUser={uid:'expired-removed-auth',providerData:[{providerId:'google.com'}],getIdToken:async()=>'synthetic-firebase-token'};let ui,starts=0,processes=0;
  ui=await feedbackUI({initialUser,native:true,hostname:'localhost',confirm:true,nativeSignIn:async id=>({provider:id,idToken:'synthetic-google-id',accessToken:'access'}),request:async(_url,request)=>{
    const input=JSON.parse(request.body);if(input.phase==='start'){starts++;return {ok:true,status:202,json:async()=>({deleted:false,continuation:'expired-capability'})};}
    processes++;if(processes===1){ui.signIn(null);throw Error('lost final response');}return {ok:false,status:401,json:async()=>({error:'Recovery expired',pending:true})};
  }});
  ui.b.localStorage.setItem('su_sync_v2:'+initialUser.uid,'recoverable-private-data');await ui.auth.deleteAccount();await ui.auth.deleteAccount();assert.equal(starts,1);assert.equal(processes,2);assert.equal(ui.calls.providerCleared,undefined);assert.equal(ui.b.localStorage.getItem('su_sync_v2:'+initialUser.uid),'recoverable-private-data');assert.ok(ui.b.localStorage.getItem('su_delete_operation'));assert.equal(ui.auth.measurementReady(),false);
});

test('native header uses one settings icon and keeps both provider actions inside the account dialog',async()=>{
 for(const provider of ['google.com','apple.com']){
  let requested;const nativeUser={uid:'menu-account',providerData:[{providerId:provider}]};
  const ui=await feedbackUI({native:true,hostname:'localhost',nativeUser,nativeSignIn:async id=>{requested=id;return {provider:id,idToken:'synthetic-id',accessToken:'synthetic-access',rawNonce:'synthetic-nonce'};}});
  const nav=ui.b.grid.querySelector('.su-main-nav'),slot=nav.querySelector('.su-account-slot'),menu=slot.querySelector('.su-account-menu-trigger');
  assert(menu);assert.equal(slot.querySelectorAll('button').length,1);assert.equal(slot.querySelector('.su-auth-button'),null);assert.equal(menu.getAttribute('aria-haspopup'),'dialog');
  ui.notify(slot);assert.equal(slot.querySelectorAll('.su-account-menu-trigger').length,1);
  menu.focus();menu.click();const panel=ui.b.document.body.querySelector('.su-account-dialog');assert(panel);assert.equal(menu.getAttribute('aria-expanded'),'true');assert(panel.textContent.includes('Sign in with Google'));assert.equal(panel.querySelector('[data-account-action="delete"]'),null);
  const resources=panel.querySelector('.su-account-resources');assert(resources);assert.deepEqual(Array.from(resources.querySelectorAll('a')).map(a=>[a.textContent,a.getAttribute('href')]),[['Privacy policy','./privacy.html'],['Terms of use','./terms.html'],['Help & support','./support.html']]);
  const button=provider==='apple.com'?panel.querySelector('.su-auth-apple'):panel.querySelector('.su-auth-button');assert.equal(button.hidden,false);button.click();await tick();await tick();
  assert.equal(requested,provider);assert.equal(ui.calls.popups,0);assert.equal(ui.calls.credential.providerId,provider);assert.equal(ui.auth.syncReady(),true);assert.equal(ui.b.document.body.querySelector('.su-account-dialog'),null,'identity changes close the old menu');
  ui.b.grid.querySelector('.su-account-menu-trigger').click();const signed=ui.b.document.body.querySelector('.su-account-dialog');assert(signed.querySelector('[data-account-action="delete"]'));assert(signed.querySelector('[data-account-action="signout"]'));assert.equal(signed.querySelector('.su-auth-apple'),null,'signed-in menu contains linking, not another sign-in');
  assert.equal(signed.querySelector('.su-account-resources').querySelectorAll('a').length,3,'legal and support access survives authentication');
 }
});

test('native menu cancellation keeps the provider choices; Close restores keyboard focus to the icon',async()=>{
 const ui=await feedbackUI({native:true,hostname:'localhost',nativeSignIn:async()=>{throw {code:'native/auth-cancelled'};}});
 const menu=ui.b.grid.querySelector('.su-account-menu-trigger');menu.focus();menu.click();const panel=ui.b.document.body.querySelector('.su-account-dialog');panel.querySelector('.su-auth-button').click();await tick();await tick();
 assert.equal(ui.auth.signedIn(),false);assert.equal(ui.b.document.body.querySelector('.su-account-dialog'),panel);assert.equal(panel.querySelector('.su-auth-button').disabled,false);
 const close=Array.from(panel.querySelectorAll('button')).find(b=>b.textContent==='Close');close.click();assert.equal(ui.b.document.activeElement,menu);assert.equal(menu.getAttribute('aria-expanded'),'false');
});
