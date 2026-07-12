/* =========================================================================
   StillUnemployed.com — Jobs board
   Vanilla-JS rebuild of the original Manus "DCLogic" component.

   Loads ./jobs-data.json, renders all job cards into the exact markup the
   original template produced, and reimplements every interaction:
     - text search (with nyc / sf bay area / la synonyms)
     - category (ind) filter + the category dropdown panel with live counts
     - work-style / pay-tier / state filters + the filters panel
     - active filter chips, "showing X of Y" label, clear/reset
     - ?theme= URL content presets (social / copy / brand / marketing)
     - editor's "pick!" treatment, save/bookmark toggle (localStorage)
     - personal handwritten notes (envelope -> open -> verified), with the
       noteUnfold / noteFold / stampFade / envbob animations
     - random card tilt, pay-tier card colors, pin / tape / doodle decorations
     - the About modal and the "how'd it go" apply-feedback popup

   No build step. Plain static files. Edit jobs-data.json to add/remove a job.
   ========================================================================= */
(function () {
  'use strict';

  // ---- tiny helpers ---------------------------------------------------------
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  // escape for use inside a single-quoted JS string in an inline handler
  var jsAttr = function (s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  };

  // Report endpoint: Google Apps Script web app that logs "Job link broken" and
  // "I applied" taps into the StillUnemployed Reports sheet. Empty string keeps the
  // feature a safe no-op until the deployed /exec URL is dropped in below.
  var REPORT_URL = 'https://script.google.com/macros/s/AKfycbx_ct-QHSXxYeE2m7_e8XIsBojGPFP1he0b9-YMad6qVera8i2OAfj8XQb5VncAKGpU/exec';
  // Mirror analytics.js's exclusion so admin (Nic's own testing) + non-prod hosts
  // (localhost / previews) DON'T fire click/applied/broken events — a "broken" tap
  // also triggers Nic's dead-link email, so his own clicks must be suppressed too.
  // Keep the host list in sync with analytics.js PROD_HOSTS.
  function reportExcluded() {
    try { if (localStorage.getItem('su_admin') === '1') return true; } catch (e) {}
    var h = location.hostname;
    return (h !== 'stillunemployed.com' && h !== 'www.stillunemployed.com');
  }
  // Log a "recipe_view" when a popup that carries the capture block is opened (same 1-in-3
  // hash as the render), so the Reports sheet can compute views vs hides vs signups.
  function suRecipeView(link, comp) {
    try {
      if (!link || (comp && comp._recipeHidden)) return;
      var h = 0, s = String(link);
      for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
      if (h % 3 !== 0) return;
      // 30+ day cards don't show the block (they carry the age line instead) — don't log a view
      if (comp && comp.jobs) {
        for (var j = 0; j < comp.jobs.length; j++) {
          if (comp.jobs[j].link === link) {
            var src = comp.jobs[j].posted || comp.jobs[j].added || '';
            if (src) { var ad = new Date(String(src).trim().slice(0, 10) + 'T00:00:00'); if (!isNaN(ad.getTime()) && Math.floor((Date.now() - ad.getTime()) / 86400000) >= 30) return; }
            break;
          }
        }
      }
      var variants = ['want the exact advice that got me a job at Instagram? ↓', 'want the recipe I followed to a 6-figure offer? ↓', 'the advice that almost got me a job with the Kardashians ↓', '4 hand-picked jobs + 1 raw story, every Monday. free. ↓'];
      postReport('recipe_view', variants[(h >> 2) % variants.length], link);
    } catch (e) {}
  }

  // "Tracker (N)" nav badge — digits in Archivo (clearer than Indie Flower), 99+ cap, hidden at 0
  function suTrkBadge() {
    try {
      var r = JSON.parse(localStorage.getItem('su_tracker') || '[]');
      var n = Array.isArray(r) ? r.length : 0;
      if (!n) return '';
      return ' (<span style="font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 16px;">' + (n > 99 ? '99+' : n) + '</span>)';
    } catch (e) { return ''; }
  }

  // Anonymous per-visitor id (random, no PII) — lets the triage agent spot repeat offenders
  // whose "no longer open" reports keep turning out to be false.
  function suCid() {
    try {
      var c = localStorage.getItem('su_cid');
      if (!c) { c = 'c' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('su_cid', c); }
      return c;
    } catch (e) { return 'c_anon'; }
  }
  // Sliding-window rate limiter (per visitor, per bucket). Returns false when over the cap.
  function suRateOk(bucket, max, windowSec) {
    try {
      var k = 'su_rate_' + bucket, now = Date.now();
      var ts = JSON.parse(localStorage.getItem(k) || '[]').filter(function (t) { return now - t < windowSec * 1000; });
      if (ts.length >= max) { localStorage.setItem(k, JSON.stringify(ts)); return false; }
      ts.push(now); localStorage.setItem(k, JSON.stringify(ts));
      return true;
    } catch (e) { return true; }
  }

  function postReport(action, co, link) {
    if (!REPORT_URL) return;
    if (reportExcluded()) {                    // admin / localhost: log, don't POST (no sheet row, no email)
      try { console.debug('[su] report suppressed (admin/non-prod):', action, co, link); } catch (e) {}
      return;
    }
    try {
      fetch(REPORT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, company: co || '', link: link || '', page: location.href, cid: suCid() })
      });
    } catch (e) { /* fire-and-forget; never block the UI */ }
  }

  // Short, celebratory confetti burst on "I applied!" — self-contained (no library),
  // one-shot canvas that removes itself. Respects prefers-reduced-motion. Runs ~1.1s.
  // THEME-AWARE: the particle style matches the active "Change Look?" theme —
  //   original = confetti rectangles · poker (Casino) = casino chips ·
  //   mermaid = fish scales + water droplets · girly = pink hearts · cod (WW2) = grain kernels.
  var CONFETTI_THEMES = {
    original: { shape: 'rect',  colors: ['#D8502E', '#E9B949', '#2E9E5B', '#3E7CB1', '#C74BAF', '#F4EEE2'] },
    poker:    { shape: 'chip',  colors: ['#D8323C', '#16181D', '#1F6B3A', '#F4EEE2', '#E9C46A'] },
    mermaid:  { shape: 'scale', colors: ['#2E9E8F', '#58C4B0', '#8FE3D6', '#BDECE4', '#7FB6E0'] },
    girly:    { shape: 'heart', colors: ['#FF77BC', '#F23E98', '#FFC1E3', '#E84B9C', '#FFFFFF'] },
    bratt:    { shape: 'rect',  colors: ['#8ACE00', '#96DB0A', '#0A0A0A', '#B6F03A', '#FFFFFF'] },
    noir:     { shape: 'rect',  colors: ['#C9CDD4', '#8A8E94', '#1A1A1A', '#E5E8EC', '#FFFFFF'] },
    beauty:   { shape: 'heart', colors: ['#7E1728', '#F3C9D2', '#F3D9B8', '#C24A78', '#EFE7DC'] },
    chess:    { shape: 'rect',  colors: ['#141414', '#FFFFFF', '#3A3A3A', '#E5E5E5', '#8A8A8A'] },
    cod:      { shape: 'grain', colors: ['#C8A24A', '#A9852F', '#8A6D2B', '#D8C48A', '#6B5A2A'] }
  };
  function suDrawParticle(ctx, shape, p) {
    ctx.fillStyle = p.color;
    if (shape === 'rect') {
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    } else if (shape === 'chip') {
      var R = p.w;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.lineCap = 'butt'; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = Math.max(2, R * 0.3);
      for (var s = 0; s < 6; s++) { var a = (s / 6) * Math.PI * 2; ctx.beginPath(); ctx.arc(0, 0, R, a, a + 0.34); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(1, R * 0.14); ctx.stroke();
    } else if (shape === 'scale') {
      ctx.beginPath(); ctx.arc(0, 0, p.w, Math.PI, 2 * Math.PI); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    } else if (shape === 'heart') {
      var s2 = p.w;
      ctx.beginPath();
      ctx.moveTo(0, s2 * 0.32);
      ctx.bezierCurveTo(s2 * 0.5, -s2 * 0.42, s2 * 1.1, s2 * 0.36, 0, s2);
      ctx.bezierCurveTo(-s2 * 1.1, s2 * 0.36, -s2 * 0.5, -s2 * 0.42, 0, s2 * 0.32);
      ctx.closePath(); ctx.fill();
    } else if (shape === 'grain') {
      ctx.beginPath(); ctx.ellipse(0, 0, p.w * 0.42, p.w, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -p.w * 0.78); ctx.lineTo(0, p.w * 0.78); ctx.stroke();
    }
  }
  function suConfetti() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var look = 'original';
      try { look = localStorage.getItem('su_look') || 'original'; } catch (e) {}
      var cfg = CONFETTI_THEMES[look] || CONFETTI_THEMES.original;
      var shape = cfg.shape, colors = cfg.colors;
      var cv = document.createElement('canvas');
      cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
      cv.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cv);
      var ctx = cv.getContext('2d');
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var W = window.innerWidth, H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
      var N = Math.min(140, Math.round(W / 9)), parts = [];
      var cx = W / 2, cy = H * 0.42;
      // round shapes (chip/scale/heart/grain) use w as a radius, so keep them a touch smaller.
      var round = (shape !== 'rect');
      for (var i = 0; i < N; i++) {
        var ang = Math.random() * Math.PI * 2, sp = 5 + Math.random() * 9;
        parts.push({
          x: cx + (Math.random() - 0.5) * 60, y: cy + (Math.random() - 0.5) * 20,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 3,
          w: round ? (5 + Math.random() * 4) : (5 + Math.random() * 6),
          h: 8 + Math.random() * 7,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
          color: colors[(Math.random() * colors.length) | 0]
        });
      }
      var t0 = Date.now(), DUR = 1100;
      (function frame() {
        var el = Date.now() - t0;
        ctx.clearRect(0, 0, W, H);
        for (var j = 0; j < parts.length; j++) {
          var p = parts[j];
          p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - el / DUR);
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          suDrawParticle(ctx, shape, p);
          ctx.restore();
        }
        if (el < DUR) requestAnimationFrame(frame);
        else if (cv.parentNode) cv.parentNode.removeChild(cv);
      })();
    } catch (e) { /* never block the UI */ }
  }

  // ---- tiny toast (e.g. "Thanks — we'll look at it ASAP.") ----
  function suToast(msg) {
    try {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%) rotate(-1deg);z-index:2147483200;' +
        "background:#2C2118;color:#F6E24B;font-family:'Indie Flower','Comic Sans MS',cursive;font-size:17px;padding:11px 20px;" +
        'border-radius:10px;box-shadow:2px 6px 18px rgba(44,33,24,0.35);max-width:88vw;text-align:center;' +
        'animation:suCcIn .3s cubic-bezier(.2,.9,.3,1.25) both;';
      document.body.appendChild(t);
      setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 420); }, 2400);
    } catch (e) {}
  }

  // ---- Share: draw the job as a Post-it PNG (canvas, no library), hand the blob to a callback ----
  function suMakePng(job, cb) {
    try {
      var S = 2, W = 560, H = 360, cv = document.createElement('canvas');
      cv.width = W * S; cv.height = H * S; var ctx = cv.getContext('2d'); ctx.scale(S, S);
      function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); } else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); } }
      ctx.fillStyle = '#EDE6D4'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.02); ctx.translate(-W / 2, -H / 2);
      ctx.shadowColor = 'rgba(44,33,24,0.25)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 10;
      ctx.fillStyle = '#F6E24B'; rr(34, 34, W - 68, H - 68, 10); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#2C2118'; ctx.textBaseline = 'top';
      ctx.font = "900 30px 'Archivo Black', Archivo, sans-serif";
      ctx.fillText(String(job.co || '').slice(0, 26), 58, 66);
      ctx.font = "600 18px Archivo, sans-serif"; ctx.fillStyle = '#3A2E20';
      ctx.fillText(String(job.role || '').slice(0, 40), 58, 106);
      ctx.font = "900 34px 'Archivo Black', Archivo, sans-serif"; ctx.fillStyle = '#2C2118';
      if (job.pay) ctx.fillText(String(job.pay), 58, 150);
      ctx.font = "500 16px Archivo, sans-serif"; ctx.fillStyle = '#4A3B28';
      ctx.fillText([job.loc, job.type, job.exp].filter(Boolean).join('  ·  ').slice(0, 48), 58, 200);
      ctx.font = "700 20px 'Indie Flower', cursive"; ctx.fillStyle = '#B23A1E';
      ctx.fillText('★ stillunemployed.com', 58, H - 96);
      ctx.font = "700 14px 'Indie Flower', cursive"; ctx.fillStyle = '#6F5E45';
      ctx.fillText('roles I\'d actually apply to', 58, H - 70);
      ctx.restore();
      cv.toBlob(function (blob) { cb(blob); }, 'image/png');
    } catch (e) { cb(null); }
  }

  // deterministic short slug from the apply link — MUST match scripts/gen-share.mjs slugOf()
  function suSlug(str) {
    str = String(str || '');
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
  }

  // current live theme, mapped to the 3 looks we generate share cards for (archived
  // looks fall back to original). Keeps the shared link's preview matching the card
  // the viewer is actually looking at.
  function suShareTheme() {
    var t = '';
    try { t = localStorage.getItem('su_look') || ''; } catch (e) {}
    return (t === 'poker' || t === 'girly') ? t : 'original';
  }

  // ---- Share a job: hand out ONLY the per-job link. Its Open Graph preview IS the
  // themed Post-it card (served static by /j/<theme>/<slug>.html). No PNG attachment —
  // a second, un-clickable image is just noise; the link's own thumbnail does the job. ----
  function suShareJob(job) {
    if (!job) return;
    var deep = location.origin + '/j/' + suShareTheme() + '/' + suSlug(job.link || '') + '.html';
    // Casual, no link/brand in the TEXT (iMessage auto-linkifies "StillUnemployed.com"
    // into a tappable link that goes to the homepage, not the job — Nic didn't want that).
    // The shared url param below still generates the Post-it thumbnail.
    var text = 'Saw this role from ' + (job.co || 'a company') + ' and thought about you.';
    var title = (job.co || 'StillUnemployed') + (job.role ? ' — ' + job.role : '');
    try {
      if (navigator.share) { navigator.share({ title: title, text: text, url: deep }).catch(function () {}); return; }
    } catch (e) {}
    // desktop fallback: copy the link (no forced download, no PNG)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(deep).then(function () { suToast('Link copied — paste it anywhere!'); }, function () { window.prompt('Copy this link:', deep); });
    } else { window.prompt('Copy this link:', deep); }
  }

  // ---- Theme analytics: dwell time + a "do you like this look?" vote ----
  // Logs how long each look is used (theme_time) and a 👍/👎 vote (themevote) via
  // suTrack, so both respect the admin/non-prod exclusion. The vote pops once per
  // theme per visitor, after they switch to a non-default look and scroll past 10 jobs.
  var THEME_T0 = 0, THEME_CUR = '';
  function logThemeTime() {
    if (!THEME_CUR || !THEME_T0) return;
    var secs = Math.round((Date.now() - THEME_T0) / 1000);
    THEME_T0 = Date.now();
    if (secs < 2 || secs > 86400) return;                 // ignore blips + absurd spans
    try { if (typeof window.suTrack === 'function') window.suTrack('theme_time', THEME_CUR, String(secs), ''); } catch (e) {}
  }
  function initThemeTracking(currentLook) {
    THEME_CUR = currentLook || 'original';
    THEME_T0 = Date.now();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') logThemeTime();
      else THEME_T0 = Date.now();
    });
    window.addEventListener('pagehide', logThemeTime);
  }
  var _voteArmed = false, _voteLook = '', _voteShown = false, _voteTick = 0;
  function armThemeVote(look) {
    _voteArmed = false; _voteShown = false;
    if (look === 'original') return;                      // only the fun themes ask
    try { if (localStorage.getItem('su_tv_' + look) === '1') return; } catch (e) {}  // once per theme
    _voteArmed = true; _voteLook = look;
  }
  function onThemeScroll() {
    if (!_voteArmed || _voteShown) return;
    var now = Date.now(); if (now - _voteTick < 250) return; _voteTick = now;         // throttle
    var cards = document.querySelectorAll('.note[data-act="openJob"]');
    if (cards.length < 10) return;
    if (cards[9].getBoundingClientRect().bottom < 0) showThemeVote(_voteLook);         // 10 cards scrolled past
  }
  function showThemeVote(look) {
    if (_voteShown) return;
    _voteShown = true; _voteArmed = false;
    try { localStorage.setItem('su_tv_' + look, '1'); } catch (e) {}
    var box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Theme feedback');
    box.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%) rotate(-1.2deg);z-index:2147482000;' +
      'background:#FBF7EC;color:#2C2118;border:1.5px solid #E4D6B4;border-radius:12px;box-shadow:2px 8px 22px rgba(44,33,24,0.28);' +
      "padding:11px 18px 13px;font-family:'Indie Flower','Comic Sans MS',cursive;display:flex;flex-direction:column;align-items:center;gap:8px;max-width:90vw;" +
      'animation:suCcIn .3s cubic-bezier(.2,.9,.3,1.25) both;';
    var msg = document.createElement('div'); msg.style.cssText = 'font-size:17px;white-space:nowrap;'; msg.textContent = 'Do you like this look?';
    var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:12px;';
    var up = document.createElement('button'); up.type = 'button'; up.textContent = '👍';
    var dn = document.createElement('button'); dn.type = 'button'; dn.textContent = '👎';
    var bstyle = 'cursor:pointer;border:1.5px solid #E4D6B4;background:#F6EFDD;border-radius:10px;font-size:19px;padding:3px 16px;line-height:1;';
    up.style.cssText = bstyle; dn.style.cssText = bstyle;
    function close() { if (box.parentNode) box.parentNode.removeChild(box); }
    up.addEventListener('click', function () {
      try { if (typeof window.suTrack === 'function') window.suTrack('themevote', look, 'up', ''); } catch (e) {}
      suConfetti();                                       // theme-aware burst
      msg.textContent = 'yay 🎉'; row.style.display = 'none';
      setTimeout(close, 1300);
    });
    dn.addEventListener('click', function () {
      try { if (typeof window.suTrack === 'function') window.suTrack('themevote', look, 'down', ''); } catch (e) {}
      box.innerHTML = '';
      var t = document.createElement('div'); t.style.cssText = 'font-size:15px;max-width:210px;text-align:center;line-height:1.35;';
      t.innerHTML = 'no worries — tap <b>&ldquo;change theme&rdquo;</b> up top to switch anytime →';
      box.appendChild(t);
      setTimeout(close, 3400);
    });
    row.appendChild(up); row.appendChild(dn);
    box.appendChild(msg); box.appendChild(row);
    document.body.appendChild(box);
  }

  // "I applied" ALSO logs the job into the on-device application Tracker
  // (localStorage key su_tracker, read by tracker.html). Rows dedupe by link so a
  // double-tap never double-logs. Purely additive — the POST above is untouched.
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function trackerLog(co, link, role) {
    try {
      var rows = JSON.parse(localStorage.getItem('su_tracker') || '[]');
      if (!Array.isArray(rows)) rows = [];
      if (link && rows.some(function (r) { return r && r.link === link; })) return;
      var d = new Date();
      rows.unshift({
        id: 'su-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        company: co || '',
        role: role || '',
        link: link || '',
        source: 'StillUnemployed',
        dateApplied: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()),
        status: 'Applied',
        notes: ''
      });
      localStorage.setItem('su_tracker', JSON.stringify(rows));
    } catch (e) { /* tracker is a bonus; never block the confirm flow */ }
  }

  // US states (name + 2-letter code) so a state search also surfaces remote-anywhere roles.
  var SU_STATES = { 'al':1,'alabama':1,'ak':1,'alaska':1,'az':1,'arizona':1,'ar':1,'arkansas':1,'ca':1,'california':1,'co':1,'colorado':1,'ct':1,'connecticut':1,'de':1,'delaware':1,'fl':1,'florida':1,'ga':1,'georgia':1,'hi':1,'hawaii':1,'id':1,'idaho':1,'il':1,'illinois':1,'in':1,'indiana':1,'ia':1,'iowa':1,'ks':1,'kansas':1,'ky':1,'kentucky':1,'la':1,'louisiana':1,'me':1,'maine':1,'md':1,'maryland':1,'ma':1,'massachusetts':1,'mi':1,'michigan':1,'mn':1,'minnesota':1,'ms':1,'mississippi':1,'mo':1,'missouri':1,'mt':1,'montana':1,'ne':1,'nebraska':1,'nv':1,'nevada':1,'nh':1,'new hampshire':1,'nj':1,'new jersey':1,'nm':1,'new mexico':1,'ny':1,'new york':1,'nc':1,'north carolina':1,'nd':1,'north dakota':1,'oh':1,'ohio':1,'ok':1,'oklahoma':1,'or':1,'oregon':1,'pa':1,'pennsylvania':1,'ri':1,'rhode island':1,'sc':1,'south carolina':1,'sd':1,'south dakota':1,'tn':1,'tennessee':1,'tx':1,'texas':1,'ut':1,'utah':1,'vt':1,'vermont':1,'va':1,'virginia':1,'wa':1,'washington':1,'wv':1,'west virginia':1,'wi':1,'wisconsin':1,'wy':1,'wyoming':1,'dc':1,'washington dc':1,'district of columbia':1 };
  function suIsStateQuery(q) {
    if (!q) return false;
    if (SU_STATES[q]) return true;                          // exact state name or 2-letter code
    if (q.length >= 3) { for (var s in SU_STATES) { if (s.length > 2 && s.indexOf(q) === 0) return true; } }  // prefix like "cali", "penn"
    return false;
  }

  // =========================================================================
  // Logic — ported 1:1 from the Manus DCLogic Component.
  // =========================================================================
  var App = {
    jobs: [],

    state: {
      q: '',
      cat: 'all',
      ws: 'Any',
      st: 'all',
      pr: 'Any',
      fr: 'Any',
      theme: new URLSearchParams(location.search).get('theme'),
      saved: loadSaved(),
      savedOnly: false,
      openNotes: {},
      openPanel: null,
      modalOpen: false,
      feedbackOpen: false,
      feedbackCo: '',
      feedbackLink: '',
      // "Change Look?" visual theme: 'original' | 'cod' (WW2) | 'girly' | 'poker' | 'mermaid'.
      // Loaded from localStorage so the choice sticks across reloads + pages.
      look: loadLook(),
      lookOpen: false
    },

    // ---- "Change Look?" palettes — values copied VERBATIM from MAIN FILE.dc.html ----
    THEMES: {
      cod:      { acc:'#555B38', accInk:'#EDE7CF', cls:'cod',   ink:'#E9E3D2', sub:'#AEB29B', pay:'#AEB29B', show:'#AEB29B', navBg:'#5C6B3A', navInk:'#EDE7CF', hl:'rgba(120,140,75,0.92)', hiCard:'linear-gradient(160deg,#5C6440 0%,#4B5234 100%)', hiInk:'#F1E9D8', hiApply:'#FFFFFF', hiStamp:'#FFFFFF', payHi:'linear-gradient(160deg,#5C6440,#4B5234)' },
      girly:    { acc:'#E84B9C', accInk:'#FFF3FA', cls:'girly', ink:'#2A0E1E', sub:'#8A2B5E', pay:'#8A2B5E', show:'#8A2B5E', navBg:'#F25CA2', navInk:'#FFFFFF', hl:'rgba(233,59,146,0.92)', hiCard:'linear-gradient(160deg,#FF77BC 0%,#F23E98 100%)', hiInk:'#3A0E26', hiApply:'#3A0E26', hiStamp:'#3A0E26', payHi:'linear-gradient(160deg,#FF77BC,#F23E98)' },
      original: { acc:'#F2E14B', accInk:'#2A2118', cls:'',      ink:'#2A2118', sub:'#6F5E45', pay:'#9C8367', show:'#3A2A1B', navBg:'#EDE93B', navInk:'#1f1c14', hl:'rgba(238,224,70,0.95)', hiCard:'linear-gradient(160deg,#F6E85F 0%,#EFDB3D 100%)', hiInk:'#2A2118', hiApply:'#D8502E', hiStamp:'#3A2A1B', payHi:'linear-gradient(160deg,#F6E85F,#EFDB3D)' },
      // poker + mermaid extend the shape with optional card overrides (lowCard/midCard/baseInk/
      // baseApply/baseStamp) and a featured-pick treatment (pickCard/pickInk/pickApply/pickStamp/
      // pickBadge). render() falls back to the original values when a key is absent.
      // Casino (poker): salary tiers by top-of-range — <$80K white, $80-99K green, $100K+ black.
      poker:    { acc:'#D4AF37', accInk:'#2A1810', cls:'poker', ink:'#F2E4C8', sub:'#D9B989', pay:'#D9B989', show:'#D9B989', navBg:'#D4AF37', navInk:'#2A1810', hl:'rgba(31,107,58,0.92)', hiCard:'linear-gradient(160deg,#26262B 0%,#101014 100%)', hiInk:'#E9D9A6', hiApply:'#D4AF37', hiStamp:'#D4AF37', payHi:'linear-gradient(160deg,#26262B,#101014)', lowCard:'linear-gradient(160deg,#FFFFFF 0%,#F1ECDE 100%)', midCard:'linear-gradient(160deg,#1F6B3A 0%,#155229 100%)', midInk:'#EAF6E4', midApply:'#FFD98A', midStamp:'#F2E7C8', baseInk:'#23242C', baseApply:'#C0303A', baseStamp:'#23242C', pickCard:'linear-gradient(160deg,#26262B 0%,#101014 100%)', pickInk:'#E9D9A6', pickApply:'#D4AF37', pickStamp:'#D4AF37', pickBadge:'#D4AF37' },
      mermaid:  { acc:'#FF7E67', accInk:'#4A160D', cls:'mermaid', ink:'#0E4A5C', sub:'#1B6B7D', pay:'#1B6B7D', show:'#1B6B7D', navBg:'#0E4A5C', navInk:'#E9FBFF', hl:'rgba(255,126,103,0.85)', hiCard:'linear-gradient(160deg,#177287 0%,#0E4A5C 100%)', hiInk:'#F2FBFA', hiApply:'#FFC7B8', hiStamp:'#EAF7F4', payHi:'linear-gradient(160deg,#177287,#0E4A5C)', lowCard:'linear-gradient(160deg,#FFFFFF 0%,#EAF6F6 55%,#F5EEF7 100%)', midCard:'linear-gradient(160deg,#FDFEFF 0%,#DFF2F1 55%,#F0E7F4 100%)', baseInk:'#0E4A5C', baseApply:'#D9553C', baseStamp:'#0E4A5C', pickCard:'linear-gradient(160deg,#177287 0%,#0E4A5C 100%)', pickInk:'#F2FBFA', pickApply:'#FFC7B8', pickStamp:'#EAF7F4', pickBadge:'#D9553C' },
      // "bratt" theme — Charli XCX BRAT album green #8ACE00 (verified). Named double-t to dodge the trademark.
      // $100K+ card = brat green with near-black lowercase-energy text; board accents + highlight are the green.
      bratt:    { acc:'#8ACE00', accInk:'#0A1400', cls:'bratt', ink:'#0A0A0A', sub:'#4A6A10', pay:'#4A6A10', show:'#2E4A00', navBg:'#8ACE00', navInk:'#0A1400', hl:'rgba(138,206,0,0.95)', hiCard:'linear-gradient(160deg,#96DB0A 0%,#8ACE00 100%)', hiInk:'#0A1400', hiApply:'#0A1400', hiStamp:'#0A1400', payHi:'linear-gradient(160deg,#96DB0A,#8ACE00)', lowCard:'linear-gradient(160deg,#FFFFFF 0%,#F4FBE4 100%)', midCard:'linear-gradient(160deg,#EAF7C4 0%,#DCEF9E 100%)', baseInk:'#1A2A0A', baseApply:'#3A7A00', baseStamp:'#1A2A0A', pickCard:'linear-gradient(160deg,#96DB0A,#8ACE00)', pickInk:'#0A1400', pickApply:'#0A1400', pickStamp:'#0A1400', pickBadge:'#0A1400' },
      // "Noir" — black luxury (not gothic). Cream board, $100K+ card black with silver letters.
      // "Black Cat" (label) — matte black luxury. ALL cards keep the same silver text (Nic: consistent
      // text color so the eye flows). $100K+ = brushed-graphite (silver, matte, not corny); lower tiers darker.
      // "Black Cat" — luxury SILK-white board. Cards get darker/lighter by tier but the TEXT stays WHITE
      // on every card (Nic: don't flip the font color). $100K+ = matte black, $80-99K = dark charcoal,
      // <$80K = medium-dark gray — all with white text.
      noir:     { acc:'#1E1C1A', accInk:'#F4F2EC', cls:'noir', ink:'#1C1A18', sub:'#6E675E', pay:'#4A443C', show:'#241F1A', navBg:'#161616', navInk:'#ECECEC', hl:'rgba(196,180,150,0.38)', hiCard:'linear-gradient(160deg,#161618 0%,#050506 100%)', hiInk:'#ECECEE', hiApply:'#ECECEE', hiStamp:'#C6C6C8', payHi:'linear-gradient(160deg,#161618,#050506)', lowCard:'linear-gradient(160deg,#4E4E52 0%,#3E3E42 100%)', midCard:'linear-gradient(160deg,#2E2E31 0%,#232326 100%)', midInk:'#ECECEE', midApply:'#ECECEE', midStamp:'#C6C6C8', baseInk:'#ECECEE', baseApply:'#ECECEE', baseStamp:'#C6C6C8', pickCard:'linear-gradient(160deg,#161618,#050506)', pickInk:'#ECECEE', pickApply:'#ECECEE', pickStamp:'#C6C6C8', pickBadge:'#1E1C1A' },
      // "Beauty" — high-class lipstick. Cream board, $100K+ card burgundy with warm-gold text; pink lower cards.
      beauty:   { acc:'#8A1E33', accInk:'#FDECEF', cls:'beauty', ink:'#4A1520', sub:'#8A4A58', pay:'#8A4A58', show:'#6E2233', navBg:'#6E1423', navInk:'#F7DDE2', hl:'rgba(240,190,202,0.95)', hiCard:'linear-gradient(160deg,#7E1728 0%,#5A0F1C 100%)', hiInk:'#F3D9B8', hiApply:'#F3D9B8', hiStamp:'#F3D9B8', payHi:'linear-gradient(160deg,#7E1728,#5A0F1C)', lowCard:'linear-gradient(160deg,#FBEFF1 0%,#F3C9D2 100%)', midCard:'linear-gradient(160deg,#F5D3DA 0%,#EAB4C0 100%)', baseInk:'#5A2230', baseApply:'#A83048', baseStamp:'#5A2230', pickCard:'linear-gradient(160deg,#7E1728,#5A0F1C)', pickInk:'#F3D9B8', pickApply:'#F3D9B8', pickStamp:'#F3D9B8', pickBadge:'#F3D9B8' },
      // "Chess" — marble board. $100K+ = the black "king" card (white text); lower tiers = warm ivory + cool
      // stone (black text). Black vs white IS the chess identity; décor = chess pieces on the board.
      chess:    { acc:'#141414', accInk:'#F4F4F4', cls:'chess', ink:'#161616', sub:'#5A5A5A', pay:'#3A3A3A', show:'#161616', navBg:'#161616', navInk:'#F4F4F4', hl:'rgba(20,20,20,0.14)', hiCard:'linear-gradient(160deg,#20211F 0%,#0C0C0C 100%)', hiInk:'#F4F4F4', hiApply:'#F4F4F4', hiStamp:'#D4D4D4', payHi:'linear-gradient(160deg,#20211F,#0C0C0C)', lowCard:'linear-gradient(160deg,#EDEEEA 0%,#DBDDD6 100%)', midCard:'linear-gradient(160deg,#FBFAF6 0%,#F0EEE5 100%)', midInk:'#161616', midApply:'#161616', midStamp:'#3A3A3A', baseInk:'#161616', baseApply:'#161616', baseStamp:'#3A3A3A', pickCard:'linear-gradient(160deg,#20211F,#0C0C0C)', pickInk:'#F4F4F4', pickApply:'#F4F4F4', pickStamp:'#D4D4D4', pickBadge:'#141414' }
    },

    themeDefs: {
      social: { label: 'Social & adjacent', cats: ['Social'], kw: ['social', 'community'] },
      copy: { label: 'Copywriting & content', cats: ['Content & Copy'], kw: ['copy', 'content', 'writer', 'sheditor'] },
      brand: { label: 'Branding', cats: ['Brand & Marketing'], kw: ['brand'] },
      creativetech: { label: 'Creative Tech', cats: ['Creative Tech'], kw: ['creative', 'tech', 'ai', 'technologist'] },
      marketing: { label: 'Marketing & growth', cats: ['Growth & CRM', 'PR & Partnerships'], kw: ['marketing', 'growth', 'crm', 'lifecycle', 'audience', 'affiliate', 'partnership'] }
    },

    NOTES: [
      "If I ever needed a job again, this is the first one I'd apply to.",
      "Read this whole posting twice. It's the real deal, I promise.",
      "This is the kind of role I wish someone had sent me back when I was looking.",
      "If you apply to one thing this week, make it something on this row.",
      "Found this at 2am and got genuinely excited for whoever lands it.",
      "I vouch for this team. Don't make me regret putting them up here.",
      "Almost didn't post this one. Too good to bury further down."
    ],

    // Doodle pose table (verbatim from DCLogic). Each pose: width, position, and
    // parts. Part ['c',cx,cy,r] = circle; ['p',d] = path; trailing 1 => accent stroke.
    POSES: [
      { w: 40, pos: { top: '-46px', left: '34%' }, parts: [['c',24,16,7],['p','M24 23 L24 52'],['p','M24 28 L40 18'],['p','M40 6 L40 40',1],['p','M40 6 L55 11 L40 16 Z',1],['p','M24 52 L16 72'],['p','M24 52 L33 68']] },
      { w: 36, pos: { top: '26px', right: '-22px' }, parts: [['c',28,14,7],['p','M28 21 L28 50'],['p','M28 27 L18 18 L22 11'],['p','M28 27 L38 18 L34 11'],['p','M28 50 L20 70'],['p','M28 50 L36 70']] },
      { w: 36, pos: { top: '-44px', right: '30%' }, parts: [['c',28,14,7],['p','M28 21 L28 50'],['p','M28 27 L13 13'],['p','M28 27 L43 13'],['p','M28 50 L18 70'],['p','M28 50 L38 70']] },
      { w: 40, pos: { top: '-42px', left: '30%' }, parts: [['c',30,12,7],['p','M30 19 L30 46'],['p','M30 24 L18 10'],['p','M30 24 L42 10'],['p','M30 46 L20 58'],['p','M30 46 L40 58'],['p','M22 66 l16 0',1]] },
      { w: 34, pos: { bottom: '22px', right: '-26px' }, parts: [['c',25,12,7],['p','M25 19 L22 47'],['p','M23 26 L8 15'],['p','M23 28 L41 17'],['p','M22 47 L10 67'],['p','M22 47 L37 61 L35 76']] },
      { w: 34, pos: { left: '-16px', top: '26px' }, parts: [['c',34,13,7],['p','M33 20 L26 47'],['p','M31 27 L45 14'],['p','M30 31 L15 22'],['p','M26 47 L33 70 L29 85'],['p','M26 47 L13 61']] },
      { w: 38, pos: { left: '-14px', top: '24px' }, parts: [['c',24,16,7],['p','M24 23 L24 52'],['p','M24 28 L40 8',1],['p','M24 30 L14 40'],['p','M24 52 L16 72'],['p','M24 52 L32 72']] },
      { w: 42, pos: { top: '-38px', left: '34%' }, parts: [['c',32,14,7],['p','M32 21 L27 46'],['p','M30 28 L16 24'],['p','M30 30 L46 34'],['p','M27 46 L42 56'],['p','M27 46 L14 60 L18 50'],['p','M4 30 l9 0',1],['p','M2 40 l11 0',1]] },
      { w: 34, pos: { left: '-18px', bottom: '24px' }, parts: [['c',26,14,7],['p','M26 21 L26 50'],['p','M26 27 L40 12'],['p','M26 28 L16 38'],['p','M26 50 L18 70'],['p','M26 50 L34 70']] },
      { w: 46, pos: { bottom: '-6px', right: '-18px' }, parts: [['c',24,18,7],['p','M24 24 L31 46'],['p','M24 30 L14 44'],['p','M27 34 L37 46'],['p','M31 46 L23 66'],['p','M31 46 L41 64'],['p','M6 40 h15 v13 h-15 Z',1]] },
      { w: 50, pos: { top: '-24px', left: '36%' }, parts: [['c',14,30,6],['p','M19 32 L48 40'],['p','M24 36 L21 50'],['p','M40 38 L42 52'],['p','M48 40 L60 35']] },
      { w: 42, pos: { top: '-34px', right: '28%' }, rot: 30, parts: [['c',30,16,7],['p','M30 22 L30 50'],['p','M30 30 L10 30'],['p','M30 30 L50 30'],['p','M30 50 L14 64'],['p','M30 50 L46 64']] },
      { w: 40, pos: { top: '-38px', left: '40%' }, parts: [['c',20,14,6],['p','M20 20 L20 40'],['p','M20 26 L8 34'],['p','M20 26 L32 34'],['p','M20 40 L38 46'],['p','M20 40 L34 40']] },
      { w: 50, pos: { top: '-44px', right: '40px' }, parts: [['c',16,12,6],['p','M16 18 L18 38'],['p','M18 38 L12 56'],['p','M18 38 L24 56'],['p','M17 24 L40 20'],['p','M40 20 L60 10'],['p','M60 10 Q61 34 57 50',1],['p','M54 50 l3 5 l3 -5',1]] },
      { w: 42, pos: { top: '-30px', left: '30%' }, parts: [['c',30,30,7],['p','M30 36 L34 56'],['p','M30 40 L16 34'],['p','M32 42 L46 36'],['p','M34 56 L26 70'],['p','M34 56 L44 68'],['p','M12 20 l6 6',1],['p','M50 18 l-6 6',1]] },
      { w: 42, pos: { top: '-36px', right: '34%' }, parts: [['c',24,16,6],['p','M24 22 L24 40'],['p','M24 28 L12 38'],['p','M24 28 L36 38'],['p','M12 46 Q24 38 36 46 Q24 53 12 46']] }
    ],

    // ---- WW2 doodle poses (verbatim "MIL" table from MAIN FILE). 'r' => rect ----
    MIL: [
      { w: 46, pos: { top: '-50px', left: '28%' }, parts: [
        ['p','M16 24 A 15 14 0 0 1 46 24'], ['p','M13 25 L49 25'],
        ['c',31,31,6],
        ['p','M31 37 L31 61'],
        ['p','M31 61 L23 81'], ['p','M31 61 L39 81'],
        ['p','M31 45 L17 47'], ['p','M31 49 L41 47'],
        ['p','M12 45 L45 43'], ['p','M16 48 L39 46'],
        ['p','M12 45 L7 44'], ['p','M12 48 L7 50'],
        ['p','M28 47 L26 54'], ['p','M34 47 L35 53']
      ] },
      { w: 52, pos: { top: '-40px', left: '-14px' }, parts: [
        ['r',8,46,40,15,4],
        ['r',20,37,17,11,3],
        ['p','M35 42 L60 39'],
        ['c',15,64,5], ['c',26,64,5], ['c',37,64,5],
        ['p','M10 59 L45 59']
      ] },
      { w: 44, pos: { top: '-48px', right: '26%' }, parts: [
        ['p','M17 23 A 14 13 0 0 1 45 23'], ['p','M14 24 L48 24'],
        ['c',31,30,6],
        ['p','M31 36 L31 60'],
        ['p','M31 60 L24 79'], ['p','M31 60 L38 79'],
        ['p','M31 42 L46 28'],
        ['p','M40 32 L61 17'], ['p','M43 35 L58 21'],
        ['p','M40 32 L36 35'], ['p','M40 32 L38 28'],
        ['p','M50 25 L54 30']
      ] },
      { w: 40, pos: { left: '-18px', top: '24px' }, parts: [
        ['p','M16 23 A 15 14 0 0 1 46 23'], ['p','M13 24 L49 24'],
        ['c',30,30,6],
        ['p','M30 36 L30 59'],
        ['p','M30 42 L19 26'],
        ['p','M30 46 L40 52'],
        ['p','M30 59 L23 79'], ['p','M30 59 L37 79']
      ] },
      { w: 52, pos: { top: '-54px', left: '24%' }, parts: [
        ['p','M10 24 A 14 13 0 0 1 38 24'], ['p','M7 25 L41 25'],
        ['c',24,30,6],
        ['p','M24 36 L31 57'],
        ['p','M25 41 L41 31'],
        ['p','M41 31 L53 5'],
        ['p','M52 6 L41 9 Q46 13 41 16 L52 18'],
        ['p','M24 40 L13 49'],
        ['p','M31 57 L42 64 L39 77'],
        ['p','M31 57 L20 66 L26 76']
      ] },
      { w: 56, pos: { top: '-42px', right: '-16px' }, parts: [
        ['p','M5 21 L57 21'],
        ['p','M30 21 L30 27'],
        ['r',14,27,30,17,9],
        ['p','M16 32 L25 30'],
        ['p','M44 33 L61 28'],
        ['p','M61 28 L63 23'], ['p','M61 28 L63 33'],
        ['p','M16 50 L44 50'],
        ['p','M22 44 L19 50'], ['p','M38 44 L41 50']
      ] }
    ],

    // ---- girly doodle poses (verbatim "GIRLY" table from MAIN FILE) ----
    GIRLY: [
      { w: 138, vb: '0 0 120 64', pos: { top: '-58px', left: '14%' }, parts: [
        { e: 'circle', cx: 10, cy: 34, r: 9, fill: '#fff', stroke: '#E2C6D4', sw: 1.5 },
        { e: 'circle', cx: 24, cy: 31, r: 9, fill: '#fff', stroke: '#E2C6D4', sw: 1.5 },
        { e: 'circle', cx: 38, cy: 29, r: 9, fill: '#fff', stroke: '#E2C6D4', sw: 1.5 },
        { e: 'circle', cx: 52, cy: 28, r: 9, fill: '#fff', stroke: '#E2C6D4', sw: 1.5 },
        { e: 'circle', cx: 66, cy: 28, r: 9, fill: '#fff', stroke: '#E2C6D4', sw: 1.5 },
        { e: 'circle', cx: 80, cy: 29, r: 9, fill: '#fff', stroke: '#E2C6D4', sw: 1.5 },
        { e: 'circle', cx: 94, cy: 31, r: 9, fill: '#fff', stroke: '#E2C6D4', sw: 1.5 },
        { e: 'circle', cx: 108, cy: 34, r: 9, fill: '#fff', stroke: '#E2C6D4', sw: 1.5 },
        { e: 'text', x: 10, y: 34, s: 9, t: 'O' }, { e: 'text', x: 24, y: 31, s: 9, t: 'B' }, { e: 'text', x: 38, y: 29, s: 9, t: 'S' }, { e: 'text', x: 52, y: 28, s: 9, t: 'E' }, { e: 'text', x: 66, y: 28, s: 9, t: 'S' }, { e: 'text', x: 80, y: 29, s: 9, t: 'S' }, { e: 'text', x: 94, y: 31, s: 9, t: 'E' }, { e: 'text', x: 108, y: 34, s: 9, t: 'D' }
      ] },
      { w: 52, pos: { top: '-42px', right: '-14px' }, parts: [
        { e: 'path', d: 'M8 48 A 24 24 0 0 1 56 48', fill: 'none', stroke: '#E0566A', sw: 3.2 },
        { e: 'path', d: 'M13 48 A 19 19 0 0 1 51 48', fill: 'none', stroke: '#E89A4A', sw: 3.2 },
        { e: 'path', d: 'M18 48 A 14 14 0 0 1 46 48', fill: 'none', stroke: '#E6C44A', sw: 3.2 },
        { e: 'path', d: 'M23 48 A 9 9 0 0 1 41 48', fill: 'none', stroke: '#5CA86A', sw: 3.2 },
        { e: 'circle', cx: 9, cy: 50, r: 5, fill: '#fff' }, { e: 'circle', cx: 55, cy: 50, r: 5, fill: '#fff' }
      ] },
      { w: 44, pos: { top: '-46px', right: '30%' }, parts: [
        { e: 'path', d: 'M32 58 C 13 43, 17 24, 32 34 C 47 24, 51 43, 32 58 Z', fill: '#F25CA2', stroke: '#C24A78', sw: 1.6 },
        { e: 'circle', cx: 25, cy: 37, r: 2.6, fill: 'rgba(255,255,255,0.75)' }
      ] },
      { w: 46, pos: { left: '-16px', top: '22px' }, parts: [
        { e: 'circle', cx: 43, cy: 40, r: 6.5, fill: '#fff', stroke: '#EAD0DE', sw: 1.4 },
        { e: 'circle', cx: 37.5, cy: 49.5, r: 6.5, fill: '#fff', stroke: '#EAD0DE', sw: 1.4 },
        { e: 'circle', cx: 26.5, cy: 49.5, r: 6.5, fill: '#fff', stroke: '#EAD0DE', sw: 1.4 },
        { e: 'circle', cx: 21, cy: 40, r: 6.5, fill: '#fff', stroke: '#EAD0DE', sw: 1.4 },
        { e: 'circle', cx: 26.5, cy: 30.5, r: 6.5, fill: '#fff', stroke: '#EAD0DE', sw: 1.4 },
        { e: 'circle', cx: 37.5, cy: 30.5, r: 6.5, fill: '#fff', stroke: '#EAD0DE', sw: 1.4 },
        { e: 'circle', cx: 32, cy: 40, r: 6, fill: '#F2C84A' }
      ] }
    ],

    // ---- poker doodle poses (chips + a card corner). Same object-part format as
    //      GIRLY, plus 'rect'/'ellipse' elements and a 'dash' stroke-dasharray used
    //      for the chips' edge rings. Rendered by richDoodleEl(). ----
    POKER: [
      // single red chip
      { w: 46, vb: '0 0 64 64', pos: { top: '-50px', left: '30%' }, parts: [
        { e: 'circle', cx: 32, cy: 32, r: 24, fill: '#C0303A', stroke: '#7E1F26', sw: 2 },
        { e: 'circle', cx: 32, cy: 32, r: 19.5, fill: 'none', stroke: '#F6EFE2', sw: 5, dash: '8.5 8.8' },
        { e: 'circle', cx: 32, cy: 32, r: 11, fill: '#F6EFE2', stroke: '#7E1F26', sw: 1.4 },
        { e: 'text', x: 32, y: 33, s: 11, t: '$', fill: '#7E1F26' }
      ] },
      // stacked chip cluster (green stack, gold on top, stray red)
      { w: 56, vb: '0 0 72 64', pos: { top: '-46px', right: '-18px' }, parts: [
        { e: 'ellipse', cx: 30, cy: 50, rx: 21, ry: 7.5, fill: '#155229', stroke: '#0C3318', sw: 2 },
        { e: 'ellipse', cx: 30, cy: 43, rx: 21, ry: 7.5, fill: '#1F6B3A', stroke: '#0C3318', sw: 2 },
        { e: 'ellipse', cx: 30, cy: 36, rx: 21, ry: 7.5, fill: '#D4AF37', stroke: '#8C6D1A', sw: 2 },
        { e: 'ellipse', cx: 30, cy: 36, rx: 11, ry: 4, fill: '#F2E7C8', stroke: '#8C6D1A', sw: 1.2 },
        { e: 'ellipse', cx: 58, cy: 53, rx: 11, ry: 4.5, fill: '#C0303A', stroke: '#7E1F26', sw: 1.6 }
      ] },
      // A-spades playing-card corner
      { w: 40, vb: '0 0 64 80', pos: { top: '-52px', right: '28%' }, parts: [
        { e: 'rect', x: 10, y: 6, wd: 44, ht: 62, rx: 6, fill: '#FFFFFF', stroke: '#23242C', sw: 2.2 },
        { e: 'text', x: 20, y: 19, s: 15, t: 'A', fill: '#23242C' },
        { e: 'path', d: 'M32 30 C 27 38 22 41 22 46 C 22 50 26 52 30 50 C 29 54 27 56 25 58 L 39 58 C 37 56 35 54 34 50 C 38 52 42 50 42 46 C 42 41 37 38 32 30 Z', fill: '#23242C' }
      ] },
      // black VIP chip, gold ring
      { w: 42, vb: '0 0 64 64', pos: { left: '-18px', top: '24px' }, parts: [
        { e: 'circle', cx: 32, cy: 32, r: 24, fill: '#1B1B22', stroke: '#000000', sw: 2 },
        { e: 'circle', cx: 32, cy: 32, r: 19.5, fill: 'none', stroke: '#D4AF37', sw: 5, dash: '8.5 8.8' },
        { e: 'circle', cx: 32, cy: 32, r: 11, fill: '#D4AF37', stroke: '#8C6D1A', sw: 1.4 },
        { e: 'text', x: 32, y: 33, s: 9, t: '100', fill: '#1B1B22' }
      ] },
      // leaning chip pair (green + red)
      { w: 50, vb: '0 0 72 64', pos: { bottom: '20px', right: '-24px' }, parts: [
        { e: 'circle', cx: 26, cy: 36, r: 20, fill: '#1F6B3A', stroke: '#0C3318', sw: 2 },
        { e: 'circle', cx: 26, cy: 36, r: 16, fill: 'none', stroke: '#EAF6E4', sw: 4.4, dash: '7 7.6' },
        { e: 'circle', cx: 26, cy: 36, r: 9, fill: '#EAF6E4', stroke: '#0C3318', sw: 1.2 },
        { e: 'circle', cx: 52, cy: 44, r: 14, fill: '#C0303A', stroke: '#7E1F26', sw: 1.8 },
        { e: 'circle', cx: 52, cy: 44, r: 11, fill: 'none', stroke: '#F6EFE2', sw: 3.4, dash: '5 5.8' },
        { e: 'circle', cx: 52, cy: 44, r: 6, fill: '#F6EFE2', stroke: '#7E1F26', sw: 1 }
      ] },
      // gold high-roller chip
      { w: 44, vb: '0 0 64 64', pos: { top: '-46px', left: '38%' }, parts: [
        { e: 'circle', cx: 32, cy: 32, r: 24, fill: '#D4AF37', stroke: '#8C6D1A', sw: 2 },
        { e: 'circle', cx: 32, cy: 32, r: 19.5, fill: 'none', stroke: '#2A1810', sw: 5, dash: '8.5 8.8' },
        { e: 'circle', cx: 32, cy: 32, r: 11, fill: '#2A1810', stroke: '#8C6D1A', sw: 1.4 },
        { e: 'text', x: 32, y: 33, s: 10, t: '♠', fill: '#D4AF37' }
      ] }
    ],

    // ---- mermaid doodle poses (tail fins, shells, starfish, bubbles). Same
    //      object-part format as POKER. Rendered by richDoodleEl(). ----
    MERMAID: [
      // mermaid tail fluke
      { w: 46, vb: '0 0 64 64', pos: { top: '-50px', left: '30%' }, parts: [
        { e: 'path', d: 'M32 50 C 20 44 12 30 15 12 C 22 22 28 27 32 31 C 36 27 42 22 49 12 C 52 30 44 44 32 50 Z', fill: '#177287', stroke: '#0E4A5C', sw: 2 },
        { e: 'path', d: 'M26 40 C 28 33 30 28 31 25', fill: 'none', stroke: '#0E4A5C', sw: 1.6 },
        { e: 'path', d: 'M38 40 C 36 33 34 28 33 25', fill: 'none', stroke: '#0E4A5C', sw: 1.6 }
      ] },
      // scallop shell
      { w: 44, vb: '0 0 64 64', pos: { top: '-46px', right: '-16px' }, parts: [
        { e: 'path', d: 'M32 54 L 14 34 A 19 19 0 0 1 50 34 Z', fill: '#F8E3DA', stroke: '#C97A62', sw: 2.2 },
        { e: 'path', d: 'M32 54 L 21 26', fill: 'none', stroke: '#C97A62', sw: 1.6 },
        { e: 'path', d: 'M32 54 L 32 21', fill: 'none', stroke: '#C97A62', sw: 1.6 },
        { e: 'path', d: 'M32 54 L 43 26', fill: 'none', stroke: '#C97A62', sw: 1.6 }
      ] },
      // starfish
      { w: 42, vb: '0 0 64 64', pos: { top: '-46px', right: '30%' }, parts: [
        { e: 'path', d: 'M32 8 L38 24 L55 25 L42 36 L47 53 L32 43 L17 53 L22 36 L9 25 L26 24 Z', fill: '#FF7E67', stroke: '#D9553C', sw: 2 },
        { e: 'circle', cx: 32, cy: 30, r: 1.6, fill: '#D9553C' },
        { e: 'circle', cx: 27, cy: 35, r: 1.6, fill: '#D9553C' },
        { e: 'circle', cx: 37, cy: 35, r: 1.6, fill: '#D9553C' }
      ] },
      // bubble cluster drifting up
      { w: 40, vb: '0 0 64 90', pos: { left: '-16px', top: '22px' }, parts: [
        { e: 'circle', cx: 30, cy: 66, r: 10, fill: 'rgba(255,255,255,0.85)', stroke: '#5FB4CC', sw: 1.8 },
        { e: 'circle', cx: 42, cy: 46, r: 7, fill: 'rgba(255,255,255,0.85)', stroke: '#5FB4CC', sw: 1.8 },
        { e: 'circle', cx: 28, cy: 30, r: 5, fill: 'rgba(255,255,255,0.85)', stroke: '#5FB4CC', sw: 1.6 },
        { e: 'circle', cx: 40, cy: 16, r: 3.5, fill: 'rgba(255,255,255,0.85)', stroke: '#5FB4CC', sw: 1.4 },
        { e: 'path', d: 'M25 63 A 6 6 0 0 1 30 58', fill: 'none', stroke: '#BFE8F2', sw: 1.8 }
      ] },
      // little conch spiral
      { w: 38, vb: '0 0 64 64', pos: { bottom: '20px', right: '-20px' }, parts: [
        { e: 'path', d: 'M18 46 A 15 15 0 1 1 46 38 A 11 11 0 1 0 28 32 A 6 6 0 1 1 37 36', fill: 'none', stroke: '#C97A62', sw: 2.6 },
        { e: 'path', d: 'M18 46 L 12 54', fill: 'none', stroke: '#C97A62', sw: 2.6 }
      ] },
      // ridged clam with a pearl
      { w: 46, vb: '0 0 64 64', pos: { top: '-46px', left: '20%' }, parts: [
        { e: 'path', d: 'M10 28 A 22 18 0 0 1 54 28 A 22 9 0 0 0 10 28 Z', fill: '#FBE7DD', stroke: '#C97A62', sw: 2 },
        { e: 'path', d: 'M18 27 L 20 21', fill: 'none', stroke: '#C97A62', sw: 1.4 },
        { e: 'path', d: 'M26 26 L 27 19', fill: 'none', stroke: '#C97A62', sw: 1.4 },
        { e: 'path', d: 'M32 26 L 32 18', fill: 'none', stroke: '#C97A62', sw: 1.4 },
        { e: 'path', d: 'M38 26 L 39 19', fill: 'none', stroke: '#C97A62', sw: 1.4 },
        { e: 'path', d: 'M46 27 L 44 21', fill: 'none', stroke: '#C97A62', sw: 1.4 },
        { e: 'circle', cx: 32, cy: 31, r: 3.4, fill: '#FFFFFF', stroke: '#9FD9E8', sw: 1.2 }
      ] },
      // sand dollar
      { w: 38, vb: '0 0 64 64', pos: { top: '-42px', right: '-14px' }, parts: [
        { e: 'circle', cx: 32, cy: 32, r: 18, fill: '#F3E9D8', stroke: '#C9AE86', sw: 2 },
        { e: 'path', d: 'M32 20 L 32 32 M32 32 L 41 41 M32 32 L 23 41 M32 32 L 45 29 M32 32 L 19 29', fill: 'none', stroke: '#C9AE86', sw: 1.4 },
        { e: 'circle', cx: 32, cy: 32, r: 2, fill: '#C9AE86' }
      ] },
      // swaying seaweed
      { w: 34, vb: '0 0 48 72', pos: { bottom: '16px', left: '-14px' }, parts: [
        { e: 'path', d: 'M18 68 C 10 54 26 48 16 34 C 8 22 22 16 18 4', fill: 'none', stroke: '#1F8A5B', sw: 3 },
        { e: 'path', d: 'M27 68 C 33 56 21 50 31 38 C 37 28 27 22 31 12', fill: 'none', stroke: '#2AA36B', sw: 2.6 }
      ] },
      // coral scallop
      { w: 40, vb: '0 0 64 64', pos: { bottom: '18px', left: '30%' }, parts: [
        { e: 'path', d: 'M32 52 L 16 34 A 17 17 0 0 1 48 34 Z', fill: '#FBD9CE', stroke: '#E08A6E', sw: 2.2 },
        { e: 'path', d: 'M32 52 L 23 28', fill: 'none', stroke: '#E08A6E', sw: 1.5 },
        { e: 'path', d: 'M32 52 L 32 25', fill: 'none', stroke: '#E08A6E', sw: 1.5 },
        { e: 'path', d: 'M32 52 L 41 28', fill: 'none', stroke: '#E08A6E', sw: 1.5 }
      ] }
    ],

    shortCat: function (ind) {
      return ({
        'Brand & Marketing': 'Brand',
        'Growth & CRM': 'Growth',
        'PR & Partnerships': 'PR',
        'Video & Creative': 'Video',
        'Content & Copy': 'Content',
        'Creative Tech': 'Creative Tech',
        'Influencer': 'Influencer',
        'Social': 'Social'
      })[ind] || ind;
    },

    catList: function () {
      return [
        { label: 'All', match: 'all' },
        { label: 'Social', match: 'Social' },
        { label: 'Brand & Marketing', match: 'Brand & Marketing' },
        { label: 'Content & Copy', match: 'Content & Copy' },
        { label: 'Growth & CRM', match: 'Growth & CRM' },
        { label: 'PR & Partnerships', match: 'PR & Partnerships' },
        { label: 'Video & Creative', match: 'Video & Creative' },
        { label: 'Influencer', match: 'Influencer' },
        { label: 'Creative Tech', match: 'Creative Tech' }
      ];
    },

    payTier: function (pay) {
      if (!pay) return 'high';
      var nums = (String(pay).match(/\d+(?:\.\d+)?/g) || []).map(Number);
      if (!nums.length) return 'high';
      var top = Math.max.apply(null, nums);
      if (top >= 100) return 'high';
      if (top >= 80) return 'mid';
      return 'low';
    },

    matchesBase: function (j) {
      if (this.state.theme) {
        var def = this.themeDefs[this.state.theme];
        if (def) {
          var role = (j.role || '').toLowerCase();
          var inCat = def.cats.indexOf(j.ind) !== -1;
          var inKw = def.kw.some(function (k) { return role.indexOf(k) !== -1; });
          if (!inCat && !inKw) return false;
        }
      }
      var q = this.state.q.trim().toLowerCase();
      if (q) {
        var hay = (j.co + ' ' + j.role + ' ' + j.loc + ' ' + j.state).toLowerCase();
        if (j.state === 'NY') hay += ' nyc';
        if (hay.indexOf('san francisco') !== -1) hay += ' sf bay area';
        if (hay.indexOf('los angeles') !== -1) hay += ' la';
        if (hay.indexOf(q) === -1) {
          // A remote-from-ANYWHERE role (just "Remote", no fixed city/state) shows up for
          // ANY state search — you can do it from anywhere. A "New York · Remote" role has
          // a state attached, so it stays tied to that state and won't flood other searches.
          var loc = (j.loc || '').toLowerCase();
          var locNoRemote = loc.replace(/remote/g, '').replace(/[^a-z]+/g, ' ')
            .replace(/\b(us|usa|united states|anywhere|nationwide)\b/g, '').replace(/\s+/g, ' ').trim();
          var remoteAnywhere = loc.indexOf('remote') !== -1 && locNoRemote.length === 0;
          if (!(remoteAnywhere && suIsStateQuery(q))) return false;
        }
      }
      if (this.state.ws !== 'Any' && j.style !== this.state.ws) return false;
      if (this.state.st !== 'all' && j.state !== this.state.st && j.state !== 'Remote') return false; // remote roles always show for any selected state
      if (this.state.pr !== 'Any') {
        var t = this.payTier(j.pay);
        var want = this.state.pr === 'Under $80K' ? 'low' : (this.state.pr === '$80–99K' ? 'mid' : 'high');
        if (t !== want) return false;
      }
      return true;
    },

    toggleSave: function (key) {
      var saved = Object.assign({}, this.state.saved);
      if (saved[key]) delete saved[key]; else saved[key] = true;
      try { localStorage.setItem('su_saved_jobs', JSON.stringify(saved)); } catch (e) {}
      // analytics (js/analytics.js): log SAVES only, not unsaves — additive no-op without it
      if (saved[key] && typeof window.suTrack === 'function') {
        var sj = null;
        for (var si = 0; si < this.jobs.length; si++) {
          if (this.jobs[si].link === key) { sj = this.jobs[si]; break; }
        }
        window.suTrack('save', sj ? sj.co : '', sj ? sj.role : '', key);
      }
      this.setState({ saved: saved });
    },

    // apply a "Change Look?" theme, close the modal, and persist site-wide
    setLook: function (look) {
      // WW2 (cod) still archived. Mermaid re-enabled (Nic wants to see it on localhost).
      if (look !== 'girly' && look !== 'poker' && look !== 'mermaid' && look !== 'bratt' && look !== 'noir' && look !== 'beauty' && look !== 'chess') look = 'original';
      // analytics: look change — company = new look, role = previous look (additive)
      if (look !== this.state.look) {
        if (typeof window.suTrack === 'function') window.suTrack('look', look, this.state.look, '');
        logThemeTime();                       // record dwell on the look they're leaving
        THEME_CUR = look; THEME_T0 = Date.now();
        armThemeVote(look);                   // may prompt "do you like this look?" after 10 cards
      }
      try { localStorage.setItem('su_look', look); } catch (e) {}
      // Reflect the theme in the address bar so it's a copy-pasteable share link:
      // /jobs/casino, /jobs/blackcat, /jobs (original). Works with the Netlify /jobs/* rewrite.
      try {
        var slug = { poker:'casino', girly:'girlies', mermaid:'mermaid', bratt:'bratt', noir:'blackcat', beauty:'beauty', chess:'chess' }[look];
        var newPath = slug ? ('/jobs/' + slug) : '/jobs';
        if (window.history && history.replaceState) history.replaceState(null, '', newPath + (location.hash || ''));
      } catch (e) {}
      this.setState({ look: look, lookOpen: false });
    },

    // Build the doodle SVG markup (string) for a given pose index, mirroring doodleEl().
    doodleEl: function (idx) {
      var P = this.POSES[((idx % this.POSES.length) + this.POSES.length) % this.POSES.length];
      var h = Math.round(P.w * 90 / 64);
      var kids = P.parts.map(function (pt) {
        if (pt[0] === 'c') {
          return '<circle cx="' + pt[1] + '" cy="' + pt[2] + '" r="' + pt[3] + '"></circle>';
        }
        var strokeAttr = pt[2] ? ' stroke="#C2552F"' : '';
        return '<path d="' + pt[1] + '"' + strokeAttr + '></path>';
      }).join('');
      var svg = '<svg width="' + P.w + '" height="' + h + '" viewBox="0 0 64 90" fill="none" stroke="#2A2118" ' +
        'stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ' +
        'style="opacity:0.78; overflow:visible;">' + kids + '</svg>';
      var styl = 'position:absolute; pointer-events:none; z-index:4;';
      ['top', 'left', 'right', 'bottom'].forEach(function (k) {
        if (P.pos[k] != null) styl += ' ' + k + ':' + P.pos[k] + ';';
      });
      if (P.rot) styl += ' transform:rotate(' + P.rot + 'deg);';
      return '<div class="doodle" style="' + styl + '">' + svg + '</div>';
    },

    // WW2 doodle (string port of codDoodleEl): olive ink, supports rect ('r') parts.
    codDoodleEl: function (idx) {
      var D = this.MIL[((idx % this.MIL.length) + this.MIL.length) % this.MIL.length];
      var h = Math.round(D.w * 90 / 64);
      var kids = D.parts.map(function (pt) {
        if (pt[0] === 'c') return '<circle cx="' + pt[1] + '" cy="' + pt[2] + '" r="' + pt[3] + '"></circle>';
        if (pt[0] === 'r') return '<rect x="' + pt[1] + '" y="' + pt[2] + '" width="' + pt[3] + '" height="' + pt[4] + '" rx="' + (pt[5] || 1) + '"></rect>';
        return '<path d="' + pt[1] + '"></path>';
      }).join('');
      var svg = '<svg width="' + D.w + '" height="' + h + '" viewBox="0 0 64 90" fill="none" stroke="#D9DCC4" ' +
        'stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.82; overflow:visible;">' + kids + '</svg>';
      var styl = 'position:absolute; pointer-events:none; z-index:4;';
      ['top', 'left', 'right', 'bottom'].forEach(function (k) { if (D.pos[k] != null) styl += ' ' + k + ':' + D.pos[k] + ';'; });
      if (D.rot) styl += ' transform:rotate(' + D.rot + 'deg);';
      return '<div class="doodle" style="' + styl + '">' + svg + '</div>';
    },

    // girly doodle (string port of girlyDoodleEl): per-part fill/stroke + optional text.
    girlyDoodleEl: function (idx) {
      var D = this.GIRLY[((idx % this.GIRLY.length) + this.GIRLY.length) % this.GIRLY.length];
      var vb = D.vb || '0 0 64 90';
      var vbp = vb.split(' ').map(Number);
      var h = Math.round(D.w * vbp[3] / vbp[2]);
      var kids = D.parts.map(function (p) {
        if (p.e === 'circle') return '<circle cx="' + p.cx + '" cy="' + p.cy + '" r="' + p.r + '" fill="' + (p.fill || 'none') + '" stroke="' + (p.stroke || 'none') + '" stroke-width="' + (p.sw || 0) + '"></circle>';
        if (p.e === 'text') return '<text x="' + p.x + '" y="' + p.y + '" fill="' + (p.fill || '#2A2118') + '" font-size="' + (p.s || 13) + '" font-weight="800" font-family="Archivo, sans-serif" text-anchor="middle" dominant-baseline="central">' + esc(p.t) + '</text>';
        return '<path d="' + p.d + '" fill="' + (p.fill || 'none') + '" stroke="' + (p.stroke || 'none') + '" stroke-width="' + (p.sw || 0) + '" stroke-linejoin="round" stroke-linecap="round"></path>';
      }).join('');
      var svg = '<svg width="' + D.w + '" height="' + h + '" viewBox="' + vb + '" style="overflow:visible; filter:drop-shadow(0 2px 2px rgba(120,20,70,0.18));">' + kids + '</svg>';
      var styl = 'position:absolute; pointer-events:none; z-index:4;';
      ['top', 'left', 'right', 'bottom'].forEach(function (k) { if (D.pos[k] != null) styl += ' ' + k + ':' + D.pos[k] + ';'; });
      return '<div class="doodle" style="' + styl + '">' + svg + '</div>';
    },

    // shared renderer for the object-part decal tables (POKER / MERMAID): girly's
    // part format plus 'rect' (x/y/wd/ht/rx) and 'ellipse' (cx/cy/rx/ry) elements
    // and an optional 'dash' stroke-dasharray (the poker chips' edge rings).
    richDoodleEl: function (table, idx, shadow) {
      var D = table[((idx % table.length) + table.length) % table.length];
      var vb = D.vb || '0 0 64 90';
      var vbp = vb.split(' ').map(Number);
      var h = Math.round(D.w * vbp[3] / vbp[2]);
      var kids = D.parts.map(function (p) {
        var dash = p.dash ? ' stroke-dasharray="' + p.dash + '"' : '';
        if (p.e === 'circle') return '<circle cx="' + p.cx + '" cy="' + p.cy + '" r="' + p.r + '" fill="' + (p.fill || 'none') + '" stroke="' + (p.stroke || 'none') + '" stroke-width="' + (p.sw || 0) + '"' + dash + '></circle>';
        if (p.e === 'ellipse') return '<ellipse cx="' + p.cx + '" cy="' + p.cy + '" rx="' + p.rx + '" ry="' + p.ry + '" fill="' + (p.fill || 'none') + '" stroke="' + (p.stroke || 'none') + '" stroke-width="' + (p.sw || 0) + '"' + dash + '></ellipse>';
        if (p.e === 'rect') return '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.wd + '" height="' + p.ht + '" rx="' + (p.rx || 0) + '" fill="' + (p.fill || 'none') + '" stroke="' + (p.stroke || 'none') + '" stroke-width="' + (p.sw || 0) + '"' + dash + '></rect>';
        if (p.e === 'text') return '<text x="' + p.x + '" y="' + p.y + '" fill="' + (p.fill || '#2A2118') + '" font-size="' + (p.s || 13) + '" font-weight="800" font-family="Archivo, sans-serif" text-anchor="middle" dominant-baseline="central">' + esc(p.t) + '</text>';
        return '<path d="' + p.d + '" fill="' + (p.fill || 'none') + '" stroke="' + (p.stroke || 'none') + '" stroke-width="' + (p.sw || 0) + '"' + dash + ' stroke-linejoin="round" stroke-linecap="round"></path>';
      }).join('');
      var svg = '<svg width="' + D.w + '" height="' + h + '" viewBox="' + vb + '" style="overflow:visible; filter:drop-shadow(' + shadow + ');">' + kids + '</svg>';
      var styl = 'position:absolute; pointer-events:none; z-index:4;';
      ['top', 'left', 'right', 'bottom'].forEach(function (k) { if (D.pos[k] != null) styl += ' ' + k + ':' + D.pos[k] + ';'; });
      return '<div class="doodle" style="' + styl + '">' + svg + '</div>';
    },

    pokerDoodleEl: function (idx) { return this.richDoodleEl(this.POKER, idx, '0 3px 3px rgba(0,0,0,0.35)'); },

    mermaidDoodleEl: function (idx) {
      // light-skin-tone mermaid 🧜🏻‍♀️ (Nic wants the white-skin variant, not a silhouette)
      var left = (idx % 2 === 0);
      return '<div class="doodle" style="position:absolute; ' + (left ? 'top:-36px; left:6%;' : 'top:-32px; right:8%;') + ' pointer-events:none; z-index:4; transform:rotate(' + (left ? -9 : 8) + 'deg); font-size:30px; filter:drop-shadow(0 2px 3px rgba(10,70,90,0.4)); opacity:0.98;">🧜🏻‍♀️</div>';
    },

    // brat decor: album-cover-style scribbles + brat-era icons (black shades, vinyl record).
    // idx is a unique ascending ordinal (see dIdx) so text never repeats on screen.
    brattDoodleEl: function (idx) {
      var left = (idx % 2 === 0);
      var pos = left ? 'top:-32px; left:5%;' : 'top:-28px; right:7%;';
      var rot = left ? -8 : 7;
      var wrap = function (inner, extra) {
        return '<div class="doodle" style="position:absolute; ' + pos + ' pointer-events:none; z-index:4; transform:rotate(' + rot + 'deg); ' + (extra || '') + '">' + inner + '</div>';
      };
      var slot = ((idx % 6) + 6) % 6;
      if (slot === 1) {
        // black sunglasses (the brat-era shades)
        return wrap('🕶️', 'font-size:26px; opacity:0.95; filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35));');
      }
      if (slot === 4) {
        // a little vinyl record with a lime (brat) label
        return wrap('<span style="display:inline-block; width:27px; height:27px; border-radius:50%; background:radial-gradient(circle, #EDEDED 0 7%, #8ACE00 7% 20%, #141414 20% 100%); box-shadow:0 2px 4px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.06);"></span>', 'opacity:0.96;');
      }
      // brat-album-font text: lowercase, plain Arial, softly blurred like the cover.
      // 15 unique phrases indexed by the ordinal → nothing repeats across the whole board.
      var lines = ['fresh to the core', 'not rotten', 'brat summer', 'pure brat', '365 energy',
                   'party girl', 'lime green', 'so brat', 'it girl', 'no filter', 'club ready',
                   'raw + real', 'brat forever', 'no rules', 'stay brat'];
      var txt = lines[((idx % lines.length) + lines.length) % lines.length];
      return wrap(txt, 'font-family:Arial,Helvetica,sans-serif; font-weight:400; font-size:20px; color:#141414; opacity:0.9; white-space:nowrap; text-transform:lowercase; letter-spacing:-0.5px; filter:blur(0.4px);');
    },
    // noir decor: sleek black-luxury emoji
    noirDoodleEl: function (idx) {
      // luxe decor with a soft white glow so it shows on the matte-black board
      var emo = ['🐈‍⬛', '💎', '🥂', '✨'];
      var e = emo[((idx % emo.length) + emo.length) % emo.length];
      var left = (idx % 2 === 0);
      return '<div class="doodle" style="position:absolute; ' + (left ? 'top:-34px; left:7%;' : 'top:-30px; right:9%;') + ' pointer-events:none; z-index:4; transform:rotate(' + (left ? -10 : 8) + 'deg); font-size:26px; filter:drop-shadow(0 0 5px rgba(255,255,255,0.55)) drop-shadow(0 2px 3px rgba(0,0,0,0.5)); opacity:0.97;">' + e + '</div>';
    },
    // chess decor: black/white chess-piece glyphs, floated above the card on the marble board
    chessDoodleEl: function (idx) {
      var emo = ['♛', '♞', '♙', '♜', '♗', '♚']; // ♛ ♞ ♙ ♜ ♗ ♚
      var e = emo[((idx % emo.length) + emo.length) % emo.length];
      var left = (idx % 2 === 0);
      return '<div class="doodle" style="position:absolute; ' + (left ? 'top:-36px; left:7%;' : 'top:-32px; right:9%;') + ' pointer-events:none; z-index:4; transform:rotate(' + (left ? -8 : 7) + 'deg); font-size:32px; color:#141414; text-shadow:0 1px 0 #FFFFFF, 0 2px 4px rgba(0,0,0,0.28); opacity:0.92;">' + e + '</div>';
    },
    // beauty decor: lipstick / kiss / beauty emoji
    beautyDoodleEl: function (idx) {
      var emo = ['💄', '💋', '💅', '🎀'];
      var e = emo[((idx % emo.length) + emo.length) % emo.length];
      var left = (idx % 2 === 0);
      return '<div class="doodle" style="position:absolute; ' + (left ? 'top:-34px; left:7%;' : 'top:-30px; right:9%;') + ' pointer-events:none; z-index:4; transform:rotate(' + (left ? -10 : 9) + 'deg); font-size:26px; opacity:0.97;">' + e + '</div>';
    },

    // ---- the big one: compute everything needed to render (ports renderVals) ----
    computeShown: function () {
      var self = this;
      var base = this.jobs.filter(function (j) { return self.matchesBase(j); });
      var cat = this.state.cat;
      var shown = base.filter(function (j) { return cat === 'all' || j.ind === cat; });
      if (this.state.savedOnly) shown = shown.filter(function (j) { return !!self.state.saved[j.link]; });

      if (this.state.fr === 'Recently added') {
        // "Recently added" is a SORT, not a filter: show ALL roles, newest (highest sheet row) first
        shown = shown.slice().sort(function (a, b) { return (b._idx || 0) - (a._idx || 0); });
      }
      // ALWAYS lead with a 100K+ role so the first card carries the signature décor (all sort modes)
      var hiIdx = shown.findIndex(function (j) { return self.payTier(j.pay) === 'high'; });
      if (hiIdx > 0) { var moved = shown.splice(hiIdx, 1)[0]; shown.unshift(moved); }

      return { base: base, shown: shown };
    },

    setState: function (patch) {
      Object.assign(this.state, patch);
      this.render();
    },

    // =======================================================================
    // RENDER — rebuilds the whole .board markup, reproducing the template.
    // =======================================================================
    render: function () {
      var self = this;
      var board = document.getElementById('board');
      var sc = this.computeShown();
      var base = sc.base, shown = sc.shown;

      // ---- active "Change Look?" theme (ported from renderVals THEMES) ----
      var look = this.state.look;
      var cod = look === 'cod';
      var girly = look === 'girly';
      var poker = look === 'poker';
      var mermaid = look === 'mermaid';
      var bratt = look === 'bratt';
      var noir = look === 'noir';
      var beauty = look === 'beauty';
      var chess = look === 'chess';
      var P = this.THEMES[look] || this.THEMES.original;
      var ACC = P.acc, ACC_INK = P.accInk;
      var boardCls = P.cls, boardInk = P.ink, subInk = P.sub, payKeyInk = P.pay,
          showInk = P.show, navBg = P.navBg, navInk = P.navInk, HLC = P.hl;

      // recolor the board container + page gutter for the active theme
      board.className = 'board' + (boardCls ? ' ' + boardCls : '');
      board.style.color = boardInk;
      document.body.className = (look === 'original') ? '' : ('theme-' + look);

      // ---- categories panel rows (live counts) ----
      var catRowBase = "display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-radius:4px; font-family:'Indie Flower',cursive; font-size:18px; font-weight:700; cursor:pointer; transition:background .12s;";
      var catRowsHtml = this.catList().map(function (c) {
        var active = self.state.cat === c.match;
        var count = c.match === 'all' ? base.length : base.filter(function (j) { return j.ind === c.match; }).length;
        var rowStyle = catRowBase + (active ? ('background:' + ACC + '; color:' + ACC_INK + ';') : 'background:transparent; color:#3A2A1B;');
        var countStyle = "font-family:'Archivo',sans-serif; font-weight:700; font-size:12px;" + (active ? 'color:#6E5C30;' : 'color:#A8916B;');
        return '<div data-act="cat" data-val="' + esc(c.match) + '" style="' + rowStyle + '">' + esc(c.label) +
          '<span style="' + countStyle + '">' + count + '</span></div>';
      }).join('');

      // ---- work-style pills ----
      var pillBase = "padding:7px 14px; border-radius:4px; font-family:'Indie Flower',cursive; font-size:17px; font-weight:700; cursor:pointer; transition:transform .14s;";
      var workStylesHtml = ['Any', 'Remote', 'Hybrid', 'In-person'].map(function (s) {
        var active = self.state.ws === s;
        var st = pillBase + (active ? 'background:#2A2118; color:#F4E9C9;' : ('background:' + ACC + '; color:' + ACC_INK + ';'));
        return '<div data-act="ws" data-val="' + esc(s) + '" style="' + st + '">' + esc(s) + '</div>';
      }).join('');

      // ---- price pills ----
      var priceVals = ['Any', 'Under $80K', '$80–99K', '$100K+'];
      var pricesHtml = priceVals.map(function (p) {
        var active = self.state.pr === p;
        var st = pillBase + (active ? 'background:#2A2118; color:#F4E9C9;' : ('background:' + ACC + '; color:' + ACC_INK + ';'));
        return '<div data-act="pr" data-val="' + esc(p) + '" style="' + st + '">' + esc(p) + '</div>';
      }).join('');

      // ---- freshness pills ("Recently added") ----
      var freshHtml = ['Any', 'Recently added'].map(function (f) {
        var active = self.state.fr === f;
        var st = pillBase + (active ? 'background:#2A2118; color:#F4E9C9;' : ('background:' + ACC + '; color:' + ACC_INK + ';'));
        return '<div data-act="fr" data-val="' + esc(f) + '" style="' + st + '">' + esc(f) + '</div>';
      }).join('');

      // ---- per-card decoration computation (ported verbatim) ----
      var rots = [-2, 1.6, -1, 2, -1.5, 1.1, -1.8, 1.3, -0.8, 1.7];
      var noteFor = {};
      if (shown.length >= 6) {
        var nci = 0;
        for (var r = 0; r * 3 < shown.length; r++) {
          if (r % 2 !== 0) continue;
          var i = r * 3;
          if (i < shown.length && self.payTier(shown[i].pay) === 'high') { noteFor[i] = self.NOTES[nci % self.NOTES.length]; nci++; }
        }
      }

      var cardsHtml = shown.map(function (j, k) {
        var id = self.jobs.indexOf(j);
        var key = j.link;
        var saved = !!self.state.saved[key];
        var tier = self.payTier(j.pay);
        var rot = rots[k % rots.length];
        // high-pay cards take their ink/bg/apply/stamp from the active theme palette;
        // poker/mermaid also override the sub-$100K cards (white playing card / pearl)
        var ink = (tier === 'high') ? P.hiInk : (tier === 'mid' && P.midInk) ? P.midInk : (P.baseInk || '#3A2A1B');
        var bg = tier === 'low'
          ? (P.lowCard || 'linear-gradient(160deg,#ECDEC6 0%,#E0D0B2 100%)')
          : tier === 'mid'
          ? (P.midCard || 'linear-gradient(160deg,#E0CBA2 0%,#D3BB8C 100%)')
          : P.hiCard;
        var applyColor = (tier === 'high') ? P.hiApply : (tier === 'mid' && P.midApply) ? P.midApply : (P.baseApply || '#D8502E');
        var stampColor = (tier === 'high') ? P.hiStamp : (tier === 'mid' && P.midStamp) ? P.midStamp : (P.baseStamp || '#3A2A1B');
        var gStamp = (tier === 'high') ? '#FFFFFF' : '#C24A78'; // girly heart-stamp color
        var hasNote = !!noteFor[k];
        var slot = k % 6;
        var pin = !hasNote && slot === 0;
        var tape = !hasNote && slot === 2;
        var doodleOn = !hasNote && slot === 4;
        var pick = !!j.pick;
        // featured picks get the theme's VIP card when it defines one
        // (poker = black + gold casino card, mermaid = deep-sea teal + pearl)
        if (pick && P.pickCard) {
          bg = P.pickCard; ink = P.pickInk;
          applyColor = P.pickApply; stampColor = P.pickStamp;
        }
        var pickBadgeColor = P.pickBadge || '#D8502E';
        var pinPalette = ['#3E7BBF', '#C9A23A', '#7A9A4E'];
        var pinColor = pinPalette[k % 3];

        var noteState = self.state.openNotes[id]; // undefined | 'open' | 'closing' | 'done'
        var isOpening = (noteState === 'open' || noteState === 'closing');

        var metaTop = [j.loc, j.style, (j.exp && j.exp !== 'See posting' ? j.exp : null)].filter(Boolean).join('  ·  ');

        var noteStyle = '--rot:' + rot + 'deg; cursor:pointer; position:relative; background:' + bg +
          '; color:' + ink + '; border-radius:3px; padding:30px 24px 22px; box-sizing:border-box; display:flex; ' +
          'flex-direction:column; min-height:238px;' + (isOpening ? ' position:relative; z-index:60;' : '');

        var bmColor = girly ? (saved ? '#FFFFFF' : 'none') : (saved ? '#D8502E' : 'none');
        var bmStroke = girly ? '#FFFFFF' : (saved ? '#D8502E' : ink);

        var showEnvelope = hasNote && !noteState;
        var noteOpen = hasNote && (noteState === 'open' || noteState === 'closing');
        var noteAnim = noteState === 'closing' ? 'noteFold .3s ease forwards' : 'noteUnfold .34s cubic-bezier(.2,.9,.3,1.25) both';
        var showVerified = !hasNote || noteState === 'done';
        var stampClass = (hasNote && noteState === 'done') ? 'stampfade' : '';
        var noteRot = (k % 2 === 0 ? 4 : -4);
        var personalNote = noteFor[k] || null;

        var doodleHtml = '';
        // dIdx = a UNIQUE, ascending ordinal per doodle on screen (top card = 0, then 1,2,3…).
        // Prevents décor from repeating (Nic: brat scribbles must never say the same thing twice).
        var dIdx = (k === 0) ? 0 : (Math.floor(k / 6) + 1);
        if (k === 0 || doodleOn) {
          doodleHtml = cod ? self.codDoodleEl(dIdx) : girly ? self.girlyDoodleEl(dIdx) : poker ? self.pokerDoodleEl(dIdx) : mermaid ? self.mermaidDoodleEl(dIdx) : bratt ? self.brattDoodleEl(dIdx) : noir ? self.noirDoodleEl(dIdx) : beauty ? self.beautyDoodleEl(dIdx) : chess ? self.chessDoodleEl(dIdx) : self.doodleEl(k === 0 ? 13 : k);
        }

        var pinStyle = 'position:absolute; top:-9px; left:50%; transform:translateX(-50%); width:17px; height:17px; ' +
          'border-radius:50%; background:radial-gradient(circle at 35% 30%, rgba(255,255,255,.7), ' + pinColor +
          ' 58%); box-shadow:0 3px 5px rgba(0,0,0,.32); z-index:3;';

        // -- build the card HTML (mirrors the template's sc-if branches) --
        var html = '<div class="note' + (k === 0 ? ' note-first' : '') + '" data-act="openJob" data-id="' + id + '" data-link="' + esc(j.link) + '" data-co="' + esc(j.co) + '" style="' + noteStyle + '">';

        // envelope ("open" tab)
        if (showEnvelope) {
          html += '<div data-act="openNote" data-id="' + id + '" class="notetab" style="--nr: ' + noteRot + 'deg; position: absolute; bottom: -26px; left: 16px; z-index: 8; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; transform: rotate(' + noteRot + 'deg); white-space: nowrap;">' +
            '<div class="envbob" style="position: relative; width: 80px; height: 58px; background-color: #FCFAF3; background-image: repeating-linear-gradient(180deg, transparent 0 13px, rgba(96,130,170,0.34) 13px 14px); background-position: 0 9px; border-radius: 3px; box-shadow: 2px 5px 9px rgba(44,33,24,0.28); flex: none; overflow: hidden;">' +
              '<div style="position: absolute; top: 0; bottom: 0; left: 13px; width: 1px; background: rgba(214,80,46,0.4);"></div>' +
              '<div style="position: absolute; top: 0; right: 0; width: 22px; height: 22px; background: #E6D6B2; clip-path: polygon(100% 0, 0 0, 100% 100%); border-top-right-radius: 3px;"></div>' +
              '<span style="position: absolute; inset: 0; padding-left: 9px; display: flex; align-items: center; justify-content: center; font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 20px; color: #2A2118;">open</span>' +
            '</div>' +
            '<svg width="34" height="30" viewBox="0 0 34 30" fill="none" style="flex: none; overflow: visible;"><path d="M31 7 C 28 22, 17 29, 5 25" stroke="#C2552F" stroke-width="2.4" stroke-linecap="round"></path><path d="M9.5 20 L4 25 L11 27.5" stroke="#C2552F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
          '</div>';
        }

        // open note (handwritten paper)
        if (noteOpen) {
          html += '<div style="position: absolute; bottom: -22px; left: -16px; z-index: 9; transform: rotate(' + noteRot + 'deg); transform-origin: bottom left;">' +
            '<div style="position: relative; width: 178px; background-color: #FCFAF3; background-image: repeating-linear-gradient(180deg, transparent 0 21px, rgba(96,130,170,0.34) 21px 22px); background-position: 0 16px; border-radius: 2px; padding: 13px 14px 12px; box-shadow: 3px 7px 17px rgba(44,33,24,0.3); box-sizing: border-box; transform-origin: bottom left; animation: ' + noteAnim + ';">' +
              '<div style="position: absolute; top: 0; left: 14px; bottom: 0; width: 1px; background: rgba(214,80,46,0.4);"></div>' +
              '<div style="position: absolute; top: -8px; left: 50%; transform: translateX(-50%) rotate(-3deg); width: 56px; height: 15px; background: rgba(228,202,128,0.6); box-shadow: 0 1px 2px rgba(0,0,0,.08);"></div>' +
              '<div data-act="closeNote" data-id="' + id + '" style="position: absolute; top: -9px; right: -9px; width: 23px; height: 23px; border-radius: 50%; background: #2C2118; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.32); z-index: 4;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#F4EFE6" stroke-width="2.6" stroke-linecap="round"></path></svg></div>' +
              '<div style="font-family: \'Indie Flower\', cursive; font-size: 14.5px; line-height: 22px; color: #2A2118; padding-left: 8px;">' + esc(personalNote) + '</div>' +
              '<div style="font-family: \'Indie Flower\', cursive; font-size: 14px; color: #6F5E45; text-align: right; line-height: 22px;">- Nic</div>' +
            '</div>' +
          '</div>';
        }

        // doodle
        html += doodleHtml;

        // pin
        if (pin) html += '<div style="' + pinStyle + '"></div>';
        // tape
        if (tape) html += '<div style="position: absolute; top: -11px; left: 50%; transform: translateX(-50%) rotate(-3deg); width: 84px; height: 24px; background: rgba(228,202,128,0.6); border-left: 1px dashed rgba(255,255,255,.5); border-right: 1px dashed rgba(255,255,255,.5); box-shadow: 0 1px 2px rgba(0,0,0,.1); z-index: 3;"></div>';
        // pick badge
        if (pick) html += '<div style="position: absolute; top: -17px; left: -10px; transform: rotate(-13deg); font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 24px; color: ' + pickBadgeColor + '; z-index: 4; white-space: nowrap;">pick! ★</div>';

        // bookmark button
        html += '<div data-act="toggleSave" data-link="' + esc(j.link) + '" class="bmbtn" style="position: absolute; top: 14px; right: 14px; z-index: 5; cursor: pointer; display: flex; align-items: center; justify-content: center; flex: none;">' +
          '<svg width="19" height="19" viewBox="0 0 24 24" fill="' + bmColor + '" stroke="' + bmStroke + '" stroke-width="1.7"><path d="M6 3.5h12a.8.8 0 0 1 .8.8v16.2l-6.8-3.9-6.8 3.9V4.3a.8.8 0 0 1 .8-.8z"></path></svg>' +
        '</div>';

        // company + role
        html += '<div style="display: flex; align-items: flex-start; gap: 10px; padding-right: 30px;">' +
            '<div class="card-co" title="' + esc(j.co) + '" style="font-family: \'Archivo Black\', \'Archivo\', sans-serif; font-weight: 900; font-size: 23px; line-height: 1.13; letter-spacing: -0.4px;"><span style="">' + esc(j.co) + '</span></div>' +
          '</div>' +
          '<div class="card-role" title="' + esc(j.role) + '" style="font-family: \'Archivo\', sans-serif; font-weight: 600; font-size: 16.5px; margin-top: 9px; line-height: 1.3;">' + esc(j.role) + '</div>' +
          '<div style="flex: 1; min-height: 18px;"></div>' +
          '<div style="font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 24px; letter-spacing: -0.4px;">' + esc(j.pay) + '</div>' +
          '<div style="font-size: 14.5px; opacity: 0.85; line-height: 1.5; font-family: \'Poppins\', sans-serif; margin-top: 5px;">' + esc(metaTop) + '</div>';

        // verified stamp + apply link row (per-theme variant, ported verbatim)
        html += '<div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16px; min-height: 24px;">';
        if (showVerified) {
          if (!girly) {
            // original = outlined circle-check; WW2 (cod) = starred dashed-circle stamp
            var stampIcon = cod
              ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="flex: none;"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="53 10" stroke-dashoffset="20"></circle><path d="M12 5.2 L13.59 9.82 L18.47 9.9 L14.57 12.83 L16 17.5 L12 14.7 L8 17.5 L9.43 12.83 L5.53 9.9 L10.41 9.82 Z" fill="currentColor"></path></svg>'
              : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" style="flex: none;"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.4"></circle><path d="M8.3 12.2l2.4 2.4 4.9-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
            html += '<div class="' + stampClass + '" style="display: inline-flex; align-items: center; gap: 5px; border: 1.6px solid; color: ' + stampColor + '; border-radius: 4px; padding: 3px 8px; transform: rotate(-4deg); font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; opacity: 0.72;">' +
              stampIcon +
              'Human-verified' +
            '</div>';
          } else {
            // girly = pink rounded stamp with a heart on each side
            var heart = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="flex: none;"><path d="M12 21s-7.5-4.7-10-9.2C.5 8.6 2 5 5.3 5c2 0 3.3 1.2 4.7 3 1.4-1.8 2.7-3 4.7-3C18 5 19.5 8.6 22 11.8 19.5 16.3 12 21 12 21z"></path></svg>';
            html += '<div class="' + stampClass + '" style="display: inline-flex; align-items: center; gap: 6px; border: 2px solid ' + gStamp + '; color: ' + gStamp + '; border-radius: 14px; padding: 3px 11px; transform: rotate(-4deg); font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 12.5px; opacity: 0.95;">' +
              heart + 'Human Verified' + heart +
            '</div>';
          }
        }
        html += '<a class="applylink2" href="' + esc(j.link) + '" target="_blank" rel="noopener" data-act="apply" data-co="' + esc(j.co) + '" style="font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 15.5px; color: ' + applyColor + '; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; margin-left: auto;">apply<svg class="doodle-arrow" width="28" height="14" viewBox="0 0 28 14" fill="none" style="overflow: visible; margin-left: 2px;"><path d="M1 7 C 8 2.5, 15 2.5, 24 6.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></path><path d="M18.5 2.6 L25.5 6.9 L19 11.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg></a>';
        html += '</div>';

        html += '</div>'; // .note
        return html;
      }).join('');

      // ---- states list for the <select> ----
      var states = Array.from(new Set(this.jobs.map(function (j) { return j.state; }))).sort();
      var savedCount = Object.keys(this.state.saved).filter(function (k) { return self.state.saved[k]; }).length;

      var savedBtnBase = "font-family:'Indie Flower',cursive; font-weight:700; font-size:19px; padding:11px 17px; transform:rotate(3deg); box-shadow:2px 4px 9px rgba(44,33,24,0.2); white-space:nowrap; position:relative; top:8px; flex:none; cursor:pointer; border-radius:2px;";
      var savedBtnStyle = savedBtnBase + (this.state.savedOnly ? 'background:#2A2118; color:#F4E9C9;' : ('background:' + ACC + '; color:' + ACC_INK + ';'));
      // digits render clearer in Archivo than in Indie Flower (Nic, 2026-07-11); cap at 99+
      var savedNum = '<span style="font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 16px; letter-spacing: 0;">' + (savedCount > 99 ? '99+' : savedCount) + '</span>';
      var savedLabel = this.state.savedOnly ? ('Saved (' + savedNum + ') ✕') : ('Saved (' + savedNum + ')');

      // "Change Look?" toolbar button (base + open/closed colors, ported verbatim)
      var changeLookBtnBase = "display:inline-flex; align-items:center; gap:7px; font-family:'Indie Flower',cursive; font-weight:700; font-size:19px; padding:11px 16px; transform:rotate(-3deg); box-shadow:2px 4px 9px rgba(44,33,24,0.2); white-space:nowrap; position:relative; top:8px; flex:none; cursor:pointer; border-radius:2px;";
      var changeLookBtnStyle = changeLookBtnBase + (this.state.lookOpen ? 'background:#2A2118; color:#F4E9C9;' : 'background:#E7D2A8; color:#3A2A1B;');

      var curCat = this.catList().find(function (c) { return c.match === self.state.cat; }) || this.catList()[0];
      var catBtnLabel = this.state.cat === 'all' ? 'all roles' : curCat.label;
      var filterCount = (this.state.ws !== 'Any' ? 1 : 0) + (this.state.st !== 'all' ? 1 : 0) + (this.state.pr !== 'Any' ? 1 : 0) + (this.state.fr !== 'Any' ? 1 : 0);

      var btnBase = "display:inline-flex; align-items:center; gap:7px; padding:9px 15px; border-radius:4px; font-family:'Indie Flower',cursive; font-size:18px; font-weight:700; cursor:pointer; white-space:nowrap; box-shadow:1px 2px 6px rgba(44,33,24,0.16);";
      var catBtnStyle = btnBase + 'transform:rotate(-2deg);' + (this.state.openPanel === 'cat' || this.state.cat !== 'all'
        ? 'background:#2A2118; color:#F4E9C9;' : ('background:' + ACC + '; color:' + ACC_INK + ';'));
      var filterBtnStyle = btnBase + 'transform:rotate(1.5deg);' + (this.state.openPanel === 'filters' || filterCount > 0
        ? 'background:#2A2118; color:#F4E9C9;' : 'background:#E7D2A8; color:#3A2A1B;');

      var filterBadge = filterCount > 0 ? String(filterCount) : '';
      var filterBadgeStyle = filterCount > 0
        ? 'display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 5px; box-sizing:border-box; border-radius:999px; background:#D8502E; color:#fff; font-size:11px; font-weight:700;'
        : 'display:none;';

      // ---- active chips ----
      var chips = [];
      if (this.state.theme && this.themeDefs[this.state.theme]) chips.push({ label: this.themeDefs[this.state.theme].label, act: 'chipTheme' });
      if (this.state.ws !== 'Any') chips.push({ label: this.state.ws, act: 'chipWs' });
      if (this.state.pr !== 'Any') chips.push({ label: this.state.pr, act: 'chipPr' });
      if (this.state.fr !== 'Any') chips.push({ label: this.state.fr, act: 'chipFr' });
      if (this.state.st !== 'all') chips.push({ label: this.state.st, act: 'chipSt' });

      var chipsHtml = chips.map(function (chip) {
        return '<div data-act="' + chip.act + '" style="display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; cursor: pointer; background: ' + ACC + '; color: ' + ACC_INK + '; font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 16px; transform: rotate(-1.5deg); box-shadow: 1px 2px 5px rgba(44,33,24,0.16);">' + esc(chip.label) +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="flex: none;"><path d="M6 6l12 12M18 6L6 18" stroke="' + ACC_INK + '" stroke-width="2.6" stroke-linecap="round"></path></svg></div>';
      }).join('');

      var showingLabel = this.state.savedOnly ? ('Showing ' + shown.length + ' saved') : ('Showing ' + shown.length + ' of ' + this.jobs.length);
      var emptyTitle = this.state.savedOnly ? 'no saved roles yet' : "We're looking for more jobs RN, check back soon!";
      var emptyHint = this.state.savedOnly ? 'tap the bookmark on any card to pin it here' : 'try clearing a filter, or check back in a few days';
      var isEmpty = shown.length === 0;

      // ---- state <select> options ----
      var stateOpts = '<option value="all" style="background:#FFFDF5; color:#3A2A1B;"' + (this.state.st === 'all' ? ' selected' : '') + '>all states</option>' +
        states.map(function (s) {
          return '<option value="' + esc(s) + '" style="background:#FFFDF5; color:#3A2A1B;"' + (self.state.st === s ? ' selected' : '') + '>' + esc(s) + '</option>';
        }).join('');

      // =====================================================================
      // Assemble the full board markup (mirrors the original template order).
      // =====================================================================
      var out = '';

      // top nav
      out += '<div style="max-width: 1240px; margin: 0 auto; padding: 26px 40px 0; position: relative; height: 100px; box-sizing: border-box;">' +
        '<div data-act="openModal" class="aboutcard" style="position: absolute; top: 22px; left: 40px; display: flex; align-items: center; gap: 12px; background: #E7D2A8; border-radius: 16px; padding: 9px 16px 9px 9px; cursor: pointer; box-shadow: 0 6px 18px rgba(44,33,24,0.16);">' +
          '<div style="width: 66px; height: 42px; border-radius: 11px; overflow: hidden; flex: none;">' +
            '<img src="assets/5037150f-ce24-477c-bae7-ef884fbc5849.jpg" alt="Nic" style="width: 100%; height: 100%; object-fit: cover; object-position: 50% 16%; transform: scale(1.55); transform-origin: 50% 26%;">' +
          '</div>' +
          '<div style="line-height: 1.2;">' +
            '<div style="font-size: 14px; font-weight: 700; color: #2A2118; font-family: \'Archivo\', sans-serif;">Nic, the founder</div>' +
            '<div style="font-size: 11px; font-weight: 500; color: #6F5E45; margin-top: 2px; font-family: \'Archivo\', sans-serif;">Currently at Instagram making 6 figures</div>' +
          '</div>' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="flex: none; margin-left: 2px;"><path d="M9 6l6 6-6 6" stroke="#6F5E45" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
        '</div>' +
        // the row div carries the theme nav colors as CSS vars so class-styled
        // anchors recolor with the look too
        '<div style="position: absolute; top: 22px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 18px; --su-nav-bg: ' + navBg + '; --su-nav-ink: ' + navInk + ';">' +
          '<a href="./index.html" class="postit" style="--r: -3deg; background: ' + navBg + '; color: ' + navInk + '; font-family: \'Indie Flower\', cursive; font-size: 21px; letter-spacing: 0.01em; padding: 10px 20px; cursor: pointer; text-decoration: none; display: inline-block;">Home</a>' +
          '<a href="./jobs.html" class="postit" style="--r: 2.5deg; background: ' + navBg + '; color: ' + navInk + '; font-family: \'Indie Flower\', cursive; font-size: 21px; letter-spacing: 0.01em; padding: 10px 20px; cursor: pointer; text-decoration: none; display: inline-block;">Jobs</a>' +
          // Tracker tab removed Jul 3 2026 (Nic) — tracker.html + tracker.js + trackerLog() stay
          // in the repo but unlinked, so there's no UI way to reach it while we rework it.
          '<a href="./tracker.html" class="postit" style="--r: -2deg; background: ' + navBg + '; color: ' + navInk + '; font-family: \'Indie Flower\', cursive; font-size: 21px; letter-spacing: 0.01em; padding: 10px 20px; cursor: pointer; text-decoration: none;">Tracker' + suTrkBadge() + '</a>' +
        '</div>' +
      '</div>';

      // header
      out += '<div style="max-width: 1240px; margin: 0 auto; padding: 30px 40px 0; box-sizing: border-box;">' +
        '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;">' +
          '<div style="position: relative;">' +
            '<div style="font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 22px; color: ' + (girly ? '#D6277E' : '#C2552F') + '; transform: rotate(-2deg); display: inline-block;">★ StillUnemployed.com</div>' +
            '<h1 style="font-family: \'Archivo Black\', \'Archivo\', sans-serif; font-weight: 900; font-size: 66px; line-height: 0.95; letter-spacing: -0.03em; color: ' + boardInk + '; margin: 8px 0 0; max-width: 760px;">Roles I\'d <span style="-webkit-box-decoration-break: clone; box-decoration-break: clone; padding: 0 .12em; background: linear-gradient(98deg, transparent 1.5%, ' + HLC + ' 1.5% 98.5%, transparent 98.5%); background-repeat: no-repeat; background-size: 100% 62%; background-position: 0 80%;">actually</span> apply to.</h1>' +
            '<div class="board-subtitle" style="font-family: \'Indie Flower\', cursive; font-size: 22px; color: ' + subInk + '; margin-top: 14px; transform: rotate(-0.6deg);">opened &amp; checked by a human (me) · updated weekly →</div>' +
          '</div>' +
          '<div style="display: flex; align-items: flex-start; gap: 12px; flex: none;">' +
            '<div data-act="openLook" class="tab" style="' + changeLookBtnStyle + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex: none;"><path d="M4 7l5-3 6 3 5-3v13l-5 3-6-3-5 3V7z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"></path><path d="M9 4v13M15 7v13" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"></path></svg>change theme</div>' +
            '<div data-act="toggleSavedOnly" class="tab" style="' + savedBtnStyle + '">' + savedLabel + '</div>' +
          '</div>' +
        '</div>';

      // toolbar
      out += '<div style="position: relative; margin-top: 30px; z-index: 40;">' +
        '<div style="display: flex; align-items: center; gap: 12px; background: #FBF6E9; border: 1.5px solid #E0CFA8; border-radius: 5px; padding: 11px 11px 11px 18px; box-shadow: 2px 4px 11px rgba(44,33,24,0.10); transform: rotate(-0.4deg);">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="flex: none;"><circle cx="11" cy="11" r="7" stroke="#A8825F" stroke-width="2"></circle><path d="M20 20l-3.2-3.2" stroke="#A8825F" stroke-width="2" stroke-linecap="round"></path></svg>' +
          '<input id="su-search" value="' + esc(this.state.q) + '" placeholder="search a company, role or city..." style="flex: 1; min-width: 80px; border: none; outline: none; background: transparent; font-family: \'Indie Flower\', cursive; font-size: 20px; color: #2C2118;">' +
          '<div data-act="toggleCat" class="tab" style="' + catBtnStyle + '">' + esc(catBtnLabel) + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex: none; opacity: .7;"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg></div>' +
          '<div data-act="toggleFilters" class="tab" style="' + filterBtnStyle + '"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="flex: none;"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></path></svg>filters<span style="' + filterBadgeStyle + '">' + esc(filterBadge) + '</span></div>' +
        '</div>';

      // category panel
      if (this.state.openPanel === 'cat') {
        out += '<div style="position: absolute; right: 92px; top: calc(100% + 12px); width: 268px; background: #FBF6E9; border: 1.5px dashed #CDB88C; border-radius: 6px; box-shadow: 4px 8px 22px -8px rgba(44,33,24,0.4); padding: 10px; display: flex; flex-direction: column; gap: 2px; transform: rotate(-0.8deg);">' +
          '<div style="font-family: \'Indie Flower\', cursive; font-size: 16px; color: #A8825F; padding: 2px 6px 6px;">pick a lane ↓</div>' +
          catRowsHtml +
        '</div>';
      }

      // filters panel
      if (this.state.openPanel === 'filters') {
        out += '<div style="position: absolute; right: 0; top: calc(100% + 12px); width: 320px; background: #FBF6E9; border: 1.5px dashed #CDB88C; border-radius: 6px; box-shadow: 4px 8px 22px -8px rgba(44,33,24,0.4); padding: 18px 18px 20px; transform: rotate(0.6deg);">' +
          '<div data-act="toggleFilters" style="position: absolute; top: 12px; right: 12px; width: 26px; height: 26px; border-radius: 50%; background: rgba(44,33,24,0.07); display: flex; align-items: center; justify-content: center; cursor: pointer;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#5C4033" stroke-width="2.6" stroke-linecap="round"></path></svg></div>' +
          '<div style="font-family: \'Indie Flower\', cursive; font-size: 19px; color: #2A2118;">how fresh?</div>' +
          '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 11px;">' + freshHtml + '</div>' +
          '<div style="font-family: \'Indie Flower\', cursive; font-size: 19px; color: #2A2118; margin-top: 18px;">how do you wanna work?</div>' +
          '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 11px;">' + workStylesHtml + '</div>' +
          '<div style="font-family: \'Indie Flower\', cursive; font-size: 19px; color: #2A2118; margin-top: 18px;">what\'s the pay?</div>' +
          '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 11px;">' + pricesHtml + '</div>' +
          '<div style="font-family: \'Indie Flower\', cursive; font-size: 19px; color: #2A2118; margin-top: 18px;">which state?</div>' +
          '<select id="su-state" style="width: 100%; box-sizing: border-box; font-family: \'Indie Flower\', cursive; font-size: 17px; color: #3A2A1B; background: #F2E14B; border: 1.5px solid #DAC36A; border-radius: 5px; padding: 9px 12px; cursor: pointer; outline: none; margin-top: 11px;">' + stateOpts + '</select>' +
          '<div data-act="clearAll" style="margin-top: 18px; font-family: \'Indie Flower\', cursive; font-size: 17px; color: #B23A1E; cursor: pointer;">↺ reset all filters</div>' +
        '</div>';
      }

      out += '</div>'; // /toolbar relative wrap

      // salary color key
      out += '<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; margin-top: 16px;">' +
        '<span class="pay-key-label" style="font-family: \'Indie Flower\', cursive; font-size: 17px; color: ' + payKeyInk + ';">pay key →</span>' +
        '<div style="display: flex; align-items: center; gap: 7px;"><span style="width: 16px; height: 16px; border-radius: 3px; background: ' + (P.lowCard || 'linear-gradient(160deg,#ECDEC6,#E0D0B2)') + '; box-shadow: 1px 1px 2px rgba(44,33,24,.18);"></span><span style="font-family: \'Indie Flower\', cursive; font-size: 17px; color: ' + boardInk + ';">under $80K</span></div>' +
        '<div style="display: flex; align-items: center; gap: 7px;"><span style="width: 16px; height: 16px; border-radius: 3px; background: ' + (P.midCard || 'linear-gradient(160deg,#E0CBA2,#D3BB8C)') + '; box-shadow: 1px 1px 2px rgba(44,33,24,.18);"></span><span style="font-family: \'Indie Flower\', cursive; font-size: 17px; color: ' + boardInk + ';">$80–99K</span></div>' +
        '<div style="display: flex; align-items: center; gap: 7px;"><span style="width: 16px; height: 16px; border-radius: 3px; background: ' + P.payHi + '; box-shadow: 1px 1px 2px rgba(44,33,24,.18);"></span><span style="font-family: \'Indie Flower\', cursive; font-size: 17px; color: ' + boardInk + ';">$100K+</span></div>' +
      '</div>';

      // active filter row
      out += '<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 18px; min-height: 30px;">' +
        chipsHtml +
        '<div style="margin-left: auto; font-family: \'Indie Flower\', cursive; font-size: 18px; color: ' + showInk + ';">' + esc(showingLabel) + '</div>' +
      '</div>';

      // saved section title
      if (this.state.savedOnly) {
        out += '<div style="display: flex; align-items: center; gap: 14px; margin-top: 30px; padding: 0 8px;">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="#D8502E" style="flex: none;"><path d="M6 3.5h12a.8.8 0 0 1 .8.8v16.2l-6.8-3.9-6.8 3.9V4.3a.8.8 0 0 1 .8-.8z"></path></svg>' +
          '<div style="font-family: \'Archivo Black\', \'Archivo\', sans-serif; font-weight: 900; font-size: 34px; letter-spacing: -0.02em; color: ' + boardInk + ';">Saved Section</div>' +
          '<div style="flex: 1; height: 2px; background: repeating-linear-gradient(90deg, rgba(44,33,24,0.22) 0 8px, transparent 8px 14px);"></div>' +
        '</div>';
      }

      // card grid
      out += '<div class="job-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(298px, 1fr)); gap: 54px 40px; margin-top: 32px; padding: 12px 8px 0;">' +
        cardsHtml +
      '</div>';

      // empty state
      if (isEmpty) {
        out += '<div style="display: flex; justify-content: center; padding: 64px 20px 48px;">' +
          '<div style="position: relative; width: 560px; max-width: 100%; background-color: #FCFAF3; background-image: repeating-linear-gradient(180deg, transparent 0 39px, rgba(96,130,170,0.30) 39px 40.5px); background-position: 0 38px; border-radius: 3px; box-shadow: 4px 12px 30px rgba(44,33,24,0.24); padding: 44px 48px 40px; transform: rotate(-1deg); box-sizing: border-box;">' +
            '<div style="position: absolute; top: 0; bottom: 0; left: 40px; width: 1.5px; background: rgba(214,80,46,0.4);"></div>' +
            '<div style="position: absolute; top: -15px; left: 50%; transform: translateX(-50%) rotate(-2.5deg); width: 128px; height: 28px; background: rgba(228,202,128,0.55); border-left: 1px dashed rgba(255,255,255,.5); border-right: 1px dashed rgba(255,255,255,.5); box-shadow: 0 1px 2px rgba(0,0,0,.08);"></div>' +
            '<div style="font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 33px; line-height: 40px; color: #2A2118; padding-left: 26px;">' + esc(emptyTitle) + '</div>' +
            '<div style="font-family: \'Indie Flower\', cursive; font-size: 22px; line-height: 40px; color: #6F5E45; padding-left: 26px;">' + esc(emptyHint) + '</div>' +
            '<a href="mailto:nic@jobhuntrecipe.com?subject=Feedback%20on%20StillUnemployed.com" style="display: inline-flex; align-items: center; gap: 9px; font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 25px; line-height: 40px; color: #C2552F; padding-left: 26px; margin-top: 8px; text-decoration: none;">Would love feedback from you!' +
              '<svg width="26" height="20" viewBox="0 0 26 20" fill="none" style="flex: none;"><rect x="1.5" y="1.5" width="23" height="17" rx="2.5" stroke="#C2552F" stroke-width="2"></rect><path d="M2.5 3 L13 11 L23.5 3" stroke="#C2552F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
            '</a>' +
          '</div>' +
        '</div>';
      }

      out += '</div>'; // /header+content wrap

      // Capture focus intent BEFORE the innerHTML swap. Replacing innerHTML removes the
      // old #su-search, which fires a focusout that flips this._searchFocused to false
      // mid-render — so read it into a local first, else the restore below never runs and
      // the field drops focus after every single keystroke.
      var keepSearchFocus = this._searchFocused ||
        (document.activeElement && document.activeElement.id === 'su-search');

      board.innerHTML = out;

      // restore focus + caret to the search input after re-render
      var inp = document.getElementById('su-search');
      if (inp && keepSearchFocus) {
        inp.focus();
        try { inp.setSelectionRange(this._searchCaret, this._searchCaret); } catch (e) {}
      }

      // ---- overlays (modal + feedback popup) live in #overlay-root ----
      this.renderOverlays();
    },

    renderOverlays: function () {
      var root = document.getElementById('overlay-root');
      var out = '';

      // About modal
      if (this.state.modalOpen) {
        out += '<div data-act="closeModal" style="position: fixed; inset: 0; z-index: 200; background: rgba(44,33,24,0.58); display: flex; align-items: flex-start; justify-content: center; padding: 24px; overflow-y: auto; -webkit-overflow-scrolling: touch;">' +
          '<div data-act="stop" style="margin: auto;width: 588px; max-width: 100%; background: #FCFAF3; border-radius: 5px; position: relative; box-shadow: 0 40px 90px rgba(44,33,24,0.4); transform: rotate(-0.8deg); font-family: \'Archivo\', sans-serif;">' +
            '<div style="position: absolute; top: -13px; left: 66px; width: 122px; height: 30px; background: rgba(228,202,128,0.72); transform: rotate(-4deg); box-shadow: 0 2px 5px rgba(44,33,24,0.14); z-index: 5;"></div>' +
            '<div style="position: absolute; top: -12px; right: 62px; width: 122px; height: 30px; background: rgba(228,202,128,0.72); transform: rotate(3.5deg); box-shadow: 0 2px 5px rgba(44,33,24,0.14); z-index: 5;"></div>' +
            '<div data-act="closeModal" style="position: absolute; top: 20px; right: 20px; width: 38px; height: 38px; border-radius: 50%; background: rgba(252,250,243,0.94); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 8; box-shadow: 0 2px 8px rgba(44,33,24,0.2);">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#5C4033" stroke-width="2.2" stroke-linecap="round"></path></svg>' +
            '</div>' +
            '<div style="padding: 16px 16px 0;">' +
              '<div style="position: relative; height: 244px; overflow: hidden; border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(44,33,24,0.06);">' +
                '<img src="assets/home-founder-nic.jpg" alt="Nic, the founder, on SiriusXM" style="width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; filter: saturate(1.04) brightness(1.02);">' +
                '<div style="position: absolute; bottom: 14px; left: 14px; display: inline-flex; align-items: center; gap: 6px; border: 2.6px solid #FFFFFF; color: #FFFFFF; border-radius: 5px; padding: 5px 10px; font-family: \'Archivo\', sans-serif; font-weight: 900; font-size: 11.5px; letter-spacing: 0.14em; transform: rotate(-3deg); box-shadow: 0 2px 10px rgba(0,0,0,0.28);">' +
                  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex: none;"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.4"></circle><path d="M8.3 12.2l2.4 2.4 4.9-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                  'THE REAL ONE' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="padding: 22px 42px 40px;">' +
              '<div style="font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 23px; color: #D8502E; transform: rotate(-1.5deg); display: block;">hey stranger,</div>' +
              '<div style="position: relative; display: block; margin-top: 4px;">' +
                '<div style="font-family: \'Archivo Black\', sans-serif; font-weight: 900; font-size: 32px; line-height: 1.06; letter-spacing: -0.02em; color: #2C2118; width: 300px;">Hey, I\'m Nic. I built this.</div>' +
                '<svg width="220" height="12" viewBox="0 0 220 12" fill="none" style="position: absolute; left: 4px; bottom: -8px;"><path d="M3 7 C 55 2, 120 2, 217 6" stroke="#F2C231" stroke-width="4" stroke-linecap="round"></path></svg>' +
              '</div>' +
              '<div style="font-size: 15.5px; line-height: 1.62; color: #3a3026; font-weight: 500; margin-top: 18px;">I sent <strong style="font-weight: 800; color: #2C2118;">1,500 applications</strong> and got ghosted more times than I can count. Seven months later, <strong style="font-weight: 800; color: #2C2118;">Instagram</strong> said yes. <strong style="font-weight: 800; color: #2C2118;">StillUnemployed</strong> is the board I wish I\'d had. Roles here are <strong style="font-weight: 800; color: #2C2118;">opened and verified by a human</strong>, and that human is me. No AI slop, just jobs I\'d <strong style="font-weight: 800; color: #2C2118;">actually apply to</strong>.</div>' +
              '<div style="font-size: 13px; font-weight: 600; color: #6f6253; letter-spacing: 0.01em; margin-top: 18px;">Content Specialist at Instagram · Class of 2025</div>' +
              '<div style="display: flex; align-items: center; gap: 16px; margin-top: 22px; flex-wrap: wrap;">' +
                '<a href="https://NicholasAlexis.com" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; gap: 11px; background: #5C4033; color: #F4EEE2; font-size: 16px; font-weight: 700; padding: 15px 26px; border-radius: 12px; cursor: pointer; box-shadow: 0 10px 24px rgba(44,33,24,0.22); text-decoration: none; transform: rotate(-1deg); font-family: \'Archivo\', sans-serif;">View My Portfolio' +
                  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#F4EEE2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                '</a>' +
                '<div style="font-family: \'Indie Flower\', cursive; font-size: 22px; color: #6F5E45; transform: rotate(-2deg);">- Nic</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }

      // apply feedback popup
      if (this.state.feedbackOpen) {
        out += '<div data-act="closeFeedback" style="position: fixed; inset: 0; z-index: 210; background: rgba(44,33,24,0.58); display: flex; align-items: flex-start; justify-content: center; padding: 24px; overflow-y: auto; -webkit-overflow-scrolling: touch;">' +
          '<div data-act="stop" style="margin: auto;width: 460px; max-width: 100%; background: #F4EEE2; border-radius: 8px; padding: 30px 30px 28px; position: relative; box-shadow: 0 40px 90px rgba(44,33,24,0.4); transform: rotate(-0.7deg);">' +
            '<div data-act="closeFeedback" style="position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 50%; background: rgba(44,33,24,0.06); display: flex; align-items: center; justify-content: center; cursor: pointer;">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#5C4033" stroke-width="2.2" stroke-linecap="round"></path></svg>' +
            '</div>' +
            '<div style="font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 27px; color: #2A2118; line-height: 1.1; transform: rotate(-1deg);">welcome back!</div>' +
            '<div style="font-family: \'Indie Flower\', cursive; font-size: 19px; color: #6F5E45; margin-top: 6px;">how\'d it go with ' + esc(this.state.feedbackCo) + '?</div>' +
            '<div style="display: flex; gap: 14px; margin-top: 22px;">' +
              '<div data-act="markApplied" class="fbopt" style="flex: 1; cursor: pointer; background: #F2E14B; border-radius: 6px; padding: 22px 14px 18px; text-align: center; transform: rotate(-1.6deg); box-shadow: 2px 4px 9px rgba(44,33,24,0.16);">' +
                '<div style="width: 40px; height: 40px; border-radius: 50%; background: #2E7D52; display: flex; align-items: center; justify-content: center; margin: 0 auto;">' +
                  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4 4L19 7" stroke="#F4EEE2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                '</div>' +
                '<div style="font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 15px; color: #2A2118; margin-top: 12px;">I applied!</div>' +
              '</div>' +
              '<div data-act="reportBroken" class="fbopt" style="flex: 1; cursor: pointer; background: #ECDBB7; border-radius: 6px; padding: 22px 14px 18px; text-align: center; transform: rotate(1.6deg); box-shadow: 2px 4px 9px rgba(44,33,24,0.16);">' +
                '<div style="width: 40px; height: 40px; border-radius: 50%; background: #D8502E; display: flex; align-items: center; justify-content: center; margin: 0 auto;">' +
                  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 7H6.5a3.5 3.5 0 0 0 0 7H9M15 7h2.5a3.5 3.5 0 0 1 0 7H15M9 10.5h2M4 4l16 16" stroke="#F4EEE2" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                '</div>' +
                '<div style="font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 15px; color: #3A2A1B; margin-top: 12px;">No longer open</div>' +
              '</div>' +
            '</div>' +
            '<div data-act="closeFeedback" style="margin-top: 18px; text-align: center; font-family: \'Indie Flower\', cursive; font-size: 19px; color: #8A7558; cursor: pointer;">job wasn\'t a right fit →</div>' +
          '</div>' +
        '</div>';
      }

      // Job detail popup (TL;DR + Apply + share-in-corner). Opened by clicking a card.
      if (this.state.detailOpen) {
        var _P = this.THEMES[this.state.look] || this.THEMES.original;
        var dj = null;
        for (var di = 0; di < this.jobs.length; di++) { if (this.jobs[di].link === this.state.detailLink) { dj = this.jobs[di]; break; } }
        if (dj) {
          var dmeta = [dj.loc, dj.style, dj.exp].filter(Boolean).join(' · ');
          var tld = dj.tldr || dj.desc || '';
          var bl = '';
          if (tld) {
            var raw = String(tld);
            var bp = raw.split(/[\n••]/).map(function (s) { return s.trim().replace(/^[-*]\s*/, ''); }).filter(function (s) { return s.length > 3; });
            if (bp.length < 2) bp = raw.split('. ').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 3; });
            bl = bp.slice(0, 4).map(function (b) { return '<li style="margin: 7px 0;">' + esc(b) + '</li>'; }).join('');
          }
          // popup note-card is always cream, so apply is ALWAYS bright orange (Nic: it must pop)
          var _applyC = '#E8502E';
          // ── recipe capture config (Nic, 2026-07-11 late) ─────────────────────────────
          // Shown on ~1 in 3 jobs (deterministic per job, so it doesn't flicker between
          // renders). Copy rotates through variants (stable per job) so the Reports sheet
          // can tell us which line earns signups vs ✕s. Hidden = in-memory only, so an
          // accidental ✕ comes back on reload.
          var _rHash = 0; try { var _rl = String(dj.link || ''); for (var _ri = 0; _ri < _rl.length; _ri++) _rHash = (_rHash * 31 + _rl.charCodeAt(_ri)) % 9973; } catch (eH) {}
          var _rShow = (_rHash % 3 === 0) && !this._recipeHidden;
          var _rVariants = [
            'want the exact advice that got me a job at Instagram? ↓',
            'want the recipe I followed to a 6-figure offer? ↓',
            'the advice that almost got me a job with the Kardashians ↓',
            '4 hand-picked jobs + 1 raw story, every Monday. free. ↓'
          ];
          var _rCopy = _rVariants[(_rHash >> 2) % _rVariants.length];
          var _arrow = '<svg width="30" height="15" viewBox="0 0 28 14" fill="none" style="overflow: visible; margin-left: 5px;"><path d="M1 7 C 8 2.5, 15 2.5, 24 6.6" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"></path><path d="M18.5 2.6 L25.5 6.9 L19 11.4" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
          // Age disclaimer (Nic, 2026-07-11). We never retire a role for being old — old roles STAY on the
          // board (a fuller board), and we disclose the age here, in the popup only, never on the card face.
          // Keyed off the job's POSTED date (when the company posted it), falling back to our Date Added
          // until the sourcer backfills Date Posted from the ATS APIs.
          var _ageNote = '';
          try {
            var _src = (dj && dj.posted) ? dj.posted : (dj && dj.added ? dj.added : '');
            if (_src) {
              var _ad = new Date(String(_src).trim().slice(0, 10) + 'T00:00:00');
              if (!isNaN(_ad.getTime())) {
                var _days = Math.floor((Date.now() - _ad.getTime()) / 86400000);
                if (_days >= 30) {
                  // Nic 2026-07-11: ALWAYS "30+" no matter the real age (60/70/89) — a bigger
                  // number scares people off. The 90-day sourcing cap bounds the true age.
                  _ageNote = 'FYI: job is 30+ days old';
                }
              }
            }
          } catch (e) {}
          // KILLED 2026-07-11 late (Nic): the age line made the whole board FEEL stale, and
          // corporate reqs genuinely accept applicants for 60-90 days. The 90-day sourcing cap
          // + the liveness checker are the real guards. Data (Date Posted) stays in the sheet.
          _ageNote = '';
          out += '<div data-act="closeDetail" style="position: fixed; inset: 0; z-index: 214; background: rgba(44,33,24,0.58); display: flex; align-items: flex-start; justify-content: center; padding: 24px; overflow-y: auto; -webkit-overflow-scrolling: touch;">' +
            '<div data-act="stop" style="margin: auto;position: relative; width: 410px; max-width: 100%; box-sizing: border-box; background-color: #FCFAF3; background-image: repeating-linear-gradient(180deg, transparent 0 32px, rgba(96,130,170,0.20) 32px 33px); background-position: 0 92px; border-radius: 4px; box-shadow: 5px 18px 44px rgba(44,33,24,0.34); transform: rotate(-1deg); padding: 30px 30px 26px 48px;">' +
              // red left margin line + tape
              '<div style="position: absolute; top: 0; bottom: 0; left: 36px; width: 1.5px; background: rgba(214,80,46,0.4);"></div>' +
              '<div style="position: absolute; top: -13px; left: 50%; transform: translateX(-50%) rotate(-2.5deg); width: 120px; height: 28px; background: rgba(228,202,128,0.6); border-left: 1px dashed rgba(255,255,255,.5); border-right: 1px dashed rgba(255,255,255,.5); box-shadow: 0 1px 2px rgba(0,0,0,.08);"></div>' +
              // share + close (corner). Share = bigger circular tap target + a hand-drawn
              // "Share" hint with an up-arrow so people know what the icon does.
              '<div data-act="detailShare" data-link="' + esc(dj.link) + '" title="Share with a friend" style="position: absolute; top: 9px; right: 46px; width: 32px; height: 32px; border-radius: 50%; background: rgba(44,33,24,0.07); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5C4033;">' +
                '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.6"></circle><circle cx="6" cy="12" r="2.6"></circle><circle cx="18" cy="19" r="2.6"></circle><path d="M8.6 13.4l6.9 4M15.5 6.6l-6.9 4"></path></svg>' +
              '</div>' +
              '<div data-act="detailShare" data-link="' + esc(dj.link) + '" style="position: absolute; top: 43px; right: 39px; display: flex; flex-direction: column; align-items: center; cursor: pointer; color: #C2552F;">' +
                '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="overflow: visible;"><path d="M10 18.5 C 8.4 12.5, 11.6 7.5, 10 2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></path><path d="M5.4 6 L10 1.3 L14.6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                '<span style="font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 16px; margin-top: 1px; white-space: nowrap;">Share</span>' +
              '</div>' +
              '<div data-act="closeDetail" style="position: absolute; top: 11px; right: 13px; width: 27px; height: 27px; border-radius: 50%; background: rgba(44,33,24,0.07); display: flex; align-items: center; justify-content: center; cursor: pointer;">' +
                '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#5C4033" stroke-width="2.4" stroke-linecap="round"></path></svg>' +
              '</div>' +
              // header
              '<div style="font-family: \'Archivo Black\', sans-serif; font-weight: 900; font-size: 24px; color: #2C2118; line-height: 1.12; padding-right: 82px;">' + esc(dj.co) + '</div>' +
              '<div style="font-family: \'Archivo\', sans-serif; font-weight: 600; font-size: 16px; color: #3A2E20; margin-top: 4px; padding-right: 82px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">' + esc(dj.role) + '</div>' +
              (dj.pay ? '<div style="font-family: \'Archivo Black\', sans-serif; font-weight: 900; font-size: 20px; color: #2C2118; margin-top: 10px;">' + esc(dj.pay) + '</div>' : '') +
              (dmeta ? '<div style="font-family: \'Archivo\', sans-serif; font-size: 13.5px; color: #6F5E45; margin-top: 5px;">' + esc(dmeta) + '</div>' : '') +
              // TL;DR label (handwritten + swoosh)
              '<div style="position: relative; display: inline-block; margin-top: 20px;">' +
                '<div style="font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 23px; color: #2C2118;">TL;DR</div>' +
                '<svg width="74" height="9" viewBox="0 0 74 9" fill="none" style="position: absolute; left: 0; bottom: -5px;"><path d="M2 5 C 22 1, 50 1, 72 4" stroke="#F2C231" stroke-width="3.5" stroke-linecap="round"></path></svg>' +
              '</div>' +
              (bl ? '<ul style="margin: 12px 0 0; padding-left: 20px; font-size: 14.5px; color: #3a3026; line-height: 1.55;">' + bl + '</ul>'
                  : '<div style="margin-top: 9px; font-family: \'Indie Flower\', cursive; font-size: 17px; color: #6F5E45; line-height: 1.5;">a quick 3–4 bullet summary is coming to every role. for now, hit apply for the full listing →</div>') +
              // apply (card-style text link + hand-drawn arrow)
              '<div style="margin-top: 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">' +
                (_ageNote
                  ? '<span style="font-family: \'Indie Flower\', cursive; font-size: 16.5px; color: #C2552F; line-height: 1.2; text-align: left; max-width: 60%;">' + _ageNote + '</span>'
                  : '<span></span>') +
                '<span data-act="detailApply" data-link="' + esc(dj.link) + '" data-co="' + esc(dj.co) + '" style="font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 21px; color: ' + _applyC + '; display: inline-flex; align-items: center; cursor: pointer; flex: none;">apply' + _arrow + '</span>' +
              '</div>' +
              // recipe capture: rotating one-liner + Beehiiv embed. ✕ hides it until reload.
              (!_rShow ? '' :
              '<div style="margin-top: 20px; border-top: 1.5px dashed rgba(44,33,24,0.22); padding-top: 12px; position: relative;">' +
                '<div data-act="hideRecipe" data-co="' + esc(_rCopy) + '" data-link="' + esc(dj.link) + '" title="hide this" style="position: absolute; top: 5px; right: 0; width: 20px; height: 20px; border-radius: 50%; background: rgba(44,33,24,0.06); display: flex; align-items: center; justify-content: center; cursor: pointer; font-family: \'Archivo\', sans-serif; font-size: 11px; color: #6F5E45;">✕</div>' +
                '<div style="font-family: \'Indie Flower\', cursive; font-size: 16px; color: #2C2118; line-height: 1.3; padding-right: 26px;">' + esc(_rCopy) + '</div>' +
                '<iframe src="https://subscribe-forms.beehiiv.com/af2e314d-125f-431d-a8e0-0020be04d97c" data-test-id="beehiiv-embed" height="50" frameborder="0" scrolling="no" style="width: 100%; max-width: 100%; border: 0; border-radius: 4px; background: transparent; margin-top: 9px; display: block; overflow: hidden;"></iframe>' +
              '</div>') +
            '</div>' +
          '</div>';
        }
      }

      // "Change Look?" popup (markup + copy ported verbatim from MAIN FILE)
      if (this.state.lookOpen) {
        out += '<div data-act="closeLook" style="position: fixed; inset: 0; z-index: 210; background: rgba(44,33,24,0.58); display: flex; align-items: flex-start; justify-content: center; padding: 24px; overflow-y: auto; -webkit-overflow-scrolling: touch;">' +
          '<div data-act="stop" style="margin: auto;width: 560px; max-width: 100%; background: #F4EEE2; border-radius: 8px; padding: 30px 30px 28px; position: relative; box-shadow: 0 40px 90px rgba(44,33,24,0.4); transform: rotate(-0.7deg);">' +
            '<div data-act="closeLook" style="position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 50%; background: rgba(44,33,24,0.06); display: flex; align-items: center; justify-content: center; cursor: pointer;">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#5C4033" stroke-width="2.2" stroke-linecap="round"></path></svg>' +
            '</div>' +
            '<div style="font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 27px; color: #2A2118; line-height: 1.1; transform: rotate(-1deg);">change the look?</div>' +
            '<div style="font-family: \'Indie Flower\', cursive; font-size: 19px; color: #6F5E45; margin-top: 6px;">pick a vibe for the board ↓</div>' +
            // grid: 3-across on desktop (3+2 scrapbook rows), 2-across on mobile (see styles.css .look-grid)
            '<div class="look-grid" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 22px;">' +
              // --- WW2 (ARCHIVED — hidden from picker, theme code kept for future) ---
              // --- Original ---
              '<div data-act="pickOriginal" class="fbopt" style="flex: 1 1 150px; cursor: pointer; position: relative; background: #F2E14B; border-radius: 4px; padding: 16px 10px 14px; min-height: 162px; display: flex; flex-direction: column; align-items: center; text-align: center; transform: rotate(1.6deg); box-shadow: 2px 5px 11px rgba(44,33,24,0.22); box-sizing: border-box;">' +
                '<div style="position: absolute; top: -9px; left: 50%; transform: translateX(-50%) rotate(2deg); width: 54px; height: 16px; background: rgba(228,202,128,0.55); box-shadow: 0 1px 2px rgba(0,0,0,.1);"></div>' +
                '<div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">' +
                  '<div style="display: inline-flex; align-items: center; gap: 5px; border: 1.8px solid #3A2A1B; color: #3A2A1B; border-radius: 4px; padding: 4px 8px; font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; opacity: .72; transform: rotate(-4deg);">' +
                    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" style="flex: none;"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.4"></circle><path d="M8.3 12.2l2.4 2.4 4.9-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                    'Human Verified' +
                  '</div>' +
                '</div>' +
                '<div style="font-family: \'Archivo Black\', sans-serif; font-size: 18px; color: #2A2118; letter-spacing: -0.3px; line-height: 1.05;">Original version</div>' +
              '</div>' +
              // --- Casino (poker) ---
              '<div data-act="pickPoker" class="fbopt" style="flex: 1 1 150px; cursor: pointer; position: relative; background: linear-gradient(160deg,#7E1728 0%,#5A0F1C 100%); border-radius: 4px; padding: 16px 10px 14px; min-height: 162px; display: flex; flex-direction: column; align-items: center; text-align: center; transform: rotate(1.8deg); box-shadow: 2px 5px 11px rgba(44,33,24,0.22); box-sizing: border-box;">' +
                '<div style="position: absolute; top: -9px; left: 50%; transform: translateX(-50%) rotate(2.5deg); width: 54px; height: 16px; background: rgba(228,202,128,0.5); box-shadow: 0 1px 2px rgba(0,0,0,.1);"></div>' +
                '<div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">' +
                  '<div style="display: inline-flex; align-items: center; gap: 6px; border: 2.2px solid #D4AF37; color: #D4AF37; border-radius: 4px; padding: 5px 9px; font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 9px; text-transform: uppercase; letter-spacing: .12em; opacity: .95; transform: rotate(-7deg);">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex: none;"><circle cx="12" cy="12" r="10.4" fill="none" stroke="#D4AF37" stroke-width="1.4"></circle><circle cx="12" cy="12" r="9" fill="none" stroke="#D4AF37" stroke-width="3.6" stroke-dasharray="4.7 4.7"></circle><circle cx="12" cy="12" r="5.1" fill="none" stroke="#D4AF37" stroke-width="1.5"></circle></svg>' +
                    'Human Verified' +
                  '</div>' +
                '</div>' +
                '<div style="font-family: \'Archivo Black\', sans-serif; font-size: 18px; color: #E9D9A6; letter-spacing: -0.3px; line-height: 1.05;">Casino</div>' +
              '</div>' +
              // --- Beauty (lipstick / high-class) — FEATURED (Nic's weekly top 3) ---
              '<div data-act="pickBeauty" class="fbopt" style="flex: 1 1 150px; cursor: pointer; position: relative; background: linear-gradient(160deg,#F5D3DA 0%,#EAB4C0 100%); border-radius: 4px; padding: 16px 10px 14px; min-height: 162px; display: flex; flex-direction: column; align-items: center; text-align: center; transform: rotate(1.4deg); box-shadow: 2px 5px 11px rgba(44,33,24,0.28); box-sizing: border-box;">' +
                '<div style="position: absolute; top: -9px; left: 50%; transform: translateX(-50%) rotate(2deg); width: 54px; height: 16px; background: rgba(243,217,184,0.45); box-shadow: 0 1px 2px rgba(0,0,0,.1);"></div>' +
                '<div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">' +
                  '<div style="display: inline-flex; align-items: center; gap: 5px; border: 2px solid #8A1E33; color: #8A1E33; background: rgba(255,255,255,0.35); border-radius: 14px; padding: 4px 10px; font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 12.5px; opacity: .95; transform: rotate(-5deg);">' +
                    '💄 Human Verified 💋' +
                  '</div>' +
                '</div>' +
                '<div style="font-family: \'Archivo Black\', sans-serif; font-size: 18px; color: #5A2230; letter-spacing: -0.3px; line-height: 1.05;">Beauty</div>' +
              '</div>' +
            '</div>' +
            // Expander — the X (top-right) or clicking outside dismisses, so no "keep as is" needed.
            '<div id="moreThemesToggle" data-act="moreThemes" style="margin-top: 16px; text-align: center; font-family: \'Indie Flower\', cursive; font-size: 19px; color: #8A7558; cursor: pointer;">we have even more themes ↓</div>' +
            // The rest of the library, hidden until expanded, shown as smaller cards.
            '<div id="moreThemesWrap" class="look-grid look-grid-more" style="display: none; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 14px;">' +
              // --- For the girlies ---
              '<div data-act="pickGirly" class="fbopt" style="flex: 1 1 150px; cursor: pointer; position: relative; background: #EFAEC4; border-radius: 4px; padding: 16px 10px 14px; min-height: 162px; display: flex; flex-direction: column; align-items: center; text-align: center; transform: rotate(-1.4deg); box-shadow: 2px 5px 11px rgba(44,33,24,0.22); box-sizing: border-box;">' +
                '<div style="position: absolute; top: -9px; left: 50%; transform: translateX(-50%) rotate(-2deg); width: 54px; height: 16px; background: rgba(228,202,128,0.5); box-shadow: 0 1px 2px rgba(0,0,0,.1);"></div>' +
                '<div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">' +
                  '<div style="display: inline-flex; align-items: center; gap: 5px; border: 2.4px solid #C24A78; color: #C24A78; border-radius: 14px; padding: 4px 10px; font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 13px; opacity: .9; transform: rotate(-7deg);">' +
                    '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="flex: none;"><path d="M12 21s-7.5-4.7-10-9.2C.5 8.6 2 5 5.3 5c2 0 3.3 1.2 4.7 3 1.4-1.8 2.7-3 4.7-3C18 5 19.5 8.6 22 11.8 19.5 16.3 12 21 12 21z"></path></svg>' +
                    'Human Verified' +
                    '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="flex: none;"><path d="M12 21s-7.5-4.7-10-9.2C.5 8.6 2 5 5.3 5c2 0 3.3 1.2 4.7 3 1.4-1.8 2.7-3 4.7-3C18 5 19.5 8.6 22 11.8 19.5 16.3 12 21 12 21z"></path></svg>' +
                  '</div>' +
                '</div>' +
                '<div style="font-family: \'Archivo Black\', sans-serif; font-size: 18px; color: #5A2638; letter-spacing: -0.3px; line-height: 1.05;">For the girlies</div>' +
              '</div>' +
              // --- Mermaidcore (re-enabled for Nic to preview) ---
              '<div data-act="pickMermaid" class="fbopt" style="flex: 1 1 150px; cursor: pointer; position: relative; background: #0E4A5C; border-radius: 4px; padding: 16px 10px 14px; min-height: 162px; display: flex; flex-direction: column; align-items: center; text-align: center; transform: rotate(-1.3deg); box-shadow: 2px 5px 11px rgba(44,33,24,0.22); box-sizing: border-box;">' +
                '<div style="position: absolute; top: -9px; left: 50%; transform: translateX(-50%) rotate(-2deg); width: 54px; height: 16px; background: rgba(228,202,128,0.5); box-shadow: 0 1px 2px rgba(0,0,0,.1);"></div>' +
                '<div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">' +
                  '<div style="display: inline-flex; align-items: center; gap: 6px; border: 2.2px solid #7FE0D0; color: #7FE0D0; border-radius: 14px; padding: 4px 10px; font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 13px; opacity: .95; transform: rotate(-6deg);">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="flex: none;"><path d="M12 2c2.5 3 2.5 7 0 10 2.5 3 2.5 7 0 10-2.5-3-2.5-7 0-10-2.5-3-2.5-7 0-10z"></path></svg>' +
                    'Human Verified' +
                  '</div>' +
                '</div>' +
                '<div style="font-family: \'Archivo Black\', sans-serif; font-size: 18px; color: #E9FBFF; letter-spacing: -0.3px; line-height: 1.05;">Mermaidcore</div>' +
              '</div>' +
              // --- bratt (Charli XCX brat green) ---
              '<div data-act="pickBratt" class="fbopt" style="flex: 1 1 150px; cursor: pointer; position: relative; background: #8ACE00; border-radius: 4px; padding: 16px 10px 14px; min-height: 162px; display: flex; flex-direction: column; align-items: center; text-align: center; transform: rotate(1.5deg); box-shadow: 2px 5px 11px rgba(44,33,24,0.22); box-sizing: border-box;">' +
                '<div style="position: absolute; top: -9px; left: 50%; transform: translateX(-50%) rotate(2deg); width: 54px; height: 16px; background: rgba(228,202,128,0.5); box-shadow: 0 1px 2px rgba(0,0,0,.1);"></div>' +
                '<div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">' +
                  '<div style="display: inline-flex; align-items: center; gap: 5px; border: 2px solid #0A1400; color: #0A1400; border-radius: 4px; padding: 4px 8px; font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; opacity: .82; transform: rotate(-4deg);">' +
                    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" style="flex: none;"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.4"></circle><path d="M8.3 12.2l2.4 2.4 4.9-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                    'Human Verified' +
                  '</div>' +
                '</div>' +
                '<div style="font-family: \'Archivo Black\', sans-serif; font-size: 20px; color: #0A1400; letter-spacing: -0.5px; line-height: 1.05; text-transform: lowercase;">bratt</div>' +
              '</div>' +
              // --- Noir (black luxury) ---
              '<div data-act="pickNoir" class="fbopt" style="flex: 1 1 150px; cursor: pointer; position: relative; background: #141414; border-radius: 4px; padding: 16px 10px 14px; min-height: 162px; display: flex; flex-direction: column; align-items: center; text-align: center; transform: rotate(-1.3deg); box-shadow: 2px 5px 11px rgba(44,33,24,0.28); box-sizing: border-box;">' +
                '<div style="position: absolute; top: -9px; left: 50%; transform: translateX(-50%) rotate(-2deg); width: 54px; height: 16px; background: rgba(228,202,128,0.4); box-shadow: 0 1px 2px rgba(0,0,0,.1);"></div>' +
                '<div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">' +
                  '<div style="display: inline-flex; align-items: center; gap: 5px; border: 1.8px solid #C9CDD4; color: #C9CDD4; border-radius: 4px; padding: 4px 8px; font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 9px; text-transform: uppercase; letter-spacing: .12em; opacity: .85; transform: rotate(-4deg);">' +
                    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" style="flex: none;"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.4"></circle><path d="M8.3 12.2l2.4 2.4 4.9-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                    'Human Verified' +
                  '</div>' +
                '</div>' +
                '<div style="font-family: \'Archivo Black\', sans-serif; font-size: 18px; color: #DDE0E5; letter-spacing: -0.3px; line-height: 1.05;">Black Cat</div>' +
              '</div>' +
              // --- Chess (real checkerboard + king "Human Verified" badge) ---
              '<div data-act="pickChess" class="fbopt" style="flex: 1 1 150px; cursor: pointer; position: relative; background-color: #F4F2EC; background-image: conic-gradient(#181818 25%, transparent 0 50%, #181818 0 75%, transparent 0); background-size: 36px 36px; border-radius: 4px; padding: 16px 10px 14px; min-height: 162px; display: flex; flex-direction: column; align-items: center; text-align: center; transform: rotate(1.6deg); box-shadow: 2px 5px 11px rgba(44,33,24,0.28); box-sizing: border-box;">' +
                '<div style="position: absolute; top: -9px; left: 50%; transform: translateX(-50%) rotate(-2deg); width: 54px; height: 16px; background: rgba(20,20,20,0.35); box-shadow: 0 1px 2px rgba(0,0,0,.1);"></div>' +
                '<div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">' +
                  '<div style="display: inline-flex; align-items: center; gap: 5px; border: 1.8px solid #171717; color: #171717; background: rgba(244,242,236,0.94); border-radius: 4px; padding: 4px 9px; font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 9px; text-transform: uppercase; letter-spacing: .12em; transform: rotate(-4deg);">' +
                    '<span style="font-size: 14px; line-height: 1;">♚</span>' +
                    'Human Verified' +
                  '</div>' +
                '</div>' +
                '<div style="display:inline-block; background:#171717; color:#F4F4F4; font-family: \'Archivo Black\', sans-serif; font-size: 17px; letter-spacing: -0.3px; line-height: 1.05; padding: 3px 9px; border-radius: 3px;">Chess</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }

      root.innerHTML = out;
    },

    // ---- event wiring (single delegated listener on document) -------------
    bindEvents: function () {
      var self = this;

      document.addEventListener('click', function (e) {
        var el = e.target.closest('[data-act]');
        if (!el) return;
        var act = el.getAttribute('data-act');

        // analytics (js/analytics.js): filter taps — additive; the switch below is untouched
        if (typeof window.suTrack === 'function') {
          if (act === 'cat') window.suTrack('filter', 'category', el.getAttribute('data-val') || '', '');
          else if (act === 'ws') window.suTrack('filter', 'workstyle', el.getAttribute('data-val') || '', '');
          else if (act === 'pr') window.suTrack('filter', 'pay', el.getAttribute('data-val') || '', '');
          else if (act === 'fr') window.suTrack('filter', 'freshness', el.getAttribute('data-val') || '', '');
        }

        switch (act) {
          case 'openModal': self.setState({ modalOpen: true }); break;
          case 'closeModal': self.setState({ modalOpen: false }); break;
          case 'closeFeedback': self.setState({ feedbackOpen: false }); break;
          case 'markApplied': {
            postReport('applied', self.state.feedbackCo, self.state.feedbackLink);
            // also drop the application into the on-device Tracker (tracker.html)
            var tj = null;
            for (var ti = 0; ti < self.jobs.length; ti++) {
              if (self.jobs[ti].link === self.state.feedbackLink) { tj = self.jobs[ti]; break; }
            }
            trackerLog(self.state.feedbackCo, self.state.feedbackLink, tj ? tj.role : '');
            self.setState({ feedbackOpen: false });
            suConfetti();   // short celebratory burst; popup closes so they keep browsing
            break;
          }
          case 'reportBroken': {
            var _bl = self.state.feedbackLink;
            // SPAM GUARD (Nic, 2026-07-11): max 3 reports/min and 10/day per visitor. Over the
            // limit the UI still says thanks (looks registered) but nothing is logged — shadow
            // throttle, so spammers can't tell they're cut off. suRateOk handles the counters.
            if (suRateOk('br', 3, 60) && suRateOk('brDay', 10, 86400)) {
              postReport('gone_report', self.state.feedbackCo, _bl);
            }
            // hide instantly for THIS visitor, persisted locally until the agent verdict
            try {
              var _rl2 = JSON.parse(localStorage.getItem('su_reported_links') || '[]');
              if (_rl2.indexOf(_bl) < 0) { _rl2.push(_bl); localStorage.setItem('su_reported_links', JSON.stringify(_rl2)); }
            } catch (eRB) {}
            for (var _bi = 0; _bi < self.jobs.length; _bi++) {
              if (self.jobs[_bi].link === _bl) { self.jobs.splice(_bi, 1); break; }
            }
            self.setState({ feedbackOpen: false });
            suToast('Thanks — pulled it while we double-check.');
            break;
          }
          case 'closeDetail': self.setState({ detailOpen: false }); break;
          case 'hideRecipe':
            self._recipeHidden = true;   // memory only — an accidental ✕ comes back on reload
            postReport('recipe_hide', el.getAttribute('data-co') || '', el.getAttribute('data-link') || '');
            self.setState({});
            break;
          case 'detailShare': {
            var sl = el.getAttribute('data-link'), sj = null;
            for (var si = 0; si < self.jobs.length; si++) { if (self.jobs[si].link === sl) { sj = self.jobs[si]; break; } }
            suShareJob(sj);
            break;
          }
          case 'detailApply': {
            var dl = el.getAttribute('data-link'), dc = el.getAttribute('data-co');
            if (dl) window.open(dl, '_blank', 'noopener');
            postReport('click', dc, dl);
            self.setState({ detailOpen: false, feedbackOpen: true, feedbackCo: dc, feedbackLink: dl });
            break;
          }
          case 'stop': e.stopPropagation(); break;

          case 'toggleSavedOnly': self.setState({ savedOnly: !self.state.savedOnly }); break;

          // "Change Look?" modal open/close + pick a theme (persisted to localStorage)
          case 'openLook': self.setState({ lookOpen: true }); break;
          case 'closeLook': self.setState({ lookOpen: false }); break;
          case 'pickOriginal': self.setLook('original'); break;
          case 'pickCod': self.setLook('cod'); break;
          case 'pickGirly': self.setLook('girly'); break;
          case 'pickPoker': self.setLook('poker'); break;
          case 'pickMermaid': self.setLook('mermaid'); break;
          case 'pickBratt': self.setLook('bratt'); break;
          case 'pickNoir': self.setLook('noir'); break;
          case 'pickBeauty': self.setLook('beauty'); break;
          case 'pickChess': self.setLook('chess'); break;
          case 'moreThemes': {
            // Expand/collapse the extra themes in place (no re-render, so it stays open).
            var _w = document.getElementById('moreThemesWrap');
            var _t = document.getElementById('moreThemesToggle');
            if (_w) {
              var _open = _w.style.display !== 'none';
              _w.style.display = _open ? 'none' : 'grid';
              if (_t) _t.innerHTML = _open ? 'we have even more themes ↓' : 'show fewer ↑';
            }
            break;
          }
          case 'toggleCat': self.setState({ openPanel: self.state.openPanel === 'cat' ? null : 'cat' }); break;
          case 'toggleFilters': self.setState({ openPanel: self.state.openPanel === 'filters' ? null : 'filters' }); break;
          case 'clearAll': self.setState({ ws: 'Any', st: 'all', pr: 'Any', fr: 'Any', theme: null }); break;

          case 'cat': self.setState({ cat: el.getAttribute('data-val'), openPanel: null }); break;
          case 'ws': self.setState({ ws: el.getAttribute('data-val') }); break;
          case 'pr': self.setState({ pr: el.getAttribute('data-val') }); break;
          case 'fr': self.setState({ fr: el.getAttribute('data-val') }); break;

          case 'chipTheme': self.setState({ theme: null }); break;
          case 'chipWs': self.setState({ ws: 'Any' }); break;
          case 'chipPr': self.setState({ pr: 'Any' }); break;
          case 'chipFr': self.setState({ fr: 'Any' }); break;
          case 'chipSt': self.setState({ st: 'all' }); break;

          case 'toggleSave':
            e.stopPropagation();
            self.toggleSave(el.getAttribute('data-link'));
            break;

          case 'openNote': {
            e.stopPropagation();
            var id1 = Number(el.getAttribute('data-id'));
            var on1 = Object.assign({}, self.state.openNotes); on1[id1] = 'open';
            self.setState({ openNotes: on1 });
            break;
          }

          case 'closeNote': {
            e.stopPropagation();
            var id2 = Number(el.getAttribute('data-id'));
            var on2 = Object.assign({}, self.state.openNotes); on2[id2] = 'closing';
            self.setState({ openNotes: on2 });
            setTimeout(function () {
              var on = Object.assign({}, self.state.openNotes); on[id2] = 'done';
              self.setState({ openNotes: on });
            }, 290);
            break;
          }

          case 'apply': {
            // now opens the TL;DR detail popup; real navigation happens from detailApply
            e.preventDefault(); e.stopPropagation();
            var _al = el.getAttribute('data-link') || el.getAttribute('href') || '';
            suRecipeView(_al, self);   // impression log for the capture block (1-in-3 jobs)
            self.setState({ detailOpen: true, detailLink: _al });
            break;
          }

          case 'openJob': {
            // clicking the card body opens the TL;DR detail popup (unless a note is open/closing)
            var id3 = Number(el.getAttribute('data-id'));
            var ns = self.state.openNotes[id3];
            if (ns === 'open' || ns === 'closing') return;
            e.stopPropagation();
            var _dl3 = el.getAttribute('data-link');
            suRecipeView(_dl3, self);
            self.setState({ detailOpen: true, detailLink: _dl3 });
            break;
          }
        }
      });

      // search input (delegated): track caret so re-render keeps focus
      document.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'su-search') {
          self._searchFocused = true;
          self._searchCaret = e.target.selectionStart;
          // DEBOUNCE the (expensive) full board re-render so typing stays snappy on mobile.
          // The native input shows each keystroke instantly; the filtered results settle
          // ~140ms after you pause. (This was the "1 second per letter" mobile lag.)
          clearTimeout(self._renderTimer);
          (function (val) { self._renderTimer = setTimeout(function () { self.setState({ q: val }); }, 140); })(e.target.value);
          // analytics: log the query once it settles (1.5s debounce) — additive
          clearTimeout(self._qTimer);
          self._qTimer = setTimeout(function () {
            var q = String(self.state.q || '').trim();
            if (!q || q === self._qLast) return;
            self._qLast = q;
            if (typeof window.suTrack === 'function') window.suTrack('search', 'search', q.slice(0, 60), '');
          }, 1500);
        }
      });
      document.addEventListener('focusin', function (e) {
        if (e.target && e.target.id === 'su-search') self._searchFocused = true;
      });
      document.addEventListener('focusout', function (e) {
        if (e.target && e.target.id === 'su-search') self._searchFocused = false;
      });

      // state <select> (delegated change)
      document.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'su-state') {
          // analytics: state filter — additive
          if (typeof window.suTrack === 'function') window.suTrack('filter', 'state', e.target.value, '');
          self.setState({ st: e.target.value });
        }
      });

      // theme dwell-time tracking + arm the "do you like this look?" vote on scroll
      (function () {
        try {
          var p = new URLSearchParams(location.search);
          if (p.has('votereset')) {                       // dev: re-enable the vote for testing
            for (var i = localStorage.length - 1; i >= 0; i--) {
              var k = localStorage.key(i);
              if (k && k.indexOf('su_tv_') === 0) localStorage.removeItem(k);
            }
          }
        } catch (e) {}
        // deep link: ?job=<b64 apply-link> → scroll to + highlight that card (from a shared link)
        try {
          var _jp = new URLSearchParams(location.search).get('job');
          if (_jp) {
            var _wanted = decodeURIComponent(escape(atob(decodeURIComponent(_jp))));
            setTimeout(function () {
              var cards = document.querySelectorAll('.note[data-link]');
              for (var ci = 0; ci < cards.length; ci++) {
                if (cards[ci].getAttribute('data-link') === _wanted) {
                  cards[ci].scrollIntoView({ behavior: 'smooth', block: 'center' });
                  cards[ci].style.outline = '3px solid #D8502E'; cards[ci].style.outlineOffset = '3px';
                  (function (c) { setTimeout(function () { c.style.outline = ''; }, 2800); })(cards[ci]);
                  break;
                }
              }
            }, 900);
          }
        } catch (e) {}
        initThemeTracking(self.state.look);
        armThemeVote(self.state.look);                    // catch visitors who arrive already on a theme
        window.addEventListener('scroll', onThemeScroll, { passive: true });
      })();
    },

    // Reorder once per page load so the board never feels static: a recency-
    // weighted shuffle. Newest-added jobs (lower in the sheet) and featured picks
    // trend toward the top, but a random jitter reshuffles the order on every
    // reload. Filters/search keep this order; only a reload re-rolls it.
    shuffleFresh: function (jobs) {
      var n = jobs.length;
      // Tag each job with its original sheet position (_idx). No date field exists yet, so
      // row order is the recency signal — new jobs are appended at the bottom, so a higher
      // _idx = more recently added. Powers the "Recently added" sort (show all, newest first).
      return jobs
        .map(function (j, idx) {
          j._idx = idx;                                     // 0 = oldest row, n-1 = newest
          var recency = n > 1 ? idx / (n - 1) : 1;
          var score = recency * 0.55 + (j.pick ? 0.5 : 0) + Math.random();
          return { j: j, k: score };
        })
        .sort(function (a, b) { return b.k - a.k; })
        .map(function (x) { return x.j; });
    },

    init: function (jobs) {
      // "no longer open" reports hide the job INSTANTLY for this visitor (real global hide
      // happens when the triage agent verifies at the source and marks the sheet).
      try {
        var _hid = JSON.parse(localStorage.getItem('su_reported_links') || '[]');
        if (_hid.length) jobs = jobs.filter(function (j) { return _hid.indexOf(j.link) < 0; });
      } catch (eRH) {}
      this.jobs = this.shuffleFresh(jobs);
      this.bindEvents();
      // analytics: a ?theme= content preset (theme-chip) counts as an applied filter — additive
      if (this.state.theme && this.themeDefs[this.state.theme] && typeof window.suTrack === 'function') {
        window.suTrack('filter', 'theme', this.state.theme, '');
      }
      this.render();
    }
  };

  // ---- module-scope helpers (used by initial state) ----
  function loadSaved() {
    try { return JSON.parse(localStorage.getItem('su_saved_jobs') || '{}') || {}; } catch (e) { return {}; }
  }
  function loadLook() {
    try {
      var v = localStorage.getItem('su_look');
      // cod (WW2) still archived. mermaid re-enabled for preview.
      return (v === 'girly' || v === 'poker' || v === 'mermaid' || v === 'bratt' || v === 'noir' || v === 'beauty' || v === 'chess') ? v : 'original';
    } catch (e) { return 'original'; }
  }

  // =========================================================================
  // DATA SOURCE — Nic's Google Sheet (live) with a bundled JSON fallback.
  //
  // The board reads jobs straight from the Google Sheet, so Nic can add a job,
  // edit one, or flip a job to "Dead" by editing the sheet — no code change and
  // no redeploy. The sheet must be shared "Anyone with the link -> Viewer".
  // If the sheet can't be reached (offline, not shared yet, Google hiccup) the
  // board falls back to the bundled jobs-data.json so it never shows up empty.
  //
  // To point at a different sheet: change SHEET_ID (the long id in the sheet's
  // URL: docs.google.com/spreadsheets/d/<SHEET_ID>/edit).
  // =========================================================================
  var SHEET_ID = '1DRfkDn_OIVlnx06xFaNpNbusXl49jvM26oJsl-qq2nU';
  var SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&headers=1';

  // derive the 2-letter state (or "Remote") from a "City, ST" location string
  function deriveState(loc) {
    var s = String(loc || '').trim();
    if (/remote/i.test(s)) return 'Remote';
    var last = s.split(',').pop().trim();
    var m = last.match(/\b([A-Z]{2})\b/);
    return m ? m[1] : last;
  }

  // minimal CSV parser (handles quoted fields, doubled quotes, CRLF/LF)
  function parseCSV(text) {
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

  // map sheet rows -> the job objects the board expects; keep only Active rows
  function rowsToJobs(rows) {
    if (!rows || !rows.length) return [];
    var COLS = ['Company', 'Job Title', 'Link', 'Location', 'Type', 'Salary', 'Years of Experience', 'Category', 'Description', 'TL;DR', 'Pick', 'Active/Dead'];
    var head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var hasHeader = head.indexOf('company') !== -1 && head.indexOf('job title') !== -1;
    function col(name) { return hasHeader ? head.indexOf(name.toLowerCase()) : COLS.indexOf(name); }
    var iCo = col('Company'), iRole = col('Job Title'), iLink = col('Link'),
        iLoc = col('Location'), iType = col('Type'), iPay = col('Salary'),
        iExp = col('Years of Experience'), iCat = col('Category'),
        iDesc = col('Description'), iTldr = col('TL;DR'),
        iPick = col('Pick'), iAct = col('Active/Dead'),
        iAdded = col('Date Added'),   // when WE added it to the board
        iPosted = col('Date Posted'); // when the COMPANY posted the job — drives the age disclaimer (2026-07-11)
    var get = function (cells, k) { return (k >= 0 && cells[k] != null) ? String(cells[k]).trim() : ''; };
    var jobs = [];
    for (var r = hasHeader ? 1 : 0; r < rows.length; r++) {
      var cells = rows[r]; if (!cells) continue;
      var co = get(cells, iCo), role = get(cells, iRole);
      if (!co && !role) continue;                                   // skip blank rows
      var act = get(cells, iAct).toLowerCase();
      if (act.indexOf('dead') !== -1 || act === 'inactive' || act === 'no') continue; // hide retired jobs
      var _payv = get(cells, iPay);
      // GUARD (Nic's rule: a card must NEVER show without a salary). A blank Salary cell used to render
      // a black "$100K+" card with no number (payTier treats blank as 'high'). Skip blank-salary rows —
      // they stay in the sheet; a role reappears the moment its Salary cell is filled. See postmortem
      // 2026-07-08-StillUnemployed-Missing-Salary-Cards.
      if (!_payv || !String(_payv).replace(/[\s$–—-]/g, '').match(/\d/)) continue;
      // HOURLY (Upd. 2026-07-11, Nic): 6-month+ CONTRACT roles are now welcome — they pay hourly, and a
      // $40/hr contract at a real company is a good early-career job. So hourly no longer means "hide."
      // Rule: $25/hr+ shows; below that it's retail-tier hourly and stays off the board.
      if (/\/\s*hr|\bper\s*hour\b|\bhourly\b/i.test(_payv)) {
        var _rates = (String(_payv).match(/\d+(?:\.\d+)?/g) || []).map(Number);
        if (!_rates.length || Math.max.apply(null, _rates) < 25) continue;
      }
      var loc = get(cells, iLoc);
      jobs.push({
        co: co, role: role, link: safeUrl(get(cells, iLink)), loc: loc, state: deriveState(loc),
        style: get(cells, iType), ind: get(cells, iCat), pay: get(cells, iPay),
        exp: normExp(get(cells, iExp)), desc: get(cells, iDesc), tldr: get(cells, iTldr),
        pick: get(cells, iPick).toLowerCase() === 'featured',
        added: get(cells, iAdded),    // yyyy-mm-dd — when we added it
        posted: get(cells, iPosted)   // yyyy-mm-dd — when the COMPANY posted it (from the ATS API)
      });
    }
    return jobs;
  }

  // Security: only let http(s) job links reach the DOM. Blocks a malicious sheet
  // row (e.g. a "javascript:" or "data:" link) from injecting a script/redirect.
  // EXPERIENCE DISPLAY (Nic, 2026-07-11): NEVER show a range. A "3-6 yrs" card reads as scary even
  // though the only number that matters is the FLOOR — which is literally Nic's own newsletter thesis:
  // "always worry about the first number, never the second." So every range collapses to "<floor>+ yrs".
  //   "3-6 yrs" -> "3+ yrs" | "2 to 4 years" -> "2+ yrs" | "1-5+ yrs" -> "1+ yrs" | "3+ yrs" -> "3+ yrs"
  // Non-numeric values ("Early career", "See posting") pass through untouched.
  function normExp(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    if (!/\d/.test(s)) return s;                 // "Early career", "See posting", etc.
    var m = s.match(/\d+/);                      // the FIRST number is the floor
    if (!m) return s;
    if (Number(m[0]) === 0) return 'Early career';   // "0-2 yrs" -> "Early career", never "0+ yrs"
    return m[0] + '+ yrs';
  }

  function safeUrl(u) {
    u = String(u == null ? '' : u).trim();
    return /^https?:\/\//i.test(u) ? u : '';
  }

  function showLoadError() {
    var board = document.getElementById('board');
    if (board) board.innerHTML = '<div style="max-width:760px;margin:80px auto;padding:0 24px;font-family:\'Indie Flower\',cursive;font-size:24px;color:#B23A1E;">Could not load jobs. If you opened this file directly, serve the folder over http (e.g. <code>python3 -m http.server</code>) so the browser can fetch the data.</div>';
  }

  function loadFromJson() {
    fetch('jobs-data.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('json ' + r.status); return r.json(); })
      .then(function (jobs) { App.init(jobs); })
      .catch(function (err) { console.error(err); showLoadError(); });
  }

  // ---- boot: try the live Google Sheet first, fall back to jobs-data.json ----
  function boot() {
    fetch(SHEET_CSV_URL + '&_=' + Date.now(), { cache: 'no-cache' })  // &_=ts busts Google's server-side gviz cache so the board always sees the live sheet
      .then(function (r) { if (!r.ok) throw new Error('sheet ' + r.status); return r.text(); })
      .then(function (text) {
        var jobs = rowsToJobs(parseCSV(text));
        if (!jobs.length) throw new Error('sheet returned 0 jobs');
        App.init(jobs);
      })
      .catch(function (err) {
        console.warn('[StillUnemployed] live sheet unavailable, using bundled jobs-data.json:', err && err.message);
        loadFromJson();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // expose for debugging / console checks
  window.SUApp = App;
})();
