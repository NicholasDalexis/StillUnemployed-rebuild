/* Shared board help and native disclosure-menu behavior. No account data. */
(function (global) {
  'use strict';
  var doc = global.document;
  var tip = null, currentRoot = null, menu = null, summary = null, owner = null;
  var leaveTimer = null, pointerHere = false, focusHere = false, tipHere = false;
  var keyboard = true, dismissedOwner = null, bound = false, observer = null;
  var help = [
    ['[data-act="toggleSavedOnly"]', 'Keep roles here to revisit.'],
    ['[data-act="openLook"]', 'Pick a different look. Your jobs stay the same!']
  ];
  function closest(target, selector) { return target && typeof target.closest === 'function' ? target.closest(selector) : null; }
  function connected(node) { return !!(node && node.isConnected && node.getClientRects().length); }
  function hasDialog() { return !!doc.querySelector('#overlay-root [role="dialog"],dialog[open],[aria-modal="true"]'); }
  function modalOrPanel() {
    return hasDialog() || !!(global.SUApp && global.SUApp.state && global.SUApp.state.openPanel);
  }
  function closePanels(restoreFocus) {
    var app = global.SUApp, panel = app && app.state && app.state.openPanel;
    if (!panel || typeof app.closeBoardPanels !== 'function') return false;
    var trigger = doc.querySelector(panel === 'cat' ? '[data-act="toggleCat"]' : '[data-act="toggleFilters"]');
    // App removes only panel nodes. Rebuilding the board here would detach a
    // clicked link before its delegated handler or native navigation can run.
    app.closeBoardPanels();
    if (app.state.openPanel) return false;
    if (restoreFocus && connected(trigger)) trigger.focus({ preventScroll:true });
    return true;
  }
  function closeOutsidePanel(target) {
    if (!closest(target, '[data-su-panel],[data-act="toggleCat"],[data-act="toggleFilters"]')) closePanels(false);
  }
  function cancelLeave() { if (leaveTimer !== null) global.clearTimeout(leaveTimer);leaveTimer = null; }
  function describe(anchor, add) {
    var ids = (anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (id) { return id && id !== 'su-board-help'; });
    if (add) ids.push('su-board-help');
    if (ids.length) anchor.setAttribute('aria-describedby', ids.join(' '));else anchor.removeAttribute('aria-describedby');
  }
  function hide(suppress) {
    cancelLeave();
    if (owner) { if (suppress) dismissedOwner = owner;describe(owner, false); }
    owner = null;pointerHere = false;focusHere = false;tipHere = false;
    if (tip) tip.hidden = true;
  }
  function focusSummary() {
    if (connected(summary)) { try { summary.focus({ preventScroll:true }); } catch (_) { summary.focus(); } }
  }
  function closeMenu(restoreFocus) {
    if (!menu || !menu.open) return;
    menu.open = false;
    if (restoreFocus) focusSummary();
  }
  function dismiss() { hide(true);closeMenu(true); }
  function allowed(anchor) {
    return connected(anchor) && ((currentRoot && currentRoot.contains(anchor)) || anchor.matches('button[data-su-help]')) && !modalOrPanel() && !(menu && menu.open);
  }
  function position() {
    if (!owner || !allowed(owner)) { hide(false);return; }
    var viewport = global.visualViewport;
    var width = viewport ? viewport.width : (global.innerWidth || doc.documentElement.clientWidth);
    var height = viewport ? viewport.height : (global.innerHeight || doc.documentElement.clientHeight);
    var leftEdge = (viewport && viewport.offsetLeft) || 0, topEdge = (viewport && viewport.offsetTop) || 0;
    var gap = 8, anchor = owner.getBoundingClientRect();
    tip.style.maxWidth = Math.max(0, width - gap * 2) + 'px';
    var box = tip.getBoundingClientRect();
    var left = Math.max(leftEdge + gap, Math.min(anchor.left + (anchor.width - box.width) / 2, leftEdge + width - box.width - gap));
    var top = anchor.bottom + gap;
    if (top + box.height > topEdge + height - gap) top = anchor.top - box.height - gap;
    top = Math.max(topEdge + gap, Math.min(top, topEdge + height - box.height - gap));
    tip.style.left = left + 'px';tip.style.top = top + 'px';
  }
  function findHelp(target) {
    var authAnchor = closest(target, 'button[data-su-help]');
    if (authAnchor && (authAnchor.getAttribute('data-su-help') || '').trim()) return { anchor:authAnchor, text:authAnchor.getAttribute('data-su-help') };
    for (var i = 0; i < help.length; i++) {
      var anchor = closest(target, help[i][0]);
      if (anchor && currentRoot && currentRoot.contains(anchor)) return { anchor:anchor, text:help[i][1] };
    }
    return null;
  }
  function show(item, fromFocus) {
    if (!item || item.anchor === dismissedOwner || !allowed(item.anchor)) return;
    if (owner !== item.anchor) { hide(false);owner = item.anchor;describe(owner, true); }
    tip.textContent = item.text;
    cancelLeave();
    if (fromFocus) focusHere = true;else pointerHere = true;
    tip.hidden = false;position();
  }
  function leaveSoon() {
    cancelLeave();
    if (pointerHere || focusHere || tipHere) return;
    leaveTimer = global.setTimeout(function () { leaveTimer = null;if (!pointerHere && !focusHere && !tipHere) hide(false); }, 180);
  }
  function inside(node, target) { return !!(node && target && node.contains(target)); }
  function onPointerOver(event) {
    if (event.pointerType === 'touch') return;
    if (inside(tip, event.target)) { if (owner) { tipHere = true;cancelLeave(); }return; }
    var item = findHelp(event.target);
    if (item && !inside(item.anchor, event.relatedTarget)) show(item, false);
  }
  function onPointerOut(event) {
    if (event.pointerType === 'touch') return;
    if (inside(tip, event.target) && !inside(tip, event.relatedTarget)) { tipHere = false;leaveSoon(); }
    var item = findHelp(event.target);
    if (item && !inside(item.anchor, event.relatedTarget)) {
      if (dismissedOwner === item.anchor && !focusHere) dismissedOwner = null;
      if (owner === item.anchor) { pointerHere = false;leaveSoon(); }
    }
  }
  function onFocusIn(event) { if (keyboard) show(findHelp(event.target), true); }
  function onFocusOut(event) {
    var item = findHelp(event.target);
    if (!item || inside(item.anchor, event.relatedTarget)) return;
    if (dismissedOwner === item.anchor) dismissedOwner = null;
    if (owner === item.anchor) { focusHere = false;leaveSoon(); }
  }
  function onPointerDown(event) {
    keyboard = false;hide(true);closeOutsidePanel(event.target);
    if (menu && menu.open && !inside(menu, event.target)) closeMenu(false);
  }
  function onClick(event) {
    hide(true);closeOutsidePanel(event.target);
    if (!menu || !menu.open) return;
    if (!inside(menu, event.target)) { closeMenu(false);return; }
    if (inside(summary, event.target)) return;
    var action = closest(event.target, 'a[href],button,[data-act],[data-discovery]');
    if (action && inside(menu, action)) closeMenu(true);
    // Do not preventDefault or replace nodes: ordinary anchors and delegated
    // actions must still run after focus has moved to the visible summary.
  }
  function onKeyDown(event) {
    keyboard = true;
    if (event.key !== 'Escape') return;
    hide(true);
    if (menu && menu.open) { event.preventDefault();event.stopPropagation();closeMenu(true); }
    else if (closePanels(true)) { event.preventDefault();event.stopPropagation(); }
  }
  function onToggle() {
    if (!menu || !menu.open) return;
    hide(true);
    if (hasDialog()) { closeMenu(false);return; }
    closePanels(false);
    if (modalOrPanel()) { closeMenu(false);return; }
    doc.querySelectorAll('details[data-board-menu][open],details.su-board-menu[open]').forEach(function (other) {
      if (other !== menu) other.open = false;
    });
  }
  function checkContext() {
    if (modalOrPanel()) { hide(true);closeMenu(false); }
    else if (menu && menu.open) hide(true);
    else if (owner && !allowed(owner)) hide(false);
    else if (owner && owner.matches('button[data-su-help]')) {
      var item = findHelp(owner);
      if (!item) hide(false);else if (tip.textContent !== item.text) { tip.textContent = item.text;position(); }
    }
  }
  function bind() {
    if (bound) return;bound = true;
    tip = doc.createElement('div');tip.id = 'su-board-help';tip.className = 'su-help-tip';tip.setAttribute('role', 'tooltip');tip.hidden = true;
    doc.body.appendChild(tip);
    doc.addEventListener('pointerover', onPointerOver, true);
    doc.addEventListener('pointerout', onPointerOut, true);
    doc.addEventListener('focusin', onFocusIn, true);
    doc.addEventListener('focusout', onFocusOut, true);
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('scroll', function () { hide(true); }, true);
    global.addEventListener('resize', function () { hide(true); });
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', function () { hide(true); });
      global.visualViewport.addEventListener('scroll', function () { hide(true); });
    }
    if (typeof global.MutationObserver === 'function') {
      observer = new global.MutationObserver(checkContext);
      observer.observe(doc.body, { childList:true, subtree:true, attributes:true, attributeFilter:['open','aria-modal','data-su-help'] });
    }
  }
  function start() { if (doc && doc.body) { bind();checkContext(); } }
  function prepare(root) {
    if (!doc || !doc.body || !root) return;
    bind();hide(false);dismissedOwner = null;
    if (menu) menu.removeEventListener('toggle', onToggle);
    currentRoot = root;
    menu = root.querySelector('#su-board-menu');summary = menu && menu.querySelector('#su-board-menu-trigger');
    if (menu) { menu.addEventListener('toggle', onToggle);onToggle(); }
    checkContext();
  }
  global.SUBoardControls = { start:start, prepare:prepare, dismiss:dismiss };
})(typeof window !== 'undefined' ? window : this);
