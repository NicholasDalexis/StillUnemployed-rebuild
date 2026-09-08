/* Latest Update. Browser-local receipt, deliberately independent of account sync. */
(function (global) {
  'use strict';
  // Advance this identifier only for a deliberately new announcement, not a patch.
  // Historical su_welcome_v2_seen / su_welcome_v2_state receipts stay untouched.
  var KEY = 'su_welcome_announcement_237_ack';
  function storage(name) { try { return global[name]; } catch (_) { return null; } }
  function acknowledged(stores) {
    return stores.some(function (store) { try { return store && store.getItem(KEY) === '1'; } catch (_) { return false; } });
  }
  function writeReceipt(stores, value) {
    return stores.some(function (store) {
      try { if (!store) return false;store.setItem(KEY, value);return store.getItem(KEY) === value; } catch (_) { return false; }
    });
  }
  function incomingTask(search, hash) {
    var params = new URLSearchParams(search || '');
    return ['job', 'code', 'state', 'error', 'oauth_token'].some(function (key) { return params.has(key); }) || /(?:access_token|id_token)=/.test(hash || '');
  }
  // The pure persistence policy is also exercised by the regression suite.
  if (typeof module === 'object' && module.exports) {
    module.exports = { key:KEY, acknowledged:acknowledged, writeReceipt:writeReceipt, incomingTask:incomingTask };
    return;
  }

  var doc = global.document, dialog, returnFocus, lastCard, bodyOverflow;
  var automatic = false, memoryAck = false, manualOpened = false, releaseLock, toast, toastTimer;
  var stores = [storage('localStorage'), storage('sessionStorage')];
  // An intended job/auth task keeps priority. Automatic introduction is attempted
  // once by the initial board shell, never after a feed/network wait or scrolling.
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
    internships: { label: 'Your first step starts here', short: 'Internships', tag: 'A board for your next chapter', text: 'Explore internships in one place. See the pay and location at a glance, then open a card for a quick summary and details like timing or student requirements. Save the ones you like and keep applications in your tracker.' }
  };
  function preview(key) { return '<div class="su-launch-preview" aria-hidden="true">' + previews[key] + '</div>'; }
  function overview() {
    return '<div class="su-launch-grid">' + ['advice','themes','internships','sync'].map(function (key) {
      return '<button type="button" class="su-launch-card" data-launch-feature="'+key+'" aria-label="'+features[key].short+'. Learn more">'+preview(key)+'<span class="su-launch-card-label">'+features[key].short+'</span><span class="su-launch-card-hint">Click here</span></button>';
    }).join('') + '</div>';
  }
  function setDetail(detail) {
    dialog.querySelector('.su-launch-overview-title').hidden = detail;
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
    dialog.querySelector('.su-launch-stage').innerHTML = '<section class="su-launch-detail"><div class="su-launch-detail-art">'+preview(key)+'<small>'+ (key === 'themes' ? 'Theme previews only' : 'Illustrative preview') +'</small></div><p class="su-launch-eyebrow">'+feature.tag+'</p><h3 id="su-launch-detail-title">'+feature.label+'</h3><p>'+feature.text+'</p>'+'</section>';
    dialog.querySelector('.su-launch-scroll').scrollTop = 0;
    dialog.querySelector('[data-launch-back]').focus({ preventScroll:true });
  }
  function close(acknowledge) {
    if (!dialog || !dialog.open) return;
    if (acknowledge) { memoryAck = true;writeReceipt(stores, '1'); }
    dialog.close();
    if (acknowledge) welcomeToast();
  }
  function welcomeToast() {
    if (toastTimer) global.clearTimeout(toastTimer);
    if (toast) toast.remove();
    toast = doc.createElement('div');toast.className = 'su-launch-toast';
    toast.innerHTML = '<span class="su-launch-toast-announcement" role="status">Welcome to version 2</span><span aria-hidden="true">Welcome to </span><button type="button" aria-label="version 2, open Latest Update">version 2</button>';
    // The status message announces the whole sentence once; the visible button
    // supplies the underlined final words without stealing keyboard focus.
    toast.addEventListener('click', function (event) {
      if (!event.target.closest('button')) return;
      if (open()) { global.clearTimeout(toastTimer);toast.remove();toast = null; }
    });
    doc.body.appendChild(toast);
    toastTimer = global.setTimeout(function () { if (toast) toast.remove();toast = null;toastTimer = null; }, 5000);
  }
  function themePreview() {
    var app = global.SUApp, palette = app && app.THEMES && (app.THEMES[app.state.look] || app.THEMES.original);
    dialog.style.setProperty('--su-launch-intern-paper', palette ? palette.hiCard : 'var(--su-yellow-paper)');
    dialog.style.setProperty('--su-launch-intern-ink', palette ? palette.hiInk : 'var(--su-ink)');
  }
  function build() {
    if (dialog) return;
    dialog = doc.createElement('dialog');
    dialog.id = 'su-launch'; dialog.className = 'su-launch';
    dialog.setAttribute('aria-labelledby','su-launch-title');
    dialog.innerHTML = '<header class="su-launch-header"><div class="su-launch-overview-title"><h2 id="su-launch-title" tabindex="-1" autofocus>Latest Update</h2></div><button type="button" class="su-launch-back" data-launch-back hidden>'+arrow('left')+' go back</button></header><div class="su-launch-scroll"><p class="su-launch-intro">pick a note to see what’s new '+arrow('down')+'</p><div class="su-launch-stage"></div></div><footer class="su-launch-footer"><button type="button" class="su-launch-primary" data-launch-close>Let’s find a role '+arrow('right')+'</button></footer>';
    doc.body.appendChild(dialog);
    dialog.addEventListener('click', function (event) {
      var feature = event.target.closest('[data-launch-feature]');
      if (feature) { renderFeature(feature.getAttribute('data-launch-feature')); return; }
      if (event.target.closest('[data-launch-back]')) { renderOverview(lastCard); return; }
      if (event.target.closest('[data-launch-close]')) { close(true); return; }

    });
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); });
    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      var items = Array.from(dialog.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')).filter(function (el) { return el.getClientRects().length; });
      var first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (doc.activeElement === first || !items.includes(doc.activeElement))) { event.preventDefault(); last.focus({ preventScroll:true }); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus({ preventScroll:true }); }
    });
    dialog.addEventListener('close', function () {
      doc.body.style.overflow = bodyOverflow;
      if (releaseLock) { releaseLock();releaseLock = null; }
      var target = returnFocus && returnFocus.isConnected && returnFocus.getClientRects().length && !/^(BODY|HTML)$/.test(returnFocus.tagName) ? returnFocus : (doc.querySelector('#su-board-menu-trigger') || doc.querySelector('[data-act="openWelcome"]'));
      if (target) target.focus({ preventScroll:true });
    });
  }
  function open(isAutomatic) {
    if (doc.querySelector('#overlay-root [role="dialog"]') || (dialog && dialog.open)) return false;
    build();
    if (typeof dialog.showModal !== 'function') return false;
    automatic = isAutomatic === true;
    if (!automatic) manualOpened = true;
    returnFocus = doc.activeElement;
    renderOverview();themePreview();
    bodyOverflow = doc.body.style.overflow;
    try { dialog.showModal(); } catch (_) { return false; }
    doc.body.style.overflow = 'hidden';
    considered = true;
    return true;
  }
  function maybeShow() {
    if (considered) return;
    considered = true;
    var attemptedAt = Date.now();
    function eligible() {
      return !doc.hidden && Date.now() - attemptedAt < 1500 && (global.scrollY || 0) <= 24 &&
        !doc.querySelector('#overlay-root [role="dialog"]') &&
        !(global.SUApp && (global.SUApp._loadError || global.SUApp.state.openPanel)) &&
        !(dialog && dialog.open) && !manualOpened && !memoryAck && !acknowledged(stores);
    }
    if (!eligible()) return;
    // Verify durable browser storage before an automatic, acknowledgment-only
    // introduction. Manual discovery still works when browser storage is denied.
    try {
      if (!stores[0]) return;
      var probe = KEY + '_check';
      stores[0].setItem(probe, '1');
      if (stores[0].getItem(probe) !== '1') return;
      stores[0].removeItem(probe);
    } catch (_) { return; }
    var locks;
    try { locks = global.navigator && global.navigator.locks; } catch (_) {}
    if (!locks || typeof locks.request !== 'function') { if (eligible()) open(true);return; }
    try {
      // Never queue a late popup behind another tab. Keep the lock for the open
      // introduction, so another tab cannot introduce the same update at once.
      Promise.resolve(locks.request('su-welcome-announcement-237', { mode:'exclusive', ifAvailable:true }, function (lock) {
        if (!lock || !eligible() || !open(true)) return;
        return new Promise(function (resolve) { releaseLock = resolve; });
      })).catch(function () { /* Failed browser lock stays quiet; manual use remains. */ });
    } catch (_) { /* No delayed retry that could interrupt the board. */ }
  }
  global.SUWelcome = Object.freeze({ open:open, maybeShow:maybeShow });
})(typeof window === 'undefined' ? globalThis : window);
