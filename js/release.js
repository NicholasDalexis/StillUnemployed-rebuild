/* Generated from releases.json by scripts/version.mjs. */
(function () {
  'use strict';
  var version = "2.5.0";
  function render() {
    document.querySelectorAll('[data-su-version]').forEach(function (link) {
      link.textContent = 'Version ' + version;
      link.setAttribute('href', '/versions.html#version-' + version.replace(/\./g, '-'));
      link.setAttribute('aria-label', 'Version ' + version + '. View version history');
    });
  }
  // The board calls render after replacing its markup. No observer is needed.
  window.SURelease = Object.freeze({ version: version, render: render });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
