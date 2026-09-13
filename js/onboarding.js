/* Version history stays available on demand. Arrival never opens a dialog.
   Keep the old API while older pages/cached app.js still call maybeShow/open;
   historical announcement receipts are deliberately left untouched. */
(function (global) {
  'use strict';
  function historyUrl() {
    var version = global.SURelease && global.SURelease.version;
    return '/versions.html' + (typeof version === 'string' && /^\d+(?:\.\d+){2,3}$/.test(version) ? '#version-' + version.replace(/\./g, '-') : '');
  }
  function open(automatic) {
    if (automatic === true) return false;
    global.location.assign(historyUrl());return true;
  }
  global.SUWelcome = Object.freeze({ open:open, maybeShow:function () { return false; } });
})(typeof window === 'undefined' ? globalThis : window);
