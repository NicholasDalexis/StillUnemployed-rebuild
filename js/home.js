/* ============================================================
   StillUnemployed.com — Homepage behavior (vanilla JS)
   Reimplements the original Manus page WITHOUT the dc-runtime.
   Two layers, faithful to the export:
     1) Responsive stage  — the original #resp-inject-js: on desktop the
        1440x900 hero is scaled to fit the viewport; on mobile (<=640px)
        it becomes a full-screen image hero whose overlay header, bottom
        nav, sticky "open" note and below-fold panel are injected here.
     2) Component logic    — the original dc-script <script type="text/x-dc">:
        hero image carousel (crossfade + 5s auto-advance + prev/next + dots
        + per-image CTA), the stat-card open/close toggle, the About modal,
        and the newsletter "open" note fold.
   ============================================================ */
(function () {
  'use strict';

  /* -------- per-image carousel data (verbatim from dc-script `imgs`) -------- */
  var IMGS = [
    { cta: 'Find Social Jobs Here',        theme: 'social' },
    { cta: 'Find Copywriting Jobs Here',   theme: 'copy' },
    { cta: 'Find Branding Jobs Here',      theme: 'brand' },
    { cta: 'Find Creative Tech Jobs Here', theme: 'creativetech' },
    { cta: 'Find Marketing Jobs Here',     theme: 'marketing' }
  ];

  var hero, imgIndex = 0, timer = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // Preserve the scrapbook styling while giving its custom actions native-like keyboard behavior.
  function accessibleButton(el, label) {
    if (!el) return;
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('keydown', function (e) {
      if (e.target === el && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault(); el.click();
      }
    });
  }

  var activeDialog = null;
  function dialogActions(panel) {
    return $all('a[href], button, input, select, textarea, [tabindex]', panel).filter(function (el) {
      return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    });
  }
  function focusWithoutScroll(el) { if (el) el.focus({ preventScroll: true }); }
  function openDialog(panel, opener, label, close) {
    if (!panel) return;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', label);
    panel.tabIndex = -1;
    activeDialog = { panel: panel, opener: opener || document.activeElement, close: close };
    focusWithoutScroll(dialogActions(panel)[0] || panel);
  }
  function closeDialog(panel) {
    if (!panel) return;
    panel.removeAttribute('aria-modal');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-label');
    panel.removeAttribute('tabindex');
    if (!activeDialog || activeDialog.panel !== panel) return;
    var opener = activeDialog.opener;
    activeDialog = null;
    if (opener && opener.isConnected && opener.getClientRects().length) focusWithoutScroll(opener);
  }
  function wireDialogKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (!activeDialog || !activeDialog.panel.getClientRects().length) return;
      if (e.key === 'Escape') {
        e.preventDefault(); activeDialog.close();
      } else if (e.key === 'Tab') {
        var actions = dialogActions(activeDialog.panel);
        var first = actions[0] || activeDialog.panel, last = actions[actions.length - 1] || first;
        var current = document.activeElement;
        if (e.shiftKey && (current === first || !actions.includes(current))) {
          e.preventDefault(); focusWithoutScroll(last);
        } else if (!e.shiftKey && (current === last || !actions.includes(current))) {
          e.preventDefault(); focusWithoutScroll(first);
        }
      }
    });
  }

  /* -------- "Change Look?" theme (read-only on the homepage) --------
     The board (jobs.html) owns the full theme system. Here we honor the same
     localStorage choice and recolor the parts that translate cleanly to the
     hero: the page/hero background and the nav + CTA post-its. The dense
     editorial hero art stays as designed (see report: homepage theming is
     intentionally partial). Palettes match MAIN FILE / app.js exactly. */
  var HOME_THEMES = {
    cod:   { bg: '#283026', navBg: '#5C6B3A', navInk: '#EDE7CF' },
    girly: { bg: '#FBD7E8', navBg: '#F25CA2', navInk: '#FFFFFF' }
  };
  function loadLook() {
    try { var v = localStorage.getItem('su_look'); return (v === 'cod' || v === 'girly') ? v : 'original'; }
    catch (e) { return 'original'; }
  }
  function applyHomeTheme() {
    // Homepage intentionally ignores the "Change Look?" choice and always
    // renders the original look. (Nic, Jun 23 2026: the homescreen should not
    // change when you switch the board's look.) Board theming lives in app.js.
    document.body.className = 'su-home';
  }

  /* ======================= component logic ======================= */

  function renderCarousel() {
    // crossfade: only active image visible
    $all('.hero-img').forEach(function (img) {
      var active = parseInt(img.getAttribute('data-idx'), 10) === imgIndex;
      img.style.opacity = active ? '1' : '0';
      img.setAttribute('aria-hidden', String(!active));
    });
    // dots: active = 22px + #F4EEE2, others = 8px + rgba(244,238,226,0.5)
    $all('#hero-dots [data-dot]').forEach(function (d) {
      var active = parseInt(d.getAttribute('data-dot'), 10) === imgIndex;
      d.style.width = active ? '22px' : '8px';
      d.style.background = active ? '#F4EEE2' : 'rgba(244,238,226,0.5)';
      d.setAttribute('aria-pressed', String(active));
    });
    // CTA text + href
    var cta = $('#hero-cta'), txt = $('#hero-cta-text');
    if (txt) txt.textContent = IMGS[imgIndex].cta;
    if (cta) cta.setAttribute('href', './jobs.html?theme=' + IMGS[imgIndex].theme);
  }

  function advance(d) {
    var n = IMGS.length;
    imgIndex = (imgIndex + d + n) % n;
    renderCarousel();
  }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(function () { advance(1); }, 5000);
  }

  function wireCarousel() {
    var next = $('#hero-next'), prev = $('#hero-prev');
    accessibleButton(next, 'Next job category');
    accessibleButton(prev, 'Previous job category');
    if (next) next.addEventListener('click', function () { advance(1); startTimer(); });
    if (prev) prev.addEventListener('click', function () { advance(-1); startTimer(); });
    // clicking a dot jumps to that image
    $all('#hero-dots [data-dot]').forEach(function (d) {
      accessibleButton(d, IMGS[Number(d.getAttribute('data-dot'))].cta);
      d.style.cursor = 'pointer';
      d.addEventListener('click', function () {
        imgIndex = parseInt(d.getAttribute('data-dot'), 10);
        renderCarousel(); startTimer();
      });
    });
    renderCarousel();
    startTimer();
  }

  /* -------- stat card open/close (dc: toggleStat / statOpen) -------- */
  var statOpen = false;
  function wireStat() {
    var toggle = $('#stat-toggle'), arrow = $('#stat-arrow');
    if (!toggle) return;
    accessibleButton(toggle, 'Show job market source');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function () {
      statOpen = !statOpen;
      toggle.setAttribute('aria-expanded', String(statOpen));
      $all('.stat-extra').forEach(function (el) { el.hidden = !statOpen; });
      if (arrow) arrow.style.transform = statOpen ? 'rotate(180deg)' : '';
    });
  }

  /* -------- About modal (dc: openModal / closeModal / stop) -------- */
  function setModal(open, opener) {
    var modal = $('#about-modal'), card = $('#about-modal-card');
    if (modal) modal.hidden = !open;
    if (open) openDialog(card, opener, "Nic's story", function () { setModal(false); });
    else closeDialog(card);
  }
  function wireModal() {
    var fc = $('#founder-card'), modal = $('#about-modal'), card = $('#about-modal-card');
    accessibleButton(fc, "Read Nic's story");
    if (fc) fc.addEventListener('click', function () { setModal(true, fc); });
    if (modal) modal.addEventListener('click', function () { setModal(false); }); // click backdrop closes
    if (card) card.addEventListener('click', function (e) { e.stopPropagation(); }); // clicks inside don't close
    $all('.modal-close').forEach(function (x) {
      accessibleButton(x, 'Close story');
      x.addEventListener('click', function (e) { e.stopPropagation(); setModal(false); });
    });
  }

  /* -------- newsletter "open" note fold (dc: openNl / closeNl / nlOpen) -------- */
  function wireNote() {
    var tab = $('#nl-tab'), note = $('#nl-note'), close = $('#nl-close');
    accessibleButton(tab, 'Open newsletter note');
    accessibleButton(close, 'Close newsletter note');
    function openNote(e) { if (e) e.stopPropagation(); if (tab) tab.hidden = true; if (note) note.hidden = false; focusWithoutScroll(close); }
    function closeNote(e) { if (e) e.stopPropagation(); if (note) note.hidden = true; if (tab) tab.hidden = false; focusWithoutScroll(tab); }
    if (tab) tab.addEventListener('click', openNote);
    if (close) close.addEventListener('click', closeNote);
  }

  /* ======================= NEW desktop/tablet hero (Jul 2026 redesign) =======================
     Ported from Claude Design "StillUnemployed.com" / MAIN FILE (isHome).
     Applies at >640px only; the mobile experience below is untouched. */

  var NH_BASE_W = 1440, NH_BASE_H = 1392;
  var nhIndex = 0, nhGrad = 0, nhTimer = null;

  function nhRender() {
    $all('.nh-img').forEach(function (img) {
      var active = parseInt(img.getAttribute('data-idx'), 10) === nhIndex;
      img.style.opacity = active ? '1' : '0';
      img.setAttribute('aria-hidden', String(!active));
    });
    $all('#nh-dots [data-dot]').forEach(function (d) {
      var active = parseInt(d.getAttribute('data-dot'), 10) === nhIndex;
      d.style.width = active ? '22px' : '8px';
      d.style.background = active ? '#F4EEE2' : 'rgba(244,238,226,0.5)';
      d.setAttribute('aria-pressed', String(active));
    });
    var cta = $('#nh-cta'), txt = $('#nh-cta-text');
    if (txt) txt.textContent = IMGS[nhIndex].cta;
    if (cta) cta.setAttribute('href', './jobs.html?theme=' + IMGS[nhIndex].theme);
  }

  function nhAdvance(d) {
    var n = IMGS.length;
    nhIndex = (nhIndex + d + n) % n;
    // rotate the back polaroid through Nic's 6 grad photos on each advance
    nhGrad = (nhGrad + 1) % 6;
    var g = document.getElementById('nh-grad');
    if (g) g.src = 'assets/grad-' + (nhGrad + 1) + '.jpg';
    nhRender();
  }

  function nhStartTimer() {
    clearInterval(nhTimer);
    nhTimer = setInterval(function () { nhAdvance(1); }, 5000);
  }

  function nhSetModal(open, opener) {
    var m = $('#nh-modal'), card = $('#nh-modal-card');
    if (m) m.hidden = !open;
    if (open) openDialog(card, opener, "Nic's story", function () { nhSetModal(false); });
    else closeDialog(card);
  }

  function nhWire() {
    if (!document.getElementById('hero-desktop')) return;
    var next = $('#nh-next'), prev = $('#nh-prev');
    accessibleButton(next, 'Next job category');
    accessibleButton(prev, 'Previous job category');
    if (next) next.addEventListener('click', function () { nhAdvance(1); nhStartTimer(); });
    if (prev) prev.addEventListener('click', function () { nhAdvance(-1); nhStartTimer(); });
    $all('#nh-dots [data-dot]').forEach(function (d) {
      accessibleButton(d, IMGS[Number(d.getAttribute('data-dot'))].cta);
      d.style.cursor = 'pointer';
      d.addEventListener('click', function () {
        nhIndex = parseInt(d.getAttribute('data-dot'), 10);
        nhRender(); nhStartTimer();
      });
    });
    nhRender(); nhStartTimer();

    // About modal (same content as mobile's, own instance)
    var founder = $('#nh-founder'), story = $('#nh-open-story'), modal = $('#nh-modal'), card = $('#nh-modal-card');
    accessibleButton(founder, "Read Nic's story");
    accessibleButton(story, "Read Nic's story");
    if (founder) founder.addEventListener('click', function () { nhSetModal(true, founder); });
    if (story) story.addEventListener('click', function () { nhSetModal(true, story); });
    if (modal) modal.addEventListener('click', function () { nhSetModal(false); });
    if (card) card.addEventListener('click', function (e) { e.stopPropagation(); });
    $all('.nh-modal-close').forEach(function (x) {
      accessibleButton(x, 'Close story');
      x.addEventListener('click', function (e) { e.stopPropagation(); nhSetModal(false); });
    });

    // newsletter fold inside the modal
    var tab = $('#nh-nl-tab'), note = $('#nh-nl-note'), close = $('#nh-nl-close');
    accessibleButton(tab, 'Open newsletter note');
    accessibleButton(close, 'Close newsletter note');
    if (tab) tab.addEventListener('click', function (e) { e.stopPropagation(); tab.hidden = true; if (note) note.hidden = false; focusWithoutScroll(close); });
    if (close) close.addEventListener('click', function (e) { e.stopPropagation(); if (note) note.hidden = true; if (tab) tab.hidden = false; focusWithoutScroll(tab); });

    nhLoadJobs();
  }

  /* Featured cards + live role count use the same eligibility rules as app.js.
     An unavailable feed must not revive old jobs from a bundled snapshot. */
  var NH_SHEET_ID = '1DRfkDn_OIVlnx06xFaNpNbusXl49jvM26oJsl-qq2nU';
  var NH_CSV = 'https://docs.google.com/spreadsheets/d/' + NH_SHEET_ID + '/gviz/tq?tqx=out:csv&headers=1&gid=2134483974';

  function nhParseCSV(text) {
    var rows = [], row = [], field = '', inQ = false, closed = false, i, c;
    text = String(text).replace(/^\uFEFF/, '');
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; closed = true; } }
        else field += c;
      } else {
        if (c === ',') { row.push(field); field = ''; closed = false; }
        else if (c === '\n' || c === '\r') {
          if (c === '\r' && text[i + 1] === '\n') i++;
          row.push(field); rows.push(row); row = []; field = ''; closed = false;
        } else if (c === '"') {
          if (field || closed) throw new Error('Malformed jobs CSV: unexpected quote');
          inQ = true;
        } else {
          if (closed) throw new Error('Malformed jobs CSV: text after closing quote');
          field += c;
        }
      }
    }
    if (inQ) throw new Error('Malformed jobs CSV: unterminated quoted field');
    if (field.length || row.length || closed) { row.push(field); rows.push(row); }
    return rows;
  }

  // Security: only http(s) links reach window.open (blocks javascript:/data: from a sheet row).
  function nhSafeUrl(u) {
    u = String(u == null ? '' : u).trim();
    try { var url = new URL(u); return /^https?:\/\//i.test(u) && /^https?:$/.test(url.protocol) && url.hostname && !url.username && !url.password ? u : ''; }
    catch (e) { return ''; }
  }

  function nhRowsToJobs(rows) {
    if (!window.SUJobIdentity) throw new Error('Job identity check unavailable. Refresh to retry.');
    if (!rows || !rows.length) throw new Error('Jobs CSV has no header');
    var head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    ['company', 'job title', 'link', 'salary', 'active/dead'].forEach(function (name) {
      if (head.indexOf(name) < 0 || head.indexOf(name) !== head.lastIndexOf(name)) {
        throw new Error('Jobs CSV requires one ' + name + ' column');
      }
    });
    function col(name) { return head.indexOf(name.toLowerCase()); }
    var iCo = col('Company'), iRole = col('Job Title'), iLink = col('Link'),
        iLoc = col('Location'), iType = col('Type'), iPay = col('Salary'),
        iPick = col('Pick'), iAct = col('Active/Dead');
    var get = function (cells, k) { return (k >= 0 && cells[k] != null) ? String(cells[k]).trim() : ''; };
    var jobs = [];
    for (var r = 1; r < rows.length; r++) {
      var cells = rows[r];
      if (cells.every(function (s) { return !s.trim(); })) continue;
      if (cells.length !== head.length) throw new Error('Malformed jobs CSV: column count on row ' + (r + 1));
      var co = get(cells, iCo), role = get(cells, iRole);
      var link = nhSafeUrl(get(cells, iLink)), pay = get(cells, iPay);
      if (!co || !role || !link || !/\d/.test(pay)) continue;
      var act = get(cells, iAct).toLowerCase();
      if (act.indexOf('dead') !== -1 || act === 'inactive' || act === 'no') continue;
      if (/\/\s*(?:h|hr|hour)\b|\bper\s*hour\b|\bhourly\b/i.test(pay)) {
        var rates = (pay.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || []).map(Number);
        if (!rates.length || Math.max.apply(null, rates) < 25) continue;
      }
      jobs.push({
        co: co, role: role, link: link, loc: get(cells, iLoc),
        style: get(cells, iType), pay: pay,
        pick: get(cells, iPick).toLowerCase() === 'featured'
      });
    }
    // Keep one original listing per verified requisition; source rows stay intact.
    return window.SUJobIdentity ? window.SUJobIdentity.groupJobs(jobs).map(function (group) { return group.job; }) : jobs;
  }

  // Keep the board's App.payTier policy: the top listed amount determines the
  // salary band, and hourly or missing salaries are not annualized here.
  function nhPayTier(pay) {
    var text = String(pay || '').replace(/,/g, '');
    var hourly = /\/\s*(?:h|hr|hour)\b|\bper\s*hour\b|\bhourly\b/i.test(text);
    var nums = (text.match(/\d+(?:\.\d+)?\s*[kK]?/g) || []).map(function (n) {
      var value = parseFloat(n);
      return /k/i.test(n) || (!hourly && value < 1000) ? value * 1000 : value;
    });
    if (!nums.length) return 'low';
    var top = Math.max.apply(null, nums);
    if (top >= 100000) return 'high';
    if (top >= 80000) return 'mid';
    return 'low';
  }

  function nhRenderJobs(jobs) {
    var total = $('#nh-total');
    if (total) total.textContent = String(jobs.length);
    var wrap = $('#nh-featured');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!jobs.length) {
      wrap.textContent = 'No roles available right now. Check back soon.';
      return;
    }
    var picks = jobs.filter(function (j) { return j.pick; });
    if (picks.length < 3) picks = picks.concat(jobs.filter(function (j) { return !j.pick; }));
    picks = picks.slice(0, 3);
    var rot = [-1.5, 1, -1];
    picks.forEach(function (j, k) {
      var tier = nhPayTier(j.pay);
      var paper = tier === 'high' ? 'var(--su-yellow-paper)' :
        tier === 'mid' ? 'var(--su-salary-mid-paper)' : 'var(--su-salary-low-paper)';
      var card = document.createElement('a');
      card.className = 'hoverlift';
      card.href = j.link;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.setAttribute('aria-label', j.role + ' at ' + j.co + ' (opens in a new tab)');
      card.style.cssText = 'flex:1; position:relative; cursor:pointer; background:' + paper + '; color:#2A2118; border-radius:3px; padding:26px 24px 22px; box-sizing:border-box; transform:rotate(' + rot[k % 3] + 'deg); box-shadow:3px 8px 20px rgba(44,33,24,0.2); min-height:184px;';
      card.style.textDecoration = 'none';
      var meta = [j.loc, j.style].filter(Boolean).join('  ·  ');
      card.innerHTML =
        '<div style="position:absolute; top:-11px; left:50%; transform:translateX(-50%) rotate(-3deg); width:78px; height:22px; background:rgba(228,202,128,0.6); box-shadow:0 1px 2px rgba(0,0,0,.1);"></div>' +
        '<div style="font-family:\'Archivo Black\', sans-serif; font-weight:900; font-size:21px; line-height:1.12; letter-spacing:-0.3px;"></div>' +
        '<div style="font-family:\'Archivo\', sans-serif; font-weight:600; font-size:15.5px; margin-top:8px; line-height:1.3;"></div>' +
        '<div style="font-family:\'Archivo\', sans-serif; font-weight:800; font-size:22px; letter-spacing:-0.4px; margin-top:14px;"></div>' +
        '<div style="font-size:13.5px; opacity:0.8; font-family:\'Poppins\', sans-serif; margin-top:5px;"></div>' +
        '<div style="display:flex; justify-content:flex-end; align-items:center; margin-top:16px;">' +
          '<div style="font-family:\'Archivo\', sans-serif; font-weight:800; font-size:15px; color:var(--su-orange-on-card); display:inline-flex; align-items:center; gap:4px;">open ' +
            '<svg width="26" height="13" viewBox="0 0 28 14" fill="none" style="overflow:visible;"><path d="M1 7 C 8 2.5, 15 2.5, 24 6.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></path><path d="M18.5 2.6 L25.5 6.9 L19 11.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg></div>' +
        '</div>';
      // text via textContent so job data can never inject markup
      var slots = card.querySelectorAll('div');
      slots[1].textContent = j.co;
      slots[2].textContent = j.role;
      slots[3].textContent = j.pay;
      slots[4].textContent = meta;
      wrap.appendChild(card);
    });
  }

  function nhLoadJobs() {
    return fetch(NH_CSV + '&_=' + Date.now(), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('sheet ' + r.status); return r.text(); })
      .then(function (text) {
        var jobs = nhRowsToJobs(nhParseCSV(text));
        nhRenderJobs(jobs);
      })
      .catch(function (e) {
        var total = $('#nh-total'), wrap = $('#nh-featured');
        if (total) total.textContent = '…';
        if (wrap) {
          wrap.innerHTML = '';
          var message = document.createElement('p');
          message.setAttribute('role', 'status');
          message.textContent = 'Could not load the latest roles. Please refresh to try again.';
          wrap.appendChild(message);
        }
        console.warn('[StillUnemployed] featured roles unavailable:', e && e.message);
      });
  }

  /* ======================= responsive stage (from #resp-inject-js) ======================= */

  var BASE_W = 1440, BASE_H = 900, MOBILE = 640;

  function fit() {
    if (!hero) hero = $('div[data-screen-label="Hero"]');
    if (!hero) return;
    var stage = document.getElementById('resp-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'resp-stage';
      hero.parentNode.insertBefore(stage, hero);
      stage.appendChild(hero);
    }
    var vw = document.documentElement.clientWidth;
    if (vw <= MOBILE) {
      // full-screen image hero handled via CSS; clear any scaling
      hero.style.transform = 'none';
      stage.style.height = 'auto';
      injectHeader(hero);
      injectNavBottom(hero);
      injectBelow(hero, stage);
      injectSticky(hero);
      return;
    }
    // desktop/tablet: the NEW hero is the visible one; scale it to fit
    var nh = document.getElementById('hero-desktop');
    var nhStage = document.getElementById('nh-stage');
    if (nh && nhStage) {
      nh.style.transform = 'none';
      nhStage.style.height = 'auto';
    }
  }

  function injectHeader(hero) {
    // header div kept for positioning context but empty — headline is positioned via CSS
    if (document.getElementById('m-header')) return;
    var h = document.createElement('div');
    h.id = 'm-header';
    hero.insertBefore(h, hero.firstChild);
  }

  function injectNavBottom(hero) {
    if (document.getElementById('m-nav-bottom')) return;
    var n = document.createElement('div');
    n.id = 'm-nav-bottom';
    n.innerHTML =
      '<a href="./index.html">Home</a>' +
      '<a href="./jobs.html">Jobs</a>' +
      '<a href="./tracker.html">Tracker' + (function () {
        try {
          var r = JSON.parse(localStorage.getItem('su_tracker') || '[]');
          var n = Array.isArray(r) ? r.length : 0;
          return n ? ' (<span style="font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 16px;">' + (n > 99 ? '99+' : n) + '</span>)' : '';
        } catch (e) { return ''; }
      })() + '</a>';
    hero.appendChild(n);

  }

  function injectSticky(hero) {
    if (document.getElementById('m-sticky')) return;
    var s = document.createElement('div');
    s.id = 'm-sticky';
    s.innerHTML =
      '<div class="sn-arrow"><svg viewBox="0 0 52 46" fill="none"><path d="M6 40 C 4 18, 22 8, 46 12" stroke="#d34a32" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M46 12 L 37 11 M46 12 L 41 20" stroke="#d34a32" stroke-width="3" stroke-linecap="round"/></svg></div>' +
      '<div class="sn-card">' +
        '<button type="button" class="sn-close" aria-label="Close note">×</button>' +
        '<button type="button" class="sn-label" aria-expanded="false">open</button>' +
        // Keep the signature and job action together so the note ends on one line.
        '<div class="sn-msg">Hi, I’m Nic. I spent 7 months unemployed after graduating in 2025. Today I work at Instagram and make six figures. This is the job board I wish I had, so I built it. Have fun!' +
          '<div class="sn-note-footer"><span class="sn-sign">- Nic</span>' +
          '<a class="sn-jobs" href="./jobs.html">Apply to Jobs <span aria-hidden="true">→</span></a></div>' +
        '</div>' +
      '</div>';
    hero.appendChild(s);
    var label = s.querySelector('.sn-label'), panel = s.querySelector('.sn-card');
    label.setAttribute('aria-controls', 'mobile-founder-note');
    panel.id = 'mobile-founder-note';
    function setSticky(open) {
      if (s.classList.contains('open') === open) return;
      s.classList.toggle('open', open);
      label.setAttribute('aria-expanded', String(open));
      if (open) openDialog(panel, label, "A note from Nic", function () { setSticky(false); });
      else closeDialog(panel);
    }
    if (!window.__mStickyDelegated) {
      window.__mStickyDelegated = true;
      document.addEventListener('click', function (e) {
        var s2 = document.getElementById('m-sticky'); if (!s2) return;
        var inside = s2.contains(e.target);
        if (!inside || e.target.closest('.sn-close')) setSticky(false);
        else if (!s2.classList.contains('open')) setSticky(true);
      });
    }
  }

  function injectBelow(hero, stage) {
    if (document.getElementById('m-below')) return;
    // pull founder image from the original hidden top bar
    var src = '';
    var origImg = hero.querySelector('div[style*="height: 110px"] img');
    if (origImg) src = origImg.getAttribute('src') || origImg.src || '';
    var b = document.createElement('div');
    b.id = 'm-below';
    b.innerHTML =
      '<div class="m-folder">' +
        '<div class="f-tab"><span>Jobs Ghost More Than Hinge</span></div>' +
        '<div class="f-body">' +
          '<div class="f-row">' +
            '<div class="f-big">40%</div>' +
            '<div class="f-desc">of companies admit they posted <b>fake jobs</b> in the past year.</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="m-check"><span class="ic">&#10003;</span> Human Verified</div>' +
      '<div id="m-founder-card">' +
        (src ? '<img src="' + src + '" alt="Nic">' : '') +
        '<div><div class="fc-t1">Nic, the founder</div><div class="fc-t2">Currently at Instagram making 6 figures</div></div>' +
      '</div>';
    // wire founder card click -> open the About modal
    var founder = b.querySelector('#m-founder-card');
    accessibleButton(founder, "Read Nic's story");
    founder.addEventListener('click', function () { setModal(true, founder); });
    // place the below-fold panel right after the hero stage
    if (stage && stage.parentNode) {
      stage.parentNode.insertBefore(b, stage.nextSibling);
    } else {
      hero.appendChild(b);
    }
  }

  /* ======================= first-party analytics hooks =======================
     Additive, delegated by id/class so re-renders and injected mobile nodes are
     covered. Every call is guarded — the page works unchanged if js/analytics.js
     isn't loaded. Event taxonomy lives in analytics.js. */

  function suT(action, company, role, link) {
    if (typeof window.suTrack === 'function') window.suTrack(action, company, role, link);
  }

  function wireAnalytics() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      // carousel CTA post-it (desktop #nh-cta + mobile #hero-cta)
      var cta = t.closest('#nh-cta, #hero-cta');
      if (cta) {
        var txtEl = cta.querySelector('#nh-cta-text, #hero-cta-text');
        suT('cta', 'carousel', txtEl ? txtEl.textContent : '', cta.getAttribute('href') || '');
        return;
      }

      // "Get the recipe" — proof band button vs the modal-note link
      var band = t.closest('.nh-recipe-btn');
      if (band) { suT('cta', 'newsletter', 'band', band.getAttribute('href') || ''); return; }
      var noteLink = t.closest('.nh-note-recipe');
      if (noteLink) { suT('cta', 'newsletter', 'modal-note', noteLink.getAttribute('href') || ''); return; }
      // mobile About modal's recipe link has no class; match it by href inside the modal
      var a = t.closest('a');
      if (a && t.closest('#about-modal') && /jobhuntrecipe\.com/i.test(a.getAttribute('href') || '')) {
        suT('cta', 'newsletter', 'modal-note', a.getAttribute('href') || '');
        return;
      }

      // founder story open (desktop card + read-story link, mobile cards)
      if (t.closest('#nh-founder, #nh-open-story, #founder-card, #m-founder-card')) {
        suT('cta', 'story', 'open', '');
      }
    });
  }

  /* ======================= boot ======================= */

  function boot() {
    hero = $('div[data-screen-label="Hero"]');
    wireDialogKeyboard();
    wireCarousel();
    wireStat();
    wireModal();
    wireNote();
    nhWire();           // new desktop/tablet hero (no-op if absent)
    wireAnalytics();    // first-party analytics (no-op without js/analytics.js)
    applyHomeTheme();
    fit();
  }

  var raf;
  function onResize() { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  // a few re-fits to settle layout after fonts/images load (matches original polling)
  var tries = 0, iv = setInterval(function () { fit(); if (++tries > 20) clearInterval(iv); }, 150);
})();
