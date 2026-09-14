const {test}=require('node:test');
const assert=require('node:assert/strict');
const Heading=require('../../js/board-heading.js');

test('headline loads cycle through the five approved lines and tolerate unavailable storage',()=>{
  let value=null;
  const storage={getItem:()=>value,setItem:(_key,next)=>{value=next;}};
  assert.deepEqual(Array.from({length:7},()=>Heading.next(storage)),[0,1,2,3,4,0,1]);
  assert.equal(Heading.next(),0);
  assert.equal(Heading.next({getItem(){throw Error('blocked');}}),0);
  value='unexpected';assert.equal(Heading.next(storage),0);
});

test('rendering a filter or save update does not change the selected headline',()=>{
  const before=Heading.render(false,'original',1);
  assert.equal(before,Heading.render(false,'original',1));
  assert(before.includes('worth fixing your '));
  assert(Heading.render(true,'original',0).includes('<h1>Internships worth the '));
  assert(Heading.render(true,'original',0).includes('screenshot.'));
});

test('dedicated boards have plain headings, while homepage choices operate inline',()=>{
  for(const internships of [true,false]){
    const dedicated=Heading.render(internships,'original',0);
    assert(!dedicated.includes('<button'));
    assert(!dedicated.includes('su-section-picker'));
    const home=Heading.render(internships,'bratt',0,true);
    assert.deepEqual([...home.matchAll(/data-board-section="([^"]+)"/g)].map(m=>m[1]),['jobs','internships']);
    assert(home.includes('data-board-section="'+(internships?'internships':'jobs')+'" aria-pressed="true"'));
    assert(!home.includes('href='));
    assert(!home.includes('Senior'));
    assert(home.includes('su-section-static'));
  }
});

test('untrusted look or section values cannot create external destinations or markup',()=>{
  assert.equal(Heading.href('https://evil.example','javascript:alert(1)'),'/jobs.html?theme=original');
  assert(!Heading.render(false,'"><img src=x onerror=alert(1)>',0).includes('<img'));
  for(const variant of [-1,5,'2',null,NaN])assert(Heading.render(false,'original',variant).includes('screenshot.'));
});
