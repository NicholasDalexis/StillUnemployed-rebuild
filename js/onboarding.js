/* Version 2 welcome. Browser-local receipt, deliberately independent of account sync. */
(function (global) {
  'use strict';
  var KEY = 'su_welcome_v2_seen';
  function storage(name) { try { return global[name]; } catch (_) { return null; } }
  function hasSeen(stores) {
    return stores.some(function (store) { try { return store && store.getItem(KEY) === '1'; } catch (_) { return false; } });
  }
  function remember(stores) {
    return stores.some(function (store) {
      try { if (!store) return false; store.setItem(KEY, '1'); return store.getItem(KEY) === '1'; } catch (_) { return false; }
    });
  }
  function incomingTask(search, hash) {
    var params = new URLSearchParams(search || '');
    return ['job', 'code', 'state', 'error', 'oauth_token'].some(function (key) { return params.has(key); }) || /(?:access_token|id_token)=/.test(hash || '');
  }
  // The pure persistence policy is also exercised by the regression suite.
  if (typeof module === 'object' && module.exports) {
    module.exports = { key: KEY, hasSeen: hasSeen, remember: remember, incomingTask: incomingTask };
    return;
  }

  var doc = global.document, dialog, returnFocus, lastCard, bodyOverflow;
  var stores = [storage('localStorage'), storage('sessionStorage')];
  // Shared links and auth return URLs keep their requested task for this visit.
  // A normal Jobs visit can introduce the release later; manual reopening always works.
  var considered = incomingTask(location.search, location.hash);
  var google = '<svg aria-hidden="true" viewBox="0 0 48 48" width="26" height="26"><path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-3-.4-4.5H24v8.5h11c-.5 2.5-1.9 4.6-4.1 6v5h6.6c3.8-3.5 6.1-8.7 6.1-15z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2C9.2 39.5 16.1 44 24 44z"/><path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.2H5.8a20 20 0 0 0 0 17.6z"/><path fill="#EA4335" d="M24 12c3 0 5.5 1 7.5 2.9l5.6-5.6A19 19 0 0 0 24 4C16.1 4 9.2 8.5 5.8 15.2l6.8 5.2C14.2 15.6 18.7 12 24 12z"/></svg>';
  var previews = {
    advice: '<div class="su-launch-paper"><small>note to self ↓</small><strong>the days you shouldn’t<br>apply to jobs</strong><span class="su-launch-days"><i>S</i><i>M</i><i>T</i><i>W</i><i>T</i><i>F</i><i>S</i></span><em>wait, why monday? →</em></div>',
    themes: '<div class="su-launch-swatches"><span class="su-launch-original">Original</span><span class="su-launch-casino">Casino</span><span class="su-launch-beauty">Beauty</span><span class="su-launch-mermaid">Mermaid</span><span class="su-launch-bratt">bratt</span><span class="su-launch-chess">Chess</span></div>',
    sync: '<div class="su-launch-tracker"><div class="su-launch-tracker-head">'+google+'<strong>My job hunt</strong><span>↗</span></div><div><span>Designer</span><b>Applied</b></div><div><span>Content lead</span><b>Interview</b></div><div><span>Next move</span><b>Saved</b></div><small>phone ↔ computer</small></div>',
    portfolio: '<div class="su-launch-tier"><small>EXAMPLE FEEDBACK</small><div><b>A</b><span><i>First impression</i><i>Mobile</i><i>Performance</i></span></div><div><b>B</b><span><i>Positioning</i></span></div><div><b>C</b><span><i>Text hard to read</i></span></div></div>'
  };
  var features = {
    advice: { label: 'Advice along the way', tag: 'A little perspective', text: 'A useful pause between applications. Open a note for a job-hunt tip while you browse. Want more? Each note connects to The Job Hunt Recipe, our optional newsletter.', cta: 'Back to the jobs' },
    themes: { label: 'Make it feel like you', tag: 'More ways to make it yours', text: 'Different looks. The same jobs. From Casino to Mermaid to Chess, find a board that feels like you. Use “change theme” on the board whenever you want a new look.', cta: 'Back to the jobs' },
    sync: { label: 'Your hunt, in sync', tag: 'Google sign-in + your job tracker', text: 'Save a role on your phone. Pick it up on your computer. Sign in with the same Google account on both devices to sync Saved and Tracker. Keep applications, notes and next steps together, without building a spreadsheet.', cta: 'Open your tracker', href: '/tracker.html' }
  };
  function preview(key) { return '<div class="su-launch-preview" aria-hidden="true">' + previews[key] + '</div>'; }
  function overview() {
    return '<div class="su-launch-grid">' + ['advice','themes','sync'].map(function (key) {
      return '<button type="button" class="su-launch-card" data-launch-feature="'+key+'" aria-label="'+features[key].label+'. Learn more">'+preview(key)+'<span class="su-launch-card-label">'+features[key].label+'<span aria-hidden="true">↗</span></span><span class="su-launch-card-hint">Tap to turn over</span></button>';
    }).join('') + '<a class="su-launch-card su-launch-pg" href="https://portfoliograded.com/" target="_blank" rel="noopener noreferrer" aria-label="Portfolio Graded, coming soon. Open private preview, password required, in a new tab">'+preview('portfolio')+'<span class="su-launch-card-label">Portfolio Graded<span aria-hidden="true">↗</span></span><span class="su-launch-card-hint">Coming soon · private preview</span></a></div>';
  }
  function renderOverview(focusCard) {
    dialog.querySelector('.su-launch-stage').innerHTML = overview();
    dialog.querySelector('.su-launch-scroll').scrollTop = 0;
    if (focusCard) dialog.querySelector('[data-launch-feature="'+focusCard+'"]').focus({ preventScroll:true });
  }
  function renderFeature(key) {
    var feature = features[key];
    if (!feature) return;
    lastCard = key;
    dialog.querySelector('.su-launch-stage').innerHTML = '<section class="su-launch-detail"><button type="button" class="su-launch-back" data-launch-back>← All four updates</button><div class="su-launch-detail-art">'+preview(key)+'<small>'+ (key === 'themes' ? 'Theme previews only' : 'Illustrative preview') +'</small></div><p class="su-launch-eyebrow">'+feature.tag+'</p><h3>'+feature.label+'</h3><p>'+feature.text+'</p>'+(feature.href ? '<a class="su-launch-primary" href="'+feature.href+'">'+feature.cta+' →</a>' : '<button type="button" class="su-launch-primary" data-launch-close>'+feature.cta+' →</button>')+'</section>';
    dialog.querySelector('.su-launch-scroll').scrollTop = 0;
    dialog.querySelector('[data-launch-back]').focus({ preventScroll:true });
  }
  function close() { if (dialog && dialog.open) dialog.close(); }
  function build() {
    if (dialog) return;
    dialog = doc.createElement('dialog');
    dialog.id = 'su-launch'; dialog.className = 'su-launch';
    dialog.setAttribute('aria-labelledby','su-launch-title');
    dialog.innerHTML = '<header class="su-launch-header"><div><p class="su-launch-eyebrow">A new chapter for your job hunt</p><h2 id="su-launch-title">Version 2 is here!</h2></div><button type="button" class="su-launch-close" data-launch-close aria-label="Close Version 2 welcome" autofocus>×</button></header><div class="su-launch-scroll"><p class="su-launch-intro">A few new things to make the search feel better.</p><div class="su-launch-stage"></div><footer class="su-launch-footer"><a href="/suggest.html">Suggest Jobs →</a><button type="button" class="su-launch-primary" data-launch-close>Let’s find a role →</button></footer><p class="su-launch-reopen">Miss anything? Find “What’s new” above the jobs. <a href="/versions.html" data-su-version>Version history</a></p></div>';
    doc.body.appendChild(dialog);
    if (global.SURelease) global.SURelease.render();
    dialog.addEventListener('click', function (event) {
      var feature = event.target.closest('[data-launch-feature]');
      if (feature) { renderFeature(feature.getAttribute('data-launch-feature')); return; }
      if (event.target.closest('[data-launch-back]')) { renderOverview(lastCard); return; }
      if (event.target.closest('[data-launch-close]')) { close(); return; }
      if (event.target === dialog) {
        var rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }
    });
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      var items = Array.from(dialog.querySelectorAll('button:not(:disabled),a[href]')).filter(function (el) { return el.getClientRects().length; });
      var first = items[0], last = items[items.length - 1];
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    dialog.addEventListener('close', function () {
      doc.body.style.overflow = bodyOverflow;
      var target = returnFocus && returnFocus.isConnected && !/^(BODY|HTML)$/.test(returnFocus.tagName) ? returnFocus : doc.querySelector('[data-act="openWelcome"]');
      if (target) target.focus({ preventScroll:true });
    });
  }
  function open(manual) {
    if (doc.querySelector('#overlay-root [role="dialog"]') || (dialog && dialog.open)) return false;
    build();
    if (typeof dialog.showModal !== 'function') return false;
    returnFocus = doc.activeElement;
    renderOverview();
    bodyOverflow = doc.body.style.overflow;
    try { dialog.showModal(); } catch (_) { return false; }
    doc.body.style.overflow = 'hidden';
    considered = true;
    if (manual) remember(stores);
    return true;
  }
  function maybeShow() {
    if (considered || doc.querySelector('#overlay-root [role="dialog"]')) return;
    if (global.SUApp && (global.SUApp._loadError || global.SUApp.state.openPanel)) return;
    if (hasSeen(stores)) { considered = true; return; }
    // No automatic popup unless we can retain its receipt. Session fallback covers
    // browsers that block localStorage; both blocked means manual discovery only.
    if (!remember(stores)) { considered = true; return; }
    open(false);
  }
  global.SUWelcome = Object.freeze({ open: function () { return open(true); }, maybeShow: maybeShow });
})(typeof window === 'undefined' ? globalThis : window);
