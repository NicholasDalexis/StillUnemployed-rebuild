/* Complete public catalogs only. No account, saved filters or analytics input. */
(function(){
  'use strict';
  var panel=document.querySelector('[data-public-counts]');if(!panel)return;
  var retry=panel.querySelector('button'),running=false;
  function display(lane,value){
    var node=panel.querySelector('[data-count="'+lane+'"]');
    node.textContent=value.status==='ready'?value.count.toLocaleString('en-US'):'Unavailable';
  }
  function valid(value){return value&&((value.status==='ready'&&Number.isSafeInteger(value.count)&&value.count>=0&&value.count<=10000)||(value.status==='unavailable'&&value.count===null));}
  function load(){
    if(running)return;running=true;retry.disabled=true;retry.hidden=true;
    ['jobs','internships'].forEach(function(lane){panel.querySelector('[data-count="'+lane+'"]').textContent='Loading…';});
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},9000);
    fetch('/api/public-counts',{cache:'no-store',credentials:'omit',signal:controller.signal}).then(function(response){
      if(response.status!==200&&response.status!==503)throw Error('Unavailable');return response.json();
    }).then(function(data){
      if(data.schemaVersion!==1||!valid(data.jobs)||!valid(data.internships))throw Error('Unavailable');
      display('jobs',data.jobs);display('internships',data.internships);
      retry.hidden=data.jobs.status==='ready'&&data.internships.status==='ready';
    }).catch(function(){display('jobs',{status:'unavailable'});display('internships',{status:'unavailable'});retry.hidden=false;})
      .finally(function(){clearTimeout(timer);running=false;retry.disabled=false;});
  }
  retry.addEventListener('click',load);load();
})();
