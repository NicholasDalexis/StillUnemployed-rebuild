'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../js/board-controls.js'), 'utf8');

function fixture() {
  let now = 0, timerId = 0, observerCallback;
  const timers = new Map();
  class Target {
    constructor() { this.listeners = {}; }
    addEventListener(type, fn, capture) { (this.listeners[type] ||= []).push({ fn, capture:!!capture }); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(item => item.fn !== fn); }
  }
  class Element extends Target {
    constructor(tag, attrs = {}) { super();this.tagName = tag.toUpperCase();this.attrs = { ...attrs };this.parentElement = null;this.children = [];this.style = {};this.textContent = '';this.box = { left:100, top:100, width:90, height:44 }; }
    set id(value) { this.attrs.id = value; } get id() { return this.attrs.id; }
    set className(value) { this.attrs.class = value; }
    set hidden(value) { if (value) this.attrs.hidden = '';else delete this.attrs.hidden; } get hidden() { return 'hidden' in this.attrs; }
    set open(value) { if (value) this.attrs.open = '';else delete this.attrs.open; } get open() { return 'open' in this.attrs; }
    setAttribute(key, value) { this.attrs[key] = String(value); } getAttribute(key) { return this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    appendChild(node) { node.parentElement = this;this.children.push(node);return node; }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this);this.parentElement = null; }
    get isConnected() { return this === document.body || !!(this.parentElement && this.parentElement.isConnected); }
    contains(node) { for (;node;node = node.parentElement) if (node === this) return true;return false; }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      const pieces = selector.split(' ');if (pieces.length > 1) return this.matches(pieces.at(-1)) && !!(this.parentElement && this.parentElement.closest(pieces.slice(0,-1).join(' ')));
      const withoutAttrs = selector.replace(/\[[^\]]+\]/g, '');
      const tag = withoutAttrs.match(/^[a-z]+/i);if (tag && tag[0].toUpperCase() !== this.tagName) return false;
      const id = withoutAttrs.match(/#([\w-]+)/);if (id && this.id !== id[1]) return false;
      const cls = withoutAttrs.match(/\.([\w-]+)/);if (cls && !(this.attrs.class || '').split(/\s+/).includes(cls[1])) return false;
      for (const attr of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) if (this.getAttribute(attr[1]) === null || (attr[2] !== undefined && this.getAttribute(attr[1]) !== attr[2])) return false;
      return true;
    }
    closest(selector) { for (let node = this;node;node = node.parentElement) if (node.matches(selector)) return node;return null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getClientRects() {
      if (!this.isConnected) return [];
      for (let node = this;node;node = node.parentElement) {
        if (node.hidden) return [];
        if (node.tagName === 'DETAILS' && !node.open && node !== this && !node.querySelector('summary').contains(this)) return [];
      }
      return [this.getBoundingClientRect()];
    }
    getBoundingClientRect() {
      const box = this.id === 'su-board-help' ? { left:0, top:0, width:Math.min(240, parseFloat(this.style.maxWidth) || 240), height:54 } : this.box;
      return { ...box, right:box.left + box.width, bottom:box.top + box.height };
    }
    focus() { const previous = document.activeElement;if (previous === this) return;if (previous) fire('focusout', previous, { relatedTarget:this });document.activeElement = this;fire('focusin', this, { relatedTarget:previous }); }
  }
  const document = new Target();document.body = new Element('body');document.documentElement = { clientWidth:390, clientHeight:800 };document.activeElement = document.body;
  document.createElement = tag => new Element(tag);
  document.querySelector = selector => document.body.querySelector(selector);
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  document.getElementById = id => document.querySelector('#' + id);
  const window = new Target();Object.assign(window, { document, innerWidth:390, innerHeight:800, SUApp:{ state:{} },
    setTimeout(fn, ms) { const id = ++timerId;timers.set(id, { fn, at:now + ms });return id; },clearTimeout(id) { timers.delete(id); },
    MutationObserver:class { constructor(fn) { observerCallback = fn; }observe() {} }
  });
  function fire(type, target = document.body, extra = {}) {
    const event = { type, target, relatedTarget:null, defaultPrevented:false, stopped:false, preventDefault() { this.defaultPrevented = true; },stopPropagation() { this.stopped = true; }, ...extra };
    const chain = [];for (let node = target;node;node = node.parentElement) chain.push(node);chain.push(document);
    for (const capture of [true, false]) for (const node of capture ? [...chain].reverse() : chain) {
      for (const listener of node.listeners[type] || []) if (listener.capture === capture) listener.fn(event);
      if (event.stopped) return event;
    }
    const nativeSummary = target.closest && target.closest('summary');
    if (type === 'click' && nativeSummary && !event.defaultPrevented) { nativeSummary.parentElement.open = !nativeSummary.parentElement.open;fire('toggle', nativeSummary.parentElement); }
    return event;
  }
  function advance(ms) {
    const end = now + ms;
    for (;;) { const due = [...timers].filter(([, value]) => value.at <= end).sort((a,b) => a[1].at - b[1].at)[0];if (!due) break;timers.delete(due[0]);now = due[1].at;due[1].fn(); }
    now = end;
  }
  function board() {
    const root = document.body.appendChild(new Element('main'));
    const saved = root.appendChild(new Element('button', { 'data-act':'toggleSavedOnly', 'aria-describedby':'saved-count' }));
    const tracker = root.appendChild(new Element('a', { href:'./tracker.html' }));
    const theme = root.appendChild(new Element('button', { 'data-act':'openLook' }));
    const menu = root.appendChild(new Element('details', { id:'su-board-menu', class:'su-board-menu' }));
    const summary = menu.appendChild(new Element('summary', { id:'su-board-menu-trigger' }));
    const content = menu.appendChild(new Element('div'));
    const preferences = content.appendChild(new Element('button', { 'data-discovery':'preferences' }));
    const welcome = content.appendChild(new Element('button', { 'data-act':'openWelcome' }));
    const link = content.appendChild(new Element('a', { href:'/versions.html' }));
    return { root, saved, tracker, theme, menu, summary, preferences, welcome, link };
  }
  vm.runInNewContext(source, { window });
  const first = board();window.SUBoardControls.prepare(first.root);
  return { window, document, ...first, board, Element, fire, advance, mutate() { observerCallback(); }, get tip() { return document.getElementById('su-board-help'); }, resize() { for (const l of window.listeners.resize || []) l.fn({}); } };
}

test('one body tooltip serves saved and theme with only the current anchor described', () => {
  const w = fixture();assert.equal(w.tip.parentElement, w.document.body);assert.equal(w.tip.hidden, true);
  for (const [anchor, copy] of [[w.saved, 'Keep roles here to revisit.'], [w.theme, 'Pick a different look. Your jobs stay the same!']]) {
    w.fire('pointerover', anchor, { pointerType:'mouse' });
    assert.equal(w.tip.hidden, false);assert.equal(w.tip.textContent, copy);assert.match(anchor.getAttribute('aria-describedby'), /su-board-help/);
    for (const other of [w.saved, w.tracker, w.theme].filter(item => item !== anchor)) assert.doesNotMatch(other.getAttribute('aria-describedby') || '', /su-board-help/);
  }
  assert.equal(w.saved.getAttribute('aria-describedby'), 'saved-count');
  assert.equal(w.document.querySelectorAll('#su-board-help').length, 1);
});

test('the tooltip remains hoverable across the gap and disappears after both hover regions are left', () => {
  const w = fixture();w.fire('pointerover', w.saved, { pointerType:'mouse' });
  w.fire('pointerout', w.saved, { relatedTarget:w.tip, pointerType:'mouse' });w.advance(150);assert.equal(w.tip.hidden, false);
  w.fire('pointerover', w.tip, { relatedTarget:w.saved, pointerType:'mouse' });w.advance(10000);assert.equal(w.tip.hidden, false);
  w.fire('pointerout', w.tip, { relatedTarget:w.document.body, pointerType:'mouse' });w.advance(179);assert.equal(w.tip.hidden, false);
  w.advance(1);assert.equal(w.tip.hidden, true);assert.equal(w.saved.getAttribute('aria-describedby'), 'saved-count');
});

test('keyboard focus shows help, Escape dismisses it without moving focus, and touch focus does not show it', () => {
  const w = fixture();w.saved.focus();assert.equal(w.tip.hidden, false);
  w.fire('keydown', w.saved, { key:'Escape' });assert.equal(w.tip.hidden, true);assert.equal(w.document.activeElement, w.saved);
  const child = w.saved.appendChild(new w.Element('span'));
  w.fire('pointerover', child, { relatedTarget:w.saved, pointerType:'mouse' });assert.equal(w.tip.hidden, true, 'moving inside a dismissed anchor does not revive it');
  w.fire('pointerdown', w.tracker, { pointerType:'touch' });w.tracker.focus();w.fire('pointerover', w.tracker, { pointerType:'touch' });assert.equal(w.tip.hidden, true);
  w.fire('keydown', w.tracker, { key:'Tab' });w.theme.focus();assert.equal(w.tip.hidden, false);
  w.document.body.focus();w.advance(180);assert.equal(w.tip.hidden, true);
});

test('pointerdown, scroll, resize and modal creation clear active tooltip state', () => {
  for (const dismiss of [w => w.fire('pointerdown'), w => w.fire('scroll', w.root), w => w.resize(), w => { const dialog = w.document.body.appendChild(new w.Element('dialog'));dialog.open = true;w.mutate(); }]) {
    const w = fixture();w.fire('pointerover', w.saved, { pointerType:'mouse' });assert.equal(w.tip.hidden, false);
    dismiss(w);assert.equal(w.tip.hidden, true);assert.equal(w.saved.getAttribute('aria-describedby'), 'saved-count');
  }
});

test('tooltip placement is clamped at both viewport edges and chooses space above a low anchor', () => {
  const w = fixture();w.saved.box = { left:365, top:750, width:25, height:44 };
  w.fire('pointerover', w.saved, { pointerType:'mouse' });
  assert.equal(parseFloat(w.tip.style.left), 142);assert.equal(parseFloat(w.tip.style.top), 688);
  assert.equal(parseFloat(w.tip.style.left) + 240, w.window.innerWidth - 8);
  w.theme.box = { left:-35, top:0, width:30, height:20 };w.fire('pointerover', w.theme, { pointerType:'mouse' });
  assert.equal(parseFloat(w.tip.style.left), 8);assert.equal(parseFloat(w.tip.style.top), 28);
});

test('prepare resets detached anchors and reuses the single layer without duplicate document listeners', () => {
  const w = fixture();w.fire('pointerover', w.saved, { pointerType:'mouse' });
  const old = w.saved, listenerCount = w.document.listeners.click.length, tip = w.tip;
  w.root.remove();const next = w.board();w.window.SUBoardControls.prepare(next.root);w.window.SUBoardControls.prepare(next.root);
  assert.equal(w.tip, tip);assert.equal(tip.hidden, true);assert.equal(old.getAttribute('aria-describedby'), 'saved-count');
  assert.equal(w.document.listeners.click.length, listenerCount);assert.equal(next.menu.listeners.toggle.length, 1);
  w.fire('pointerover', old, { pointerType:'mouse' });assert.equal(tip.hidden, true);
  w.fire('pointerover', next.theme, { pointerType:'mouse' });assert.equal(tip.hidden, false);
  next.theme.hidden = true;w.mutate();assert.equal(tip.hidden, true);
});

test('native summary toggles the Board menu without custom roles and suppresses tooltips', () => {
  const w = fixture();w.fire('pointerover', w.saved, { pointerType:'mouse' });
  const event = w.fire('click', w.summary);assert.equal(event.defaultPrevented, false);assert.equal(w.menu.open, true);assert.equal(w.tip.hidden, true);
  w.fire('pointerover', w.saved, { pointerType:'mouse' });assert.equal(w.tip.hidden, true);
  assert.equal(w.menu.getAttribute('role'), null);assert.equal(w.summary.getAttribute('role'), null);
  w.fire('click', w.summary);assert.equal(w.menu.open, false);
});

test('opening the Board menu closes other board menus but preserves unrelated disclosures', () => {
  const w = fixture();
  const other = w.document.body.appendChild(new w.Element('details', { 'data-board-menu':'', open:'' }));
  other.appendChild(new w.Element('summary'));
  const unrelated = w.document.body.appendChild(new w.Element('details', { open:'' }));
  unrelated.appendChild(new w.Element('summary'));
  w.fire('click', w.summary);
  assert.equal(w.menu.open, true);assert.equal(other.open, false);assert.equal(unrelated.open, true);
});

test('menu action capture restores the visible summary before delegated preferences or welcome handlers run', () => {
  for (const key of ['preferences', 'welcome', 'link']) {
    const w = fixture();w.fire('click', w.summary);w[key].focus();let delegated = false;
    w.document.addEventListener('click', event => { if (event.target !== w[key]) return;delegated = true;assert.equal(w.menu.open, false);assert.equal(w.document.activeElement, w.summary);assert(w.summary.getClientRects().length);assert.equal(event.defaultPrevented, false); });
    const event = w.fire('click', w[key]);assert.equal(delegated, true);assert.equal(event.defaultPrevented, false);
    assert.equal(w[key].isConnected, true, 'delegated targets are preserved after native closing');
  }
});

test('outside pointer/click, Escape and other panels/dialogs close the menu with appropriate focus behavior', () => {
  const w = fixture();w.fire('click', w.summary);w.saved.focus();w.fire('pointerdown', w.saved);assert.equal(w.menu.open, false);assert.equal(w.document.activeElement, w.saved);
  w.fire('click', w.summary);w.fire('click', w.saved);assert.equal(w.menu.open, false);
  w.fire('click', w.summary);w.preferences.focus();const escape = w.fire('keydown', w.preferences, { key:'Escape' });assert.equal(escape.defaultPrevented, true);assert.equal(w.menu.open, false);assert.equal(w.document.activeElement, w.summary);
  w.fire('click', w.summary);w.window.SUApp.state.openPanel = 'cat';w.mutate();assert.equal(w.menu.open, false);
  w.window.SUApp.state.openPanel = null;w.fire('click', w.summary);const overlay = w.document.body.appendChild(new w.Element('div', { id:'overlay-root' }));overlay.appendChild(new w.Element('section', { role:'dialog' }));w.mutate();assert.equal(w.menu.open, false);
});

test('opening a modal or panel prevents menu/help entry and explicit dismissal gives dialogs a stable opener', () => {
  const w = fixture();w.window.SUApp.state.openPanel = 'filters';w.fire('click', w.summary);assert.equal(w.menu.open, false);
  w.saved.focus();assert.equal(w.tip.hidden, true);
  w.window.SUApp.state.openPanel = null;w.fire('click', w.summary);w.preferences.focus();w.window.SUBoardControls.dismiss();
  assert.equal(w.menu.open, false);assert.equal(w.document.activeElement, w.summary);assert.equal(w.tip.hidden, true);
});


test('Tracker no longer exposes hover or keyboard tooltip help', () => {
  const w = fixture();
  w.fire('pointerover', w.tracker, { pointerType:'mouse' });assert.equal(w.tip.hidden, true);
  w.tracker.focus();assert.equal(w.tip.hidden, true);assert.equal(w.tracker.getAttribute('aria-describedby'), null);
});

test('live Google help works outside the board and updates when account state changes', () => {
  const w = fixture();
  const auth = w.document.body.appendChild(new w.Element('button', { 'data-su-help':'Sign in to keep your saved jobs and tracker together.' }));
  w.window.SUBoardControls.start();w.window.SUBoardControls.start();
  auth.focus();assert.equal(w.tip.hidden, false);assert.equal(w.tip.textContent, auth.getAttribute('data-su-help'));
  auth.setAttribute('data-su-help', 'You’re signed in. Click here to sign out.');w.mutate();
  assert.equal(w.tip.textContent, 'You’re signed in. Click here to sign out.');assert.equal(w.document.querySelectorAll('#su-board-help').length, 1);
  auth.removeAttribute('data-su-help');w.mutate();assert.equal(w.tip.hidden, true);assert.equal(auth.getAttribute('aria-describedby'), null);
});

function openPanel(w, kind) {
  const trigger = w.root.appendChild(new w.Element('button', { 'data-act':kind === 'cat' ? 'toggleCat' : 'toggleFilters', 'aria-expanded':'true' }));
  const panel = w.root.appendChild(new w.Element('div', { 'data-su-panel':kind }));
  const field = panel.appendChild(new w.Element('select'));
  w.window.SUApp.state.openPanel = kind;
  w.window.SUApp.closeBoardPanels = function () {
    this.state.openPanel = null;panel.remove();trigger.setAttribute('aria-expanded','false');
  };
  return { trigger, panel, field };
}

test('outside panel dismissal preserves clicked anchors until native navigation and delegated actions run', () => {
  for (const eventType of ['pointerdown','click']) {
    const w = fixture(), p = openPanel(w, 'filters');let delegated = false;
    w.document.addEventListener(eventType, event => {
      if (event.target !== w.tracker) return;
      delegated = true;assert.equal(w.window.SUApp.state.openPanel, null);assert.equal(p.panel.isConnected, false);
      assert.equal(w.tracker.isConnected, true);assert.equal(event.defaultPrevented, false);
    });
    w.fire(eventType, w.tracker);assert.equal(delegated, true);assert.equal(p.trigger.getAttribute('aria-expanded'),'false');
  }
});

test('panel controls remain usable and their own toggle still owns its open-close action', () => {
  const w = fixture(), p = openPanel(w, 'filters');
  w.fire('pointerdown', p.field);w.fire('click', p.field);assert.equal(w.window.SUApp.state.openPanel, 'filters');
  w.fire('click', p.trigger);assert.equal(w.window.SUApp.state.openPanel, 'filters');
  assert.equal(p.field.isConnected, true);
});

test('opening the Board menu closes a filter panel while preserving its native summary', () => {
  const w = fixture(), p = openPanel(w, 'filters');
  const event = w.fire('click', w.summary);
  assert.equal(w.window.SUApp.state.openPanel, null);assert.equal(p.panel.isConnected, false);
  assert.equal(w.menu.open, true);assert.equal(w.summary.isConnected, true);assert.equal(event.defaultPrevented, false);
});

test('Escape dismisses a filter panel and returns focus to its stable toggle', () => {
  const w = fixture(), p = openPanel(w, 'filters');p.field.focus();
  const event = w.fire('keydown', p.field, { key:'Escape' });
  assert.equal(w.window.SUApp.state.openPanel, null);assert.equal(w.document.activeElement, p.trigger);assert.equal(event.defaultPrevented, true);
});
