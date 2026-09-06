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

test('the Version 2 family has one browser-local receipt, independent of patch and account data', () => {
  assert.equal(policy.key, 'su_welcome_v2_seen');
  const local = store([['su_saved_jobs', 'private jobs'], ['su_sync_v2:account', 'private tracker']]);
  assert.equal(policy.hasSeen([local]), false);
  assert.equal(policy.remember([local]), true);
  assert.equal(policy.hasSeen([local]), true);
  assert.equal(local.values.get('su_saved_jobs'), 'private jobs');
  assert.equal(local.values.get('su_sync_v2:account'), 'private tracker');
  assert.equal(local.values.size, 3);
  for (const value of ['', '0', 'true', 'null', '{"seen":true}']) {
    assert.equal(policy.hasSeen([store([[policy.key, value]])]), false);
  }
});

test('storage failures and silent rejected writes fall back to a verified session receipt', () => {
  const session = store(), silent = { getItem() { return null; }, setItem() {} };
  assert.equal(policy.remember([null, blocked, silent, session]), true);
  assert.equal(policy.hasSeen([blocked, session]), true);
  assert.equal(session.getItem(policy.key), '1');
  assert.equal(policy.remember([null, blocked, silent]), false);
  assert.equal(policy.hasSeen([null, blocked, silent]), false);
});

test('incoming job links and OAuth returns keep their requested task', () => {
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
function welcome({ local = store(), session = store(), search = '', hash = '', version = '2.1.0', unavailable = false, showError = false, releaseAvailable = true } = {}) {
  let document, dialog, showCalls = 0;
  class Element {
    constructor(tag, attrs = {}) { this.tagName = tag.toUpperCase();this.attrs = attrs;this.children = [];this.listeners = {};this.style = {};this.parentElement = null;this.scrollTop = 0;this.open = false; }
    get isConnected() { return this === document.body || !!(this.parentElement && this.parentElement.isConnected); }
    set id(value) { this.attrs.id = value; } get id() { return this.attrs.id; }
    set className(value) { this.attrs.class = value; }
    get hidden() { return this.attrs.hidden !== undefined; } set hidden(value) { if (value) this.attrs.hidden = ''; else delete this.attrs.hidden; }
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
      this.html = html;for (const child of this.children) child.parentElement = null;this.children = [];
      const stack = [this], voids = new Set(['BR', 'IMG', 'INPUT', 'HR']);
      for (const token of html.matchAll(/<\/?[\w-]+\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)) {
        const raw = token[0], name = raw.match(/^<\/?([\w-]+)/)[1];
        if (raw.startsWith('</')) { let i = stack.length - 1;while (i > 0 && stack[i].tagName !== name.toUpperCase()) i--;if (i > 0) stack.length = i;continue; }
        const attrs = {};
        for (const attr of raw.slice(name.length + 1, raw.endsWith('/>') ? -2 : -1).matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[attr[1]] = attr[2] ?? attr[3] ?? attr[4] ?? '';
        const child = stack.at(-1).appendChild(new Element(name, attrs));
        if (!voids.has(child.tagName) && !raw.endsWith('/>')) stack.push(child);
      }
    }
  }
  document = { overlay:null, readyState:'complete', createElement(tag) { const node = new Element(tag);if (tag === 'dialog') { dialog = node;if (unavailable) node.showModal = undefined; }return node; },
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
    querySelector(selector) { return selector === '#overlay-root [role="dialog"]' ? this.overlay : this.body.querySelector(selector); } };
  document.body = new Element('body');document.body.style.overflow = 'auto';
  const opener = document.body.appendChild(new Element('button', { 'data-act':'openWelcome' }));document.activeElement = opener;
  const window = { document, SUApp:{ state:{} } };
  for (const [name, value] of [['localStorage', local], ['sessionStorage', session]]) {
    if (value === 'getter-denied') Object.defineProperty(window, name, { get() { throw new Error('Storage property denied'); } });
    else window[name] = value;
  }
  const context = vm.createContext({ window, document, location:{ search, hash }, URLSearchParams });
  if (releaseAvailable) vm.runInContext(renderReleaseScript({ schemaVersion:1, currentVersion:version,
    releases:[{ version, date:'2026-09-05', title:'Test release', changes:['Test release.'] }] }), context);
  vm.runInContext(source, context);
  return { window, document, opener, local, session, get dialog() { return dialog; }, get showCalls() { return showCalls; },
    click(selector) { const target = dialog.querySelector(selector);assert(target, selector);dialog.dispatch('click', { target });return target; } };
}

test('first normal visit opens one native modal, reloads and later 2.x patches do not repeat it', () => {
  const local = store(), first = welcome({ local });
  first.window.SUWelcome.maybeShow();
  assert.equal(first.showCalls, 1);assert.equal(first.dialog.tagName, 'DIALOG');assert.equal(first.dialog.open, true);
  assert.equal(first.document.body.style.overflow, 'hidden');
  assert.equal(first.document.activeElement.getAttribute('aria-label'), 'Close Version 2 welcome');
  first.window.SUWelcome.maybeShow();assert.equal(first.showCalls, 1);
  first.click('[data-launch-close]');
  assert.equal(first.dialog.open, false);assert.equal(first.document.body.style.overflow, 'auto');assert.equal(first.document.activeElement, first.opener);
  for (const version of ['2.1.0', '2.1.1', '2.1.9', '2.2.0']) {
    const reload = welcome({ local, version });reload.window.SUWelcome.maybeShow();assert.equal(reload.showCalls, 0, version);
  }
});

test('session fallback survives reload, while fully blocked storage leaves manual discovery available', () => {
  const session = store(), first = welcome({ local:'getter-denied', session });first.window.SUWelcome.maybeShow();assert.equal(first.showCalls, 1);
  const reload = welcome({ local:blocked, session });reload.window.SUWelcome.maybeShow();assert.equal(reload.showCalls, 0);
  const denied = welcome({ local:'getter-denied', session:'getter-denied' });
  denied.window.SUWelcome.maybeShow();denied.window.SUWelcome.maybeShow();assert.equal(denied.showCalls, 0);
  assert.equal(denied.window.SUWelcome.open(), true);assert.equal(denied.dialog.open, true);
  denied.click('[data-launch-close]');denied.window.SUWelcome.maybeShow();assert.equal(denied.showCalls, 1);
});

test('shared links do not consume the receipt, and manual reopening can still introduce the release', () => {
  const local = store(), shared = welcome({ local, search:'?job=https%3A%2F%2Fcompany.com%2Fjob' });
  shared.window.SUWelcome.maybeShow();assert.equal(shared.showCalls, 0);assert.equal(local.getItem(policy.key), null);
  const normal = welcome({ local });normal.window.SUWelcome.maybeShow();assert.equal(normal.showCalls, 1);
  const authReturn = welcome({ local:store(), hash:'#id_token=secret-token' });
  authReturn.window.SUWelcome.maybeShow();assert.equal(authReturn.showCalls, 0);
  assert.equal(authReturn.window.SUWelcome.open(), true);assert.equal(authReturn.local.getItem(policy.key), '1');
  assert(!authReturn.dialog.html.includes('secret-token'));
});

test('load errors, open filters and existing dialogs defer automatic onboarding without consuming the receipt', () => {
  const w = welcome();
  w.window.SUApp._loadError = true;w.window.SUWelcome.maybeShow();assert.equal(w.showCalls, 0);
  w.window.SUApp._loadError = false;w.window.SUApp.state.openPanel = 'cat';w.window.SUWelcome.maybeShow();assert.equal(w.showCalls, 0);
  w.window.SUApp.state.openPanel = null;w.document.overlay = {};w.window.SUWelcome.maybeShow();assert.equal(w.showCalls, 0);
  assert.equal(w.window.SUWelcome.open(), false);assert.equal(w.local.getItem(policy.key), null);
  w.document.overlay = null;w.window.SUWelcome.maybeShow();assert.equal(w.showCalls, 1);
});

test('turning a card and returning restores focus; Escape and outside clicks close and restore the opener', () => {
  const w = welcome();w.window.SUWelcome.open();
  w.click('[data-launch-feature="themes"]');
  assert.equal(w.document.activeElement.getAttribute('data-launch-back'), '');
  w.click('[data-launch-back]');assert.equal(w.document.activeElement.getAttribute('data-launch-feature'), 'themes');
  w.dialog.dispatch('click', { clientX:100, clientY:100 });assert.equal(w.dialog.open, true, 'dialog interior is not the backdrop');
  const cancel = w.dialog.dispatch('cancel');assert.equal(cancel.defaultPrevented, true);assert.equal(w.dialog.open, false);assert.equal(w.document.activeElement, w.opener);
  w.window.SUWelcome.open();w.dialog.dispatch('click', { clientX:0, clientY:0 });assert.equal(w.dialog.open, false);assert.equal(w.document.body.style.overflow, 'auto');
});

test('closing after the board replaces its opener focuses the current What’s new control', () => {
  const w = welcome();w.window.SUWelcome.open();
  const replacement = w.document.createElement('button');replacement.setAttribute('data-act', 'openWelcome');
  w.document.body.children = w.document.body.children.filter(node => node !== w.opener);w.opener.parentElement = null;w.document.body.appendChild(replacement);
  w.click('[data-launch-close]');assert.equal(w.document.activeElement, replacement);
});

test('automatic entry from BODY returns to What’s new instead of leaving keyboard focus on the page', () => {
  const w = welcome();w.document.activeElement = w.document.body;w.window.SUWelcome.maybeShow();
  w.click('[data-launch-close]');assert.equal(w.document.activeElement, w.opener);
});

test('Tab and Shift+Tab wrap at the current dialog boundaries after card content changes', () => {
  const w = welcome();w.window.SUWelcome.open();
  function checkBoundaries() {
    const actions = w.dialog.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]').filter(el => el.getClientRects().length);
    const first = actions[0], last = actions.at(-1);
    if (actions.length === 2) assert.equal(last.getAttribute('role'), 'region', 'detail ends at its keyboard-scrollable content');
    else assert.equal(last.getAttribute('data-su-version'), '', 'overview ends at version history');
    last.focus();assert.equal(w.dialog.dispatch('keydown', { key:'Tab' }).defaultPrevented, true);assert.equal(w.document.activeElement, first);
    first.focus();assert.equal(w.dialog.dispatch('keydown', { key:'Tab', shiftKey:true }).defaultPrevented, true);assert.equal(w.document.activeElement, last);
    if (actions.length > 2) { actions[1].focus();assert.notEqual(w.dialog.dispatch('keydown', { key:'Tab' }).defaultPrevented, true, 'ordinary browser tab order remains available'); }
  }
  checkBoundaries();w.click('[data-launch-feature="advice"]');checkBoundaries();
  w.click('[data-launch-back]');checkBoundaries();
});

test('the real release helper fills exact-version history on dynamic welcome creation and keeps it after reopening', () => {
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

test('unavailable or failed native modal APIs fail without throwing or locking the page', () => {
  for (const options of [{ unavailable:true }, { showError:true }]) {
    const w = welcome(options);assert.equal(w.window.SUWelcome.open(), false);
    assert.equal(w.dialog.open, false);assert.equal(w.document.body.style.overflow, 'auto');assert.equal(w.local.getItem(policy.key), null);
  }
});

test('preview links use fixed trusted destinations and protect the opener of the external preview', () => {
  const w = welcome();w.window.SUWelcome.open();
  const portfolio = w.dialog.querySelector('.su-launch-pg');
  assert.equal(portfolio.getAttribute('href'), 'https://portfoliograded.com/');
  assert.equal(portfolio.getAttribute('target'), '_blank');
  assert.equal(portfolio.getAttribute('rel'), 'noopener noreferrer');
  assert.match(portfolio.getAttribute('aria-label'), /password required/);
  w.click('[data-launch-feature="sync"]');
  assert.equal(w.dialog.querySelector('.su-launch-detail').querySelector('a'), null, 'detail is informational, with one header Back action');
});


test('feature details have one visible Back action and restore the complete overview', () => {
  const w = welcome();w.window.SUWelcome.open();
  for (const feature of ['advice','themes','sync']) {
    w.click('[data-launch-feature="'+feature+'"]');
    const actions = w.dialog.querySelectorAll('button:not(:disabled),a[href]').filter(el => el.getClientRects().length);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].getAttribute('data-launch-back'), '');
    assert.equal(w.dialog.getAttribute('aria-labelledby'), 'su-launch-detail-title');
    for (const selector of ['.su-launch-overview-title','.su-launch-close','.su-launch-intro','.su-launch-footer','.su-launch-reopen']) assert(w.dialog.querySelector(selector).hidden);
    w.click('[data-launch-back]');
    assert.equal(w.dialog.getAttribute('aria-labelledby'), 'su-launch-title');
    assert.equal(w.document.activeElement.getAttribute('data-launch-feature'), feature);
    assert.equal(w.dialog.querySelector('.su-launch-footer').hidden, false);
  }
});

test('detail keyboard focus reaches its named scroll region without adding another visible action', () => {
  const w = welcome();w.window.SUWelcome.open();
  for (const feature of ['advice','themes','sync']) {
    w.click('[data-launch-feature="'+feature+'"]');
    const back = w.dialog.querySelector('[data-launch-back]');
    const scroll = w.dialog.querySelector('.su-launch-scroll');
    const focusable = w.dialog.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]').filter(el => el.getClientRects().length);
    assert.deepEqual(focusable, [back, scroll]);
    assert.equal(w.document.activeElement, back, 'Back keeps initial focus');
    assert.notEqual(w.dialog.dispatch('keydown', { key:'Tab' }).defaultPrevented, true, 'native Tab can enter the scroll region');
    assert.equal(scroll.getAttribute('role'), 'region');
    assert.equal(scroll.getAttribute('aria-labelledby'), w.dialog.querySelector('#su-launch-detail-title').id);
    scroll.focus();
    assert.notEqual(w.dialog.dispatch('keydown', { key:'PageDown' }).defaultPrevented, true, 'native keyboard scrolling is not suppressed');
    assert.equal(w.dialog.dispatch('keydown', { key:'Tab' }).defaultPrevented, true);
    assert.equal(w.document.activeElement, back, 'Tab from content wraps to Back');
    w.click('[data-launch-back]');
    for (const attr of ['role','aria-labelledby','tabindex']) assert.equal(scroll.getAttribute(attr), null, attr+' is removed in overview');
    assert.equal(w.document.activeElement.getAttribute('data-launch-feature'), feature);
  }
});
