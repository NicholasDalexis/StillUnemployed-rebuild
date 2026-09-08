/* A one-time guest reminder after three newly confirmed applications, never visits. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.SUSigninReminder=factory(root);
})(typeof window!=='undefined'?window:this,function(root){
  'use strict';
  var key='su_signin_reminder_v1',panel=null,pending=false,timer=null,started=0;
  function guest(){var a=root.SUAuth,r=root.SUBoardRuntime;return !!(a&&a.measurementReady&&a.measurementReady()&&!a.signedIn()&&r&&r.owner()==='guest');}
  function seen(){try{return !!root.localStorage.getItem(key);}catch(e){return true;}}
  function hide(){if(timer)root.clearTimeout(timer);timer=null;pending=false;if(panel)panel.remove();panel=null;}
  function attempt(){
    timer=null;
    if(!pending||seen()||Date.now()-started>15000){pending=false;return;}
    if(!guest()){if(root.SUAuth&&root.SUAuth.signedIn())pending=false;return;}
    if(root.document.hidden||root.document.querySelector('[aria-modal="true"],dialog[open],.su-launch-toast,.su-feedback-toast,#su-tracker-nudge,#su-saved-nudge')){
      timer=root.setTimeout(attempt,500);return;
    }
    // Save the receipt before displaying. Storage failure stays quiet instead of nagging.
    try{root.localStorage.setItem(key,'shown');if(root.localStorage.getItem(key)!=='shown'){pending=false;return;}}catch(e){pending=false;return;}
    pending=false;panel=root.document.createElement('aside');panel.id='su-signin-reminder';panel.className='su-signin-reminder';panel.setAttribute('aria-label','Keep your applications together');
    panel.innerHTML='<p role="status">Three applications, already.</p><p>Sign in with Google to keep track of all your applications across devices.</p><div><button type="button" data-signin>Sign in with Google</button><button type="button" data-dismiss>Not now</button></div>';
    panel.querySelector('[data-dismiss]').addEventListener('click',hide);
    panel.querySelector('[data-signin]').addEventListener('click',function(e){if(guest()&&root.SUAuth.signIn)root.SUAuth.signIn(e.currentTarget);});
    root.document.body.appendChild(panel);
  }
  function afterApplication(){
    var r=root.SUBoardRuntime;if(!r||r.owner()!=='guest'||r.applicationCount()<3||seen()||panel)return;
    pending=true;started=Date.now();if(timer)root.clearTimeout(timer);timer=root.setTimeout(attempt,850);
  }
  if(root.addEventListener){
    root.addEventListener('su:auth-changed',function(){if(!guest())hide();else if(pending)attempt();});
    root.addEventListener('storage',function(e){if(e.key===key||e.key==='su_sync_owner')hide();});
  }
  return {afterApplication:afterApplication,hide:hide};
});
