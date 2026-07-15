/* ============================================================================
 * bookmark.js — "bookmark this tab" nudge for the HOMEPAGE. (Nic + his gf, 2026-07-14)
 *
 * THE PROBLEM IT SOLVES (the biggest leak in the funnel): someone finds the board through a
 * LinkedIn / Threads / IG post, applies to a couple jobs, closes the tab, and is gone forever.
 * The domain is easy to remember but you can't rely on that. So: nudge them to bookmark it while
 * they're here.
 *
 * DESIGN (Nic's picks):
 *   · Tone: blunt FOMO, his IG voice ("bookmark this or you'll never find this board again").
 *   · Desktop (>640px): a tilted yellow POST-IT stuck near the top of the hero. Fits the scrapbook
 *     look. Shows the real shortcut, platform-aware (Mac -> ⌘D, Windows/Linux -> Ctrl+D).
 *   · Mobile (<=640px): a thin bar that EASES DOWN from the top. No ⌘D on phones, so softer wording.
 *   · Homepage ONLY. Dismissible with an ✕, and it REMEMBERS the dismissal (localStorage) so it
 *     never nags. Not a popup, not a modal, nothing covers the content.
 *
 * Self-contained + injected (same pattern as auth.js) so it stays clear of the fixed-width 1440
 * hero markup and Netlify's inline-style mangling. Kill it = remove one <script> tag + this file.
 * ========================================================================================== */
(function () {
  'use strict';

  // Homepage only. The board/tracker have their own jobs to do; this is for the front door.
  var p = String(location.pathname || '').toLowerCase().replace(/\/+$/, '');
  var isHome = (p === '' || /\/index\.html$/.test(p));
  if (!isHome) return;

  var KEY = 'su_bookmark_dismissed';
  try { if (localStorage.getItem(KEY)) return; } catch (e) { /* private mode: just show it */ }

  // Platform-aware shortcut. navigator.platform is deprecated but still the most reliable Mac tell;
  // fall back to userAgent. Worst case a Windows user sees ⌘D — harmless, still communicates "bookmark".
  function isMac() {
    var s = (navigator.platform || navigator.userAgent || '');
    return /Mac|iPhone|iPad|iPod/i.test(s);
  }
  var SHORTCUT = isMac() ? '⌘D' : 'Ctrl+D';

  function remember() { try { localStorage.setItem(KEY, '1'); } catch (e) {} }

  function injectCss() {
    if (document.getElementById('su-bm-css')) return;
    var s = document.createElement('style');
    s.id = 'su-bm-css';
    s.textContent =
      // ── DESKTOP: tilted post-it, dropped INTO the hero near the CTA ───────────────────────────
      // Injected as a child of #hero-desktop (absolute, in the 1440 coord space) so it scales with
      // the scrapbook stage and can't collide with the fixed top-right sign-in pill. If the hero
      // isn't found it falls back to position:fixed (see mount()).
      '#su-bm-postit{position:absolute;left:62px;top:690px;z-index:26;width:236px;box-sizing:border-box;' +
      'background:#F2E14B;color:#2A2118;padding:16px 18px 15px;border-radius:2px;' +
      'box-shadow:3px 8px 18px rgba(44,33,24,0.30);transform:rotate(-2.4deg);' +
      "font-family:'Indie Flower',cursive;cursor:default;}" +
      '#su-bm-postit.su-bm-fixed{position:fixed;left:auto;right:22px;top:88px;}' +
      '#su-bm-postit .su-bm-tape{position:absolute;top:-11px;left:50%;margin-left:-33px;width:66px;height:22px;' +
      'background:rgba(232,203,140,0.7);transform:rotate(-3deg);box-shadow:0 1px 2px rgba(0,0,0,.08);}' +
      '#su-bm-postit b{display:block;font-size:20px;font-weight:700;line-height:1.18;letter-spacing:.01em;}' +
      '#su-bm-postit .su-bm-key{display:inline-block;margin-top:9px;background:#2A2118;color:#F2E14B;' +
      "font-family:'Archivo',sans-serif;font-weight:800;font-size:12px;letter-spacing:.04em;" +
      'padding:4px 9px;border-radius:4px;}' +
      '#su-bm-postit .su-bm-x{position:absolute;top:4px;right:5px;width:22px;height:22px;border-radius:50%;' +
      'display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B5A1E;' +
      "font-family:'Archivo',sans-serif;font-size:12px;background:rgba(42,33,24,0.08);}" +
      '#su-bm-postit .su-bm-x:hover{background:rgba(42,33,24,0.16);}' +
      // ── MOBILE: slim bar that slides down from the top ────────────────────────────────────────
      '#su-bm-bar{position:fixed;top:0;left:0;right:0;z-index:200;display:flex;align-items:center;' +
      'gap:10px;padding:11px 14px;box-sizing:border-box;min-height:46px;' +
      'background:#2C2118;color:#F4EEE2;box-shadow:0 3px 12px rgba(0,0,0,0.28);' +
      "font-family:'Poppins',system-ui,sans-serif;font-size:13.5px;font-weight:600;line-height:1.25;" +
      'transform:translateY(-100%);transition:transform .42s cubic-bezier(.2,.8,.2,1);}' +
      '#su-bm-bar.su-bm-in{transform:translateY(0);}' +
      '#su-bm-bar .su-bm-emoji{flex:none;font-size:15px;}' +
      '#su-bm-bar .su-bm-txt{flex:1;min-width:0;}' +
      '#su-bm-bar .su-bm-x{flex:none;width:30px;height:30px;border-radius:50%;display:flex;' +
      'align-items:center;justify-content:center;cursor:pointer;background:rgba(244,238,226,0.14);' +
      'font-size:14px;color:#F4EEE2;-webkit-tap-highlight-color:transparent;}';
    document.head.appendChild(s);
  }

  function buildDesktop() {
    var el = document.createElement('div');
    el.id = 'su-bm-postit';
    el.innerHTML =
      '<div class="su-bm-tape"></div>' +
      '<div class="su-bm-x" title="dismiss">✕</div>' +
      '<b>bookmark this or you’ll never find this board again</b>' +
      '<span class="su-bm-key">' + SHORTCUT + '</span>';
    el.querySelector('.su-bm-x').addEventListener('click', function () { el.remove(); remember(); log('bookmark_dismiss'); });
    return el;
  }

  function buildMobile() {
    var el = document.createElement('div');
    el.id = 'su-bm-bar';
    el.innerHTML =
      '<span class="su-bm-emoji">📌</span>' +
      '<span class="su-bm-txt">don’t lose this board forever. bookmark us.</span>' +
      '<span class="su-bm-x" title="dismiss">✕</span>';
    el.querySelector('.su-bm-x').addEventListener('click', function () {
      el.classList.remove('su-bm-in');
      setTimeout(function () { if (el.parentNode) el.remove(); }, 440);
      remember(); log('bookmark_dismiss');
    });
    return el;
  }

  // Optional: log a view so we can tell in the Reports sheet whether this is worth keeping.
  function log(action) {
    try { if (typeof window.suTrack === 'function') window.suTrack(action, '', ''); } catch (e) {}
  }

  function mount() {
    injectCss();
    var mobile = window.innerWidth <= 640;
    if (mobile) {
      var bar = buildMobile();
      document.body.appendChild(bar);
      // let it paint at -100% first, then slide in
      requestAnimationFrame(function () { requestAnimationFrame(function () { bar.classList.add('su-bm-in'); }); });
    } else {
      var postit = buildDesktop();
      var hero = document.getElementById('hero-desktop');
      if (hero) {
        hero.appendChild(postit);              // lives in the scrapbook, scales with the stage
      } else {
        postit.classList.add('su-bm-fixed');   // fallback: pin to the viewport, clear of the pill
        document.body.appendChild(postit);
      }
    }
    log('bookmark_view');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
