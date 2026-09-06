/* Generated from releases.json by scripts/version.mjs. */
(function () {
  'use strict';
  var version = "2";
  function render() {
    document.querySelectorAll('[data-su-version]').forEach(function (link) {
      link.textContent = 'Version ' + version;
      link.setAttribute('href', './versions.html#version-' + version.replace(/\./g, '-'));
      link.setAttribute('aria-label', 'Version ' + version + '. View version history');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
