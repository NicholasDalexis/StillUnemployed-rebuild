/* Requested account features. Form text never enters optional analytics. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SUDiscovery=api.create(root);})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  var DAY=86400000;
  // Returning-visit suggestions are paused until their introduction is redesigned.
  // Preserve existing account history without reading or advancing visit receipts.
  var RETURNING_PICKS_ENABLED=false;
  function clean(value,max){return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
  function profile(value){value=value||{};return {major:clean(value.major,100),location:clean(value.location,100),info:clean(value.info,300)};}
  function fieldBoost(value){var text=(profile(value).major+' '+profile(value).info).toLowerCase(),out={};
    function add(fields){fields.forEach(function(f,i){out[f]=(out[f]||0)+(i?1:3);});}
    if(/market|business|advertis|communication|public relations|social media/.test(text))add(['Marketing','Creative']);
    if(/graphic|visual|illustrat|fine art|brand design/.test(text))add(['Creative','Product Design','Creative Technology','Marketing']);
    if(/\bux\b|\bui\b|product design|interaction|human.computer|psychology/.test(text))add(['Product Design','Creative','Marketing']);
    if(/photo|journalism/.test(text))add(['Photography','Marketing','Video']);
    if(/fashion|apparel|textile/.test(text))add(['Fashion Design','Creative','Marketing']);
    if(/computer|software|web develop|creative tech|information tech/.test(text))add(['Web Development','Creative Technology','Product Design','Artificial Intelligence']);
    if(/film|video|cinema|animation|audio|music|podcast/.test(text))add(['Video','Creative','Marketing']);
    if(/english|writing|literature|copy/.test(text))add(['Marketing','Product Design']);
    return out;
  }
  function lane(job){var c=job.ind||'',r=String(job.role||'').toLowerCase();
    if(c==='Social')return 'social';if(c==='Content & Copy')return 'copy';
    if(c==='Photography')return 'photography';
    if(c==='UX/UI Design'||c==='Creative Tech'||c==='Web Development')return 'product';
    if(c==='Video & Creative'&&/graphic|brand design|visual design|production artist|illustrat|packaging/.test(r))return 'graphic';
    if(['Brand & Marketing','Growth & CRM','PR & Partnerships','Influencer'].indexOf(c)>=0)return 'marketing';return 'other';
  }
  function starter(jobs,P){var lanes=['marketing','graphic','product','photography','social','copy'],used=new Set(),out=[];
    lanes.forEach(function(want){var pool=jobs.filter(function(j){return !used.has(j.link)&&lane(j)===want;});if(pool[0]){used.add(pool[0].link);out.push(pool[0]);}});
    // Keep the existing fresh/varied order within each lane. Pay never buys a top slot.
    // Missing lanes leave room for real remaining roles. Never manufacture a card.
    return out.concat(jobs.filter(function(j){return !used.has(j.link);}));
  }
  function create(root){var App,first=true,started=false,account=null,showHidden=false,form=false,draft=null,undo=null,message='',visitReady=false,recommendations=[],recOpen=false,promptDismissed=false,preferenceResult='',formError='',messageTimer=null;
    function signed(){return !!(root.SUAuth&&root.SUAuth.signedIn()&&(!root.SUAuth.accountCurrent||root.SUAuth.accountCurrent())&&root.SUStore&&root.SUStore.owner());}
    function data(){if(signed())return root.SUStore.discovery();try{return JSON.parse(root.localStorage.getItem('su_discovery_guest')||'{}');}catch(e){return {};}}
    function write(k,v){if(signed())return root.SUStore.setDiscovery(k,v);if(k.indexOf('job:')!==0)return false;var d=data();d[k]=v;root.localStorage.setItem('su_discovery_guest',JSON.stringify(d));return true;}
    function canonical(link){return root.SUJobIdentity.keys(link)[0]||link;}
    function key(link){return 'job:'+encodeURIComponent(canonical(link)).replace(/[!'()*]/g,function(c){return '%'+c.charCodeAt(0).toString(16).toUpperCase();});}
    function disposition(job){var d=data(),k=key(job.link);if(d[k])return d[k];var found=Object.keys(d).find(function(k){return k.indexOf('job:')===0&&d[k]&&root.SUJobIdentity.equivalent(d[k].link,job.link);});return found?d[found]:null;}
    function render(){if(App){App._profileGeneration=-1;App.render();}}
    function hidden(job){var value=disposition(job);return !!(value&&value.hidden);}
    function count(){var d=data();return Object.keys(d).filter(function(k){return k.indexOf('job:')===0&&d[k]&&d[k].confirmed;}).length;}
    function rememberVisit(){if(!RETURNING_PICKS_ENABLED)return;if(!signed()||!root.SUAuth.syncReady()||visitReady||!App||App._loadError||!App.jobs.length||App.internships)return;visitReady=true;
      var d=data(),now=Date.now(),last=d.visits||{},newSession=now-(last.lastAt||0)>=1800000,ids=App.jobs.map(function(j){return canonical(j.link);});
      if(newSession){var prior=Array.isArray(last.seen)?last.seen:[];var previousAt=last.lastAt||0;var number=(last.count||0)+1;
        if(number>=3&&previousAt&&last.snapshotComplete!==false&&ids.length<=2000&&last.remindedDay!==Math.floor(now/DAY))recommendations=App.jobs.filter(function(j){return prior.indexOf(canonical(j.link))<0&&!hidden(j);});
        write('visits',{count:number,lastAt:now,previousAt:previousAt,seen:ids.slice(0,2000),snapshotComplete:ids.length<=2000,remindedDay:recommendations.length?Math.floor(now/DAY):(last.remindedDay||0)});
      }else write('visits',Object.assign({},last,{lastAt:now}));
    }
    function useProfile(){return signed()?profile(data().profile):profile();}
    function order(jobs,P,interest){if(!signed()||!root.SUAnalytics||!root.SUAnalytics.choices||!root.SUAnalytics.choices().personalization)interest={};var prefs=useProfile(),boost=fieldBoost(prefs),major=prefs.major.toLowerCase();
      // A posting can explicitly welcome a major outside the small adjacency dictionary.
      var directFields={};if(major.length>=3)jobs.forEach(function(j){if(String(j.desc||'').toLowerCase().indexOf(major)>=0)directFields[P.classify(j).field]=true;});
      Object.keys(directFields).forEach(function(field){boost[field]=(boost[field]||0)+3;});
      var ranked=P.rank(jobs,interest,{fieldBoost:boost});
      if(first&&!signed())ranked=starter(jobs,P);
      else if(!Object.keys(P.preferences(interest||{},Date.now()).fields).length&&!Object.keys(boost).length)ranked=starter(jobs,P);
      if(prefs.location){var query=prefs.location.toLowerCase(),groups={};function group(j){var m=P.classify(j);return m.field+'|'+m.role;}ranked.forEach(function(j){(groups[group(j)]||(groups[group(j)]=[])).push(j);});Object.keys(groups).forEach(function(k){groups[k].sort(function(a,b){return Number(String(b.loc||'').toLowerCase().indexOf(query)>=0)-Number(String(a.loc||'').toLowerCase().indexOf(query)>=0);});});ranked=ranked.map(function(j){return groups[group(j)].shift();});}
      return ranked;
    }
    function blocked(){return !!(App&&(App.state.detailOpen||App.state.feedbackOpen||App.state.adviceOpen||App.state.signupOpen||App.state.lookOpen||App.state.modalOpen))||!!root.document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]:not(#overlay-root *)');}
    function preferencesOpen(){return signed()&&form&&!blocked();}
    function modalHTML(esc){
        var v=draft||useProfile();return '<form class="su-discovery-note su-preferences" id="su-discovery-form" data-act="stop" tabindex="-1" aria-labelledby="su-preferences-title"><button type="button" class="su-discovery-close" data-discovery="close" aria-label="Close preferences">×</button><h2 id="su-preferences-title">Make this board a little more you.</h2><p>A few hints help sort your jobs. Every answer is optional.</p><label for="su-major">Major or area of study <span>(optional)</span></label><input id="su-major" name="major" maxlength="100" value="'+esc(v.major)+'" placeholder="e.g. communications"><label for="su-location">Preferred location <span>(optional)</span></label><input id="su-location" name="location" maxlength="100" value="'+esc(v.location)+'" placeholder="e.g. Chicago"><details class="su-preferences-more"'+(v.info?' open':'')+'><summary>Anything else you want to explore? <span>(optional)</span></summary><label for="su-info">Roles or interests</label><textarea id="su-info" name="info" maxlength="300" placeholder="Roles or creative skills you enjoy">'+esc(v.info)+'</textarea><p class="su-discovery-small">These hints help sort your jobs. You can edit or clear them anytime. Skip sensitive details.</p></details><p class="su-preferences-error" role="status">'+esc(formError)+'</p><div class="su-discovery-tools su-preferences-actions"><button type="submit">Save preferences</button><button type="button" data-discovery="skip">Skip for now</button></div></form>';
    }
    function track(name){if(root.SUAnalytics&&typeof root.SUAnalytics.emit==='function')root.SUAnalytics.emit(name,{});}
    function closePreferences(){
      clearMessageTimer();promptDismissed=true;form=false;draft=null;message='';formError='';
      try{if(signed())write('promptAnswered',true);}catch(e){/* Closing remains possible offline or with full storage. */}
      render();
    }
    function resultText(){
      if(!preferenceResult)return message;
      var state=root.SUAuth&&root.SUAuth.syncState?root.SUAuth.syncState():'saving';
      var done=preferenceResult==='cleared'?'Preferences cleared':'Preferences saved';
      if(state==='synced')return done+' in your account.';
      if(state==='error')return done+' on this device. Account sync paused.';
      return done+'. Syncing to your account…';
    }
    function refreshDialog(){var note=root.document.querySelector('.su-preferences-error');if(note)note.textContent=formError;}
    function refreshStatus(){var node=root.document.getElementById('su-preference-status');if(node)node.textContent=resultText();var retry=root.document.getElementById('su-preference-retry');if(retry)retry.hidden=!(preferenceResult&&root.SUAuth.syncState&&root.SUAuth.syncState()==='error');}
    function hiddenCount(){return App&&Array.isArray(App.jobs)?App.jobs.filter(hidden).length:0;}
    function toolsHTML(esc){
      var total=hiddenCount();
      return (signed()?'<button type="button" id="su-preferences-open" data-discovery="settings" aria-haspopup="dialog">Your preferences</button>':'')+
        '<button type="button" data-discovery="hidden" aria-pressed="'+showHidden+'"'+(total?'':' disabled')+'>'+esc(showHidden?'Hide dismissed jobs':'Show hidden jobs')+' ('+total+')</button>';
    }
    function html(esc){
      if(!message&&!preferenceResult)return '';
      return '<section class="su-discovery su-discovery-feedback" aria-label="Board update"><p role="status"><span id="su-preference-status">'+esc(resultText())+'</span>'+(preferenceResult?' <button type="button" id="su-preference-retry" data-discovery="retry"'+(root.SUAuth.syncState&&root.SUAuth.syncState()==='error'?'':' hidden')+'>Retry sync</button>':'')+(undo?' <button type="button" data-discovery="undo">Undo</button>':'')+'</p></section>';
    }
    function clearMessageTimer(){if(messageTimer!==null&&root.clearTimeout)root.clearTimeout(messageTimer);messageTimer=null;}
    function expireMessage(){clearMessageTimer();if(!root.setTimeout)return;var expected=message,owner=account;messageTimer=root.setTimeout(function(){messageTimer=null;if(owner!==account||message!==expected)return;message='';undo=null;var status=root.document.getElementById('su-preference-status'),note=status&&status.closest('.su-discovery-feedback');if(note&&!preferenceResult)note.remove();},5000);}
    function dismiss(link,reason){preferenceResult='';var k=key(link),previous=data()[k]||null;undo={key:k,previous:previous};var value={link:link,reason:reason,hidden:true,confirmed:reason==='applied'||!!(previous&&previous.confirmed)};if(!write(k,value))return false;message=reason==='applied'?'Application noted. Hidden from your board.':'Job hidden from your board.';expireMessage();return true;}
    function updateCatalog(jobs){if(!App)return;var live=new Map((Array.isArray(jobs)?jobs:App.jobs).map(function(j){return [canonical(j.link),j];}));recommendations=recommendations.map(function(j){return live.get(canonical(j.link));}).filter(Boolean);if(!visitReady)rememberVisit();}
    function start(app){App=app;if(started)return;started=true;try{var legacy=JSON.parse(root.localStorage.getItem('su_reported_links')||'[]'),guest=JSON.parse(root.localStorage.getItem('su_discovery_guest')||'{}');legacy.forEach(function(link){if(!guest[key(link)])guest[key(link)]={link:link,reason:'unavailable',hidden:true,confirmed:false};});root.localStorage.setItem('su_discovery_guest',JSON.stringify(guest));}catch(e){}try{first=!root.localStorage.getItem('su_discovery_started');root.localStorage.setItem('su_discovery_started','1');}catch(e){}
      function auth(){clearMessageTimer();account=root.SUStore&&root.SUStore.owner();form=false;draft=null;undo=null;message='';formError='';preferenceResult='';promptDismissed=false;showHidden=false;recommendations=[];recOpen=false;visitReady=false;rememberVisit();render();}
      root.addEventListener('su:auth-changed',auth);
      root.addEventListener('su:sync-status',refreshStatus);
      root.addEventListener('su:account-ready',function(){rememberVisit();render();});
      root.addEventListener('su:data-sync',function(){if(account!==(root.SUStore&&root.SUStore.owner()))auth();else rememberVisit();});
      root.document.addEventListener('input',function(e){if(e.target.closest&&e.target.closest('#su-discovery-form'))draft=readForm();});
      function readForm(){var f=root.document.getElementById('su-discovery-form');return profile(f?{major:f.elements.major.value,location:f.elements.location.value,info:f.elements.info.value}:{});}
      root.document.addEventListener('submit',function(e){if(e.target.id!=='su-discovery-form')return;e.preventDefault();if(!signed())return;try{if(!write('profile',readForm()))throw Error('Not saved');write('promptAnswered',true);form=false;draft=null;promptDismissed=true;preferenceResult='saved';message='';track('preference_save');render();}catch(err){track('preference_error');formError='Could not save preferences. Your answers are still here. Please try again.';render();}});
      root.document.addEventListener('click',function(e){var button=e.target.closest&&e.target.closest('[data-discovery]');if(!button)return;e.preventDefault();var action=button.getAttribute('data-discovery');if(!signed()&&['hidden','undo','restore'].indexOf(action)<0)return;try{
        if(action==='settings'){clearMessageTimer();track('preference_open');form=true;draft=null;message='';formError='';preferenceResult='';}
        if(action==='close'){closePreferences();return;}
        if(action==='retry'){if(root.SUAuth.retrySync)root.SUAuth.retrySync();return;}
        if(action==='hidden')showHidden=!showHidden;
        if(['undo','restore'].indexOf(action)>=0)preferenceResult='';
        if(action==='skip'){try{if(write('promptAnswered',true))track('preference_skip');}catch(e){/* Skipping must not trap someone when storage fails. */}closePreferences();return;}
        if(action==='clear'){if(!write('profile',null))throw Error('Not cleared');write('promptAnswered',true);form=false;draft=null;promptDismissed=true;preferenceResult='cleared';message='';track('preference_clear');}
        if(action==='undo'&&undo){write(undo.key,undo.previous);undo=null;message='Restored to your board. Tracker entries are unchanged.';expireMessage();}
        if(action==='restore'){var keyToRestore=button.getAttribute('data-key'),old=data()[keyToRestore];if(old)write(keyToRestore,Object.assign({},old,{hidden:false}));}
        if(RETURNING_PICKS_ENABLED&&(action==='recommend'||action==='dismiss-recos')){var visits=data().visits||{};write('visits',Object.assign({},visits,{remindedDay:Math.floor(Date.now()/DAY)}));if(action==='dismiss-recos')recommendations=[];else recOpen=!recOpen;}
        if(action==='settings'&&App.renderOverlays)App.renderOverlays();else render();if(action==='settings'){var panel=root.document.getElementById('su-discovery-form');if(panel){panel.focus({preventScroll:true});}}
      }catch(err){if(action==='clear')track('preference_error');message='This change could not be saved. Please try again.';formError=message;render();}});
      account=root.SUStore&&root.SUStore.owner();rememberVisit();
    }
    return {start:start,updateCatalog:updateCatalog,order:order,html:html,toolsHTML:toolsHTML,hiddenCount:hiddenCount,preferencesOpen:preferencesOpen,modalHTML:modalHTML,refreshDialog:refreshDialog,closePreferences:closePreferences,dialogOwner:function(){return account;},hidden:hidden,showHidden:function(){return showHidden;},dismiss:dismiss,key:key,confirmedCount:count,profile:useProfile};
  }
  return {profile:profile,fieldBoost:fieldBoost,lane:lane,starter:starter,create:create};
});
