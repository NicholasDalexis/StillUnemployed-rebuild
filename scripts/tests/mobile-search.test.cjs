const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const fixturePath=path.join(__dirname,'board-qa.test.cjs'),source=fs.readFileSync(fixturePath,'utf8'),mod={exports:{}};
vm.runInNewContext(source.slice(0,source.indexOf('\ntest('))+'\nmodule.exports={board,job};',{require:createRequire(fixturePath),module:mod,__dirname,Buffer,URL,URLSearchParams,setImmediate});
const {board,job}=mod.exports;
test('search result updates keep the exact native input and focus attached',()=>{
 const b=board();b.init([job({co:'Alpha'}),job({co:'Beta',link:'https://example.com/beta'})]);
 const input=b.document.getElementById('su-search');input.focus();b.app.state.q='Alpha';b.app.render(true);
 assert.equal(b.document.getElementById('su-search'),input);assert(input.isConnected);assert.equal(b.document.activeElement,input);
 assert.equal(b.document.querySelectorAll('[data-act="openJob"]').length,1);
 b.app.state.q='no match';b.app.render(true);assert.equal(b.document.querySelectorAll('[data-act="openJob"]').length,0);
 b.app.state.q='';b.app.render(true);assert.equal(b.document.querySelectorAll('[data-act="openJob"]').length,2);assert.equal(b.document.getElementById('su-search'),input);
});
test('employer spacing normalizes company names once per pass, not per candidate',()=>{
 const X=require('../../js/board-experience.js');let reads=0;
 const jobs=Array.from({length:400},(_,i)=>({get co(){reads++;return 'Employer '+(i%40)},link:String(i)}));
 const result=X.spaced(jobs);assert.equal(new Set(result).size,400);assert(reads<=800,'normalization should stay linear across the optional fallback');
 result.forEach((j,i)=>assert(!result.slice(Math.max(0,i-4),i).some(prior=>prior.co===j.co)));
});

const catalog = () => Array.from({length:40},(_,i)=>job({co:'Company '+i,role:i%2?'Designer':'Copywriter',link:'https://example.com/job/'+i}));
const links = b => Array.from(b.document.querySelectorAll('[data-act="openJob"]'),n=>n.getAttribute('data-link'));
const finishSearch = b => {for(let i=0;i<12;i++)b.runTimers(32);};
test('large search yields, then preserves every result, order and displayed position',()=>{
 const b=board();b.init(catalog());b.app.state.q='design';b.app.render(true);
 const expected=Array.from(b.app.computeShown().shown,j=>j.link);
 assert(links(b).length<expected.length,'a broad query must yield before generating all cards');
 assert.equal(b.document.getElementById('su-search-results').getAttribute('aria-busy'),'true');
 finishSearch(b);assert.deepEqual(links(b),expected);
 assert.equal(b.document.getElementById('su-search-results').getAttribute('aria-busy'),null);
 Array.from(b.app.computeShown().shown).forEach((j,i)=>assert.equal(j._pos,i));
});
test('another letter cancels unfinished results, including an empty subsequent search',()=>{
 const b=board();b.init(catalog());b.app.render(true);const input=b.document.getElementById('su-search');
 input.value='not-a-match';b.fire('input',input);const before=links(b);
 finishSearch(b);assert.deepEqual(links(b),before,'cancelled batches cannot append stale jobs');
 b.runTimers(240);assert.equal(links(b).length,0);finishSearch(b);assert.equal(links(b).length,0);
 assert.equal(b.document.getElementById('su-search-results').getAttribute('aria-busy'),null);
});
test('catalog replacement invalidates queued cards from the previous owner/catalog',()=>{
 const b=board();b.init(catalog());b.app.render(true);
 b.app.jobs=[job({co:'New catalog',link:'https://example.com/new'})];b.app.render();
 finishSearch(b);assert.deepEqual(links(b),['https://example.com/new']);
});
