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
