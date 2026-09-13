const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const X=require('../../js/board-experience.js');
const identity=require('../../js/job-identity.js');
test('annual overlap includes both bounds, unbounded rates, and refuses hourly annualization',()=>{
  assert.deepEqual(X.annualRange('$80–135K'),{min:80000,max:135000});
  assert.deepEqual(X.annualRange('$80,000–$135,000 per year'),{min:80000,max:135000});
  assert.deepEqual(X.annualRange('$150K+'),{min:150000,max:Infinity});
  for(const pay of ['$29/hour+','$900 per week','$3,000/month','$500 program stipend'])assert.equal(X.annualRange(pay),null);
  assert(X.salaryMatches('$80K–135K',100000,150000));
  assert(X.salaryMatches('$80K–100K',100000,150000));
  assert(!X.salaryMatches('$45K–65K',80000,100000));
  assert(!X.salaryMatches('Not disclosed',80000,0));
  assert(X.salaryMatches('$29/hour+',0,0));
});
test('Recently added uses New York calendar day, dated fallback, and excludes future/invalid dates',()=>{
  const at=new Date('2026-09-14T02:30:00Z');assert.equal(X.dayKey(at),'2026-09-13');
  const jobs=[{added:'2026-09-12'},{added:'9/13/2026'},{added:'2026-09-14'},{added:'2026-02-30'}];
  assert.equal(X.recentDay(jobs,at),'2026-09-13');
  assert.equal(X.recentDay([jobs[0],jobs[2]],at),'2026-09-12');
  assert.equal(X.recentDay([{added:'2026-13-01'}],at),'');
  assert.equal(X.addedDay('2026-09-14T02:30:00Z'),'2026-09-13');
});
test('shuffles stay stable per activation, and employer spacing counts only jobs',()=>{
  const jobs=Array.from({length:30},(_,i)=>({co:'Company '+(i%6),link:String(i)}));
  assert.deepEqual(X.shuffled(jobs,200),X.shuffled(jobs,200));
  assert.notDeepEqual(X.shuffled(jobs,200),X.shuffled(jobs,201));
  const result=X.spaced(jobs.slice().sort((a,b)=>a.co.localeCompare(b.co)));
  result.forEach((job,i)=>assert(!result.slice(Math.max(0,i-4),i).some(j=>j.co===job.co)));
  assert.equal(new Set(result.map(j=>j.link)).size,30);
  assert.equal(X.spaced(Array.from({length:8},(_,i)=>({co:'A',link:i}))).length,8);
  assert.equal(X.employer({co:'Acme, Inc.'}),X.employer({co:'ACME'}));
});
test('senior gate is whole-word and includes abbreviations',()=>{
  for(const title of ['Senior Account Executive','Sr. Designer','Designer, Sr'])assert(X.senior(title));
  for(const title of ['Account Executive','SeniorLiving Editorial Intern','Associate Designer'])assert(!X.senior(title));
});
function browser(){
  const store=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),m};};
  let owner='guest';const root={localStorage:store(),sessionStorage:store(),SUStore:{owner:()=>owner},SUJobIdentity:identity};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../js/board-experience.js'),'utf8'),{window:root,URL,Intl,Date,Map});
  return {root,api:root.SUBoardExperience,owner:v=>owner=v};
}
test('dismiss is local, never saves, preserves canonical recent history and isolates owners',()=>{
  const f=browser(),j={link:'https://example.com/jobs/1',co:'Acme',role:'Designer'};
  f.api.record(j,'viewed');f.api.dismiss(j);
  assert.equal(f.api.history()[0].action,'dismissed');assert.equal(f.api.demotions().length,1);
  assert(![...f.root.localStorage.m.keys()].some(k=>k.includes('saved')));
  f.api.record({...j,link:j.link+'?utm_source=test'},'applied');assert.equal(f.api.history().length,1);
  assert.equal(f.api.history()[0].action,'applied');
  f.owner('other-account');assert.equal(f.api.history().length,0);assert.equal(f.api.demotions().length,0);
  f.owner('guest');f.api.clearHistory();assert.equal(f.api.history().length,0);
});
test('history is bounded, expired entries disappear, malformed storage does not stop browsing',()=>{
  const f=browser();for(let i=0;i<120;i++)f.api.record({link:'https://example.com/job/'+i},'viewed');assert.equal(f.api.history().length,100);
  f.root.localStorage.setItem('su_browse_history_guest',JSON.stringify([{link:'https://example.com/old',at:Date.now()-31*86400000}]));assert.equal(f.api.history().length,0);
  f.root.localStorage.setItem('su_browse_history_guest','broken');assert.equal(f.api.history().length,0);
});
test('real sync-store stale and suspended owners cannot read or write another account history',()=>{
  const f=browser(),S=require('../../js/sync-store.js'),store=S.create(f.root.localStorage);
  f.root.SUStore=store;store.activate('alice');
  const job={link:'https://example.com/private-role',co:'Private application'};
  assert(f.api.record(job,'applied'));assert.equal(f.api.history().length,1);
  f.root.localStorage.setItem('su_sync_owner',JSON.stringify('bob'));
  assert.equal(store.current(),false);assert.equal(f.api.history().length,0);
  assert.equal(f.api.record(job,'dismissed'),false);assert.equal(f.api.demotions().length,0);
  store.activate('bob');assert.equal(f.api.history().length,0);
});
