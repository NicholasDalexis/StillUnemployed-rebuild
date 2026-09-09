const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
function fixture(file,exports){const name=path.join(__dirname,file),source=fs.readFileSync(name,'utf8'),mod={exports:{}};vm.runInNewContext(source.slice(0,source.indexOf('\ntest('))+'\nmodule.exports={'+exports+'};',{require:createRequire(name),module:mod,__dirname,Buffer,URL,URLSearchParams,setImmediate,Response,AbortController},{filename:name});return mod.exports;}
const {fixture:transport}=fixture('job-moderation-browser.test.cjs','fixture');
const {setup}=fixture('job-moderation-ui.test.cjs','setup');
const link='https://example.com/job',recordId='a'.repeat(64),id='11111111-1111-4111-8111-111111111111';
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const record=(overrides={})=>({id:recordId,link,removed:true,revision:2,keys:['url:'+link],slugs:[],metadata:{co:'<img src=x onerror=evil()>',role:'Designer & editor',private:'Must not project'},...overrides});
const admin=(overrides={})=>({schemaVersion:1,revision:9,scope:'preview',records:[record(),record({id:'b'.repeat(64),removed:false})],history:[{private:'Not projected'}],checkedAt:new Date().toISOString(),...overrides});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const projection=(overrides={})=>({scope:'preview',revision:9,records:[{id:recordId,link,co:'<img src=x onerror=evil()>',role:'Designer & editor',revision:2,removed:true}],...overrides});
function board(){const b=setup();b.window.SUJobModeration.admin=async()=>projection();return b;}

test('admin GET refreshes owner token, is no-store, and projects only removed public label fields',async()=>{
 const f=transport({handler:()=>response(admin())});const result=await f.module.admin();
 const call=f.calls.find(c=>c.url);assert.equal(call.url,'/api/job-moderation/admin');assert.equal(call.options.method,'GET');assert.equal(call.options.cache,'no-store');assert.equal(call.options.headers.Authorization,'Bearer synthetic-only');assert.equal(f.calls[0].tokenForce,true);
 assert.equal(result.records.length,1);assert.deepEqual(Object.keys(result.records[0]).sort(),['co','id','link','removed','revision','role']);assert.equal(result.history,undefined);assert.equal(result.records[0].metadata,undefined);
});
test('admin denies guests, local service absence, mismatched scope and malformed records',async()=>{
 const guest=transport();guest.root.SUAuth.qaAdmin=()=>false;await assert.rejects(guest.module.admin(),/Account changed/);assert.equal(guest.calls.length,0);
 const local=transport({host:'localhost'});await assert.rejects(local.module.admin(),/local static/);assert.equal(local.calls.length,0);
 for(const data of [admin({scope:'production'}),admin({records:[record({id:'invalid'})]}),admin({records:[record(),record()]}),admin({records:[record({link:'javascript:alert(1)'})]})]){const f=transport({handler:()=>response(data)});await assert.rejects(f.module.admin(),/verify reported/);}
 const denied=transport({handler:()=>response({error:'private diagnostics'},403)});await assert.rejects(denied.module.admin(),/cannot view/);
});
test('an owner change during token refresh or response read cannot return a private admin list',async()=>{
 let current=true,token;const f=transport();f.root.SUAuth.getToken=()=>new Promise(r=>token=r);const work=f.module.admin({current:()=>current});await tick();current=false;token('old-token');await assert.rejects(work,/Account changed/);assert.equal(f.calls.filter(c=>c.url).length,0);
 current=true;const pending=deferred(),g=transport({handler:()=>pending.promise});const read=g.module.admin({current:()=>current});await tick();current=false;pending.resolve(response(admin()));await assert.rejects(read,/Account changed/);
});
test('persistent reported menu escapes source labels and restores using GLOBAL revision, retaining Saved and Tracker',async()=>{
 const b=board();const calls=[];b.window.SUJobModeration.mutate=async(a,l,o)=>{calls.push({a,l,o});return{restored:true,revision:10};};await b.boot();assert(b.document.getElementById('board').querySelector('[data-act="openReportedJobs"]'));
 b.app.openReportedJobs();await tick();const dialog=b.overlay.querySelector('[role="dialog"]');assert.equal(dialog.getAttribute('aria-label'),'Reported jobs');assert(dialog.textContent.includes('<img src=x onerror=evil()>'));assert.equal(dialog.querySelector('img'),null);
 const saved=b.localStorage.getItem('su_saved_jobs'),tracker=b.localStorage.getItem('su_tracker');dialog.querySelector('[data-act="restoreReportedJob"]').click();await tick();assert.equal(calls[0].o.expectedRevision,9,'global revision, not record revision2');assert.equal(calls[0].a,'restore');assert.equal(calls[0].l,link);assert.equal(b.app._reportedPanel.data.records.length,0);assert.match(b.overlay.textContent,/Report cleared/);assert.equal(b.localStorage.getItem('su_saved_jobs'),saved);assert.equal(b.localStorage.getItem('su_tracker'),tracker);
 b.app.closeReportedJobs();assert.equal(b.overlay.querySelector('[role="dialog"]'),null);b.admin(false);b.app.render();assert.equal(b.document.getElementById('board').querySelector('[data-act="openReportedJobs"]'),null);
});
test('ambiguous restore retry retains ID/revision and a409 requires a fresh list before a new explicit attempt',async()=>{
 const b=board(),calls=[];let pending=deferred();b.window.SUJobModeration.mutate=(a,l,o)=>{calls.push(o);return pending.promise;};await b.boot();b.app.openReportedJobs();await tick();b.app.restoreReportedJob(recordId);pending.reject(Error('Retry this change'));await tick();pending=deferred();b.app.restoreReportedJob(recordId);assert.equal(calls[1].requestId,calls[0].requestId);assert.equal(calls[1].expectedRevision,9);
 const conflict=Error('Board changed. Refresh.');conflict.status=409;pending.reject(conflict);await tick();assert.equal(b.app._reportedPanel.stale,true);b.app.restoreReportedJob(recordId);assert.equal(calls.length,2);
 b.window.SUJobModeration.admin=async()=>projection({revision:15});await b.app.loadReportedJobs();await tick();b.window.crypto.randomUUID=()=>id;pending=deferred();b.app.restoreReportedJob(recordId);assert.equal(calls[2].expectedRevision,15);assert.equal(calls[2].requestId,id);pending.resolve({revision:16});await tick();
});
test('late list/restore completions are discarded after close or account change, without resurrection',async()=>{
 const b=board(),load=deferred();b.window.SUJobModeration.admin=()=>load.promise;await b.boot();b.app.openReportedJobs();b.owner('other-owner');load.resolve(projection());await tick();assert.equal(b.app._reportedPanel,null);assert.equal(b.overlay.querySelector('[role="dialog"]'),null);
 b.window.SUJobModeration.admin=async()=>projection();const pending=deferred();let options;b.window.SUJobModeration.mutate=(_a,_l,o)=>{options=o;return pending.promise;};b.app.openReportedJobs();await tick();b.app.restoreReportedJob(recordId);b.app.closeReportedJobs();assert.equal(options.current(),false);pending.resolve({revision:10});await tick();assert.equal(b.overlay.querySelector('[role="dialog"]'),null);assert.equal(b.app._reportedPanel,null);
});
test('list failures stay retryable, production disables restore and Escape clears private panel state',async()=>{
 const b=board();b.window.SUJobModeration.admin=async()=>{throw Error('Could not load reported jobs. Please retry.');};await b.boot();b.app.openReportedJobs();await tick();assert.match(b.overlay.textContent,/Could not load/);assert(b.overlay.querySelector('[data-act="refreshReportedJobs"]'));
 b.window.SUJobModeration.admin=async()=>projection({scope:'production'});b.app.loadReportedJobs();await tick();assert.equal(b.overlay.querySelector('[data-act="restoreReportedJob"]').disabled,true);b.app.restoreReportedJob(recordId);assert.equal(b.app._reportedPanel.busy,null);
 b.fire('keydown',b.document.activeElement,{key:'Escape'});assert.equal(b.app._reportedPanel,null);
});
