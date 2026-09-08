const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/auth.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function authUI(hostname = 'preview--stillunemployed.netlify.app') {
  const label = { textContent:'' }, attrs = {}, button = { dataset:{}, removeAttribute(name) { delete attrs[name]; }, querySelector:() => label, setAttribute(name, value) { attrs[name] = value; } };
  let listener, notifySync, owner = null, imports = 0;
  const store = { owner:() => owner, activate:value => { owner = value; } };
  const authSdk = { getAuth:() => ({}), getRedirectResult:async () => null, onAuthStateChanged(_auth, fn) { listener = fn; } };
  const firestoreSdk = { getFirestore:() => ({}), doc:() => ({}) };
  const window = { SUStore:store, addEventListener() {}, SUSync:{ connect(_store, _adapter, status) { notifySync = status;status('synced');return { stop() {}, queue() {} }; } } };
  // Substitute only SDK loading. The production hostname gate, auth callback and
  // complete render function run unchanged; no network or Google account is used.
  const instrumented = source.replace(/import\((['"])([^'"]+)\1\)/g, '__loadSdk($1$2$1)');
  vm.runInNewContext(instrumented, {
    location:{ hostname, host:hostname }, window,setTimeout,clearTimeout,
    document:{ readyState:'loading', addEventListener() {}, querySelectorAll:() => [button], getElementById:() => null },
    console:{ warn() {} },
    __loadSdk:async url => { imports++;return url.endsWith('firebase-app.js') ? { initializeApp:() => ({}) } : url.endsWith('firebase-auth.js') ? authSdk : firestoreSdk; }
  });
  await tick();await tick();
  return { label, attrs, button, imports, api:window.SUAuth, signIn:user => listener(user), syncError:() => notifySync('error', { code:'test/offline' }) };
}

test('auth shows Sign In when signed out and Signed In when authenticated', async () => {
  const ui = await authUI();
  assert.equal(ui.label.textContent, 'Loading…');assert.equal(ui.button.dataset.state, 'loading');assert.equal(ui.button.disabled,true);
  ui.signIn(null);assert.equal(ui.label.textContent,'Sign In');assert.equal(ui.button.dataset.state,'signed-out');assert.equal(ui.button.disabled,false);
  ui.signIn({ uid:'test-user', email:'test@example.invalid' });
  assert.equal(ui.label.textContent, 'Signed In');assert.equal(ui.button.dataset.state, 'synced');
  assert.match(ui.attrs['aria-label'], /Saved jobs and tracker synced/);
  assert.match(ui.attrs['aria-label'], /test@example\.invalid/);
  ui.syncError();assert.equal(ui.label.textContent, 'Signed In');assert.match(ui.attrs['aria-label'], /Sync failed/);
  ui.signIn(null);assert.equal(ui.label.textContent, 'Sign In');
});

test('public production hostnames still do not initialize Google authentication', async () => {
  for (const hostname of ['stillunemployed.com', 'www.stillunemployed.com']) {
    const ui = await authUI(hostname);assert.equal(ui.imports, 0);assert.equal(ui.label.textContent, '');
  }
});

test('resolved Firebase QA identity suppresses measurement while hints remain ordinary readable help',async()=>{
 const ui=await authUI();assert.equal(ui.api.measurementReady(),false);ui.signIn(null);assert.equal(ui.api.measurementReady(),true);assert.equal(ui.api.measurementExcluded(),false);
 assert.equal(ui.attrs['data-su-help'],'Sign in to keep your saved jobs and tracker together.');assert.equal(ui.attrs.title,undefined);
 ui.signIn({uid:'qa',email:'nicholasdalexis@gmail.com',emailVerified:false});assert.equal(ui.api.measurementExcluded(),false);
 ui.signIn({uid:'qa',email:'nicholasdalexis@gmail.com',emailVerified:true});assert.equal(ui.api.measurementExcluded(),true);assert.equal(ui.attrs['data-su-help'],'You’re signed in. Click here to sign out.');
 ui.signIn(null);assert.equal(ui.api.measurementExcluded(),true,'QA sign-out completion remains excluded in this page session');
 ui.signIn({uid:'different',email:'different@example.invalid',emailVerified:true});assert.equal(ui.api.measurementExcluded(),false);
});
