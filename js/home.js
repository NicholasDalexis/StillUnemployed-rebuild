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
  var index = 0, timer = null, pointerInside = false, focusInside = false;
  var interval = 5000, elapsed = 0, lastTick = null;
  var dots = doc.getElementById('nh-dots');
  var photos = doc.querySelector('.nh-photos'), board = doc.getElementById('board');
  var stage = doc.getElementById('nh-stage'), edgeNotes = doc.querySelector('.nh-edge-notes'), edgeFrame = null;
  function positionEdgeNotes() {
    edgeFrame = null;
    if (!edgeNotes || !stage) return;
    var rect = stage.getBoundingClientRect(), height = global.innerHeight;
    // Fade with the remaining introduction, then remove hidden controls from focus.
    var opacity = desktop.matches && rect.top < height ? Math.max(0, Math.min(1, (rect.bottom - height * .3) / (height * .45))) : 0;
    edgeNotes.hidden = !desktop.matches;
    edgeNotes.style.setProperty('--nh-peek-opacity', String(opacity));
    edgeNotes.classList.toggle('nh-peeks-away', opacity === 0);
    edgeNotes.inert = opacity === 0;
    edgeNotes.setAttribute('aria-hidden', String(opacity === 0));
    edgeNotes.style.setProperty('--nh-peek-bottom', Math.max(26, height - rect.bottom + 26) + 'px');
  }
  function scheduleEdgeNotes() {
    if (edgeFrame === null) edgeFrame = global.requestAnimationFrame(positionEdgeNotes);
  }
  function imageSource(img) {
    if (img && !img.hasAttribute('src')) img.setAttribute('src', img.getAttribute('data-desktop-src'));
  }
  function progress() {
    if (dots) dots.style.setProperty('--nh-carousel-progress', (reduced.matches ? 100 : Math.min(100, elapsed / interval * 100)) + '%');
  }
  function stop() {
    if (timer !== null) global.cancelAnimationFrame(timer);
    if (lastTick !== null) elapsed = Math.min(interval, elapsed + Math.max(0, global.performance.now() - lastTick));
    timer = null;lastTick = null;progress();
  }
  function tick(now) {
    timer = null;
    elapsed += Math.max(0, now - lastTick);lastTick = now;
    if (elapsed >= interval) { elapsed = 0;index = (index + 1) % cards.length;render(); }
    progress();
    timer = global.requestAnimationFrame(tick);
  }
  function schedule() {
    stop();
    if (!desktop.matches || reduced.matches || pointerInside || focusInside || doc.hidden) return;
    lastTick = global.performance.now();
    timer = global.requestAnimationFrame(tick);
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
    progress();
  }
  function select(next) { stop();elapsed = 0;index = next;render();schedule(); }
  function move(delta) { select((index + delta + cards.length) % cards.length); }
  function showBoard(event, theme) {
    var app = global.SUApp;
    if (!app || typeof app.setState !== 'function' || !board) return;
    // A modified click retains the ordinary dedicated-board link.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button) return;
    event.preventDefault();
    if (typeof app.switchSection === 'function') app.switchSection('jobs');
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
    positionEdgeNotes();
    if (desktop.matches) {
      doc.querySelectorAll('[data-desktop-src]:not(.nh-img)').forEach(imageSource);
      render();
    }
    schedule();
  }
  doc.getElementById('nh-prev').addEventListener('click', function () { move(-1); });
  doc.getElementById('nh-next').addEventListener('click', function () { move(1); });
  doc.querySelectorAll('#nh-dots [data-dot]').forEach(function (dot) {
    dot.addEventListener('click', function () { select(Number(dot.getAttribute('data-dot'))); });
  });
  // The graduation print is a separate, manual gallery. Load only a requested photo.
  var graduation = doc.getElementById('nh-grad-photo'), gradIndex = 0;
  function changeGraduation(delta) {
    if (!desktop.matches) return;
    gradIndex = (gradIndex + delta + 6) % 6;
    var img = doc.getElementById('nh-grad');
    img.src = 'assets/grad-' + (gradIndex + 1) + '.jpg';
    img.alt = 'Nic on graduation day, photo ' + (gradIndex + 1) + ' of 6';
  }
  if (graduation) {
    var gradPrev = doc.getElementById('nh-grad-prev'), gradNext = doc.getElementById('nh-grad-next');
    if (gradPrev) gradPrev.addEventListener('click', function () { changeGraduation(-1); });
    if (gradNext) gradNext.addEventListener('click', function () { changeGraduation(1); });
    graduation.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();event.stopPropagation();changeGraduation(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
  }
  photos.addEventListener('mouseenter', function () { pointerInside = true;stop(); });
  photos.addEventListener('mouseleave', function () { pointerInside = false;schedule(); });
  photos.addEventListener('focusin', function () { focusInside = true;stop(); });
  photos.addEventListener('focusout', function (event) { focusInside = !!(event.relatedTarget && photos.contains(event.relatedTarget));schedule(); });
  doc.querySelectorAll('.nh-edge-note').forEach(function (note) {
    note.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { note.classList.add('nh-preview-dismissed');event.stopPropagation(); }
    });
    ['mouseenter','focusin'].forEach(function (name) {
      note.addEventListener(name, function () { note.classList.remove('nh-preview-dismissed'); });
    });
  });
  doc.querySelector('.nh-browse').addEventListener('click', function (event) { showBoard(event); });
  doc.getElementById('nh-cta').addEventListener('click', function (event) { showBoard(event, cards[index].theme); });
  doc.addEventListener('visibilitychange', schedule);
  if (desktop.addEventListener) { desktop.addEventListener('change', layout);reduced.addEventListener('change', schedule); }
  else { desktop.addListener(layout);reduced.addListener(schedule); }
  ['su:local-change','su:data-sync','su:auth-changed','storage','pageshow'].forEach(function (event) { global.addEventListener(event, trackerCount); });
  global.addEventListener('pagehide', stop);
  global.addEventListener('pageshow', schedule);
  global.addEventListener('scroll', scheduleEdgeNotes, { passive:true });
  global.addEventListener('resize', scheduleEdgeNotes);
  global.addEventListener('su:consent-changed', scheduleEdgeNotes);
  if (global.ResizeObserver) new global.ResizeObserver(scheduleEdgeNotes).observe(stage);
  trackerCount();layout();
})(window);
