/* Consent-aware first-party product measurement. Public metadata only. */
(function(){
  'use strict';
  var queue=[],pending=[],catalog={},profile={},generation=0,authEpoch=0,flushBusy=false;
  var visitor=null,session=null,sessionAt=0,seen={},outbound=null,lastActivity=Date.now(),activeAt=Date.now(),activeSeconds=0;
  var ENDPOINT='/.netlify/functions/analytics-events',PROFILE='/.netlify/functions/analytics-profile';
  function stored(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function put(k,v){try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}}
  function choices(){return {analytics:stored('su_consent_v3')==='granted'&&!navigator.globalPrivacyControl,personalization:stored('su_personalization_v1')==='granted'};}
  function excluded(){return stored('su_admin')==='1';}
  function signedIn(){return !!(window.SUAuth&&window.SUAuth.signedIn());}
  function randomId(){if(!window.crypto||!window.crypto.getRandomValues)return null;var a=new Uint8Array(16);window.crypto.getRandomValues(a);return Array.from(a).map(function(x){return x.toString(16).padStart(2,'0');}).join('');}
  function page(){var p=location.pathname;return /^\/(jobs|j\/)/.test(p)?'board':/tracker/.test(p)?'tracker':/privacy/.test(p)?'privacy':/terms/.test(p)?'terms':/suggest/.test(p)?'suggest':p==='/'||/index/.test(p)?'home':'other';}
  function identifiers(){if(!session){try{var prior=JSON.parse(sessionStorage.getItem('su_analytics_session')||'null');if(prior&&Date.now()-prior.at<1800000){session=prior.id;sessionAt=prior.at;}}catch(e){}}if(!visitor){visitor=stored('su_analytics_visitor')||randomId();if(visitor&&choices().analytics)put('su_analytics_visitor',visitor);}if(!session||Date.now()-sessionAt>1800000){session=randomId();}sessionAt=Date.now();try{sessionStorage.setItem('su_analytics_session',JSON.stringify({id:session,at:sessionAt}));}catch(e){}return !!visitor&&!!session;}
  function consentEnabled(){var c=choices();return !excluded()&&(c.analytics||(c.personalization&&signedIn()));}
  function emit(name,params){
    if(!consentEnabled()||!identifiers())return;
    var c=choices();if(!c.analytics && !({job_open:1,job_save:1,apply_click:1,application_reported:1})[name])return;
    var e={id:randomId(),name:name,page:page(),occurredAt:Date.now()};
    // Explicit keys only. Never copy strings from DOM labels, forms or URLs.
    ['jobId','theme','filter','status','seconds','capped','vote','outboundId'].forEach(function(k){if(params&&params[k]!==undefined)e[k]=params[k];});
    queue.push(e);if(queue.length>120)queue.shift();
    if(queue.length>=20)flush();
  }
  async function flush(){
    if(flushBusy||!queue.length||!consentEnabled())return;
    flushBusy=true;var epoch=authEpoch,batch=queue.splice(0,30),c=choices(),auth=signedIn(),headers={'Content-Type':'application/json'};
    try{
      if(auth)headers.Authorization='Bearer '+await window.SUAuth.getToken();
      if(epoch!==authEpoch||!consentEnabled())return;
      var response=await fetch(ENDPOINT,{method:'POST',headers:headers,body:JSON.stringify({events:batch,session:session,visitor:visitor,consent:{analytics:c.analytics,personalization:c.personalization&&auth}}),keepalive:true,credentials:'same-origin'});
      if(!response.ok){
        if(response.status===429 || response.status>=500)throw new Error('delivery');
        if(epoch===authEpoch)window.dispatchEvent(new CustomEvent('su:analytics-status',{detail:{state:'discarded',status:response.status}}));
        return;
      }
      if(epoch===authEpoch)window.dispatchEvent(new CustomEvent('su:analytics-status',{detail:{state:'delivered'}}));
    }catch(e){if(epoch===authEpoch&&consentEnabled())queue=batch.concat(queue).slice(0,120);}
    finally{flushBusy=false;}
  }
  function keyFor(link){return window.SUJobIdentity ? window.SUJobIdentity.keys(link)[0]||link : link;}
  async function registerJobs(jobs){
    if(!window.crypto||!window.crypto.subtle)return;
    var next={};
    await Promise.all(jobs.map(async function(job){var key=keyFor(job.link);var bytes=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));var id=Array.from(new Uint8Array(bytes)).map(function(n){return n.toString(16).padStart(2,'0');}).join('');next[key]={id:id,job:job};}));
    catalog=next;pending.splice(0).forEach(function(e){jobEvent(e.name,e.link);});
  }
  function jobEvent(name,link){
    if(!consentEnabled())return;
    var item=catalog[keyFor(link)];if(!item){if(pending.length<30)pending.push({name:name,link:link});return;}
    if(name==='job_impression'||name==='job_open'){var receipt=name+':'+item.id;if(seen[receipt])return;seen[receipt]=true;}
    if(name==='apply_click')outbound={jobId:item.id,outboundId:randomId(),clicked:Date.now(),hiddenAt:null,returned:false};
    emit(name,{jobId:item.id,outboundId:name==='apply_click'?outbound.outboundId:undefined});
    // No live reorder: loaded profile is frozen for this visit. Actions become
    // next-visit signals after the server verifies and durably accepts them.
  }
  async function loadProfile(){
    var epoch=authEpoch;profile={};
    if(!signedIn()||!choices().personalization||excluded())return;
    try{var token=await window.SUAuth.getToken();var r=await fetch(PROFILE,{headers:{Authorization:'Bearer '+token},credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('profile');var data=await r.json();if(epoch!==authEpoch||!signedIn()||!choices().personalization)return;profile=data.jobs||{};generation++;window.dispatchEvent(new CustomEvent('su:profile-ready',{detail:{generation:generation}}));}catch(e){}
  }
  function tick(){var now=Date.now();if(choices().analytics&&!excluded()&&!document.hidden&&now-lastActivity<=60000)activeSeconds+=Math.min(5,(now-activeAt)/1000);activeAt=now;}
  function flushEngagement(){tick();if(activeSeconds>=1){emit('page_engagement',{seconds:Math.min(900,Math.round(activeSeconds))});activeSeconds=0;}flush();}
  function visibility(){
    tick();
    if(document.hidden){if(outbound&&!outbound.hiddenAt&&Date.now()-outbound.clicked<10000){outbound.hiddenAt=Date.now();emit('outbound_started',{jobId:outbound.jobId,outboundId:outbound.outboundId});}flushEngagement();}
    else {lastActivity=Date.now();if(outbound&&outbound.hiddenAt){var timing=window.SUPersonalization.away(outbound.hiddenAt,Date.now());emit('outbound_return',Object.assign({jobId:outbound.jobId,outboundId:outbound.outboundId},timing));outbound=null;}}
  }
  async function reset(){
    authEpoch++;queue=[];pending=[];seen={};outbound=null;profile={};generation++;
    if(signedIn()||visitor||stored('su_analytics_visitor')){var headers={'Content-Type':'application/json'};if(signedIn())headers.Authorization='Bearer '+await window.SUAuth.getToken();var r=await fetch(PROFILE,{method:'DELETE',headers:headers,body:JSON.stringify({visitor:visitor||stored('su_analytics_visitor')}),credentials:'same-origin'});if(!r.ok)throw new Error('Reset could not finish. Please try again.');}
    put('su_analytics_visitor',null);visitor=null;window.dispatchEvent(new CustomEvent('su:profile-ready',{detail:{generation:generation,reset:true}}));
  }
  window.SUAnalytics={emit:emit,job:jobEvent,registerJobs:registerJobs,flush:flush,choices:choices,profile:function(){return profile;},generation:function(){return generation;},reset:reset,loadProfile:loadProfile};
  window.suTrack=function(action,company,role,link){
    if(action==='cta'){var eventName={newsletter:'newsletter_click',story:'founder_open',carousel:'board_open'}[company];if(eventName)emit(eventName,{});return;}
    var maps={save:'job_save','tracker-add':'tracker_add','tracker-export':'tracker_export','tracker-status':'tracker_status',look:'theme_change',themevote:'theme_vote',filter:'filter_change',search:'search_used',note_open:'advice_open',note_view:'advice_impression',signup_open:'newsletter_open',signup_cta:'newsletter_click',note_cta:'newsletter_click'};
    if(action==='save'){jobEvent('job_save',link);return;}
    if(maps[action])emit(maps[action],action==='look'?{theme:company}:action==='themevote'?{theme:company,vote:role}:action==='filter'?{filter:company}:action==='tracker-status'?{status:role}:{});
  };
  window.addEventListener('su:auth-changed',function(event){authEpoch++;queue=[];pending=[];seen={};profile={};outbound=null;generation++;activeSeconds=0;activeAt=Date.now();lastActivity=Date.now();if(event.detail&&event.detail.accountChanged){session=null;try{sessionStorage.removeItem('su_analytics_session');}catch(e){}}loadProfile();if(choices().analytics){emit('page_view',{});if(page()==='tracker')emit('tracker_open',{});if(page()==='privacy')emit('privacy_open',{});}});
  window.addEventListener('su:consent-changed',function(){authEpoch++;queue=[];pending=[];seen={};profile={};outbound=null;generation++;activeSeconds=0;activeAt=Date.now();lastActivity=Date.now();if(!choices().analytics){put('su_analytics_visitor',null);visitor=null;session=null;try{sessionStorage.removeItem('su_analytics_session');}catch(e){}}loadProfile();if(choices().analytics)emit('page_view',{});});
  window.addEventListener('storage',function(e){if(e.key==='su_consent_v3'||e.key==='su_personalization_v1')window.dispatchEvent(new CustomEvent('su:consent-changed'));});
  ['pointerdown','keydown','scroll'].forEach(function(name){window.addEventListener(name,function(){lastActivity=Date.now();},{passive:true});});
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('pagehide',function(){if(outbound&&outbound.hiddenAt){emit('outbound_unknown',{jobId:outbound.jobId,outboundId:outbound.outboundId});outbound=null;}flushEngagement();});
  setInterval(function(){tick();flush();},5000);setInterval(flushEngagement,30000);
  function start(){emit('page_view',{});if(page()==='privacy')emit('privacy_open',{});if(page()==='tracker')emit('tracker_open',{});if(page()==='suggest')emit('suggest_open',{});loadProfile();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
}());
