const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const fixturePath=path.join(__dirname,'board-qa.test.cjs');
const fixtureSource=fs.readFileSync(fixturePath,'utf8');
const fixtureModule={exports:{}};
vm.runInNewContext(fixtureSource.slice(0,fixtureSource.indexOf('\ntest('))+'\nmodule.exports={board,job,row,csv};',{
 require:createRequire(fixturePath),module:fixtureModule,__dirname,Buffer,URL,URLSearchParams,setImmediate
},{filename:fixturePath});
const {board,job}=fixtureModule.exports;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const link='https://example.com/job';
const id='ac305da8-2122-4b17-89de-e4506451895c';
function setup(options={}){
 const b=board(options),proto=Object.getPrototypeOf(b.document.body);let owner='qa-owner',admin=true;
 proto.remove=function(){if(this.parentNode)this.parentNode.removeChild(this);};
 Object.defineProperty(proto,'disabled',{get(){return this.getAttribute('disabled')!==null;},set(value){value?this.setAttribute('disabled',''):this.removeAttribute('disabled');if(value&&b.document.activeElement===this)b.document.activeElement=b.document.body;}});
 b.window.crypto={randomUUID:()=>id};
 b.window.SUStore={owner:()=>owner};
 b.window.SUAuth={qaAdmin:()=>admin,accountCurrent:()=>!!owner};
 b.owner=value=>{owner=value;b.fireWindow('su:auth-changed');};
 b.admin=value=>{admin=value;b.fireWindow('su:auth-changed');};
 b.openFeedback=()=>b.app.setState({feedbackOpen:true,feedbackCo:'Example',feedbackLink:link});
 return b;
}

test('only the current admin gets the separate report action; personal closed feedback never invokes it',async()=>{
 const b=setup();let mutations=0;b.window.SUJobModeration.mutate=()=>{mutations++;return Promise.resolve({});};
 await b.boot();b.openFeedback();
 const note=b.overlay.querySelector('[role="dialog"]');
 assert(note.querySelector('[data-act="adminReportJob"]'));
 assert(note.textContent.indexOf('Report job here')>note.textContent.indexOf("job wasn't a right fit"));
 b.overlay.querySelector('[data-act="reportBroken"]').click();
 assert.equal(mutations,0);assert.equal(b.app.jobs.length,0,'personal hiding retains its existing behavior');
 b.admin(false);b.openFeedback();assert.equal(b.overlay.querySelector('[data-act="adminReportJob"]'),null);
 b.admin(true);b.owner(null);b.openFeedback();assert.equal(b.overlay.querySelector('[data-act="adminReportJob"]'),null);
});

test('report waits for durable acknowledgment, retries the same operation, and preserves Saved and Tracker records',async()=>{
 const saved={[link]:true},tracker=[{link,co:'Example',role:'Designer',stage:'applied',notes:'Keep my note'}];
 const b=setup({saved,tracker});const calls=[];let pending=deferred();
 b.window.SUJobModeration.mutate=(action,target,options)=>{calls.push({action,target,options});return pending.promise;};
 await b.boot();b.openFeedback();const initialSaved=b.localStorage.getItem('su_saved_jobs'),initialTracker=b.localStorage.getItem('su_tracker');
 b.overlay.querySelector('[data-act="adminReportJob"]').click();
 assert.equal(b.overlay.querySelector('[data-act="adminReportJob"]').disabled,true);
 assert.equal(b.document.querySelector('.su-admin-report-toast'),null);
 pending.reject(Error('Could not confirm the report. Please retry.'));await tick();
 assert.match(b.overlay.textContent,/Could not confirm the report/);assert.equal(b.document.querySelector('.su-admin-report-toast'),null);
 pending=deferred();b.overlay.querySelector('[data-act="adminReportJob"]').click();assert.equal(calls[1].options.requestId,calls[0].options.requestId);
 pending.resolve({reported:true,link,revision:9,requestId:id,scope:'preview'});await tick();
 assert.equal(b.app.state.feedbackOpen,false);assert.equal(b.document.querySelector('.su-admin-report-toast').querySelector('[role="status"]').textContent,'Reported');
 assert.equal(b.localStorage.getItem('su_saved_jobs'),initialSaved);assert.equal(b.localStorage.getItem('su_tracker'),initialTracker);
 assert(!b.requests.some(request=>request.options&&request.options.method==='POST'),'admin reporting is not sent through the legacy analytics report path');
});

test('Undo carries the acknowledged revision and owner, and keeps the same ID after a failed attempt',async()=>{
 const b=setup();const calls=[];let pending=deferred();
 b.window.SUJobModeration.mutate=(action,target,options)=>{calls.push({action,target,options});return action==='report'?Promise.resolve({reported:true,link,revision:12,requestId:id,scope:'preview'}):pending.promise;};
 await b.boot();b.openFeedback();b.overlay.querySelector('[data-act="adminReportJob"]').click();await tick();
 const toast=b.document.querySelector('.su-admin-report-toast');toast.querySelector('button').click();
 assert.equal(calls[1].action,'restore');assert.equal(calls[1].options.expectedRevision,12);assert.equal(calls[1].options.current(),true);
 pending.reject(Error('The board changed. Please refresh before trying again.'));await tick();
 assert.match(toast.textContent,/board changed/);pending=deferred();toast.querySelector('button').click();
 assert.equal(calls[2].options.requestId,calls[1].options.requestId);pending.resolve({restored:true,link,revision:13,scope:'preview'});await tick();
 assert.equal(toast.querySelector('[role="status"]').textContent,'Restored to the board');assert.equal(toast.querySelectorAll('button').length,1,'only dismiss remains');
 b.owner('different-owner');assert.equal(b.document.querySelector('.su-admin-report-toast'),null);
});

test('switching owner while a report is pending prevents stale success and stale retry UI',async()=>{
 const b=setup();const pending=deferred();let options;
 b.window.SUJobModeration.mutate=(_a,_l,value)=>{options=value;return pending.promise;};
 await b.boot();b.openFeedback();b.overlay.querySelector('[data-act="adminReportJob"]').click();
 b.owner('another-owner');assert.equal(options.current(),false);assert.equal(b.app._reportBusy,false);
 pending.resolve({reported:true,link,revision:3,requestId:id,scope:'preview'});await tick();
 assert.equal(b.document.querySelector('.su-admin-report-toast'),null);assert.equal(b.app._reportAttempt,null);
});

test('active Apply waits for its fresh check, failed navigation does not claim a return, and cancellation stays closed',async()=>{
 const b=setup();let pending=deferred(),intent;b.window.SUJobModeration.navigate=(_link,opts)=>{intent=opts;return pending.promise;};
 await b.boot();b.grid.querySelector('[data-act="openJob"]').click();b.overlay.querySelector('[data-act="detailApply"]').click();
 assert.equal(b.app.state.feedbackOpen,false);assert.equal(b.opened.length,0);assert.equal(intent.current(),true);
 pending.reject(Error('Could not check current job availability. Please try again.'));await tick();
 assert.equal(b.app.state.detailOpen,true);assert.equal(b.app.state.feedbackOpen,false);assert.match(b.document.body.textContent,/Could not check current job availability/);
 pending=deferred();b.overlay.querySelector('[data-act="detailApply"]').click();b.overlay.querySelector('[data-act="closeDetail"]').click();assert.equal(intent.current(),false);
 // The real transport rejects cancelled intents before any employer navigation.
 pending.reject(Error('This job opening was cancelled.'));await tick();assert.equal(b.app.state.feedbackOpen,false);
});

test('fresh public moderation removes active cards and details while retaining archived Saved original links',async()=>{
 const b=setup({saved:{[link]:true}});const Sync=require('../../js/sync-store.js');const store=Sync.create(b.localStorage);b.window.SUStore=store;
 let callback,removed=false;b.window.SUJobModeration.subscribe=fn=>{callback=fn;return()=>{};};b.window.SUJobModeration.filter=jobs=>removed?[]:jobs;
 await b.boot();assert.equal(b.app.jobs.length,1);assert(store.archivedSaved([]).length===1,'the current card is captured for the existing bookmark');
 b.grid.querySelector('[data-act="openJob"]').click();removed=true;callback({status:'ready',revision:1});
 assert.equal(b.app.jobs.length,0);assert.equal(b.grid.querySelectorAll('.note[data-act="openJob"]').length,0);
 b.app.setState({savedOnly:true});const archive=b.grid.querySelector('[data-act="openJob"]');assert(archive,'the bookmarked missing job remains available');archive.click();
 const original=b.overlay.querySelector('[data-act="detailArchived"]');assert(original);original.click();
 assert.equal(b.opened.at(-1)[0],link,'archived personal access keeps its original employer link');
 assert(store.view().saved[link]);
});

test('public moderation failure clears active cards and keeps an explicit retry without touching saved data',async()=>{
 const b=setup({saved:{[link]:true}});let callback;
 b.window.SUJobModeration.subscribe=fn=>{callback=fn;return()=>{};};await b.boot();const before=b.localStorage.getItem('su_saved_jobs');
 callback({status:'error',revision:0});assert.equal(b.app.jobs.length,0);assert.match(b.grid.textContent,/Could not check current job availability/);
 assert(b.grid.querySelector('[data-act="retryJobs"]'));assert.equal(b.localStorage.getItem('su_saved_jobs'),before);
});


test('Reported expires after five seconds; pending Undo pauses it, and a failure stays dismissible',async()=>{
 const b=setup();let pending=deferred();b.window.SUJobModeration.mutate=action=>action==='report'?Promise.resolve({reported:true,link,revision:5,scope:'preview'}):pending.promise;
 await b.boot();b.openFeedback();b.overlay.querySelector('[data-act="adminReportJob"]').click();await tick();
 assert(b.document.querySelector('.su-admin-report-toast'));b.runTimers(5000);assert.equal(b.document.querySelector('.su-admin-report-toast'),null);
 b.openFeedback();b.overlay.querySelector('[data-act="adminReportJob"]').click();await tick();
 const toast=b.document.querySelector('.su-admin-report-toast');toast.querySelector('button').click();b.runTimers(5000);assert.equal(b.document.querySelector('.su-admin-report-toast'),toast);
 pending.reject(Error('Please retry.'));await tick();b.runTimers(5000);assert.equal(b.document.querySelector('.su-admin-report-toast'),toast);
 toast.querySelector('[aria-label="Dismiss report confirmation"]').click();assert.equal(b.document.querySelector('.su-admin-report-toast'),null);
});

test('alternate-click active Apply links stay inside the moderated board route',async()=>{
 const b=setup();await b.boot();const href=b.grid.querySelector('a[data-act="apply"]').getAttribute('href');
 const url=new URL(href,b.location.origin);assert.equal(url.origin,b.location.origin);assert.equal(url.pathname,'/jobs.html');
 assert.equal(Buffer.from(url.searchParams.get('job'),'base64').toString(),link);
});


test('a late report cannot close or attach its error to a different feedback card',async()=>{
 for(const failed of [false,true]){
  const b=setup(),pending=deferred();b.window.SUJobModeration.mutate=()=>pending.promise;await b.boot();b.openFeedback();
  b.overlay.querySelector('[data-act="adminReportJob"]').click();b.app.setState({feedbackOpen:false});
  b.app.setState({feedbackOpen:true,feedbackLink:'https://example.com/another-job',feedbackCo:'Another company'});
  if(failed)pending.reject(Error('The earlier report could not be confirmed.'));else pending.resolve({reported:true,link,revision:1,scope:'preview'});
  await tick();assert.equal(b.app.state.feedbackOpen,true);assert.equal(b.app.state.feedbackCo,'Another company');
  assert.doesNotMatch(b.overlay.textContent,/earlier report could not/);
  if(!failed)assert.equal(b.document.querySelector('.su-admin-report-toast').querySelector('[role="status"]').textContent,'Reported');
 }
});


test('an unrelated public-index update does not revive a legacy personal hide when Discovery is unavailable',async()=>{
 const b=setup();let update;b.window.SUJobModeration.subscribe=callback=>{update=callback;return()=>{};};await b.boot();b.openFeedback();
 b.overlay.querySelector('[data-act="reportBroken"]').click();assert.equal(b.app.jobs.length,0);
 update({status:'ready',revision:1});assert.equal(b.app.jobs.length,0);
 assert.equal(JSON.parse(b.localStorage.getItem('su_reported_links'))[0],link);
});


test('a recovered moderation index retries an initially failed feed without reviving a bundled snapshot',async()=>{
 const b=setup();let update,fail=true;const ready={status:'ready',revision:0};
 b.window.SUJobModeration.subscribe=callback=>{update=callback;return()=>{};};
 b.window.SUJobModeration.refresh=async()=>{if(fail)throw Error('Availability unavailable');return ready;};
 await b.boot();assert.equal(b.app.jobs.length,0);assert.equal(b.app._loadError,true);
 fail=false;update(ready);await tick();await tick();
 assert.equal(b.app.jobs.length,1);assert.equal(b.app._loadError,false);assert.equal(b.requests.length,2,'recovery reads the live feed again');
 assert(!b.requests.some(request=>request.url.includes('jobs-data.json')));
});


test('keyboard focus pauses confirmation expiry and leaving starts a fresh five-second interval',async()=>{
 const b=setup();b.window.SUJobModeration.mutate=()=>Promise.resolve({reported:true,link,revision:4,scope:'preview'});await b.boot();b.openFeedback();
 b.overlay.querySelector('[data-act="adminReportJob"]').click();await tick();const toast=b.document.querySelector('.su-admin-report-toast'),undo=toast.querySelector('button'),dismiss=toast.querySelector('[aria-label="Dismiss report confirmation"]');
 undo.focus();b.fire('focusin',undo);b.runTimers(5000);assert.equal(b.document.querySelector('.su-admin-report-toast'),toast);assert.equal(b.document.activeElement,undo);
 dismiss.focus();b.fire('focusout',undo,{relatedTarget:dismiss});b.fire('focusin',dismiss);b.runTimers(5000);assert.equal(b.document.querySelector('.su-admin-report-toast'),toast);
 b.grid.focus();b.fire('focusout',dismiss,{relatedTarget:b.grid});assert.equal(b.document.querySelector('.su-admin-report-toast'),toast);
 b.runTimers(5000);assert.equal(b.document.querySelector('.su-admin-report-toast'),null);assert.equal(b.document.activeElement,b.grid,'expiry does not disturb the user’s new focus');
});


test('disabled-button blur restores keyboard Undo success/error focus without taking focus from a later control',async()=>{
 for(const outcome of ['success','error','moved']){
  const b=setup(),pending=deferred();b.window.SUJobModeration.mutate=action=>action==='report'?Promise.resolve({reported:true,link,revision:4,scope:'preview'}):pending.promise;
  await b.boot();b.openFeedback();b.overlay.querySelector('[data-act="adminReportJob"]').click();await tick();
  const toast=b.document.querySelector('.su-admin-report-toast'),undo=toast.querySelector('button'),dismiss=toast.querySelector('[aria-label="Dismiss report confirmation"]');
  undo.focus();b.fire('focusin',undo);undo.click();assert.equal(b.document.activeElement,b.document.body,'browser disabled-button behavior is modeled');
  if(outcome==='moved')b.grid.focus();
  if(outcome==='error')pending.reject(Error('Could not restore. Please retry.'));else pending.resolve({restored:true,link,revision:5,scope:'preview'});
  await tick();assert.equal(b.document.activeElement,outcome==='error'?undo:outcome==='moved'?b.grid:dismiss);
  if(outcome!=='moved'){b.runTimers(5000);assert.equal(b.document.querySelector('.su-admin-report-toast'),toast,'the focused result or retry remains available');}
 }
});
