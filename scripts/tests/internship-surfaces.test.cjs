'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const I=require('../../js/internships.js');
const rows=()=>Array.from({length:40},(_,i)=>({link:'https://example.com/internships/'+i,pay:'$20/hour',payStatus:'paid'}));
test('full internship catalog gets mixed first-row papers and the weighted 60/25/15 distribution without reordering',()=>{
 const jobs=rows(),before=JSON.stringify(jobs);I.setSurfaceCatalog(jobs);
 assert.deepEqual(jobs.slice(0,3).map(I.cardSurface),['high','mid','low']);
 assert.deepEqual(jobs.map(I.cardSurface).reduce((a,s)=>(a[s]++,a),{high:0,mid:0,low:0}),{high:24,mid:10,low:6});
 assert.equal(JSON.stringify(jobs),before);
});
test('same-membership rerenders, aliases and changed pay keep a card paper through alternate sorts',()=>{
 const jobs=rows();I.setSurfaceCatalog(jobs);const original=new Map(jobs.map(j=>[j.link,I.cardSurface(j)]));
 I.setSurfaceCatalog(jobs.slice().reverse());
 for(const job of jobs){assert.equal(I.cardSurface(job),original.get(job.link));assert.equal(I.cardSurface({...job,link:job.link+'?utm_source=saved',pay:'Unpaid',payStatus:'unpaid'}),original.get(job.link));}
 const filtered=jobs.filter((_,i)=>i%2);assert.deepEqual(filtered.map(I.cardSurface),filtered.map(j=>original.get(j.link)));
});
