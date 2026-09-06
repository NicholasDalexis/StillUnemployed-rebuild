/* The browser creates bookmarks. These small notes explain the native
   shortcut/menu; dismissals keep the existing preference across visits. */
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
  function reserveMobileSpace() {
    var prompt = document.getElementById('su-bm-bar');
    var height = prompt ? prompt.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--su-mobile-bookmark-height', Math.ceil(height) + 'px');
  }
  function syncTriggers() {
    document.querySelectorAll('[data-bookmark-help]').forEach(function (button) {
      var hint = document.getElementById(button.getAttribute('data-bookmark-help'));
      button.setAttribute('aria-expanded', String(!!hint && !hint.hidden));
    });
    reserveMobileSpace();
  }
  function dismiss() {
    ['su-bm-postit', 'su-bm-bar'].forEach(function (id) { var node = document.getElementById(id); if (node) node.hidden = true; });
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    syncTriggers();
    if (lastTrigger && lastTrigger.isConnected && lastTrigger.getClientRects().length) lastTrigger.focus();
    log('bookmark_dismiss');
  }
  function mount() {
    if (document.getElementById('su-bm-css')) return;
    var css = document.createElement('style');
    css.id = 'su-bm-css';
    css.textContent = '.su-bm-inline{display:flex;align-items:center;gap:12px;color:var(--su-muted);font:17px/1.4 var(--su-hand);background:none;box-shadow:none;}' +
      '.su-bm-inline[hidden],#su-bm-bar[hidden]{display:none!important;}.su-bm-inline>span{flex:1;min-width:0;}' +
      '#su-bm-postit{max-width:480px;margin-top:0;}' +
      '.su-bm-inline kbd{display:inline-block;padding:3px 7px;border:1px solid #b9a98d;border-radius:4px;font:600 13px/1.2 var(--su-body);white-space:nowrap;}' +
      '.su-bm-x{border:0;background:none;color:var(--su-muted);width:44px;height:44px;flex:none;cursor:pointer;font-size:23px;}' +
      '.su-bm-x:focus-visible,#su-bm-mobile-action:focus-visible{outline:2px solid var(--su-orange);outline-offset:2px;}' +
      '#su-bm-bar{display:none;}' +
      '@media(max-width:640px){#su-bm-postit{display:none!important;}#su-bm-bar{display:block;position:relative;box-sizing:border-box;padding:calc(4px + env(safe-area-inset-top,0px)) 12px 4px;background:var(--su-bg);color:var(--su-ink);font:18px/1.2 var(--su-hand);}' +
      '#su-bm-bar .su-bm-prompt{display:flex;align-items:center;justify-content:center;gap:10px;min-height:44px;}' +
      '#su-bm-mobile-action{display:inline-flex;align-items:center;min-height:44px;border:0;padding:0 5px;background:none;color:var(--su-ink);font:inherit;text-decoration:underline;text-decoration-color:var(--su-orange);text-underline-offset:3px;cursor:pointer;}' +
      '#su-bm-mobile-help{display:block;max-width:340px;margin:0 auto;padding:1px 8px 6px;text-align:center;color:var(--su-muted);font-size:16px;}' +
      '#su-bm-mobile-help[hidden]{display:none;}}';
    document.head.appendChild(css);
    var slot = document.getElementById('nh-bookmark-slot');
    if (slot) {
      var desktop = document.createElement('div');
      desktop.id = 'su-bm-postit'; desktop.className = 'su-bm-inline'; desktop.hidden = dismissed; desktop.tabIndex = -1;
      desktop.setAttribute('role', 'region'); desktop.setAttribute('aria-label', 'How to bookmark this board');
      desktop.innerHTML = '<span>Press <kbd>' + shortcut + '</kbd> to bookmark this board.</span><button type="button" class="su-bm-x" aria-label="Dismiss bookmark guidance">×</button>';
      desktop.querySelector('button').addEventListener('click', function () { lastTrigger = document.querySelector('[data-bookmark-help="su-bm-postit"]'); dismiss(); });
      desktop.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.preventDefault(); dismiss(); } });
      slot.appendChild(desktop);
    }
    var mobile = document.createElement('aside');
    mobile.id = 'su-bm-bar'; mobile.hidden = dismissed; mobile.setAttribute('aria-label', 'Bookmark this board');
    mobile.innerHTML = '<div class="su-bm-prompt"><span>Keep this board?</span><button id="su-bm-mobile-action" type="button" aria-controls="su-bm-mobile-help" aria-expanded="false">Bookmark</button><button type="button" class="su-bm-x" aria-label="Dismiss bookmark prompt">×</button></div><span id="su-bm-mobile-help" hidden>Share (or menu) → Bookmark</span>';
    mobile.querySelector('.su-bm-x').addEventListener('click', function () { lastTrigger = null; dismiss(); });
    mobile.querySelector('#su-bm-mobile-action').addEventListener('click', function () {
      var hint = document.getElementById('su-bm-mobile-help');
      hint.hidden = !hint.hidden;
      this.setAttribute('aria-expanded', String(!hint.hidden));
      reserveMobileSpace();
      log('bookmark_help');
    });
    mobile.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); document.getElementById('su-bm-mobile-help').hidden = true; document.getElementById('su-bm-mobile-action').setAttribute('aria-expanded', 'false'); reserveMobileSpace(); }
    });
    var stage = document.getElementById('resp-stage');
    if (stage) stage.insertAdjacentElement('beforebegin', mobile); else document.body.insertBefore(mobile, document.body.firstChild);
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest && event.target.closest('[data-bookmark-help]');
      if (!trigger) return;
      var hint = document.getElementById(trigger.getAttribute('data-bookmark-help'));
      if (!hint) return;
      lastTrigger = trigger; hint.hidden = false; syncTriggers();
      hint.focus({ preventScroll:true }); hint.scrollIntoView({ block:'nearest', behavior:'auto' });
      log('bookmark_help');
    });
    syncTriggers();
    window.addEventListener('resize', syncTriggers);
    if (typeof ResizeObserver === 'function') new ResizeObserver(reserveMobileSpace).observe(mobile);
    if (!dismissed) log('bookmark_view');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
