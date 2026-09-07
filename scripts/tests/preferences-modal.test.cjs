const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const D = require('../../js/discovery.js');
const S = require('../../js/sync-store.js');
const P = require('../../js/personalization.js');

// Exercise the actual board renderer, delegated events and discovery/store modules.
// The shared DOM adapter models replacement and focus, not browser layout or blur.
const fixturePath = path.join(__dirname, 'board-qa.test.cjs');
const fixtureSource = fs.readFileSync(fixturePath, 'utf8');
const firstTest = fixtureSource.indexOf('\ntest(');
assert(firstTest > 0);
const fixtureModule = { exports:{} };
vm.runInNewContext(fixtureSource.slice(0, firstTest) + '\nmodule.exports={board,job};', {
  require:createRequire(fixturePath), module:fixtureModule, __dirname,
  Buffer, URL, URLSearchParams, setImmediate
}, { filename:fixturePath });
const { board, job } = fixtureModule.exports;
const tick = () => new Promise(resolve => setImmediate(resolve));

function preferencesUI(t) {
  const b = board(), root = b.window, emitted = [];
  root.document = b.document;root.localStorage = b.localStorage;root.SUPersonalization = P;
  root.SUAnalytics.emit = (name, payload) => emitted.push({ name, payload });
  const proto = Object.getPrototypeOf(b.document.body);
  Object.defineProperties(proto, {
    hidden:{ get() { return this.getAttribute('hidden') !== null; }, set(value) { value ? this.setAttribute('hidden', '') : this.removeAttribute('hidden'); } },
    elements:{ get() { return Object.fromEntries(this.querySelectorAll('input,textarea').map(el => [el.getAttribute('name'), el])); } }
  });
  proto.getClientRects = function () { for (let el = this;el;el = el.parentElement) if (el.hidden || el.style.display === 'none') return [];return [{}]; };
  const body = b.document.body;
  body.classList = { contains:name => body.className.split(/\s+/).includes(name),
    add(name) { body.className = [...new Set(body.className.split(/\s+/).filter(Boolean).concat(name))].join(' '); },
    remove(name) { body.className = body.className.split(/\s+/).filter(value => value !== name).join(' '); } };
  // The base adapter intentionally supports only simple selectors. Model the
  // outside-overlay exclusion for these lifecycle tests without changing sources.
  const queryAll = b.document.querySelectorAll.bind(b.document);
  b.document.querySelectorAll = selector => selector.includes(':not(#overlay-root *)')
    ? queryAll(selector.replace(':not(#overlay-root *)', '')).filter(node => !b.overlay.contains(node))
    : queryAll(selector);
  const store = root.SUStore = S.create(b.localStorage, changed => b.fireWindow(changed ? 'su:local-change' : 'su:data-sync'));
  let authenticated = false, state = 'saving', connection = null, retries = 0;
  const statuses = [];
  function status(next) {
    const becameReady = state !== 'synced' && next === 'synced';state = next;statuses.push(next);
    b.fireWindow('su:sync-status', { detail:{ state } });
    if (becameReady) b.fireWindow('su:account-ready');
  }
  root.SUAuth = { signedIn:() => authenticated, syncReady:() => authenticated && state === 'synced', syncState:() => state,
    retrySync() { retries++;if (connection) connection.queue(); } };
  root.addEventListener('su:local-change', () => { if (connection) connection.queue(); });
  root.SUDiscovery = D.create(root);
  b.init(Array.from({ length:8 }, (_, i) => job({ link:'https://example.com/jobs/' + i })));
  function sign(uid) {
    if (connection) { connection.stop();connection = null; }
    authenticated = !!uid;state = 'saving';store.activate(uid);b.fireWindow('su:auth-changed');
  }
  sign('alice');
  t.after(() => { if (connection) connection.stop(); });
  function form() {
    const node = b.document.getElementById('su-discovery-form');
    if (node && !node.defaultsReady) { node.elements.info.value = node.elements.info.textContent;node.defaultsReady = true; }
    return node;
  }
  function open() { const button = b.document.getElementById('su-preferences-open');assert(button);button.focus();button.click();return form(); }
  function input(name, value) { const node = form().elements[name];node.value = value;node.focus();b.fire('input', node);return node; }
  function action(name) { const node = b.document.querySelector('[data-discovery="'+name+'"]');assert(node, name);node.click(); }
  function connect(transaction) { connection = S.connect(store, { listen:() => () => {}, transaction }, status);return connection; }
  return { b, root, store, form, open, input, action, sign, emitted, status, statuses, connect,
    get retries() { return retries; }, submit() { return b.fire('submit', form()); } };
}

test('preferences open in the shared modal layer and all dismissal paths restore the current trigger and unlock the board', t => {
  const u = preferencesUI(t);
  for (const close of ['close', 'skip', 'Escape', 'backdrop']) {
    const form = u.open();
    assert.equal(form.closest('#overlay-root'), u.b.overlay);assert.equal(form.getAttribute('role'), 'dialog');
    assert.equal(form.getAttribute('aria-modal'), 'true');assert.equal(u.b.grid.inert, true);
    assert.equal(u.b.document.body.classList.contains('su-dialog-open'), true);
    assert.equal(u.b.document.activeElement, form.elements.major);
    if (close === 'Escape') u.b.fire('keydown', form, { key:'Escape' });
    else if (close === 'backdrop') u.b.overlay.children[0].click();
    else u.action(close);
    assert.equal(u.form(), null, close);assert.equal(u.b.grid.inert, false);
    assert.equal(u.b.document.body.classList.contains('su-dialog-open'), false);
    assert.equal(u.b.document.activeElement, u.b.document.getElementById('su-preferences-open'));
    assert.equal(u.store.discovery().promptAnswered, true);
  }
});

test('keyboard focus wraps, interior clicks stay open and remote rerenders preserve the live draft and caret target', t => {
  const u = preferencesUI(t), form = u.open(), input = u.input('info', 'Unsubmitted private draft');
  form.click();assert.equal(u.form(), form);
  const items = form.querySelectorAll('button,input,textarea');
  items.at(-1).focus();assert.equal(u.b.fire('keydown', items.at(-1), { key:'Tab' }).defaultPrevented, true);
  assert.equal(u.b.document.activeElement, items[0]);
  assert.equal(u.b.fire('keydown', items[0], { key:'Tab', shiftKey:true }).defaultPrevented, true);
  assert.equal(u.b.document.activeElement, items.at(-1));
  input.focus();const remote = S.create(memoryStorage());remote.activate('alice');remote.setDiscovery('profile', { major:'Remote update' });
  u.store.receive(remote.snapshot());u.b.fireWindow('su:profile-ready');
  assert.equal(u.form(), form);assert.equal(form.elements.info.value, 'Unsubmitted private draft');
  assert.equal(u.b.document.activeElement, input);assert.deepEqual(u.emitted.map(e=>e.name), ['preference_open']);
  u.action('close');u.open();assert.equal(u.form().elements.info.value, '');
  assert.equal(u.form().elements.major.value, 'Remote update', 'closing discards only the unsubmitted draft');
});

test('an account change closes the old draft, while an eligible next account receives only its own new form', t => {
  const u = preferencesUI(t);u.open();u.input('major', 'Alice private draft');
  const old = u.form();u.sign('bob');assert.equal(u.form(), null);assert.equal(old.isConnected, false);
  for (let i = 0;i < 3;i++) u.root.SUDiscovery.dismiss(u.b.app.jobs[i].link, 'applied');
  u.b.app.render();assert(u.form(), 'the newly eligible account can get its own automatic form');
  assert.equal(u.form().elements.major.value, '');u.input('info', 'Bob draft');
  u.sign(null);assert.equal(u.form(), null);assert.equal(u.b.grid.inert, false);
  assert.equal(u.b.document.getElementById('su-preferences-open'), null);
  u.sign('alice');u.open();assert.equal(u.form().elements.major.value, '');
  assert.equal(u.form().elements.info.value, '');
});

test('automatic preferences wait for both a board dialog and an open native welcome', t => {
  const u = preferencesUI(t);
  u.b.app.setState({ feedbackOpen:true, feedbackCo:'Example', feedbackLink:u.b.app.jobs[0].link });
  for (let i = 0;i < 3;i++) u.root.SUDiscovery.dismiss(u.b.app.jobs[i].link, 'applied');
  u.b.app.render();assert.equal(u.form(), null);assert.equal(u.b.overlay.querySelectorAll('[role="dialog"]').length, 1);
  const welcome = u.b.document.createElement('dialog');welcome.id = 'su-launch';welcome.setAttribute('open', '');u.b.document.body.appendChild(welcome);
  u.b.app.setState({ feedbackOpen:false });assert.equal(u.form(), null, 'native dialog semantics must also defer preferences');
  welcome.removeAttribute('open');u.b.app.renderOverlays();assert(u.form());
  assert.equal(u.b.overlay.querySelectorAll('[role="dialog"]').length, 1);
});

test('failed save and clear display an error inside the preserved modal without losing answers or emitting success', t => {
  const u = preferencesUI(t), form = u.open();u.input('major', 'Photography');u.input('info', 'Keep this draft');
  const original = u.store.setDiscovery;
  u.store.setDiscovery = () => { throw new Error('Quota exceeded'); };
  u.submit();assert.equal(u.form(), form);assert.match(form.querySelector('.su-preferences-error').textContent, /Could not save/);
  assert.equal(form.elements.info.value, 'Keep this draft');assert.deepEqual(u.emitted.map(e=>e.name), ['preference_open','preference_error']);
  u.action('clear');assert.equal(u.form(), form);assert.match(form.querySelector('.su-preferences-error').textContent, /could not be saved/);
  assert.equal(form.elements.major.value, 'Photography');assert.deepEqual(u.emitted.map(e=>e.name), ['preference_open','preference_error','preference_error']);
  u.action('close');assert.equal(u.form(), null, 'storage failure never traps the visitor');
  u.store.setDiscovery = original;
});

test('Skip for now remains a dismissal when the browser cannot persist the prompt receipt', t => {
  const u = preferencesUI(t);u.open();u.input('major', 'Unsubmitted answer');
  u.store.setDiscovery = () => { throw new Error('Quota exceeded'); };
  u.action('skip');assert.equal(u.form(), null, 'an optional question must stay skippable when storage fails');
  assert.equal(u.b.grid.inert, false);assert.equal(u.b.document.body.classList.contains('su-dialog-open'), false);
  assert.equal(u.b.document.activeElement, u.b.document.getElementById('su-preferences-open'));
  assert.deepEqual(u.emitted.map(e=>e.name), ['preference_open'], 'a failed persistent skip is not reported as saved');
  u.b.app.render();assert.equal(u.form(), null, 'this visit does not immediately repeat a dismissed prompt');
});

test('save and clear acknowledge local persistence separately from confirmed sync, and Retry follows a real failed transaction', async t => {
  const u = preferencesUI(t);let fail = false, hold = false, finish;
  const connection = u.connect(async records => {
    if (fail) throw new Error('Offline');
    if (hold) await new Promise(resolve => { finish = resolve; });
    return records;
  });
  await connection.flush();await tick();
  u.open();u.input('major', 'Photography');u.input('info', 'Not analytics data');hold = true;u.submit();
  assert.equal(u.form(), null);assert.equal(u.store.discovery().profile.major, 'Photography');
  assert.match(u.b.document.getElementById('su-preference-status').textContent, /Syncing/);
  const pending = connection.flush();await tick();assert.equal(typeof finish, 'function');
  assert.doesNotMatch(u.b.document.getElementById('su-preference-status').textContent, /in your account/);
  finish();hold = false;await pending;await tick();
  assert.equal(u.b.document.getElementById('su-preference-status').textContent, 'Preferences saved in your account.');
  u.open();fail = true;u.action('clear');await connection.flush();
  assert.equal(u.store.discovery().profile, undefined);
  assert.equal(u.b.document.getElementById('su-preference-status').textContent, 'Preferences cleared on this device. Account sync paused.');
  assert.equal(u.b.document.getElementById('su-preference-retry').hidden, false);
  fail = false;u.action('retry');assert.equal(u.retries, 1);await connection.flush();
  assert.equal(u.b.document.getElementById('su-preference-status').textContent, 'Preferences cleared in your account.');
  assert.equal(u.b.document.getElementById('su-preference-retry').hidden, true);
  assert.deepEqual(u.emitted.map(event => [event.name, Object.keys(event.payload)]), [['preference_open', []], ['preference_save', []], ['preference_open', []], ['preference_clear', []]]);
});

test('a delayed old-account save cannot restore an old status or draft after switching accounts', async t => {
  const u = preferencesUI(t);let finish;
  const connection = u.connect(records => new Promise(resolve => { finish = () => resolve(records); }));
  u.open();u.input('major', 'Alice saved preference');u.submit();
  const pending = connection.flush();assert.equal(typeof finish, 'function');
  u.sign('bob');u.open();const form = u.form();u.input('info', 'Bob unsubmitted draft');
  finish();await pending;await tick();
  assert.equal(u.store.owner(), 'bob');assert.equal(u.store.discovery().profile, undefined);
  assert.equal(u.form(), form);assert.equal(form.elements.info.value, 'Bob unsubmitted draft');
  assert.equal(form.elements.major.value, '');assert.equal(u.b.document.getElementById('su-preference-status'), null);
});

function memoryStorage() {
  const values = new Map();return { getItem:key => values.get(key) ?? null, setItem:(key, value) => values.set(key, String(value)), removeItem:key => values.delete(key) };
}

test('the optional third question is progressively disclosed and keeps a typed draft during refresh',t=>{
 const u=preferencesUI(t);u.open();const details=u.form().querySelector('details');
 assert.equal(details.getAttribute('open'),null);assert.match(details.querySelector('summary').textContent,/Anything else/);
 assert(u.form().elements.major);assert(u.form().elements.location);
 details.setAttribute('open','');u.input('info','Explore creative technology');u.b.fireWindow('su:profile-ready');
 assert.equal(u.form().querySelector('details'),details);assert.equal(details.getAttribute('open'),'');assert.equal(u.form().elements.info.value,'Explore creative technology');
 u.submit();u.open();assert.equal(u.form().querySelector('details').getAttribute('open'),'');assert.equal(u.form().elements.info.value,'Explore creative technology');
});
