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
      theme: new URLSearchParams(location.search).get('theme'),
      saved: loadSaved(),
      savedOnly: false,
      openNotes: {},
      openPanel: null,
      modalOpen: false,
      feedbackOpen: false,
      feedbackCo: '',
      // "Change Look?" visual theme: 'original' | 'cod' (WW2) | 'girly'.
      // Loaded from localStorage so the choice sticks across reloads + pages.
      look: loadLook(),
      lookOpen: false
    },

    // ---- "Change Look?" palettes — values copied VERBATIM from MAIN FILE.dc.html ----
    THEMES: {
      cod:      { acc:'#555B38', accInk:'#EDE7CF', cls:'cod',   ink:'#E9E3D2', sub:'#AEB29B', pay:'#AEB29B', show:'#AEB29B', navBg:'#5C6B3A', navInk:'#EDE7CF', hl:'rgba(120,140,75,0.92)', hiCard:'linear-gradient(160deg,#5C6440 0%,#4B5234 100%)', hiInk:'#F1E9D8', hiApply:'#FFFFFF', hiStamp:'#FFFFFF', payHi:'linear-gradient(160deg,#5C6440,#4B5234)' },
      girly:    { acc:'#E84B9C', accInk:'#FFF3FA', cls:'girly', ink:'#2A0E1E', sub:'#8A2B5E', pay:'#8A2B5E', show:'#8A2B5E', navBg:'#F25CA2', navInk:'#FFFFFF', hl:'rgba(233,59,146,0.92)', hiCard:'linear-gradient(160deg,#FF77BC 0%,#F23E98 100%)', hiInk:'#3A0E26', hiApply:'#3A0E26', hiStamp:'#3A0E26', payHi:'linear-gradient(160deg,#FF77BC,#F23E98)' },
      original: { acc:'#F2E14B', accInk:'#2A2118', cls:'',      ink:'#2A2118', sub:'#6F5E45', pay:'#9C8367', show:'#7A6650', navBg:'#EDE93B', navInk:'#1f1c14', hl:'rgba(238,224,70,0.95)', hiCard:'linear-gradient(160deg,#F6E85F 0%,#EFDB3D 100%)', hiInk:'#2A2118', hiApply:'#D8502E', hiStamp:'#3A2A1B', payHi:'linear-gradient(160deg,#F6E85F,#EFDB3D)' }
    },

    themeDefs: {
      social: { label: 'Social & adjacent', cats: ['Social'], kw: ['social', 'community'] },
      copy: { label: 'Copywriting & content', cats: ['Content & Copy'], kw: ['copy', 'content', 'writer', 'sheditor'] },
      brand: { label: 'Branding', cats: ['Brand & Marketing'], kw: ['brand'] },
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
      { w: 52, pos: { top: '-40px', right: '-14px' }, parts: [
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
        if (hay.indexOf(q) === -1) return false;
      }
      if (this.state.ws !== 'Any' && j.style !== this.state.ws) return false;
      if (this.state.st !== 'all' && j.state !== this.state.st) return false;
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
      this.setState({ saved: saved });
    },

    // apply a "Change Look?" theme, close the modal, and persist site-wide
    setLook: function (look) {
      if (look !== 'cod' && look !== 'girly') look = 'original';
      try { localStorage.setItem('su_look', look); } catch (e) {}
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

    // ---- the big one: compute everything needed to render (ports renderVals) ----
    computeShown: function () {
      var self = this;
      var base = this.jobs.filter(function (j) { return self.matchesBase(j); });
      var cat = this.state.cat;
      var shown = base.filter(function (j) { return cat === 'all' || j.ind === cat; });
      if (this.state.savedOnly) shown = shown.filter(function (j) { return !!self.state.saved[j.link]; });

      // lead with a 100K+ role so the first card always carries a note
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
        // high-pay cards take their ink/bg/apply/stamp from the active theme palette
        var ink = (tier === 'high') ? P.hiInk : '#3A2A1B';
        var bg = tier === 'low'
          ? 'linear-gradient(160deg,#ECDEC6 0%,#E0D0B2 100%)'
          : tier === 'mid'
          ? 'linear-gradient(160deg,#E0CBA2 0%,#D3BB8C 100%)'
          : P.hiCard;
        var applyColor = (tier === 'high') ? P.hiApply : '#D8502E';
        var stampColor = (tier === 'high') ? P.hiStamp : '#3A2A1B';
        var gStamp = (tier === 'high') ? '#FFFFFF' : '#C24A78'; // girly heart-stamp color
        var hasNote = !!noteFor[k];
        var slot = k % 6;
        var pin = !hasNote && slot === 0;
        var tape = !hasNote && slot === 2;
        var doodleOn = !hasNote && slot === 4;
        var pick = !!j.pick;
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
        if (shown.length <= 2) {
          doodleHtml = cod ? self.codDoodleEl(1) : (girly ? self.girlyDoodleEl(0) : self.doodleEl(13));
        } else if (doodleOn) {
          doodleHtml = cod ? self.codDoodleEl(Math.floor(k / 6)) : (girly ? self.girlyDoodleEl(Math.floor(k / 6)) : self.doodleEl(k));
        }

        var pinStyle = 'position:absolute; top:-9px; left:50%; transform:translateX(-50%); width:17px; height:17px; ' +
          'border-radius:50%; background:radial-gradient(circle at 35% 30%, rgba(255,255,255,.7), ' + pinColor +
          ' 58%); box-shadow:0 3px 5px rgba(0,0,0,.32); z-index:3;';

        // -- build the card HTML (mirrors the template's sc-if branches) --
        var html = '<div class="note" data-act="openJob" data-id="' + id + '" data-link="' + esc(j.link) + '" data-co="' + esc(j.co) + '" style="' + noteStyle + '">';

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
        if (pick) html += '<div style="position: absolute; top: -17px; left: -10px; transform: rotate(-13deg); font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 24px; color: #D8502E; z-index: 4; white-space: nowrap;">pick! ★</div>';

        // bookmark button
        html += '<div data-act="toggleSave" data-link="' + esc(j.link) + '" class="bmbtn" style="position: absolute; top: 14px; right: 14px; z-index: 5; cursor: pointer; display: flex; align-items: center; justify-content: center; flex: none;">' +
          '<svg width="19" height="19" viewBox="0 0 24 24" fill="' + bmColor + '" stroke="' + bmStroke + '" stroke-width="1.7"><path d="M6 3.5h12a.8.8 0 0 1 .8.8v16.2l-6.8-3.9-6.8 3.9V4.3a.8.8 0 0 1 .8-.8z"></path></svg>' +
        '</div>';

        // company + role
        html += '<div style="display: flex; align-items: flex-start; gap: 10px; padding-right: 30px;">' +
            '<div style="font-family: \'Archivo Black\', \'Archivo\', sans-serif; font-weight: 900; font-size: 23px; line-height: 1.13; letter-spacing: -0.4px;"><span style="">' + esc(j.co) + '</span></div>' +
          '</div>' +
          '<div style="font-family: \'Archivo\', sans-serif; font-weight: 600; font-size: 16.5px; margin-top: 9px; line-height: 1.3;">' + esc(j.role) + '</div>' +
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
      var savedLabel = this.state.savedOnly ? ('Saved (' + savedCount + ') ✕') : ('Saved (' + savedCount + ')');

      // "Change Look?" toolbar button (base + open/closed colors, ported verbatim)
      var changeLookBtnBase = "display:inline-flex; align-items:center; gap:7px; font-family:'Indie Flower',cursive; font-weight:700; font-size:19px; padding:11px 16px; transform:rotate(-3deg); box-shadow:2px 4px 9px rgba(44,33,24,0.2); white-space:nowrap; position:relative; top:8px; flex:none; cursor:pointer; border-radius:2px;";
      var changeLookBtnStyle = changeLookBtnBase + (this.state.lookOpen ? 'background:#2A2118; color:#F4E9C9;' : 'background:#E7D2A8; color:#3A2A1B;');

      var curCat = this.catList().find(function (c) { return c.match === self.state.cat; }) || this.catList()[0];
      var catBtnLabel = this.state.cat === 'all' ? 'all roles' : curCat.label;
      var filterCount = (this.state.ws !== 'Any' ? 1 : 0) + (this.state.st !== 'all' ? 1 : 0) + (this.state.pr !== 'Any' ? 1 : 0);

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
        '<div style="position: absolute; top: 22px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 18px;">' +
          '<a href="./index.html" class="postit" style="--r: -3deg; background: ' + navBg + '; color: ' + navInk + '; font-family: \'Indie Flower\', cursive; font-size: 21px; letter-spacing: 0.01em; padding: 10px 20px; cursor: pointer; text-decoration: none; display: inline-block;">Home</a>' +
          '<a href="./jobs.html" class="postit" style="--r: 2.5deg; background: ' + navBg + '; color: ' + navInk + '; font-family: \'Indie Flower\', cursive; font-size: 21px; letter-spacing: 0.01em; padding: 10px 20px; cursor: pointer; text-decoration: none; display: inline-block;">Jobs</a>' +
          '<a href="https://jobhuntrecipe.com/p/jobs-ghost-more-than-hinge-issue-1" target="_blank" rel="noopener" class="postit" style="--r: -2deg; background: ' + navBg + '; color: ' + navInk + '; font-family: \'Indie Flower\', cursive; font-size: 21px; letter-spacing: 0.01em; padding: 10px 20px; cursor: pointer; text-decoration: none;">Advice</a>' +
        '</div>' +
      '</div>';

      // header
      out += '<div style="max-width: 1240px; margin: 0 auto; padding: 30px 40px 0; box-sizing: border-box;">' +
        '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;">' +
          '<div style="position: relative;">' +
            '<div style="font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 22px; color: ' + (girly ? '#D6277E' : '#C2552F') + '; transform: rotate(-2deg); display: inline-block;">★ StillUnemployed.com</div>' +
            '<h1 style="font-family: \'Archivo Black\', \'Archivo\', sans-serif; font-weight: 900; font-size: 66px; line-height: 0.95; letter-spacing: -0.03em; color: ' + boardInk + '; margin: 8px 0 0; max-width: 760px;">Roles I\'d <span style="-webkit-box-decoration-break: clone; box-decoration-break: clone; padding: 0 .12em; background: linear-gradient(98deg, transparent 1.5%, ' + HLC + ' 1.5% 98.5%, transparent 98.5%); background-repeat: no-repeat; background-size: 100% 62%; background-position: 0 80%;">actually</span> apply to.</h1>' +
            '<div style="font-family: \'Indie Flower\', cursive; font-size: 22px; color: ' + subInk + '; margin-top: 14px; transform: rotate(-0.6deg);">every single one opened &amp; checked by a human (me) updated weekly →</div>' +
          '</div>' +
          '<div style="display: flex; align-items: flex-start; gap: 12px; flex: none;">' +
            '<div data-act="openLook" class="tab" style="' + changeLookBtnStyle + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex: none;"><path d="M4 7l5-3 6 3 5-3v13l-5 3-6-3-5 3V7z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"></path><path d="M9 4v13M15 7v13" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"></path></svg>Need a change?</div>' +
            '<div data-act="toggleSavedOnly" class="tab" style="' + savedBtnStyle + '">' + esc(savedLabel) + '</div>' +
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
          '<div style="font-family: \'Indie Flower\', cursive; font-size: 19px; color: #2A2118;">how do you wanna work?</div>' +
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
        '<span style="font-family: \'Indie Flower\', cursive; font-size: 17px; color: ' + payKeyInk + ';">pay key →</span>' +
        '<div style="display: flex; align-items: center; gap: 7px;"><span style="width: 16px; height: 16px; border-radius: 3px; background: linear-gradient(160deg,#ECDEC6,#E0D0B2); box-shadow: 1px 1px 2px rgba(44,33,24,.18);"></span><span style="font-family: \'Indie Flower\', cursive; font-size: 17px; color: ' + boardInk + ';">under $80K</span></div>' +
        '<div style="display: flex; align-items: center; gap: 7px;"><span style="width: 16px; height: 16px; border-radius: 3px; background: linear-gradient(160deg,#E0CBA2,#D3BB8C); box-shadow: 1px 1px 2px rgba(44,33,24,.18);"></span><span style="font-family: \'Indie Flower\', cursive; font-size: 17px; color: ' + boardInk + ';">$80–99K</span></div>' +
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

      board.innerHTML = out;

      // restore focus + caret to the search input after re-render
      var inp = document.getElementById('su-search');
      if (inp && this._searchFocused) {
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
        out += '<div data-act="closeModal" style="position: fixed; inset: 0; z-index: 200; background: rgba(44,33,24,0.58); display: flex; align-items: center; justify-content: center; padding: 24px;">' +
          '<div data-act="stop" style="width: 600px; max-width: 100%; background: #F4EEE2; border-radius: 26px; overflow: hidden; position: relative; box-shadow: 0 40px 90px rgba(44,33,24,0.4); transform: rotate(-0.6deg);">' +
            '<div data-act="closeModal" style="position: absolute; top: 18px; right: 18px; width: 38px; height: 38px; border-radius: 50%; background: rgba(244,238,226,0.92); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 3; box-shadow: 0 2px 8px rgba(44,33,24,0.18);">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#5C4033" stroke-width="2.2" stroke-linecap="round"></path></svg>' +
            '</div>' +
            '<div style="width: 100%; height: 264px; background: #E8D9C5; overflow: hidden;">' +
              '<img src="assets/5037150f-ce24-477c-bae7-ef884fbc5849.jpg" alt="Nic, the founder, on SiriusXM" style="width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; filter: saturate(1.04) brightness(1.02);">' +
            '</div>' +
            '<div style="padding: 32px 44px 40px;">' +
              '<div style="font-family: \'Archivo Black\', sans-serif; font-weight: 900; font-size: 32px; line-height: 1.06; letter-spacing: -0.02em; color: #2C2118; width: 300px;">Hey, I\'m Nic. I built this.</div>' +
              '<div style="font-size: 15.5px; line-height: 1.62; color: #3a3026; font-weight: 500; margin-top: 16px;">I sent 1,500 applications and got ghosted more times than I can count. Seven months later, Instagram said yes. StillUnemployed is the board I wish I\'d had. Every role here is opened and verified by a human, and that human is me. No ghost listings, no AI slop, just jobs I\'d actually apply to.</div>' +
              '<div style="display: flex; align-items: center; gap: 9px; margin-top: 20px;">' +
                '<div style="width: 20px; height: 20px; border-radius: 50%; background: #E8502E; display: flex; align-items: center; justify-content: center; flex: none;">' +
                  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="#F4EEE2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                '</div>' +
                '<div style="font-size: 13px; font-weight: 600; color: #6f6253; letter-spacing: 0.01em;">Content Specialist at Instagram · Class of 2025</div>' +
              '</div>' +
              '<a href="./index.html" style="display: inline-flex; align-items: center; gap: 11px; background: #5C4033; color: #F4EEE2; font-size: 16px; font-weight: 700; padding: 15px 26px; border-radius: 14px; cursor: pointer; margin-top: 24px; box-shadow: 0 10px 24px rgba(44,33,24,0.22); text-decoration: none; font-family: \'Archivo\', sans-serif;">Read the full story' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#F4EEE2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
              '</a>' +
            '</div>' +
          '</div>' +
        '</div>';
      }

      // apply feedback popup
      if (this.state.feedbackOpen) {
        out += '<div data-act="closeFeedback" style="position: fixed; inset: 0; z-index: 210; background: rgba(44,33,24,0.58); display: flex; align-items: center; justify-content: center; padding: 24px;">' +
          '<div data-act="stop" style="width: 460px; max-width: 100%; background: #F4EEE2; border-radius: 8px; padding: 30px 30px 28px; position: relative; box-shadow: 0 40px 90px rgba(44,33,24,0.4); transform: rotate(-0.7deg);">' +
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
              '<div data-act="closeFeedback" class="fbopt" style="flex: 1; cursor: pointer; background: #ECDBB7; border-radius: 6px; padding: 22px 14px 18px; text-align: center; transform: rotate(1.6deg); box-shadow: 2px 4px 9px rgba(44,33,24,0.16);">' +
                '<div style="width: 40px; height: 40px; border-radius: 50%; background: #D8502E; display: flex; align-items: center; justify-content: center; margin: 0 auto;">' +
                  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 7H6.5a3.5 3.5 0 0 0 0 7H9M15 7h2.5a3.5 3.5 0 0 1 0 7H15M9 10.5h2M4 4l16 16" stroke="#F4EEE2" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                '</div>' +
                '<div style="font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 15px; color: #3A2A1B; margin-top: 12px;">Job link broken</div>' +
              '</div>' +
            '</div>' +
            '<div data-act="closeFeedback" style="margin-top: 18px; text-align: center; font-family: \'Indie Flower\', cursive; font-size: 19px; color: #8A7558; cursor: pointer;">job wasn\'t a right fit →</div>' +
          '</div>' +
        '</div>';
      }

      // "Change Look?" popup (markup + copy ported verbatim from MAIN FILE)
      if (this.state.lookOpen) {
        out += '<div data-act="closeLook" style="position: fixed; inset: 0; z-index: 210; background: rgba(44,33,24,0.58); display: flex; align-items: center; justify-content: center; padding: 24px;">' +
          '<div data-act="stop" style="width: 560px; max-width: 100%; background: #F4EEE2; border-radius: 8px; padding: 30px 30px 28px; position: relative; box-shadow: 0 40px 90px rgba(44,33,24,0.4); transform: rotate(-0.7deg);">' +
            '<div data-act="closeLook" style="position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 50%; background: rgba(44,33,24,0.06); display: flex; align-items: center; justify-content: center; cursor: pointer;">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#5C4033" stroke-width="2.2" stroke-linecap="round"></path></svg>' +
            '</div>' +
            '<div style="font-family: \'Indie Flower\', cursive; font-weight: 700; font-size: 27px; color: #2A2118; line-height: 1.1; transform: rotate(-1deg);">change the look?</div>' +
            '<div style="font-family: \'Indie Flower\', cursive; font-size: 19px; color: #6F5E45; margin-top: 6px;">pick a vibe for the board ↓</div>' +
            '<div style="display: flex; gap: 14px; margin-top: 22px;">' +
              // --- WW2 themed ---
              '<div data-act="pickCod" class="fbopt" style="flex: 1; cursor: pointer; position: relative; background: #555B38; border-radius: 4px; padding: 16px 10px 14px; min-height: 162px; display: flex; flex-direction: column; align-items: center; text-align: center; transform: rotate(-2deg); box-shadow: 2px 5px 11px rgba(44,33,24,0.22); box-sizing: border-box;">' +
                '<div style="position: absolute; top: -9px; left: 50%; transform: translateX(-50%) rotate(-3deg); width: 54px; height: 16px; background: rgba(228,202,128,0.5); box-shadow: 0 1px 2px rgba(0,0,0,.1);"></div>' +
                '<div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">' +
                  '<div style="display: inline-flex; align-items: center; gap: 6px; border: 2.4px solid #FFFFFF; color: #FFFFFF; border-radius: 4px; padding: 5px 9px; font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 9px; text-transform: uppercase; letter-spacing: .14em; opacity: .92; transform: rotate(-9deg); box-shadow: 0 0 0 1.5px rgba(255,255,255,0.16); background: rgba(255,255,255,0.04);">' +
                    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="flex: none;"><circle cx="12" cy="12" r="10" fill="none" stroke="#FFFFFF" stroke-width="1.7" stroke-dasharray="53 10" stroke-dashoffset="20"></circle><path d="M12 5.2 L13.59 9.82 L18.47 9.9 L14.57 12.83 L16 17.5 L12 14.7 L8 17.5 L9.43 12.83 L5.53 9.9 L10.41 9.82 Z" fill="#FFFFFF"></path></svg>' +
                    'Human Verified' +
                  '</div>' +
                '</div>' +
                '<div style="font-family: \'Black Ops One\', \'Archivo Black\', sans-serif; font-size: 16px; color: #FFFFFF; letter-spacing: 0.6px; line-height: 1; text-transform: uppercase; text-shadow: 0 1px 1px rgba(0,0,0,0.28);">WW2 Themed</div>' +
              '</div>' +
              // --- Original ---
              '<div data-act="pickOriginal" class="fbopt" style="flex: 1; cursor: pointer; position: relative; background: #F2E14B; border-radius: 4px; padding: 16px 10px 14px; min-height: 162px; display: flex; flex-direction: column; align-items: center; text-align: center; transform: rotate(1.6deg); box-shadow: 2px 5px 11px rgba(44,33,24,0.22); box-sizing: border-box;">' +
                '<div style="position: absolute; top: -9px; left: 50%; transform: translateX(-50%) rotate(2deg); width: 54px; height: 16px; background: rgba(228,202,128,0.55); box-shadow: 0 1px 2px rgba(0,0,0,.1);"></div>' +
                '<div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">' +
                  '<div style="display: inline-flex; align-items: center; gap: 5px; border: 1.8px solid #3A2A1B; color: #3A2A1B; border-radius: 4px; padding: 4px 8px; font-family: \'Archivo\', sans-serif; font-weight: 800; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; opacity: .72; transform: rotate(-4deg);">' +
                    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" style="flex: none;"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.4"></circle><path d="M8.3 12.2l2.4 2.4 4.9-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                    'Human Verified' +
                  '</div>' +
                '</div>' +
                '<div style="font-family: \'Archivo Black\', sans-serif; font-size: 18px; color: #2A2118; letter-spacing: -0.3px; line-height: 1.05;">Original version</div>' +
              '</div>' +
              // --- For the girlies ---
              '<div data-act="pickGirly" class="fbopt" style="flex: 1; cursor: pointer; position: relative; background: #EFAEC4; border-radius: 4px; padding: 16px 10px 14px; min-height: 162px; display: flex; flex-direction: column; align-items: center; text-align: center; transform: rotate(-1.4deg); box-shadow: 2px 5px 11px rgba(44,33,24,0.22); box-sizing: border-box;">' +
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
            '</div>' +
            '<div data-act="closeLook" style="margin-top: 18px; text-align: center; font-family: \'Indie Flower\', cursive; font-size: 19px; color: #8A7558; cursor: pointer;">keep it as is →</div>' +
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

        switch (act) {
          case 'openModal': self.setState({ modalOpen: true }); break;
          case 'closeModal': self.setState({ modalOpen: false }); break;
          case 'closeFeedback': self.setState({ feedbackOpen: false }); break;
          case 'markApplied': self.setState({ feedbackOpen: false }); break;
          case 'stop': e.stopPropagation(); break;

          case 'toggleSavedOnly': self.setState({ savedOnly: !self.state.savedOnly }); break;

          // "Change Look?" modal open/close + pick a theme (persisted to localStorage)
          case 'openLook': self.setState({ lookOpen: true }); break;
          case 'closeLook': self.setState({ lookOpen: false }); break;
          case 'pickOriginal': self.setLook('original'); break;
          case 'pickCod': self.setLook('cod'); break;
          case 'pickGirly': self.setLook('girly'); break;
          case 'toggleCat': self.setState({ openPanel: self.state.openPanel === 'cat' ? null : 'cat' }); break;
          case 'toggleFilters': self.setState({ openPanel: self.state.openPanel === 'filters' ? null : 'filters' }); break;
          case 'clearAll': self.setState({ ws: 'Any', st: 'all', pr: 'Any', theme: null }); break;

          case 'cat': self.setState({ cat: el.getAttribute('data-val'), openPanel: null }); break;
          case 'ws': self.setState({ ws: el.getAttribute('data-val') }); break;
          case 'pr': self.setState({ pr: el.getAttribute('data-val') }); break;

          case 'chipTheme': self.setState({ theme: null }); break;
          case 'chipWs': self.setState({ ws: 'Any' }); break;
          case 'chipPr': self.setState({ pr: 'Any' }); break;
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
            // anchor handles the actual navigation (target=_blank); we only
            // fire the feedback popup, mirroring card.onApply.
            e.stopPropagation();
            self.setState({ feedbackOpen: true, feedbackCo: el.getAttribute('data-co') });
            break;
          }

          case 'openJob': {
            // clicking the card body: open link in a new tab + feedback popup,
            // unless a note on this card is open/closing (mirrors openJob guard).
            var id3 = Number(el.getAttribute('data-id'));
            var ns = self.state.openNotes[id3];
            if (ns === 'open' || ns === 'closing') return;
            e.stopPropagation();
            window.open(el.getAttribute('data-link'), '_blank', 'noopener');
            self.setState({ feedbackOpen: true, feedbackCo: el.getAttribute('data-co') });
            break;
          }
        }
      });

      // search input (delegated): track caret so re-render keeps focus
      document.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'su-search') {
          self._searchFocused = true;
          self._searchCaret = e.target.selectionStart;
          self.setState({ q: e.target.value });
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
          self.setState({ st: e.target.value });
        }
      });
    },

    init: function (jobs) {
      this.jobs = jobs;
      this.bindEvents();
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
      return (v === 'cod' || v === 'girly') ? v : 'original';
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
  var SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv';

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
    var COLS = ['Company', 'Job Title', 'Link', 'Location', 'Type', 'Salary', 'Years of Experience', 'Category', 'Description', 'Pick', 'Active/Dead'];
    var head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var hasHeader = head.indexOf('company') !== -1 && head.indexOf('job title') !== -1;
    function col(name) { return hasHeader ? head.indexOf(name.toLowerCase()) : COLS.indexOf(name); }
    var iCo = col('Company'), iRole = col('Job Title'), iLink = col('Link'),
        iLoc = col('Location'), iType = col('Type'), iPay = col('Salary'),
        iExp = col('Years of Experience'), iCat = col('Category'),
        iPick = col('Pick'), iAct = col('Active/Dead');
    var get = function (cells, k) { return (k >= 0 && cells[k] != null) ? String(cells[k]).trim() : ''; };
    var jobs = [];
    for (var r = hasHeader ? 1 : 0; r < rows.length; r++) {
      var cells = rows[r]; if (!cells) continue;
      var co = get(cells, iCo), role = get(cells, iRole);
      if (!co && !role) continue;                                   // skip blank rows
      var act = get(cells, iAct).toLowerCase();
      if (act.indexOf('dead') !== -1 || act === 'inactive' || act === 'no') continue; // hide retired jobs
      var loc = get(cells, iLoc);
      jobs.push({
        co: co, role: role, link: get(cells, iLink), loc: loc, state: deriveState(loc),
        style: get(cells, iType), ind: get(cells, iCat), pay: get(cells, iPay),
        exp: get(cells, iExp), pick: get(cells, iPick).toLowerCase() === 'featured'
      });
    }
    return jobs;
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
    fetch(SHEET_CSV_URL, { cache: 'no-cache' })
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
