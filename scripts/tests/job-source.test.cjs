'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Source=require('../../netlify/functions/lib/job-source.cjs');
const aliases=require('./fixtures/job-aliases.cjs');

test('generator re-exports the exact shared parser and identity helpers used by runtime functions',async()=>{
  const generator=await import('../gen-share.mjs');
  for(const name of ['parseCSV','rowsToJobs','shareEntries','loadJobs'])assert.equal(generator[name],Source[name]);
});
test('shared source helpers preserve observed SiriusXM share identity and every approved alias',()=>{
  const link='https://careers.siriusxm.com/jobs/17579?lang=en-us';
  assert.deepEqual(Source.shareEntries({link}),[{link,slug:'1rc6eq5t9w8p3'}]);
  for(const pair of aliases){
    const job={link:pair.links[0],_aliases:pair.links.concat(pair.links)};
    const entries=Source.shareEntries(job);assert.deepEqual(entries.map(e=>e.link),pair.links);assert.equal(new Set(entries.map(e=>e.slug)).size,pair.links.length);
  }
});
test('lightweight source module loads without the canvas or executable generator dependency graph',()=>{
  const paths=Object.keys(require.cache);
  assert(!paths.some(file=>/node_modules\/@napi-rs\/canvas/.test(file)));
  const fs=require('node:fs');
  for(const file of ['job-source.cjs','job-discovery.cjs','analytics-service.cjs','job-moderation.mjs']){
    const source=fs.readFileSync(require.resolve('../../netlify/functions/lib/'+file),'utf8');
    assert.doesNotMatch(source,/import\([^)]*gen-share|require\([^)]*gen-share|@napi-rs\/canvas/);
  }
});
