/* Signup confirmation sits above, and never replaces, the current job/advice. */
(function(global){
  'use strict';
  var doc=global.document,dialog,returnTo,RESUME_KEY='su_newsletter_resume_v1';
  function pendingContext(){
    try{
      var saved=JSON.parse(global.sessionStorage.getItem(RESUME_KEY)||'null');
      if(!saved||!saved.context||Date.now()-saved.at>600000||Date.now()<saved.at){global.sessionStorage.removeItem(RESUME_KEY);return null;}
      return saved.context;
    }catch(_){return null;}
  }
  var closeIcon='<svg class="su-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
  function open(frame){
    if(!frame||!frame.isConnected)return;
    if(!dialog){
      dialog=doc.createElement('dialog');dialog.id='su-newsletter-success';dialog.className='su-newsletter-success';
      dialog.setAttribute('aria-labelledby','su-newsletter-thanks');dialog.setAttribute('aria-describedby','su-newsletter-welcome');
      dialog.innerHTML='<div class="su-newsletter-success-paper"><button type="button" class="su-newsletter-success-close" aria-label="Close confirmation">'+closeIcon+'</button><h2 id="su-newsletter-thanks" tabindex="-1">Thanks!</h2><p id="su-newsletter-welcome">Welcome email sent. <span>Free resume</span> template inside!</p><a class="su-newsletter-go" href="https://mail.google.com/" target="_blank" rel="noopener noreferrer">Let’s go <svg width="30" height="22" viewBox="0 0 52 30" aria-hidden="true"><path d="M3 18Q24 5 46 15M36 5l12 10-13 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></a><p class="su-newsletter-success-ps">P.S. If you don’t see it, look in Promotions or your Spam folder.</p></div>';
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
    returnTo=frame; if(!dialog.open)dialog.showModal();dialog.querySelector('h2').focus({preventScroll:true});
  }
  function tryResume(){
    var wanted=pendingContext();if(!wanted)return;
    var frame=Array.from(doc.querySelectorAll('#overlay-root iframe[data-newsletter-context]')).find(function(candidate){
      try{var context=JSON.parse(candidate.getAttribute('data-newsletter-context'));return context.placement===wanted.placement&&(!wanted.link||context.link===wanted.link)&&(!wanted.noteId||context.noteId===wanted.noteId);}catch(_){return false;}
    });
    if(!frame)return;
    try{global.sessionStorage.removeItem(RESUME_KEY);}catch(_){}
    open(frame);
  }
  global.SUNewsletterSuccess={open:open,pendingContext:pendingContext,tryResume:tryResume};
})(window);
