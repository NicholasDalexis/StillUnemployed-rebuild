/* A device-local shortcut after the first and every fifth successful new save. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.SUSavedReminder=factory(root);
})(typeof window!=='undefined'?window:this,function(root){
  'use strict';
  var panel=null,timer=null,identity=null,started=0;
  function hide(){if(timer)root.clearTimeout(timer);timer=null;if(panel)panel.remove();panel=null;}
  function attempt(){
    timer=null;
    var runtime=root.SUBoardRuntime,app=root.SUApp;
    if(!runtime||identity!==runtime.owner()||!app||app.state.savedOnly||!Object.keys(app.state.saved||{}).some(function(key){return app.state.saved[key];})||Date.now()-started>15000)return;
    if(root.document.hidden||root.document.querySelector('[aria-modal="true"],dialog[open],.su-launch-toast,.su-feedback-toast,#su-tracker-nudge,#su-signin-reminder')){
      timer=root.setTimeout(attempt,500);return;
    }
    panel=root.document.createElement('aside');panel.id='su-saved-nudge';panel.className='su-tracker-nudge su-saved-nudge';panel.setAttribute('aria-label','Saved job reminder');
    panel.innerHTML='<button type="button" class="su-saved-shortcut" aria-label="View saved jobs"><span role="status">Save for Later</span><svg width="24" height="14" viewBox="0 0 28 14" fill="none" aria-hidden="true"><path d="M1 7 Q12 1 25 7 M19 2 L26 7 L19 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="su-tracker-sticky">Saved</span></button><button type="button" data-dismiss aria-label="Dismiss saved reminder">×</button>';
    panel.querySelector('[data-dismiss]').addEventListener('click',hide);
    panel.querySelector('.su-saved-shortcut').addEventListener('click',function(){
      if(identity!==runtime.owner()){hide();return;}
      hide();app.setState({savedOnly:true});
      var control=root.document.querySelector('[data-act="toggleSavedOnly"]');
      if(control){control.scrollIntoView({block:'center'});control.focus({preventScroll:true});}
    });
    root.document.body.appendChild(panel);timer=root.setTimeout(hide,9000);
  }
  function afterSave(){
    var runtime=root.SUBoardRuntime;
    if(!runtime)return;
    var showShortcut=runtime.recordSave();
    // The first guest save explains cross-device sign-in instead of stacking
    // two notes. Later cadence saves still point to the existing Saved section.
    if(root.SUSigninReminder&&root.SUSigninReminder.afterSave()){hide();return;}
    if(!showShortcut)return;
    hide();identity=runtime.owner();started=Date.now();timer=root.setTimeout(attempt,850);
  }
  if(root.addEventListener){
    root.addEventListener('su:auth-changed',hide);
    root.addEventListener('storage',function(e){if(e.key==='su_sync_owner')hide();});
    root.addEventListener('pagehide',hide);
  }
  return {afterSave:afterSave,hide:hide};
});
