/* One-time guest reminders after three saved jobs or confirmed applications. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.SUSigninReminder=factory(root);
})(typeof window!=='undefined'?window:this,function(root){
  'use strict';
  var keys={applications:'su_signin_reminder_v1',saved:'su_saved_signin_reminder_v1'},panel=null,pending=false,timer=null,started=0;
  function guest(){var a=root.SUAuth,r=root.SUBoardRuntime;return !!(a&&a.measurementReady&&a.measurementReady()&&!a.signedIn()&&r&&r.owner()==='guest');}
  function seen(kind){try{return !!root.localStorage.getItem(keys[kind]);}catch(e){return true;}}
  function savedCount(){
    var app=root.SUApp,links=app&&app.state?Object.keys(app.state.saved||{}).filter(function(link){return app.state.saved[link];}):[];
    var groups=root.SUJobIdentity&&root.SUJobIdentity.groupJobs;
    return groups?groups(links.map(function(link){return {link:link};})).length:links.length;
  }
  function hide(){if(timer)root.clearTimeout(timer);timer=null;pending=false;if(panel)panel.remove();panel=null;}
  function attempt(){
    timer=null;
    if(!pending||seen(pending)||Date.now()-started>15000||pending==='saved'&&savedCount()<3){pending=false;return;}
    if(!guest()){if(root.SUAuth&&root.SUAuth.signedIn())pending=false;return;}
    if(root.document.hidden||root.document.querySelector('[aria-modal="true"],dialog[open],.su-launch-toast,.su-feedback-toast,.su-compact-feedback,#su-tracker-nudge,#su-saved-nudge')){
      timer=root.setTimeout(attempt,500);return;
    }
    // Save the receipt before displaying. Storage failure stays quiet instead of nagging.
    var kind=pending,key=keys[kind];
    try{root.localStorage.setItem(key,'shown');if(root.localStorage.getItem(key)!=='shown'){pending=false;return;}}catch(e){pending=false;return;}
    pending=false;panel=root.document.createElement('aside');panel.id='su-signin-reminder';panel.className='su-signin-reminder';panel.setAttribute('aria-label',kind==='saved'?'Keep your saved jobs with you':'Keep your applications together');
    panel.innerHTML=(kind==='saved'?'<p role="status">Sign in with Google so you can keep track of all your saves.</p>':'<p role="status">Three applications, already.</p><p>Sign in with Google to keep track of all your applications across devices.</p>')+'<div><button type="button" data-signin>Sign in with Google</button><button type="button" data-dismiss>Not now</button></div>';
    panel.querySelector('[data-dismiss]').addEventListener('click',hide);
    panel.querySelector('[data-signin]').addEventListener('click',function(e){if(guest()&&root.SUAuth.signIn)root.SUAuth.signIn(e.currentTarget);});
    root.document.body.appendChild(panel);
  }
  function request(kind){
    var r=root.SUBoardRuntime,a=root.SUAuth;if(!r||r.owner()!=='guest'||!a||a.signedIn()||seen(kind))return false;
    // One active reason at a time; do not restart its timer on another save.
    if(panel||pending)return true;
    pending=kind;started=Date.now();timer=root.setTimeout(attempt,850);return true;
  }
  function afterApplication(){
    var r=root.SUBoardRuntime;if(r&&r.applicationCount()>=3)request('applications');
  }
  function afterSave(){return savedCount()>=3&&request('saved');}
  if(root.addEventListener){
    root.addEventListener('su:auth-changed',function(){if(!guest())hide();else if(pending)attempt();});
    root.addEventListener('storage',function(e){if(e.key===keys.applications||e.key===keys.saved||e.key==='su_sync_owner')hide();});
    root.addEventListener('pagehide',hide);
  }
  return {afterApplication:afterApplication,afterSave:afterSave,hide:hide};
});
