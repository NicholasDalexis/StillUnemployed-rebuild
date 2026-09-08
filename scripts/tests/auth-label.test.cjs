const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/auth.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function authUI(hostname = 'preview--stillunemployed.netlify.app', options = {}) {
  const label = { textContent:'' }, qaLabel = { hidden:true }, attrs = {}, button = { dataset:{}, removeAttribute(name) { delete attrs[name]; }, querySelector:selector => selector === '.su-auth-label' ? label : selector === '.su-auth-qa' ? qaLabel : null, setAttribute(name, value) { attrs[name] = value; } };
  let listener, notifySync, owner = null, imports = 0, ownershipCurrent = true;
  const store = { ownershipCurrent:() => ownershipCurrent, owner:() => owner, activate:value => { owner = value; } };
  const authSdk = { getAuth:() => ({}), getRedirectResult:async () => null, onAuthStateChanged(_auth, fn) { listener = fn; } };
  const firestoreSdk = { getFirestore:() => ({}), doc:() => ({}) };
  const window = { SUStore:options.noStore?undefined:store, addEventListener() {}, SUSync:{ connect(_store, _adapter, status) { notifySync = status;status('synced');return { stop() {}, queue() {} }; } } };
  // Substitute only SDK loading. The production hostname gate, auth callback and
  // complete render function run unchanged; no network or Google account is used.
  const instrumented = source.replace(/import\((['"])([^'"]+)\1\)/g, '__loadSdk($1$2$1)');
  vm.runInNewContext(instrumented, {
    location:{ hostname, host:hostname }, window,setTimeout,clearTimeout,
    document:{ readyState:'loading', addEventListener() {}, querySelectorAll:selector => selector === '.su-auth-button' ? [button] : [], getElementById:() => null },
    console:{ warn() {} },
    __loadSdk:async url => { imports++;return url.endsWith('firebase-app.js') ? { initializeApp:() => ({}) } : url.endsWith('firebase-auth.js') ? authSdk : firestoreSdk; }
  });
  await tick();await tick();
  return { label, qaLabel, attrs, button, imports, changeOwner:() => { ownershipCurrent = false; notifySync('loading'); }, api:window.SUAuth, signIn:user => listener(user), syncError:() => notifySync('error', { code:'test/offline' }) };
}

test('auth shows Sign in when signed out and Account when authenticated', async () => {
  const ui = await authUI();
  assert.equal(ui.label.textContent, 'Loading…');assert.equal(ui.button.dataset.state, 'loading');assert.equal(ui.button.disabled,true);
  ui.signIn(null);assert.equal(ui.label.textContent,'Sign in');assert.equal(ui.button.dataset.state,'signed-out');assert.equal(ui.button.disabled,false);
  ui.signIn({ uid:'test-user', email:'test@example.invalid' });
  assert.equal(ui.label.textContent, 'Account');assert.equal(ui.button.dataset.state, 'synced');
  assert.match(ui.attrs['aria-label'], /Saved jobs and tracker synced/);
  assert.match(ui.attrs['aria-label'], /test@example\.invalid/);
  ui.syncError();assert.equal(ui.label.textContent, 'Account');assert.match(ui.attrs['aria-label'], /Sync failed/);assert.equal(ui.attrs['data-su-help'],'You’re signed in. Click to retry syncing your jobs.');
  ui.signIn(null);assert.equal(ui.label.textContent, 'Sign in');
});

test('public production hostnames still do not initialize Google authentication', async () => {
  for (const hostname of ['stillunemployed.com', 'www.stillunemployed.com']) {
    const ui = await authUI(hostname);assert.equal(ui.imports, 0);assert.equal(ui.label.textContent, '');
  }
});

test('resolved Firebase QA identity suppresses measurement while hints remain ordinary readable help',async()=>{
 const ui=await authUI();assert.equal(ui.api.measurementReady(),false);ui.signIn(null);assert.equal(ui.api.measurementReady(),true);assert.equal(ui.api.measurementExcluded(),false);
 assert.equal(ui.attrs['data-su-help'],'Sign in to keep your saved jobs and tracker together.');assert.equal(ui.attrs.title,undefined);
 ui.signIn({uid:'qa',email:'nicholasdalexis@gmail.com',emailVerified:false});assert.equal(ui.api.measurementExcluded(),false);assert.equal(ui.api.qaAdmin(),false);assert.equal(ui.qaLabel.hidden,true);
 ui.signIn({uid:'qa',email:'NicholasdAlexis@gmail.com',emailVerified:true});assert.equal(ui.api.measurementExcluded(),true);assert.match(ui.attrs['data-su-help'],/QA admin: your testing is excluded/);assert.equal(ui.api.qaAdmin(),true);assert.equal(ui.qaLabel.hidden,false);assert.match(ui.attrs['aria-label'],/QA admin/);
 ui.signIn(null);assert.equal(ui.api.qaAdmin(),false);assert.equal(ui.qaLabel.hidden,true);assert.doesNotMatch(ui.attrs['aria-label'],/QA admin/);assert.equal(ui.api.measurementExcluded(),true,'QA sign-out completion remains excluded in this page session');
 ui.signIn({uid:'different',email:'different@example.invalid',emailVerified:true});assert.equal(ui.api.measurementExcluded(),false);
});

test('QA label disappears immediately while another tab changes ownership',async()=>{
 const ui=await authUI();ui.signIn({uid:'qa',email:'NicholasdAlexis@gmail.com',emailVerified:true});assert.equal(ui.api.qaAdmin(),true);
 ui.changeOwner();assert.equal(ui.api.qaAdmin(),false);assert.equal(ui.qaLabel.hidden,true);assert.equal(ui.button.disabled,true);assert.doesNotMatch(ui.attrs['aria-label'],/QA admin/);
});


test('confirmed Google identity can request a dashboard token when the page has no job cache',async()=>{
 const ui=await authUI('preview--stillunemployed.netlify.app',{noStore:true});
 await assert.rejects(()=>ui.api.getToken(),/Sign in required/);
 ui.signIn({uid:'qa',email:'NicholasdAlexis@gmail.com',emailVerified:true,getIdToken:async()=>'synthetic-token'});
 assert.equal(ui.api.accountCurrent(),true);assert.equal(await ui.api.getToken(),'synthetic-token');assert.equal(ui.api.qaAdmin(),true);
 ui.signIn(null);assert.equal(ui.api.accountCurrent(),false);await assert.rejects(()=>ui.api.getToken(),/Sign in required/);
});
