const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const Links=require('../../js/daily-links.js');const Identity=require('../../js/job-identity.js');
const Core=require('../../netlify/functions/lib/analytics-core.cjs');
const manifest=JSON.parse(fs.readFileSync('data/daily-selections.json'));
function fixture(path='/jobs/daily',selections=[manifest.selections[0]]){
  const board={innerHTML:'',className:'',querySelector:()=>null};let clicks;
  const app={jobs:[],state:{look:'original',saved:{},fr:'Any'},renderOverlays(){}};
  const window={SUDailySelections:selections,SUJobIdentity:Identity,SUApp:app,addEventListener(){}};
  const document={activeElement:null,getElementById:()=>board,addEventListener(n,fn){clicks=fn;}};
  vm.runInNewContext(fs.readFileSync('js/daily.js','utf8'),{window,document,location:{pathname:path},Intl,Date});
  app.render=()=>{board.innerHTML=window.SUDaily.heading()+window.SUDaily.content(app,window.SUDaily.catalog(app),j=>'<article data-act="apply" data-link="'+j.link+'">'+j.co+' '+j.role+'</article><button data-act="toggleSave">Save</button>');};
  return {app,board,daily:window.SUDaily,clicks};
}
test('daily manifest exposes four ordered published jobs and hides future/drafts',async()=>{
  const {published}=await import('../gen-daily.mjs');const copy={...manifest,selections:[structuredClone(manifest.selections[0])]};
  copy.selections.push({...copy.selections[0],date:'2026-10-06'});
  copy.selections.push({...copy.selections[0],date:'2026-10-04',state:'draft'});
  assert.deepEqual(published(copy,'2026-10-05').map(s=>s.date),['2026-10-05']);
  assert.deepEqual(published(copy,'2026-10-06').map(s=>s.date),['2026-10-06','2026-10-05']);
  for(const mutate of [s=>s.jobs.pop(),s=>s.jobs[1].id=s.jobs[0].id,s=>s.jobs[0].link='https://user:password@unsafe.example/job',s=>s.date='2026-02-30']){
    const bad=structuredClone(manifest);mutate(bad.selections[0]);assert.throws(()=>published(bad,'2026-12-31'));
  }
  assert.throws(()=>published({schemaVersion:1,selections:[manifest.selections[0],manifest.selections[0]]},'2026-10-05'));
});
test('dated route preserves original selection; malformed and missing dates never show today',()=>{
  const old={...manifest.selections[0],date:'2026-09-30'};const all=[manifest.selections[0],old];
  const f=fixture('/jobs/daily/2026-09-30',all);f.app.render();
  assert.match(f.board.innerHTML,/Wednesday, September 30/);assert.doesNotMatch(f.board.innerHTML,/Monday, October 5/);
  for(const path of ['/jobs/daily/not-a-date','/jobs/daily/2026-10-06','/jobs/daily/2026-10-05/extra']){
    const x=fixture(path,all);x.app.render();assert.match(x.board.innerHTML,/not in the notebook yet/);assert.doesNotMatch(x.board.innerHTML,/<article/);
  }
});
test('current facts override historical details and missing/error jobs cannot Apply',()=>{
  const f=fixture(),pick=manifest.selections[0].jobs[0];
  f.app.jobs=[{...pick.snapshot,role:'Current canonical role',pay:'$141K',link:pick.link+(pick.link.includes('?')?'&':'?')+'utm_source=fixture'}];
  f.app.render();assert.match(f.board.innerHTML,/Current canonical role/);assert.equal(f.daily.canApply(f.app,pick.link),true);
  assert.equal(f.daily.archiveJobs(f.app).length,3);
  for(const flag of ['_loading','_loadError','_moderationError']){f.app[flag]=true;assert.equal(f.daily.canApply(f.app,pick.link),false);f.app[flag]=false;}
  f.app.jobs=[];assert.equal(f.daily.canApply(f.app,pick.link),false);assert.equal(f.daily.archiveJobs(f.app)[0].dailyUnavailable,true);
  f.app._loadError=true;f.app.render();assert.match(f.board.innerHTML,/data-act="retryJobs"/);assert.doesNotMatch(f.board.innerHTML,/data-act="retryFeed"/);
  const source=fs.readFileSync('js/app.js','utf8');assert.match(source,/uniqueJobs\(current\.concat\(window.SUDaily.archiveJobs\(this\),all\)\)/);
  assert.match(source,/DAILY&&!window.SUDaily.canApply\(self,dl\)/);assert.match(source,/archivedLink&&!DAILY/);
});
test('latest three dates collapse with names, dates and retained keyboard focus',()=>{
  const selections=['2026-10-05','2026-10-02','2026-10-01','2026-09-30'].map(date=>({...manifest.selections[0],date}));
  const f=fixture('/jobs/daily',selections);f.app.render();
  assert.equal((f.board.innerHTML.match(/class="daily-collection"/g)||[]).length,3);
  assert.equal((f.board.innerHTML.match(/class="job-grid daily-grid" hidden/g)||[]).length,2);
  assert.match(f.board.innerHTML,/Figma · SharkNinja · Fanatics Collectibles · Eames Institute/);
  f.clicks({target:{closest(selector){return selector==='[data-daily-date]'?{dataset:{dailyDate:'2026-10-02'}}:null;}}});
  assert.match(f.board.innerHTML,/id="date-2026-10-02"[^>]*aria-expanded="true"/);
});
test('shared builder preserves bounded provenance without personal or arbitrary URL values',()=>{
  const input={source:'instagram',medium:'organic_social',campaign:'su_daily_jobs_20261005',post:'20261005_ig_top4',linkSlot:'comment_dm'};
  const url=new URL(Links.build('2026-10-05',input));assert.equal(url.pathname,'/jobs/daily/2026-10-05');assert.deepEqual(Links.context(url.searchParams),input);
  assert.equal(new URL(Links.build(null,{...input,linkSlot:'bio'})).pathname,'/jobs/daily');
  for(const value of ['nicholas@example.com','https://arbitrary.example','a'.repeat(300)])assert.deepEqual(Links.context(new URLSearchParams({utm_source:value,utm_id:value,utm_campaign:value,utm_content:value})),{});
  assert.throws(()=>Links.build('2026-02-30',input));
  assert.equal(Links.context(new URLSearchParams({utm_content:'job_10_abcdef0123456789'})).linkSlot,'job_10_abcdef0123456789');
});
test('client/server daily events retain bounded selection and suppress small cohorts',()=>{
  const clean=Core.cleanEvent({id:'fixture-event-123456',name:'daily_selection_view',page:'daily',source:'instagram',medium:'organic_social',campaign:'profile_jobs',linkSlot:'bio',selectionDate:'2026-10-05',selectionKind:'jobs',selectionRank:4,email:'private@example.com'},{});
  assert.equal(clean.selectionDate,'2026-10-05');assert.equal(clean.selectionRank,4);assert.equal(clean.medium,'organic_social');assert.equal(clean.email,undefined);
  const invalid=Core.cleanEvent({...clean,selectionDate:'2026-02-30'},{});assert.equal(invalid.selectionDate,undefined);
  const now=Date.now(),rows=[];
  for(let i=0;i<5;i++)for(const name of ['page_view','daily_selection_view','tldr_open','apply_click'])rows.push({...clean,name,actor:'fixture'+i,session:'session'+i,at:now,id:'fixture-event-'+i});
  const report=Core.reduceRows(rows,30,now);
  assert.equal(report.dailyCollections.length,1);assert.equal(report.dailyCollections[0].views,5);assert.equal(report.dailyCollections[0].tldr,5);assert.equal(report.dailyCollections[0].apply,5);
  assert.equal(report.marketingLinks.length,1);assert.equal(report.marketingLinks[0].visitors,5);assert.equal(report.marketingLinks[0].apply,5);
  assert.deepEqual(Core.reduceRows(rows.slice(0,16),30,now).dailyCollections,[]);
});
test('board entry labels only current Eastern published picks as today',()=>{
  const Entry=require('../../js/daily-entry.js'),now=new Date('2026-10-05T20:00:00Z');
  assert.match(Entry.html([manifest.selections[0]],now),/Today's top 4 jobs/);
  assert.match(Entry.html([manifest.selections[0]],new Date('2026-10-06T20:00:00Z')),/Latest picks/);
  assert.equal(Entry.html([{...manifest.selections[0],date:'2026-10-06'}],now),'');
  assert.equal(Entry.html([{...manifest.selections[0],state:'scheduled'}],now),'');
  assert.match(Entry.html([manifest.selections[0]],now),/href="\/jobs\/daily"/);
  assert.equal(Entry.today(new Date('2026-10-06T02:00:00Z')),'2026-10-05');
});

test('daily card controls use the shared application dispatcher',()=>{
  const f=fixture();f.app.jobs=manifest.selections[0].jobs.map(p=>p.snapshot);f.app.render();
  const source=fs.readFileSync('js/app.js','utf8');
  for(const action of new Set([...f.board.innerHTML.matchAll(/data-act="([^"]+)"/g)].map(m=>m[1])))assert.ok(source.includes("case '"+action+"':"),action+' has no dispatcher');
  assert.match(f.board.innerHTML,/data-act="toggleSave"/);
});

test('daily section uses the shared board header, search and filter renderer',()=>{
  const s=fs.readFileSync('js/app.js','utf8');
  assert.doesNotMatch(s,/if\(DAILY\)\{window.SUDaily.render/);
  assert.match(s,/DAILY \? window.SUDaily.catalog\(this\)/);
  assert.match(s,/DAILY \? window.SUDaily.heading\(\)/);
  assert.match(s,/window.SUDaily.content\(this,shown,renderCard\)/);
  const f=fixture();f.app.render();
  assert.match(f.board.innerHTML,/datetime="2026-10-05"/);
  assert.match(f.board.innerHTML,/>Monday, October 5<\/time>/);
  assert.doesNotMatch(f.board.innerHTML,/October 5, 2026|a short list|daily-nav/);
});
test('daily filters exclude unmatched picks without introducing unselected jobs',()=>{
  const f=fixture();f.app.jobs=manifest.selections[0].jobs.map(p=>p.snapshot);
  f.app.jobs.push({...f.app.jobs[0],co:'Unselected company',link:'https://example.com/unselected'});
  const catalog=f.daily.catalog(f.app);assert.equal(catalog.length,4);
  const one=catalog.filter(j=>j.co==='SharkNinja');
  const card=j=>'<article>'+j.co+'</article>';
  const html=f.daily.content(f.app,one,card);
  assert.equal((html.match(/<article>/g)||[]).length,1);assert.match(html,/<article>SharkNinja/);
  assert.doesNotMatch(html,/<article>Figma|Unselected company/);
  const empty=f.daily.content(f.app,[],card);assert.match(empty,/No daily picks match/);assert.match(empty,/data-act="clearAll"/);
});
