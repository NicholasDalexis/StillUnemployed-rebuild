/* Homepage bookmark reminder. The browser owns the keyboard shortcut;
   this is a dismissible explanation, never a fake bookmark button. */
(function () {
  'use strict';
  var path = String(location.pathname || '').toLowerCase().replace(/\/+$/, '');
  if (path !== '' && !/\/index\.html$/.test(path)) return;
  var KEY = 'su_bookmark_dismissed';
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}
  var mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
  var shortcut = mac ? '⌘ + D' : 'Ctrl + D';
  function log(action) { try { if (typeof window.suTrack === 'function') window.suTrack(action, '', ''); } catch (e) {} }
  function dismiss() {
    ['su-bm-postit', 'su-bm-bar'].forEach(function (id) { var node = document.getElementById(id); if (node) node.remove(); });
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    log('bookmark_dismiss');
  }
  function reminder(id, text) {
    var node = document.createElement('div');
    node.id = id;
    node.className = 'su-bm-inline';
    node.innerHTML = text + '<button type="button" class="su-bm-x" aria-label="Dismiss bookmark reminder">✕</button>';
    node.querySelector('button').addEventListener('click', dismiss);
    return node;
  }
  function mount() {
    if (document.getElementById('su-bm-css')) return;
    var css = document.createElement('style');
    css.id = 'su-bm-css';
    css.textContent = '#su-bm-postit,#su-bm-bar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;color:#6F5E45;font:18px/1.3 "Indie Flower",cursive;background:none;box-shadow:none;}' +
      '#su-bm-postit{margin-top:24px;}' +
      '#su-bm-postit kbd{padding:5px 8px;border:1px solid #b9a98d;border-radius:4px;color:#5c402e;font:600 13px/1.2 "Archivo",sans-serif;white-space:nowrap;}' +
      '#su-bm-postit .su-bm-x,#su-bm-bar .su-bm-x{border:0;background:none;color:#6F5E45;width:44px;height:44px;flex:none;cursor:pointer;}' +
      '.su-bm-x:focus-visible{outline:2px solid #D8502E;outline-offset:2px;}' +
      '@media(min-width:641px){#su-bm-bar{display:none!important;}}' +
      '@media(max-width:640px){#su-bm-postit{display:none!important;}#su-bm-bar.su-bm-inline{position:static;display:flex;max-width:364px;margin:0 auto 12px;padding:4px 12px;transform:none;}}';
    document.head.appendChild(css);
    var slot = document.getElementById('nh-bookmark-slot');
    if (slot) slot.appendChild(reminder('su-bm-postit', '<span>Bookmark this board</span><kbd title="Press ' + (mac ? 'Command and D' : 'Control and D') + ' to bookmark this page">' + shortcut + '</kbd>'));
    var mobile = reminder('su-bm-bar', '<span class="su-bm-txt">Keep this board handy. Add a bookmark.</span>');
    var stage = document.getElementById('resp-stage');
    if (stage) stage.insertAdjacentElement('afterend', mobile); else document.body.appendChild(mobile);
    log('bookmark_view');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
