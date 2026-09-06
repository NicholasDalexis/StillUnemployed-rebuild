const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');

// Reuse the existing offline DOM adapter without registering its test cases a
// second time. Actual browser hit-testing remains the visual regression check.
const fixturePath=path.join(__dirname,'board-qa.test.cjs');
const fixtureSource=fs.readFileSync(fixturePath,'utf8');
const firstTest=fixtureSource.indexOf('\ntest(');
assert(firstTest>0,'board QA adapter is defined before its test cases');
const fixtureModule={exports:{}};
vm.runInNewContext(fixtureSource.slice(0,firstTest)+'\nmodule.exports={board,job};',{
  require:createRequire(fixturePath),module:fixtureModule,__dirname,
  Buffer,URL,URLSearchParams,setImmediate
},{filename:fixturePath});
const {board,job}=fixtureModule.exports;

test('founder card stays above the transparent navigation and opens its original story',()=>{
  const b=board();
  b.init(Array.from({length:20},(_,i)=>job({link:'https://example.com/founder-test/'+i})));
  const trigger=b.grid.querySelector('.aboutcard');
  const nav=b.grid.querySelector('.su-main-nav');
  assert(trigger && nav);
  assert.equal(trigger.getAttribute('role'),'button');
  assert.equal(trigger.getAttribute('aria-label'),'About Nic');
  assert(Number(trigger.style.zIndex)>Number(nav.style.zIndex||0),
    'the later full-width nav must not intercept the founder card');
  const adviceBefore=b.grid.querySelectorAll('[data-act="openAdvice"]').map(el=>el.textContent);
  assert(adviceBefore.length>0,'fixture includes the existing advice cards');
  const gridWrites=b.grid.writes;
  trigger.focus();trigger.click();
  const dialog=b.overlay.querySelector('[role="dialog"]');
  assert(dialog);
  assert.equal(dialog.getAttribute('aria-label'),'About Nic');
  assert.match(dialog.textContent,/Hey, I'm Nic\. I built this\./);
  assert.match(dialog.textContent,/1,500 applications/);
  assert.match(dialog.textContent,/Seven months later/);
  assert.match(dialog.textContent,/Content Specialist at Instagram/);
  assert(dialog.querySelector('img[src="assets/home-founder-nic.jpg"]'));
  assert(dialog.querySelector('a[href="https://NicholasAlexis.com"]'));
  assert.equal(b.grid.inert,true);
  b.overlay.querySelector('[data-act="closeModal"]').click();
  assert.equal(b.overlay.querySelector('[role="dialog"]'),null);
  assert.equal(b.grid.inert,false);
  assert.equal(b.document.activeElement,trigger);
  assert.equal(b.grid.writes,gridWrites,'opening and closing founder does not rebuild the feed');
  assert.deepEqual(b.grid.querySelectorAll('[data-act="openAdvice"]').map(el=>el.textContent),adviceBefore);
});

test('founder story opens by keyboard and Escape returns focus to the same card',()=>{
  const b=board();b.init();
  const trigger=b.grid.querySelector('.aboutcard');
  trigger.focus();
  b.fire('keydown',trigger,{key:'Enter'});
  assert(b.overlay.querySelector('[role="dialog"]'));
  b.fire('keydown',b.document.activeElement,{key:'Escape'});
  assert.equal(b.overlay.querySelector('[role="dialog"]'),null);
  assert.equal(b.document.activeElement,trigger);
});
