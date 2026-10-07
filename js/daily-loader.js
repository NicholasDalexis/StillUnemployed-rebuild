/* Server time publishes approved collections; future picks stay in the function bundle. */
(function(){
  'use strict';
  var timer;
  function render(){window.dispatchEvent(new Event('su:daily-updated'));if(window.SUApp&&window.SUApp._initialized)window.SUApp.render();}
  function load(){
    fetch('/api/daily-collections',{cache:'no-store'}).then(function(r){if(!r.ok)throw Error('unavailable');return r.json();}).then(function(data){
      if(data.schemaVersion!==1||!Array.isArray(data.selections)||data.selections.some(function(s){return s.state!=='published'||s.kind!=='jobs'||!Array.isArray(s.jobs)||s.jobs.length!==4;}))throw Error('invalid');
      window.SUDailySelections=data.selections;window.SUDailyServerNow=new Date(data.serverTime);window.SUDailyLoading=false;window.SUDailyLoadError=false;render();
      clearTimeout(timer);
      var delay=Date.parse(data.nextAt)-Date.parse(data.serverTime);
      if(Number.isFinite(delay)&&delay>0)timer=setTimeout(load,Math.min(delay+250,86400000));
    }).catch(function(){window.SUDailyLoading=false;window.SUDailyLoadError=true;render();});
  }
  window.SUDailyLoading=true;
  window.addEventListener('su:daily-retry',load);
  load();
})();
