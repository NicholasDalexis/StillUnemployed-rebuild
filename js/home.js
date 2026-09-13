/* Desktop introduction to the same Jobs renderer used at /jobs.html.
   No second feed, copied cards or mobile hero downloads. */
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc.body.classList.contains('su-home-board')) return;
  var desktop = global.matchMedia('(min-width: 701px)');
  var reduced = global.matchMedia('(prefers-reduced-motion: reduce)');
  var cards = [
    { label:'Find social jobs here', theme:'social' },
    { label:'Find copywriting jobs here', theme:'copy' },
    { label:'Find branding jobs here', theme:'brand' },
    { label:'Find creative tech jobs here', theme:'creativetech' },
    { label:'Find marketing jobs here', theme:'marketing' }
  ];
  var index = 0, timer = null, paused = false, pointerInside = false, focusInside = false;
  var photos = doc.querySelector('.nh-photos'), board = doc.getElementById('board');
  function imageSource(img) {
    if (img && !img.hasAttribute('src')) img.setAttribute('src', img.getAttribute('data-desktop-src'));
  }
  function stop() { if (timer !== null) global.clearInterval(timer);timer = null; }
  function schedule() {
    stop();
    if (!desktop.matches || reduced.matches || paused || pointerInside || focusInside || doc.hidden) return;
    timer = global.setInterval(function () { index = (index + 1) % cards.length;render(); }, 5000);
  }
  function render() {
    if (!desktop.matches) return;
    doc.querySelectorAll('.nh-img').forEach(function (img) {
      var active = Number(img.getAttribute('data-idx')) === index;
      if (active) imageSource(img);
      img.hidden = !active;
    });
    doc.querySelectorAll('#nh-dots [data-dot]').forEach(function (dot) {
      dot.setAttribute('aria-pressed', String(Number(dot.getAttribute('data-dot')) === index));
    });
    doc.getElementById('nh-cta-text').textContent = cards[index].label;
    doc.getElementById('nh-cta').setAttribute('href', '/jobs.html?theme=' + cards[index].theme);
  }
  function move(delta) { index = (index + delta + cards.length) % cards.length;render();schedule(); }
  function showBoard(event, theme) {
    var app = global.SUApp;
    if (!app || typeof app.setState !== 'function' || !board) return;
    // A modified click retains the ordinary dedicated-board link.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button) return;
    event.preventDefault();
    if (theme) app.setState({ theme:theme, q:'', cat:'all', ws:'Any', st:'all', pr:'Any', salaryMin:'', salaryMax:'', fr:'Any', savedOnly:false, openPanel:null });
    board.focus({ preventScroll:true });
    board.scrollIntoView({ behavior:reduced.matches ? 'auto' : 'smooth', block:'start' });
  }
  function trackerCount() {
    var count = 0;
    try {
      var rows = global.SUStore && global.SUStore.view ? global.SUStore.view().tracker : JSON.parse(global.localStorage.getItem('su_tracker') || '[]');
      if (Array.isArray(rows)) count = rows.length;
    } catch (_) {}
    var badge = doc.querySelector('[data-home-tracker-count]');
    if (badge) badge.textContent = count ? ' (' + (count > 99 ? '99+' : count) + ')' : '';
  }
  function layout() {
    if (desktop.matches) {
      doc.querySelectorAll('[data-desktop-src]:not(.nh-img)').forEach(imageSource);
      render();
    }
    schedule();
  }
  doc.getElementById('nh-prev').addEventListener('click', function () { move(-1); });
  doc.getElementById('nh-next').addEventListener('click', function () { move(1); });
  doc.querySelectorAll('#nh-dots [data-dot]').forEach(function (dot) {
    dot.addEventListener('click', function () { index = Number(dot.getAttribute('data-dot'));render();schedule(); });
  });
  doc.getElementById('nh-pause').addEventListener('click', function () {
    paused = !paused;
    this.textContent = paused ? 'Play' : 'Pause';
    this.setAttribute('aria-label', paused ? 'Play category slideshow' : 'Pause category slideshow');
    this.setAttribute('aria-pressed', String(paused));schedule();
  });
  photos.addEventListener('mouseenter', function () { pointerInside = true;stop(); });
  photos.addEventListener('mouseleave', function () { pointerInside = false;schedule(); });
  photos.addEventListener('focusin', function () { focusInside = true;stop(); });
  photos.addEventListener('focusout', function (event) { focusInside = !!(event.relatedTarget && photos.contains(event.relatedTarget));schedule(); });
  doc.querySelector('.nh-browse').addEventListener('click', function (event) { showBoard(event); });
  doc.getElementById('nh-cta').addEventListener('click', function (event) { showBoard(event, cards[index].theme); });
  doc.addEventListener('visibilitychange', schedule);
  if (desktop.addEventListener) { desktop.addEventListener('change', layout);reduced.addEventListener('change', schedule); }
  else { desktop.addListener(layout);reduced.addListener(schedule); }
  ['su:local-change','su:data-sync','su:auth-changed','storage','pageshow'].forEach(function (event) { global.addEventListener(event, trackerCount); });
  global.addEventListener('pagehide', stop);
  global.addEventListener('pageshow', schedule);
  trackerCount();layout();
})(window);
