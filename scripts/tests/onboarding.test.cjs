const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const policy = require('../../js/onboarding.js');
const source = fs.readFileSync(path.join(__dirname, '../../js/onboarding.js'), 'utf8');
let renderReleaseScript;
before(async () => { ({ renderReleaseScript } = await import(pathToFileURL(path.join(__dirname, '../version.mjs')).href)); });

function store(entries = []) {
  const values = new Map(entries);
  return { values, getItem:key => values.get(key) ?? null, setItem(key, value) { values.set(key, String(value)); } };
}
const blocked = { getItem() { throw new Error('Storage denied'); }, setItem() { throw new Error('Storage denied'); } };

// The offline lock adapter queues callbacks by resource name, as separate tabs
// sharing one origin do. It does not claim to test a browser's native lock service.
function lockManager() {
  const tails = new Map(), active = new Set(), requests = [];
  return { active, requests, request(name, options, callback) {
    requests.push({ name, mode:options.mode });
    const task = (tails.get(name) || Promise.resolve()).then(async () => {
      active.add(name);try { return await callback({ name, mode:options.mode }); } finally { active.delete(name); }
    });
    tails.set(name, task.catch(() => {}));return task;
  } };
}

test('the Version 2 family retains old receipts and stores count plus dismissal without touching account data', async () => {
  assert.equal(policy.key, 'su_welcome_v2_seen');
  assert.equal(policy.stateKey, 'su_welcome_v2_state');assert.equal(policy.limit, 2);
  const local = store([['su_saved_jobs', 'private jobs'], ['su_sync_v2:account', 'private tracker']]);
  assert.deepEqual(policy.readState([local]), { shown:0, dismissed:false });
  assert.equal(policy.writeState([local], { shown:1, dismissed:false }), true);
  assert.deepEqual(policy.readState([local]), { shown:1, dismissed:false });
  assert.equal(local.getItem(policy.key), null, 'viewing does not count as explicit dismissal');
  assert.equal(local.values.get('su_saved_jobs'), 'private jobs');
  assert.equal(local.values.get('su_sync_v2:account'), 'private tracker');
  assert.equal(local.values.size, 3);
  for (const value of ['', '0', 'true', 'null', '{"seen":true}']) {
    assert.equal(policy.readState([store([[policy.key, value]])]).dismissed, false);
  }
  assert.equal(policy.readState([store([[policy.key, '1']])]).dismissed, true, 'legacy visitors are never automatically reintroduced');
  assert.equal(policy.writeState([local], { shown:1, dismissed:true }), true);
  assert.equal(local.getItem(policy.key), '1', 'older cached releases can honor dismissal');
});

test('storage failures and silent rejected writes fall back to a verified session receipt', async () => {
  const session = store(), silent = { getItem() { return null; }, setItem() {} };
  assert.equal(policy.writeState([null, blocked, silent, session], { shown:2, dismissed:false }), true);
  assert.deepEqual(policy.readState([blocked, session]), { shown:2, dismissed:false });
  assert.equal(policy.writeState([null, blocked, silent], { shown:1, dismissed:true }), false);
  assert.deepEqual(policy.readState([null, blocked, silent]), { shown:0, dismissed:false });
  const local = store([[policy.stateKey, '{"shown":1,"dismissed":true}']]);
  assert.deepEqual(policy.readState([local, session]), { shown:2, dismissed:true }, 'the strongest receipt wins over a stale store');
  for (const value of ['{', 'null', '1', '{"shown":-1,"dismissed":false}', '{"shown":1.5,"dismissed":false}', '{"shown":"2","dismissed":false}', '{"shown":1,"dismissed":"false"}']) {
    assert.deepEqual(policy.readState([store([[policy.stateKey, value]])]), { shown:0, dismissed:false }, value);
  }
  assert.deepEqual(policy.readState([store([[policy.stateKey, '{"shown":99,"dismissed":false}']])]), { shown:2, dismissed:false });
});

test('incoming job links and OAuth returns keep their requested task', async () => {
  for (const query of ['?job=https%3A%2F%2Fcompany.com%2Fjob', '?job=', '?%6Aob=1', '?code=1&state=2', '?state=1', '?error=access_denied', '?oauth_token=1']) {
    assert.equal(policy.incomingTask(query, ''), true, query);
  }
  for (const hash of ['#access_token=abc', '#id_token=abc&state=xyz']) assert.equal(policy.incomingTask('', hash), true, hash);
  for (const [query, hash] of [['', ''], ['?theme=casino', ''], ['?utm_source=newsletter', '#top'], ['?job_title=designer', '']]) {
    assert.equal(policy.incomingTask(query, hash), false, query + hash);
  }
});

// Executes the complete browser script. This adapter models native dialog API
// calls, events, DOM replacement and focus, not layout or browser focus trapping.
function welcome({ local = store(), session = store(), locks = lockManager(), search = '', hash = '', version = '2.1.0', unavailable = false, showError = false, releaseAvailable = true } = {}) {
  let document, dialog, showCalls = 0, now = 0, timerId = 0;
  const timers = new Map();
  function setTimer(callback, delay) { const id = ++timerId;timers.set(id, { callback, at:now + Number(delay || 0) });return id; }
  function clearTimer(id) { timers.delete(id); }
  async function advance(ms) {
    const end = now + ms;
    while (true) {
      const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      timers.delete(due[0]);now = due[1].at;due[1].callback();await new Promise(resolve => setImmediate(resolve));
    }
    now = end;await new Promise(resolve => setImmediate(resolve));
  }
  class Element {
    constructor(tag, attrs = {}) { this.tagName = tag.toUpperCase();this.attrs = attrs;this.children = [];this.text = '';this.listeners = {};this.style = {};this.parentElement = null;this.scrollTop = 0;this.open = false; }
    get isConnected() { return this === document.body || !!(this.parentElement && this.parentElement.isConnected); }
    set id(value) { this.attrs.id = value; } get id() { return this.attrs.id; }
    set className(value) { this.attrs.class = value; }
    get hidden() { return this.attrs.hidden !== undefined; } set hidden(value) { if (value) this.attrs.hidden = ''; else delete this.attrs.hidden; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.text = String(value);for (const child of this.children) child.parentElement = null;this.children = []; }
    setAttribute(key, value) { this.attrs[key] = String(value); } getAttribute(key) { return this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    appendChild(child) { child.parentElement = this;this.children.push(child);return child; }
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
    dispatch(type, extra = {}) {
      const event = { target:this, preventDefault() { this.defaultPrevented = true; }, ...extra };
      for (const listener of this.listeners[type] || []) listener(event);
      return event;
    }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      if (selector.includes(':not(:disabled)')) { if (this.getAttribute('disabled') !== null) return false;selector = selector.replace(':not(:disabled)', ''); }
      const tag = selector.match(/^[a-z]+/i);if (tag && this.tagName !== tag[0].toUpperCase()) return false;
      const id = selector.match(/#([\w-]+)/);if (id && this.id !== id[1]) return false;
      const cls = selector.match(/\.([\w-]+)/);if (cls && !(this.attrs.class || '').split(/\s+/).includes(cls[1])) return false;
      for (const attr of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
        if (this.getAttribute(attr[1]) === null || (attr[2] !== undefined && this.getAttribute(attr[1]) !== attr[2])) return false;
      }
      return true;
    }
    querySelectorAll(selector) {
      const matches = [];
      for (const child of this.children) { if (child.matches(selector)) matches.push(child);matches.push(...child.querySelectorAll(selector)); }
      return matches;
    }
    querySelector(selector) {
      for (const child of this.children) { if (child.matches(selector)) return child;const match = child.querySelector(selector);if (match) return match; }
      return null;
    }
    closest(selector) { for (let node = this;node;node = node.parentElement) if (node.matches(selector)) return node;return null; }
    focus() { document.activeElement = this; }
    getClientRects() { for (let el = this; el; el = el.parentElement) if (el.hidden || el.getAttribute('hidden') !== null || el.style.display === 'none') return []; return [{}]; }
    getBoundingClientRect() { return { left:10, right:750, top:20, bottom:700 }; }
    showModal() { showCalls++;if (showError) throw new Error('Cannot show dialog');this.open = true;(this.querySelector('[autofocus]') || this).focus(); }
    close() { if (!this.open) return;this.open = false;this.dispatch('close'); }
    set innerHTML(html) {
      this.html = html;this.text = '';for (const child of this.children) child.parentElement = null;this.children = [];
      const stack = [this], voids = new Set(['BR', 'IMG', 'INPUT', 'HR']);
      for (const token of html.matchAll(/<\/?[\w-]+\b(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g)) {
        const raw = token[0];if (raw[0] !== '<') { stack.at(-1).text += raw;continue; }
        const name = raw.match(/^<\/?([\w-]+)/)[1];
        if (raw.startsWith('</')) { let i = stack.length - 1;while (i > 0 && stack[i].tagName !== name.toUpperCase()) i--;if (i > 0) stack.length = i;continue; }
        const attrs = {};
        for (const attr of raw.slice(name.length + 1, raw.endsWith('/>') ? -2 : -1).matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[attr[1]] = attr[2] ?? attr[3] ?? attr[4] ?? '';
        const child = stack.at(-1).appendChild(new Element(name, attrs));
        if (!voids.has(child.tagName) && !raw.endsWith('/>')) stack.push(child);
      }
    }
  }
  document = { overlay:null, hidden:false, readyState:'complete', createElement(tag) { const node = new Element(tag);if (tag === 'dialog') { dialog = node;if (unavailable) node.showModal = undefined; }return node; },
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
    querySelector(selector) { return selector === '#overlay-root [role="dialog"]' ? this.overlay : this.body.querySelector(selector); } };
  document.body = new Element('body');document.body.style.overflow = 'auto';
  const opener = document.body.appendChild(new Element('button', { 'data-act':'openWelcome' }));document.activeElement = opener;
  const window = { document, navigator:{ locks }, SUApp:{ state:{} }, setTimeout:setTimer, clearTimeout:clearTimer };
  for (const [name, value] of [['localStorage', local], ['sessionStorage', session]]) {
    if (value === 'getter-denied') Object.defineProperty(window, name, { get() { throw new Error('Storage property denied'); } });
    else window[name] = value;
  }
  const context = vm.createContext({ window, document, location:{ search, hash }, URLSearchParams, setTimeout:setTimer, clearTimeout:clearTimer, Date:class extends Date { static now() { return now; } } });
  if (releaseAvailable) vm.runInContext(renderReleaseScript({ schemaVersion:1, currentVersion:version,
    releases:[{ version, date:'2026-09-05', title:'Test release', changes:['Test release.'] }] }), context);
  vm.runInContext(source, context);
  return { window, document, opener, local, session, locks, advance, get now() { return now; }, get timerCount() { return timers.size; }, async auto() { const pending = window.SUWelcome.maybeShow();await advance(30000);await pending; }, get dialog() { return dialog; }, get showCalls() { return showCalls; },
    click(selector) { const target = dialog.querySelector(selector);assert(target, selector);dialog.dispatch('click', { target });return target; } };
}

test('explicit first-visit dismissal suppresses future automatic displays across Version 2 patches', async () => {
  const local = store(), first = welcome({ local });
  await first.auto();
  assert.equal(first.showCalls, 1);assert.equal(first.dialog.tagName, 'DIALOG');assert.equal(first.dialog.open, true);
  assert.equal(first.document.body.style.overflow, 'hidden');
  assert.equal(first.document.activeElement.getAttribute('aria-label'), 'Close Latest Update');
  assert.deepEqual(policy.readState([local]), { shown:1, dismissed:false });
  await first.auto();assert.equal(first.showCalls, 1);
  first.click('[data-launch-close]');
  assert.deepEqual(policy.readState([local]), { shown:1, dismissed:true });
  assert.equal(first.dialog.open, false);assert.equal(first.document.body.style.overflow, 'auto');assert.equal(first.document.activeElement, first.opener);
  for (const version of ['2.1.0', '2.1.1', '2.1.9', '2.2.0']) {
    const reload = welcome({ local, version });await reload.auto();assert.equal(reload.showCalls, 0, version);
  }
});

test('X, the primary action, Escape and an outside click all persist explicit dismissal before the cap', async () => {
  for (const dismiss of [w => w.click('.su-launch-close'), w => w.click('.su-launch-primary'), w => w.dialog.dispatch('cancel'), w => w.dialog.dispatch('click', { clientX:0, clientY:0 })]) {
    const local = store(), first = welcome({ local });await first.auto();
    dismiss(first);assert.equal(first.dialog.open, false);
    assert.deepEqual(policy.readState([local]), { shown:1, dismissed:true });
    const reload = welcome({ local });await reload.auto();assert.equal(reload.showCalls, 0);
    assert.equal(reload.window.SUWelcome.open(), true, 'What’s new stays available after every dismissal path');
  }
});

test('reload without dismissal permits at most two automatic appearances, while manual What’s new still opens', async () => {
  const local = store();
  for (const [index, version] of ['2.2.0', '2.2.1', '2.3.0', '2.4.9'].entries()) {
    const visit = welcome({ local, version });
    Object.defineProperty(visit.window, 'SUAuth', { get() { throw new Error('Welcome must not depend on sign-in'); } });
    await visit.auto();await visit.auto();
    assert.equal(visit.showCalls, index < 2 ? 1 : 0, version);
    assert.deepEqual(policy.readState([local]), { shown:Math.min(index + 1, 2), dismissed:false });
  }
  const manual = welcome({ local });assert.equal(manual.window.SUWelcome.open(), true);
  assert.deepEqual(policy.readState([local]), { shown:2, dismissed:false }, 'manual opening spends no automatic appearance');
  manual.click('.su-launch-primary');
  assert.deepEqual(policy.readState([local]), { shown:2, dismissed:true });
  assert.equal(manual.window.SUWelcome.open(), true, 'explicit dismissal never removes manual discovery');
});

test('legacy local or session receipts suppress automatic onboarding without a migration popup', async () => {
  for (const target of ['local', 'session']) {
    const previous = store([[policy.key, '1']]);
    const visit = welcome({ [target]:previous });await visit.auto();
    assert.equal(visit.showCalls, 0);assert.equal(previous.getItem(policy.stateKey), null, 'reading old state does not rewrite it');
    assert.equal(visit.window.SUWelcome.open(), true);
  }
});

test('without verified shared storage automatic entry stays quiet, while session fallback remembers manual dismissal', async () => {
  const session = store(), first = welcome({ local:'getter-denied', session });await first.auto();assert.equal(first.showCalls, 0);
  assert.equal(session.getItem(policy.stateKey), null, 'a tab-only receipt cannot reserve a browser-wide appearance');
  assert.equal(first.window.SUWelcome.open(), true);first.click('[data-launch-close]');
  assert.deepEqual(policy.readState([session]), { shown:0, dismissed:true });
  assert.equal(session.getItem(policy.key), '1');
  const reload = welcome({ local:blocked, session });await reload.auto();assert.equal(reload.showCalls, 0);
  assert.equal(reload.window.SUWelcome.open(), true, 'session dismissal preserves manual discovery after reload');
  const silent = welcome({ local:{ getItem() { return null; }, setItem() {} } });
  await silent.auto();assert.equal(silent.showCalls, 0, 'silently rejected local writes cannot enable automatic entry');
  assert.equal(silent.session.getItem(policy.stateKey), null);
  const denied = welcome({ local:'getter-denied', session:'getter-denied' });
  await denied.auto();await denied.auto();assert.equal(denied.showCalls, 0);
  assert.equal(denied.window.SUWelcome.open(), true);assert.equal(denied.dialog.open, true);
  denied.click('[data-launch-close]');await denied.auto();assert.equal(denied.showCalls, 1);
  assert.equal(denied.window.SUWelcome.open(), true, 'in-memory dismissal preserves manual access');
});

test('queued tabs reread the shared receipt inside one exclusive lock and cannot exceed two automatic appearances', async () => {
  const locks = lockManager(), local = store([[policy.stateKey, '{"shown":1,"dismissed":false}']]);
  let release;
  const blocker = locks.request('su-welcome-v2-auto', { mode:'exclusive' }, () => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  const a = welcome({ local, locks }), b = welcome({ local, locks });
  a.window.SUWelcome.maybeShow();b.window.SUWelcome.maybeShow();await a.advance(30000);await b.advance(30000);
  const first = a.window.SUWelcome.maybeShow(), second = b.window.SUWelcome.maybeShow();
  assert.equal(a.window.SUWelcome.maybeShow(), first, 'one tab does not queue duplicate reservations on rerender');
  assert.equal(a.showCalls + b.showCalls, 0, 'neither tab opens while another holder owns the same resource');
  assert.equal(local.getItem(policy.stateKey), '{"shown":1,"dismissed":false}');
  assert.equal(locks.requests.length, 3);
  for (const request of locks.requests) assert.deepEqual(request, { name:'su-welcome-v2-auto', mode:'exclusive' });
  release();await Promise.all([blocker, first, second]);
  assert.equal(a.showCalls + b.showCalls, 1, 'only the second lifetime automatic appearance is allowed across the two tabs');
  assert.deepEqual(policy.readState([local]), { shown:2, dismissed:false });
  const reload = welcome({ local, locks });await reload.auto();assert.equal(reload.showCalls, 0);
});

test('unavailable or rejected Web Locks fail quietly without consuming storage or disabling manual discovery', async () => {
  for (const locks of [null, {}, { request() { throw new Error('Lock request denied'); } }, { request() { return Promise.reject(new Error('Lock service failed')); } }]) {
    const w = welcome({ locks });
    await w.auto();await w.auto();
    assert.equal(w.showCalls, 0);assert.equal(w.local.getItem(policy.stateKey), null);
    assert.equal(w.window.SUWelcome.open(), true);w.click('[data-launch-close]');
    assert.deepEqual(policy.readState([w.local]), { shown:0, dismissed:true });
  }
  const denied = welcome();
  Object.defineProperty(denied.window.navigator, 'locks', { get() { throw new Error('Locks unavailable'); } });
  await denied.auto();assert.equal(denied.showCalls, 0);
  assert.equal(denied.local.getItem(policy.stateKey), null);assert.equal(denied.window.SUWelcome.open(), true);
});

test('a manual opening or a new filter while queued is checked again before automatic entry', async () => {
  for (const event of ['manual', 'filter']) {
    const locks = lockManager(), w = welcome({ locks });let release;
    const blocker = locks.request('su-welcome-v2-auto', { mode:'exclusive' }, () => new Promise(resolve => { release = resolve; }));
    await Promise.resolve();
    w.window.SUWelcome.maybeShow();await w.advance(30000);const queued = w.window.SUWelcome.maybeShow();
    if (event === 'manual') { assert.equal(w.window.SUWelcome.open(), true);w.click('[data-launch-close]'); }
    else w.window.SUApp.state.openPanel = 'cat';
    release();await Promise.all([blocker, queued]);
    assert.equal(w.showCalls, event === 'manual' ? 1 : 0);
    assert.deepEqual(policy.readState([w.local]), { shown:0, dismissed:event === 'manual' });
    if (event === 'filter') {
      w.window.SUApp.state.openPanel = null;await w.auto();
      assert.equal(w.showCalls, 1, 'a deferred visit can introduce the welcome after the competing filter closes');
    }
  }
});

test('clearing browser storage resets browser-local welcome history without consulting account data', async () => {
  const local = store(), first = welcome({ local });await first.auto();first.click('.su-launch-close');
  local.values.clear();
  const reset = welcome({ local });await reset.auto();assert.equal(reset.showCalls, 1);
  assert.deepEqual(policy.readState([local]), { shown:1, dismissed:false }, 'cleared storage cannot retain an earlier receipt');
});

test('shared links do not consume the receipt, and manual reopening can still introduce the release', async () => {
  const local = store(), shared = welcome({ local, search:'?job=https%3A%2F%2Fcompany.com%2Fjob' });
  await shared.auto();assert.equal(shared.showCalls, 0);assert.equal(local.getItem(policy.key), null);assert.equal(local.getItem(policy.stateKey), null);
  const normal = welcome({ local });await normal.auto();assert.equal(normal.showCalls, 1);
  const authReturn = welcome({ local:store(), hash:'#id_token=secret-token' });
  await authReturn.auto();assert.equal(authReturn.showCalls, 0);
  assert.equal(authReturn.window.SUWelcome.open(), true);assert.equal(authReturn.local.getItem(policy.key), null);
  authReturn.click('[data-launch-close]');assert.equal(authReturn.local.getItem(policy.key), '1');
  assert(!authReturn.dialog.html.includes('secret-token'));
});

test('load errors, open filters and existing dialogs defer automatic onboarding without consuming the receipt', async () => {
  const w = welcome();
  w.window.SUApp._loadError = true;await w.auto();assert.equal(w.showCalls, 0);
  w.window.SUApp._loadError = false;w.window.SUApp.state.openPanel = 'cat';await w.auto();assert.equal(w.showCalls, 0);
  w.window.SUApp.state.openPanel = null;w.document.overlay = {};await w.auto();assert.equal(w.showCalls, 0);
  assert.equal(w.window.SUWelcome.open(), false);assert.equal(w.local.getItem(policy.key), null);
  w.document.overlay = null;await w.auto();assert.equal(w.showCalls, 1);
});

test('turning a card and returning restores focus; Escape and outside clicks close and restore the opener', async () => {
  const w = welcome();w.window.SUWelcome.open();
  w.click('[data-launch-feature="themes"]');
  assert.equal(w.document.activeElement.getAttribute('data-launch-back'), '');
  w.click('[data-launch-back]');assert.equal(w.document.activeElement.getAttribute('data-launch-feature'), 'themes');
  w.dialog.dispatch('click', { clientX:100, clientY:100 });assert.equal(w.dialog.open, true, 'dialog interior is not the backdrop');
  const cancel = w.dialog.dispatch('cancel');assert.equal(cancel.defaultPrevented, true);assert.equal(w.dialog.open, false);assert.equal(w.document.activeElement, w.opener);
  w.window.SUWelcome.open();w.dialog.dispatch('click', { clientX:0, clientY:0 });assert.equal(w.dialog.open, false);assert.equal(w.document.body.style.overflow, 'auto');
});

test('closing after the board replaces its opener focuses the current What’s new control', async () => {
  const w = welcome();w.window.SUWelcome.open();
  const replacement = w.document.createElement('button');replacement.setAttribute('data-act', 'openWelcome');
  w.document.body.children = w.document.body.children.filter(node => node !== w.opener);w.opener.parentElement = null;w.document.body.appendChild(replacement);
  w.click('[data-launch-close]');assert.equal(w.document.activeElement, replacement);
});

test('automatic entry from BODY returns to What’s new instead of leaving keyboard focus on the page', async () => {
  const w = welcome();w.document.activeElement = w.document.body;await w.auto();
  w.click('[data-launch-close]');assert.equal(w.document.activeElement, w.opener);
});

test('Tab and Shift+Tab wrap at the current dialog boundaries after every feature changes the content', async () => {
  const w = welcome();w.window.SUWelcome.open();
  function checkBoundaries() {
    const actions = w.dialog.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]').filter(el => el.getClientRects().length);
    const first = actions[0], last = actions.at(-1);
    if (w.dialog.querySelector('.su-launch-detail')) {
      if (actions.length === 2) assert.equal(last.getAttribute('role'), 'region', 'detail ends at its keyboard-scrollable content');
      else assert.equal(last.getAttribute('href'), '/internships.html', 'internships detail ends at its optional internal browse link');
    } else assert.equal(last.getAttribute('data-su-version'), '', 'overview ends at version history');
    last.focus();assert.equal(w.dialog.dispatch('keydown', { key:'Tab' }).defaultPrevented, true);assert.equal(w.document.activeElement, first);
    first.focus();assert.equal(w.dialog.dispatch('keydown', { key:'Tab', shiftKey:true }).defaultPrevented, true);assert.equal(w.document.activeElement, last);
    if (actions.length > 2) { actions[1].focus();assert.notEqual(w.dialog.dispatch('keydown', { key:'Tab' }).defaultPrevented, true, 'ordinary browser tab order remains available'); }
  }
  checkBoundaries();
  for (const key of ['advice','themes','sync','internships']) { w.click('[data-launch-feature="'+key+'"]');checkBoundaries();w.click('[data-launch-back]');checkBoundaries(); }
});

test('the real release helper fills exact-version history on dynamic welcome creation and keeps it after reopening', async () => {
  const w = welcome();w.window.SUWelcome.open();
  const link = w.dialog.querySelector('[data-su-version]');
  assert.equal(link.textContent, 'Version 2.1.0');
  assert.equal(link.getAttribute('href'), '/versions.html#version-2-1-0');
  assert.equal(link.getAttribute('aria-label'), 'Version 2.1.0. View version history');
  assert.equal(new URL(link.getAttribute('href'), 'http://localhost:8000/jobs/casino/').href, 'http://localhost:8000/versions.html#version-2-1-0');
  w.click('[data-launch-feature="sync"]');assert.equal(w.dialog.querySelector('[data-su-version]'), link);
  w.dialog.dispatch('cancel');w.window.SUWelcome.open();
  assert.equal(w.dialog.querySelector('[data-su-version]'), link);assert.equal(link.textContent, 'Version 2.1.0');
  const missing = welcome({ releaseAvailable:false });assert.equal(missing.window.SUWelcome.open(), true);
  assert.equal(missing.dialog.querySelector('[data-su-version]').getAttribute('href'), '/versions.html', 'history fallback survives an unavailable release script');
});

test('unavailable or failed native modal APIs fail without throwing or locking the page', async () => {
  for (const options of [{ unavailable:true }, { showError:true }]) {
    const w = welcome(options);assert.equal(w.window.SUWelcome.open(), false);
    assert.equal(w.dialog.open, false);assert.equal(w.document.body.style.overflow, 'auto');assert.equal(w.local.getItem(policy.key), null);
  }
});

test('a failed automatic native dialog does not spend an appearance or retry on each board render', async () => {
  for (const options of [{ unavailable:true }, { showError:true }]) {
    const local = store(), failed = welcome({ local, ...options });
    await failed.auto();await failed.auto();
    assert.equal(failed.showCalls, options.unavailable ? 0 : 1);
    assert.equal(failed.dialog.open, false);assert.equal(failed.document.body.style.overflow, 'auto');
    assert.deepEqual(policy.readState([local]), { shown:0, dismissed:false });
    const retry = welcome({ local });await retry.auto();assert.equal(retry.showCalls, 1);
    assert.deepEqual(policy.readState([local]), { shown:1, dismissed:false });
  }
});

test('Latest Update replaces Portfolio Graded with an informational internships card and internal browse action', async () => {
  const w = welcome();assert.equal(w.window.SUWelcome.open(), true);
  assert.equal(w.dialog.querySelector('#su-launch-title').textContent, 'Latest Update');
  const card = w.dialog.querySelector('[data-launch-feature="internships"]');
  assert(card);assert.equal(card.tagName, 'BUTTON');assert.equal(card.getAttribute('type'), 'button');
  assert.equal(card.getAttribute('href'), null);assert.equal(card.getAttribute('target'), null);
  assert.equal(w.dialog.querySelector('[data-launch-feature="portfolio"]'), null);
  assert.doesNotMatch(w.dialog.textContent, /Portfolio Graded|portfolio homepage|coming soon/i);
  assert.doesNotMatch(source, /portfoliograded\.com|portfoliograder\.com|EXAMPLE FEEDBACK|su-launch-tier/);
  w.click('[data-launch-feature="internships"]');
  const detail = w.dialog.querySelector('.su-launch-detail'), link = detail.querySelector('.su-launch-detail-link');
  assert.match(detail.textContent, /internship/i);assert(link);
  assert.match(link.textContent, /Browse internships/);assert.equal(link.getAttribute('href'), '/internships.html');
  assert.equal(link.getAttribute('target'), null, 'the board section opens in the same tab');
  assert.equal(new URL(link.getAttribute('href'), 'https://preview--stillunemployed.netlify.app/jobs/casino/').pathname, '/internships.html');
  assert.doesNotMatch(detail.textContent, /Portfolio Graded|portfolio homepage|coming soon/i);
  w.click('[data-launch-back]');assert.equal(w.document.activeElement.getAttribute('data-launch-feature'), 'internships');
  w.click('[data-launch-feature="sync"]');
  assert.equal(w.dialog.querySelector('.su-launch-detail').querySelector('a'), null, 'tracker detail stays informational');
});

test('Browse internships remembers dismissal while allowing natural same-tab navigation', async () => {
  const local = store(), first = welcome({ local });await first.auto();
  first.click('[data-launch-feature="internships"]');
  const link = first.dialog.querySelector('.su-launch-detail-link');
  const event = first.dialog.dispatch('click', { target:link });
  assert.equal(link.getAttribute('href'), '/internships.html');
  assert.equal(link.getAttribute('target'), null);
  assert.notEqual(event.defaultPrevented, true, 'the browser remains free to follow the internal link');
  assert.equal(first.dialog.open, false);
  assert.deepEqual(policy.readState([local]), { shown:1, dismissed:true }, 'dismissal is durable before navigation');
  assert.equal(local.getItem(policy.key), '1', 'the destination and older releases share the dismissal receipt');
  const destination = welcome({ local });await destination.auto();
  assert.equal(destination.showCalls, 0, 'the same-browser destination does not introduce the update again');
  assert.equal(destination.window.SUWelcome.open(), true, 'manual What’s new remains available');
});


test('feature details have one visible Back action and restore the complete overview', async () => {
  const w = welcome();w.window.SUWelcome.open();
  for (const feature of ['advice','themes','sync','internships']) {
    w.click('[data-launch-feature="'+feature+'"]');
    const actions = w.dialog.querySelectorAll('button:not(:disabled),a[href]').filter(el => el.getClientRects().length);
    assert.equal(actions.length, feature === 'internships' ? 2 : 1);
    assert.equal(actions[0].getAttribute('data-launch-back'), '');
    assert.equal(w.dialog.getAttribute('aria-labelledby'), 'su-launch-detail-title');
    for (const selector of ['.su-launch-overview-title','.su-launch-close','.su-launch-intro','.su-launch-footer','.su-launch-reopen']) assert(w.dialog.querySelector(selector).hidden);
    w.click('[data-launch-back]');
    assert.equal(w.dialog.getAttribute('aria-labelledby'), 'su-launch-title');
    assert.equal(w.document.activeElement.getAttribute('data-launch-feature'), feature);
    assert.equal(w.dialog.querySelector('.su-launch-footer').hidden, false);
  }
});

test('detail keyboard focus reaches its named scroll region without adding another visible action', async () => {
  const w = welcome();w.window.SUWelcome.open();
  for (const feature of ['advice','themes','sync','internships']) {
    w.click('[data-launch-feature="'+feature+'"]');
    const back = w.dialog.querySelector('[data-launch-back]');
    const scroll = w.dialog.querySelector('.su-launch-scroll');
    const focusable = w.dialog.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]').filter(el => el.getClientRects().length);
    const link = w.dialog.querySelector('.su-launch-detail-link');
    assert.deepEqual(focusable, link ? [back, scroll, link] : [back, scroll]);
    assert.equal(w.document.activeElement, back, 'Back keeps initial focus');
    assert.notEqual(w.dialog.dispatch('keydown', { key:'Tab' }).defaultPrevented, true, 'native Tab can enter the scroll region');
    assert.equal(scroll.getAttribute('role'), 'region');
    assert.equal(scroll.getAttribute('aria-labelledby'), w.dialog.querySelector('#su-launch-detail-title').id);
    scroll.focus();
    assert.notEqual(w.dialog.dispatch('keydown', { key:'PageDown' }).defaultPrevented, true, 'native keyboard scrolling is not suppressed');
    if (link) { assert.notEqual(w.dialog.dispatch('keydown', { key:'Tab' }).defaultPrevented, true);link.focus(); }
    assert.equal(w.dialog.dispatch('keydown', { key:'Tab' }).defaultPrevented, true);
    assert.equal(w.document.activeElement, back, 'Tab from content wraps to Back');
    w.click('[data-launch-back]');
    for (const attr of ['role','aria-labelledby','tabindex']) assert.equal(scroll.getAttribute(attr), null, attr+' is removed in overview');
    assert.equal(w.document.activeElement.getAttribute('data-launch-feature'), feature);
  }
});

test('automatic entry waits 30 seconds without spending a receipt or queuing duplicate timers', async () => {
  const w = welcome();w.window.SUWelcome.maybeShow();
  assert.equal(w.showCalls, 0);assert.equal(w.timerCount, 1);assert.equal(w.locks.requests.length, 0);
  assert.deepEqual(policy.readState([w.local]), { shown:0, dismissed:false });
  await w.advance(29999);w.window.SUWelcome.maybeShow();
  assert.equal(w.showCalls, 0);assert.equal(w.timerCount, 1, 'board rerenders keep the original deadline');
  assert.equal(w.local.getItem(policy.stateKey), null);
  await w.advance(1);
  assert.equal(w.showCalls, 1);assert.equal(w.dialog.open, true);assert.equal(w.locks.requests.length, 1);
  assert.deepEqual(policy.readState([w.local]), { shown:1, dismissed:false });
  await w.auto();assert.equal(w.showCalls, 1, 'later rerenders do not reopen within this visit');
});

test('manual What’s new opens immediately and its dismissal cancels the scheduled automatic introduction', async () => {
  const w = welcome();w.window.SUWelcome.maybeShow();await w.advance(1000);
  assert.equal(w.window.SUWelcome.open(), true);assert.equal(w.showCalls, 1);assert.equal(w.now, 1000);
  assert.equal(w.dialog.querySelector('#su-launch-title').textContent, 'Latest Update');
  assert.deepEqual(policy.readState([w.local]), { shown:0, dismissed:false }, 'manual discovery spends no automatic appearance');
  w.click('[data-launch-close]');await w.advance(60000);await w.auto();
  assert.equal(w.showCalls, 1);assert.deepEqual(policy.readState([w.local]), { shown:0, dismissed:true });
  assert.equal(w.local.getItem(policy.key), '1');assert.equal(w.window.SUWelcome.open(), true);
});

test('an overlay or filter opened during the delay still defers the automatic popup without consuming an appearance', async () => {
  for (const blocker of ['dialog','filter','feed']) {
    const w = welcome();w.window.SUWelcome.maybeShow();await w.advance(15000);
    if (blocker === 'dialog') w.document.overlay = {};
    else if (blocker === 'filter') w.window.SUApp.state.openPanel = 'cat';
    else w.window.SUApp._loadError = true;
    await w.advance(15000);assert.equal(w.showCalls, 0, blocker);assert.deepEqual(policy.readState([w.local]), { shown:0, dismissed:false });
    w.document.overlay = null;w.window.SUApp.state.openPanel = null;w.window.SUApp._loadError = false;
    w.window.SUWelcome.maybeShow();await w.advance(0);
    assert.equal(w.showCalls, 1, blocker+' resumes immediately after its elapsed delay and competing task finish');
  }
});

test('the delay starts with the first eligible request rather than elapsed time on a blocked page', async () => {
  const w = welcome();w.window.SUApp._loadError = true;w.window.SUWelcome.maybeShow();await w.advance(45000);
  assert.equal(w.showCalls, 0);assert.equal(w.timerCount, 0);assert.equal(w.local.getItem(policy.stateKey), null);
  w.window.SUApp._loadError = false;w.window.SUWelcome.maybeShow();await w.advance(29999);
  assert.equal(w.showCalls, 0);await w.advance(1);assert.equal(w.showCalls, 1);
});
