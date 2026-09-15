'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {board}=require('./helpers/board-harness.cjs');
const approved=['N01','N02','N06','N07','N08','N09','N10','N11','N12','N13','N14','N16','N18','N19','N20','N21','N22','N23','N24','N26'];
const invitation=b=>b.overlay.querySelector('[data-newsletter-id]');
function openAdvice(b){b.app.setState({adviceOpen:'no-weekends'});return invitation(b);}

test('approved invitations form complete shuffled cycles with no adjacent repeat',()=>{
 const b=board();b.init();const ids=[];
 for(let i=0;i<61;i++){
  const card=openAdvice(b);ids.push(card.getAttribute('data-newsletter-id'));
  assert.equal(card.getAttribute('data-newsletter-revision'),ids.at(-1)==='N16'?'2':'1');
  if(ids.at(-1)==='N16')assert.match(card.textContent,/Get the job, then unsub\./);
  b.app.setState({adviceOpen:null});
 }
 for(let i=0;i<60;i+=20)assert.deepEqual(ids.slice(i,i+20).sort(),approved.slice().sort());
 for(let i=1;i<ids.length;i++)assert.notEqual(ids[i],ids[i-1]);
 assert.equal(b.storageOps.some(op=>/newsletter.*cycle/.test(op.key)),false,'copy cycling writes no browser storage');
});

test('one shared invitation cycle advances only on eligible detail and advice openings',()=>{
 const b=board();b.init();
 b.grid.querySelector('[data-act="openJob"]').click();assert.equal(invitation(b),null,'first detail keeps the existing signup cadence');
 b.app.setState({detailOpen:false,detailLink:null});
 b.grid.querySelector('[data-act="openJob"]').click();const first=invitation(b).getAttribute('data-newsletter-id');
 b.app.setState({detailOpen:false,detailLink:null});
 const rest=[];
 for(let i=0;i<19;i++){rest.push(openAdvice(b).getAttribute('data-newsletter-id'));b.app.setState({adviceOpen:null});}
 assert.equal(new Set([first,...rest]).size,20,'detail and advice share the approved pool');
});

test('reading, save synchronization and signup retries retain the chosen invitation and live form',()=>{
 const b=board();b.init();const card=openAdvice(b),id=card.getAttribute('data-newsletter-id'),text=card.textContent,frame=card.querySelector('iframe');
 const retry=card.querySelector('.su-newsletter-retry');frame.focus();
 b.fireWindow('su:data-sync');assert.equal(invitation(b),card);assert.equal(b.document.activeElement,frame);
 b.fire('error',frame);retry.click();b.fire('load',frame);
 assert.equal(invitation(b),card);assert.equal(card.querySelector('iframe'),frame);
 assert.equal(card.getAttribute('data-newsletter-id'),id);assert.equal(card.textContent,text);
 b.app.setState({look:'beauty'});assert.equal(invitation(b).getAttribute('data-newsletter-id'),id);assert.equal(invitation(b).textContent,text);
});

test('detail and advice forms identify the newsletter in readable footer chunks after the form',()=>{
 const b=board();b.init();openAdvice(b);
 function check(){
  const card=invitation(b),footer=card.querySelector('.su-newsletter-footer'),frame=card.querySelector('.su-newsletter-frame');
  assert.deepEqual(Array.from(footer.children,n=>n.textContent),['Every week.','easy unsub.','newsletter - Nic']);
  assert(card.children.indexOf(footer)>card.children.indexOf(frame));
 }
 check();b.app.setState({adviceOpen:null});
 b.grid.querySelector('[data-act="openJob"]').click();b.app.setState({detailOpen:false,detailLink:null});b.grid.querySelector('[data-act="openJob"]').click();check();
});
