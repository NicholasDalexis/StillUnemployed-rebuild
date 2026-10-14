/* Google/Apple sign-in and live sync on approved board origins.
 * Firebase web config is public. Firestore users/{uid} rules enforce account isolation.
 */
(function () {
  'use strict';
  var host = location.hostname.toLowerCase();
  var IS_NATIVE = !!(window.SUNative && window.SUNative.isNative);
  if (!['stillunemployed.com','www.stillunemployed.com','localhost','127.0.0.1'].includes(host) && !/^[a-z0-9-]+--stillunemployed\.netlify\.app$/.test(host)) return;
  var IS_LOCAL = host === 'localhost' || host === '127.0.0.1';
  var FIREBASE_CONFIG = {
    apiKey:            'AIzaSyCr1iE41BhaOyiEWko3khE3laL3Cq7Ryc0',
    authDomain:        IS_LOCAL || IS_NATIVE ? 'stillunemployed-17de9.firebaseapp.com' : location.host,
    projectId:         'stillunemployed-17de9',
    storageBucket:     'stillunemployed-17de9.firebasestorage.app',
    messagingSenderId: '43122740614',
    appId:             '1:43122740614:web:cea796d63b4480d5637007'
  };


  var user = null, session = null, auth, sdk, store = window.SUStore, excludedSession = false;
  var syncState = 'loading', errorCode = '', signingIn = false, signingOut = false, authReady = false, authMessage = '', loadingSdk = false, bootAttempt = 0, sessionGeneration = 0, syncFailed = false;
  var deleting=false,deletionPending=false,pendingOperation=null,linking=false,accountPanel=null,accountPanelFocus=null,appleAuthorization=null,nativeFullName=null;
  function accountCurrent(){return !!(user&&authReady&&!deleting&&!deletionPending&&(!store||(store.owner()===user.uid&&(!store.current||store.current())&&(!store.ownershipCurrent||store.ownershipCurrent()))));}
  // Client suppression follows the resolved Firebase user, never a DOM/email
  // preference. The ingestion service independently verifies ID-token claims.
  function measurementExcluded(){return excludedSession;}
  // This label describes QA measurement exclusion only. Admin dashboard access
  // remains a separate server-verified permission; the label grants no access.
  function ownerIdentity(){return !!(user&&(user.emailVerified===true&&String(user.email||'').toLowerCase()==='nicholasdalexis@gmail.com'||!user.email&&(user.providerData||[]).some(function(p){return p.providerId==='google.com'&&String(p.email||'').toLowerCase()==='nicholasdalexis@gmail.com';})));}
  function qaAdmin(){return !!(authReady&&ownerIdentity()&&(!store||!store.ownershipCurrent||store.ownershipCurrent()));}
  function signIn(trigger){if(user)return;onClick({currentTarget:trigger||null});}
  window.SUAuth = { signedIn:function(){return !!user;}, signIn:signIn, qaAdmin:qaAdmin, accountCurrent:accountCurrent, measurementExcluded:measurementExcluded, measurementReady:function(){return authReady&&!signingIn&&!signingOut&&!deleting&&!deletionPending&&(!user||accountCurrent());}, syncReady:function(){return accountCurrent()&&syncState==='synced';}, syncState:function(){return syncState;}, retrySync:function(){if(user&&!deleting&&syncState==='error'){track('sync_retry');startSync();}}, getToken:function(force){return accountCurrent() ? user.getIdToken(force===true) : Promise.reject(new Error('Sign in required'));}, openAccount:openAccount, linkProvider:linkProvider, deleteAccount:deleteAccount };
  function track(name) { if(window.SUAnalytics&&typeof window.SUAnalytics.emit==='function')window.SUAnalytics.emit(name,{}); }
  function notifyAuth(){var changed=false;try{var owner=user?user.uid:'guest',prior=sessionStorage.getItem('su_analytics_auth_owner');changed=prior!==null&&prior!==owner;sessionStorage.setItem('su_analytics_auth_owner',owner);}catch(e){}if(window.dispatchEvent && typeof CustomEvent !== 'undefined')window.dispatchEvent(new CustomEvent('su:auth-changed',{detail:{signedIn:!!user,accountChanged:changed}}));}
  var pendingLoginUid=null;
  function deliverLogin(){
    if(!pendingLoginUid||!user||pendingLoginUid!==user.uid||!window.SUAuth.measurementReady()||!window.SUAnalytics)return;
    pendingLoginUid=null;
    // Firebase's state callback clears the previous account's event queue.
    // Record completion only after that handoff and the popup have settled.
    track('auth_login');
  }
  function loginResult(result){if(result&&result.user){pendingLoginUid=result.user.uid;deliverLogin();if(IS_NATIVE&&nativeFullName&&!result.user.displayName&&sdk.updateProfile){var name=nativeFullName;nativeFullName=null;return sdk.updateProfile(result.user,{displayName:name}).catch(function(){}).then(function(){return result;});}}nativeFullName=null;return result;}
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
    if(accountPanel&&accountPanel.getAttribute('data-account-key')!==accountKey()&&!deleting&&!linking&&!signingIn&&!signingOut)closeAccount();
    document.querySelectorAll('.su-account-menu-trigger').forEach(function(button){
      button.setAttribute('aria-expanded',String(!!accountPanel));
      button.dataset.state=user?syncState:(errorCode?'error':'signed-out');
    });
    document.querySelectorAll('.su-auth-button').forEach(function (button) {
      if(button.getAttribute&&(button.getAttribute('data-provider')||button.getAttribute('data-account-action')==='settings'))return;
      var text = user ? (syncState === 'synced' ? 'Saved jobs and tracker synced' : syncState === 'error' ? 'Sync failed. Tap to retry' : 'Syncing saved jobs and tracker') : signingIn ? 'Signing in with Google' : loadingSdk || !authReady && !errorCode ? 'Checking Google sign-in' : 'Sign in with Google';
      if(user&&!store)text='Signed in';
      if (user) text += '. ' + (user.email || user.displayName || 'Signed in');
      if (user) text = 'Account. ' + text;
      if (qaAdmin()) text += '. QA admin: your testing is excluded from board analytics';
      if (errorCode) text += '. ' + errorCode;
      if(accountChanging)text='Checking the account selected in another tab';
      button.removeAttribute('title'); button.setAttribute('aria-label', text);
      var help = user ? (syncState==='error' ? 'You’re signed in. Click to retry syncing your jobs.' : 'You’re signed in. Click here to sign out.') : 'Sign in to keep your saved jobs and tracker together.';
      if (qaAdmin()) help = 'QA admin: your testing is excluded from board analytics. ' + help;
      button.setAttribute('data-su-help', help);
      button.dataset.state = user ? syncState : (loadingSdk || !authReady && !errorCode ? 'loading' : errorCode ? 'error' : signingIn ? 'signing-in' : 'signed-out');
      var label = button.querySelector('.su-auth-label');
      if (label) label.textContent = signingOut ? 'Signing out…' : signingIn ? 'Signing in…' : user ? 'Account' : loadingSdk || !authReady && !errorCode ? 'Loading…' : !authReady && errorCode ? 'Retry sign-in' : 'Sign in';
      var qaLabel = button.querySelector('.su-auth-qa');
      if (qaLabel) qaLabel.hidden = !qaAdmin();
      if(label&&button.closest('.su-account-menu-providers')&&!user&&!signingIn&&!signingOut&&authReady)label.textContent='Sign in with Google';
      if(accountChanging){button.dataset.state='loading';if(label)label.textContent='Loading…';}
      button.disabled = deleting || deletionPending || accountChanging || loadingSdk || (!authReady && !errorCode) || signingIn || signingOut;
      button.setAttribute('aria-busy', String(accountChanging || loadingSdk || !authReady && !errorCode || signingIn || signingOut));
    });
    document.querySelectorAll('.su-auth-apple').forEach(function(button){button.hidden=!!user||deletionPending||!authReady||loadingSdk;button.style.display=button.hidden?'none':'';button.disabled=deleting||linking||loadingSdk||!authReady||signingIn||signingOut;button.setAttribute('aria-busy',String(signingIn));});
    document.querySelectorAll('.su-account-settings').forEach(function(button){button.hidden=!user&&!pendingOperation;button.style.display=button.hidden?'none':'';button.disabled=deleting||linking||(!deletionPending&&!accountCurrent());});
    if(accountPanel){accountPanel.querySelectorAll('button[data-account-action]').forEach(function(button){button.disabled=deleting||linking||signingOut;});var message=accountPanel.querySelector('.su-account-message');message.textContent=authMessage||(syncState==='error'?(user?'Sync paused. Your changes are on this device. Retry syncing from this menu.':'Sign-in is unavailable. Please retry.'): '');}
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
      var message = authMessage || (syncState === 'error' ? (user ? 'Sync paused. Your changes are on this device. Tap Account to retry.' : 'Sign-in is unavailable. Tap Sign in to retry.') : '');
      feedback.textContent = message; feedback.hidden = !message;
    });
  }
  function signInError(e) {
    track('signin_error');
    status('error', e);
    authMessage = e.code==='auth/account-exists-with-different-credential'||e.code==='auth/credential-already-in-use' ? 'Sign in to the account you already use, then link the other sign-in method in Account settings. Accounts are not combined here.' : 'Sign-in could not finish. Your jobs are still on this device. Please try again.'; render();
  }
  function cancelled(error){return ['auth/popup-closed-by-user','auth/cancelled-popup-request','native/auth-cancelled','auth/cancelled'].includes(error&&error.code);}
  function makeProvider(providerId){var provider=providerId==='apple.com'?new sdk.OAuthProvider('apple.com'):new sdk.GoogleAuthProvider();if(providerId==='apple.com'){provider.addScope('email');provider.addScope('name');}return provider;}
  function rememberApple(result,providerId){
    if(IS_NATIVE||providerId!=='apple.com'||!sdk.OAuthProvider.credentialFromResult)return;
    var credential=sdk.OAuthProvider.credentialFromResult(result);
    if(credential)appleAuthorization={idToken:credential.idToken,accessToken:credential.accessToken};
  }
  function nativeCredential(providerId,operation){
    return Promise.resolve(window.SUNative.ready).then(function(){return window.SUNative.auth[operation](providerId);}).then(function(value){
      if(!value||value.provider!==providerId||typeof value.idToken!=='string'||!value.idToken)throw Error('Provider sign-in did not finish');
      nativeFullName=providerId==='apple.com'&&typeof value.fullName==='string'?value.fullName.slice(0,200):null;
      if(providerId==='google.com')return sdk.GoogleAuthProvider.credential(value.idToken,value.accessToken);
      if(typeof value.rawNonce!=='string'||!value.rawNonce)throw Error('Apple authorization did not finish');
      appleAuthorization={idToken:value.idToken,authorizationCode:value.authorizationCode};
      return new sdk.OAuthProvider('apple.com').credential({idToken:value.idToken,rawNonce:value.rawNonce});
    });
  }
  function clearProviderSession(){appleAuthorization=null;nativeFullName=null;var native=window.SUNative;return IS_NATIVE&&native.auth&&native.auth.clearProviderSession?Promise.resolve(native.auth.clearProviderSession()).catch(function(){}):Promise.resolve();}
  function currentProviders(){return (user&&user.providerData||[]).map(function(provider){return provider.providerId;});}
  function accountKey(){return (user?user.uid:'guest')+'|'+currentProviders().join(',')+'|'+String(deletionPending)+'|'+String(!!pendingOperation);}
  function closeAccount(){if(!accountPanel)return;accountPanel.remove();accountPanel=null;var focus=accountPanelFocus;if(focus&&!focus.isConnected&&focus.classList.contains('su-account-menu-trigger'))focus=document.querySelector('.su-account-menu-trigger');if(focus&&focus.isConnected)focus.focus();accountPanelFocus=null;render();}
  function openAccount(trigger){
    if((!IS_NATIVE&&!user&&!pendingOperation)||accountPanel)return;accountPanelFocus=trigger||document.activeElement;
    var shade=document.createElement('div');shade.className='su-account-dialog';shade.setAttribute('data-account-key',accountKey());shade.style.cssText='position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px;';
    var panel=document.createElement('section');panel.className='su-account-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','su-account-title');panel.style.cssText='background:var(--su-paper,var(--paper,#fff));color:var(--su-ink,var(--ink,#111));border:2px solid currentColor;border-radius:12px;max-width:440px;width:100%;max-height:85vh;overflow:auto;padding:24px;';
    var title=document.createElement('h2');title.id='su-account-title';title.textContent='Account settings';panel.appendChild(title);
    var identity=document.createElement('p');identity.textContent=user?(user.email||user.displayName||'Signed in'):pendingOperation?'Account deletion pending':'Keep your saved jobs and tracker together.';panel.appendChild(identity);
    var notice=document.createElement('p');notice.textContent=user||pendingOperation?'Your saved jobs and tracker belong to this account. Link another sign-in method only if you want both methods to use this same account.':'Sign in to sync across devices.';panel.appendChild(notice);
    function action(text,name,handler){var button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('data-account-action',name);button.style.cssText='display:block;width:100%;min-height:44px;margin:12px 0;font:inherit;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;padding:10px;';button.addEventListener('click',handler);panel.appendChild(button);return button;}
    if(!user&&!pendingOperation){var providers=document.createElement('div');providers.className='su-account-menu-providers';mountProviderButtons(providers,false);panel.appendChild(providers);}
    if(user&&!deletionPending)['google.com','apple.com'].forEach(function(provider){if(!currentProviders().includes(provider))action('Link '+(provider==='google.com'?'Google':'Apple'),provider,function(){linkProvider(provider);});});
    if(user&&!deletionPending)action(syncState==='error'?'Retry sync':'Sign out','signout',function(){if(deleting||linking)return;onClick({});if(!signingOut)render();});
    if(user||pendingOperation)action(deletionPending?'Resume account deletion':'Delete account','delete',deleteAccount);
    if(IS_NATIVE){
      var help=document.createElement('nav');help.className='su-account-resources';help.setAttribute('aria-label','Privacy, terms and support');
      [['Privacy policy','./privacy.html'],['Terms of use','./terms.html'],['Help & support','./support.html']].forEach(function(item){var link=document.createElement('a');link.textContent=item[0];link.setAttribute('href',item[1]);help.appendChild(link);});panel.appendChild(help);
    }
    var message=document.createElement('p');message.className='su-account-message';message.setAttribute('role','status');message.setAttribute('aria-live','polite');panel.appendChild(message);
    var close=action('Close','close',closeAccount);close.removeAttribute('data-account-action');shade.appendChild(panel);shade.addEventListener('click',function(event){if(event.target===shade)closeAccount();});
    shade.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();closeAccount();}if(event.key==='Tab'){var controls=Array.from(panel.querySelectorAll('button, a[href]')).filter(function(control){return !control.disabled&&!control.hidden;});var first=controls[0],last=controls[controls.length-1];if(!panel.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    document.body.appendChild(shade);accountPanel=shade;close.focus();render();
  }
  function linkProvider(providerId){
    if(!accountCurrent()||linking||deleting||currentProviders().includes(providerId))return Promise.resolve();
    if(!['google.com','apple.com'].includes(providerId)||!confirm('Link '+(providerId==='google.com'?'Google':'Apple')+' to this account? Both sign-in methods will access this account’s saved jobs and tracker. Linking Apple may associate your private relay address with your Google account.'))return Promise.resolve();
    var linkingUser=user;linking=true;authMessage='';render();
    var operation=IS_NATIVE?nativeCredential(providerId,'signIn').then(function(credential){return sdk.linkWithCredential(linkingUser,credential);}):sdk.linkWithPopup(linkingUser,makeProvider(providerId));
    return operation.then(function(result){if(result.user.uid!==linkingUser.uid)throw Error('Account changed while linking');rememberApple(result,providerId);authMessage='Sign-in method linked to this account.';}).catch(function(error){if(!cancelled(error))authMessage=error.code==='auth/credential-already-in-use'?'That sign-in method already belongs to another account. Your accounts and saved jobs have not been combined.':'Linking could not finish. Please try again.';}).finally(function(){linking=false;render();});
  }
  function reauthenticate(providerId){
    var current=user;
    return IS_NATIVE?nativeCredential(providerId,'reauthenticate').then(function(credential){return sdk.reauthenticateWithCredential(current,credential);}):sdk.reauthenticateWithPopup(current,makeProvider(providerId)).then(function(result){rememberApple(result,providerId);return result;});
  }
  function readDeletionOperation(){
    try{var value=JSON.parse(localStorage.getItem('su_delete_operation'));if(value&&typeof value.uid==='string'&&value.uid&&typeof value.requestId==='string'&&typeof value.continuation==='string'&&value.continuation.length<=2048)return value;}catch(e){}return null;
  }
  function flushNative(){return IS_NATIVE&&window.SUNative.storage&&window.SUNative.storage.flush?window.SUNative.storage.flush():Promise.resolve();}
  function deletionRequest(input){
    var native=window.SUNative,endpoint=native&&native.endpoint?native.endpoint('/api/account/delete'):'/api/account/delete',transport=IS_NATIVE&&native.request?native.request:fetch;
    return (input.phase==='start'?user.getIdToken(false):Promise.resolve(null)).then(function(token){
      return transport(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({...input,confirm:true})});
    }).then(async function(response){var result;try{result=await response.json();}catch(error){error.status=response.status;throw error;}if(!response.ok){var error=Error(result.error||'Account deletion could not finish.');error.status=response.status;error.pending=result.pending;throw error;}return result;});
  }
  function deleteAccount(){
    if((!user&&!pendingOperation)||deleting||linking||!authReady)return Promise.resolve();
    if(user&&pendingOperation&&pendingOperation.uid!==user.uid){authMessage='Another account has a pending deletion. Sign out of this account to resume it.';render();return Promise.resolve();}
    var deletingUser=user,operation=pendingOperation,id=operation&&operation.requestId,uid=operation?operation.uid:user.uid,started=false;
    try{id=id||localStorage.getItem('su_delete_request:'+uid);}catch(e){}
    if(!id&&!confirm('Delete this account permanently? This removes its saved jobs, tracker, preferences and attributable activity. Shared job availability decisions stay in place. Newsletter subscriptions are separate.'))return Promise.resolve();
    var resuming=!!id;id=id||crypto.randomUUID();
    function persistContinuation(result){
      if(typeof result.continuation!=='string'||!result.continuation||result.continuation.length>2048)throw Error('Deletion could not start. Tap Delete account to retry.');
      operation={uid:uid,requestId:id,continuation:result.continuation};pendingOperation=operation;
      localStorage.setItem('su_delete_operation',JSON.stringify(operation));return flushNative();
    }
    function processDeletion(renewed){
      return deletionRequest({phase:'process',requestId:id,continuation:operation.continuation}).catch(function(error){
        // A still-existing same-UID Firebase session can renew an expired
        // confirmed operation without reauthorizing Apple. Never renew through
        // a different account or claim success from an expired continuation.
        if(error.status!==401||renewed||!user||user.uid!==uid)throw error;
        return deletionRequest({phase:'start',requestId:id}).then(function(result){
          if(result.deleted===true)return result;
          return persistContinuation(result).then(function(){return processDeletion(true);});
        });
      });
    }
    var provider=currentProviders().includes('apple.com')?'apple.com':'google.com';
    signingIn=true;authMessage=resuming?'Resuming account deletion.':'Confirm your identity to delete this account.';render();
    // A confirmed operation's continuation survives Firebase refresh-token
    // invalidation and never requires granting Apple authorization again.
    return (resuming?Promise.resolve():reauthenticate(provider)).then(function(){
      if(user!==deletingUser)throw Error('The selected account changed.');
      localStorage.setItem('su_delete_request:'+uid,id);
      started=true;deleting=true;deletionPending=true;sessionGeneration++;if(session)session.stop();session=null;if(store&&store.suspend)store.suspend();notifyAuth();authMessage='Deleting account. Saved jobs and tracker changes are paused.';render();
      if(operation)return {deleted:false,continuation:operation.continuation};
      // The request ID must survive termination before the server closes writes.
      return flushNative().then(function(){return deletionRequest({phase:'start',requestId:id,...(appleAuthorization?{apple:appleAuthorization}:{})});});
    }).then(function(result){
      if(result.deleted===true)return result;
      // Do not let the server remove Auth until native durable storage confirms
      // that the exact continuation is recoverable after an app termination.
      return persistContinuation(result).then(function(){return processDeletion(false);});
    }).then(function(result){
      if(result.deleted!==true){authMessage='Deletion is processing. Tap Resume account deletion again.';return;}
      if(user&&user.uid!==uid)throw Error('The selected account changed. Sign out to finish the prior account deletion.');
      return sdk.signOut(auth).catch(function(){}).then(clearProviderSession).then(function(){
        ['su_sync_v2:'+uid,'su_sync_owner','su_saved_jobs','su_tracker','su_sync_v2:guest','su_discovery_guest','su_reported_links','su_analytics_queue','su_analytics_auth_owner','su_analytics_visitor','su_analytics_session'].forEach(function(key){localStorage.removeItem(key);sessionStorage.removeItem(key);});
        user=null;if(store)store.activate(null);
        return flushNative();
      }).then(function(){
        localStorage.removeItem('su_delete_request:'+uid);localStorage.removeItem('su_delete_operation');return flushNative();
      }).then(function(){pendingOperation=null;started=false;deleting=false;deletionPending=false;status('signed-out');notifyAuth();closeAccount();authMessage='Account deleted.';});
    }).catch(function(error){
      if(!cancelled(error))authMessage=error.message||'Account deletion could not finish. Tap Resume account deletion to retry.';
      if(user&&started&&!operation&&(error.pending===false||!resuming&&[400,401,404,413,415,429].includes(error.status))){
        try{localStorage.removeItem('su_delete_request:'+uid);}catch(e){}deleting=false;deletionPending=false;started=false;if(store)store.activate(user.uid);startSync();
      }
    }).finally(function(){signingIn=false;deleting=false;if(store&&(started||deletionPending)&&(!user||user.uid===uid))store.suspend();else if(user&&!deletionPending&&user.uid!==uid)startSync();render();});
  }
  function onClick(event) {
    if (deleting || deletionPending || linking || signingOut || signingIn || loadingSdk || store&&store.ownershipCurrent&&!store.ownershipCurrent()) return;
    if (!authReady && syncState === 'error') { boot(); return; }
    if (user) {
      if (syncState === 'error') { track('sync_retry'); startSync(); return; }
      if (confirm('Signed in as ' + (user.email || user.displayName) + '. Sign out? Your jobs stay saved in this account.')) {
        var signingOutUser = user; signingOut = true; authMessage = ''; render();
        Promise.resolve().then(function () { return sdk.signOut(auth); }).then(clearProviderSession).then(function () {
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
    var providerId=event&&event.provider||'google.com';
    var provider = makeProvider(providerId);
    var operation=IS_NATIVE?nativeCredential(providerId,'signIn').then(function(value){return sdk.signInWithCredential(auth,value);}):sdk.signInWithPopup(auth,provider).then(function(result){rememberApple(result,providerId);return result;});
    operation.then(loginResult).catch(function (e) {
      if (user || signInGeneration !== sessionGeneration) return;
      if (!IS_NATIVE && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
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
      if (!cancelled(e)) {
        signInError(e);
      } else track('signin_cancel');
    }).finally(function () { signingIn = false; if(!user&&signInGeneration===sessionGeneration&&syncState==='signing-in')status('signed-out');else render();deliverLogin(); });
  }
  function mountProviderButtons(slot,includeSettings){
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'su-auth-button';
    var g = '<svg width="16" height="16" viewBox="0 0 18 18" style="flex:none;" aria-hidden="true" focusable="false">' +
      '<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"/>' +
      '<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"/>' +
      '<path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z"/>' +
      '<path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/></svg>';

      button.innerHTML = g + '<span class="su-auth-copy" aria-hidden="true"><span class="su-auth-label"></span><span class="su-auth-qa" hidden>QA admin</span></span>'; button.addEventListener('click', onClick); slot.appendChild(button);
      var apple=document.createElement('button');apple.type='button';apple.className='su-auth-button su-auth-apple';apple.setAttribute('data-provider','apple.com');apple.setAttribute('aria-label','Sign in with Apple');var appleImage=document.createElement('img');appleImage.src='assets/auth/apple-sign-in-black.png';appleImage.alt='';appleImage.width=220;appleImage.height=44;apple.appendChild(appleImage);apple.addEventListener('click',function(event){onClick({currentTarget:event.currentTarget,provider:'apple.com'});});slot.appendChild(apple);
      if(includeSettings){var settings=document.createElement('button');settings.type='button';settings.className='su-account-settings su-auth-button';settings.setAttribute('data-account-action','settings');settings.textContent='Account settings';settings.hidden=true;settings.addEventListener('click',function(){openAccount(settings);});slot.appendChild(settings);}
  }
  function mount() {
    // Nav rows and feedback notes can be rebuilt. Keep one auth control per slot,
    // including feedback slots that already contain their always-available fallback X.
    document.querySelectorAll('.su-account-slot').forEach(function (slot) {
      if (slot.querySelector('.su-auth-button')||slot.querySelector('.su-account-menu-trigger')) return;
      if(IS_NATIVE&&!slot.classList.contains('su-feedback-account')){
        var menu=document.createElement('button');menu.type='button';menu.className='su-account-menu-trigger';menu.setAttribute('aria-label','Open account settings');menu.setAttribute('aria-haspopup','dialog');menu.setAttribute('aria-expanded','false');
        menu.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 3 .7-1h4.6l.7 3 2 .9 2.8-.9 2.3 4-2.1 2.1v2.2l2.1 2.1-2.3 4-2.8-.8-2 .9-.7 3H9.7l-.7-3-2-.9-2.8.8-2.3-4L4 13.3v-2.2L1.9 9l2.3-4 2.8.9L9 5Z"/><circle cx="12" cy="12" r="3.2"/></svg>';
        menu.addEventListener('click',function(){openAccount(menu);});slot.appendChild(menu);return;
      }
      mountProviderButtons(slot,true);
      var feedback = document.createElement('span'); feedback.className = 'su-auth-feedback'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.hidden = true; slot.appendChild(feedback);
    });
    render();
  }
  var firestore, F;
  function startSync() {
    if (session) session.stop(); session = null;
    var generation = ++sessionGeneration;
    if (!user || !store || deleting || deletionPending) return;
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
  var modules=IS_NATIVE ? Promise.resolve(window.SUNative.ready).then(function(){var native=window.SUNative.firebase||window.SUNativeFirebase;if(!native||!native.app||!native.auth||!native.firestore)throw Error('Native Firebase is unavailable');return [native.app,native.auth,native.firestore];}) : Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
  ]);
  modules.then(function (mods) {
    if (attempt !== bootAttempt) return; loadingSdk = false;
    sdk = mods[1]; F = mods[2]; store = window.SUStore;
    var app = mods[0].initializeApp(FIREBASE_CONFIG);
    auth = sdk.getAuth(app); firestore = F.getFirestore(app);
    if(!IS_NATIVE)sdk.getRedirectResult(auth).then(loginResult).catch(function (e) { if (attempt === bootAttempt && !user) signInError(e); });
    authUnsubscribe=sdk.onAuthStateChanged(auth, function (next) {
      if (attempt !== bootAttempt) return;
      clearTimeout(bootTimer);
      if ((user && user.uid) !== (next && next.uid)) syncFailed = false;
      authReady = true; authMessage = ''; sessionGeneration++;
      if (session) session.stop(); session = null;
      user = next || null;
      pendingOperation=pendingOperation||readDeletionOperation();try{deletionPending=!!(pendingOperation&&(!user||pendingOperation.uid===user.uid))||!!(user&&localStorage.getItem('su_delete_request:'+user.uid));}catch(e){deletionPending=!!(pendingOperation&&(!user||pendingOperation.uid===user.uid));}
      // Keep a QA account's sign-out completion out of anonymous statistics too.
      // A different resolved account starts its own measurement decision.
      if(user)excludedSession=ownerIdentity();
      try { if (store && (store.owner() !== (user ? user.uid : null) || store.current && !store.current())) store.activate(user ? user.uid : null); }
      catch(e) { if(store.suspend)store.suspend(); notifyAuth(); status('error', e); return; }
      notifyAuth();
      if(deletionPending){if(store&&store.suspend)store.suspend();authMessage='Account deletion is pending. Open Account settings to resume.';status('error',{code:'account/deletion-pending'});}
      else if (user&&!deleting) startSync(); else if(!deleting)status('signed-out');
      render();
      deliverLogin();
    }, function (e) { if(attempt!==bootAttempt)return;clearTimeout(bootTimer);authReady=false;sessionGeneration++;if(session)session.stop();session=null;status('error',e); });
    render();
  }).catch(function (e) { if(attempt !== bootAttempt)return;clearTimeout(bootTimer);loadingSdk = false; authMessage = 'Sign-in could not load. Tap Google to retry.'; status('error', e); });
  }
  boot();
})();
