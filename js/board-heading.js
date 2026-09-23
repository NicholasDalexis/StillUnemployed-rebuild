/* Shared Jobs/Internships headline and homepage catalog picker. Cosmetic rotation,
   once per page load; no experiment assignment or analytics are recorded. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    var storage;
    try { storage = root.sessionStorage; } catch (_) {}
    api.current = api.next(storage);
    root.SUBoardHeading = api;
    api.bind(root);
  }
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  var KEY = 'su_headline_previous_v1';
  var looks = { original:'original', poker:'casino', girly:'girlies', mermaid:'mermaid', bratt:'bratt', noir:'blackcat', beauty:'beauty', chess:'chess' };
  var copy = [
    { start:'worth the ', marked:'screenshot.' },
    { start:'worth fixing your ', marked:'resume for.' },
    { start:'worth ', marked:'saving.' },
    { start:'worth ', marked:'bookmarking.' },
    { start:'to save ', marked:'before you forget.' }
  ];
  function next(storage) {
    var chosen = 0;
    try {
      var previous = storage && storage.getItem(KEY);
      if (/^[0-4]$/.test(String(previous))) chosen = (Number(previous) + 1) % copy.length;
      if (storage) storage.setItem(KEY, String(chosen));
    } catch (_) {}
    return chosen;
  }
  function href(section, look) {
    return (section === 'internships' ? '/internships.html' : '/jobs.html') + '?theme=' + (looks[look] || 'original');
  }
  function render(internships, look, variant, inlinePicker) {
    var section = internships ? 'internships' : 'jobs', word = internships ? 'Internships' : 'Jobs', line = copy[Number.isInteger(variant) && variant >= 0 && variant < copy.length ? variant : 0];
    var title = word;
    if (inlinePicker) title = '<span class="su-section-static">'+word+'</span><button type="button" class="su-section-trigger" aria-expanded="false" aria-controls="su-section-picker" aria-label="'+word+'. Choose Jobs or Internships">'+word+'<svg aria-hidden="true" width="18" height="12" viewBox="0 0 18 12" fill="none"><path d="m2 3 7 6 7-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    return '<div class="su-board-heading">' +
      '<h1>'+title+' '+line.start+'<span class="su-headline-mark">'+line.marked+'</span></h1>' +
      (inlinePicker ? '<div id="su-section-picker" class="su-section-picker" role="group" aria-label="Choose a board" hidden>' +
      '<button type="button" data-board-section="jobs" aria-pressed="'+(section === 'jobs')+'">Jobs</button>' +
      '<button type="button" data-board-section="internships" aria-pressed="'+(section === 'internships')+'">Internships</button></div>' : '')+'</div>';
  }
  function bind(win) {
    var doc = win.document;
    if (!doc || !doc.addEventListener) return;
    function nodes() { return { button:doc.querySelector('.su-section-trigger'), menu:doc.getElementById('su-section-picker') }; }
    function close(focus) {
      var pair = nodes();
      if (!pair.button || !pair.menu || pair.menu.hidden) return;
      pair.menu.hidden = true; pair.button.setAttribute('aria-expanded','false');
      if (focus) pair.button.focus({preventScroll:true});
    }
    function open() {
      var pair = nodes(); if (!pair.button || !pair.menu) return;
      if (win.SUApp && win.SUApp.closeBoardPanels) win.SUApp.closeBoardPanels();
      doc.querySelectorAll('details.su-board-menu[open]').forEach(function (el) { el.open = false; });
      pair.menu.hidden = false; pair.button.setAttribute('aria-expanded','true');
      var buttonBox = pair.button.getBoundingClientRect(), parentBox = pair.menu.parentElement.getBoundingClientRect();
      var menuHeight = pair.menu.getBoundingClientRect().height;
      var top = buttonBox.bottom + 8;
      if (top + menuHeight > win.innerHeight - 12) top = buttonBox.top - menuHeight - 8;
      top = Math.max(12, Math.min(top, win.innerHeight - menuHeight - 12));
      pair.menu.style.top = (top - parentBox.top) + 'px';
    }
    doc.addEventListener('click', function (event) {
      var trigger = event.target.closest && event.target.closest('.su-section-trigger');
      if (trigger) { event.preventDefault(); trigger.getAttribute('aria-expanded') === 'true' ? close(false) : open(); }
      else if (event.target.closest && event.target.closest('[data-board-section]')) {
        var option = event.target.closest('[data-board-section]');
        if (!option.closest('.su-section-picker') || !win.SUApp || !win.SUApp.switchSection) return;
        event.preventDefault(); close(true);
        win.SUApp.switchSection(option.getAttribute('data-board-section'));
      }
      else if (!(event.target.closest && event.target.closest('.su-section-picker'))) close(false);
    });
    doc.addEventListener('keydown', function (event) {
      var pair = nodes(); if (!pair.button || !pair.menu) return;
      if (event.key === 'Escape' && !pair.menu.hidden) { event.preventDefault(); close(true); return; }
      if (event.target === pair.button && event.key === 'ArrowDown') { event.preventDefault(); open(); pair.menu.querySelector('button').focus(); }
    });
    doc.addEventListener('focusin', function (event) {
      if (!(event.target.closest && event.target.closest('.su-board-heading'))) close(false);
    });
    win.addEventListener('resize', function () { close(false); });
  }
  return { next:next, href:href, render:render, bind:bind, current:0 };
});
