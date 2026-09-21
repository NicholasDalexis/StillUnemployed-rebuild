/* Optional newsletter measurement. Form submission stays inside Beehiiv. */
(function(global){
  'use strict';
  var KEY='su_newsletter_receipts_v1',ENDPOINT='/.netlify/functions/newsletter-attribution',epoch=0,cache=new Map(),frames=new WeakMap();
  function allowed(){var a=global.SUAnalytics;return !!(a&&a.choices().analytics&&!a.excluded());}
  function saved(){try{return JSON.parse(localStorage.getItem(KEY)||'[]').filter(function(r){return /^[a-f0-9]{64}$/.test(r.token)&&r.at>Date.now()-30*86400000;});}catch(_){return [];}}
  function write(rows){try{if(rows.length)localStorage.setItem(KEY,JSON.stringify(rows));else localStorage.removeItem(KEY);return true;}catch(_){return false;}}
  function token(){var bytes=new Uint8Array(32);global.crypto.getRandomValues(bytes);return Array.from(bytes).map(function(n){return n.toString(16).padStart(2,'0');}).join('');}
  async function revoke(){
    epoch++;cache.clear();var rows=saved();if(!rows.length)return;
    // Keep only these opaque tokens until deletion is acknowledged, so a brief
    // offline period cannot silently cancel the visitor's withdrawal request.
    rows.forEach(function(r){r.revoked=true;});write(rows);
    var response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'revoke',tokens:rows.map(function(r){return r.token;})}),credentials:'same-origin',keepalive:true});
    if(!response.ok)throw Error('Newsletter history reset could not finish. Please retry.');
    var tokens=new Set(rows.map(function(r){return r.token;}));write(saved().filter(function(r){return !tokens.has(r.token);}));
  }
  async function receipt(context){
    if(!allowed()||saved().some(function(r){return r.revoked;}))return null;
    var rows=saved();if(rows.length>=100)return null;
    var id=token(),entry={token:id,at:Date.now()},generation=epoch;rows.push(entry);if(!write(rows))return null;
    var abort=new AbortController(),timer=setTimeout(function(){abort.abort();},1200);
    try{
      var result=await global.SUAnalytics.newsletterRequest(id,context,abort.signal);
      if(generation!==epoch||!allowed()){revoke().catch(function(){});return null;}
      return result;
    }catch(_){return null;}finally{clearTimeout(timer);}
  }
  function load(frame,base,context){
    var generation=epoch,key=JSON.stringify([context.placement,context.cta,context.exposure]),state=cache.get(key);
    if(!state){state={epoch:epoch,context:context,impressed:false,engaged:false,result:null,promise:receipt(context)};cache.set(key,state);if(cache.size>100)cache.delete(cache.keys().next().value);}
    frames.set(frame,state);
    state.promise.then(function(result){
      if(!frame.isConnected)return;
      state.result=generation===epoch&&allowed()?result:null;
      var url=new URL(base);
      if(state.result){url.searchParams.set('utm_source','stillunemployed');url.searchParams.set('utm_medium','website');url.searchParams.set('utm_campaign',state.result.campaign);}
      frame.src=url.href;
      if(!state.result||state.impressed||!global.IntersectionObserver)return;
      var observer=new IntersectionObserver(function(entries){
        if(!frame.isConnected){observer.disconnect();return;}
        if(entries.some(function(e){return e.isIntersecting&&e.intersectionRatio>=0.5;})&&!document.hidden&&allowed()&&generation===epoch){
          state.impressed=true;record(state,'newsletter_impression');observer.disconnect();
        }
      },{threshold:0.5});observer.observe(frame);
      // Detached overlays must not accumulate active observers for a long visit.
      setTimeout(function(){observer.disconnect();},120000);
    });
  }
  function record(state,name){if(!allowed()||state.epoch!==epoch)return;if(!state.result){if(name==='newsletter_engagement')global.SUAnalytics.emit('newsletter_click',{});return;}global.SUAnalytics.emit(name,{placement:state.context.placement,cta:state.context.cta,jobId:state.result.jobId,newsletterReceipt:state.result.campaign.slice(3),revision:state.context.cta==='N16'?2:1});}
  global.addEventListener('blur',function(){setTimeout(function(){var state=frames.get(document.activeElement);if(state&&!state.engaged){state.engaged=true;record(state,'newsletter_engagement');}},0);});
  global.addEventListener('su:consent-changed',function(){if(!allowed())revoke().catch(function(){});else {epoch++;cache.clear();}});
  global.addEventListener('su:auth-changed',function(event){if(event.detail&&event.detail.accountChanged)revoke().catch(function(){});});
  global.addEventListener('online',function(){if(!allowed()||saved().some(function(r){return r.revoked;}))revoke().catch(function(){});});
  global.SUNewsletter={load:load,revoke:revoke};
  if(!allowed()||saved().some(function(r){return r.revoked;}))revoke().catch(function(){});
})(window);
