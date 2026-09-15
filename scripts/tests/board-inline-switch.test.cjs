const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const fixturePath=path.join(__dirname,'board-qa.test.cjs');
const fixtureSource=fs.readFileSync(fixturePath,'utf8');
const prefix=fixtureSource.slice(0,fixtureSource.indexOf('\ntest('))
  .replace("function board({search='',","function board({route='/',search='',")
  .replace("pathname:'/jobs.html'",'pathname:route')
  .replace('return response||','return typeof response===\'function\'?response(url,options):response||');
const fixture={exports:{}};
vm.runInNewContext(prefix+'\nmodule.exports={board,row,csv};',{module:fixture,require:createRequire(fixturePath),__dirname,Buffer,URL,URLSearchParams,setImmediate},{filename:fixturePath});
const {board,row,csv}=fixture.exports;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{await tick();await tick();};
const storage=(data=new Map())=>({data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)});
const internData=()=>{const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../../internships-data.json'),'utf8'));data.jobs=data.jobs.slice(0,1);return data;};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function harness(options={}){
  const pending=[],scrolls=[],captures=[],runtimeTimers=new Map();let nextTimer=0;
  const b=board({...options,response(url){const d=deferred();pending.push({...d,section:String(url).includes('internships')?'internships':'jobs',url});return d.promise;}});
  b.document.body.className=options.route && options.route!=='/' && options.route!=='/index.html'?'':'su-home-board';
  b.window.location=b.location;b.window.localStorage=b.localStorage;b.window.sessionStorage=options.session||storage();
  b.window.scrollY=1200;b.window.scrollTo=(x,y)=>{scrolls.push([x,y]);b.window.scrollY=y;};
  b.window.setTimeout=(fn,ms)=>{const id=++nextTimer;runtimeTimers.set(id,{fn,ms});return id;};b.window.clearTimeout=id=>runtimeTimers.delete(id);
  b.window.SUBoardRuntime=require('../../js/board-runtime.js')(b.window);
  b.window.SUInternships=require('../../js/internships.js');
  b.window.SUBoardHeading=require('../../js/board-heading.js');
  b.window.SUStore={current:()=>true,captureSaved:jobs=>captures.push(Array.from(jobs,j=>j.link))};
  function jobs(request,records=[row()]){request.resolve({ok:true,text:async()=>csv(records)});}
  function internships(request,data=internData()){request.resolve({ok:true,json:async()=>data});}
  return {...b,pending,scrolls,captures,jobs,internships,runtimeTimers};
}

test('home switches synchronously, restores separate filters and preserves account, Saved, Tracker and URL',async()=>{
  const b=harness({saved:{'https://example.com/saved':true},tracker:[{co:'My company',role:'My role'}],look:'beauty'});
  await b.boot();b.jobs(b.pending[0]);await settle();
  const app=b.app,beforeSaved=b.localStorage.getItem('su_saved_jobs'),beforeTracker=b.localStorage.getItem('su_tracker');
  const auth={signedIn:()=>true};b.window.SUAuth=auth;
  b.app.setState({q:'designer',pr:'$100K+',salaryMin:'100000',salaryMax:'180000',savedOnly:true,theme:'social'});
  b.window.SUBoardRuntime.save('internships',{q:'summer',pr:'Paid',st:'CA',salaryMin:'120000',savedOnly:true});
  const next=b.app.switchSection('internships');
  assert.equal(b.app,app);assert.equal(b.app.internships,true);assert.equal(b.app.jobs.length,0);assert.equal(b.app._loading,true);
  assert.equal(b.app.state.q,'summer');assert.equal(b.app.state.pr,'Paid');assert.equal(b.app.state.st,'CA');assert.equal(b.app.state.salaryMin,'');assert.equal(b.app.state.salaryMax,'');assert.equal(b.app.state.savedOnly,false);assert.equal(b.app.state.theme,null);
  assert.equal(b.app.state.look,'beauty');assert.equal(b.window.SUAuth,auth);
  assert(b.app.shuffledNotes().every(note=>b.app.INTERNSHIP_NOTES.includes(note)),'the cached handwritten note deck changes with the section');
  await settle();b.internships(b.pending[1]);assert.equal(await next,true);
  const back=b.app.switchSection('jobs');assert.equal(b.app.internships,false);assert.equal(b.app.state.q,'designer');assert.equal(b.app.state.salaryMin,'100000');assert.equal(b.app.state.salaryMax,'180000');assert.equal(b.app.state.pr,'$100K+');assert.equal(b.app.state.savedOnly,false);assert.equal(b.app.state.theme,'social');
  await settle();b.jobs(b.pending[2]);await back;
  assert.equal(b.localStorage.getItem('su_saved_jobs'),beforeSaved);assert.equal(b.localStorage.getItem('su_tracker'),beforeTracker);assert.equal(b.location.pathname,'/');assert.equal(b.location.search,'');assert.deepEqual(b.scrolls,[]);
  assert(b.app.shuffledNotes().every(note=>b.app.NOTES.includes(note)));
  b.grid.querySelector('[data-act="toggleSavedOnly"]').click();assert.equal(b.app.state.savedOnly,true,'one click has one handler after both transitions');
});

test('late Jobs response cannot replace Internships or write obsolete closure/archive metadata',async()=>{
  const b=harness();await b.boot();const next=b.app.switchSection('internships');await settle();
  b.internships(b.pending[1]);await next;const current=b.app.jobs[0].link,status=b.app._internshipStatus;
  b.jobs(b.pending[0],[row({Company:'Late jobs'}),row({Link:'https://example.com/closed','Active/Dead':'Dead'})]);await settle();
  assert.equal(b.app.internships,true);assert.equal(b.app.jobs[0].link,current);assert.equal(b.app._internshipStatus,status);
  assert.equal(b.app._closedLinks.length,0);assert.equal(b.app._archiveCatalog.length,0);assert.equal(b.app._moderationCatalog[0].link,current);
  assert.equal(b.captures.length,1);assert(!b.captures.flat().includes('https://example.com/closed'));
});

test('old rejection and cleanup cannot end or replace the current section request',async()=>{
  const b=harness();await b.boot();const next=b.app.switchSection('internships');await settle();
  b.pending[0].reject(Error('old jobs unavailable'));await settle();
  assert.equal(b.app._loading,true);assert.equal(b.app._loadError,false);assert.equal(b.app.switchSection('internships'),next);
  b.runTimers(600);assert.equal(b.app._loadingVisible,true);
  b.internships(b.pending[1]);assert.equal(await next,true);assert.equal(b.app._loading,false);assert.equal(b.app._loadError,false);
  b.runTimers(600);assert.equal(b.app._loadingVisible,false);assert.equal(b.pending.length,2);
});

test('rapid Jobs to Internships to Jobs safely coalesces an existing Jobs read',async()=>{
  const b=harness();await b.boot();const away=b.app.switchSection('internships');await settle();const back=b.app.switchSection('jobs');await settle();
  assert.equal(b.pending.length,2,'runtime joins only an equivalent in-flight catalog');
  b.jobs(b.pending[0],[row({Company:'Current jobs'})]);assert.equal(await back,true);assert.equal(b.app.jobs[0].co,'Current jobs');
  b.internships(b.pending[1]);assert.equal(await away,false);assert.equal(b.app.internships,false);assert.equal(b.app.jobs[0].co,'Current jobs');assert.equal(b.app._internshipStatus,null);assert.equal(b.captures.length,1);
});

test('failed or unverified Internships stay empty and retry does not restore old Jobs',async()=>{
  const b=harness();await b.boot();b.jobs(b.pending[0]);await settle();
  const next=b.app.switchSection('internships');await settle();b.pending[1].reject(Error('offline'));assert.equal(await next,false);
  assert.equal(b.app.jobs.length,0);assert.equal(b.app._moderationCatalog,null);assert.equal(b.app._loadError,true);assert.equal(b.app.internships,true);
  b.grid.querySelector('[data-act="retryJobs"]').click();await settle();
  const data=internData();data.status='awaiting_verification';data.jobs=[];b.internships(b.pending[2],data);await settle();
  assert.equal(b.app.jobs.length,0);assert.equal(b.app._loadError,false);assert.equal(b.app._internshipStatus,'awaiting_verification');
});

test('switch cancels old input drafts and preserves an immediate homepage category patch',async()=>{
  const b=harness();await b.boot();b.jobs(b.pending[0]);await settle();
  b.app.setState({openPanel:'filters'});const min=b.document.getElementById('su-salary-min');min.value='45000';b.fire('input',min);
  const search=b.document.getElementById('su-search');search.value='old delayed search';b.fire('input',search);
  const next=b.app.switchSection('internships');b.runTimers(140);b.fire('focusout',min);b.runTimers(0);assert.equal(b.app.state.q,'');assert.equal(b.app.state.salaryMin,'');
  await settle();b.internships(b.pending[1]);await next;
  const back=b.app.switchSection('jobs');b.app.setState({theme:'brand',q:'new choice'});await settle();b.jobs(b.pending[2]);await back;
  assert.equal(b.app.state.theme,'brand');assert.equal(b.app.state.q,'new choice');
});

test('only homepage boot restores its active section and dedicated routes cannot switch inline',async()=>{
  const session=storage();session.setItem('su_home_board_section_v1','internships');
  const home=harness({session});await home.boot();assert.equal(home.app.internships,true);assert.equal(home.pending[0].section,'internships');home.internships(home.pending[0]);await settle();
  const jobs=harness({route:'/jobs.html',session});await jobs.boot();assert.equal(jobs.app.internships,false);assert.equal(await jobs.app.switchSection('internships'),false);assert.equal(jobs.pending.length,1);jobs.jobs(jobs.pending[0]);await settle();
  const internships=harness({route:'/internships.html',session});await internships.boot();assert.equal(internships.app.internships,true);assert.equal(await internships.app.switchSection('jobs'),false);internships.internships(internships.pending[0]);await settle();
  const fresh=harness();await fresh.boot();assert.equal(fresh.app.internships,false);fresh.jobs(fresh.pending[0]);await settle();
});

test('heading focus survives immediate switching but a later response does not steal search focus',async()=>{
  const b=harness();await b.boot();b.jobs(b.pending[0]);await settle();
  b.grid.querySelector('.su-section-trigger').focus();const next=b.app.switchSection('internships');
  assert.equal(b.document.activeElement,b.grid.querySelector('.su-section-trigger'));
  const search=b.document.getElementById('su-search');search.focus();await settle();b.internships(b.pending[1]);await next;
  assert.equal(b.document.activeElement,b.document.getElementById('su-search'));assert.deepEqual(b.scrolls,[]);
});

test('initial stored scroll cannot fire after the person switched sections',async()=>{
  const b=harness();b.window.SUBoardRuntime.save('jobs',{q:'',savedOnly:false});await b.boot();b.jobs(b.pending[0]);await settle();
  const next=b.app.switchSection('internships');b.runTimers(0);assert.deepEqual(b.scrolls,[]);
  await settle();b.internships(b.pending[1]);await next;b.runTimers(0);assert.deepEqual(b.scrolls,[]);
});

test('a newer availability failure keeps a completed section catalog unpublished until retry',async()=>{
  const b=harness();let state={status:'ready'};
  b.window.SUJobModeration.status=()=>state;
  await b.boot();b.jobs(b.pending[0]);await settle();
  const next=b.app.switchSection('internships');await settle();state={status:'error'};
  b.internships(b.pending[1]);assert.equal(await next,false);assert.equal(b.app.jobs.length,0);assert.equal(b.app._loadError,true);assert.equal(b.app._moderationCatalog,null);
  state={status:'ready'};b.grid.querySelector('[data-act="retryJobs"]').click();await settle();b.internships(b.pending[2]);await settle();assert.equal(b.app.jobs.length,1);assert.equal(b.app._loadError,false);
});

test('CSV parser keeps its legacy array contract and only returns closure metadata to the request',()=>{
  const b=harness(),records=[row(),row({Link:'https://example.com/closed','Active/Dead':'Dead'})],metadata={};
  b.app._closedLinks=['previous'];b.app._archiveCatalog=['previous'];
  const legacy=b.helpers.rowsToJobs(b.helpers.parseCSV(csv(records)));assert(Array.isArray(legacy));assert.equal(legacy.length,1);
  const current=b.helpers.rowsToJobs(b.helpers.parseCSV(csv(records)),metadata);assert(Array.isArray(current));assert.equal(current.length,1);
  assert.deepEqual(Array.from(metadata.closedLinks),['https://example.com/closed']);assert.equal(metadata.archiveCatalog[0].link,'https://example.com/closed');
  assert.deepEqual(b.app._closedLinks,['previous']);assert.deepEqual(b.app._archiveCatalog,['previous']);
});

// Exercise the actual analytics client with controlled digest completion. No
// network calls leave this fixture; only the canonical job ID may reach its sink.
const analyticsFixturePath=path.join(__dirname,'analytics-client.test.cjs');
const analyticsSource=fs.readFileSync(analyticsFixturePath,'utf8');
const analyticsFixture={exports:{}};
vm.runInNewContext(analyticsSource.slice(0,analyticsSource.indexOf('\ntest('))+'\nmodule.exports={harness,storage};',{module:analyticsFixture,require:createRequire(analyticsFixturePath),TextEncoder,Uint8Array},{filename:analyticsFixturePath});
test('slower analytics hashing cannot replace the active board catalog or strand its current action',async()=>{
  const h=analyticsFixture.exports.harness(analyticsFixture.exports.storage({su_consent_v3:'granted'}));
  const crypto=require('node:crypto'),hashes=[];
  h.window.crypto={getRandomValues:array=>crypto.webcrypto.getRandomValues(array),subtle:{digest(_name,bytes){const d=deferred();hashes.push({...d,bytes});return d.promise;}}};
  const old={link:'https://example.com/old'},current={link:'https://example.com/current'};
  const oldRegistration=h.api.registerJobs([old]);
  await h.api.registerJobs([]);
  const registration=h.api.registerJobs([current]);h.api.job('job_open',current.link);
  hashes[1].resolve(crypto.createHash('sha256').update(hashes[1].bytes).digest());await registration;
  hashes[0].resolve(crypto.createHash('sha256').update(hashes[0].bytes).digest());await oldRegistration;
  h.api.job('job_save',current.link);await h.api.flush();
  const events=h.requests.flatMap(r=>JSON.parse(r.options.body||'{"events":[]}').events);
  assert.deepEqual(Array.from(events,e=>e.name),['job_open','job_save']);assert.equal(events[0].jobId,events[1].jobId);assert.doesNotMatch(JSON.stringify(events),/example\.com/);
});

test('a failed obsolete analytics digest cannot interrupt a later valid registration',async()=>{
  const h=analyticsFixture.exports.harness(analyticsFixture.exports.storage({su_consent_v3:'granted'}));
  const crypto=require('node:crypto'),old=deferred();let first=true;
  h.window.crypto={getRandomValues:array=>crypto.webcrypto.getRandomValues(array),subtle:{digest(name,bytes){if(first){first=false;return old.promise;}return crypto.webcrypto.subtle.digest(name,bytes);}}};
  const prior=h.api.registerJobs([{link:'https://example.com/old'}]);await h.api.registerJobs([{link:'https://example.com/new'}]);old.reject(Error('obsolete digest failed'));await prior;
  h.api.job('job_save','https://example.com/new');await h.api.flush();assert.equal(JSON.parse(h.requests[0].options.body).events[0].name,'job_save');
});

test('homepage visual query restores section filters and scroll without leaking a Jobs content preset',async()=>{
  for(const query of ['?theme=beauty','?theme=social']){
    const session=storage();session.setItem('su_home_board_section_v1','internships');
    const b=harness({session,search:query});b.window.SUBoardRuntime.save('internships',{q:'summer',st:'CA',pr:'Paid',theme:'brand',savedOnly:false});
    await b.boot();assert.equal(b.app.internships,true);assert.equal(b.app.state.q,'summer');assert.equal(b.app.state.st,'CA');assert.equal(b.app.state.pr,'Paid');assert.equal(b.app.state.theme,null);
    b.internships(b.pending[0]);await settle();b.runTimers(0);assert.deepEqual(b.scrolls,[[0,1200]]);
  }
  const jobs=harness({search:'?theme=beauty'});jobs.window.SUBoardRuntime.save('jobs',{q:'designer',theme:'brand',salaryMin:'60000',savedOnly:false});await jobs.boot();assert.equal(jobs.app.state.theme,'brand');assert.equal(jobs.app.state.q,'designer');assert.equal(jobs.app.state.salaryMin,'60000');jobs.jobs(jobs.pending[0]);await settle();
});

test('explicit Jobs preset/deep link and dedicated queries retain precedence over stored views',async()=>{
  const home=harness({search:'?theme=social'});home.window.SUBoardRuntime.save('jobs',{q:'old query',theme:'brand'});await home.boot();assert.equal(home.app.state.theme,'social');assert.equal(home.app.state.q,'');home.jobs(home.pending[0]);await settle();
  const session=storage();session.setItem('su_home_board_section_v1','internships');
  const deep=harness({session,search:'?job='+encodeURIComponent(Buffer.from('https://example.com/job').toString('base64'))});await deep.boot();assert.equal(deep.app.internships,false);assert.equal(deep.pending[0].section,'jobs');deep.jobs(deep.pending[0]);await settle();
  const dedicated=harness({route:'/jobs.html',search:'?theme=beauty'});dedicated.window.SUBoardRuntime.save('jobs',{q:'old query',salaryMin:'70000'});await dedicated.boot();assert.equal(dedicated.app.state.q,'');assert.equal(dedicated.app.state.salaryMin,'');dedicated.jobs(dedicated.pending[0]);await settle();
});
