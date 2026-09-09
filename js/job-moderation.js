/* Public availability index and explicit owner moderation. No browser persistence. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports={create:factory};
  else root.SUJobModeration=factory(root);
})(typeof window!=='undefined'?window:this,function(root){
  'use strict';
  var state={status:'unknown',revision:0,removed:[]},listeners=[],request=null,epoch=0,floor=0;
  var local=!!(root.location&&(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(root.location.hostname)||root.location.protocol==='file:'));
  var fetcher=root.fetch.bind(root), endpoint='/api/job-moderation';
  function error(message){return new Error(message||'Could not check current job availability. Please try again.');}
  function emit(next){var changed=state.status!==next.status||state.revision!==next.revision;state=next;if(changed)listeners.slice().forEach(function(fn){try{fn(state);}catch(_){}});}
  function inspect(link){return root.SUJobIdentity&&root.SUJobIdentity.inspect(link);}
  function validLink(link){var info=typeof link==='string'&&link.length<=8192&&inspect(link);return !!(info&&info.valid&&!info.ambiguous);}
  function validate(data){
    if(!data||data.schemaVersion!==1||!Number.isSafeInteger(data.revision)||data.revision<floor||!Array.isArray(data.removed)||data.removed.length>1000||typeof data.checkedAt!=='string'||!Number.isFinite(Date.parse(data.checkedAt)))throw error();
    data.removed.forEach(function(row){if(!row||!validLink(row.link)||!Array.isArray(row.keys)||!row.keys.length||row.keys.length>64||row.keys.some(function(k){return typeof k!=='string'||k.length>8200||!/^(url:|ats:)/.test(k);})||!Array.isArray(row.slugs)||row.slugs.length>64||row.slugs.some(function(s){return typeof s!=='string'||!/^[a-zA-Z0-9_-]{1,300}$/.test(s);}))throw error();});
    return {status:'ready',revision:data.revision,removed:data.removed,checkedAt:data.checkedAt};
  }
  function timedFetch(options){
    var controller=new root.AbortController(),timer;
    var timeout=new Promise(function(_,reject){timer=root.setTimeout(function(){controller.abort();reject(error());},10000);});
    var work=fetcher(endpoint,Object.assign({cache:'no-store',credentials:'same-origin',signal:controller.signal},options)).then(function(response){
      if(local&&response.status===404)return response;
      return response.text().then(function(text){if(text.length>4194304)throw error();var data;try{data=JSON.parse(text);}catch(_){throw error();}return {ok:response.ok,status:response.status,json:function(){return Promise.resolve(data);}};});
    });
    return Promise.race([work,timeout]).finally(function(){root.clearTimeout(timer);});
  }
  function refresh(){
    if(request)return request;
    var generation=epoch,pending=timedFetch({method:'GET'}).then(function(response){
      if(local&&response.status===404)return {status:'local',revision:0,removed:[]};
      if(!response.ok)throw error();return response.json().then(validate);
    }).then(function(next){if(generation!==epoch)throw error('Availability changed. Please try again.');if(next.status==='ready')floor=Math.max(floor,next.revision);emit(next);return next;}).catch(function(e){if(generation===epoch)emit({status:'error',revision:state.revision,removed:state.removed});throw e;}).finally(function(){if(request===pending)request=null;});
    request=pending;return pending;
  }
  function blocked(item){
    if(state.status!=='ready'&&state.status!=='local')return true;
    var links=typeof item==='string'?[item]:[item&&item.link].concat(item&&item._aliases||[]),keys=[];
    links.forEach(function(link){var info=inspect(link);if(info&&info.valid&&!info.ambiguous)keys=keys.concat(info.keys);});
    if(!keys.length)return true;
    return state.removed.some(function(row){return row.keys.some(function(k){return keys.indexOf(k)!==-1;});});
  }
  function filter(jobs){return jobs.filter(function(job){return !blocked(job);});}
  function mutate(action,link,options){
    options=options||{};var current=options.current||function(){return true;},auth=root.SUAuth;
    if(!['report','restore'].includes(action)||!validLink(link)||!current()||!auth||!auth.qaAdmin||!auth.qaAdmin())return Promise.reject(error('Sign in to the owner account to report this job.'));
    if(local)return Promise.reject(error('Global reporting is unavailable on this local static preview.'));
    if(typeof options.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.requestId))return Promise.reject(error('Could not prepare this report. Please reopen it.'));
    var body={action:action,link:link,requestId:options.requestId};if(options.expectedRevision!==undefined)body.expectedRevision=options.expectedRevision;
    return auth.getToken(true).then(function(token){if(!current()||!auth.qaAdmin())throw error('Account changed. Reopen this job to try again.');return timedFetch({method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(body)});}).then(function(response){return response.json().catch(function(){throw error('Could not confirm the report. Retry to check the same request.');}).then(function(data){
      if(!response.ok){var message=response.status===401||response.status===403?'This account cannot change the public board.':response.status===409?'The board changed. Refresh before trying again.':'Could not confirm this change. Please retry.';throw error(message);}
      if(!data||data[action==='report'?'reported':'restored']!==true||data.requestId!==options.requestId||!validLink(data.link)||!root.SUJobIdentity.equivalent(data.link,link)||!Number.isSafeInteger(data.revision)||data.revision<1||data.scope!==(root.location&&/--stillunemployed\.netlify\.app$/.test(root.location.hostname)?'preview':'production'))throw error('Could not confirm this change. Retry to check the same request.');
      floor=Math.max(floor,data.revision);epoch++;request=null;
      return refresh().catch(function(){return null;}).then(function(){return data;});
    });});
  }
  function navigate(link,options){
    options=options||{};var current=options.current||function(){return true;};
    if(!validLink(link)||!current())return Promise.reject(error('This listing cannot be opened.'));
    var popup=root.open('about:blank','_blank');
    if(!popup)return Promise.reject(error('Allow a new tab, then try opening this listing again.'));
    try{popup.opener=null;popup.document.title='Checking availability';popup.document.body.textContent='Checking this listing…';}catch(_){}
    return refresh().then(function(){if(!current())throw error('This action was canceled.');if(blocked(link))throw error('This job is no longer listed on the board.');if(popup.closed)throw error('The new tab was closed. Please try again.');popup.location.replace(link);return true;}).catch(function(e){try{popup.close();}catch(_){}throw e;});
  }
  function watch(){
    var timer=null,stopped=false;
    function check(){if(!root.document.hidden)refresh().catch(function(){});}
    function resume(){if(stopped)return;if(timer===null)timer=root.setInterval(check,30000);check();}
    function pause(){if(timer!==null)root.clearInterval(timer);timer=null;}
    root.addEventListener('focus',check);root.addEventListener('pageshow',resume);root.addEventListener('pagehide',pause);root.document.addEventListener('visibilitychange',check);resume();
    return function(){stopped=true;pause();root.removeEventListener('focus',check);root.removeEventListener('pageshow',resume);root.removeEventListener('pagehide',pause);root.document.removeEventListener('visibilitychange',check);};
  }
  return {refresh:refresh,filter:filter,blocked:blocked,mutate:mutate,navigate:navigate,watch:watch,status:function(){return state;},subscribe:function(fn){listeners.push(fn);return function(){listeners=listeners.filter(function(f){return f!==fn;});};}};
});
