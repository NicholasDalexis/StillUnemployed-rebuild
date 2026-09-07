/* Latest Update. Browser-local receipt, deliberately independent of account sync. */
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
  var autoTimer = null, delayElapsed = false;
  var stores = [storage('localStorage'), storage('sessionStorage')];
  var memory = { shown:0, dismissed:false };
  function currentState() { return mergeState(memory, readState(stores)); }
  function remember(state) { memory = mergeState(memory, state);return writeState(stores, memory); }
  // Shared links and auth return URLs keep their requested task for this visit.
  // A normal Jobs visit can introduce the release later; manual reopening always works.
  var considered = incomingTask(location.search, location.hash);
  // Drawn, decorative marks stay consistent across system fonts and devices.
  function arrow(direction) {
    var path = direction === 'down' ? 'M10 3C9 8 11 14 10 21M4 15L10 21L16 15' : 'M3 15C11 9 20 9 29 12M22 5L29 12L21 18';
    return '<svg class="su-launch-arrow su-launch-arrow-'+direction+'" viewBox="0 0 '+(direction === 'down' ? '20' : '32')+' 24" fill="none" aria-hidden="true" focusable="false"><path d="'+path+'" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  }
  function trackerPreview() {
    var chevron = '<svg class="su-launch-chevron" viewBox="0 0 12 10" fill="none" aria-hidden="true" focusable="false"><path d="M2 3L6 7L10 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    return '<div class="su-launch-tracker"><div class="su-launch-tracker-head"><strong>My job tracker</strong></div>'+[
      ['Social Media Manager','Apply','apply'],
      ['Graphic Designer','Interview','interview'],
      ['Photographer','Offer','offer']
    ].map(function (row) {
      return '<div class="su-launch-tracker-row"><span class="su-launch-tracker-role">'+row[0]+'</span><span class="su-launch-tracker-status su-launch-status-'+row[2]+'">'+row[1]+chevron+'</span></div>';
    }).join('')+'<small>one less spreadsheet</small></div>';
  }
  var previews = {
    advice: '<div class="su-launch-paper"><small>note to self '+arrow('down')+'</small><strong>your job hunt needs<br>days off, too</strong><span class="su-launch-days"><i>S</i><i>M</i><i>T</i><i>W</i><i>T</i><i>F</i><i>S</i></span><em>wait, why friday? '+arrow('right')+'</em></div>',
    themes: '<div class="su-launch-swatches"><span class="su-launch-original">Original</span><span class="su-launch-casino">Casino</span><span class="su-launch-beauty">Beauty</span><span class="su-launch-mermaid">Mermaid</span><span class="su-launch-bratt">bratt</span><span class="su-launch-chess">Chess</span></div>',
    sync: trackerPreview(),
    internships: '<div class="su-launch-internships"><small>a place to start '+arrow('down')+'</small><div class="su-launch-intern-note"><strong>Your next chapter</strong><span>Design Intern</span><b>$25/hour</b><span>New York, NY</span></div><em>internships have a board, too '+arrow('right')+'</em></div>'
  };
  var features = {
    advice: { label: 'Advice along the way', short: 'Advice notes', tag: 'A little perspective', text: 'A useful pause between applications. Open a note for a job-hunt tip while you browse. Want more? Each note connects to The Job Hunt Recipe, our optional newsletter.' },
    themes: { label: 'Make it feel like you', short: 'More themes', tag: 'More ways to make it yours', text: 'Different looks. The same jobs. From Casino to Mermaid to Chess, find a board that feels like you. Use “change theme” on the board whenever you want a new look.' },
    sync: { label: 'Your job hunt, in one place', short: 'Your job tracker', tag: 'Less spreadsheet. More progress.', text: 'Applications, interviews, offers. Keep it all here. Sign in with Google to pick up on your phone or computer.' },
    internships: { label: 'Your first step starts here', short: 'Internships are here', tag: 'A board for your next chapter', text: 'Explore internships in one place. See the pay and location at a glance, then open a card for a quick summary and details like timing or student requirements. Save the ones you like and keep applications in your tracker.' }
  };
  function preview(key) { return '<div class="su-launch-preview" aria-hidden="true">' + previews[key] + '</div>'; }
  function overview() {
    return '<div class="su-launch-grid">' + ['advice','themes','sync','internships'].map(function (key) {
      return '<button type="button" class="su-launch-card" data-launch-feature="'+key+'" aria-label="'+features[key].short+'. Learn more">'+preview(key)+'<span class="su-launch-card-label">'+features[key].short+arrow('up-right')+'</span></button>';
    }).join('') + '</div>';
  }
  function setDetail(detail) {
    dialog.querySelector('.su-launch-overview-title').hidden = detail;
    dialog.querySelector('.su-launch-close').hidden = detail;
    dialog.querySelector('.su-launch-back').hidden = !detail;
    dialog.querySelector('.su-launch-intro').hidden = detail;
    dialog.querySelector('.su-launch-footer').hidden = detail;
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
    dialog.querySelector('.su-launch-stage').innerHTML = '<section class="su-launch-detail"><div class="su-launch-detail-art">'+preview(key)+'<small>'+ (key === 'themes' ? 'Theme previews only' : 'Illustrative preview') +'</small></div><p class="su-launch-eyebrow">'+feature.tag+'</p><h3 id="su-launch-detail-title">'+feature.label+'</h3><p>'+feature.text+'</p>'+(key === 'internships' ? '<a class="su-launch-detail-link" href="/internships.html" data-launch-close>Browse internships '+arrow('right')+'</a>' : '')+'</section>';
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
    dialog.innerHTML = '<header class="su-launch-header"><div class="su-launch-overview-title"><h2 id="su-launch-title">Latest Update</h2></div><button type="button" class="su-launch-back" data-launch-back hidden>'+arrow('left')+' go back</button><button type="button" class="su-launch-close" data-launch-close aria-label="Close Latest Update" autofocus>×</button></header><div class="su-launch-scroll"><p class="su-launch-intro">pick a note to see what’s new '+arrow('down')+'</p><div class="su-launch-stage"></div><footer class="su-launch-footer"><button type="button" class="su-launch-primary" data-launch-close>Let’s find a role '+arrow('right')+'</button></footer></div>';
    doc.body.appendChild(dialog);
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
    if (autoTimer !== null) { global.clearTimeout(autoTimer);autoTimer = null; }
    return true;
  }
  function maybeShow() {
    function deferred() { return doc.querySelector('#overlay-root [role="dialog"]') || (global.SUApp && (global.SUApp._loadError || global.SUApp.state.openPanel)); }
    if (considered || pending || deferred()) return pending;
    // Start once the board is usable. Re-renders keep the original deadline;
    // expiry still respects whatever task the visitor opened in the meantime.
    if (!delayElapsed) {
      if (autoTimer === null) autoTimer = global.setTimeout(function () {
        autoTimer = null;delayElapsed = true;maybeShow();
      }, 30000);
      return;
    }
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
