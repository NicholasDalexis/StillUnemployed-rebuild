const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const manifest=JSON.parse(fs.readFileSync('data/daily-selections.json'));
test('approved daily sets become public at 9 AM Eastern, including DST',async()=>{
  const {publicCollections}=await import('../../netlify/functions/lib/daily-collections-core.mjs');
  assert.deepEqual(publicCollections(manifest,new Date('2026-10-07T12:59:59Z')).map(s=>s.date),['2026-10-06','2026-10-05']);
  const at=publicCollections(manifest,new Date('2026-10-07T13:00:00Z'));
  assert.deepEqual(at.map(s=>s.date),['2026-10-07','2026-10-06','2026-10-05']);
  assert.deepEqual(at[0].jobs.map(j=>j.snapshot.co),['Roku','Tecovas','Roblox','Later']);
  assert.equal(at[0].state,'published');assert.equal(at[0].publishAt,undefined);
  assert.match(at[0].jobs[2].snapshot.tldr,/21.month|2027/i);
  assert.match(at[0].jobs[3].snapshot.tldr,/Dallas|commuting/i);
  assert.match(at[0].jobs[3].snapshot.tldr,/Spanish/i);
  const winter=structuredClone(manifest.selections[2]);winter.date='2026-11-03';winter.publishAt='2026-11-03T14:00:00Z';
  const m={schemaVersion:1,selections:[winter]};
  assert.equal(publicCollections(m,new Date('2026-11-03T13:59:59Z')).length,0);
  assert.equal(publicCollections(m,new Date('2026-11-03T14:00:00Z')).length,1);
});
test('public API ignores caller clock, omits future picks, supports only GET and fails closed',async()=>{
  const {createHandler}=await import('../../netlify/functions/lib/daily-collections-core.mjs');
  const handler=createHandler(manifest,()=>new Date('2026-10-07T12:00:00Z'));
  const response=await handler(new Request('https://example.com/api/daily-collections?now=2027-01-01'));
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const data=await response.json();assert.equal(data.nextAt,'2026-10-07T13:00:00.000Z');
  assert.equal(data.serverTime,'2026-10-07T12:00:00.000Z');
  assert.equal(JSON.stringify(data).includes('Tecovas'),false);
  assert.equal((await handler(new Request('https://example.com/api/daily-collections',{method:'POST'}))).status,405);
  assert.equal((await createHandler({schemaVersion:0})(new Request('https://example.com/api/daily-collections'))).status,503);
});
test('staged collection times and identities are validated before exposure',async()=>{
  const {validate}=await import('../../netlify/functions/lib/daily-collections-core.mjs');
  for(const at of ['2026-10-07T12:59:00Z','2026-10-08T13:00:00Z','invalid','2026-10-07T13:00:00.001Z']){
    const bad=structuredClone(manifest);bad.selections[2].publishAt=at;assert.throws(()=>validate(bad));
  }
  const draft=structuredClone(manifest);draft.selections[2].state='draft';
  const {publicCollections}=await import('../../netlify/functions/lib/daily-collections-core.mjs');
  assert.equal(publicCollections(draft,new Date('2026-10-10T20:00:00Z')).some(s=>s.date==='2026-10-07'),false);
  const {published}=await import('../gen-daily.mjs');
  assert.deepEqual(published(manifest,'2026-10-06').map(s=>s.date),['2026-10-06','2026-10-05']);
  // A committed fallback can be older than today, but must contain only due
  // public projections. Fixed October7–9 exclusions expired after publication.
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync('js/daily-selection-data.js','utf8'),context);
  const due=publicCollections(manifest,new Date());
  for(const collection of JSON.parse(JSON.stringify(context.window.SUDailySelections))){
    assert.deepEqual(collection,due.find(s=>s.date===collection.date));
  }
});
test('client refresh uses server countdown and rerenders the existing initialized board',async()=>{
  let timer,listener,rendered=0;const events=[];
  const data={schemaVersion:1,selections:[],serverTime:'2026-10-07T12:59:59Z',nextAt:'2026-10-07T13:00:00Z'};
  const window={SUApp:{_initialized:true,render(){rendered++;}},addEventListener(n,fn){listener=fn;},dispatchEvent(e){events.push(e.type);}};
  vm.runInNewContext(fs.readFileSync('js/daily-loader.js','utf8'),{window,fetch:async()=>({ok:true,json:async()=>data}),Date,Number,Event,setTimeout(fn,delay){timer={fn,delay};},clearTimeout(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(window.SUDailyLoading,false);assert.equal(window.SUDailyLoadError,false);assert.equal(rendered,1);
  assert.deepEqual(events,['su:daily-updated']);assert.equal(timer.delay,1250);assert.equal(typeof listener,'function');
  assert.equal(window.SUDailyServerNow.toISOString(),new Date(data.serverTime).toISOString());
});
