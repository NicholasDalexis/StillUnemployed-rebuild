/* Bookmark guidance stays reachable after dismissal. Only the browser can
   create a bookmark; these controls explain its native menu or shortcut. */
(function () {
  'use strict';
  var path = String(location.pathname || '').toLowerCase().replace(/\/+$/, '');
  if (path !== '' && !/\/index\.html$/.test(path)) return;
  var KEY = 'su_bookmark_dismissed';
  var dismissed = false;
  try { dismissed = !!localStorage.getItem(KEY); } catch (e) {}
  var mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
  var shortcut = mac ? '⌘ + D' : 'Ctrl + D';
  var lastTrigger = null;
  function log(action) { try { if (typeof window.suTrack === 'function') window.suTrack(action, '', ''); } catch (e) {} }
  function syncTriggers() {
    document.querySelectorAll('[data-bookmark-help]').forEach(function (button) {
      var hint = document.getElementById(button.getAttribute('data-bookmark-help'));
      button.setAttribute('aria-expanded', String(!!hint && !hint.hidden));
    });
  }
  function dismiss() {
    ['su-bm-postit', 'su-bm-bar'].forEach(function (id) { var node = document.getElementById(id); if (node) node.hidden = true; });
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    syncTriggers();
    if (lastTrigger && lastTrigger.isConnected) lastTrigger.focus();
    log('bookmark_dismiss');
  }
  function reminder(id, text) {
    var node = document.createElement('div');
    node.id = id;
    node.className = 'su-bm-inline';
    node.hidden = dismissed;
    node.tabIndex = -1;
    node.setAttribute('role', 'region');
    node.setAttribute('aria-label', 'How to bookmark this board');
    node.innerHTML = '<span>' + text + '</span><button type="button" class="su-bm-x" aria-label="Dismiss bookmark guidance">×</button>';
    node.querySelector('button').addEventListener('click', function () {
      lastTrigger = document.querySelector('[data-bookmark-help="' + id + '"]');
      dismiss();
    });
    node.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.preventDefault(); dismiss(); } });
    return node;
  }
  function mount() {
    if (document.getElementById('su-bm-css')) return;
    var css = document.createElement('style');
    css.id = 'su-bm-css';
    css.textContent = '.su-bm-inline{display:flex;align-items:center;gap:12px;color:#5c402e;font:17px/1.4 "Indie Flower",cursive;background:none;box-shadow:none;}' +
      '.su-bm-inline[hidden]{display:none!important;}.su-bm-inline>span{flex:1;min-width:0;}' +
      '#su-bm-postit{max-width:480px;margin-top:0;}' +
      '.su-bm-inline kbd{display:inline-block;padding:3px 7px;border:1px solid #b9a98d;border-radius:4px;font:600 13px/1.2 "Archivo",sans-serif;white-space:nowrap;}' +
      '.su-bm-inline .su-bm-x{border:0;background:none;color:#5c402e;width:44px;height:44px;flex:none;cursor:pointer;font-size:21px;}' +
      '.su-bm-x:focus-visible{outline:2px solid #A43E21;outline-offset:2px;}' +
      '@media(min-width:641px){#su-bm-bar{display:none!important;}}' +
      '@media(max-width:640px){#su-bm-postit{display:none!important;}#su-bm-bar.su-bm-inline{position:static;max-width:390px;margin:0 auto;padding:12px 16px;transform:none;}}';
    document.head.appendChild(css);
    var slot = document.getElementById('nh-bookmark-slot');
    if (slot) slot.appendChild(reminder('su-bm-postit', 'Press <kbd>' + shortcut + '</kbd> to bookmark this board.'));
    var mobile = reminder('su-bm-bar', 'Open your browser’s Share or menu button, then choose Bookmark (or ★).');
    var stage = document.getElementById('resp-stage');
    if (stage) stage.insertAdjacentElement('afterend', mobile); else document.body.appendChild(mobile);
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest && event.target.closest('[data-bookmark-help]');
      if (!trigger) return;
      var hint = document.getElementById(trigger.getAttribute('data-bookmark-help'));
      if (!hint) return;
      lastTrigger = trigger;
      hint.hidden = false;
      syncTriggers();
      hint.focus({ preventScroll: true });
      hint.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      log('bookmark_help');
    });
    syncTriggers();
    window.addEventListener('resize', syncTriggers);
    document.addEventListener('su:home-utilities-ready', syncTriggers);
    if (!dismissed) log('bookmark_view');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
