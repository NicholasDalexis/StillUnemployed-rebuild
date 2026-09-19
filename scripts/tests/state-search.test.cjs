const {test}=require('node:test'),assert=require('node:assert/strict');
const states=require('../../js/us-states.js');
const {board,job}=require('./helpers/board-harness.cjs');
const fixtures=[
 job({co:'California office',role:'Designer',loc:'San Francisco, CA',state:'CA',link:'https://example.com/ca'}),
 job({co:'Bubble Skincare',role:'Communications Designer',loc:'New York, NY',state:'NY',link:'https://example.com/ny'}),
 job({co:'Full name',role:'Designer',loc:'Los Angeles, California',state:'California',link:'https://example.com/full'}),
 job({co:'Remote',role:'Designer',loc:'Remote, US',state:'Remote',link:'https://example.com/remote'}),
 job({co:'Restricted remote',role:'Designer',loc:'Remote',state:'NY',link:'https://example.com/restricted'}),
 job({co:'Multi',role:'Designer',loc:'San Francisco, CA; New York, NY',state:'NY',link:'https://example.com/multi'})
];
function results(b,q,st='all'){b.app.state.q=q;b.app.state.st=st;return Array.from(b.app.computeShown().shown,j=>j.link).sort();}
test('CA and California match the state filter without Skincare/Communications false positives',()=>{
 const b=board();b.init(fixtures);const expected=results(b,'','CA');
 assert.equal(expected.length,4);
 for(const q of ['CA','ca',' CA ','California','calif','design CA','CA design','design in California'])assert.deepEqual(results(b,q),expected,q);
 assert(!expected.includes('https://example.com/restricted'));
 assert.equal(results(b,'Bubble Skincare').length,1);
});
test('all 50 state codes and full names produce equivalent geographic matches',()=>{
 const b=board();b.init(states.STATES.map(s=>job({co:'Communications Skincare',role:'Designer',state:s.code,loc:'City, '+s.name,link:'https://example.com/'+s.code})));
 for(const s of states.STATES){const expected=results(b,'',s.code);assert.deepEqual(results(b,s.code),expected,s.code);assert.deepEqual(results(b,s.name),expected,s.name);}
});
test('mixed queries do not turn ordinary prepositions into states',()=>{
 assert.deepEqual(states.searchQuery('designer in CA'),{states:['CA'],text:'designer'});
 assert.deepEqual(states.searchQuery('brand or graphic'),{states:[],text:'brand or graphic'});
 assert.deepEqual(states.searchQuery('designer in person'),{states:[],text:'designer in person'});
 assert.deepEqual(states.searchQuery('design in West Virginia'),{states:['WV'],text:'design'});
});
test('Filters close control has an accessible name while retaining the shared icon',()=>{
 const b=board();b.init(fixtures);b.app.state.openPanel='filters';b.app.render();
 const close=b.document.querySelector('[data-act="toggleFilters"][aria-label="Close filters"]');
 assert(close);assert.equal(close.getAttribute('role'),'button');assert(close.querySelector('.su-close-icon'));
});

test('company phrases retain search meaning even when the employer name contains a state',()=>{
 const b=board();b.init([job({co:'The New York Times',role:'Designer',state:'CA',loc:'San Francisco, CA'})]);
 assert.equal(results(b,'New York Times').length,1);
 assert.equal(results(b,'NY').length,0);
});
