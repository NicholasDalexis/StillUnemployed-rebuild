/* Privacy choices. Optional measurement is first-party and off until selected.
 * Generic click-label and free-text Google Analytics transport has been retired.
 */
(function(){
  'use strict';
  function get(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function set(k,v){try{localStorage.setItem(k,v);}catch(e){}}
  function style(){if(document.getElementById('su-cc-style'))return;var s=document.createElement('style');s.id='su-cc-style';s.textContent='.su-cc{background:var(--su-paper,#FCFAF3);color:var(--su-ink,#2A2118);font:16px/1.5 Archivo,sans-serif;border-block:1px solid #c9bfae;padding:16px;max-width:760px;margin:12px auto;box-sizing:border-box}.su-cc h2{font:24px/1.2 "Indie Flower",cursive;margin:0 0 8px}.su-cc p{margin:8px 0}.su-cc label{display:flex;align-items:center;gap:10px;min-height:44px}.su-cc input{width:20px;height:20px}.su-cc-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.su-cc button,.su-privacy-settings{min-height:44px;padding:8px 12px;font:inherit;color:var(--su-ink,#2A2118);border:1px solid #8c7a60;background:var(--su-paper,#FCFAF3);cursor:pointer}.su-cc .su-cc-save{background:var(--su-yellow-paper,#F2E14B)}.su-cc a{color:var(--su-orange-text,#A63D22);text-decoration:underline}.su-cc :focus-visible,.su-privacy-settings:focus-visible{outline:3px solid #2A2118;outline-offset:3px}.su-privacy-tools{max-width:760px;margin:24px auto;padding:0 16px;font:14px Archivo,sans-serif}.su-cc-feedback{min-height:24px}@media(max-width:800px){.su-cc{margin:12px 16px}}';document.head.appendChild(s);}
  function show(event){
    var manual=!!event,returnFocus=document.activeElement;
    if(document.getElementById('su-privacy-choices')){document.getElementById('su-privacy-choices').focus();return;}
    style();var bar=document.createElement('section');bar.id='su-privacy-choices';bar.className='su-cc';bar.tabIndex=-1;bar.setAttribute('aria-labelledby','su-privacy-title');
    bar.innerHTML='<h2 id="su-privacy-title">Make this board work for you</h2><p>Choose separately. Saved jobs and your tracker work with either choice.</p><label><input type="checkbox" name="analytics">Help improve the board with usage analytics</label><label><input type="checkbox" name="personalization">Personalize jobs from the roles I explore when signed in</label><p>Analytics measures job opens, saves, site features and estimated time away after opening a job. It cannot see what you do on another site. <a href="/privacy.html">Privacy details</a></p><div class="su-cc-actions"><button type="button" class="su-cc-save">Save choices</button><button type="button" class="su-cc-decline">No thanks</button><button type="button" class="su-cc-reset">Reset recommendation & analytics history</button></div><p class="su-cc-feedback" role="status"></p>';
    var analytics=bar.querySelector('[name="analytics"]'),personalization=bar.querySelector('[name="personalization"]'),feedback=bar.querySelector('[role="status"]');
    analytics.checked=get('su_consent_v3')==='granted';personalization.checked=get('su_personalization_v1')==='granted';
    if(navigator.globalPrivacyControl){analytics.checked=false;analytics.disabled=true;feedback.textContent='Your browser privacy signal keeps optional analytics off.';}
    function save(a,p){set('su_consent_v3',a?'granted':'denied');set('su_personalization_v1',p?'granted':'denied');window.dispatchEvent(new CustomEvent('su:consent-changed'));bar.remove();if(manual&&returnFocus&&returnFocus.focus)returnFocus.focus({preventScroll:true});}
    bar.querySelector('.su-cc-save').addEventListener('click',function(){save(analytics.checked,personalization.checked);});
    bar.querySelector('.su-cc-decline').addEventListener('click',function(){save(false,false);});
    bar.querySelector('.su-cc-reset').addEventListener('click',async function(e){e.target.disabled=true;feedback.textContent='Resetting your history…';try{if(!window.SUAnalytics)throw new Error('Please reload and try again.');await window.SUAnalytics.reset();feedback.textContent='Recommendation and optional analytics history reset. Your saved jobs and tracker are unchanged.';}catch(error){feedback.textContent=error.message;}finally{e.target.disabled=false;}});
    document.body.insertBefore(bar,document.body.firstChild);if(manual){bar.focus({preventScroll:true});bar.scrollIntoView({block:'start'});}
  }
  function boot(){style();var tools=document.createElement('div');tools.className='su-privacy-tools';var button=document.createElement('button');button.className='su-privacy-settings';button.type='button';button.textContent='Privacy & recommendations';button.addEventListener('click',show);tools.appendChild(button);document.body.appendChild(tools);if(!get('su_consent_v3')||!get('su_personalization_v1'))show();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
}());
