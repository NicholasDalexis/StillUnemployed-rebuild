/* Google Analytics 4 (G-ST5YR2876M) with a lightweight, privacy-first consent gate.
   - GA only loads AFTER the visitor clicks Accept (cookies aren't set until then).
   - Nic's admin-excluded browsers never load GA (keeps his own visits out).
   - On non-prod hosts (localhost / previews) the banner still shows for review,
     but GA is NOT actually loaded — so testing never pollutes the data.
   Keep the prod host list in sync with analytics.js / app.js. */
(function () {
  var GA_ID = 'G-ST5YR2876M';
  var PROD = { 'stillunemployed.com': 1, 'www.stillunemployed.com': 1 };
  function isProd() { return !!PROD[location.hostname]; }
  function isAdmin() { try { return localStorage.getItem('su_admin') === '1'; } catch (e) { return false; } }
  function consent() { try { return localStorage.getItem('su_consent'); } catch (e) { return null; } }
  function setConsent(v) { try { localStorage.setItem('su_consent', v); } catch (e) {} }
  // Dev/testing toggle: visit <site>/?consent=reset to make the banner appear again.
  (function () {
    try {
      var p = new URLSearchParams(location.search);
      if (p.has('consent') && (p.get('consent') === 'reset' || p.get('consent') === 'off')) {
        localStorage.removeItem('su_consent');
      }
    } catch (e) {}
  })();

  function loadGA() {
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;
    if (!isProd()) { try { console.debug('[su-ga] consent granted — GA would load on prod (skipped on', location.hostname + ')'); } catch (e) {} return; }
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
  }

  // Nic's own (admin-excluded) browsers: never load GA, no banner.
  if (isAdmin()) return;
  // Already decided.
  if (consent() === 'granted') { loadGA(); return; }
  if (consent() === 'denied') return;

  // ---- consent banner: an on-brand Post-it note ----
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
      // mobile: smaller + lifted well above the footer / "open" note, right-anchored
      '@media (max-width:640px){.su-cc{left:12px;right:auto;bottom:100px;width:158px;padding:9px 11px 9px;transform:rotate(-2deg);}',
        '.su-cc::before{width:48px;height:14px;top:-6px;}',
        '.su-cc-t{font-size:11.5px;line-height:1.35;margin:0 0 7px;}',
        '.su-cc-row{gap:9px;}',
        '.su-cc-accept{font-size:11.5px;padding:4px 11px;}',
        '.su-cc-decline{font-size:11px;}}'
    ].join('');
    document.head.appendChild(st);
  }
  function showBanner() {
    injectStyle();
    var bar = document.createElement('div');
    bar.className = 'su-cc';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie notice');
    bar.innerHTML =
      '<p class="su-cc-t">We use cookies to see how many people visit (and from where) so I can make the board better. ' +
      'Nothing sold, no ads. <a href="./privacy.html">Privacy</a></p>' +
      '<div class="su-cc-row">' +
        '<button type="button" class="su-cc-accept">Accept</button>' +
        '<button type="button" class="su-cc-decline">No thanks</button>' +
      '</div>';
    function close() { if (bar.parentNode) bar.parentNode.removeChild(bar); }
    bar.querySelector('.su-cc-accept').addEventListener('click', function () { setConsent('granted'); loadGA(); close(); });
    bar.querySelector('.su-cc-decline').addEventListener('click', function () { setConsent('denied'); close(); });
    document.body.appendChild(bar);
  }
  if (document.body) showBanner();
  else document.addEventListener('DOMContentLoaded', showBanner);
})();
