/* This page is the success-only destination configured on the preview form. */
(function(global){
  'use strict';
  if(global.parent!==global){
    global.parent.postMessage({type:'su:newsletter-confirmed',path:'/newsletter-confirmed.html'},global.location.origin);
    return;
  }
  // Beehiiv's embedded-form redirect opens in the parent tab. Carry only the
  // current board location and public note/job context back to the board.
  try{
    var saved=JSON.parse(global.sessionStorage.getItem('su_newsletter_return_v1')||'null');
    global.sessionStorage.removeItem('su_newsletter_return_v1');
    if(!saved||!Number.isFinite(saved.at)||Date.now()-saved.at>600000||Date.now()<saved.at||!saved.context||['job-detail','advice','signup-card'].indexOf(saved.context.placement)<0) return;
    var url=new URL(saved.url);
    if(url.origin!==global.location.origin||!/^\/$|^\/(?:index|jobs|internships)\.html$|^\/jobs\/[a-z0-9-]+\/$|^\/j\/(?:internships\/)?[a-z0-9-]+\/[a-z0-9-]+\.html$/.test(url.pathname))return;
    if(saved.context.placement==='job-detail'&&/^https?:\/\//.test(saved.context.link||''))url.searchParams.set('job',btoa(unescape(encodeURIComponent(saved.context.link))));
    global.sessionStorage.setItem('su_newsletter_resume_v1',JSON.stringify({at:Date.now(),context:saved.context}));
    // No fallback page may paint between the provider and the board.
    global.document.documentElement.hidden=true;
    global.location.replace(url.href);
  }catch(_){}
})(window);
