/* =========================================================================
   StillUnemployed.com — first-party analytics (js/analytics.js)

   Reuses the EXISTING Reports endpoint (the same Google Apps Script that
   js/app.js's postReport() talks to). The deployed script appends
   [Date, action, company, role, link, page] from a JSON POST of
   {action, company, role, link, page} and accepts ANY action string, so no
   server change is needed.

   Loads BEFORE the page scripts (defer, document order) on index.html,
   jobs.html and tracker.html. Exposes:
     - window.SU_REPORT_URL   the endpoint (single source of truth here;
                              app.js keeps its own copy for postReport)
     - window.suTrack(action, company, role, link)
   Plus, on every page load, one 'pv' event.

   Identity: an anonymous random 10-char browser id (localStorage su_id,
   minted once) + first-touch UTM (localStorage su_utm, "src/med/camp",
   written only the first time a utm_* param is seen). Both ride along in
   the `page` field: "<path><search> [id:xxxx] [utm:src/med/camp]".

   PRODUCTION GATE: events only POST from stillunemployed.com /
   www.stillunemployed.com. Everywhere else (localhost, Netlify previews,
   file://) they go to console.debug so testing never pollutes the sheet.
   ========================================================================= */
(function () {
  'use strict';

  // Same Apps Script /exec the board's postReport() uses (see js/app.js).
  var REPORT_URL = 'https://script.google.com/macros/s/AKfycbx_ct-QHSXxYeE2m7_e8XIsBojGPFP1he0b9-YMad6qVera8i2OAfj8XQb5VncAKGpU/exec';
  window.SU_REPORT_URL = REPORT_URL;

  // ---- anonymous browser id (localStorage su_id, created once) ----
  function getId() {
    try {
      var id = localStorage.getItem('su_id');
      if (!id) {
        id = '';
        var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        for (var i = 0; i < 10; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
        localStorage.setItem('su_id', id);
      }
      return id;
    } catch (e) { return 'na'; }
  }

  // ---- first-touch UTM: store compact "src/med/camp" ONLY if not already set ----
  function captureUtm() {
    try {
      if (localStorage.getItem('su_utm')) return; // first touch wins
      var p = new URLSearchParams(location.search);
      var src = p.get('utm_source'), med = p.get('utm_medium'), camp = p.get('utm_campaign');
      if (!src && !med && !camp) return;
      localStorage.setItem('su_utm', [src || '', med || '', camp || ''].join('/'));
    } catch (e) { /* storage blocked; skip */ }
  }
  captureUtm();

  function getUtm() {
    try { return localStorage.getItem('su_utm') || ''; } catch (e) { return ''; }
  }

  // ---- admin / self-exclude flag (localStorage su_admin) ----
  // Nic browses the LIVE site to pull jobs for the newsletter; those visits must
  // NOT count as analytics. Visit <site>/?admin=<KEY> once to flip this browser
  // to "don't count me" (persists), and <site>/?admin=off to undo it. When set,
  // events log to console instead of POSTing — exactly like localhost. The key
  // isn't a security secret (worst case a visitor excludes only themselves), so
  // a plain toggle string is fine; change ADMIN_KEY to whatever you like.
  var ADMIN_KEY = 'su-admin-2026';
  (function handleAdminToggle() {
    try {
      var p = new URLSearchParams(location.search);
      if (!p.has('admin')) return;
      var v = p.get('admin');
      if (v === 'off' || v === '0') {
        localStorage.removeItem('su_admin');
        console.debug('[su-analytics] admin exclude OFF — this browser counts in analytics again');
      } else if (v === ADMIN_KEY) {
        localStorage.setItem('su_admin', '1');
        console.debug('[su-analytics] admin exclude ON — this browser will no longer be counted');
      }
    } catch (e) { /* storage blocked; skip */ }
  })();
  function isAdmin() {
    try { return localStorage.getItem('su_admin') === '1'; } catch (e) { return false; }
  }

  var PROD_HOSTS = { 'stillunemployed.com': 1, 'www.stillunemployed.com': 1 };

  // window.suTrack(action, company, role, link) — fire-and-forget, never throws
  window.suTrack = function (action, company, role, link) {
    var utm = getUtm();
    var page = location.pathname + location.search +
      ' [id:' + getId() + ']' + (utm ? ' [utm:' + utm + ']' : '');
    var body = {
      action: String(action == null ? '' : action),
      company: String(company == null ? '' : company),
      role: String(role == null ? '' : role),
      link: String(link == null ? '' : link),
      page: page
    };
    if (!PROD_HOSTS[location.hostname] || isAdmin()) {
      // localhost / previews / admin (Nic sourcing jobs): log, don't POST — keeps
      // test + owner traffic out of the data.
      console.debug('[su-analytics]', isAdmin() ? '(admin — not counted)' : '', body);
      return;
    }
    try {
      fetch(REPORT_URL, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true, // survives same-tab navigations (CTA clicks etc.)
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
    } catch (e) { /* fire-and-forget; never block the UI */ }
  };

  // ---- one 'pv' per page load: pv / <page name> / <current look> / <referrer> ----
  // PUSH-BLOCKER FIX (2026-07-12): the theme deep-links (/jobs/casino, /jobs/beauty, …) are all the
  // SAME page — jobs.html, served via the netlify.toml rewrite. This used to match only /jobs.html,
  // so every themed visit fell through to `return location.pathname` and logged as its own page name.
  // That shattered the 'board' pageview into 9 separate labels and made board traffic look ~1/9th of
  // real. The THEME is not lost by collapsing them: it's already a separate dimension via
  // currentLook() below (jobs.html's inline pre-paint writes su_look from the slug before this runs).
  // One page, one name; theme stays a dimension. Trailing slash tolerated.
  function pageName() {
    var p = String(location.pathname || '').toLowerCase().replace(/\/+$/, '');
    if (p === '' || /\/index\.html$/.test(p)) return 'home';
    if (/\/jobs\.html$/.test(p) || p === '/jobs' || /^\/jobs\//.test(p)) return 'board';
    if (/\/tracker\.html$/.test(p)) return 'tracker';
    return location.pathname;
  }
  function currentLook() {
    try { return localStorage.getItem('su_look') || 'original'; } catch (e) { return 'original'; }
  }
  window.suTrack('pv', pageName(), currentLook(), document.referrer || '');
})();
