/* Requested account features. Form text never enters optional analytics. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SUDiscovery=api.create(root);})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  var DAY=86400000;
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
    function cmp(a,b){var ap=P.salary(a.pay),bp=P.salary(b.pay);return Number(bp.basis==='annual'&&bp.minimum>=100000)-Number(ap.basis==='annual'&&ap.minimum>=100000)||(ap.basis===bp.basis?(bp.minimum||0)-(ap.minimum||0):0)||String(a.link).localeCompare(String(b.link));}
    lanes.forEach(function(want){var pool=jobs.filter(function(j){return !used.has(j.link)&&lane(j)===want;}).sort(cmp);if(pool[0]){used.add(pool[0].link);out.push(pool[0]);}});
    // Missing lanes leave room for real remaining roles. Never manufacture a card.
    return out.concat(jobs.filter(function(j){return !used.has(j.link);}).sort(function(a,b){return String(a.link).localeCompare(String(b.link));}));
  }
  function create(root){var App,first=true,started=false,account=null,showHidden=false,form=false,draft=null,undo=null,message='',visitReady=false,recommendations=[],recOpen=false;
    function signed(){return !!(root.SUAuth&&root.SUAuth.signedIn()&&root.SUStore&&root.SUStore.owner());}
    function data(){if(signed())return root.SUStore.discovery();try{return JSON.parse(root.localStorage.getItem('su_discovery_guest')||'{}');}catch(e){return {};}}
    function write(k,v){if(signed())return root.SUStore.setDiscovery(k,v);if(k.indexOf('job:')!==0)return false;var d=data();d[k]=v;root.localStorage.setItem('su_discovery_guest',JSON.stringify(d));return true;}
    function canonical(link){return root.SUJobIdentity.keys(link)[0]||link;}
    function key(link){return 'job:'+encodeURIComponent(canonical(link)).replace(/[!'()*]/g,function(c){return '%'+c.charCodeAt(0).toString(16).toUpperCase();});}
    function disposition(job){var d=data(),k=key(job.link);if(d[k])return d[k];var found=Object.keys(d).find(function(k){return k.indexOf('job:')===0&&d[k]&&root.SUJobIdentity.equivalent(d[k].link,job.link);});return found?d[found]:null;}
    function render(){if(App){App._profileGeneration=-1;App.render();}}
    function hidden(job){var value=disposition(job);return !!(value&&value.hidden);}
    function count(){var d=data();return Object.keys(d).filter(function(k){return k.indexOf('job:')===0&&d[k]&&d[k].confirmed;}).length;}
    function rememberVisit(){if(!signed()||!root.SUAuth.syncReady()||visitReady||!App||App._loadError||!App.jobs.length||App.internships)return;visitReady=true;
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
    function blocked(){return !!(App&&(App.state.detailOpen||App.state.feedbackOpen||App.state.adviceOpen||App.state.signupOpen||App.state.lookOpen||App.state.modalOpen))||!!root.document.querySelector('[role="dialog"][aria-modal="true"]');}
    function html(esc){var d=data(),p=useProfile(),hasHidden=Object.keys(d).some(function(k){return k.indexOf('job:')===0&&d[k]&&d[k].hidden;});
      if(!signed()&&!hasHidden&&!message)return '';
      var out='<section class="su-discovery" aria-label="Your job preferences"><div class="su-discovery-tools">'+(signed()?'<button type="button" data-discovery="settings">Your preferences</button>':'')+(hasHidden?'<button type="button" data-discovery="hidden" aria-pressed="'+showHidden+'">'+(showHidden?'Hide dismissed jobs':'Show hidden jobs')+'</button>':'')+'</div>';
      if(message)out+='<p role="status">'+esc(message)+(undo?' <button type="button" data-discovery="undo">Undo</button>':'')+'</p>';
      var automatic=signed()&&count()>=3&&!d.promptAnswered;
      if((form||automatic)&&!blocked()){
        var v=draft||p;out+='<form class="su-discovery-note" id="su-discovery-form"><button type="button" class="su-discovery-close" data-discovery="skip" aria-label="Skip preferences">×</button><h2>Make this board a little more you.</h2><p>Every answer is optional. Your major and related interests help sort roles, never rule you out.</p><label for="su-major">Major or area of study <span>(optional)</span></label><input id="su-major" name="major" maxlength="100" value="'+esc(v.major)+'" placeholder="e.g. communications"><label for="su-location">Preferred location <span>(optional)</span></label><input id="su-location" name="location" maxlength="100" value="'+esc(v.location)+'" placeholder="e.g. Chicago"><label for="su-info">Anything else you want to explore? <span>(optional)</span></label><textarea id="su-info" name="info" maxlength="300" placeholder="Roles or creative skills you enjoy">'+esc(v.info)+'</textarea><p class="su-discovery-small">A few role and study keywords guide ordering. This is not a qualifications check. Avoid private or sensitive details. You can edit or clear these answers here.</p><div class="su-discovery-tools"><button type="submit">Save preferences</button><button type="button" data-discovery="skip">Skip for now</button><button type="button" data-discovery="clear">Clear answers</button></div></form>';
      }else if(recommendations.length&&!blocked()){
        out+='<div class="su-discovery-note"><button class="su-discovery-close" type="button" data-discovery="dismiss-recos" aria-label="Dismiss new jobs note">×</button><h2>A few new pages in your notebook.</h2><p>New to the loaded board since your last visit. Want to see up to three? Your written preferences can help choose them.</p><button type="button" data-discovery="recommend">'+(recOpen?'Close suggestions':'Show my new picks')+'</button>';
        if(recOpen){out+='<ol class="su-discovery-picks">';order(recommendations,root.SUPersonalization,root.SUAnalytics?root.SUAnalytics.profile():{}).filter(function(j){return !hidden(j)&&App.matchesBase(j)&&(App.state.cat==='all'||j.ind===App.state.cat);}).slice(0,3).forEach(function(j){out+='<li><button type="button" data-act="openJob" data-link="'+esc(j.link)+'"><strong>'+esc(j.co)+'</strong><span>'+esc(j.role)+'</span><span>'+esc(j.pay)+'</span></button></li>';});out+='</ol>';}
        out+='</div>';
      }return out+'</section>';
    }
    function dismiss(link,reason){var k=key(link),previous=data()[k]||null;undo={key:k,previous:previous};var value={link:link,reason:reason,hidden:true,confirmed:reason==='applied'||!!(previous&&previous.confirmed)};if(!write(k,value))return false;message=reason==='applied'?'Application noted. Hidden from your board.':'Job hidden from your board.';return true;}
    function start(app){App=app;if(started)return;started=true;try{var legacy=JSON.parse(root.localStorage.getItem('su_reported_links')||'[]'),guest=JSON.parse(root.localStorage.getItem('su_discovery_guest')||'{}');legacy.forEach(function(link){if(!guest[key(link)])guest[key(link)]={link:link,reason:'unavailable',hidden:true,confirmed:false};});root.localStorage.setItem('su_discovery_guest',JSON.stringify(guest));}catch(e){}try{first=!root.localStorage.getItem('su_discovery_started');root.localStorage.setItem('su_discovery_started','1');}catch(e){}
      function auth(){account=root.SUStore&&root.SUStore.owner();form=false;draft=null;undo=null;message='';showHidden=false;recommendations=[];recOpen=false;visitReady=false;rememberVisit();render();}
      root.addEventListener('su:auth-changed',auth);
      root.addEventListener('su:account-ready',function(){rememberVisit();render();});
      root.addEventListener('su:data-sync',function(){if(account!==(root.SUStore&&root.SUStore.owner()))auth();else rememberVisit();});
      root.document.addEventListener('input',function(e){if(e.target.closest&&e.target.closest('#su-discovery-form'))draft=readForm();});
      function readForm(){var f=root.document.getElementById('su-discovery-form');return profile(f?{major:f.elements.major.value,location:f.elements.location.value,info:f.elements.info.value}:{});}
      root.document.addEventListener('submit',function(e){if(e.target.id!=='su-discovery-form')return;e.preventDefault();if(!signed())return;try{write('profile',readForm());write('promptAnswered',true);form=false;draft=null;message='Preferences saved on this device. Account sync status is beside Google.';render();}catch(err){message='Could not save preferences. Please try again.';render();}});
      root.document.addEventListener('click',function(e){var button=e.target.closest&&e.target.closest('[data-discovery]');if(!button)return;e.preventDefault();var action=button.getAttribute('data-discovery');if(!signed()&&['hidden','undo','restore'].indexOf(action)<0)return;try{
        if(action==='settings'){form=!form;draft=null;}
        if(action==='hidden')showHidden=!showHidden;
        if(action==='skip'){write('promptAnswered',true);form=false;draft=null;}
        if(action==='clear'){write('profile',null);write('promptAnswered',true);form=false;draft=null;message='Your written preferences were cleared.';}
        if(action==='undo'&&undo){write(undo.key,undo.previous);undo=null;message='Restored to your board. Tracker entries are unchanged.';}
        if(action==='restore'){var keyToRestore=button.getAttribute('data-key'),old=data()[keyToRestore];if(old)write(keyToRestore,Object.assign({},old,{hidden:false}));}
        if(action==='recommend'||action==='dismiss-recos'){var visits=data().visits||{};write('visits',Object.assign({},visits,{remindedDay:Math.floor(Date.now()/DAY)}));if(action==='dismiss-recos')recommendations=[];else recOpen=!recOpen;}
        render();if(action==='settings'){var panel=root.document.getElementById('su-discovery-form');if(panel){panel.querySelector('input').focus({preventScroll:true});panel.scrollIntoView({block:'nearest'});}}
      }catch(err){message='This change could not be saved. Please try again.';render();}});
      account=root.SUStore&&root.SUStore.owner();rememberVisit();
    }
    return {start:start,order:order,html:html,hidden:hidden,showHidden:function(){return showHidden;},dismiss:dismiss,key:key,confirmedCount:count,profile:useProfile};
  }
  return {profile:profile,fieldBoost:fieldBoost,lane:lane,starter:starter,create:create};
});
