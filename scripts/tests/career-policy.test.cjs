const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../../js/career-fields.js'),D=require('../../js/job-deadlines.js'),X=require('../../js/board-experience.js'),Source=require('../../netlify/functions/lib/job-source.cjs');
const base={co:'Example',role:'Public Relations Coordinator',ind:'PR & Partnerships',loc:'New York, NY',pay:'$55K–70K',link:'https://example.com/jobs/1'};
test('work concepts group adjacent jobs without replacing titles or admitting unrelated work',()=>{
 const jobs=[base,{...base,role:'Media Planner',ind:'Advertising'},{...base,role:'Social Media Coordinator',ind:'Social'},{...base,role:'Software Engineer',ind:'Software Engineering'}];
 const before=JSON.stringify(jobs);
 assert.deepEqual(jobs.filter(j=>C.searchMatches(j,'marketing')).map(j=>j.role),jobs.slice(0,3).map(j=>j.role));
 assert(C.searchMatches(jobs[0],'marketing coordinator'));assert(!C.searchMatches(jobs[0],'marketing engineer'));
 assert(!C.searchMatches(jobs[3],'pr'));assert(C.searchMatches(jobs[3],'engineering'));
 assert.equal(C.field({...base,ind:'',role:'Data Engineer'}),'Data & AI');
 assert.equal(C.field({...base,ind:'',role:'Footwear Designer'}),'Fashion');
 assert.equal(JSON.stringify(jobs),before);
});
test('career field controls include all professional families, legacy categories and unknown future work',()=>{
 for(const ind of ['Social','Brand & Marketing','Content & Copy','Growth & CRM','PR & Partnerships','Influencer'])assert(C.matches({...base,ind},'Marketing & Communications'));
 const options=C.options(C.groups.map(ind=>({...base,ind})).concat([{...base,ind:'Geospatial Planning',role:'Planner'}]));
 for(const name of ['Software & Engineering','Data & AI','Finance & Accounting','People & Recruiting','Business & Operations','Sales & Customer Success','Healthcare','Geospatial Planning'])assert(options.some(o=>o.match===name));
 assert(C.matches(base,'PR & Partnerships'),'old saved category choices stay usable');
});
test('date-only deadlines remain open through the final minute in board Eastern including DST',()=>{
 const job={deadlineISO:'2026-10-14'};
 assert.equal(D.facts(job,Date.parse('2026-10-15T03:59:59.999Z')).state,'open');
 assert.equal(D.facts(job,Date.parse('2026-10-15T04:00:00Z')).state,'expired');
 assert.match(D.facts(job).label,/Eastern \(board default\)/);
 assert.equal(D.facts({deadlineISO:'2026-11-01'},Date.parse('2026-11-02T04:59:59Z')).state,'open');
 assert.equal(D.facts({deadlineISO:'2026-11-01'},Date.parse('2026-11-02T05:00:00Z')).state,'expired');
});
test('explicit employer time or timezone overrides default, invalid dates fail Apply closed',()=>{
 const job={deadlineISO:'2026-10-14T17:00:00-07:00',deadline:'October 14 at 5 PM Pacific'};
 assert(D.accepting(job,Date.parse('2026-10-14T23:59:59Z')));assert(!D.accepting(job,Date.parse('2026-10-15T00:00:00Z')));
 assert(D.accepting({deadlineISO:'2026-10-14',deadlineTimezone:'America/Los_Angeles'},Date.parse('2026-10-15T06:59:59Z')));
 assert(!D.accepting({deadlineISO:'2026-02-30'}));assert(!D.accepting({deadlineISO:'2026-10-14',deadlineTimezone:'bad-zone'}));
 assert(D.accepting({deadline:'Rolling; not stated'}));assert(!D.accepting({applicationStatus:'paused'}));
});
test('deadline presentation hides only redundant proven EST provenance without changing cutoff or source',()=>{
 const job={deadline:'November 20, 2026, 8:00 PM EST (employer API explicit -05:00 offset)',deadlineISO:'2026-11-20T20:00:00-05:00',timingSourceUrl:'https://example.com/employer-timing',eligibility:'Employer body uses November 21; API supplies an explicit -05:00 instant.'};
 const before=structuredClone(job),instant=Date.parse(job.deadlineISO),facts=D.facts(job,instant-1);
 assert.equal(D.displayLabel(job,job.deadline),'November 20, 2026, 8:00 PM EST');
 assert.equal(D.displayLabel(job,facts.label),'November 20, 2026, 8:00 PM EST');
 assert.deepEqual(job,before);assert.deepEqual(D.facts(job,instant-1),facts);
 assert.equal(D.facts(job,instant-1).state,'open');assert.equal(D.facts(job,instant).state,'expired');
 assert.equal(D.accepting(job,instant-1),true);assert.equal(D.accepting(job,instant),false);
});
test('deadline presentation preserves contradictions, ambiguity and meaningful employer conditions',()=>{
 const source='November 20, 2026, 8:00 PM EST (employer API explicit -05:00 offset)';
 for(const job of [{deadline:source,deadlineISO:'2026-11-20T21:00:00-05:00'},{deadline:source,deadlineISO:'2026-11-20T20:00:00-04:00'},{deadline:source},{deadline:source+'; rolling review',deadlineISO:'2026-11-20T20:00:00-05:00'},{deadline:'October 30, 2026, 5 PM PST (employer wording); rolling review'},{deadline:'November 1, 2026',deadlineISO:'2026-11-01'},{deadline:'November 1, 2026, 1:30 AM ET'},{deadline:'Spring: October 16, 2026; Summer: March 19, 2027'}]){
  const label=D.facts(job,Date.parse('2026-10-01T00:00:00Z')).label;
  assert.equal(D.displayLabel(job,job.deadline),job.deadline);
  assert.equal(D.displayLabel(job,label),label);
 }
});
test('editorial ranking is stable, never annualizes hourly/OTE/estimates and never drops jobs',()=>{
 const rows=[{co:'Small',pay:'$70K'},{co:'Small',pay:'$81K'},{co:'Small',pay:'$150/hour'},{co:'Google',pay:'$60K'},{co:'Small',pay:'$140K OTE'},{co:'Small',pay:'$130K (estimated)'}];
 const ranked=X.defaultOrder(rows,false);assert.equal(ranked.length,rows.length);assert.equal(ranked[0],rows[3]);assert.equal(ranked[1],rows[1]);assert.deepEqual(ranked.slice(2),[rows[0],rows[2],rows[4],rows[5]]);
 assert.deepEqual(X.defaultOrder(rows,true),[rows[3],rows[0],rows[1],rows[2],rows[4],rows[5]]);
 const explicit=X.orderFirst([{...rows[3],added:'2026-10-13'},{...rows[0],added:'2026-10-14'}],'Recently added',new Date('2026-10-14T16:00:00Z'));assert.equal(explicit[0].co,'Small');
});
test('appended deadline/industry fields remain backward compatible in public readers and strict identity parser',async()=>{
 const Discovery=require('../../netlify/functions/lib/job-discovery.cjs'),Counts=await import('../../netlify/functions/lib/public-counts.mjs');
 const original=Discovery.EXPECTED,extra=['Application Deadline','Deadline ISO','Deadline Timezone','Timing Source','Employer Industry'];
 const row=['Example','Financial Analyst','https://example.com/jobs/1','Ohio','Hybrid','$65K–85K','1','Finance','','','Active','2026-10-14','','Analyze budgets',''];
 const csv=rows=>rows.map(r=>r.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\n');
 assert.equal(Source.rowsToJobs([original,row]).length,1,'missing posted date/new career is not a gate');
 const old=row.slice();old[14]='2020-01-01';assert.equal(Source.rowsToJobs([original,old]).length,1,'posting age is not a gate');
 const headers=original.concat(extra),extended=row.concat(['October 31, 2026','2026-10-31','','https://example.com/jobs/1','Healthcare']);
 const jobs=Source.rowsToJobs([headers,extended]);assert.equal(jobs[0].ind,'Finance');assert.equal(jobs[0].employerIndustry,'Healthcare');assert.equal(jobs[0].deadlineISO,'2026-10-31');
 assert.equal(Counts.catalogFromCSV(csv([headers,extended])).length,1);
 assert.equal((await Discovery.catalogFromCSV(csv([headers,extended]))).length,1);
 for(const status of ['Paused','On hold','Closed','Dead']){const held=extended.slice();held[10]=status;assert.equal(Source.rowsToJobs([headers,held]).length,0);}
});

const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const fixturePath=path.join(__dirname,'board-qa.test.cjs'),fixture=fs.readFileSync(fixturePath,'utf8'),mod={exports:{}};
vm.runInNewContext(fixture.slice(0,fixture.indexOf('\ntest('))+'\nmodule.exports={board,job,row,csv};',{require:createRequire(fixturePath),module:mod,__dirname,Buffer,URL,URLSearchParams,setImmediate});
const {board,job,row,csv}=mod.exports;
test('real board renderer combines semantic search, state and grouped controls with exact source titles',()=>{
 const b=board();b.init([job({role:'Public Relations Coordinator',ind:'PR & Partnerships',state:'CA',loc:'Los Angeles, CA'}),job({link:'https://example.com/ny',role:'Social Media Analyst',ind:'Social',state:'NY',loc:'New York, NY'}),job({link:'https://example.com/eng',role:'Software Engineer',ind:'Software Engineering',state:'CA',loc:'San Francisco, CA'})]);
 b.app.state.q='marketing CA';assert.deepEqual(Array.from(b.app.computeShown().shown,j=>j.role),['Public Relations Coordinator']);
 b.app.state.q='';b.app.state.cat='Marketing & Communications';assert.equal(b.app.computeShown().shown.length,2);
 b.app.state.industry='Finance';assert.equal(b.app.computeShown().shown.length,0);
});
test('real Jobs CSV loader retains optional deadline/industry, excludes paused aliases without calling them permanently closed',async()=>{
 const headers=['Company','Job Title','Link','Location','Type','Salary','Years of Experience','Category','Description','Pick','Active/Dead','Date Added','Dead Date','TL;DR','Date Posted','Application Deadline','Deadline ISO','Deadline Timezone','Timing Source','Employer Industry'];
 const live=row({'Job Title':'Finance Analyst',Category:'Finance','Application Deadline':'October 31, 2030','Deadline ISO':'2030-10-31','Employer Industry':'Healthcare'});
 const b=board({response:{ok:true,status:200,text:async()=>csv([live],headers)}});await b.boot();
 assert.equal(b.app.jobs.length,1);assert.equal(b.app.jobs[0].deadlineISO,'2030-10-31');assert.equal(b.app.jobs[0].employerIndustry,'Healthcare');
 const alias={...live,Link:live.Link+'?utm_source=old','Active/Dead':'Paused'};
 const p=board({response:{ok:true,status:200,text:async()=>csv([live,alias],headers)}});await p.boot();assert.equal(p.app.jobs.length,0);assert.equal(p.app._closedLinks.length,0);
});
test('expired detail remains readable but cannot navigate Apply or claim an employer closure',()=>{
 const b=board(),j=job({deadline:'October 1, 2000',deadlineISO:'2000-10-01'});b.init([j]);
 b.app.state.detailOpen=true;b.app.state.detailLink=j.link;b.app.renderOverlays();
 assert.match(b.overlay.textContent,/Application deadline passed/);assert.doesNotMatch(b.overlay.textContent,/permanently|filled/);assert.equal(b.overlay.querySelector('[data-act="detailApply"]'),null);assert.equal(b.opened.length,0);
});
test('source months remain months and OTE stays visible in the real card and detail pay headings',async()=>{
 const Pay=require('../../js/pay-display.js');
 assert.equal(Pay.compact('$96K-125K OTE/year',{basis:'annual'}),'$96K–125K/year OTE');
 assert.equal(Pay.compact('$160K-185K OTE/year',{basis:'annual'}),'$160K–185K/year OTE');
 assert.equal(Pay.compact('$17.67 (time unit not listed)',{basis:'not_listed',internship:true}),'$17.67 (time unit not listed)');
 const b=board({response:{ok:true,status:200,text:async()=>csv([row({'Years of Experience':'6-12 months',Salary:'$96K-125K OTE/year'})])}});b.window.SUPayDisplay=Pay;await b.boot();
 assert.equal(b.app.jobs[0].exp,'6-12 months');
 const card=b.document.querySelector('[data-act="openJob"]');assert.match(card.textContent,/6-12 months/);assert.match(card.textContent,/OTE/);assert.doesNotMatch(card.textContent,/6\+ yrs/);
 b.app.state.detailOpen=true;b.app.state.detailLink=b.app.jobs[0].link;b.app.renderOverlays();assert.match(b.overlay.textContent,/OTE/);assert.match(b.overlay.textContent,/6-12 months/);
});

test('elapsed deadlines leave current discovery without destroying saved source history',async()=>{
 const active=job({deadlineISO:'2030-10-14'}),expired=job({link:'https://example.org/expired',deadlineISO:'2030-10-13'}),rows=[expired,active];
 assert.deepEqual(D.current(rows,Date.parse('2030-10-15T03:59:59Z')),[active]);
 assert.equal(rows.length,2);assert.equal(D.current(rows,Date.parse('2030-10-15T04:00:00Z')).length,0);
 const b=board({response:{ok:true,status:200,text:async()=>csv([row({'Deadline ISO':'2000-01-01','Application Deadline':'2000-01-01'})],['Company','Job Title','Link','Location','Type','Salary','Years of Experience','Category','Description','Pick','Active/Dead','Date Added','Dead Date','TL;DR','Date Posted','Application Deadline','Deadline ISO'])}});
 b.window.SUJobDeadlines=D;await b.boot();assert.equal(b.app.jobs.length,0);assert.equal(b.app._archiveCatalog.length,1);assert.equal(b.app._closedLinks.length,0);
});

test('explicit written employer deadlines expire at their stated time without guessing partial or cohort dates',()=>{
 const figma={deadline:'October 2, 2026, 5:00 PM PT'};
 assert.equal(D.facts(figma,Date.parse('2026-10-02T23:59:59Z')).state,'open');
 assert.equal(D.facts(figma,Date.parse('2026-10-03T00:00:00Z')).state,'expired');
 assert.equal(D.facts({deadline:'October 30, 2026, 5 PM PST (employer wording); rolling review'},Date.parse('2026-10-31T00:59:59Z')).state,'open');
 assert.equal(D.facts({deadline:'October 30, 2026, 5 PM PST (employer wording); rolling review'},Date.parse('2026-10-31T01:00:00Z')).state,'expired');
 assert.equal(D.facts({deadline:'November 1, 2026'},Date.parse('2026-11-02T04:59:59Z')).state,'open');
 assert.equal(D.facts({deadline:'November 1, 2026'},Date.parse('2026-11-02T05:00:00Z')).state,'expired');
 for(const deadline of ['October 30','Spring: October 16, 2026; Summer: March 19, 2027','Not stated; employer anticipates posting for 15 days from August 25, 2026','ATS end date June 11, 2027; description says ongoing applications with no deadline'])assert.equal(D.facts({deadline}).state,'unspecified',deadline);
 for(const deadline of ['February 30, 2026','October 2, 2026, 13 PM PT','March 8, 2026, 2:30 AM PT','November 1, 2026, 1:30 AM PT'])assert.equal(D.facts({deadline}).state,'unknown',deadline);
 assert.equal(D.current([figma],Date.parse('2026-10-03T00:00:00Z')).length,0);
});
