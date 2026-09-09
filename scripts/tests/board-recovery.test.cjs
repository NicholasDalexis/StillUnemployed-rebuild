const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const fixturePath=path.join(__dirname,'board-qa.test.cjs');
const source=fs.readFileSync(fixturePath,'utf8'),first=source.indexOf('\ntest(');assert(first>0);
const prefix=source.slice(0,first).replace('return{app:window.SUApp','return{advance:ms=>{now+=ms;},app:window.SUApp');
assert.notEqual(prefix,source.slice(0,first));
const fixture={exports:{}};vm.runInNewContext(prefix+'\nmodule.exports={board,job,row,csv};',{module:fixture,require:createRequire(fixturePath),__dirname,Buffer,URL,URLSearchParams,setImmediate},{filename:fixturePath});
const {board,job,row,csv}=fixture.exports;
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('retrying a failed save preserves intended state after another tab completes it',()=>{
 for(const initiallySaved of [false,true]){
  const b=board(),link=job().link;let saved=initiallySaved?{[link]:true}:{},writes=0;
  b.window.SUStore={view:()=>({saved:{...saved},tracker:[]}),saveSaved(next){writes++;if(writes===1)throw Error('quota');saved={...next};}};
  b.init();b.app.toggleSave(link);assert.equal(b.app.isSaved(link),initiallySaved);assert(b.grid.querySelector('[data-act="retrySave"]'));
  saved=initiallySaved?{}:{[link]:true};b.fireWindow('su:data-sync');
  b.grid.querySelector('[data-act="retrySave"]').click();
  assert.equal(b.app.isSaved(link),!initiallySaved,'retry cannot reverse the now-completed original intent');
  assert.equal(writes,1,'a matching persisted result needs no second write');assert.equal(b.grid.querySelector('[data-act="retrySave"]'),null);
 }
});

test('tracker persistence failure keeps feedback visible with a readable error and no false application event',()=>{
 const b=board(),events=[];let fail=true,tracker=[];
 b.window.SUStore={view:()=>({saved:{},tracker:tracker.slice()}),saveTracker(rows){if(fail)throw Error('quota');tracker=rows.slice();}};
 b.window.SUAnalytics.job=(name,link)=>events.push({name,link});b.init();
 b.app.setState({feedbackOpen:true,feedbackCo:'Example',feedbackLink:job().link});
 const dialog=b.overlay.querySelector('[role="dialog"]'),answer=dialog.querySelector('[data-act="markApplied"]');answer.focus();answer.click();
 assert.equal(b.app.state.feedbackOpen,true);assert.equal(b.overlay.querySelector('[role="dialog"]'),dialog);
 assert.match(dialog.textContent,/Could not add this to your tracker/);assert.equal(events.length,0);assert.equal(tracker.length,0);
 fail=false;answer.click();assert.equal(tracker.length,1);assert.equal(b.app.state.feedbackOpen,false);
 assert.equal(events.filter(e=>e.name==='application_reported').length,1);
});

test('feedback and About Nic omit the Google promotion while preserving optional sign-in and unanswered feedback',()=>{
 for(const signedIn of [false,true]){
  const b=board(),events=[];b.window.SUAuth={signedIn:()=>signedIn};b.window.SUAnalytics.emit=name=>events.push(name);b.init();
  b.app.setState({feedbackOpen:true,feedbackCo:'Example',feedbackLink:job().link});const dialog=b.overlay.querySelector('[role="dialog"]');
  assert.equal(dialog.querySelector('[data-act="preferredSource"]'),null);assert.doesNotMatch(dialog.textContent,/Prefer us on Google/i);
  assert(dialog.querySelector('[data-act="markApplied"]'));
  assert(dialog.querySelector('.su-feedback-account'),'the account module owns optional Google sign-in here');
  assert(dialog.querySelector('[data-act="closeFeedback"]'),'the fallback close action exists before auth renders');
  assert.equal(b.app.state.feedbackOpen,true);assert.equal(b.overlay.querySelector('[role="dialog"]'),dialog);
  b.app.setState({feedbackOpen:false,modalOpen:true});const about=b.overlay.querySelector('[role="dialog"]');
  assert(about);assert.equal(about.querySelector('[data-act="preferredSource"]'),null);assert.doesNotMatch(about.textContent,/Prefer us on Google/i);
  assert(!events.some(name=>name==='preferred_source_click'||name==='application_reported'));
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_tracker')),[]);
 }
});

test('authoritative feed refresh removes stale detail content while retaining the chosen filters',async()=>{
 let rows=[row(),row({Company:'Second',Link:'https://example.com/second'})];
 const b=board({response:{ok:true,text:async()=>csv(rows)}});await b.boot();
 b.app.setState({q:'Designer',cat:'Social',ws:'Remote',st:'all',pr:'Any',fr:'Recently added',detailOpen:true,detailLink:job().link});
 rows=[row({Company:'Second',Link:'https://example.com/second'})];b.advance(61000);b.fireWindow('focus');await tick();await tick();
 assert.equal(b.requests.length,2);assert.equal(b.app.jobs.length,1);assert.equal(b.app.jobs[0].co,'Second');assert.equal(b.app.state.detailOpen,false);
 assert.equal(b.app.state.q,'Designer');assert.equal(b.app.state.cat,'Social');assert.equal(b.app.state.ws,'Remote');assert.equal(b.app.state.fr,'Recently added');
 assert.equal(b.overlay.querySelector('[role="dialog"]'),null);
});

test('refresh failure clears unverified catalog, retains filters, and a retry reads fresh data',async()=>{
 let fail=false;const b=board({response:{ok:true,text:async()=>{if(fail)throw Error('offline');return csv([row()]);}}});await b.boot();
 b.app.setState({q:'Designer',cat:'Social'});fail=true;b.advance(61000);b.fireWindow('focus');await tick();await tick();
 assert.equal(b.app.jobs.length,0);assert.equal(b.app._loadError,true);assert.equal(b.app.state.q,'Designer');
 const retry=b.grid.querySelector('[data-act="retryJobs"]');assert(retry);fail=false;retry.click();await tick();await tick();
 assert.equal(b.requests.length,3);assert.equal(b.app.jobs.length,1);assert.equal(b.app._loadError,false);assert.equal(b.app.state.cat,'Social');
});

test('starting a background refresh preserves the live navigation and focused search until the response settles',async()=>{
 let hold=false,finish;
 const b=board({response:{ok:true,text:()=>hold?new Promise(resolve=>{finish=resolve;}):Promise.resolve(csv([row()]))}});
 await b.boot();
 const nav=b.grid.querySelector('.su-main-nav'),tracker=nav.querySelector('a[href="./tracker.html"]'),search=b.document.getElementById('su-search');
 assert(tracker);search.focus();const writes=b.grid.writes;
 hold=true;b.advance(61000);b.fireWindow('focus');
 assert.equal(b.grid.writes,writes,'refresh start cannot replace a pointer or keyboard navigation target');
 assert.equal(b.grid.querySelector('.su-main-nav'),nav);assert.equal(nav.querySelector('a[href="./tracker.html"]'),tracker);assert.equal(tracker.isConnected,true);
 assert.equal(b.document.activeElement,search);
 const progress=b.document.getElementById('su-feed-progress');assert(progress);assert.equal(progress.hidden,false);assert.equal(progress.getAttribute('role'),'status');
 await tick();assert.equal(typeof finish,'function');assert.equal(b.grid.writes,writes,'navigation remains stable throughout the pending request');
 finish(csv([row({Company:'Fresh employer'})]));await tick();await tick();
 assert.equal(b.app.jobs[0].co,'Fresh employer');assert.equal(b.app._refreshing,false);
 assert.notEqual(b.grid.querySelector('.su-main-nav'),nav,'the authoritative response may update the board');
 assert.notEqual(b.document.getElementById('su-feed-progress').getAttribute('hidden'),null);
});


test('saved snapshots remain readable after a listing leaves the feed without pretending it is still available',()=>{
 const b=board(),store=require('../../js/sync-store.js').create(b.localStorage),original=job({co:'Saved Studio',role:'Visual Designer',pay:'$83,250',link:'https://example.com/saved-snapshot'}),events=[];
 b.window.SUStore=store;b.window.SUAnalytics.job=name=>events.push(name);b.init([original]);
 b.app.toggleSave(original.link);
 assert.equal(store.view().savedJobs[original.link].co,original.co,'saving captures the card, not just a bare link');
 b.app._closedLinks=[original.link];b.app.updateJobs([]);b.app.setState({savedOnly:true});
 const card=b.grid.querySelector('.note[data-act="openJob"]');assert(card);
 assert(card.textContent.includes(original.co));assert(card.textContent.includes(original.role));assert(card.textContent.includes('No longer available'));
 assert.equal(card.querySelector('[data-act="openNote"]'),null);assert(!card.textContent.includes('Human-verified'));
 card.click();const dialog=b.overlay.querySelector('[role="dialog"]');assert(dialog);assert(dialog.textContent.includes(original.co));
 assert.equal(dialog.querySelector('[data-act="detailApply"]'),null);assert(dialog.querySelector('[data-act="detailArchived"]'));
 dialog.querySelector('[data-act="detailArchived"]').click();
 assert.equal(b.opened.at(-1)[0],original.link);assert.equal(b.app.state.feedbackOpen,false);
 assert(!events.some(name=>name==='apply_click'||name==='application_reported'));assert.equal(store.view().saved[original.link],true);
 assert.equal(store.view().savedJobs[original.link].pay,original.pay,'the retained source amount is unchanged');
});
