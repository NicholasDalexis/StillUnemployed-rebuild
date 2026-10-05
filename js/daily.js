/* Daily selection order is editorial. Current facts and Apply use the board. */
(function(){
  'use strict';
  if(!/^\/jobs\/daily(?:\/|$)/.test(location.pathname)&&location.pathname!=='/daily-jobs.html')return;
  var esc=function(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var all=window.SUDailySelections||[],expanded={},seen={},selected=null,invalid=false;
  var match=location.pathname.match(/^\/jobs\/daily\/([^/]+)\/?$/);
  if(location.pathname!=='/daily-jobs.html'&&!/^\/jobs\/daily\/?$/.test(location.pathname)){selected=match&&all.find(function(s){return s.date===match[1];});invalid=!selected;}
  var initial=selected||all[0];
  if(initial)expanded[initial.date]=true;
  function label(date){return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(date+'T16:00:00Z'));}
  function entries(){return invalid?[]:selected?[selected]:all.slice(0,3);}
  function current(app,pick){return (app.jobs||[]).find(function(j){return window.SUJobIdentity.equivalent(j.link,pick.link);});}
  function archiveJobs(app){return entries().flatMap(function(s){return s.jobs.filter(function(p){return !current(app,p);}).map(function(p){return Object.assign({},p.snapshot,{savedUnavailable:true,dailyUnavailable:true});});});}
  function analytics(name,s,rank){var a=window.SUAnalytics;if(!a||a.excluded()||!a.choices().analytics||window.SUAuth&&window.SUAuth.measurementReady&&!window.SUAuth.measurementReady())return false;a.emit(name,{selectionDate:s.date,selectionKind:s.kind,selectionRank:rank});return true;}
  function canApply(app,link){return !app._loading&&!app._loadError&&!app._moderationError&&(app.jobs||[]).some(function(j){return window.SUJobIdentity.equivalent(j.link,link);});}
  function inspect(app,s,p){
    var job=current(app,p),unknown=app._loading||app._loadError||app._moderationError;
    return {job:job||p.snapshot,ready:!unknown&&!!job,status:unknown?(app._loading?'Checking current availability':'Availability could not be checked'):job?'':'job no longer available on this board'};
  }
  var bookmark='<svg width="18" height="22" viewBox="0 0 24 28" aria-hidden="true" fill="none"><path d="M4 2h16v24l-8-5-8 5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  var arrow='<svg width="28" height="15" viewBox="0 0 28 14" fill="none" aria-hidden="true"><path d="M1 7 C8 2.5 15 2.5 24 6.6 M18.5 2.6 L25.5 6.9 L19 11.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function card(app,s,p,rank){
    var state=inspect(app,s,p),j=state.job,pay=window.SUPayDisplay?window.SUPayDisplay.compact(j.pay||''):(j.pay||''),saved=typeof app.isSaved==='function'?app.isSaved(j.link):!!app.state.saved[j.link];
    return '<article class="daily-card" data-date="'+s.date+'" data-rank="'+rank+'"><span class="daily-tape" aria-hidden="true"></span>'+ (state.ready?'<button type="button" data-act="save" data-link="'+esc(j.link)+'" aria-label="'+(saved?'Remove saved job':'Save job')+'" aria-pressed="'+saved+'" class="daily-save">'+bookmark+'</button>':'')+
      '<h3>'+esc(j.co)+'</h3><p class="daily-role">'+esc(j.role)+'</p><strong class="daily-pay">'+esc(pay)+'</strong><p class="daily-meta">'+esc([j.loc,j.style,j.exp].filter(Boolean).join(' · '))+'</p>'+
      (state.status?'<p class="daily-availability" role="status">'+esc(state.status)+'</p>':'')+
      '<div class="daily-card-bottom"><button type="button" class="daily-open" data-act="apply" data-link="'+esc(j.link)+'" data-co="'+esc(j.co)+'">'+(state.ready?'See the TLDR':'View saved details')+' '+arrow+'</button></div></article>';
  }
  function render(app){
    app.state.look='original';var board=document.getElementById('board'),focus=document.activeElement,dateFocus=focus&&focus.getAttribute('data-daily-date'),actionFocus=focus&&focus.getAttribute('data-act'),linkFocus=focus&&focus.getAttribute('data-link');
    var out='<div class="daily-page"><nav class="daily-nav" aria-label="Board navigation"><a href="/jobs.html">All jobs '+arrow+'</a><a href="/internships.html">Internships</a><a href="/tracker.html">Tracker</a></nav><header class="daily-intro"><a class="daily-brand" href="/">★ StillUnemployed.com</a><p class="daily-kicker">a short list, for your next move</p><h1>Jobs worth the <span>screenshot</span></h1><p class="daily-subtitle">Four jobs. Salary up front. No account needed.</p></header>';
    if(invalid)out+='<section class="daily-empty"><h2>This date is not in the notebook yet</h2><p>Choose a published collection or browse the full board.</p><a href="/jobs/daily">Latest daily jobs '+arrow+'</a></section>';
    if(!initial&&!invalid)out+='<p class="daily-empty">The first daily collection is on its way. Browse the full board below.</p>';
    if(app._loadError)out+='<div class="daily-error" role="status">Could not check current availability. Historical details remain below.<button type="button" data-act="retryJobs">Try again</button></div>';
    entries().forEach(function(s,index){
      var open=!!expanded[s.date],names=s.jobs.map(function(p){return current(app,p)?.co||p.snapshot.co;}).join(' · ');
      out+='<section class="daily-collection" aria-labelledby="date-'+s.date+'"><button class="daily-date" id="date-'+s.date+'" data-daily-date="'+s.date+'" aria-expanded="'+open+'" aria-controls="cards-'+s.date+'"><span><span class="daily-date-label">'+esc(label(s.date))+'</span><span class="daily-companies">'+esc(names)+'</span></span><span class="daily-fold" aria-hidden="true">'+(open?'−':'+')+'</span></button><div id="cards-'+s.date+'" class="daily-grid"'+(open?'':' hidden')+'>'+s.jobs.map(function(p,i){return card(app,s,p,i+1);}).join('')+'</div></section>';
      if(open&&!seen[s.date]&&!app._loading&&!app._loadError){seen[s.date]=analytics('daily_selection_view',s);}
    });
    out+='<div class="daily-more"><p>There’s more in the notebook.</p><a class="daily-board-link" href="/jobs.html">Browse all jobs '+arrow+'</a>'+(selected?'<a href="/jobs/daily">More daily collections</a>':'')+'</div></div>';
    board.innerHTML=out;board.className='board daily-board';
    if(dateFocus){var next=board.querySelector('[data-daily-date="'+dateFocus+'"]');if(next)next.focus({preventScroll:true});}else if(actionFocus&&linkFocus){var button=Array.from(board.querySelectorAll('[data-act][data-link]')).find(function(el){return el.getAttribute('data-act')===actionFocus&&el.getAttribute('data-link')===linkFocus;});if(button)button.focus({preventScroll:true});}
    app.renderOverlays();
  }
  document.addEventListener('click',function(e){
    var date=e.target.closest('[data-daily-date]'),card=e.target.closest('.daily-card');
    if(date){expanded[date.dataset.dailyDate]=!expanded[date.dataset.dailyDate];window.SUApp.render();}
    if(card){window.SUDaily.context={selectionDate:card.dataset.date,selectionKind:'jobs',selectionRank:Number(card.dataset.rank)};}
    if(e.target.closest('.daily-board-link')&&initial)analytics('daily_board_click',initial);
  },true);
  window.addEventListener('su:consent-changed',function(){seen={};if(window.SUApp)window.SUApp.render();});
  window.SUDaily={render:render,archiveJobs:archiveJobs,context:initial?{selectionDate:initial.date,selectionKind:'jobs'}:{},label:label,canApply:canApply};
})();
