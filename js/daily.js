/* Daily selection order is editorial. Current facts and Apply use the board. */
(function(){
  'use strict';
  if(!/^\/jobs\/daily(?:\/|$)/.test(location.pathname)&&location.pathname!=='/daily-jobs.html')return;
  var esc=function(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var all=[],expanded={},seen={},selected=null,invalid=false,initial;
  function sync(){
    all=window.SUDailySelections||[];selected=null;invalid=false;
    var match=location.pathname.match(/^\/jobs\/daily\/([^/]+)\/?$/);
    if(location.pathname!=='/daily-jobs.html'&&!/^\/jobs\/daily\/?$/.test(location.pathname)){selected=match&&all.find(function(s){return s.date===match[1];});invalid=!selected;}
    initial=selected||all[0];
    if(initial&&expanded[initial.date]===undefined)expanded[initial.date]=true;
    if(window.SUDaily)window.SUDaily.context=initial?{selectionDate:initial.date,selectionKind:'jobs'}:{};
  }
  sync();window.addEventListener('su:daily-updated',sync);
  function label(date){return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'long',month:'long',day:'numeric'}).format(new Date(date+'T16:00:00Z'));}
  function entries(){return invalid?[]:selected?[selected]:all.slice(0,3);}
  function current(app,pick){return (app.jobs||[]).find(function(j){return window.SUJobIdentity.equivalent(j.link,pick.link);});}
  function archiveJobs(app){return entries().flatMap(function(s){return s.jobs.filter(function(p){return !current(app,p);}).map(function(p){return Object.assign({},p.snapshot,{savedUnavailable:true,dailyUnavailable:true});});});}
  function analytics(name,s,rank){var a=window.SUAnalytics;if(!a||a.excluded()||!a.choices().analytics||window.SUAuth&&window.SUAuth.measurementReady&&!window.SUAuth.measurementReady())return false;a.emit(name,{selectionDate:s.date,selectionKind:s.kind,selectionRank:rank});return true;}
  function canApply(app,link){return !app._loading&&!app._loadError&&!app._moderationError&&(app.jobs||[]).some(function(j){return window.SUJobIdentity.equivalent(j.link,link);});}
  function inspect(app,s,p){
    var job=current(app,p),unknown=app._loading||app._loadError||app._moderationError;
    return {job:job||p.snapshot,ready:!unknown&&!!job,status:unknown?(app._loading?'Checking current availability':'Availability could not be checked'):job?'':'job no longer available on this board'};
  }
  var arrow='<svg width="28" height="15" viewBox="0 0 28 14" fill="none" aria-hidden="true"><path d="M1 7 C8 2.5 15 2.5 24 6.6 M18.5 2.6 L25.5 6.9 L19 11.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function catalog(app){
    var jobs=[];
    entries().forEach(function(s){s.jobs.forEach(function(p){var j=current(app,p)||Object.assign({},p.snapshot,{savedUnavailable:true,dailyUnavailable:true});if(!jobs.some(function(x){return window.SUJobIdentity.equivalent(x.link,j.link);}))jobs.push(j);});});
    return jobs;
  }
  function heading(){
    var today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(window.SUDailyServerNow||new Date());
    var title=invalid?'Daily Jobs':initial&&initial.date===today?'Top 4 Jobs for Today':'Top 4 Jobs';
    return '<div class="su-board-heading"><h1>'+title.replace('Jobs','<span class="su-headline-mark">Jobs</span>')+'</h1>'+(initial&&!invalid?'<time class="daily-heading-date" datetime="'+initial.date+'">'+esc(label(initial.date))+'</time>':'')+'</div>';
  }
  function content(app,shown,renderCard){
    var out='<div class="daily-content">';
    if(invalid&&window.SUDailyLoading)out+='<p class="daily-empty" role="status">Checking this collection…</p>';
    else if(invalid&&window.SUDailyLoadError)out+='<p class="daily-empty" role="status">Could not check this collection. <button type="button" data-daily-retry>Try again</button></p>';
    else if(invalid)out+='<section class="daily-empty"><h2>This date is not in the notebook yet</h2><p>Choose a published collection or browse the full board.</p><a href="/jobs/daily">Latest daily jobs '+arrow+'</a></section>';
    if(!initial&&!invalid)out+='<p class="daily-empty">The first daily collection is on its way. Browse the full board below.</p>';
    if(app._loadError)out+='<div class="daily-error" role="status">Could not check current availability. Historical details remain below.<button type="button" data-act="retryJobs">Try again</button></div>';
    entries().forEach(function(s,index){
      var open=!!expanded[s.date],names=s.jobs.map(function(p){return current(app,p)?.co||p.snapshot.co;}).join(' · ');
      var filtered=s.jobs.map(function(p,i){return {pick:p,rank:i+1,job:shown.find(function(j){return window.SUJobIdentity.equivalent(j.link,p.link);})};}).filter(function(p){return !!p.job;});
      if(app.state.fr!=='Any')filtered.sort(function(a,b){return shown.indexOf(a.job)-shown.indexOf(b.job);});
      out+='<section class="daily-collection" aria-labelledby="date-'+s.date+'"><button type="button" class="daily-date" id="date-'+s.date+'" data-daily-date="'+s.date+'" aria-expanded="'+open+'" aria-controls="cards-'+s.date+'"><span>'+(index===0?'<span class="su-sr-only">'+esc(label(s.date))+'</span>':'<time class="daily-date-label" datetime="'+s.date+'">'+esc(label(s.date))+'</time>')+'<span class="daily-companies">'+esc(names)+'</span></span><span class="daily-fold" aria-hidden="true">'+(open?'−':'+')+'</span></button><div id="cards-'+s.date+'" class="job-grid daily-grid"'+(open?'':' hidden')+'>'+filtered.map(function(p){return '<div class="daily-card" data-date="'+s.date+'" data-rank="'+p.rank+'">'+renderCard(p.job,p.rank-1)+'</div>';}).join('')+'</div>'+(open&&!filtered.length?'<p class="daily-empty" role="status">No daily picks match these filters. <button type="button" data-act="clearAll">Reset all filters</button> or <a href="/jobs.html">browse all jobs</a>.</p>':'')+'</section>';
      if(open&&filtered.length&&!seen[s.date]&&!app._loading&&!app._loadError){seen[s.date]=analytics('daily_selection_view',s);}
    });
    out+='<div class="daily-more"><a class="daily-board-link" href="/jobs.html">Browse all jobs '+arrow+'</a>'+(selected?'<a href="/jobs/daily">More daily collections</a>':'')+'</div></div>';
    return out;
  }
  document.addEventListener('click',function(e){
    if(e.target.closest('[data-daily-retry]'))window.dispatchEvent(new Event('su:daily-retry'));
    var date=e.target.closest('[data-daily-date]'),card=e.target.closest('.daily-card');
    if(date){expanded[date.dataset.dailyDate]=!expanded[date.dataset.dailyDate];window.SUApp.render();}
    if(card){window.SUDaily.context={selectionDate:card.dataset.date,selectionKind:'jobs',selectionRank:Number(card.dataset.rank)};}
    if(e.target.closest('.daily-board-link')&&initial)analytics('daily_board_click',initial);
  },true);
  window.addEventListener('su:consent-changed',function(){seen={};if(window.SUApp)window.SUApp.render();});
  window.SUDaily={heading:heading,content:content,catalog:catalog,archiveJobs:archiveJobs,context:initial?{selectionDate:initial.date,selectionKind:'jobs'}:{},label:label,canApply:canApply};
})();
