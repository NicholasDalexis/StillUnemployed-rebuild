/* Google sign-in and live sync. Preview only until the production account rollout.
 * Firebase web config is public. Firestore users/{uid} rules enforce account isolation.
 */
(function () {
  'use strict';
  var host = location.hostname.toLowerCase();
  if (host === 'stillunemployed.com' || host === 'www.stillunemployed.com') return;
  var IS_LOCAL = host === 'localhost' || host === '127.0.0.1';
  var FIREBASE_CONFIG = {
    apiKey:            'AIzaSyCr1iE41BhaOyiEWko3khE3laL3Cq7Ryc0',
    authDomain:        IS_LOCAL ? 'stillunemployed-17de9.firebaseapp.com' : location.host,
    projectId:         'stillunemployed-17de9',
    storageBucket:     'stillunemployed-17de9.firebasestorage.app',
    messagingSenderId: '43122740614',
    appId:             '1:43122740614:web:cea796d63b4480d5637007'
  };


  var user = null, session = null, auth, sdk, store = window.SUStore;
  var syncState = 'loading', errorCode = '', signingIn = false;
  var feedbackFocus = null;
  function status(next, error) {
    syncState = next; errorCode = error ? String(error.code || error.message || 'unavailable') : '';
    if (error) console.warn('[su-auth]', errorCode);
    render();
  }
  function render() {
    document.querySelectorAll('.su-auth-button').forEach(function (button) {
      var text = user ? (syncState === 'synced' ? 'Saved jobs and tracker synced' : syncState === 'error' ? 'Sync failed. Tap to retry' : 'Syncing saved jobs and tracker') : signingIn ? 'Signing in with Google' : 'Sign in with Google';
      if (user) text += '. ' + (user.email || user.displayName || 'Signed in');
      if (errorCode) text += '. ' + errorCode;
      button.title = text; button.setAttribute('aria-label', text);
      button.dataset.state = user ? syncState : (errorCode ? 'error' : 'signed-out');
      var label = button.querySelector('.su-auth-label');
      if (label) label.textContent = user ? 'Signed In' : 'Sign In';
      button.disabled = !auth || signingIn;
    });
    // The post-apply note offers sign-in only while signed out and auth is ready.
    // Its fallback X is real board markup, so production/SDK failures stay dismissible.
    // Toggle the two controls in place: never rebuild the note or its response state.
    document.querySelectorAll('.su-feedback-account').forEach(function (slot) {
      var google = slot.querySelector('.su-auth-button');
      var close = slot.querySelector('.su-feedback-close');
      if (!google || !close) return;
      var showGoogle = !!auth && !user;
      google.hidden = !showGoogle; close.hidden = showGoogle;
      var hidden = showGoogle ? close : google;
      if (document.activeElement === hidden) (showGoogle ? google : close).focus({ preventScroll:true });
    });
    // Disabling the initiating button can send browser focus to BODY. Return it
    // after completion/cancellation, unless the visitor chose another control.
    if (feedbackFocus && (user || !signingIn)) {
      if (feedbackFocus.isConnected) {
        var active = document.activeElement;
        if (active === feedbackFocus || active === document.body || active === document.documentElement) {
          var slot = feedbackFocus.closest('.su-feedback-account');
          var target = slot && slot.querySelector(user ? '.su-feedback-close' : '.su-auth-button');
          if (target && !target.hidden && !target.disabled) target.focus({ preventScroll:true });
        }
      }
      feedbackFocus = null;
    }
    var feedback = document.getElementById('su-auth-feedback');
    if (feedback) { feedback.textContent = syncState === 'error' ? 'Sync could not finish. Your jobs are saved on this device. Tap Google to retry.' : ''; }
  }
  function signInError(e) {
    status('error', e);
    alert('Google sign-in could not finish. Your jobs are still saved on this device. ' + (e.code || 'Please try again.'));
  }
  function onClick(event) {
    if (user) {
      if (syncState === 'error') { startSync(); return; }
      if (confirm('Signed in as ' + (user.email || user.displayName) + '. Sign out? Your jobs stay saved in this account.')) sdk.signOut(auth);
      return;
    }
    if (!auth || signingIn) return;
    var trigger = event && event.currentTarget;
    var feedbackSlot = trigger && trigger.closest('.su-feedback-account');
    var active = document.activeElement;
    feedbackFocus = active && active.closest && active.closest('.su-feedback-account') ? active : null;
    signingIn = true; errorCode = ''; render();
    var provider = new sdk.GoogleAuthProvider();
    sdk.signInWithPopup(auth, provider).catch(function (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        var board = feedbackSlot && window.SUApp;
        if (feedbackSlot) {
          // A visitor may already have answered/closed while the popup was pending.
          if (!feedbackSlot.isConnected || !board || !board.state.feedbackOpen) return;
          if (!board.rememberFeedbackRedirect()) {
            status('error', e);
            alert('Please allow popups and try Google again. You can still answer this note without signing in.');
            return;
          }
        }
        return sdk.signInWithRedirect(auth, provider).catch(function (redirectError) {
          if (board) board.clearFeedbackRedirect();
          signInError(redirectError);
        });
      }
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        signInError(e);
      }
    }).finally(function () { signingIn = false; render(); });
  }
  function mount() {
    // Nav rows and feedback notes can be rebuilt. Keep one auth control per slot,
    // including feedback slots that already contain their always-available fallback X.
    document.querySelectorAll('.su-account-slot').forEach(function (slot) {
      if (slot.querySelector('.su-auth-button')) return;
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'su-auth-button';
    var g = '<svg width="16" height="16" viewBox="0 0 18 18" style="flex:none;">' +
      '<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"/>' +
      '<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"/>' +
      '<path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z"/>' +
      '<path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/></svg>';

      button.innerHTML = g + '<span class="su-auth-label" aria-hidden="true"></span>'; button.addEventListener('click', onClick); slot.appendChild(button);
    });
    render();
  }
  var firestore, F;
  function startSync() {
    if (session) session.stop(); session = null;
    if (!user || !store) return;
    var ref = F.doc(firestore, 'users', user.uid);
    status('saving');
    session = window.SUSync.connect(store, {
      transaction: function (local) {
        return F.runTransaction(firestore, async function (tx) {
          var snap = await tx.get(ref);
          var merged = window.SUSync.merge(window.SUSync.decode(snap.exists() ? snap.data() : null), local);
          tx.set(ref, window.SUSync.payload(merged), { merge: true });
          return merged;
        });
      },
      listen: function (receive, failure) {
        return F.onSnapshot(ref, { includeMetadataChanges: true }, function (snap) {
          if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) receive(snap.exists() ? snap.data() : null);
        }, failure);
      }
    }, status);
  }
  window.addEventListener('su:local-change', function () { if (session) session.queue(); });
  window.addEventListener('storage', function (e) { if (session && e.key && e.key.indexOf('su_sync_v2:') === 0) session.queue(); });
  window.addEventListener('online', function () { if (user) startSync(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && session) session.queue(); });
  function bootUI() {
    mount();
    // Observe slot-replacing renders, not character/status changes.
    new MutationObserver(function (changes) {
      if (changes.some(function (c) { return Array.from(c.addedNodes).some(function (n) { return n.nodeType === 1 && (n.matches('.su-account-slot') || n.querySelector('.su-account-slot')); }); })) mount();
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootUI); else bootUI();
  Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
  ]).then(function (mods) {
    sdk = mods[1]; F = mods[2]; store = window.SUStore;
    var app = mods[0].initializeApp(FIREBASE_CONFIG);
    auth = sdk.getAuth(app); firestore = F.getFirestore(app);
    sdk.getRedirectResult(auth).catch(function (e) { status('error', e); });
    sdk.onAuthStateChanged(auth, function (next) {
      if (session) session.stop(); session = null;
      user = next || null;
      if (store && store.owner() !== (user ? user.uid : null)) store.activate(user ? user.uid : null);
      if (user) startSync(); else status('signed-out');
      render();
    });
    render();
  }).catch(function (e) { status('error', e); });
})();
