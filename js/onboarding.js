/* Version 2 welcome. Browser-local receipt, deliberately independent of account sync. */
(function (global) {
  'use strict';
  var KEY = 'su_welcome_v2_seen';
  var STATE_KEY = 'su_welcome_v2_state', AUTO_LIMIT = 2;
  function storage(name) { try { return global[name]; } catch (_) { return null; } }
  function mergeState(left, right) {
    return { shown:Math.max(left.shown, right.shown), dismissed:left.dismissed || right.dismissed };
  }
  function readState(stores) {
    var state = { shown:0, dismissed:false };
    stores.forEach(function (store) {
      try {
        if (!store) return;
        // Earlier releases wrote this on first display. Keep those visitors quiet.
        if (store.getItem(KEY) === '1') state.dismissed = true;
        var saved = JSON.parse(store.getItem(STATE_KEY) || 'null');
        if (saved && Number.isInteger(saved.shown) && saved.shown >= 0 && typeof saved.dismissed === 'boolean') {
          state = mergeState(state, { shown:Math.min(saved.shown, AUTO_LIMIT), dismissed:saved.dismissed });
        }
      } catch (_) { /* Unavailable or malformed storage cannot block manual access. */ }
    });
    return state;
  }
  function writeState(stores, state) {
    var value = JSON.stringify(state);
    return stores.some(function (store) {
      try {
        if (!store) return false;
        store.setItem(STATE_KEY, value);
        if (store.getItem(STATE_KEY) !== value) return false;
        // Older cached releases also honor an explicit dismissal when possible.
        if (state.dismissed) { try { store.setItem(KEY, '1'); } catch (_) {} }
        return true;
      } catch (_) { return false; }
    });
  }
  function incomingTask(search, hash) {
    var params = new URLSearchParams(search || '');
    return ['job', 'code', 'state', 'error', 'oauth_token'].some(function (key) { return params.has(key); }) || /(?:access_token|id_token)=/.test(hash || '');
  }
  // The pure persistence policy is also exercised by the regression suite.
  if (typeof module === 'object' && module.exports) {
    module.exports = { key:KEY, stateKey:STATE_KEY, limit:AUTO_LIMIT, readState:readState, writeState:writeState, incomingTask:incomingTask };
    return;
  }

  var doc = global.document, dialog, returnFocus, lastCard, bodyOverflow, pending;
  var stores = [storage('localStorage'), storage('sessionStorage')];
  var memory = { shown:0, dismissed:false };
  function currentState() { return mergeState(memory, readState(stores)); }
  function remember(state) { memory = mergeState(memory, state);return writeState(stores, memory); }
  // Shared links and auth return URLs keep their requested task for this visit.
  // A normal Jobs visit can introduce the release later; manual reopening always works.
  var considered = incomingTask(location.search, location.hash);
  var previews = {
    advice: '<div class="su-launch-paper"><small>note to self ↓</small><strong>your job hunt needs<br>days off, too</strong><span class="su-launch-days"><i>S</i><i>M</i><i>T</i><i>W</i><i>T</i><i>F</i><i>S</i></span><em>wait, why friday? →</em></div>',
    themes: '<div class="su-launch-swatches"><span class="su-launch-original">Original</span><span class="su-launch-casino">Casino</span><span class="su-launch-beauty">Beauty</span><span class="su-launch-mermaid">Mermaid</span><span class="su-launch-bratt">bratt</span><span class="su-launch-chess">Chess</span></div>',
    sync: '<div class="su-launch-tracker"><div class="su-launch-tracker-head"><strong>My job tracker</strong><span>↗</span></div><div><span>Designer</span><b>Applied</b></div><div><span>Content lead</span><b>Interview</b></div><div><span>Next move</span><b>Saved</b></div><small>one less spreadsheet</small></div>',
    portfolio: '<div class="su-launch-tier"><small>EXAMPLE FEEDBACK</small><div><b>A</b><span><i>First impression</i><i>Mobile</i><i>Performance</i></span></div><div><b>B</b><span><i>Positioning</i></span></div><div><b>C</b><span><i>Text hard to read</i></span></div></div>'
  };
  var features = {
    advice: { label: 'Advice along the way', short: 'Advice notes', tag: 'A little perspective', text: 'A useful pause between applications. Open a note for a job-hunt tip while you browse. Want more? Each note connects to The Job Hunt Recipe, our optional newsletter.' },
    themes: { label: 'Make it feel like you', short: 'More themes', tag: 'More ways to make it yours', text: 'Different looks. The same jobs. From Casino to Mermaid to Chess, find a board that feels like you. Use “change theme” on the board whenever you want a new look.' },
    sync: { label: 'Your job hunt, in one place', short: 'Your job tracker', tag: 'Less spreadsheet. More progress.', text: 'Keep applications, interview stages, notes and next steps together. See where each job stands without building a spreadsheet. Sign in with the same Google account to bring your tracker between your phone and computer.' },
    portfolio: { label: 'A second opinion on your homepage', short: 'Portfolio Graded', tag: 'Coming soon', text: 'Get feedback on your portfolio homepage: what comes across clearly, what is hard to read and what you could improve next. The tier list above is an example, not a review of your site.' }
  };
  function preview(key) { return '<div class="su-launch-preview" aria-hidden="true">' + previews[key] + '</div>'; }
  function overview() {
    return '<div class="su-launch-grid">' + ['advice','themes','sync','portfolio'].map(function (key) {
      return '<button type="button" class="su-launch-card'+(key === 'portfolio' ? ' su-launch-pg' : '')+'" data-launch-feature="'+key+'" aria-label="'+features[key].short+'. Learn more">'+preview(key)+'<span class="su-launch-card-label">'+features[key].short+'<span aria-hidden="true">↗</span></span>'+(key === 'portfolio' ? '<span class="su-launch-card-hint">Coming soon</span>' : '')+'</button>';
    }).join('') + '</div>';
  }
  function setDetail(detail) {
    dialog.querySelector('.su-launch-overview-title').hidden = detail;
    dialog.querySelector('.su-launch-close').hidden = detail;
    dialog.querySelector('.su-launch-back').hidden = !detail;
    dialog.querySelector('.su-launch-intro').hidden = detail;
    dialog.querySelector('.su-launch-footer').hidden = detail;
    dialog.querySelector('.su-launch-reopen').hidden = detail;
    dialog.setAttribute('aria-labelledby', detail ? 'su-launch-detail-title' : 'su-launch-title');
    var scroll = dialog.querySelector('.su-launch-scroll');
    if (detail) {
      scroll.setAttribute('role', 'region');
      scroll.setAttribute('aria-labelledby', 'su-launch-detail-title');
      scroll.setAttribute('tabindex', '0');
    } else {
      scroll.removeAttribute('role');
      scroll.removeAttribute('aria-labelledby');
      scroll.removeAttribute('tabindex');
    }
  }
  function renderOverview(focusCard) {
    setDetail(false);
    dialog.querySelector('.su-launch-stage').innerHTML = overview();
    dialog.querySelector('.su-launch-scroll').scrollTop = 0;
    if (focusCard) dialog.querySelector('[data-launch-feature="'+focusCard+'"]').focus({ preventScroll:true });
  }
  function renderFeature(key) {
    var feature = features[key];
    if (!feature) return;
    lastCard = key;
    setDetail(true);
    dialog.querySelector('.su-launch-stage').innerHTML = '<section class="su-launch-detail"><div class="su-launch-detail-art">'+preview(key)+'<small>'+ (key === 'themes' ? 'Theme previews only' : 'Illustrative preview') +'</small></div><p class="su-launch-eyebrow">'+feature.tag+'</p><h3 id="su-launch-detail-title">'+feature.label+'</h3><p>'+feature.text+'</p>'+(key === 'portfolio' ? '<a class="su-launch-detail-link" href="https://portfoliograded.com/" target="_blank" rel="noopener noreferrer" aria-label="Portfolio Graded, coming soon. Opens in a new tab">Portfolio Graded · coming soon ↗</a>' : '')+'</section>';
    dialog.querySelector('.su-launch-scroll').scrollTop = 0;
    dialog.querySelector('[data-launch-back]').focus({ preventScroll:true });
  }
  function close() {
    if (!dialog || !dialog.open) return;
    var state = currentState();state.dismissed = true;remember(state);
    dialog.close();
  }
  function build() {
    if (dialog) return;
    dialog = doc.createElement('dialog');
    dialog.id = 'su-launch'; dialog.className = 'su-launch';
    dialog.setAttribute('aria-labelledby','su-launch-title');
    dialog.innerHTML = '<header class="su-launch-header"><div class="su-launch-overview-title"><h2 id="su-launch-title">Version 2 is here!</h2></div><button type="button" class="su-launch-back" data-launch-back hidden>← go back</button><button type="button" class="su-launch-close" data-launch-close aria-label="Close Version 2 welcome" autofocus>×</button></header><div class="su-launch-scroll"><p class="su-launch-intro">pick a note to see what’s new ↓</p><div class="su-launch-stage"></div><footer class="su-launch-footer"><a href="/suggest.html">Suggest Jobs →</a><button type="button" class="su-launch-primary" data-launch-close>Let’s find a role →</button></footer><p class="su-launch-reopen"><a href="/versions.html" data-su-version>Version history</a></p></div>';
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
      var items = Array.from(dialog.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')).filter(function (el) { return el.getClientRects().length; });
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
  function open() {
    if (doc.querySelector('#overlay-root [role="dialog"]') || (dialog && dialog.open)) return false;
    build();
    if (typeof dialog.showModal !== 'function') return false;
    returnFocus = doc.activeElement;
    renderOverview();
    bodyOverflow = doc.body.style.overflow;
    try { dialog.showModal(); } catch (_) { return false; }
    doc.body.style.overflow = 'hidden';
    considered = true;
    return true;
  }
  function maybeShow() {
    function deferred() { return doc.querySelector('#overlay-root [role="dialog"]') || (global.SUApp && (global.SUApp._loadError || global.SUApp.state.openPanel)); }
    if (considered || pending || deferred()) return pending;
    var locks;
    try { locks = global.navigator && global.navigator.locks; } catch (_) {}
    // A browser-wide cap needs both cross-tab serialization and shared durable
    // storage. Session storage and memory still support manual use and dismissal.
    if (!locks || typeof locks.request !== 'function') { considered = true;return; }
    try {
      pending = locks.request('su-welcome-v2-auto', { mode:'exclusive' }, function (lock) {
        // Another tab, a manual opening or another dialog may have won while queued.
        if (!lock || considered || deferred()) return;
        var state = currentState();
        considered = true;
        if (state.dismissed || state.shown >= AUTO_LIMIT) return;
        build();
        if (typeof dialog.showModal !== 'function') return;
        var reserved = { shown:state.shown + 1, dismissed:false };
        if (!writeState([stores[0]], reserved)) return;
        if (open()) memory = mergeState(memory, reserved);
        else writeState([stores[0]], state); // A failed native opening spends no appearance.
      });
      pending = Promise.resolve(pending).then(function () { pending = null; }, function () { considered = true;pending = null; });
      return pending;
    } catch (_) { considered = true;pending = null; }
  }
  global.SUWelcome = Object.freeze({ open:open, maybeShow:maybeShow });
})(typeof window === 'undefined' ? globalThis : window);
