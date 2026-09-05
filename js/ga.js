/* Google Analytics 4 (G-ST5YR2876M) — Consent Mode v2 + full auto-instrumentation. v2 2026-07-19.
   WHAT CHANGED vs v1: v1 only loaded GA after Accept (decliners + ignorers were invisible) and
   sent zero events. v2: gtag loads on prod for everyone with analytics_storage DENIED by default
   (cookieless, anonymous pings — every page visit still counted), Accept upgrades to full cookies.
   Auto-tracks: every page view, every button/link click, every input touched (field NAME only,
   NEVER what was typed), and time-on-page. Privacy policy §5 updated in the same change.
   - Admin browsers (su_admin=1) never load GA.
   - Non-prod (localhost/previews): GA not loaded; events go to console as [su-ga] so tracking
     is verifiable locally. Keep prod host list in sync with analytics.js / app.js. */
(function () {
  var GA_ID = 'G-ST5YR2876M';
  var PROD = { 'stillunemployed.com': 1, 'www.stillunemployed.com': 1 };
  function isProd() { return !!PROD[location.hostname]; }
  function isAdmin() { try { return localStorage.getItem('su_admin') === '1'; } catch (e) { return false; } }
  function consent() { try { return localStorage.getItem('su_consent'); } catch (e) { return null; } }
  function setConsent(v) { try { localStorage.setItem('su_consent', v); } catch (e) {} }
  try {
    var p = new URLSearchParams(location.search);
    if (p.has('consent') && (p.get('consent') === 'reset' || p.get('consent') === 'off')) localStorage.removeItem('su_consent');
  } catch (e) {}

  if (isAdmin()) return; // Nic's own browsers: nothing loads, no banner.

  // Page identity (mirror analytics.js): /jobs* -> board
  var PAGE = /^\/jobs/.test(location.pathname) ? 'board'
    : /tracker/.test(location.pathname) ? 'tracker'
    : (location.pathname === '/' || /index/.test(location.pathname)) ? 'home' : location.pathname;

  // gtag bootstrap. On prod: real GA with Consent Mode. Elsewhere: console shim.
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  if (isProd()) {
    gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true, page_title: PAGE, transport_type: 'beacon' });
    if (consent() === 'granted') gtag('consent', 'update', { analytics_storage: 'granted' });
  } else {
    window.gtag = function () { try { console.debug('[su-ga]', [].slice.call(arguments)); } catch (e) {} };
  }
  function ev(name, params) {
    params = params || {}; params.page = PAGE;
    try { window.gtag('event', name, params); } catch (e) {}
  }

  // ---- every button / link / control click (delegated, capture phase) ----
  function labelOf(el) {
    var l = el.getAttribute && (el.getAttribute('data-act') || el.getAttribute('aria-label'));
    if (l && el.getAttribute && el.getAttribute('data-note')) l += ':' + el.getAttribute('data-note'); // per-card identity (advice cards etc.)
    // P1-6 fix (2026-08-16): tracker rows render the VISITOR'S OWN typed URL as an <a
    // class="trk-linka"> — sending that href to Google would ship user-entered data,
    // contradicting privacy §5 ("never the text you type"). Send a fixed label instead.
    if (!l && el.tagName === 'A' && el.className && /\btrk-linka\b/.test(el.className)) l = 'tracker_posting_link';
    if (!l && el.tagName === 'A') l = (el.getAttribute('href') || '').slice(0, 80);
    if (!l) l = (el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return l || el.tagName.toLowerCase();
  }
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('button, a, [data-act], [role="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], select, summary');
    if (!el) return;
    ev('ui_click', { ui: labelOf(el), tag: el.tagName.toLowerCase() });
  }, true);

  // ---- every input touched: field IDENTITY only, never the typed value ----
  var seenFields = {};
  function fieldName(el) {
    return el.getAttribute('name') || el.id || el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.type || el.tagName.toLowerCase();
  }
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    var f = fieldName(el);
    if (seenFields[f]) return; // one event per field per page load
    seenFields[f] = 1;
    ev('input_used', { field: String(f).slice(0, 60) });
  }, true);
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'SELECT') return;
    ev('select_changed', { field: String(fieldName(el)).slice(0, 60) });
  }, true);

  // ---- time on page: visible-seconds accumulator + exit beacon + heartbeats ----
  var visStart = document.hidden ? 0 : Date.now(), visTotal = 0, beats = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (visStart) { visTotal += Date.now() - visStart; visStart = 0; } }
    else visStart = Date.now();
  });
  setInterval(function () {
    if (document.hidden || beats >= 20) return; // heartbeat every 30s of visible time, capped at 10 min
    beats++; ev('heartbeat', { beat: beats });
  }, 30000);
  function flushTime() {
    if (visStart) { visTotal += Date.now() - visStart; visStart = 0; }
    var secs = Math.round(visTotal / 1000);
    if (secs > 0) ev('time_on_page', { seconds: secs });
  }
  window.addEventListener('pagehide', flushTime);

  var isBoardPage = /\/(?:jobs(?:\/.*|\.html)?|tracker(?:\.html)?)\/?$/.test(location.pathname);
  // ---- consent banner (unchanged look; Accept now upgrades Consent Mode) ----
  if (consent() === 'granted' || consent() === 'denied') return;
  function injectStyle() {
    if (document.getElementById('su-cc-style')) return;
    var st = document.createElement('style');
    st.id = 'su-cc-style';
    st.textContent = [
      '.su-cc{position:fixed;z-index:2147483000;left:24px;right:auto;bottom:24px;width:270px;max-width:76vw;',
        'background:#F6E24B;color:#2C2118;padding:15px 17px 14px;border-radius:2px;',
        "font-family:'Indie Flower','Comic Sans MS',cursive;transform:rotate(-2.5deg);",
        'box-shadow:3px 9px 20px rgba(44,33,24,0.30);animation:suCcIn .35s cubic-bezier(.2,.9,.3,1.25) both;}',
      '@keyframes suCcIn{from{opacity:0;transform:rotate(-2.5deg) translateY(14px)}to{opacity:1;transform:rotate(-2.5deg) translateY(0)}}',
      '.su-cc::before{content:"";position:absolute;top:-9px;left:50%;width:82px;height:20px;',
        'transform:translateX(-50%) rotate(-3deg);background:rgba(255,255,255,0.40);box-shadow:0 1px 2px rgba(0,0,0,0.08);}',
      '.su-cc-t{font-size:16.5px;line-height:1.4;margin:0 0 11px;}',
      '.su-cc-t a{color:#7A5B12;font-weight:700;text-decoration:underline;}',
      '.su-cc-row{display:flex;align-items:center;gap:14px;}',
      '.su-cc-accept{cursor:pointer;border:none;background:#2C2118;color:#F6E24B;',
        "font-family:inherit;font-size:16px;font-weight:700;padding:6px 18px;border-radius:2px;",
        'transform:rotate(1.5deg);box-shadow:1px 2px 5px rgba(0,0,0,0.22);}',
      '.su-cc-decline{cursor:pointer;background:none;border:none;color:#5C4A24;',
        'font-family:inherit;font-size:15.5px;text-decoration:underline;padding:4px 2px;}',
      '@media (max-width:640px){.su-cc{left:12px;right:auto;bottom:100px;width:158px;padding:9px 11px 9px;transform:rotate(-2deg);}',
        '.su-cc::before{width:48px;height:14px;top:-6px;}',
        '.su-cc-t{font-size:11.5px;line-height:1.35;margin:0 0 7px;}',
        '.su-cc-row{gap:9px;}',
        '.su-cc-accept{font-size:11.5px;padding:4px 11px;}',
        '.su-cc-decline{font-size:11px;}}'
      ,'.su-cc.su-cc-inline{position:relative;left:auto;right:auto;bottom:auto;width:auto;max-width:760px;margin:12px auto 0;padding:10px 16px;background:#FCFAF3;color:#2C2118;transform:none;animation:none;box-shadow:none;border-bottom:1px solid #c9bfae;border-radius:0;z-index:1;display:flex;align-items:center;gap:14px;box-sizing:border-box;}'
      ,'.su-cc.su-cc-inline::before{display:none;}.su-cc-inline .su-cc-t{font-size:14px;margin:0;line-height:1.3;flex:1;}.su-cc-inline .su-cc-row{flex:none;gap:8px;}.su-cc-inline button{min-height:44px;font-size:14px;}.su-cc-inline .su-cc-accept{color:#FCFAF3;}'
      ,'@media(max-width:640px){.su-cc.su-cc-inline{margin:8px 12px 0;display:block;padding:8px 10px;}.su-cc-inline .su-cc-row{justify-content:flex-end;}.su-cc-inline .su-cc-t{font-size:13px;}.su-cc-inline .su-cc-decline{padding:4px 12px;}}'
    ].join('');
    document.head.appendChild(st);
  }
  function showBanner() {
    injectStyle();
    var bar = document.createElement('div');
    bar.className = 'su-cc' + (isBoardPage ? ' su-cc-inline' : '');
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie notice');
    bar.innerHTML =
      '<p class="su-cc-t">' + (isBoardPage ? 'Cookies help me improve this board. No ads, nothing sold. ' : 'We use cookies to see how many people visit (and from where) so I can make the board better. Nothing sold, no ads. ') +
      '<a href="./privacy.html">Privacy</a></p>' +
      '<div class="su-cc-row">' +
        '<button type="button" class="su-cc-accept">Accept</button>' +
        '<button type="button" class="su-cc-decline">No thanks</button>' +
      '</div>';
    function close() { if (bar.parentNode) bar.parentNode.removeChild(bar); }
    bar.querySelector('.su-cc-accept').addEventListener('click', function () {
      setConsent('granted');
      try { window.gtag('consent', 'update', { analytics_storage: 'granted' }); } catch (e) {}
      close();
    });
    bar.querySelector('.su-cc-decline').addEventListener('click', function () { setConsent('denied'); close(); });
    if (isBoardPage) document.body.insertBefore(bar, document.body.firstChild);
    else document.body.appendChild(bar);
  }
  if (document.body) showBanner();
  else document.addEventListener('DOMContentLoaded', showBanner);
})();
