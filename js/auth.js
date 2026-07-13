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
  // >>> Nic: paste the config from the NEW Firebase project here. See SETUP at the bottom. <<<
  var FIREBASE_CONFIG = {
    apiKey:            'PASTE_ME',
    authDomain:        'PASTE_ME.firebaseapp.com',
    projectId:         'PASTE_ME',
    storageBucket:     'PASTE_ME.firebasestorage.app',
    messagingSenderId: 'PASTE_ME',
    appId:             'PASTE_ME'
  };
  if (String(FIREBASE_CONFIG.apiKey).indexOf('PASTE_ME') === 0) {
    console.warn('[su-auth] Firebase config not filled in yet — sign-in is inert. See SETUP in js/auth.js.');
    return;
  }

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
  function ui() {
    pill = document.createElement('div');
    pill.id = 'su-auth-pill';
    pill.setAttribute('style',
      'position: fixed; left: 14px; bottom: 16px; z-index: 190; display: inline-flex; align-items: center; gap: 8px;' +
      'padding: 9px 14px; min-height: 44px; box-sizing: border-box; border-radius: 999px; cursor: pointer;' +
      'background: #FCFAF3; border: 1.5px solid rgba(44,33,24,0.18); box-shadow: 0 3px 10px rgba(44,33,24,0.14);' +
      "font-family: 'Poppins', system-ui, sans-serif; font-size: 13.5px; font-weight: 600; color: #2C2118;" +
      '-webkit-tap-highlight-color: transparent;');
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
  }
  function render() {
    if (!label) return;
    if (state.user) {
      var who = (state.user.email || '').split('@')[0];
      label.textContent = who + ' · synced';
      pill.title = 'Signed in as ' + state.user.email + '. Click to sign out.';
    } else {
      label.textContent = 'Sign in to sync';
      pill.title = 'Sign in with Google to keep saved jobs and your tracker on every device.';
    }
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

    state.auth = {
      signIn: function () { return U.signInWithPopup(fbAuth, new U.GoogleAuthProvider()); },
      signOut: function () { return U.signOut(fbAuth); }
    };

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
 * SETUP — what Nic has to click. ~5 minutes. I can't do these: creating a project and changing
 * account settings are things I don't do on your behalf.
 *
 * 1) console.firebase.google.com → Add project → name it `stillunemployed`.
 *    (A NEW project. Do NOT reuse `portfolio-graded`.)
 *
 * 2) Build → Authentication → Get started → Sign-in method → enable GOOGLE. Save.
 *
 * 3) Authentication → Settings → Authorized domains → Add domain:
 *       preview--stillunemployed.netlify.app
 *       localhost                      (usually there already)
 *    ⚠️ Do NOT add stillunemployed.com. Production must not be able to sign in yet.
 *
 * 4) Build → Firestore Database → Create database → Production mode → pick a US region.
 *    Then open the RULES tab and paste EXACTLY this. These rules are the whole security model:
 *
 *      rules_version = '2';
 *      service cloud.firestore {
 *        match /databases/{database}/documents {
 *          match /users/{uid} {
 *            allow read, write: if request.auth != null && request.auth.uid == uid;
 *          }
 *          match /{document=**} { allow read, write: if false; }
 *        }
 *      }
 *
 *    That means: you can only ever read/write YOUR OWN document, and nothing else in the database
 *    is reachable from a browser at all. Publish.
 *
 * 5) Project settings (gear) → Your apps → Web app (</>) → register → copy the `firebaseConfig`
 *    object → paste it into FIREBASE_CONFIG at the top of this file. It is NOT a secret; it is
 *    supposed to be in the page source.
 *
 * BEFORE THIS COULD EVER GO LIVE (not now, but do not forget):
 *   · privacy.html + terms.html must be rewritten. Accounts mean you collect an email and a name.
 *     The policy currently says "no accounts and no sign-up" — that would become false the moment
 *     this ships to the real domain. Same trap as the Beehiiv embed, twice over.
 *   · A delete-my-account path (GDPR/CCPA). If you hold an account, you must be able to erase it.
 *   · Remove the IS_LIVE gate at the top of this file — deliberately the last step, so it can't
 *     happen by accident.
 * ========================================================================================== */
