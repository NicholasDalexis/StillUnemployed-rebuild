/* Published archive snapshot checked 2026-09-13 at jobhuntrecipe.com.
   Issues 5, 4 and 3 currently share the publication's public thumbnail.
   Update this small snapshot when a new issue is published; never use a draft. */
(function (global) {
  'use strict';
  var doc = global.document, trigger = doc.getElementById('nh-recipe');
  if (!trigger) return;
  var signup = 'https://subscribe-forms.beehiiv.com/af2e314d-125f-431d-a8e0-0020be04d97c';
  var issues = [
    { number:5, title:'I lost 3 dream jobs in ONE week', path:'3-dreams-jobs' },
    { number:4, title:'Still trying to Manifest a job?', path:'manifesting-a-job' },
    { number:3, title:'Graduated over a month ago?', path:'graduated-over-a-month-ago' }
  ];
  var dialog, loadingTimer, frameLoaded = false, startedOutside = false;
  function outside(event) {
    var rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  }
  function loadSignup() {
    var frame = dialog.querySelector('iframe'), loading = dialog.querySelector('.nh-recipe-loading'), retry = dialog.querySelector('.nh-recipe-retry'), error = dialog.querySelector('.nh-recipe-error');
    global.clearTimeout(loadingTimer);
    frameLoaded = false;loading.hidden = false;retry.hidden = true;error.hidden = true;
    function showRecovery() { global.clearTimeout(loadingTimer);loading.hidden = true;error.hidden = false;retry.hidden = false; }
    // Cross-origin load ends the loading UI; it is not proof of form readiness or signup.
    frame.onload = function () {
      frameLoaded = true;global.clearTimeout(loadingTimer);loading.hidden = true;error.hidden = true;retry.hidden = true;
    };
    frame.onerror = showRecovery;
    frame.src = signup;
    loadingTimer = global.setTimeout(function () {
      if (!frameLoaded) showRecovery();
    }, 8000);
  }
  function createDialog() {
    dialog = doc.createElement('dialog');
    dialog.id = 'nh-recipe-dialog';
    dialog.setAttribute('aria-labelledby', 'nh-recipe-heading');
    dialog.setAttribute('aria-describedby', 'nh-recipe-intro');
    dialog.innerHTML = '<button type="button" class="nh-recipe-close" aria-label="Close newsletter signup"><svg class="su-close-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>' +
      '<h2 id="nh-recipe-heading">P.S. want the recipe?</h2>' +
      '<p id="nh-recipe-intro" class="nh-recipe-intro"><span>The newsletter meant to be unsubscribed from</span><span class="nh-recipe-aside">(when you get the job).</span></p>' +
      '<ul class="nh-recipe-issues" aria-label="The three latest published issues">' + issues.map(function (issue) {
        return '<li><article class="nh-recipe-issue">' +
          '<img src="assets/home-recipe-public-cover.avif" width="360" height="240" alt="" loading="lazy">' +
          '<span>' + issue.title + '</span></article></li>';
      }).join('') + '</ul>' +
      '<p class="nh-recipe-signup-label">Get the next one in your inbox ↓</p>' +
      '<div class="nh-recipe-signup"><p class="nh-recipe-loading" role="status">Loading signup…</p>' +
      '<iframe title="Job Hunt Recipe newsletter signup" height="54" scrolling="no"></iframe>' +
      '<p class="nh-recipe-error" role="status" hidden>Signup is taking longer than expected. Try loading it again.</p>' +
      '<button type="button" class="nh-recipe-retry" hidden>Reload signup</button></div>' +
      '<p class="nh-recipe-footnote"><span>Every week.</span><span>easy unsub.</span><span>newsletter - Nic</span></p>';
    doc.body.appendChild(dialog);
    dialog.querySelector('.nh-recipe-close').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('.nh-recipe-retry').addEventListener('click', loadSignup);
    dialog.addEventListener('keydown', function () { dialog.removeAttribute('data-pointer-open'); });
    dialog.addEventListener('pointerdown', function (event) { startedOutside = outside(event); });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog && startedOutside && outside(event)) dialog.close();
      startedOutside = false;
    });
    dialog.addEventListener('close', function () {
      doc.body.classList.remove('nh-recipe-open');
      if (trigger.getClientRects().length) trigger.focus({ preventScroll:true });
    });
  }
  trigger.addEventListener('click', function (event) {
    if (!global.matchMedia('(min-width:701px)').matches) return;
    if (!dialog) createDialog();
    if (dialog.open) return;
    dialog.toggleAttribute('data-pointer-open', event.detail > 0);
    dialog.showModal();
    doc.body.classList.add('nh-recipe-open');
    if (!dialog.querySelector('iframe').hasAttribute('src')) loadSignup();
  });
})(window);
