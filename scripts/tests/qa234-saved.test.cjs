'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const Store=require('../../js/sync-store.js'),Internships=require('../../js/internships.js'),Pay=require('../../js/pay-display.js');
const fixturePath=path.join(__dirname,'board-qa.test.cjs'),fixtureSource=fs.readFileSync(fixturePath,'utf8');
let prefix=fixtureSource.slice(0,fixtureSource.indexOf('\ntest('));
if(process.env.SU234_APP_SOURCE)prefix=prefix.replace("path.join(__dirname,'../../js/app.js')",JSON.stringify(path.resolve(process.env.SU234_APP_SOURCE)));
prefix=prefix.replace("look='original',response", "look='original',internships=false,response").replace("pathname:'/jobs.html'","pathname:internships?'/internships.html':'/jobs.html'").replace('return{app:window.SUApp','return{advance:ms=>{now+=ms;},app:window.SUApp');
const moduleFixture={exports:{}};vm.runInNewContext(prefix+'\nmodule.exports={board,job,row,csv};',{module:moduleFixture,require:createRequire(fixturePath),__dirname,Buffer,URL,URLSearchParams,setImmediate},{filename:fixturePath});
const {board,job,row,csv}=moduleFixture.exports,tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(options={}){const b=board(options);b.window.SUInternships=Internships;b.window.SUPayDisplay=Pay;b.window.SUStore=Store.create(b.localStorage);return b;}
function card(b,link){return b.grid.querySelectorAll('[data-act="openJob"]').find(el=>el.getAttribute('data-link')===link);}
function showSaved(b){b.app.setState({savedOnly:true,q:'',cat:'all',ws:'Any',pr:'Any',st:'all',fr:'Any'});}
function detail(b,link){const c=card(b,link);assert(c,'saved card exists');c.click();return b.overlay.querySelector('[role="dialog"]');}

test('saved card and complete detail survive authoritative catalog disappearance without a closure claim',async()=>{
 let rows=[row()];const b=setup({response:{ok:true,text:async()=>csv(rows)}});await b.boot();b.app.toggleSave(job().link);showSaved(b);
 let dialog=detail(b,job().link);assert.match(dialog.textContent,/Designer/);rows=[];b.advance(61000);b.fireWindow('focus');await tick();await tick();
 assert.equal(b.app.jobs.length,0);assert.equal(b.app.isSaved(job().link),true);assert.equal(b.app.state.detailOpen,true);
 dialog=b.overlay.querySelector('[role="dialog"]');assert.match(dialog.textContent,/Design the product/);assert.match(dialog.textContent,/saved copy stays here/i);assert.doesNotMatch(dialog.textContent,/No longer available/);
 assert.equal(dialog.querySelector('[data-act="detailApply"]'),null);dialog.querySelector('[data-act="detailShare"]').click();await tick();assert.equal(b.shared.at(-1).url,job().link,'archived sharing sends only the original employer URL, not a missing live share route');const original=dialog.querySelector('[data-act="detailArchived"]');assert(original);original.click();assert.equal(b.opened.at(-1)[0],job().link);assert.equal(b.app.state.feedbackOpen,false);
 b.app.setState({detailOpen:false,savedOnly:false});assert.equal(card(b,job().link),undefined,'saved copy never returns to the normal catalog');
});

test('legacy boolean saved links backfill exact-Dead rows only into Saved with a closure stamp',async()=>{
 const dead=row({'Active/Dead':'Dead'}),live=row({Company:'Current',Link:'https://example.com/live'});const b=setup({saved:{[dead.Link]:true},response:{ok:true,text:async()=>csv([dead,live])}});await b.boot();
 assert.equal(b.app.jobs.length,1);assert.equal(b.app.jobs[0].co,'Current');assert.equal(card(b,dead.Link),undefined);
 assert.equal(b.window.SUStore.view().savedJobs[dead.Link].role,'Designer');showSaved(b);assert.match(card(b,dead.Link).textContent,/No longer available/);
 const dialog=detail(b,dead.Link);assert.match(dialog.textContent,/No longer available/);assert.match(dialog.textContent,/Design the product/);assert.equal(dialog.querySelector('[data-act="detailApply"]'),null);
});

test('editorial removal, unknown absence and failure never manufacture a confirmed closure',async()=>{
 for(const status of ['Inactive','No','dead pending review']){
  const saved=row({'Active/Dead':status});const b=setup({saved:{[saved.Link]:true},response:{ok:true,text:async()=>csv([saved])}});await b.boot();showSaved(b);assert.doesNotMatch(card(b,saved.Link).textContent,/No longer available/);assert.equal(b.app.jobs.length,0);
 }
 let fail=false;const b=setup({response:{ok:true,text:async()=>{if(fail)throw Error('offline');return csv([row()]);}}});await b.boot();b.app.toggleSave(job().link);fail=true;b.advance(61000);b.fireWindow('focus');await tick();await tick();showSaved(b);
 assert.equal(b.app._loadError,true);assert.doesNotMatch(card(b,job().link).textContent,/No longer available/);assert.equal(b.app.jobs.length,0);
});

test('cross-board Saved copies stay unified but do not falsely claim retirement or enter the ordinary feed',()=>{
 const b=setup(),intern=job({co:'Internship Example',role:'Design Intern',link:'https://example.com/intern',internship:true,payStatus:'paid',payBasis:'hour',pay:'$25/hour'});
 b.window.SUStore.saveSaved({[intern.link]:true},intern);b.init();assert.equal(card(b,intern.link),undefined);showSaved(b);
 const saved=card(b,intern.link);assert(saved);assert.match(saved.textContent,/Saved internship/);assert.doesNotMatch(saved.textContent,/Off this board|No longer available/);
 const dialog=detail(b,intern.link);assert.match(dialog.textContent,/Saved from the internships board/);assert.equal(dialog.querySelector('[data-act="detailApply"]'),null);
});

test('background Saved updates and same-content data sync preserve the open newsletter iframe',()=>{
 const b=setup();b.init();b.app._detailRecipe=true;b.app._detailRecipeCopy='A stable invitation';b.app.setState({detailOpen:true,detailLink:job().link});
 const dialog=b.overlay.querySelector('[role="dialog"]'),iframe=dialog.querySelector('iframe');assert(iframe);b.window.SUStore.saveSaved({[job().link]:true},job());b.fireWindow('su:data-sync');
 assert.equal(b.overlay.querySelector('[role="dialog"]'),dialog);assert.equal(dialog.querySelector('iframe'),iframe);assert.equal(b.app.isSaved(job().link),true);
 b.fireWindow('su:data-sync');assert.equal(dialog.querySelector('iframe'),iframe);assert.equal(iframe.isConnected,true);
 b.app.setState({detailOpen:false});assert.equal(iframe.isConnected,false,'closing still destroys the external frame');
});

test('snapshot persistence failure does not convert a healthy official feed into a load failure',async()=>{
 const b=setup({response:{ok:true,text:async()=>csv([row()])}});b.window.SUStore.captureSaved=()=>{throw Error('Quota');};await b.boot();assert.equal(b.app._loadError,false);assert.equal(b.app.jobs.length,1);assert.match(b.grid.textContent,/saved links are safe/);
});


test('internship default rows diversify papers while filters and Recently added leave each paper attached to its posting',()=>{
 const b=setup({internships:true}),jobs=Array.from({length:12},(_,i)=>job({link:'https://example.com/internship/'+i,internship:true,payStatus:i<2?'unpaid':'paid',payBasis:'hour',pay:i<2?'Unpaid':'$25/hour',applicationStatus:'open',verification:{status:'open',checkedAt:'2026-09-07T15:00:00Z'}}));b.init(jobs);
 assert.equal(b.app.internships,true);assert.deepEqual(Array.from(b.app.computeShown().shown.slice(0,3),Internships.cardSurface),['high','mid','low']);const colors=new Map(jobs.map(j=>[j.link,Internships.cardSurface(j)]));
 b.app.setState({pr:'Paid',fr:'Recently added'});assert.equal(b.app.computeShown().shown.length,10);for(const j of b.app.computeShown().shown)assert.equal(Internships.cardSurface(j),colors.get(j.link));
 b.app.updateJobs(jobs.slice().reverse());for(const j of b.app.computeShown().shown)assert.equal(Internships.cardSurface(j),colors.get(j.link));
});

test('saved snapshots and an open archived detail do not cross an account switch',()=>{
 const b=setup(),store=b.window.SUStore;store.activate('alice');store.saveSaved({[job().link]:true},job());b.init([]);showSaved(b);detail(b,job().link);
 store.activate('bob');b.fireWindow('su:data-sync');assert.equal(b.app.isSaved(job().link),false);assert.equal(card(b,job().link),undefined);assert.equal(b.overlay.querySelector('[role="dialog"]'),null);assert.doesNotMatch(b.overlay.textContent,/Designer/);assert.equal(b.app.state.detailOpen,false);store.saveSaved({[job().link]:true},job());b.fireWindow('su:data-sync');assert.equal(b.overlay.querySelector('[role="dialog"]'),null,'a later new-owner save cannot resurrect the prior detail');
});

test('a board render projects the saved catalog a bounded number of times as the saved list grows',()=>{
 const b=setup(),jobs=Array.from({length:40},(_,i)=>job({link:'https://example.com/saved/'+i}));
 b.window.SUStore.saveSaved(Object.fromEntries(jobs.map(j=>[j.link,true])));b.window.SUStore.captureSaved(jobs);b.init([job()]);
 const project=b.app.catalogJobs;let calls=0;b.app.catalogJobs=function(){calls++;return project.apply(this,arguments);};b.app.render();
 assert(calls<=3,'projecting every saved snapshot once per saved role repeats storage parsing and identity work: '+calls);
});
