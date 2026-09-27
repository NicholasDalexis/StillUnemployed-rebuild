const {test}=require('node:test'),assert=require('node:assert/strict');
const X=require('../../js/board-experience.js');
const {board,job}=require('./helpers/board-harness.cjs');
const jobs=[job({co:'Local Studio',pay:'$60K–70K',added:'2026-09-20',link:'https://example.com/low'}),job({co:'Spotify',pay:'$80K–99K',added:'2026-09-21',link:'https://example.com/mid'}),job({co:'Google',pay:'$100K–120K',added:'2026-09-22',link:'https://example.com/high'})];
function fixture(){const b=board();b.window.SUBoardExperience=X;b.window.matchMedia=()=>({matches:b.window.innerWidth>700});b.window.innerWidth=1440;b.app.init(jobs);return b;}
function links(b){return Array.from(b.app.computeShown().shown,j=>j.link.split('/').pop()).sort();}
test('desktop bands filter a union, track pay use, and reset independently of work/state/pay bounds',()=>{
 const b=fixture();assert.deepEqual(links(b),['high','low','mid']);assert.equal(b.grid.querySelector('[data-act="resetPayBands"]'),null);
 const click=band=>b.grid.querySelector('[data-act="payBand"][data-val="'+band+'"]').click();
 click('high');assert.deepEqual(links(b),['high']);assert.equal(b.grid.querySelector('[data-val="high"]').getAttribute('aria-pressed'),'true');
 click('mid');assert.deepEqual(links(b),['high','mid']);assert.equal(b.app.state.payBands,'mid,high');
 b.app.setState({ws:'Remote',salaryMin:'85000'});b.grid.querySelector('[data-act="resetPayBands"]').click();assert.equal(b.app.state.salaryMin,'85000');assert.equal(b.app.state.ws,'Remote');assert.equal(b.app.state.payBands,'');assert.deepEqual(links(b),['high','mid']);
 click('low');assert.deepEqual(links(b),[]);b.app.setState({salaryMin:''});assert.deepEqual(links(b),['low']);
 click('low');assert.deepEqual(links(b),['high','low','mid']);assert.equal(b.grid.querySelector('[data-act="resetPayBands"]'),null);
 assert(b.tracking.some(event=>event[0]==='filter'&&event[1]==='pay'));
});
test('pay bands are inert on mobile and the full reset clears them',()=>{
 const b=fixture();b.app.setState({payBands:'high'});assert.deepEqual(links(b),['high']);
 b.window.innerWidth=390;assert.deepEqual(links(b),['high','low','mid']);b.grid.querySelector('[data-act="payBand"][data-val="mid"]').click();assert.equal(b.app.state.payBands,'high');
 b.app.setState({openPanel:'filters'});b.overlay.querySelector('[data-act="clearAll"]').click();assert.equal(b.app.state.payBands,'');
});
test('Recently added retains older and undated jobs, puts valid newest dates first, and does not treat future dates as new',()=>{
 const items=jobs.concat([job({co:'Undated',link:'https://example.com/undated'}),job({co:'Future',added:'2029-01-01',link:'https://example.com/future'})]);
 const ordered=X.orderFirst(items,'Recently added',new Date('2026-09-26T16:00:00Z'));
 assert.deepEqual(ordered.slice(0,3).map(j=>j.co),['Google','Spotify','Local Studio']);assert.equal(ordered.length,items.length);assert.deepEqual(items.map(j=>j.co),['Local Studio','Spotify','Google','Undated','Future']);
});
test('Most popular means recognized brands, never applicant counts or arbitrary substrings',()=>{
 for(const co of ['Google, LLC','Spotify','Microsoft','Bubble Skincare','LVMH','Michael Kors'])assert(X.recognizedBrand({co}),co);
 for(const co of ['Google Job Recruiters','Metaphor','Appleton Studio','Not Microsoft'])assert(!X.recognizedBrand({co}),co);
 const items=jobs.concat([job({co:'Apple',link:'https://example.com/apple'})]);
 const ordered=X.orderFirst(items,'Most popular');assert(ordered.slice(0,3).every(X.recognizedBrand));assert.equal(ordered.at(-1).co,'Local Studio');assert.equal(ordered.length,items.length);
 assert.deepEqual(X.orderFirst(items,'Any'),items);
});
test('explicit sort survives visit demotions and toggling off restores ordinary feed ordering',()=>{
 const b=fixture();b.window.SUBoardExperience={...X,demotions:()=>[X.identity(jobs[2].link)]};
 b.app.setState({openPanel:'filters'});b.overlay.querySelector('[data-act="fr"][data-val="Recently added"]').click();assert.equal(b.app.computeShown().shown[0].co,'Google');assert.equal(b.app.computeShown().shown.length,3);
 b.overlay.querySelector('[data-act="fr"][data-val="Most popular"]').click();assert(b.app.computeShown().shown.slice(0,2).every(X.recognizedBrand));
 b.overlay.querySelector('[data-act="fr"][data-val="Any"]').click();assert.equal(b.app.state.fr,'Any');
});
test('band normalization accepts only the three tiers without duplicate or malformed values',()=>{
 assert.equal(X.payBands('high,bogus,mid,mid'),'mid,high');assert.equal(X.togglePayBand('mid,high','mid'),'high');assert.equal(X.togglePayBand('','unknown'),'');assert(X.payBandMatches('mid,high','mid'));assert(!X.payBandMatches('mid,high','low'));assert(X.payBandMatches('','low'));
});
