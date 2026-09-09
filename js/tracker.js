/* =========================================================================
   StillUnemployed.com — Tracker
   The Excel sheet, retired. Every application lives in localStorage under
   su_tracker (JSON array of {id, company, role, link, source, dateApplied,
   status, notes}). Optional Google sign-in also syncs these rows to the account.

   Rows arrive two ways:
     - auto-logged by js/app.js when someone taps "I applied!" on the board
       (source: 'StillUnemployed', deduped by verified posting identity)
     - added by hand with the form on this page (source: 'Me')

   The page follows the same conventions as js/app.js: one big render()
   that rebuilds #board, a delegated click/change listener, and the same
   "Change Look?" palettes keyed off localStorage su_look. Layout styling
   lives in tracker.html's <style> block; theme colors are passed through
   CSS custom properties set on the board element. Anchors are ALWAYS
   class-styled, never inline-styled (the Netlify anchor rule).
   ========================================================================= */
(function () {
  'use strict';

  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  // ---- "Change Look?" palettes — the slice of app.js THEMES the tracker needs ----
  var LOOKS = {
    original: { cls: '',        ink: '#2A2118', sub: '#6F5E45', acc: '#F2E14B', accInk: '#2A2118', navBg: 'var(--su-yellow-paper)', navInk: '#1f1c14', star: '#C2552F', hl: 'rgba(238,224,70,0.95)' },
    cod:      { cls: 'cod',     ink: '#E9E3D2', sub: '#AEB29B', acc: '#555B38', accInk: '#EDE7CF', navBg: '#5C6B3A', navInk: '#EDE7CF', star: '#AEB29B', hl: 'rgba(120,140,75,0.92)' },
    girly:    { cls: 'girly',   ink: '#2A0E1E', sub: '#8A2B5E', acc: '#E84B9C', accInk: '#3A0E26', navBg: '#F25CA2', navInk: '#3A0E26', star: '#D6277E', hl: 'rgba(233,59,146,0.92)' },
    poker:    { cls: 'poker',   ink: '#F2E4C8', sub: '#D9B989', acc: '#D4AF37', accInk: '#2A1810', navBg: '#D4AF37', navInk: '#2A1810', star: '#D4AF37', hl: 'rgba(31,107,58,0.92)' },
    mermaid:  { cls: 'mermaid', ink: '#0E4A5C', sub: '#1B6B7D', acc: '#FF7E67', accInk: '#4A160D', navBg: '#0E4A5C', navInk: '#E9FBFF', star: '#D9553C', hl: 'rgba(255,126,103,0.85)' },
    // 2026-07-11 late: the 4 newer board themes, ported from app.js THEMES so the tracker
    // follows whatever look is chosen on the Jobs page (Nic).
    beauty:   { cls: 'beauty',  ink: '#4A1520', sub: '#8A4A58', acc: '#8A1E33', accInk: '#FDECEF', navBg: '#6E1423', navInk: '#F7DDE2', star: '#A83048', hl: 'rgba(240,190,202,0.95)' },
    bratt:    { cls: 'bratt',   ink: '#0A0A0A', sub: '#4A6A10', acc: '#8ACE00', accInk: '#0A1400', navBg: '#8ACE00', navInk: '#0A1400', star: '#4A6A10', hl: 'rgba(138,206,0,0.95)' },
    noir:     { cls: 'noir',    ink: '#1C1A18', sub: '#6E675E', acc: '#1E1C1A', accInk: '#F4F2EC', navBg: '#161616', navInk: '#ECECEC', star: '#6E675E', hl: 'rgba(196,180,150,0.38)' },
    chess:    { cls: 'chess',   ink: '#161616', sub: '#5A5A5A', acc: '#141414', accInk: '#F4F4F4', navBg: '#161616', navInk: '#F4F4F4', star: '#3A3A3A', hl: 'rgba(20,20,20,0.14)' }
  };

  var STATUSES = ['Applied', 'Interview 1', 'Interview 2', 'Interview 3', 'Interview 4', 'Offer', 'Rejected', 'Ghosted'];

  function drawnArrow(direction) {
    return '<svg class="trk-arrow trk-arrow-' + direction + '" width="24" height="18" viewBox="0 0 28 20" fill="none" aria-hidden="true" focusable="false"><path d="M2 13c7-7 14-7 23-4M18 3l7 6-8 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  }
  function sizeNote(note) {
    if (!note || !note.classList || !note.classList.contains('trk-notes')) return;
    note.style.height = 'auto';
    note.style.height = Math.max(note.scrollHeight, 34) + 'px';
  }

  // ── THE OFFER PARTY (Nic, 2026-07-11) ────────────────────────────────────────
  // Selecting "Offer" earns balloons rising up the screen + fireworks popping in the
  // background + a confetti drizzle. Celebratory, not overwhelming: ~3.5s, then gone.
  function suOfferParty(accColor) {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var COLORS = ['#E8502E', '#F2C231', '#4A86E8', '#43D692', '#F691B3', accColor || '#F2E14B'];
      var cv = document.createElement('canvas');
      cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
      cv.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cv);
      var ctx = cv.getContext('2d');
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var W = window.innerWidth, H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
      var t0 = performance.now(), DUR = 3500;
      function rc() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

      // balloons: rise from below the fold to past the top, gentle sway
      var balloons = [];
      for (var b = 0; b < 9; b++) {
        balloons.push({ x: (W / 10) * (b + 0.5) + (Math.random() - 0.5) * 40, y: H + 60 + Math.random() * 160,
          v: 2.1 + Math.random() * 1.6, r: 16 + Math.random() * 10, ph: Math.random() * Math.PI * 2, c: rc() });
      }
      // fireworks: 5 staggered bursts in the upper half
      var bursts = [], burstAt = [150, 650, 1200, 1800, 2400];
      function spawnBurst() {
        var cx = W * (0.15 + Math.random() * 0.7), cy = H * (0.12 + Math.random() * 0.33), c = rc();
        for (var i = 0; i < 36; i++) {
          var a = (i / 36) * Math.PI * 2, sp = 2.2 + Math.random() * 3.4;
          bursts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: Math.random() < 0.8 ? c : '#FFFFFF' });
        }
      }
      // confetti drizzle from the top
      var confetti = [];
      for (var k = 0; k < 55; k++) {
        confetti.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, v: 1.6 + Math.random() * 2.4,
          w: 5 + Math.random() * 5, h: 8 + Math.random() * 6, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.2, c: rc() });
      }

      var spawned = 0;
      (function frame(now) {
        var el = now - t0;
        ctx.clearRect(0, 0, W, H);
        while (spawned < burstAt.length && el >= burstAt[spawned]) { spawnBurst(); spawned++; }
        // fireworks
        for (var i = 0; i < bursts.length; i++) {
          var p = bursts[i];
          p.x += p.vx; p.y += p.vy; p.vy += 0.045; p.vx *= 0.985; p.vy *= 0.985; p.life -= 0.016;
          if (p.life <= 0) continue;
          ctx.globalAlpha = Math.max(p.life, 0);
          ctx.fillStyle = p.c;
          ctx.fillRect(p.x - 1.6, p.y - 1.6, 3.2, 3.2);
        }
        // confetti
        ctx.globalAlpha = 1;
        for (var j = 0; j < confetti.length; j++) {
          var q = confetti[j];
          q.y += q.v; q.rot += q.vr; q.x += Math.sin((el / 400) + j) * 0.5;
          if (q.y > H + 20) continue;
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
          ctx.fillStyle = q.c; ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
          ctx.restore();
        }
        // balloons (drawn last, on top)
        for (var m = 0; m < balloons.length; m++) {
          var bl = balloons[m];
          bl.y -= bl.v; var bx = bl.x + Math.sin((el / 500) + bl.ph) * 14;
          if (bl.y < -80) continue;
          ctx.strokeStyle = 'rgba(44,33,24,0.35)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(bx, bl.y + bl.r * 1.18);
          ctx.quadraticCurveTo(bx + 5, bl.y + bl.r * 1.18 + 16, bx - 3, bl.y + bl.r * 1.18 + 34); ctx.stroke();
          ctx.fillStyle = bl.c;
          ctx.beginPath(); ctx.ellipse(bx, bl.y, bl.r * 0.82, bl.r, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.moveTo(bx, bl.y + bl.r); ctx.lineTo(bx - 4, bl.y + bl.r + 7); ctx.lineTo(bx + 4, bl.y + bl.r + 7); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath(); ctx.ellipse(bx - bl.r * 0.3, bl.y - bl.r * 0.35, bl.r * 0.2, bl.r * 0.3, -0.5, 0, Math.PI * 2); ctx.fill();
        }
        if (el < DUR) requestAnimationFrame(frame);
        else document.body.removeChild(cv);
      })(t0);
    } catch (e) {}
  }

  function statusCls(status) {
    if (status === 'Offer') return 'st-offer';
    if (status === 'Rejected') return 'st-rejected';
    if (status === 'Ghosted') return 'st-ghosted';
    if (String(status).indexOf('Interview') === 0) return 'st-int';
    return 'st-applied';
  }

  // ---- storage helpers ----
  function loadLook() {
    try {
      var v = localStorage.getItem('su_look');
      return (v && LOOKS[v]) ? v : 'original';
    } catch (e) { return 'original'; }
  }
  function loadRows() {
    try {
      if (window.SUStore && window.SUStore.view) return window.SUStore.view().tracker;
      var r = JSON.parse(localStorage.getItem('su_tracker') || '[]');
      return Array.isArray(r) ? r : [];
    } catch (e) { return []; }
  }
  function saveRows(rows) {
    if (window.SUStore) window.SUStore.saveTracker(rows); else localStorage.setItem('su_tracker', JSON.stringify(rows));
  }
  function accountKey() { try { return localStorage.getItem('su_sync_owner') || 'guest'; } catch(e) { return 'guest'; } }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso || '';
    var m = parseInt(p[1], 10), day = parseInt(p[2], 10);
    if (!m || !day) return iso;
    return MONTHS[m - 1] + ' ' + day;
  }
  function csvField(v) {
    v = String(v == null ? '' : v);
    // Spreadsheet apps can execute formula-like cell text even when it is CSV
    // quoted. Export it as literal text, including after whitespace or controls.
    if (/^[\s\x00-\x1f\x7f-\x9f]*[=+@-]/.test(v)) v = "'" + v;
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function linkKey(link) {
    var value = String(link || '').trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    try { return new URL(value).href; } catch (e) { return value; }
  }

  function captureFocus(board) {
    var active = document.activeElement;
    if (!active || !board.contains(active)) return null;
    return { id: active.id, row: active.getAttribute('data-id'), act: active.getAttribute('data-act'),
      tag: active.tagName, start: active.selectionStart, end: active.selectionEnd,
      direction: active.selectionDirection, scroll: active.scrollTop };
  }
  function restoreFocus(board, focus) {
    if (!focus) return;
    var target = focus.id ? document.getElementById(focus.id) : null;
    if (!target && (focus.row || focus.act)) {
      target = Array.from(board.querySelectorAll('[data-id], [data-act]')).find(function (el) {
        return el.tagName === focus.tag && el.getAttribute('data-id') === focus.row && el.getAttribute('data-act') === focus.act;
      });
    }
    if (!target && focus.row) target = document.getElementById('trk-add');
    if (!target) return;
    target.focus({ preventScroll: true });
    if (typeof focus.start === 'number' && target.setSelectionRange) {
      var length = target.value.length;
      target.setSelectionRange(Math.min(focus.start, length), Math.min(focus.end, length), focus.direction || 'none');
      target.scrollTop = focus.scroll;
    }
  }

  function statusShape(rows) {
    return JSON.stringify(rows.map(function (row) {
      return Object.keys(row).sort().filter(function (key) {
        return key !== 'status' && key !== 'updated';
      }).map(function (key) { return [key, row[key]]; });
    }));
  }

  var Trk = {
    rows: loadRows(),
    look: loadLook(),
    deleting: {},   // id -> true while the strike-through goodbye plays
    pendingRemoval: null, // explicit Yes/No choice, bound to the current account
    draft: {},
    formMessage: '',
    owner: accountKey(),
    accountGeneration: 0,
    noteDrafts: {},
    localChanged: false,
    writeError: '',
    renderedStatusShape: null,
    renderedStatuses: [],
    renderedOwner: null,
    renderedLook: null,

    syncStatus: function () {
      if(this.writeError)return this.writeError;
      if(!this.localChanged)return '';
      var auth=window.SUAuth, state=auth&&auth.syncState?auth.syncState():'';
      if(auth&&auth.signedIn&&auth.signedIn())return state==='synced'?'Tracker synced to your account.':state==='error'?'Tracker saved on this device. Account sync paused.':'Tracker saved on this device. Syncing…';
      return 'Tracker saved on this device.';
    },
    refreshStatus: function () {
      var text=document.getElementById('trk-sync-feedback'); if(text)text.textContent=this.syncStatus();
      var self=this,pending=Object.keys(this.noteDrafts).some(function(id){return self.rows.some(function(r){return r.id===id;});});
      var retry=document.getElementById('trk-sync-retry'); if(retry)retry.hidden=!(pending || window.SUAuth&&window.SUAuth.syncState&&window.SUAuth.syncState()==='error');
    },
    persistRows: function (rows) {
      try { saveRows(rows); this.rows=loadRows(); this.localChanged=true; this.writeError=''; this.refreshStatus(); return true; }
      catch(e) { this.writeError='Could not save this change on this device. Please try again.'; this.refreshStatus(); return false; }
    },

    counts: function () {
      var c = { total: this.rows.length, ints: 0, offers: 0, rejected: 0, ghosted: 0 };
      this.rows.forEach(function (r) {
        if (!r) return;
        if (String(r.status).indexOf('Interview') === 0) c.ints++;
        else if (r.status === 'Offer') c.offers++;
        else if (r.status === 'Rejected') c.rejected++;
        else if (r.status === 'Ghosted') c.ghosted++;
      });
      return c;
    },

    refreshStatusControls: function (changedId) {
      var board=document.getElementById('board');
      if(this.owner!==accountKey() || this.renderedOwner!==this.owner || this.renderedLook!==this.look ||
         this.pendingRemoval || Object.keys(this.deleting).length || this.renderedStatusShape!==statusShape(this.rows)) return false;
      var controls=Array.from(board.querySelectorAll('select.trk-status'));
      if(controls.length!==this.rows.length || controls.some(function(control,i){return control.getAttribute('data-id')!==this.rows[i].id;},this)) return false;
      var self=this;
      controls.forEach(function(control,i){
        var row=self.rows[i];
        // Keep the same native select and its focus. Replacing and refocusing it
        // during change can reopen a mobile picker. An unchanged sync echo must
        // also leave any not-yet-committed native selection alone.
        if(control.value!==row.status && (row.id===changedId || row.status!==self.renderedStatuses[i])) control.value=row.status;
        control.className='trk-status '+statusCls(row.status);
      });
      var counts=this.counts();
      [['total',counts.total],['interviews',counts.ints],['offers',counts.offers]].forEach(function(pair){
        var node=document.getElementById('trk-count-'+pair[0]);if(node)node.textContent=String(pair[1]);
      });
      this.renderedStatuses=this.rows.map(function(row){return row.status;});
      this.refreshStatus();
      return true;
    },

    refreshRows: function () {
      this.rows=loadRows();
      if(!this.refreshStatusControls()) this.render();
    },

    render: function (options) {
      var self = this;
      var board = document.getElementById('board');
      var focus = captureFocus(board);
      if(this.owner !== accountKey()) { this.owner=accountKey(); this.accountGeneration++; this.draft={}; this.noteDrafts={}; this.deleting={}; this.pendingRemoval=null; this.formMessage=''; this.writeError=''; this.localChanged=false; this.rows=loadRows(); options={clearDraft:true}; focus=null; }
      if(this.pendingRemoval && !this.rows.some(function(r){return r && r.id===self.pendingRemoval.id;})) this.pendingRemoval=null;
      if (options && options.clearDraft) this.draft = {};
      else ['trk-co', 'trk-role', 'trk-link'].forEach(function (id) {
        var input = document.getElementById(id);
        if (input) self.draft[id] = input.value;
      });
      var P = LOOKS[this.look] || LOOKS.original;

      board.className = 'board' + (P.cls ? ' ' + P.cls : '');
      document.body.className = (this.look === 'original') ? '' : ('theme-' + this.look);
      // theme colors flow into the class-styled bits (nav anchors, headings, pills)
      board.style.setProperty('--su-nav-bg', P.navBg);
      board.style.setProperty('--su-nav-ink', P.navInk);
      board.style.setProperty('--trk-ink', P.ink);
      board.style.setProperty('--trk-sub', P.sub);
      board.style.setProperty('--trk-acc', P.acc);
      board.style.setProperty('--trk-accink', P.accInk);
      board.style.setProperty('--trk-star', P.star);
      board.style.setProperty('--trk-hl', P.hl);

      var c = this.counts();
      var out = '';

      // ---- top nav (same structure as the jobs board: aboutcard + centered post-its) ----
      out += '<div style="max-width: 1240px; margin: 0 auto; padding: 26px 40px 0; position: relative; height: 100px; box-sizing: border-box;">' +
        '<button type="button" data-act="goHome" class="aboutcard" aria-label="Home" style="position: absolute; top: 22px; left: 40px; display: flex; align-items: center; gap: 12px; background: #E7D2A8; border:0; text-align:left; border-radius: 16px; padding: 9px 16px 9px 9px; cursor: pointer; box-shadow: 0 6px 18px rgba(44,33,24,0.16);">' +
          '<span style="display:block; width: 66px; height: 42px; border-radius: 11px; overflow: hidden; flex: none;">' +
            '<img src="assets/5037150f-ce24-477c-bae7-ef884fbc5849.jpg" alt="Nic" style="width: 100%; height: 100%; object-fit: cover; object-position: 50% 16%; transform: scale(1.55); transform-origin: 50% 26%;">' +
          '</span>' +
          '<span style="display:block; line-height: 1.2;">' +
            '<span style="display:block; font-size: 14px; font-weight: 700; color: #2A2118; font-family: \'Archivo\', sans-serif;">Nic, the founder</span>' +
            '<span style="display:block; font-size: 11px; font-weight: 500; color: #6F5E45; margin-top: 2px; font-family: \'Archivo\', sans-serif;">Currently at Instagram making 6 figures</span>' +
          '</span>' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="flex: none; margin-left: 2px;"><path d="M9 6l6 6-6 6" stroke="#6F5E45" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
        '</button>' +
        '<div class="su-main-nav" style="position: absolute; top: 22px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 18px;">' +
          '<a href="./jobs.html" class="postit trk-nav-a r2">Jobs</a>' +
          '<a href="./tracker.html" class="postit trk-nav-a r3">Tracker' + (this.rows.length ? ' (<span style="font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 16px;">' + (this.rows.length > 99 ? '99+' : this.rows.length) + '</span>)' : '') + '</a>' +
          '<a href="./internships.html" class="postit trk-nav-a r1">Internships</a>' +
          '<span class="su-account-slot"></span>' +
                  '</div>' +
      '</div>';

      // ---- header ----
      out += '<div class="trk-wrap">' +
        '<div class="trk-star">★ StillUnemployed.com</div>' +
        '<h1 class="trk-h1">Your <span class="trk-hlspan">Tracker</span>.</h1>' +
        '<div class="trk-tag">every job you apply to, one place, no spreadsheet ' + drawnArrow('right') + '</div>';

      // ---- summary pills + export ----
      out += '<div class="trk-pills">' +
        // ONE BAR, THREE NUMBERS (Nic, 2026-07-12). Was five pills: total / interviews / offers /
        // rejected / ghosted. "Rejected" and "Ghosted" were counters of how badly it's going, shown
        // to someone who is already living it. Nic cut Ghosted; I cut Rejected with it for the same
        // reason. The row still adds up (rejections are visible on the rows themselves), it just
        // doesn't lead with them.
        '<div class="trk-pill p1"><b id="trk-count-total">' + c.total + '</b><span>applied</span></div>' +
        '<div class="trk-pill p2"><b id="trk-count-interviews">' + c.ints + '</b><span>interviews</span></div>' +
        '<div class="trk-pill p3"><b id="trk-count-offers">' + c.offers + '</b><span>offers</span></div>' +
        '<button type="button" data-act="exportCsv" class="trk-export">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="flex: none;"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
          'Export CSV' +
        '</button>' +
      '</div>';

      out += '<p id="trk-sync-feedback" role="status" aria-live="polite">' + esc(this.syncStatus()) + '</p><button type="button" id="trk-sync-retry" data-act="retrySync" class="trk-export" hidden>Retry save</button>';
      Object.keys(this.noteDrafts).forEach(function(id){if(!self.rows.some(function(r){return r.id===id;}))out+='<aside class="trk-unsaved-note"><p>This application was removed elsewhere. Copy your unsaved note before leaving.</p><textarea readonly aria-label="Unsaved note from a removed application">'+esc(self.noteDrafts[id])+'</textarea><button type="button" data-act="dismissDraft" data-id="'+esc(id)+'">Dismiss note</button></aside>';});

      // ---- add-row form ----
      out += '<div class="trk-form">' +
        '<div class="trk-form-label" style="color: #1A1A1A;">applied somewhere else? log it ' + drawnArrow('down') + '</div>' +
        '<div class="trk-form-row">' +
          '<input id="trk-co" class="trk-input" aria-label="Company" placeholder="company" value="' + esc(this.draft['trk-co'] || '') + '">' +
          '<input id="trk-role" class="trk-input" aria-label="Role or job title" placeholder="role / job title" value="' + esc(this.draft['trk-role'] || '') + '">' +
          '<input id="trk-link" class="trk-input" aria-label="Posting link (optional)" inputmode="url" placeholder="link (optional)" value="' + esc(this.draft['trk-link'] || '') + '">' +
          '<button id="trk-add" type="button" data-act="addRow" class="trk-addbtn" aria-describedby="trk-form-feedback">+ add it</button>' +
        '</div>' +
        '<p id="trk-form-feedback" role="status" aria-live="polite" style="margin:8px 0 0;color:#6F5E45;">' + esc(this.formMessage) + '</p>' +
      '</div>';

      // ---- rows ----
      if (!this.rows.length) {
        // empty state (Nic, 2026-07-11): ONE lined-paper card with tape, nothing else.
        out += '<div class="trk-empty" style="position: relative;">' +
          '<div style="position: absolute; top: -13px; left: 50%; transform: translateX(-50%) rotate(-2.5deg); width: 110px; height: 26px; background: rgba(228,202,128,0.6); border-left: 1px dashed rgba(255,255,255,.5); border-right: 1px dashed rgba(255,255,255,.5); box-shadow: 0 1px 2px rgba(0,0,0,.08);"></div>' +
          '<div class="trk-empty-title">no applications tracked yet</div>' +
          '<div class="trk-empty-hint">apply to a job on the board, then hit <b>"I applied!"</b> — it shows up here on its own. or add one by hand above.</div>' +
        '</div>';
      } else {
        out += '<div class="trk-list">';
        this.rows.forEach(function (r) {
          if (!r) return;
          var del = !!self.deleting[r.id];
          var confirming = self.pendingRemoval && self.pendingRemoval.id === r.id;
          var lhref = String(r.link || '');
          if (lhref && !/^https?:\/\//i.test(lhref)) lhref = 'https://' + lhref;   // heal old scheme-less rows too
          var linkHtml = lhref
            ? '<a class="trk-linka" href="' + esc(lhref) + '" target="_blank" rel="noopener noreferrer">posting ' + drawnArrow('up') + '</a>'
            : '';
          var opts = STATUSES.map(function (s) {
            return '<option value="' + esc(s) + '"' + (r.status === s ? ' selected' : '') + '>' + esc(s) + '</option>';
          }).join('');
          out += '<div class="trk-row' + (del ? ' deleting' : '') + '" data-id="' + esc(r.id) + '">' +
            '<div class="trk-main">' +
              '<div class="trk-co">' + esc(r.company || '—') + '</div>' +
              '<div class="trk-role">' + esc(r.role || '') + (linkHtml ? '&nbsp;&nbsp;' + linkHtml : '') + '</div>' +
              '<div class="trk-src">' + (r.source === 'StillUnemployed' ? '<span style="color: var(--trk-star, #C2552F); font-family: \'Indie Flower\', cursive; font-weight: 700;">★</span> via StillUnemployed.com' : 'added by you') + '</div>' +
            '</div>' +
            '<div class="trk-date" title="date applied">' + esc(fmtDate(r.dateApplied)) + '</div>' +
            '<select class="trk-status ' + statusCls(r.status) + '" data-id="' + esc(r.id) + '" aria-label="Application status">' + opts + '</select>' +
            '<textarea class="trk-notes" data-id="' + esc(r.id) + '" rows="1" aria-label="Application notes" placeholder="notes... (recruiter name, next step)">' + esc(Object.prototype.hasOwnProperty.call(self.noteDrafts,r.id)?self.noteDrafts[r.id]:(r.notes || '')) + '</textarea>' +
            '<button type="button" class="trk-del" data-act="delRow" data-id="' + esc(r.id) + '" aria-label="Remove ' + esc(r.company || r.role || 'application') + ' from tracker" aria-expanded="' + !!confirming + '"' + (confirming ? ' aria-controls="trk-remove-confirm"' : '') + (del ? ' disabled' : '') + '>' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"></path></svg>' +
            '</button>' +
          '</div>';
        });
        out += '</div>';
      }

      out += '</div>'; // /.trk-wrap
      if(this.pendingRemoval) {
        var removing=this.rows.find(function(r){return r && r.id===self.pendingRemoval.id;});
        out+='<dialog id="trk-remove-confirm" class="trk-remove-confirm" data-pointer-opening="' + !!this.pendingRemoval.pointer + '" aria-modal="true" aria-labelledby="trk-remove-question" aria-describedby="trk-remove-context"><div class="trk-remove-paper"><h2 id="trk-remove-question">Are you sure you want to delete?</h2><p id="trk-remove-context">' + esc(removing.company || '') + (removing.company && removing.role ? ' · ' : '') + esc(removing.role || '') + '</p><div class="trk-remove-actions"><button type="button" data-act="cancelRemoval" data-id="' + esc(removing.id) + '" autofocus>No, keep it</button><button type="button" data-act="confirmRemoval" data-id="' + esc(removing.id) + '" class="trk-remove-yes">Yes, delete</button></div></div></dialog>';
      }
      board.innerHTML = out;
      var confirmation=document.getElementById('trk-remove-confirm');
      if(confirmation) confirmation.showModal();
      // Notes fit their content without an unlabeled expand/collapse control.
      var opens = board.querySelectorAll('textarea.trk-notes');
      for (var oi = 0; oi < opens.length; oi++) {
        sizeNote(opens[oi]);
      }
      restoreFocus(board, focus);
      this.renderedStatusShape=statusShape(this.rows);
      this.renderedStatuses=this.rows.map(function(row){return row.status;});
      this.renderedOwner=this.owner;
      this.renderedLook=this.look;
      this.refreshStatus();
    },

    addRow: function () {
      var co = (document.getElementById('trk-co') || {}).value || '';
      var role = (document.getElementById('trk-role') || {}).value || '';
      var link = (document.getElementById('trk-link') || {}).value || '';
      co = co.trim(); role = role.trim(); link = link.trim();
      // hand-typed links usually come without a scheme ("nicholasalexis.com") — without this
      // they render as RELATIVE urls (localhost:8000/nicholasalexis.com → 404)
      if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
      if (!co && !role) {
        var inp = document.getElementById('trk-co');
        if (inp) inp.focus();
        return;
      }
      // Another tab may have just logged the same posting. Keep its status and
      // notes intact, and make the duplicate visible instead of losing it on sync.
      this.rows = loadRows();
      if (link && !window.SUJobIdentity) {
        this.formMessage = 'Could not check this job link. Reload and try again.';
        this.render();
        return;
      }
      if (link && this.rows.some(function (r) { return r && (linkKey(r.link) === linkKey(link) || window.SUJobIdentity.equivalent(linkKey(r.link), linkKey(link))); })) {
        this.formMessage = 'That posting is already in your tracker. Your existing application is unchanged.';
        this.render();
        return;
      }
      var nextRows=this.rows.slice();
      nextRows.unshift({
        id: 'su-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        company: co, role: role, link: link,
        source: 'Me', dateApplied: todayISO(), status: 'Applied', notes: ''
      });
      if(!this.persistRows(nextRows)) { this.formMessage=this.writeError; this.render(); return; }
      // analytics (js/analytics.js): manual add — additive no-op without it
      if (typeof window.suTrack === 'function') window.suTrack('tracker-add', '', '', '');
      this.formMessage = '';
      this.render({ clearDraft: true });
      var again = document.getElementById('trk-co');
      if (again) again.focus();
    },

    delRow: function (id, pointer) {
      if(this.owner!==accountKey()) { this.render(); return; }
      if(this.deleting[id] || !loadRows().some(function(r){return r && r.id===id;})) return;
      this.pendingRemoval={id:id,owner:this.owner,generation:this.accountGeneration,pointer:!!pointer};
      this.render();
      this.focusRowAction(id,'cancelRemoval');
    },

    focusRowAction: function (id, action) {
      var board=document.getElementById('board');
      var target=Array.from(board.querySelectorAll('[data-id], [data-act]')).find(function(el){return el.tagName==='BUTTON' && el.getAttribute('data-id')===id && el.getAttribute('data-act')===action;});
      if(!target) target=document.getElementById('trk-add');
      if(target) target.focus({preventScroll:true});
    },

    cancelRemoval: function (id) {
      if(!this.pendingRemoval || this.pendingRemoval.id!==id) return;
      this.pendingRemoval=null;
      this.render();
      this.focusRowAction(id,'delRow');
    },

    // Only an explicit Yes starts the existing strike-through removal.
    confirmRemoval: function (id) {
      var self = this;
      var pending=this.pendingRemoval;
      if(!pending || pending.id!==id || pending.owner!==accountKey() || pending.generation!==this.accountGeneration) { this.pendingRemoval=null; this.render(); return; }
      this.pendingRemoval=null;
      if (this.deleting[id] || !loadRows().some(function(r){return r && r.id===id;})) { this.render(); return; }
      var owner=accountKey(), generation=this.accountGeneration;
      this.deleting[id] = true;
      this.render();
      // Keep keyboard focus on a live control while the old card fades away.
      var next=this.rows.find(function(r){return r && r.id!==id && !self.deleting[r.id];});
      this.focusRowAction(next && next.id,'delRow');
      setTimeout(function () {
        if(owner!==accountKey() || generation!==self.accountGeneration)return;
        var remaining=loadRows().filter(function (r) { return r && r.id !== id; });
        delete self.deleting[id];
        if(!self.persistRows(remaining)) { self.render(); self.focusRowAction(id,'delRow'); return; }
        delete self.noteDrafts[id];
        if(window.SUAnalytics)window.SUAnalytics.emit('tracker_delete',{});
        self.render();
      }, 650);
    },

    setField: function (id, field, value) {
      var changed=false, next=JSON.parse(JSON.stringify(this.rows));
      next.forEach(function(r){if(r&&r.id===id&&r[field]!==value){r[field]=value;r.updated=new Date().toISOString();changed=true;}});
      if(!changed)return false;
      if(!this.persistRows(next)){if(field==='notes')this.noteDrafts[id]=value;this.refreshStatus();return false;}
      if(field==='notes'){delete this.noteDrafts[id];if(window.SUAnalytics&&!this._noteMeasured){this._noteMeasured=true;window.SUAnalytics.emit('tracker_note_edit',{});}}
      this.refreshStatus();return true;
    },

    retrySave: function () {
      var self=this;Object.keys(this.noteDrafts).forEach(function(id){self.setField(id,'notes',self.noteDrafts[id]);});
      if(window.SUAuth&&window.SUAuth.retrySync)window.SUAuth.retrySync();
      this.refreshStatus();
    },

    exportCsv: function () {
      var head = ['Company', 'Role', 'Link', 'Source', 'Date Applied', 'Status', 'Notes'];
      var lines = [head.join(',')];
      this.rows.forEach(function (r) {
        if (!r) return;
        lines.push([r.company, r.role, r.link, r.source, r.dateApplied, r.status, r.notes].map(csvField).join(','));
      });
      var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'stillunemployed-tracker.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 500);
      // analytics: CSV export — additive
      if (typeof window.suTrack === 'function') window.suTrack('tracker-export', '', '', '');
    },

    bindEvents: function () {
      var self = this;

      document.addEventListener('click', function (e) {
        if(e.target.id==='trk-remove-confirm' && self.pendingRemoval) { self.cancelRemoval(self.pendingRemoval.id); return; }
        var el = e.target.closest('[data-act]');
        if (!el) return;
        switch (el.getAttribute('data-act')) {
          case 'goHome': location.href = './index.html'; break;
          case 'addRow': self.addRow(); break;
          case 'retrySync': self.retrySave(); break;
          case 'dismissDraft': delete self.noteDrafts[el.getAttribute('data-id')]; self.render(); break;
          case 'delRow': self.delRow(el.getAttribute('data-id'), e.detail > 0); break;
          case 'cancelRemoval': self.cancelRemoval(el.getAttribute('data-id')); break;
          case 'confirmRemoval': self.confirmRemoval(el.getAttribute('data-id')); break;
          case 'exportCsv': self.exportCsv(); break;
        }
      });

      // status dropdown + inline notes (delegated change, like app.js's selects)
      document.addEventListener('change', function (e) {
        var t = e.target;
        if (!t) return;
        if (t.classList && t.classList.contains('trk-status')) {
          if(self.owner!==accountKey() || !document.getElementById('board').contains(t)) { self.refreshRows(); return; }
          var id=t.getAttribute('data-id'),value=t.value;
          var saved=self.setField(id, 'status', value);
          if (saved && typeof window.suTrack === 'function') window.suTrack('tracker-status', '', value, '');
          if(!self.refreshStatusControls(id)) self.render();
          if (saved && value === 'Offer') suOfferParty((LOOKS[self.look] || LOOKS.original).acc);   // 🎈🎆
        } else if (t.classList && t.classList.contains('trk-notes')) {
          self.setField(t.getAttribute('data-id'), 'notes', t.value); // no re-render; keep typing flow
        }
      });

      // Notes stay readable on blur and grow vertically while typing.
      document.addEventListener('input', function (e) {
        var t = e.target;
        if (t && (t.id === 'trk-co' || t.id === 'trk-role' || t.id === 'trk-link')) {
          self.draft[t.id] = t.value;
          self.formMessage = '';
          var feedback = document.getElementById('trk-form-feedback');
          if (feedback) feedback.textContent = '';
        }
        if (t && t.classList && t.classList.contains('trk-notes')) {
          self.setField(t.getAttribute('data-id'), 'notes', t.value);   // save as they type
          sizeNote(t);
        }
      });
      document.addEventListener('focusin', function (e) { sizeNote(e.target); });

      document.addEventListener('cancel', function(e) {
        if(e.target.id==='trk-remove-confirm' && self.pendingRemoval) { e.preventDefault(); self.cancelRemoval(self.pendingRemoval.id); }
      },true);

      // Enter in any form input = add the row
      document.addEventListener('keydown', function (e) {
        if(self.pendingRemoval && self.pendingRemoval.pointer) {
          self.pendingRemoval.pointer=false;
          var pointerDialog=document.getElementById('trk-remove-confirm');
          if(pointerDialog) pointerDialog.removeAttribute('data-pointer-opening');
        }
        if(e.key==='Escape' && self.pendingRemoval) { e.preventDefault(); self.cancelRemoval(self.pendingRemoval.id); return; }
        if(e.key==='Tab' && self.pendingRemoval) {
          var confirmation=document.getElementById('trk-remove-confirm');
          var choices=confirmation ? Array.from(confirmation.querySelectorAll('button:not(:disabled)')) : [];
          if(choices.length) {
            e.preventDefault();
            var current=choices.indexOf(document.activeElement);
            var next=e.shiftKey ? (current<=0 ? choices.length-1 : current-1) : (current+1)%choices.length;
            choices[next].focus({preventScroll:true});
          }
          return;
        }
        if (e.key !== 'Enter' || !e.target || !e.target.id) return;
        if (e.target.id === 'trk-co' || e.target.id === 'trk-role' || e.target.id === 'trk-link') {
          e.preventDefault();
          self.addRow();
        }
      });

      window.addEventListener('su:sync-status', function () { self.refreshStatus(); });
      window.addEventListener('su:auth-changed', function () { self.refreshRows(); });
      window.addEventListener('su:data-sync', function () { self.refreshRows(); });
      window.addEventListener('pageshow', function (e) { if(e.persisted) self.refreshRows(); });
      // A narrower viewport wraps notes onto more lines without replacing the field.
      window.addEventListener('resize', function () {
        Array.from(document.getElementById('board').querySelectorAll('textarea.trk-notes')).forEach(sizeNote);
      });

      // if the board tab logs an application while this tab is open, pick it up
      window.addEventListener('storage', function (e) {
        if (e.key === 'su_tracker' || e.key === 'su_sync_owner') self.refreshRows();
        if (e.key === 'su_look') { self.look = loadLook(); self.render(); }
      });
    },

    init: function () {
      this.bindEvents();
      this.render();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { Trk.init(); });
  } else {
    Trk.init();
  }

  // expose for debugging / console checks
  window.SUTracker = Trk;
})();
