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
    { cta: 'Find Social Jobs Here',      theme: 'social' },
    { cta: 'Find Copywriting Jobs Here', theme: 'copy' },
    { cta: 'Find Branding Jobs Here',    theme: 'brand' },
    { cta: 'Find Marketing Jobs Here',   theme: 'marketing' }
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
    var scale = Math.min(1, vw / BASE_W);
    hero.style.transform = 'scale(' + scale + ')';
    stage.style.height = (BASE_H * scale) + 'px';
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
      '<a href="https://jobhuntrecipe.com/p/jobs-ghost-more-than-hinge-issue-1" target="_blank" rel="noopener">Advice</a>';
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
      '<div class="m-check"><span class="ic">&#10003;</span> Every role is checked by (me) a human.</div>' +
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

  /* ======================= boot ======================= */

  function boot() {
    hero = $('div[data-screen-label="Hero"]');
    wireCarousel();
    wireStat();
    wireModal();
    wireNote();
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
