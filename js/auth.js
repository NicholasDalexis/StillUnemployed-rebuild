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


  var user = null, session = null, auth, sdk, store = window.SUStore, excludedSession = false;
  var syncState = 'loading', errorCode = '', signingIn = false, signingOut = false, authReady = false, authMessage = '', loadingSdk = false, bootAttempt = 0, sessionGeneration = 0, syncFailed = false;
  function accountCurrent(){return !!(user&&authReady&&store&&store.owner()===user.uid&&(!store.current||store.current()));}
  // Client suppression follows the resolved Firebase user, never a DOM/email
  // preference. The ingestion service independently verifies ID-token claims.
  function measurementExcluded(){return excludedSession;}
  window.SUAuth = { signedIn:function(){return !!user;}, accountCurrent:accountCurrent, measurementExcluded:measurementExcluded, measurementReady:function(){return authReady&&!signingIn&&!signingOut&&(!user||accountCurrent());}, syncReady:function(){return accountCurrent()&&syncState==='synced';}, syncState:function(){return syncState;}, retrySync:function(){if(user&&syncState==='error'){track('sync_retry');startSync();}}, getToken:function(){return accountCurrent() ? user.getIdToken() : Promise.reject(new Error('Sign in required'));} };
  function track(name) { if(window.SUAnalytics&&typeof window.SUAnalytics.emit==='function')window.SUAnalytics.emit(name,{}); }
  function notifyAuth(){var changed=false;try{var owner=user?user.uid:'guest',prior=sessionStorage.getItem('su_analytics_auth_owner');changed=prior!==null&&prior!==owner;sessionStorage.setItem('su_analytics_auth_owner',owner);}catch(e){}if(window.dispatchEvent && typeof CustomEvent !== 'undefined')window.dispatchEvent(new CustomEvent('su:auth-changed',{detail:{signedIn:!!user,accountChanged:changed}}));}
  function loginResult(result){if(result && window.SUAnalytics)window.SUAnalytics.emit('auth_login',{});return result;}
  var feedbackFocus = null;
  var bootTimer, authUnsubscribe;
  function status(next, error) {
    var becameReady=next==='synced'&&syncState!=='synced';
    if(user&&next==='error'&&!syncFailed){syncFailed=true;track('sync_error');}
    if(user&&next==='synced'&&syncFailed){syncFailed=false;track('sync_recovered');}
    syncState = next; errorCode = error ? String(error.code || error.message || 'unavailable') : '';
    if (error) console.warn('[su-auth]', errorCode);
    render();
    if(window.dispatchEvent && typeof CustomEvent!=='undefined')window.dispatchEvent(new CustomEvent('su:sync-status',{detail:{state:syncState}}));
    if(becameReady && window.dispatchEvent && typeof CustomEvent!=='undefined')window.dispatchEvent(new CustomEvent('su:account-ready'));
  }
  function render() {
    var accountChanging=!!(store&&store.ownershipCurrent&&!store.ownershipCurrent());
    document.querySelectorAll('.su-auth-button').forEach(function (button) {
      var text = user ? (syncState === 'synced' ? 'Saved jobs and tracker synced' : syncState === 'error' ? 'Sync failed. Tap to retry' : 'Syncing saved jobs and tracker') : signingIn ? 'Signing in with Google' : loadingSdk || !authReady && !errorCode ? 'Checking Google sign-in' : 'Sign in with Google';
      if(user&&!store)text='Signed in';
      if (user) text += '. ' + (user.email || user.displayName || 'Signed in');
      if (errorCode) text += '. ' + errorCode;
      if(accountChanging)text='Checking the account selected in another tab';
      button.removeAttribute('title'); button.setAttribute('aria-label', text);
      button.setAttribute('data-su-help', user ? (syncState==='error' ? 'You’re signed in. Click to retry syncing your jobs.' : 'You’re signed in. Click here to sign out.') : 'Sign in to keep your saved jobs and tracker together.');
      button.dataset.state = user ? syncState : (loadingSdk || !authReady && !errorCode ? 'loading' : errorCode ? 'error' : signingIn ? 'signing-in' : 'signed-out');
      var label = button.querySelector('.su-auth-label');
      if (label) label.textContent = signingOut ? 'Signing out…' : signingIn ? 'Signing in…' : user ? 'Signed In' : loadingSdk || !authReady && !errorCode ? 'Loading…' : !authReady && errorCode ? 'Retry sign-in' : 'Sign In';
      if(accountChanging){button.dataset.state='loading';if(label)label.textContent='Loading…';}
      button.disabled = accountChanging || loadingSdk || (!authReady && !errorCode) || signingIn || signingOut;
      button.setAttribute('aria-busy', String(accountChanging || loadingSdk || !authReady && !errorCode || signingIn || signingOut));
    });
    if(window.SUBoardControls&&window.SUBoardControls.start)window.SUBoardControls.start();
    // The post-apply note offers sign-in only while signed out and auth is ready.
    // Its fallback X is real board markup, so production/SDK failures stay dismissible.
    // Toggle the two controls in place: never rebuild the note or its response state.
    document.querySelectorAll('.su-feedback-account').forEach(function (slot) {
      var google = slot.querySelector('.su-auth-button');
      var close = slot.querySelector('.su-feedback-close');
      if (!google || !close) return;
      var showGoogle = !!auth && authReady && !user;
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
    document.querySelectorAll('.su-auth-feedback').forEach(function (feedback) {
      var message = authMessage || (syncState === 'error' ? (user ? 'Sync paused. Your changes are on this device. Tap Google to retry.' : 'Sign-in is unavailable. Tap Google to retry.') : '');
      feedback.textContent = message; feedback.hidden = !message;
    });
  }
  function signInError(e) {
    track('signin_error');
    status('error', e);
    authMessage = 'Google sign-in could not finish. Your jobs are still on this device. Please try again.'; render();
  }
  function onClick(event) {
    if (signingOut || signingIn || loadingSdk || store&&store.ownershipCurrent&&!store.ownershipCurrent()) return;
    if (!authReady && syncState === 'error') { boot(); return; }
    if (user) {
      if (syncState === 'error') { track('sync_retry'); startSync(); return; }
      if (confirm('Signed in as ' + (user.email || user.displayName) + '. Sign out? Your jobs stay saved in this account.')) {
        var signingOutUser = user; signingOut = true; authMessage = ''; render();
        Promise.resolve().then(function () { return sdk.signOut(auth); }).then(function () {
          track('signout_complete');
        }).catch(function () { track('signout_error'); if(user === signingOutUser)authMessage = 'Sign-out could not finish. You are still signed in. Please try again.'; }).finally(function () { signingOut = false; render(); });
      }
      return;
    }
    if (!auth || !authReady) return;
    var trigger = event && event.currentTarget;
    var feedbackSlot = trigger && trigger.closest('.su-feedback-account');
    var active = document.activeElement;
    feedbackFocus = active && active.closest && active.closest('.su-feedback-account') ? active : null;
    track('signin_start');
    var signInGeneration = sessionGeneration;
    signingIn = true; authMessage = ''; status('signing-in');
    var provider = new sdk.GoogleAuthProvider();
    sdk.signInWithPopup(auth, provider).then(loginResult).catch(function (e) {
      if (user || signInGeneration !== sessionGeneration) return;
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        var board = feedbackSlot && window.SUApp;
        if (feedbackSlot) {
          // A visitor may already have answered/closed while the popup was pending.
          if (!feedbackSlot.isConnected || !board || !board.state.feedbackOpen) return;
          if (!board.rememberFeedbackRedirect()) {
            status('error', e);
            authMessage = 'Please allow popups and try Google again. You can still answer this note without signing in.'; render();
            return;
          }
        }
        return sdk.signInWithRedirect(auth, provider).catch(function (redirectError) {
          if (board) board.clearFeedbackRedirect();
          if (user || signInGeneration !== sessionGeneration) return;
          signInError(redirectError);
        });
      }
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        signInError(e);
      } else track('signin_cancel');
    }).finally(function () { signingIn = false; if(!user&&signInGeneration===sessionGeneration&&syncState==='signing-in')status('signed-out');else render(); });
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
      var feedback = document.createElement('span'); feedback.className = 'su-auth-feedback'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.hidden = true; slot.appendChild(feedback);
    });
    render();
  }
  var firestore, F;
  function startSync() {
    if (session) session.stop(); session = null;
    var generation = ++sessionGeneration;
    if (!user || !store) return;
    // Firebase must confirm a cross-tab identity change. An online event or a
    // retry from the previous identity must never reclaim another account's cache.
    if(store.ownershipCurrent&&!store.ownershipCurrent()){status('loading');return;}
    if(store.owner() !== user.uid || store.current && !store.current()) {
      try { store.activate(user.uid); } catch(e) { if(store.suspend)store.suspend(); status('error',e); return; }
    }
    var ref = F.doc(firestore, 'users', user.uid);
    status('saving');
    try { session = window.SUSync.connect(store, {
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
    }, function (next, error) { if (generation === sessionGeneration) status(next, error); });
    } catch(e) { status('error', e); }
  }
  window.addEventListener('su:local-change', function () { if (session) session.queue(); });
  window.addEventListener('storage', function (e) {
    if(e.key === 'su_sync_owner' && store && store.current && !store.current()) { if(session)session.stop(); session=null; sessionGeneration++; notifyAuth(); status('loading'); return; }
    if (session && e.key && e.key.indexOf('su_sync_v2:') === 0) session.queue(); });
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
  function boot() {
  if (loadingSdk) return;
  if(authUnsubscribe)authUnsubscribe();authUnsubscribe=null;
  var attempt = ++bootAttempt; loadingSdk = true; authReady = false; authMessage = ''; status('loading');
  clearTimeout(bootTimer);
  bootTimer=setTimeout(function(){
    if(attempt!==bootAttempt||authReady)return;
    bootAttempt++;loadingSdk=false;if(authUnsubscribe)authUnsubscribe();authUnsubscribe=null;
    authMessage='Sign-in is taking too long. Tap Google to retry.';status('error',{code:'auth/timeout'});
  },20000);
  Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
  ]).then(function (mods) {
    if (attempt !== bootAttempt) return; loadingSdk = false;
    sdk = mods[1]; F = mods[2]; store = window.SUStore;
    var app = mods[0].initializeApp(FIREBASE_CONFIG);
    auth = sdk.getAuth(app); firestore = F.getFirestore(app);
    sdk.getRedirectResult(auth).then(loginResult).catch(function (e) { if (attempt === bootAttempt && !user) signInError(e); });
    authUnsubscribe=sdk.onAuthStateChanged(auth, function (next) {
      if (attempt !== bootAttempt) return;
      clearTimeout(bootTimer);
      if ((user && user.uid) !== (next && next.uid)) syncFailed = false;
      authReady = true; authMessage = ''; sessionGeneration++;
      if (session) session.stop(); session = null;
      user = next || null;
      // Keep a QA account's sign-out completion out of anonymous statistics too.
      // A different resolved account starts its own measurement decision.
      if(user)excludedSession=user.emailVerified===true&&String(user.email||'').toLowerCase()==='nicholasdalexis@gmail.com';
      try { if (store && (store.owner() !== (user ? user.uid : null) || store.current && !store.current())) store.activate(user ? user.uid : null); }
      catch(e) { if(store.suspend)store.suspend(); notifyAuth(); status('error', e); return; }
      notifyAuth();
      if (user) startSync(); else status('signed-out');
      render();
    }, function (e) { if(attempt!==bootAttempt)return;clearTimeout(bootTimer);authReady=false;sessionGeneration++;if(session)session.stop();session=null;status('error',e); });
    render();
  }).catch(function (e) { if(attempt !== bootAttempt)return;clearTimeout(bootTimer);loadingSdk = false; authMessage = 'Sign-in could not load. Tap Google to retry.'; status('error', e); });
  }
  boot();
})();
