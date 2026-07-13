/* ============================================================================
 * auth.js — Sign in with Google + cross-device sync for saved jobs and the tracker.
 * StillUnemployed.com · Nic + Claude · 2026-07-12
 *
 * ⚠️  PREVIEW ONLY. This file HARD-GATES itself off on the live domain (see IS_LIVE below).
 *     stillunemployed.com keeps behaving exactly as it does today: localStorage, no accounts,
 *     no Firebase, no network calls to Google. Nothing here can touch production until Nic
 *     explicitly flips it on, and that flip is gated on a privacy-policy + ToS rewrite
 *     (accounts = collecting an email + a name = a legal change, not just a code change).
 *
 * WHY IT DOESN'T COPY PORTFOLIO GRADED
 * PG is a React app with an Express backend: the client authenticates, then the SERVER talks to
 * Firestore with the admin service-account key, and Firestore rules deny all client access.
 * StillUnemployed is a STATIC site with no backend at all. So there is nowhere to put an admin
 * key, and the PG model can't be copied. The correct pattern for a static site is the opposite:
 * the client talks to Firestore DIRECTLY, and the security rules are the entire defense.
 * Those rules are therefore not a detail — they ARE the security model. See SETUP below.
 *
 * SEPARATE FIREBASE PROJECT, ON PURPOSE (Nic's call, 2026-07-12)
 * This does NOT reuse the `portfolio-graded` project. Reasons: PG's admin key is currently
 * unrotated and sitting in ~/Downloads, so sharing the project would extend that exposure to
 * every board user; the sign-in popup shows the project's domain, and job seekers should not see
 * "portfolio-graded"; and Nic wants the two email lists and the two analytics streams apart.
 * ========================================================================================== */
(function () {
  'use strict';

  // ── THE GATE. Everything below this line is dead on production. ─────────────────────────────
  var host = String(location.hostname || '').toLowerCase();
  var IS_LIVE = (host === 'stillunemployed.com' || host === 'www.stillunemployed.com');
  if (IS_LIVE) return;                       // production: untouched, no accounts, no Firebase.

  // ── CONFIG ──────────────────────────────────────────────────────────────────────────────────
  // This block is PUBLIC BY DESIGN. A Firebase web config is an identifier, not a credential —
  // it is meant to ship in client JS. It grants nothing on its own. All real security comes from
  // (a) the Firestore rules and (b) Firebase's authorized-domains list. Do not treat these as
  // secrets, and do not let anyone "protect" them by moving them somewhere clever.
  // Project `stillunemployed-17de9` (created 2026-07-12). Deliberately SEPARATE from
  // `portfolio-graded` — see the header. Google sign-in enabled; authorized domains are
  // `localhost` + `preview--stillunemployed.netlify.app` ONLY (stillunemployed.com is NOT
  // authorized, so even if this file somehow ran on production, Firebase would refuse the sign-in.
  // That's a second, server-side lock behind the IS_LIVE gate above — belt and suspenders).
  // authDomain = THIS host, not firebaseapp.com. (THE fix, 2026-07-12.)
  // Firebase brokers the auth session through an iframe on `authDomain`. Point it at
  // firebaseapp.com and that iframe is THIRD-PARTY to us — Chrome partitions its storage, the
  // session is written under Firebase's origin, and our page can never read it back. That is why
  // Nic could sign in with Google and still see a "Sign in" button, and why nothing synced: with no
  // user visible to our page, there is no Firestore write. Same root cause as the popup's
  // auth/internal-error. Three symptoms, one bug.
  //
  // netlify.toml proxies /__/auth/* through to Firebase, so on a deployed host the ENTIRE flow is
  // same-origin and none of the above applies. Localhost has no proxy, so it keeps the real
  // firebaseapp.com domain (localhost is exempt from the partitioning that bites us in production).
  var IS_LOCAL = (host === 'localhost' || host === '127.0.0.1');
  var FIREBASE_CONFIG = {
    apiKey:            'AIzaSyCr1iE41BhaOyiEWko3khE3laL3Cq7Ryc0',
    authDomain:        IS_LOCAL ? 'stillunemployed-17de9.firebaseapp.com' : location.host,
    projectId:         'stillunemployed-17de9',
    storageBucket:     'stillunemployed-17de9.firebasestorage.app',
    messagingSenderId: '43122740614',
    appId:             '1:43122740614:web:cea796d63b4480d5637007'
  };

  var SAVED_KEY   = 'su_saved_jobs';   // { "<job link>": true, ... }   (written by app.js)
  var TRACKER_KEY = 'su_tracker';      // [ { link, company, role, status, ... }, ... ]

  var state = { user: null, db: null, auth: null, writing: false, timer: null };

  // ── MERGE ───────────────────────────────────────────────────────────────────────────────────
  // The whole point of this feature: 4 jobs saved on the laptop, 2 on the phone. Sign in on both
  // and you should end up with 6 — NOT whichever device happened to sync last.
  // So merging is a UNION, never an overwrite. A sync feature that can silently delete a user's
  // saved jobs is worse than no sync feature.
  function mergeSaved(a, b) {
    var out = {};
    [a || {}, b || {}].forEach(function (src) {
      Object.keys(src).forEach(function (k) { if (src[k]) out[k] = true; });
    });
    return out;
  }
  function mergeTracker(a, b) {
    var byLink = {}, order = [];
    function take(row) {
      if (!row || !row.link) return;
      var k = String(row.link);
      if (!byLink[k]) { byLink[k] = row; order.push(k); return; }
      // Same job on both devices: keep whichever was touched more recently. If neither carries a
      // timestamp (older rows don't), keep the one already held — we never drop a row.
      var cur = byLink[k];
      var tNew = Date.parse(row.updated || row.ts || '') || 0;
      var tCur = Date.parse(cur.updated || cur.ts || '') || 0;
      if (tNew > tCur) byLink[k] = row;
    }
    (a || []).forEach(take);
    (b || []).forEach(take);
    return order.map(function (k) { return byLink[k]; });
  }

  function readLocal(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || fallback); } catch (e) { return JSON.parse(fallback); }
  }

  // ── SYNC ────────────────────────────────────────────────────────────────────────────────────
  function pushUp() {
    if (!state.user || !state.db || state.writing) return;
    state.writing = true;
    var payload = {
      saved: readLocal(SAVED_KEY, '{}'),
      tracker: readLocal(TRACKER_KEY, '[]'),
      updatedAt: new Date().toISOString()
    };
    state.db.set(payload).then(function () {
      state.writing = false;
      badge('synced');
    }).catch(function (e) {
      state.writing = false;
      console.warn('[su-auth] sync up failed', e && e.code);
      badge('sync failed');
    });
  }
  // Debounced: saving 5 jobs quickly should be one write, not five.
  function queuePush() {
    if (!state.user) return;
    clearTimeout(state.timer);
    badge('saving…');
    state.timer = setTimeout(pushUp, 900);
  }

  // ZERO-TOUCH HOOK. app.js and tracker.js both persist through localStorage.setItem and know
  // nothing about auth. Rather than thread a callback through both files (and re-introduce the
  // "two places that must stay in sync" bug that has bitten this repo three times), we wrap
  // setItem once, here. Any future feature that persists to these keys is synced automatically
  // with no extra wiring — and if this file never loads, the wrap never happens.
  var _setItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (k, v) {
    _setItem(k, v);
    if (k === SAVED_KEY || k === TRACKER_KEY) queuePush();
  };

  function pullDownAndMerge() {
    if (!state.user || !state.db) return Promise.resolve(false);
    return state.db.get().then(function (remote) {
      var localSaved   = readLocal(SAVED_KEY, '{}');
      var localTracker = readLocal(TRACKER_KEY, '[]');
      var mergedSaved   = mergeSaved(localSaved, (remote && remote.saved) || {});
      var mergedTracker = mergeTracker(localTracker, (remote && remote.tracker) || []);
      var changed = JSON.stringify(mergedSaved)   !== JSON.stringify(localSaved) ||
                    JSON.stringify(mergedTracker) !== JSON.stringify(localTracker);
      _setItem(SAVED_KEY,   JSON.stringify(mergedSaved));    // raw setter: don't re-trigger a push
      _setItem(TRACKER_KEY, JSON.stringify(mergedTracker));
      pushUp();                                              // write the union back up
      return changed;
    }).catch(function (e) {
      console.warn('[su-auth] sync down failed', e && e.code);
      return false;
    });
  }

  // ── UI ──────────────────────────────────────────────────────────────────────────────────────
  // Deliberately self-contained: a small pill, bottom-left, injected by this file. app.js is not
  // touched, so if we ever kill this feature it's one <script> tag and this file, nothing else.
  var pill, label;

  // POSITIONING. Desktop: top right, in line with the nav post-its — the founder card sits top-left,
  // the three tabs are centered, and the right side was empty (Nic, 2026-07-12).
  //
  // MOBILE: that same spot LANDS ON TOP OF THE "TRACKER" TAB. Nic caught it on his phone. The nav
  // post-its are centered and grow toward the right edge, so on a narrow screen there is no empty
  // right side to sit in — the desktop assumption just doesn't hold. Rather than shrink it and hope,
  // move it out of the nav's way entirely: bottom right, above the thumb, where nothing else lives.
  // (The cookie banner is bottom-LEFT on mobile, so they don't collide — that was the other trap.)
  //
  // Done with a real stylesheet + media query rather than inline styles, because inline styles can't
  // express a breakpoint, and because Netlify's post-processing has mangled quoted inline styles on
  // this site before ([[2026-06-28 Netlify nav postmortem]]).
  function injectStyles() {
    if (document.getElementById('su-auth-css')) return;
    var s = document.createElement('style');
    s.id = 'su-auth-css';
    s.textContent =
      '#su-auth-pill{position:fixed;top:22px;right:24px;z-index:190;display:inline-flex;align-items:center;' +
      'gap:8px;padding:9px 15px;min-height:44px;box-sizing:border-box;border-radius:999px;cursor:pointer;' +
      'background:#FCFAF3;border:1.5px solid rgba(44,33,24,0.20);box-shadow:2px 4px 10px rgba(44,33,24,0.16);' +
      "font-family:'Poppins',system-ui,sans-serif;font-size:13.5px;font-weight:600;color:#2C2118;" +
      'transform:rotate(-1.5deg);-webkit-tap-highlight-color:transparent;max-width:46vw;white-space:nowrap;}' +
      '#su-auth-pill:active{transform:rotate(-1.5deg) scale(0.97);}' +
      // PHONES: thinner, and pinned just UNDER the nav rather than floating at the bottom (Nic
      // didn't like bottom-right). The exact `top` is computed at runtime from the nav's real
      // bounding box (see placeForMobile) — hardcoding a pixel value is what caused the overlap
      // with the Tracker tab in the first place, since the nav's height isn't a constant.
      '@media (max-width:700px){#su-auth-pill{right:12px;min-height:40px;padding:8px 13px;' +
      'font-size:13px;gap:6px;max-width:48vw;transform:rotate(-1deg);' +
      'box-shadow:1px 3px 9px rgba(44,33,24,0.20);}}';
    document.head.appendChild(s);
  }

  // Anchor the pill under the nav on mobile, measured from the DOM instead of guessed.
  function placeForMobile() {
    if (!pill) return;
    if (window.innerWidth > 700) { pill.style.top = ''; return; }
    var nav = null, best = 0;
    // The nav post-its are anchors reading Home / Jobs / Tracker. Find the lowest one and sit below.
    var links = document.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      var t = (links[i].textContent || '').trim();
      if (/^(Home|Jobs|Tracker|Advice)$/i.test(t)) {
        var r = links[i].getBoundingClientRect();
        if (r.height && r.bottom > best) { best = r.bottom; nav = links[i]; }
      }
    }
    pill.style.top = (nav ? Math.round(best + 10) : 74) + 'px';
  }

  function ui() {
    // HOMEPAGE: desktop only, never mobile (Nic, 2026-07-12). The mobile homepage is the hero —
    // a photo, a headline, one CTA. A sign-in button there competes with "Browse the board", which
    // is the only thing a first-time visitor should be doing. On desktop there's room; on a phone
    // there isn't, and the ask is different anyway (sync matters once you've saved something).
    var p = String(location.pathname || '').toLowerCase().replace(/\/+$/, '');
    var isHome = (p === '' || /\/index\.html$/.test(p));
    if (isHome && window.innerWidth <= 700) return;

    injectStyles();
    pill = document.createElement('div');
    pill.id = 'su-auth-pill';
    // z-index 190 sits UNDER the modals (200+) on purpose — the UX audit flagged the cookie banner
    // for floating on top of open modals. Don't repeat that.
    var g = '<svg width="16" height="16" viewBox="0 0 18 18" style="flex:none;">' +
      '<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"/>' +
      '<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"/>' +
      '<path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z"/>' +
      '<path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/></svg>';
    label = document.createElement('span');
    pill.innerHTML = g;
    pill.appendChild(label);
    pill.addEventListener('click', onClick);
    document.body.appendChild(pill);
    render();
    // The board renders asynchronously, so the nav may not exist yet when we first measure.
    // Re-place after paint, and on resize/orientation change.
    setTimeout(placeForMobile, 400);
    setTimeout(placeForMobile, 1400);
    window.addEventListener('resize', placeForMobile);
    window.addEventListener('orientationchange', function () { setTimeout(placeForMobile, 250); });
  }
  function render() {
    if (!label) return;
    if (state.user) {
      // Signed in: show WHO, so it's unmistakable that it worked. Nic's complaint was that after
      // signing in the button looked identical — it must visibly change or the feature reads broken.
      var who = (state.user.displayName || (state.user.email || '').split('@')[0] || 'you');
      label.textContent = String(who).split(' ')[0] + ' · synced';
      pill.title = 'Signed in as ' + (state.user.email || '') + '. Click to sign out.';
    } else {
      label.textContent = 'Sign in';   // (Nic, 2026-07-12) just "Sign in" + the Google mark.
      pill.title = 'Sign in with Google to keep saved jobs and your tracker on every device.';
    }
    placeForMobile();
  }
  function badge(t) { if (label && state.user) { label.textContent = t; setTimeout(render, 1400); } }

  function onClick() {
    if (state.user) {
      if (confirm('Sign out? Your saved jobs stay on this device.')) state.auth.signOut();
      return;
    }
    state.auth.signIn().catch(function (e) {
      // popup-blocked / closed-by-user are normal, not errors worth shouting about
      var c = (e && e.code) || '';
      if (c.indexOf('popup-closed') < 0 && c.indexOf('cancelled-popup') < 0) {
        console.warn('[su-auth] sign-in failed', c);
        alert('Sign-in did not go through. ' + (c || 'Try again?'));
      }
    });
  }

  // ── BOOT (Firebase modular SDK, ESM, straight from the CDN — no bundler in this repo) ────────
  Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
  ]).then(function (mods) {
    var A = mods[0], U = mods[1], F = mods[2];
    var app = A.initializeApp(FIREBASE_CONFIG);
    var fbAuth = U.getAuth(app);
    var fs = F.getFirestore(app);

    // ── SIGN-IN: popup, falling back to REDIRECT. (Rewritten 2026-07-12 after the first version
    //    failed on preview with a bare `auth/internal-error`.)
    //
    // What I verified before changing anything, so this isn't a guess:
    //   · Identity Toolkit answers HTTP 200 for this API key.
    //   · `preview--stillunemployed.netlify.app` IS in the authorized-domains list.
    //   · The OAuth client exists — loading the /__/auth/handler URL by hand renders Google's real
    //     account chooser.
    //   · The auth iframe from firebaseapp.com loads with ZERO CSP violations.
    //   · The localStorage.setItem wrapper below is not the cause (retested with the native setter).
    // Everything server-side is healthy. The failure is purely in the POPUP handshake.
    //
    // Rather than keep chasing it: popups are the fragile part of this flow, and they are worst
    // exactly where Nic's traffic comes from — Instagram and LinkedIn in-app browsers, and iOS
    // Safari, all of which block or sever popups. A redirect has no popup, no opener relationship,
    // and no user-gesture requirement. It is the right flow for a mobile-first job board even if
    // the popup were working.
    //
    // So: try the popup (nicer on desktop — you never leave the page), and the moment it fails for
    // ANY reason other than the user closing it themselves, silently fall back to a full redirect.
    state.auth = {
      signIn: function () {
        var provider = new U.GoogleAuthProvider();
        return U.signInWithPopup(fbAuth, provider).catch(function (e) {
          var code = (e && e.code) || '';
          // The user shut the popup on purpose. Respect that — do NOT then yank them to Google.
          if (code.indexOf('popup-closed') > -1 || code.indexOf('cancelled-popup') > -1) throw e;
          console.warn('[su-auth] popup failed (' + code + ') — falling back to redirect');
          badge('redirecting…');
          return U.signInWithRedirect(fbAuth, provider);
        });
      },
      signOut: function () { return U.signOut(fbAuth); }
    };

    // Coming BACK from a redirect sign-in. onAuthStateChanged fires on its own, so this exists to
    // surface a real failure instead of dumping the user back on the board with no explanation.
    U.getRedirectResult(fbAuth).catch(function (e) {
      var code = (e && e.code) || '';
      if (code) console.warn('[su-auth] redirect sign-in failed', code);
    });

    U.onAuthStateChanged(fbAuth, function (user) {
      state.user = user || null;
      if (user) {
        // ONE doc per user, keyed by uid. The Firestore rules (see SETUP) make it impossible to
        // read or write any uid but your own — that is the entire security model for this feature.
        var ref = F.doc(fs, 'users', user.uid);
        state.db = {
          get: function () { return F.getDoc(ref).then(function (s) { return s.exists() ? s.data() : null; }); },
          set: function (d) { return F.setDoc(ref, d, { merge: true }); }
        };
        pullDownAndMerge().then(function (changed) {
          render();
          // If signing in actually pulled in jobs from another device, the board is now stale.
          // Reloading is blunt but bulletproof: app.js re-reads localStorage on boot, so there is
          // no second render path to keep in sync. (Cheap: it's a static page.)
          if (changed) location.reload();
        });
      } else {
        state.db = null;
      }
      render();
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui);
    else ui();
  }).catch(function (e) {
    // Most likely cause: CSP blocking gstatic. Check the console on the deployed preview.
    console.warn('[su-auth] Firebase failed to load — is the CSP allowing www.gstatic.com?', e);
  });
})();

/* ============================================================================================
 * SETUP — DONE. Completed 2026-07-12 ~10:10pm ET by Claude, in Nic's Firebase console.
 *
 * Project: `stillunemployed-17de9`  (SEPARATE from `portfolio-graded`, on purpose)
 *   [x] Google sign-in ENABLED.
 *   [x] Public-facing name set to "StillUnemployed.com" — this is the name job seekers see in the
 *       Google popup. Left as the default `project-43122740614` it would have looked like a scam.
 *   [x] Authorized domains: `localhost` + `preview--stillunemployed.netlify.app` ONLY.
 *       stillunemployed.com is deliberately NOT authorized. So there are TWO independent locks on
 *       production: the IS_LIVE gate in this file, and Firebase itself refusing the domain.
 *   [x] Firestore created (nam5 / US), started in PRODUCTION mode (deny-all), NOT test mode.
 *       Test mode would have left the whole database world-readable and writable for 30 days.
 *   [x] Security rules published — a user can read/write exactly one doc (`users/{their uid}`),
 *       and everything else in the database is denied. On a backendless static site those rules
 *       are not a detail, they are the whole security model.
 *   [x] Firebase Analytics: deliberately NOT enabled. GA4 already runs on the site; a second
 *       analytics property would just be another thing to keep straight.
 *   [x] Firebase Hosting: NOT enabled. The site is on Netlify.
 *
 * STILL REQUIRED BEFORE THIS COULD GO LIVE ON stillunemployed.com — these are gates, not chores:
 *   · privacy.html + terms.html MUST be rewritten. Accounts mean collecting an email and a name.
 *     The policy today says "no accounts and no sign-up" — false the moment this hits the real
 *     domain. This is the exact trap the Beehiiv embed already sprung once tonight.
 *   · A delete-my-account path (GDPR/CCPA). If you hold an account, the user must be able to erase it.
 *   · Add stillunemployed.com to Firebase's authorized domains.
 *   · Remove the IS_LIVE gate at the top of this file. Last step on purpose — so going live can
 *     never happen by accident.
 * ========================================================================================== */
