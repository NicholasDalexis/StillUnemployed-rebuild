const {test}=require('node:test'),assert=require('node:assert/strict');
const {board,tick}=require('./helpers/board-harness.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function home(){const b=board();b.document.body.className='su-home-board';b.location.pathname='/';return b;}
test('root uses the real Jobs availability gate before rendering its full catalog',async()=>{
 const b=home(),gate=deferred();let removed=false;
 b.window.SUJobModeration.refresh=()=>gate.promise;b.window.SUJobModeration.filter=jobs=>removed?[]:jobs;
 const boot=b.boot();await tick();assert.equal(b.grid.querySelectorAll('.note[data-act="openJob"]').length,0);
 removed=true;gate.resolve({status:'ready',revision:1});await boot;await tick();
 assert.equal(b.grid.querySelectorAll('.note[data-act="openJob"]').length,0);
 assert.equal(b.app.jobs.length,0);assert(b.document.body.classList.contains('su-home-board'));
});
test('root clears cards on an availability error and retains the shared retry action',async()=>{
 const b=home();let update;
 b.window.SUJobModeration.subscribe=fn=>{update=fn;return()=>{};};await b.boot();assert.equal(b.app.jobs.length,1);
 update({status:'error',revision:0});assert.equal(b.app.jobs.length,0);
 assert.equal(b.grid.querySelectorAll('.note[data-act="openJob"]').length,0);
 assert(b.grid.querySelector('[data-act="retryJobs"]'));assert.match(b.grid.textContent,/Could not check current job availability/);
});
