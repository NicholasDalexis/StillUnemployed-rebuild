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
    document.body.className = '';
  }

  /* ======================= component logic ======================= */

  function renderCarousel() {
    // crossfade: only active image visible
    $all('.hero-img').forEach(function (img) {
      img.style.opacity = (parseInt(img.getAttribute('data-idx'), 10) === imgIndex) ? '1' : '0';
    });
    // dots: active = 22px + #F4EEE2, others = 8px + rgba(244,238,226,0.5)
    $all('#hero-dots [data-dot]').forEach(function (d) {
      var active = parseInt(d.getAttribute('data-dot'), 10) === imgIndex;
      d.style.width = active ? '22px' : '8px';
      d.style.background = active ? '#F4EEE2' : 'rgba(244,238,226,0.5)';
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
    if (next) next.addEventListener('click', function () { advance(1); startTimer(); });
    if (prev) prev.addEventListener('click', function () { advance(-1); startTimer(); });
    // clicking a dot jumps to that image
    $all('#hero-dots [data-dot]').forEach(function (d) {
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
    toggle.addEventListener('click', function () {
      statOpen = !statOpen;
      $all('.stat-extra').forEach(function (el) { el.hidden = !statOpen; });
      if (arrow) arrow.style.transform = statOpen ? 'rotate(180deg)' : '';
    });
  }

  /* -------- About modal (dc: openModal / closeModal / stop) -------- */
  function setModal(open) {
    var modal = $('#about-modal');
    if (modal) modal.hidden = !open;
  }
  function wireModal() {
    var fc = $('#founder-card'), modal = $('#about-modal'), card = $('#about-modal-card');
    if (fc) fc.addEventListener('click', function () { setModal(true); });
    if (modal) modal.addEventListener('click', function () { setModal(false); }); // click backdrop closes
    if (card) card.addEventListener('click', function (e) { e.stopPropagation(); }); // clicks inside don't close
    $all('.modal-close').forEach(function (x) {
      x.addEventListener('click', function (e) { e.stopPropagation(); setModal(false); });
    });
  }

  /* -------- newsletter "open" note fold (dc: openNl / closeNl / nlOpen) -------- */
  function wireNote() {
    var tab = $('#nl-tab'), note = $('#nl-note'), close = $('#nl-close');
    function openNote(e) { if (e) e.stopPropagation(); if (tab) tab.hidden = true; if (note) note.hidden = false; }
    function closeNote(e) { if (e) e.stopPropagation(); if (note) note.hidden = true; if (tab) tab.hidden = false; }
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
      img.style.opacity = (parseInt(img.getAttribute('data-idx'), 10) === nhIndex) ? '1' : '0';
    });
    $all('#nh-dots [data-dot]').forEach(function (d) {
      var active = parseInt(d.getAttribute('data-dot'), 10) === nhIndex;
      d.style.width = active ? '22px' : '8px';
      d.style.background = active ? '#F4EEE2' : 'rgba(244,238,226,0.5)';
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

  function nhSetModal(open) {
    var m = $('#nh-modal');
    if (m) m.hidden = !open;
  }

  function nhWire() {
    if (!document.getElementById('hero-desktop')) return;
    var next = $('#nh-next'), prev = $('#nh-prev');
    if (next) next.addEventListener('click', function () { nhAdvance(1); nhStartTimer(); });
    if (prev) prev.addEventListener('click', function () { nhAdvance(-1); nhStartTimer(); });
    $all('#nh-dots [data-dot]').forEach(function (d) {
      d.style.cursor = 'pointer';
      d.addEventListener('click', function () {
        nhIndex = parseInt(d.getAttribute('data-dot'), 10);
        nhRender(); nhStartTimer();
      });
    });
    nhRender(); nhStartTimer();

    // About modal (same content as mobile's, own instance)
    var founder = $('#nh-founder'), story = $('#nh-open-story'), modal = $('#nh-modal'), card = $('#nh-modal-card');
    if (founder) founder.addEventListener('click', function () { nhSetModal(true); });
    if (story) story.addEventListener('click', function () { nhSetModal(true); });
    if (modal) modal.addEventListener('click', function () { nhSetModal(false); });
    if (card) card.addEventListener('click', function (e) { e.stopPropagation(); });
    $all('.nh-modal-close').forEach(function (x) {
      x.addEventListener('click', function (e) { e.stopPropagation(); nhSetModal(false); });
    });

    // newsletter fold inside the modal
    var tab = $('#nh-nl-tab'), note = $('#nh-nl-note'), close = $('#nh-nl-close');
    if (tab) tab.addEventListener('click', function (e) { e.stopPropagation(); tab.hidden = true; if (note) note.hidden = false; });
    if (close) close.addEventListener('click', function (e) { e.stopPropagation(); if (note) note.hidden = true; if (tab) tab.hidden = false; });

    nhLoadJobs();
  }

  /* featured cards + live role count. Same source chain as the board
     (app.js): live Google Sheet CSV first, bundled jobs-data.json fallback. */
  var NH_SHEET_ID = '1DRfkDn_OIVlnx06xFaNpNbusXl49jvM26oJsl-qq2nU';
  var NH_CSV = 'https://docs.google.com/spreadsheets/d/' + NH_SHEET_ID + '/gviz/tq?tqx=out:csv&headers=1';

  function nhParseCSV(text) {
    var rows = [], row = [], field = '', inQ = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c !== '\r') field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // Security: only http(s) links reach window.open (blocks javascript:/data: from a sheet row).
  function nhSafeUrl(u) { u = String(u == null ? '' : u).trim(); return /^https?:\/\//i.test(u) ? u : ''; }

  function nhRowsToJobs(rows) {
    if (!rows || !rows.length) return [];
    var head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    function col(name) { return head.indexOf(name.toLowerCase()); }
    var iCo = col('Company'), iRole = col('Job Title'), iLink = col('Link'),
        iLoc = col('Location'), iType = col('Type'), iPay = col('Salary'),
        iPick = col('Pick'), iAct = col('Active/Dead');
    var get = function (cells, k) { return (k >= 0 && cells[k] != null) ? String(cells[k]).trim() : ''; };
    var jobs = [];
    for (var r = 1; r < rows.length; r++) {
      var cells = rows[r]; if (!cells) continue;
      var co = get(cells, iCo), role = get(cells, iRole);
      if (!co && !role) continue;
      var act = get(cells, iAct).toLowerCase();
      if (act.indexOf('dead') !== -1 || act === 'inactive' || act === 'no') continue;
      jobs.push({
        co: co, role: role, link: nhSafeUrl(get(cells, iLink)), loc: get(cells, iLoc),
        style: get(cells, iType), pay: get(cells, iPay),
        pick: get(cells, iPick).toLowerCase() === 'featured'
      });
    }
    return jobs;
  }

  function nhRenderJobs(jobs) {
    if (!jobs || !jobs.length) return;
    var total = $('#nh-total');
    if (total) total.textContent = String(jobs.length);
    var wrap = $('#nh-featured');
    if (!wrap) return;
    var picks = jobs.filter(function (j) { return j.pick; });
    if (picks.length < 3) picks = picks.concat(jobs.filter(function (j) { return !j.pick; }));
    picks = picks.slice(0, 3);
    var rot = [-1.5, 1, -1];
    wrap.innerHTML = '';
    picks.forEach(function (j, k) {
      var card = document.createElement('div');
      card.className = 'hoverlift';
      card.style.cssText = 'flex:1; position:relative; cursor:pointer; background:linear-gradient(160deg,#F6E85F,#EFDB3D); color:#2A2118; border-radius:3px; padding:26px 24px 22px; box-sizing:border-box; transform:rotate(' + rot[k % 3] + 'deg); box-shadow:3px 8px 20px rgba(44,33,24,0.2); min-height:184px;';
      var meta = [j.loc, j.style].filter(Boolean).join('  ·  ');
      card.innerHTML =
        '<div style="position:absolute; top:-11px; left:50%; transform:translateX(-50%) rotate(-3deg); width:78px; height:22px; background:rgba(228,202,128,0.6); box-shadow:0 1px 2px rgba(0,0,0,.1);"></div>' +
        '<div style="font-family:\'Archivo Black\', sans-serif; font-weight:900; font-size:21px; line-height:1.12; letter-spacing:-0.3px;"></div>' +
        '<div style="font-family:\'Archivo\', sans-serif; font-weight:600; font-size:15.5px; margin-top:8px; line-height:1.3;"></div>' +
        '<div style="font-family:\'Archivo\', sans-serif; font-weight:800; font-size:22px; letter-spacing:-0.4px; margin-top:14px;"></div>' +
        '<div style="font-size:13.5px; opacity:0.8; font-family:\'Poppins\', sans-serif; margin-top:5px;"></div>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">' +
          '<div style="display:inline-flex; align-items:center; gap:5px; border:1.6px solid #3A2A1B; color:#3A2A1B; border-radius:4px; padding:3px 8px; transform:rotate(-4deg); font-family:\'Archivo\', sans-serif; font-weight:800; font-size:9px; text-transform:uppercase; letter-spacing:.1em; opacity:0.7;">' +
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.4"></circle><path d="M8.3 12.2l2.4 2.4 4.9-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
            'Human-verified</div>' +
          '<div style="font-family:\'Archivo\', sans-serif; font-weight:800; font-size:15px; color:#D8502E; display:inline-flex; align-items:center; gap:4px;">open ' +
            '<svg width="26" height="13" viewBox="0 0 28 14" fill="none" style="overflow:visible;"><path d="M1 7 C 8 2.5, 15 2.5, 24 6.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></path><path d="M18.5 2.6 L25.5 6.9 L19 11.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg></div>' +
        '</div>';
      // text via textContent so job data can never inject markup
      var slots = card.querySelectorAll('div');
      slots[1].textContent = j.co;
      slots[2].textContent = j.role;
      slots[3].textContent = j.pay;
      slots[4].textContent = meta;
      card.addEventListener('click', function () { window.open(j.link, '_blank', 'noopener'); });
      wrap.appendChild(card);
    });
  }

  function nhLoadJobs() {
    fetch(NH_CSV + '&_=' + Date.now(), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('sheet ' + r.status); return r.text(); })
      .then(function (text) {
        var jobs = nhRowsToJobs(nhParseCSV(text));
        if (!jobs.length) throw new Error('sheet returned 0 jobs');
        nhRenderJobs(jobs);
      })
      .catch(function () {
        fetch('jobs-data.json', { cache: 'no-cache' })
          .then(function (r) { return r.json(); })
          .then(function (jobs) { nhRenderJobs(jobs); })
          .catch(function (e) { console.warn('[StillUnemployed] featured roles unavailable:', e && e.message); });
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
      var scaleN = Math.min(1, vw / NH_BASE_W);
      nh.style.transform = 'scale(' + scaleN + ')';
      nhStage.style.height = (NH_BASE_H * scaleN) + 'px';
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
        '<div class="sn-close">×</div>' +
        '<div class="sn-label">open</div>' +
        '<div class="sn-msg">Hi, I’m Nic. I spent 7 months unemployed after graduating in 2025. Today I work at Instagram and make six figures. This is the job board I wish I had, so I built it. Have fun!<span class="sn-sign">– Nic</span></div>' +
      '</div>';
    hero.appendChild(s);
    if (!window.__mStickyDelegated) {
      window.__mStickyDelegated = true;
      document.addEventListener('click', function (e) {
        var s2 = document.getElementById('m-sticky'); if (!s2) return;
        if (!s2.contains(e.target)) return;
        if (e.target && e.target.classList && e.target.classList.contains('sn-close')) { s2.classList.remove('open'); return; }
        s2.classList.toggle('open');
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
      '<div class="m-check"><span class="ic">&#10003;</span> Roles are checked by (me) a human.</div>' +
      '<div id="m-founder-card">' +
        (src ? '<img src="' + src + '" alt="Nic">' : '') +
        '<div><div class="fc-t1">Nic, the founder</div><div class="fc-t2">Currently at Instagram making 6 figures</div></div>' +
      '</div>';
    // wire founder card click -> open the About modal
    b.querySelector('#m-founder-card').addEventListener('click', function () { setModal(true); });
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
