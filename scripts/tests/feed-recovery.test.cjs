const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const Identity=require('../../js/job-identity.js'),I=require('../../js/internships.js');
const fixturePath=path.join(__dirname,'board-qa.test.cjs'),source=fs.readFileSync(fixturePath,'utf8');
const fixture=source.slice(0,source.indexOf('\ntest('));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{await tick();await tick();};
function board(route='/internships.html',options={}){
 const module={exports:{}};
 let adapter=fixture.replace("pathname:'/jobs.html'",'pathname:'+JSON.stringify(route));
 adapter=adapter.replace('return{app:window.SUApp,','return{setFetch(fn){context.fetch=fn;},timers,context,app:window.SUApp,');
 vm.runInNewContext(adapter+'\nmodule.exports={board,csv,row};',{module,require:createRequire(fixturePath),__dirname,Buffer,URL,URLSearchParams,setImmediate},{filename:fixturePath});
 const b=module.exports.board(options);b.window.SUInternships=I;b.csv=module.exports.csv;b.row=module.exports.row;
 b.diagnostics=[];b.window.console={warn:(label,value)=>b.diagnostics.push({label,...value})};
 return b;
}
function listing(){const link='https://example.com/program/design';return {co:'Example Studio',role:'Design Intern',link,loc:'Chicago, IL',state:'IL',style:'Hybrid',ind:'Video & Creative',desc:'Student design work.',pay:'$22/hour',payStatus:'paid',payBasis:'hour',eligibility:'Current college students',eligibilityFlags:['current_student'],collegeCredit:'available',benefits:[],cycle:'Summer',duties:['Assist with design.'],applicationStatus:'open',timingSourceUrl:link,verification:{status:'open',checkedAt:new Date().toISOString(),sourceUrl:link,reviewerType:'source_check'}};}
const catalog=()=>({schemaVersion:2,status:'verified',jobs:[listing()]});
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data,text:async()=>JSON.stringify(data)});
const index=(revision=12,removed=[])=>({schemaVersion:1,revision,removed:removed.map(link=>({link,keys:Identity.keys(link),slugs:[]})),checkedAt:new Date().toISOString()});
function realModeration(b,handler=()=>response(index())){
 Object.assign(b.window,{location:b.location,document:b.document,SUJobIdentity:Identity,AbortController,setTimeout:b.context.setTimeout,clearTimeout:b.context.clearTimeout,setInterval:()=>1,clearInterval:()=>{},removeEventListener:()=>{},fetch:handler});
 b.document.removeEventListener=()=>{};
 b.window.SUJobModeration=require('../../js/job-moderation.js').create(b.window);
 // Explicit refresh exercises real transport without running the independent watch first.
 b.window.SUJobModeration.watch=()=>()=>{};
 return b.window.SUJobModeration;
}
async function retry(b){b.runTimers(600);await settle();}

test('one transient catalog failure automatically recovers even when moderation revision stays unchanged',async()=>{
 let bodies=0;const b=board('/internships.html',{response:{ok:true,status:200,json:async()=>{if(++bodies===1)throw Error('private URL https://x.test/?token=secret');return catalog();}}});
 const moderation=realModeration(b);await b.boot();assert.equal(b.app.jobs.length,0);assert.equal(b.app._loading,true);assert.equal(b.app._loadError,false);
 await moderation.refresh();await settle();assert.equal(b.requests.length,1,'same revision alone does not refetch');
 await retry(b);assert.equal(b.app.jobs.length,1);assert.equal(b.app._loading,false);assert.equal(b.app._loadError,false);assert.equal(b.requests.length,2);
 assert.equal(b.diagnostics[0].stage,'catalog');assert.equal(b.diagnostics[0].code,'network');assert.equal(b.diagnostics[0].attempt,1);
 assert.doesNotMatch(JSON.stringify(b.diagnostics),/private|token|https:/);assert.equal(b.requests.some(x=>x.url.includes('internships-data')),false);
});
test('Jobs uses the same bounded retry and preserves filters and saved identities',async()=>{
 const link='https://example.com/saved',b=board('/jobs.html',{saved:{[link]:true}});let attempts=0;
 b.setFetch(async()=>{if(++attempts===1)throw Error('offline');return {ok:true,text:async()=>b.csv([b.row()])};});
 await b.boot();b.app.state.q='design';b.app.state.salaryMin='45000';await retry(b);
 assert.equal(attempts,2);assert.equal(b.app.jobs.length,1);assert.equal(b.app.state.q,'design');assert.equal(b.app.state.salaryMin,'45000');assert.deepEqual(JSON.parse(b.localStorage.getItem('su_saved_jobs')),{[link]:true});
});
test('second transport failure ends in visible manual recovery, never an automatic loop',async()=>{
 const b=board('/internships.html',{fetchError:Error('offline')});await b.boot();await retry(b);
 assert.equal(b.app._loading,false);assert.equal(b.app._loadError,true);assert(b.grid.querySelector('[data-act="retryJobs"]'));assert.equal(b.requests.length,2);
 await retry(b);assert.equal(b.requests.length,2);assert.deepEqual(b.diagnostics.map(x=>x.attempt),[1,2]);
 b.grid.querySelector('[data-act="retryJobs"]').click();await settle();assert.equal(b.requests.length,3,'explicit manual retry starts a fresh bounded attempt');
});
test('healthy catalog plus transient moderation error retries both checks and honors fresh suppression',async()=>{
 let calls=0;const b=board('/internships.html',{response:response(catalog())});
 realModeration(b,async()=>{if(++calls===1)throw Error('private transport error');return response(index(13,[listing().link]));});
 await b.boot();assert.equal(b.app.jobs.length,0);assert.equal(b.app._loading,true);assert.equal(b.diagnostics[0].stage,'moderation');
 await retry(b);assert.equal(calls,2);assert.equal(b.requests.length,2);assert.equal(b.app.jobs.length,0);assert.equal(b.app._loadError,false);assert.equal(b.app._moderationCatalog.length,1);
});
test('invalid payload, duplicate identity, malformed JSON and nonretryable HTTP never silently pass or retry',async()=>{
 const duplicate=catalog();duplicate.jobs.push(listing());
 for(const r of [response({bad:true}),response(duplicate),{ok:true,status:200,json:async()=>{throw SyntaxError('private body');}},response({},403),response({},429)]){
  const b=board('/internships.html',{response:r});await b.boot();await retry(b);assert.equal(b.requests.length,1);assert.equal(b.app._loadError,true);assert.equal(b.app.jobs.length,0);
 }
});
test('transient HTTP503 receives exactly one retry; valid empty catalog is success with no retry',async()=>{
 const b=board();let attempts=0;b.setFetch(async()=>++attempts===1?response({},503):response({schemaVersion:2,status:'verified',jobs:[]}));await b.boot();await retry(b);
 assert.equal(attempts,2);assert.equal(b.app._loadError,false);assert.equal(b.app.jobs.length,0);assert.equal(b.diagnostics[0].status,503);
});
test('pending retry pauses while hidden and resumes on visibility without hanging or adding a new retry budget',async()=>{
 let n=0;const b=board('/internships.html',{response:{ok:true,json:async()=>{if(++n===1)throw Error('temporary');return catalog();}}});await b.boot();b.document.hidden=true;await retry(b);assert.equal(n,1);
 b.document.hidden=false;b.fire('visibilitychange',b.document.body);await settle();assert.equal(n,2);assert.equal(b.app.jobs.length,1);await retry(b);assert.equal(n,2);
});
test('pagehide cancels pending timer and BFCache pageshow completes the same bounded retry',async()=>{
 let n=0;const b=board('/internships.html',{response:{ok:true,json:async()=>{if(++n===1)throw Error('temporary');return catalog();}}});await b.boot();b.fireWindow('pagehide');await retry(b);assert.equal(n,1);
 b.fireWindow('pageshow',{persisted:true});await settle();assert.equal(n,2);assert.equal(b.app._loading,false);assert.equal(b.app.jobs.length,1);
});
test('section switch cancels prior retry and a late previous catalog cannot replace the current section',async()=>{
 const b=board('/');b.document.body.className='su-home-board';let count=0,finish;
 b.setFetch(async url=>{count++;if(url.includes('internships-catalog'))return response(catalog());throw Error('jobs offline');});
 await b.boot();await b.app.switchSection('internships');await settle();await retry(b);assert.equal(count,2);assert.equal(b.app.internships,true);assert.equal(b.app.jobs[0].role,'Design Intern');
 const c=board('/');c.document.body.className='su-home-board';c.setFetch(url=>url.includes('internships-catalog')?Promise.resolve(response(catalog())):new Promise(r=>finish=r));
 await c.boot();await c.app.switchSection('internships');finish({ok:true,text:async()=>c.csv([c.row()])});await settle();assert.equal(c.app.jobs[0].role,'Design Intern');assert.equal(c.app.internships,true);
});
test('a new manual request invalidates the prior recovery timer',async()=>{
 const b=board('/internships.html',{response:response(catalog())});let n=0;b.setFetch(async()=>{if(++n===1)throw Error('temporary');return response(catalog());});await b.boot();
 const button=b.document.createElement('button');button.setAttribute('data-act','retryJobs');b.grid.appendChild(button);button.click();await settle();await retry(b);assert.equal(n,2);assert.equal(b.app.jobs.length,1);
});
test('real moderation response-body errors retain finite stage/status without publishing bodies',async()=>{
 for(const [handler,code,status] of [[()=>({ok:false,status:503,text:async()=>'<html>private</html>'}),'http',503],[()=>({ok:true,status:200,text:async()=>'{private'}),'parse',200],[()=>response({bad:true}),'validation',undefined]]){
  const b=board(),m=realModeration(b,handler);await assert.rejects(m.refresh(),e=>{assert.equal(e.feedFailure.stage,'moderation');assert.equal(e.feedFailure.code,code);assert.equal(e.feedFailure.status,status);assert.doesNotMatch(e.message,/private/);return true;});
 }
});
test('runtime and moderation deadlines label timeout distinctly and remain fail closed',async()=>{
 const b=board(),m=realModeration(b,()=>new Promise(()=>{}));const pending=m.refresh(),failed=assert.rejects(pending,e=>e.feedFailure.stage==='moderation'&&e.feedFailure.code==='timeout');b.runTimers(10000);await failed;assert.equal(m.status().status,'error');
 const root={AbortController,setTimeout:b.context.setTimeout,clearTimeout:b.context.clearTimeout,localStorage:{getItem:()=>null}},runtime=require('../../js/board-runtime.js')(root),work=runtime.request('jobs',()=>new Promise(()=>{}));
 const rejected=assert.rejects(work,e=>e.feedFailure.stage==='runtime'&&e.feedFailure.code==='timeout');b.runTimers(20000);await rejected;
});

for(const event of ['hidden','pagehide'])test('first in-flight failure while '+event+' retains recovery until return before 60 seconds',async()=>{
 let reject,n=0;const b=board();b.setFetch(()=>++n===1?new Promise((_,r)=>reject=r):Promise.resolve(response(catalog())));await b.boot();
 if(event==='hidden')b.document.hidden=true;else b.fireWindow('pagehide');reject(Error('temporary'));await settle();await retry(b);assert.equal(n,1);assert.equal(b.app._loading,true);
 if(event==='hidden'){b.document.hidden=false;b.fire('visibilitychange',b.document.body);}else b.fireWindow('pageshow',{persisted:true});
 await settle();assert.equal(n,2);assert.equal(b.app.jobs.length,1);assert.equal(b.app._loading,false);
});
test('unverified live counts are unavailable, while verified empty feeds and Saved retain numeric counts',async()=>{
 const b=board('/internships.html',{fetchError:Error('offline'),saved:{'https://example.com/saved':true}});await b.boot();await retry(b);b.app.setState({openPanel:'cat'});
 assert.equal(b.grid.querySelector('.su-results-count').textContent,'Listing count unavailable');
 for(const row of b.grid.querySelectorAll('[data-act="cat"]')){const count=row.querySelector('span');assert.equal(count.textContent,'—');assert.equal(count.getAttribute('aria-label'),'Count unavailable');}
 b.app.render(true);for(const row of b.grid.querySelectorAll('[data-act="cat"]'))assert.equal(row.querySelector('span').textContent,'—');
 b.app.setState({savedOnly:true});assert.equal(b.grid.querySelector('.su-results-count').textContent,'1 saved role');
 const empty=board('/internships.html',{response:response({schemaVersion:2,status:'verified',jobs:[]})});await empty.boot();assert.equal(empty.grid.querySelector('.su-results-count').textContent,'0 internships');
});
