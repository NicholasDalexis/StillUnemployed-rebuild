/* Signup confirmation sits above, and never replaces, the current job/advice. */
(function(global){
  'use strict';
  var doc=global.document,dialog,returnTo,confirmedThisVisit=false,RESUME_KEY='su_newsletter_resume_v1';
  var restoring=readContext(),restored=false;
  function readContext(){
    try{
      var saved=JSON.parse(global.sessionStorage.getItem(RESUME_KEY)||'null');
      if(!saved||!Number.isFinite(saved.at)||!saved.context||['job-detail','advice','signup-card'].indexOf(saved.context.placement)<0||Date.now()-saved.at>600000||Date.now()<saved.at){global.sessionStorage.removeItem(RESUME_KEY);return null;}
      return saved.context;
    }catch(_){return null;}
  }
  function pendingContext(){return restored?null:restoring;}
  function isOpen(){return !!(dialog&&dialog.open);}
  function attach(frame){
    var capture=frame.closest&&frame.closest('[data-newsletter-id]');
    if(capture)capture.hidden=true;
    returnTo=frame.closest&&frame.closest('[data-act="stop"]')||frame;
    if(dialog)dialog.removeAttribute('data-restoring');
  }
  var closeIcon='<svg class="su-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
  function open(frame){
    if(!frame||!frame.isConnected)return;
    show();attach(frame);
  }
  function show(){
    if(!dialog){
      dialog=doc.createElement('dialog');dialog.id='su-newsletter-success';dialog.className='su-newsletter-success';
      dialog.setAttribute('aria-labelledby','su-newsletter-title');dialog.setAttribute('aria-describedby','su-newsletter-message');
      dialog.innerHTML='<div class="su-newsletter-success-paper"><button type="button" class="su-newsletter-success-close" aria-label="Close confirmation">'+closeIcon+'</button><h2 id="su-newsletter-title" tabindex="-1">Welcome email sent!</h2><p id="su-newsletter-message">Check promotions or spam folder!</p><a class="su-newsletter-go" href="https://mail.google.com/" target="_blank" rel="noopener noreferrer">Let’s go <svg width="30" height="22" viewBox="0 0 52 30" aria-hidden="true"><path d="M3 18Q24 5 46 15M36 5l12 10-13 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></a><p class="su-newsletter-success-ps">p.s <span>Free Resume</span> template attached</p></div>';
      doc.body.appendChild(dialog);
      dialog.querySelector('button').addEventListener('click',function(){dialog.close();});
      // Dismiss before the app handoff. Whether iOS chooses Open or Cancel,
      // the original job note is still there, without a second thank-you layer.
      var gmail=dialog.querySelector('a');
      if(/iPad|iPhone|iPod/.test(global.navigator.userAgent)||(global.navigator.platform==='MacIntel'&&global.navigator.maxTouchPoints>1)){gmail.href='googlegmail://';gmail.target='_self';}
      gmail.addEventListener('click',function(){dialog.close();});
      dialog.addEventListener('cancel',function(e){e.stopPropagation();});
      dialog.addEventListener('close',function(){if(returnTo&&returnTo.isConnected)returnTo.focus({preventScroll:true});});
      dialog.addEventListener('click',function(e){if(e.target===dialog)dialog.close();});
    }
    confirmedThisVisit=true;
    if(restoring&&!restored)dialog.setAttribute('data-restoring','');
    if(!dialog.open)dialog.showModal();dialog.querySelector('h2').focus({preventScroll:true});
  }
  function tryResume(){
    var wanted=pendingContext();if(!wanted)return;
    var frame=Array.from(doc.querySelectorAll('#overlay-root iframe[data-newsletter-context]')).find(function(candidate){
      try{var context=JSON.parse(candidate.getAttribute('data-newsletter-context'));return context.placement===wanted.placement&&(!wanted.link||context.link===wanted.link)&&(!wanted.noteId||context.noteId===wanted.noteId);}catch(_){return false;}
    });
    if(!frame&&wanted.placement==='job-detail'){
      var action=doc.querySelector('#overlay-root [data-act="detailApply"][data-link],#overlay-root [data-act="detailProgram"][data-link],#overlay-root [data-act="detailArchived"][data-link]');
      if(action&&action.getAttribute('data-link')===wanted.link)frame=action.closest('[data-act="stop"]');
    }
    if(!frame)return;
    restored=true;attach(frame);
    // It may have been dismissed while the catalog was loading. Never reopen it.

  }
  global.SUNewsletterSuccess={open:open,pendingContext:pendingContext,tryResume:tryResume,isOpen:isOpen,confirmed:function(){return confirmedThisVisit;}};
  // This small script runs at the start of body, before the board can paint.
  // Feed readiness controls the note underneath, never signup feedback.
  if(restoring){
    show();
    try{global.sessionStorage.removeItem(RESUME_KEY);}catch(_){}
  }
})(window);
