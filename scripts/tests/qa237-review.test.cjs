const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const P=require('../../js/personalization.js'),D=require('../../js/discovery.js');
const fixturePath=path.join(__dirname,'board-qa.test.cjs');
const source=fs.readFileSync(fixturePath,'utf8'),first=source.indexOf('\ntest(');
const fixture={exports:{}};
const prefix=source.slice(0,first).replace('response,fetchError,',"response,fetchError,pathname='/jobs.html',").replace("pathname:'/jobs.html'",'pathname');
vm.runInNewContext(prefix+'\nmodule.exports={board,job,row,csv};',{module:fixture,require:createRequire(fixturePath),__dirname,Buffer,URL,URLSearchParams,setImmediate},{filename:fixturePath});
const {board,job,row,csv}=fixture.exports;
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function discoverySpy(b){
 const calls=[];b.window.SUPersonalization=P;
 b.window.SUDiscovery={order(jobs){calls.push(jobs.map(j=>j.link));return jobs.slice().sort((a,b)=>a.co.localeCompare(b.co));},start(){},updateCatalog(){},showHidden:()=>false,hidden:()=>false,html:()=>'',toolsHTML:()=>'',preferencesOpen:()=>false};
 return calls;
}

test('initial board shell attempts introduction before a pending feed and exposes no cached rows',async()=>{
 let finish;const b=board({response:{ok:true,text:()=>new Promise(resolve=>finish=resolve)}});
 const states=[];b.window.SUWelcome={maybeShow(){states.push({loading:b.app._loading,jobs:b.app.jobs.length});}};
 await b.boot();assert.equal(states[0].loading,true);assert.equal(states[0].jobs,0);
 assert.equal(b.grid.querySelectorAll('.note[data-act="openJob"]').length,0);
 finish(csv([row()]));await tick();await tick();assert.equal(b.app.jobs.length,1);
});

test('the initial successful feed computes a real ordering after the empty loading shell',async()=>{
 const b=board({response:{ok:true,text:async()=>csv([row({Company:'Zulu'}),row({Company:'Alpha',Link:'https://example.com/a'})])}});
 const calls=discoverySpy(b);await b.boot();
 assert(calls.some(call=>call.length===2),'a real feed must be ranked rather than reusing the empty loading result');
 assert.deepEqual(Array.from(b.app.computeShown().shown,j=>j.co),['Alpha','Zulu']);
});

test('a current catalog replacement rebinds ordering to fresh job objects without reviving removed cards',()=>{
 const b=board();discoverySpy(b);b.init([job({co:'Zulu'}),job({co:'Alpha',link:'https://example.com/a'})]);
 b.app.updateJobs([job({co:'New Zulu'}),job({co:'Beta',link:'https://example.com/b'})]);
 assert.deepEqual(Array.from(b.app.computeShown().shown,j=>j.co),['Beta','New Zulu']);
 assert.equal(b.grid.querySelectorAll('.note[data-act="openJob"]').some(el=>el.getAttribute('data-link')==='https://example.com/a'),false);
});

test('starter lanes and interested role groups retain their supplied varied order regardless of salary',()=>{
 const jobs=[job({co:'Lower',pay:'$60K',link:'https://example.com/low'}),job({co:'Higher',pay:'$180K',link:'https://example.com/high'}),job({co:'Hourly',pay:'$90/hour',link:'https://example.com/hour'})];
 assert.deepEqual(D.starter(jobs,P),jobs);
 const now=Date.now(),interest={a:{field:'Marketing',role:'Social Media',weight:10,at:now}};
 assert.deepEqual(P.rank(jobs,interest,{now}),jobs);
 assert.deepEqual(P.rank(jobs.slice().reverse(),interest,{now}),jobs.slice().reverse());
 const altered=jobs.map((j,i)=>({...j,pay:['$400K','$1K','$2/hour'][i]}));
 assert.deepEqual(D.starter(altered,P).map(j=>j.link),jobs.map(j=>j.link));
 assert.deepEqual(P.rank(altered,interest,{now}).map(j=>j.link),jobs.map(j=>j.link));
});

test('salary-neutral ranking never mutates public source pay or adds/removes identities',()=>{
 const jobs=Array.from({length:18},(_,i)=>job({link:'https://example.com/'+i,ind:i%2?'Social':'Fashion Design',pay:i%3?'$41,460–75,600':'$23.50/hour'}));
 const before=JSON.stringify(jobs),now=Date.now(),interest={a:{field:'Marketing',role:'Social Media',weight:8,at:now}};
 const ordered=P.rank(jobs,interest,{now});D.starter(ordered,P);
 assert.equal(JSON.stringify(jobs),before);assert.equal(new Set(ordered.map(j=>j.link)).size,jobs.length);
});


test('all themes on both boards reveal the stamp only after the inline note is closed, without opening a job or changing saved state',()=>{
 for(const pathname of ['/jobs.html','/internships.html'])for(const look of ['original','poker','beauty','girly','mermaid','bratt','noir','chess']){
  const b=board({pathname,look});b.window.SUInternships=require('../../js/internships.js');
  const isIntern=pathname.includes('internships');
  const jobs=Array.from({length:3},(_,i)=>job({co:'Fixture '+i,link:'https://example.com/'+i,pay:'$120K',...(isIntern?{internship:true,payStatus:'paid',applicationStatus:'open',duties:['Prepare design files.'],eligibility:'Current college students.'}:{})}));
  b.init(jobs);const tab=b.grid.querySelector('[data-act="openNote"]');assert(tab,pathname+' '+look);
  const id=tab.getAttribute('data-id');
  const current=()=>b.grid.querySelectorAll('.note[data-act="openJob"]').find(node=>node.getAttribute('data-id')===id);
  assert.equal(current().querySelector('.su-internship-stamp'),null);
  assert.doesNotMatch(current().textContent,/Human.verified/i);
  const saved=b.localStorage.getItem('su_saved_jobs');tab.click();
  assert.equal(!!b.app.state.detailOpen,false);assert(current().querySelector('[data-act="closeNote"]'));
  assert.equal(current().querySelector('.su-internship-stamp'),null);
  current().querySelector('[data-act="closeNote"]').click();
  assert.equal(b.app.state.openNotes[id],'closing');b.runTimers(290);
  assert.equal(b.app.state.openNotes[id],'done');assert.equal(current().querySelector('[data-act="openNote"]'),null);
  assert(current().querySelector('.stampfade'),'revealed stamp animates for '+pathname+' '+look);
  if(isIntern)assert(current().querySelector('.su-internship-stamp'));
  else assert.match(current().textContent,/Human.verified/i);
  assert.equal(b.localStorage.getItem('su_saved_jobs'),saved);assert.equal(!!b.app.state.detailOpen,false);
 }
});

test('bookmark and inline-note actions do not accidentally open a role or report an application',()=>{
 const b=board(),events=[];b.window.SUAnalytics.job=(name,link)=>events.push({name,link});
 b.init(Array.from({length:3},(_,i)=>job({pay:'$150K',link:'https://example.com/'+i})));
 const save=b.grid.querySelector('[data-act="toggleSave"]'),link=save.getAttribute('data-link');save.click();
 assert.equal(b.app.isSaved(link),true);assert.equal(!!b.app.state.detailOpen,false);assert.equal(events.filter(e=>e.name==='job_save').length,1);
 assert(!events.some(e=>e.name==='application_reported'||e.name==='apply_click'));
 assert.equal(b.opened.length,0);
});

test('a clean-URL Google feedback return restores its pending question before any automatic intro attempt',async()=>{
 const b=board(),entries=new Map([['su_feedback_auth_redirect_v1',JSON.stringify({v:1,at:Date.now()-1000,co:'Example',link:job().link})]]);
 b.window.sessionStorage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};
 let attempts=0;b.window.SUWelcome={maybeShow(){attempts++;}};
 await b.boot();
 assert.equal(attempts,0,'the actual initial shell must preserve the OAuth return task even with no query parameters');
 assert.equal(b.app.state.feedbackOpen,true);assert.equal(b.app.state.feedbackLink,job().link);
 assert.equal(entries.has('su_feedback_auth_redirect_v1'),false);
});

test('after browsing begins a feed refresh keeps surviving order while rebinding current objects and appending new roles',()=>{
 const b=board();discoverySpy(b);b.init([job({co:'Alpha'}),job({co:'Beta',link:'https://example.com/b'})]);
 const old=b.app.jobs.slice();b.app._feedInteracted=true;
 const next=[job({co:'New Beta',link:'https://example.com/b'}),job({co:'New Alpha'}),job({co:'A New Role',link:'https://example.com/new'})];b.app.updateJobs(next);
 const result=b.app.computeShown().shown;assert.deepEqual(Array.from(result,j=>j.co),['New Alpha','New Beta','A New Role']);
 assert(result.every(job=>!old.includes(job)));assert.equal(new Set(result.map(job=>job.link)).size,3);
});
