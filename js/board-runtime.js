/* Page-local request coordination and tab-local view restoration. No job cache. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.SUBoardRuntime=factory(root);
})(typeof window!=='undefined'?window:this,function(root){
  'use strict';
  var pending={},TTL=30*60*1000, keys=['q','cat','ws','pr','st','fr','savedOnly'];
  function emit(name){if(root.SUAnalytics&&root.SUAnalytics.emit)root.SUAnalytics.emit(name,{});}
  function request(key,load){
    if(pending[key])return pending[key];
    var controller=typeof root.AbortController==='function'?new root.AbortController():null,timer;
    var timeout=new Promise(function(_,reject){timer=root.setTimeout(function(){if(controller)controller.abort();reject(Error('Request timed out'));},20000);});
    var work=Promise.resolve().then(function(){return load(controller?controller.signal:undefined);});
    pending[key]=Promise.race([work,timeout]).finally(function(){root.clearTimeout(timer);delete pending[key];});
    return pending[key];
  }
  function owner(){try{return root.localStorage.getItem('su_sync_owner')||'guest';}catch(e){return null;}}
  // Device-local reminder cadence, isolated to the current account or guest.
  // Only called after a new tracker record has been successfully saved.
  function recordApplication(){
    try {
      var who=owner();if(who===null)return false;
      var key='su_tracker_hint_v1', value=JSON.parse(root.localStorage.getItem(key)||'null');
      var count=value&&value.owner===who&&Number.isSafeInteger(value.count)&&value.count>=0?value.count:0;
      // Respect the previous one-time reminder when upgrading an existing browser.
      if(!value&&root.localStorage.getItem('su_tracker_nudged'))count=1;
      count++;
      root.localStorage.setItem(key,JSON.stringify({owner:who,count:count}));
      return count===1 || count%10===0;
    }catch(e){return false;}
  }
  var observedOwner=owner();
  function checkOwner(){var next=owner();if(next===observedOwner)return false;observedOwner=next;clear();return true;}
  function read(section){
    try{var value=JSON.parse(root.sessionStorage.getItem('su_view_'+section)||'null');
      if(observedOwner!==owner()||!value||value.v!==1||!Number.isFinite(value.at)||value.owner!==owner()||Date.now()-value.at<0||Date.now()-value.at>TTL)return null;
      var out={};keys.forEach(function(k){var v=value.state[k];if(k==='savedOnly'){if(typeof v==='boolean')out[k]=v;}else if(typeof v==='string'&&v.length<=200)out[k]=v;});
      return {state:out,y:Number.isFinite(value.y)?Math.max(0,Math.min(value.y,100000)):0};
    }catch(e){return null;}
  }
  function save(section,state){
    try{var o=owner();if(o===null||o!==observedOwner)return;var out={};keys.forEach(function(k){out[k]=state[k];});root.sessionStorage.setItem('su_view_'+section,JSON.stringify({v:1,owner:o,at:Date.now(),state:out,y:root.scrollY||0}));}catch(e){}
  }
  function clear(){try{root.sessionStorage.removeItem('su_view_jobs');root.sessionStorage.removeItem('su_view_internships');}catch(e){}}
  return {owner:owner,recordApplication:recordApplication,request:request,read:read,save:save,clear:clear,checkOwner:checkOwner,emit:emit};
});
