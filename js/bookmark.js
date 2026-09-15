/* Quiet desktop guidance. Browsers create bookmarks; no arrival popup. */
(function (global) {
  'use strict';
  var doc = global.document;
  function mount() {
    var slot = doc.getElementById('nh-bookmark-slot');
    if (!slot || slot.firstChild || !global.matchMedia('(min-width: 701px)').matches) return;
    var platform = (global.navigator.userAgentData && global.navigator.userAgentData.platform) || global.navigator.platform || global.navigator.userAgent || '';
    var shortcut = /Mac/i.test(platform) ? '⌘ + D' : 'Ctrl + D';
    var note = doc.createElement('div');note.className = 'su-bm-inline';
    note.innerHTML = '<p><kbd>' + shortcut + '</kbd> to bookmark this board.</p><p class="su-bm-caption">Just in case you never see us again.</p>';
    slot.appendChild(note);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount);else mount();
  var desktop = global.matchMedia('(min-width: 701px)');
  if (desktop.addEventListener) desktop.addEventListener('change', mount);else desktop.addListener(mount);
})(window);
