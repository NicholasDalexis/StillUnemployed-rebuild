/* Same published collection as the daily destination, never a second feed. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else {root.SUDailyEntry=factory();document.addEventListener('click',function(e){if(!e.target.closest('[data-daily-entry]')||!root.SUAnalytics)return;var selection=root.SUDailyEntry.latest(root.SUDailySelections||[]);if(!selection)return;root.SUAnalytics.emit('daily_entry_click',{selectionDate:selection.date,selectionKind:'jobs'});root.SUAnalytics.flush();},true);}})(typeof window==='undefined'?this:window,function(){
  'use strict';
  function today(now){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now||(typeof window!=='undefined'&&window.SUDailyServerNow)||new Date());}
  function latest(all,now){var day=today(now);return all.filter(function(s){return s.state==='published'&&s.date<=day;}).sort(function(a,b){return b.date.localeCompare(a.date);})[0];}
  function html(all,now){var s=latest(all,now);if(!s)return '';var date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric'}).format(new Date(s.date+'T16:00:00Z'));
    return '<a class="su-daily-entry" data-daily-entry href="/jobs/daily"><span>'+(s.date===today(now)?"Today's top 4 jobs":'Latest picks')+'</span><small>'+date+'</small><span aria-hidden="true">→</span></a>';
  }
  return {today:today,latest:latest,html:html};
});
