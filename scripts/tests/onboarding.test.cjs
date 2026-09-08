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
  return { values, getItem:key => values.get(key) ?? null, setItem(key, value) { values.set(key, String(value)); }, removeItem(key) { values.delete(key); } };
}
const blocked = { getItem() { throw new Error('Storage denied'); }, setItem() { throw new Error('Storage denied'); } };

// The offline lock adapter queues callbacks by resource name, as separate tabs
// sharing one origin do. It does not claim to test a browser's native lock service.
function lockManager() {
  const active = new Set(), requests = [];
  return { active, requests, request(name, options, callback) {
    requests.push({ name, ...options });
    if (active.has(name) && options.ifAvailable) return Promise.resolve(callback(null));
    active.add(name);
    return Promise.resolve().then(() => callback({ name })).finally(() => active.delete(name));
  } };
}

test('the deliberate announcement receipt is separate from old V2 receipts and account data', () => {
  assert.equal(policy.key, 'su_welcome_announcement_237_ack');
  const local = store([['su_welcome_v2_seen', '1'], ['su_welcome_v2_state', '{"shown":2,"dismissed":true}'], ['su_sync_v2:account', 'private tracker']]);
  const old = [...local.values];
  assert.equal(policy.acknowledged([local]), false);
  assert.equal(policy.writeReceipt([local], '1'), true);
  assert.equal(policy.acknowledged([local]), true);
  for (const [key, value] of old) assert.equal(local.getItem(key), value);
  assert.equal(local.values.size, old.length + 1);
});

test('receipts are exact, read failures are safe, and verified writes fall back to session storage', () => {
  for (const value of ['', '0', 'true', 'null', '{"seen":true}']) assert.equal(policy.acknowledged([store([[policy.key, value]])]), false);
  const session = store(), silent = { getItem() { return null; }, setItem() {} };
  assert.equal(policy.writeReceipt([null, blocked, silent, session], '1'), true);
  assert.equal(policy.acknowledged([blocked, session]), true);
  assert.equal(policy.writeReceipt([null, blocked, silent], '1'), false);
  assert.equal(policy.acknowledged([null, blocked, silent]), false);
});

test('incoming job links and OAuth returns keep their requested task', () => {
  for (const query of ['?job=https%3A%2F%2Fcompany.com%2Fjob', '?job=', '?%6Aob=1', '?code=1&state=2', '?state=1', '?error=access_denied', '?oauth_token=1']) assert.equal(policy.incomingTask(query, ''), true);
  for (const hash of ['#access_token=abc', '#id_token=abc&state=xyz']) assert.equal(policy.incomingTask('', hash), true);
  for (const [query, hash] of [['', ''], ['?theme=casino', ''], ['?utm_source=newsletter', '#top'], ['?job_title=designer', '']]) assert.equal(policy.incomingTask(query, hash), false);
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
    constructor(tag, attrs = {}) { this.tagName = tag.toUpperCase();this.attrs = attrs;this.children = [];this.text = '';this.listeners = {};this.style = { setProperty(key, value) { this[key] = value; } };this.parentElement = null;this.scrollTop = 0;this.open = false; }
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
    focus(options) { document.activeElement = this;this.lastFocusOptions = options; }
    remove() { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter(el => el !== this);this.parentElement = null; } }
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
  const window = { scrollY:0, document, navigator:{ locks }, SUApp:{ state:{} }, setTimeout:setTimer, clearTimeout:clearTimer };
  for (const [name, value] of [['localStorage', local], ['sessionStorage', session]]) {
    if (value === 'getter-denied') Object.defineProperty(window, name, { get() { throw new Error('Storage property denied'); } });
    else window[name] = value;
  }
  const context = vm.createContext({ window, document, location:{ search, hash }, URLSearchParams, setTimeout:setTimer, clearTimeout:clearTimer, Date:class extends Date { static now() { return now; } } });
  if (releaseAvailable) vm.runInContext(renderReleaseScript({ schemaVersion:1, currentVersion:version,
    releases:[{ version, date:'2026-09-05', title:'Test release', changes:['Test release.'] }] }), context);
  vm.runInContext(source, context);
  return { window, document, opener, local, session, locks, advance, get now() { return now; }, get timerCount() { return timers.size; }, async auto() { const pending = window.SUWelcome.maybeShow();await advance(0);await pending; }, get dialog() { return dialog; }, get showCalls() { return showCalls; },
    click(selector) { const target = dialog.querySelector(selector);assert(target, selector);dialog.dispatch('click', { target });return target; } };
}

test('new announcement opens at the initial shell without a feed wait, then primary acknowledgment survives patches and routes', async () => {
  const local = store([['su_welcome_v2_seen', '1'], ['su_welcome_v2_state', '{"shown":2,"dismissed":true}']]);
  const first = welcome({ local });first.window.SUApp._loading = true;
  await first.auto();
  assert.equal(first.now, 0);assert.equal(first.timerCount, 0);assert.equal(first.showCalls, 1);
  assert.equal(first.dialog.open, true);assert.equal(first.document.activeElement.id, 'su-launch-title');
  assert.equal(first.document.body.style.overflow, 'hidden');assert.equal(policy.acknowledged([local]), false);
  assert.equal(local.values.size, 2, 'display leaves no durable probe or view receipt');
  first.click('.su-launch-primary');
  assert.equal(first.dialog.open, false);assert.equal(policy.acknowledged([local]), true);
  assert.equal(first.document.body.style.overflow, 'auto');assert.equal(first.document.activeElement, first.opener);
  assert.equal(first.opener.lastFocusOptions.preventScroll, true);
  for (const version of ['2.3.7', '2.3.8', '2.4.9', '3.0.0']) {
    const next = welcome({ local, version });await next.auto();assert.equal(next.showCalls, 0, version);
    assert.equal(next.window.SUWelcome.open(), true, 'manual access is always available');
  }
  assert.equal(local.getItem('su_welcome_v2_seen'), '1');
  assert.equal(local.getItem('su_welcome_v2_state'), '{"shown":2,"dismissed":true}');
});

test('an unacknowledged reload can introduce again; no old display count silently substitutes for acknowledgment', async () => {
  const local = store();
  for (let visit = 0;visit < 3;visit++) {
    const w = welcome({ local });await w.auto();assert.equal(w.showCalls, 1);
    assert.equal(policy.acknowledged([local]), false);
  }
});

test('overview shows the current release as quiet text without adding another dismissal action', async () => {
  const w = welcome({ version:'2.4.1' });await w.auto();
  const footer = w.dialog.querySelector('.su-launch-footer');
  const version = footer.querySelector('.su-launch-version');
  assert.equal(version.textContent, 'v2.4.1');assert.equal(version.hidden, false);
  assert.equal(footer.children[0], version);
  assert.equal(version.tagName, 'SMALL');assert.equal(version.getAttribute('tabindex'), null);
  assert.equal(version.getAttribute('data-su-version'), null, 'generic version renderer must not replace the short label');
  assert.equal(footer.querySelectorAll('button').length, 1);assert.equal(footer.querySelectorAll('a').length, 0);
  w.click('[data-launch-feature="advice"]');assert.equal(footer.hidden, true);
  w.click('[data-launch-back]');assert.equal(footer.hidden, false);assert.equal(version.textContent, 'v2.4.1');
  assert.equal(policy.acknowledged([w.local]), false);
});

test('release label refreshes on reopening and missing metadata does not block the dialog', () => {
  const w = welcome({ releaseAvailable:false });w.window.SUWelcome.open();
  const version = w.dialog.querySelector('.su-launch-version');
  assert.equal(version.hidden, true);assert.equal(version.textContent, '');
  w.click('.su-launch-primary');
  w.window.SURelease = { version:'2.4.1' };w.window.SUWelcome.open();
  assert.equal(version.textContent, 'v2.4.1');assert.equal(version.hidden, false);
  w.click('.su-launch-primary');
  w.window.SURelease = { version:'2.4.2' };w.window.SUWelcome.open();
  assert.equal(version.textContent, 'v2.4.2');
  w.click('.su-launch-primary');
  w.window.SURelease = { version:'<img src=x onerror=alert(1)>' };w.window.SUWelcome.open();
  assert.equal(version.hidden, true);assert.equal(version.textContent, '');
  assert.equal(version.querySelector('img'), null);
});

test('initial focus remains on the static title and its outline exception does not target controls', async () => {
  const w = welcome();await w.auto();
  const title = w.dialog.querySelector('#su-launch-title');
  assert.equal(w.document.activeElement, title);assert.equal(title.tagName, 'H2');
  assert.equal(title.getAttribute('tabindex'), '-1');assert.equal(title.getAttribute('autofocus'), '');
  const css = fs.readFileSync(path.join(__dirname, '../../css/onboarding.css'), 'utf8');
  assert.match(css, /\.su-launch #su-launch-title:focus\s*\{\s*outline:none;\s*\}/);
  assert.match(css, /\.su-launch :focus-visible\s*\{\s*outline:3px solid var\(--su-orange-text\)/);
  assert.match(css, /\.su-launch-version\s*\{\s*margin-right:auto/);
  assert.match(css, /\.su-launch-footer\s*\{[^}]*flex-wrap:wrap/);
  // Native computed focus/geometry is verified separately during integration QA.
});

test('automatic intro has no X and ignores backdrop, internal blank clicks and Escape without writing an acknowledgment', async () => {
  const w = welcome();await w.auto();assert.equal(w.dialog.querySelector('.su-launch-close'), null);
  for (const action of [() => w.dialog.dispatch('cancel'), () => w.dialog.dispatch('click', { clientX:0, clientY:0 }), () => w.dialog.dispatch('click', { clientX:20, clientY:30 })]) {
    action();assert.equal(w.dialog.open, true);assert.equal(policy.acknowledged([w.local]), false);
  }
  assert.equal(w.dialog.dispatch('cancel').defaultPrevented, true);
  w.click('.su-launch-primary');assert.equal(w.dialog.open, false);
});

test('automatic card details keep acknowledgment pending and return focus to their own card', async () => {
  const w = welcome();await w.auto();
  for (const feature of ['advice', 'themes', 'internships', 'sync']) {
    w.click('[data-launch-feature="'+feature+'"]');
    assert.equal(w.dialog.getAttribute('aria-labelledby'), 'su-launch-detail-title');
    assert.equal(w.document.activeElement.getAttribute('data-launch-back'), '');
    assert.equal(w.dialog.querySelectorAll('a').length, 0, 'no link bypasses the automatic intro acknowledgment');
    assert.equal(w.dialog.querySelector('.su-launch-footer').hidden, true);
    w.dialog.dispatch('cancel');assert.equal(w.dialog.open, true);
    assert.equal(policy.acknowledged([w.local]), false);
    w.click('[data-launch-back]');
    assert.equal(w.document.activeElement.getAttribute('data-launch-feature'), feature);
    assert.equal(w.document.activeElement.lastFocusOptions.preventScroll, true);
  }
  w.click('.su-launch-primary');assert.equal(policy.acknowledged([w.local]), true);
});

test('manual opening has the same sole acknowledgment action and preserves board scroll', () => {
  const w = welcome();w.window.scrollY = 1680;
  w.window.scrollTo = () => assert.fail('onboarding must not scroll the board');
  assert.equal(w.window.SUWelcome.open(), true);
  assert.equal(w.dialog.dispatch('cancel').defaultPrevented, true);
  w.dialog.dispatch('click', { clientX:0, clientY:0 });
  assert.equal(w.dialog.open, true);assert.equal(policy.acknowledged([w.local]), false);
  w.click('[data-launch-feature="themes"]');w.click('[data-launch-back]');w.click('.su-launch-primary');
  assert.equal(w.dialog.open, false);assert.equal(w.window.scrollY, 1680);
  assert.equal(w.document.activeElement, w.opener);assert.equal(w.opener.lastFocusOptions.preventScroll, true);
  assert.equal(policy.acknowledged([w.local]), true);
});

test('manual internship detail is informational with go back only, never a navigation bypass', () => {
  const w = welcome();w.window.SUWelcome.open();w.click('[data-launch-feature="internships"]');
  assert.equal(w.dialog.querySelector('.su-launch-detail').querySelector('a'), null);
  const actions = w.dialog.querySelectorAll('button').filter(el => el.getClientRects().length);
  assert.equal(actions.length, 1);assert.equal(actions[0].getAttribute('data-launch-back'), '');
  w.dialog.dispatch('cancel');assert.equal(w.dialog.open, true);assert.equal(policy.acknowledged([w.local]), false);
  w.click('[data-launch-back]');w.click('.su-launch-primary');assert.equal(w.dialog.open, false);
});

test('welcome toast is nonblocking for exactly five seconds and does not take focus', async () => {
  const w = welcome();await w.auto();w.click('.su-launch-primary');
  const toast = w.document.querySelector('.su-launch-toast');assert(toast);
  assert.equal(toast.querySelector('[role="status"]').textContent, 'Welcome to version 2');
  assert.equal(toast.querySelector('button').textContent, 'version 2');
  assert.equal(w.document.activeElement, w.opener);
  await w.advance(4999);assert.equal(toast.isConnected, true);
  await w.advance(1);assert.equal(toast.isConnected, false);assert.equal(w.timerCount, 0);
});

test('underlined version 2 reopens the same overview without scrolling and retains sole primary dismissal', async () => {
  const w = welcome();await w.auto();w.click('.su-launch-primary');w.window.scrollY = 940;
  const toast = w.document.querySelector('.su-launch-toast'), button = toast.querySelector('button');
  button.focus();toast.dispatch('click', { target:button });
  assert.equal(w.dialog.open, true);assert.equal(w.window.scrollY, 940);assert.equal(toast.isConnected, false);
  assert.equal(w.dialog.querySelector('#su-launch-title').textContent, 'Latest Update');
  assert.equal(w.dialog.querySelectorAll('[data-launch-feature]').length, 4);
  w.dialog.dispatch('cancel');assert.equal(w.dialog.open, true);w.click('.su-launch-primary');assert.equal(w.dialog.open, false);assert.equal(w.window.scrollY, 940);
});

test('repeated acknowledgments replace the old toast and restart its full five seconds', async () => {
  const w = welcome();w.window.SUWelcome.open();w.click('.su-launch-primary');
  await w.advance(3000);const old = w.document.querySelector('.su-launch-toast');
  w.window.SUWelcome.open();w.click('.su-launch-primary');
  const latest = w.document.querySelector('.su-launch-toast');assert.notEqual(old, latest);assert.equal(old.isConnected, false);
  await w.advance(4999);assert(latest.isConnected);await w.advance(1);assert(!latest.isConnected);
});

test('blocked or silently rejected durable storage skips auto and still permits manual acknowledgment with session fallback', async () => {
  for (const local of ['getter-denied', blocked, { getItem() { return null; }, setItem() {}, removeItem() {} }]) {
    const session = store(), w = welcome({ local, session });await w.auto();assert.equal(w.showCalls, 0);
    assert.equal(w.window.SUWelcome.open(), true);w.click('.su-launch-primary');
    assert.equal(session.getItem(policy.key), '1');
    const reload = welcome({ local, session });await reload.auto();assert.equal(reload.showCalls, 0);
  }
  const w = welcome({ local:'getter-denied', session:'getter-denied' });await w.auto();
  assert.equal(w.window.SUWelcome.open(), true);w.click('.su-launch-primary');await w.auto();assert.equal(w.showCalls, 1);
});

test('storage failure at acknowledgment still closes and remembers in memory, with session persistence when available', async () => {
  const local = store(), w = welcome({ local });await w.auto();
  local.setItem = () => { throw new Error('Quota changed'); };
  w.click('.su-launch-primary');assert.equal(w.dialog.open, false);
  assert.equal(w.session.getItem(policy.key), '1');await w.auto();assert.equal(w.showCalls, 1);
});

test('a second tab never queues a late automatic intro behind the first tab', async () => {
  const local = store(), locks = lockManager(), first = welcome({ local, locks });await first.auto();
  const second = welcome({ local, locks });await second.auto();assert.equal(second.showCalls, 0);
  assert.equal(locks.requests.every(request => request.ifAvailable === true), true);
  first.click('.su-launch-primary');await second.advance(2000);await second.auto();assert.equal(second.showCalls, 0);
  assert.equal(locks.active.size, 0);const third = welcome({ local, locks });await third.auto();assert.equal(third.showCalls, 0);
});

test('missing lock support can open immediately, while rejected lock requests never trigger delayed retries', async () => {
  const supported = welcome({ locks:null });await supported.auto();assert.equal(supported.showCalls, 1);
  for (const locks of [{ request() { throw new Error('Denied'); } }, { request() { return Promise.reject(new Error('Denied')); } }]) {
    const w = welcome({ locks });await w.auto();await w.advance(30000);assert.equal(w.showCalls, 0);
    assert.equal(w.window.SUWelcome.open(), true);
  }
});

test('lock callback rechecks scroll and competing tasks rather than opening late', async () => {
  let run;const locks = { request(name, options, callback) { run = callback;return Promise.resolve(); } };
  for (const block of [w => { w.window.scrollY = 200; }, w => { w.document.overlay = {}; }, w => { w.window.SUWelcome.open();w.click('.su-launch-primary'); }]) {
    const w = welcome({ locks });w.window.SUWelcome.maybeShow();block(w);
    await run({});assert.equal(w.dialog?.open || false, false);assert(w.showCalls <= 1);
  }
});

test('already-scrolled, restored, hidden or busy boards never get an automatic interruption later', async () => {
  for (const blocker of ['scroll', 'hidden', 'panel', 'dialog', 'error']) {
    const w = welcome();
    if (blocker === 'scroll') w.window.scrollY = 900;
    if (blocker === 'hidden') w.document.hidden = true;
    if (blocker === 'panel') w.window.SUApp.state.openPanel = 'cat';
    if (blocker === 'dialog') w.document.overlay = {};
    if (blocker === 'error') w.window.SUApp._loadError = true;
    await w.auto();assert.equal(w.showCalls, 0, blocker);
    w.window.scrollY = 0;w.document.hidden = false;w.window.SUApp.state.openPanel = null;w.document.overlay = null;w.window.SUApp._loadError = false;
    await w.advance(30000);await w.auto();assert.equal(w.showCalls, 0, blocker+' does not resume');
    assert.equal(w.timerCount, 0);assert.equal(w.window.SUWelcome.open(), true);
  }
});

test('shared-job and auth returns skip automatic intro but preserve manual discovery', async () => {
  for (const options of [{ search:'?job=123' }, { search:'?code=auth' }, { hash:'#access_token=abc' }]) {
    const w = welcome(options);await w.auto();assert.equal(w.showCalls, 0);assert.equal(w.window.SUWelcome.open(), true);
  }
});

test('manual access works with any account state and no release metadata dependency', () => {
  const w = welcome({ releaseAvailable:false });
  Object.defineProperty(w.window, 'SUAuth', { get() { throw new Error('No account access needed'); } });
  assert.equal(w.window.SUWelcome.open(), true);
  assert.equal(w.dialog.querySelector('#su-launch-title').textContent, 'Latest Update');
});

test('keyboard can reach the primary action from initial focus and cycle overview and every detail', async () => {
  const w = welcome();await w.auto();
  const primary = w.dialog.querySelector('.su-launch-primary');
  assert.equal(w.dialog.dispatch('keydown', { key:'Tab', shiftKey:true }).defaultPrevented, true);
  assert.equal(w.document.activeElement, primary);
  function boundaries() {
    const items = w.dialog.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]').filter(el => el.getClientRects().length);
    const first = items[0], last = items.at(-1);
    first.focus();assert.equal(w.dialog.dispatch('keydown', { key:'Tab', shiftKey:true }).defaultPrevented, true);assert.equal(w.document.activeElement, last);
    last.focus();assert.equal(w.dialog.dispatch('keydown', { key:'Tab' }).defaultPrevented, true);assert.equal(w.document.activeElement, first);
  }
  boundaries();
  for (const feature of ['advice', 'themes', 'internships', 'sync']) {
    w.click('[data-launch-feature="'+feature+'"]');boundaries();
    const scroll = w.dialog.querySelector('.su-launch-scroll');
    assert.equal(scroll.getAttribute('role'), 'region');assert.equal(scroll.getAttribute('aria-labelledby'), 'su-launch-detail-title');
    scroll.focus();assert.notEqual(w.dialog.dispatch('keydown', { key:'PageDown' }).defaultPrevented, true);
    w.click('[data-launch-back]');assert.equal(scroll.getAttribute('tabindex'), null);boundaries();
  }
});

test('focus returns to the current opener after its old board node is replaced', () => {
  const w = welcome();w.window.SUWelcome.open();w.opener.remove();
  const replacement = w.document.createElement('button');replacement.setAttribute('data-act', 'openWelcome');w.document.body.appendChild(replacement);
  w.click('.su-launch-primary');assert.equal(w.document.activeElement, replacement);assert.equal(replacement.lastFocusOptions.preventScroll, true);
});

test('native dialog API failure does not freeze scrolling or write an acknowledgment', async () => {
  for (const options of [{ unavailable:true }, { showError:true }]) {
    const w = welcome(options);await w.auto();await w.auto();
    assert.equal(w.dialog.open, false);assert.equal(w.document.body.style.overflow, 'auto');assert.equal(policy.acknowledged([w.local]), false);
    assert.equal(w.showCalls, options.unavailable ? 0 : 1);
  }
});

test('overview keeps four notes in the new order, each with Click here, no label arrows or competing footer links', () => {
  const w = welcome();w.window.SUWelcome.open();
  const cards = w.dialog.querySelectorAll('[data-launch-feature]');
  assert.deepEqual(cards.map(card => card.getAttribute('data-launch-feature')), ['advice', 'themes', 'internships', 'sync']);
  for (const card of cards) {
    assert.equal(card.querySelector('.su-launch-card-label').querySelector('svg'), null);
    assert.equal(card.querySelector('.su-launch-card-hint').textContent, 'Click here');
    assert.equal(card.querySelector('.su-launch-preview').getAttribute('aria-hidden'), 'true');
    assert.equal(card.querySelector('button'), null);
  }
  assert.equal(cards[2].querySelector('.su-launch-card-label').textContent, 'Internships');
  assert.equal(w.dialog.querySelectorAll('a').length, 0);
  assert.equal(w.dialog.querySelectorAll('button').filter(el => el.getClientRects().length).length, 5);
  assert.doesNotMatch(w.dialog.textContent, /Suggest Jobs|Portfolio Graded|Version history|Internships are here/);
  const hint = cards[1].querySelector('.su-launch-card-hint');w.dialog.dispatch('click', { target:hint });
  assert.equal(w.dialog.querySelector('#su-launch-detail-title').textContent, 'Make it feel like you');
});

test('internship post-it uses the current actual theme paper and ink on each opening', () => {
  const w = welcome();
  w.window.SUApp.THEMES = { original:{ hiCard:'var(--su-yellow-paper)', hiInk:'#2A2118' }, beauty:{ hiCard:'linear-gradient(160deg,#7E1728,#5A0F1C)', hiInk:'#F3D9B8' } };
  w.window.SUApp.state.look = 'beauty';w.window.SUWelcome.open();
  assert.equal(w.dialog.style['--su-launch-intern-paper'], w.window.SUApp.THEMES.beauty.hiCard);
  assert.equal(w.dialog.style['--su-launch-intern-ink'], '#F3D9B8');
  w.click('.su-launch-primary');w.window.SUApp.state.look = 'original';w.window.SUWelcome.open();
  assert.equal(w.dialog.style['--su-launch-intern-paper'], 'var(--su-yellow-paper)');
  assert.equal(w.dialog.style['--su-launch-intern-ink'], '#2A2118');
});

test('tracker retains three faithful illustrative status rows and informational Google copy', () => {
  const w = welcome();w.window.SUWelcome.open();
  function rows(root) { return root.querySelectorAll('.su-launch-tracker-row').map(row => [row.querySelector('.su-launch-tracker-role').textContent, row.querySelector('.su-launch-tracker-status').textContent]); }
  const expected = [['Social Media Manager', 'Apply'], ['Graphic Designer', 'Interview'], ['Photographer', 'Offer']];
  assert.deepEqual(rows(w.dialog.querySelector('[data-launch-feature="sync"]')), expected);
  w.click('[data-launch-feature="sync"]');assert.deepEqual(rows(w.dialog.querySelector('.su-launch-detail')), expected);
  assert.match(w.dialog.textContent, /Sign in with Google to pick up on your phone or computer/);
  assert.equal(w.dialog.querySelector('.su-launch-detail').querySelector('a'), null);
});

test('narrow viewport structure reserves primary action outside the scrolling card region', () => {
  const w = welcome();w.window.SUWelcome.open();
  const scroll = w.dialog.querySelector('.su-launch-scroll'), footer = w.dialog.querySelector('.su-launch-footer');
  assert.equal(footer.parentElement, w.dialog);assert.equal(scroll.querySelector('.su-launch-footer'), null);
  const css = fs.readFileSync(path.join(__dirname, '../../css/onboarding.css'), 'utf8');
  assert.match(css, /\.su-launch-scroll\s*\{[^}]*min-height:0;[^}]*overflow:auto/);
  assert.match(css, /\.su-launch-footer\s*\{[^}]*flex:none/);
  assert.match(css, /max-height:calc\(100svh - 24px\)/);
  assert.match(css, /\.su-launch-preview\s*\{\s*min-height:120px/);
  assert.match(css, /\.su-launch-toast\s*\{[^}]*pointer-events:none/);
  assert.match(css, /\.su-launch-toast button\s*\{[^}]*pointer-events:auto/);
  assert.match(css, /\.su-launch-toast button\s*\{[^}]*text-decoration:underline/);
  // This verifies structural constraints only. Actual 320/390px geometry is native QA.
});

test('a removed toast or feed-render opener restores the visible Board menu summary', () => {
  const w = welcome();w.window.SUWelcome.open();w.opener.remove();
  const summary = w.document.createElement('summary');summary.id = 'su-board-menu-trigger';w.document.body.appendChild(summary);
  const hiddenLink = w.document.createElement('button');hiddenLink.setAttribute('data-act', 'openWelcome');hiddenLink.hidden = true;w.document.body.appendChild(hiddenLink);
  w.click('.su-launch-primary');assert.equal(w.document.activeElement, summary);assert.equal(summary.lastFocusOptions.preventScroll, true);
});

test('slow script loading before the first shell is allowed, but a delayed lock callback cannot interrupt later', async () => {
  const slow = welcome();await slow.advance(12000);await slow.auto();assert.equal(slow.showCalls, 1);
  let run;const w = welcome({ locks:{ request(name, options, callback) { run = callback;return Promise.resolve(); } } });
  w.window.SUWelcome.maybeShow();await w.advance(1500);await run({});
  assert.equal(w.showCalls, 0);await w.auto();assert.equal(w.showCalls, 0);
});
