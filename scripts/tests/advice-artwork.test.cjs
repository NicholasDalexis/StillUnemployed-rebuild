'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Art = require('../../js/advice-illustrations.js');
const Content = require('../../js/advice-content.js');

const appSource = fs.readFileSync(path.join(__dirname, '../../js/app.js'), 'utf8');
const bank = appSource.match(/var ADVICE_NOTES = (\[[\s\S]*?\n  \]);/);
assert(bank, 'the real advice bank must be available to the coverage check');
const baseNotes = JSON.parse(JSON.stringify(vm.runInNewContext('(' + bank[1] + ')', {}, { timeout:1000 })));
const notes = Content.apply(baseNotes);

// Run the same topic-art path as the front and detail, including the retained
// native calendar, loop, figures and exclamation marks. A generic CTA arrow
// does not count as a card's topic illustration.
function renderer(name) {
  const start = appSource.indexOf('  function ' + name + '(');
  assert(start >= 0, name + ' must exist');
  const end = appSource.indexOf('\n  function ', start + 1);
  assert(end > start, name + ' must have a bounded extraction');
  return appSource.slice(start, end);
}
const renderContext = { window:{ SUAdviceArt:Art }, esc:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') };
vm.runInNewContext(renderer('adviceGraphicHtml') + '\n' + renderer('adviceDoodleHtml') + '\n' + renderer('adviceCardHtml'), renderContext, { timeout:1000 });

test('every published advice note has topic artwork on both its front and detail', () => {
  assert(notes.length >= 24, 'the current approved bank is included');
  assert.equal(new Set(notes.map(note => note.id)).size, notes.length, 'unique advice identities');
  for (const note of notes) {
    for (const big of [false, true]) {
      const graphic = renderContext.adviceGraphicHtml(note, '#F2E14B', big) + renderContext.adviceDoodleHtml(note);
      assert.match(graphic, /<svg\b/, note.id + (big ? ' detail' : ' front'));
      assert.doesNotMatch(graphic, /<iframe\b|<img\b|<image\b|<script\b/i, note.id);
    }
  }
});

test('the three previously unillustrated notes have distinct shared topic drawings', () => {
  const ids = ['wish-list', 'volume-trap', 'keyword-stuffing'];
  const drawings = ids.map(id => Art.html(id, false));
  assert.equal(new Set(drawings).size, ids.length);
  for (const [index, id] of ids.entries()) {
    assert(Art.has(id), id);
    assert.match(drawings[index], new RegExp('data-advice-illustration="' + id + '"'));
  }
  assert.match(drawings[0], />required<.*>preferred</);
  assert.match(drawings[1], />base<.*>tailored</);
  assert.match(drawings[2], />skills skills<.*>my work</);
});

test('the approved original graphics retain their existing calendar and figure paths', () => {
  for (const id of ['no-weekends', 'board-trap', 'grad-school', 'three-years']) {
    assert.equal(Art.has(id), false, id + ' must retain its original native artwork');
  }
  const calendar = renderContext.adviceGraphicHtml(notes.find(note => note.id === 'no-weekends'), '#F2E14B', false);
  assert.equal((calendar.match(/<svg\b/g) || []).length, 3, 'only the three approved days are crossed out');
  assert.equal((calendar.match(/>M<svg/g) || []).length, 0, 'Monday is not crossed out');
  const figures = renderContext.adviceGraphicHtml(notes.find(note => note.id === 'grad-school'), '#F2E14B', false);
  assert.equal((figures.match(/<circle\b/g) || []).length, 5, 'the original five figures remain');
  assert.equal((figures.match(/<g stroke="#C2552F"/g) || []).length, 2);
  assert.equal((figures.match(/<g stroke="#2A2118"/g) || []).length, 3);
});

test('shared artwork remains decorative, responsive and independent of remote assets', () => {
  for (const id of Art.ids) {
    for (const big of [false, true]) {
      const html = Art.html(id, big);
      assert.match(html, /viewBox="0 0 200 108"/);
      assert.match(html, /aria-hidden="true" focusable="false"/);
      assert.match(html, /pointer-events:none/);
      assert.match(html, /width:100%;height:auto/);
      assert.match(html, new RegExp('max-width:' + (big ? 250 : 220) + 'px'));
      assert.doesNotMatch(html, /\b(?:href|src|on\w+)\s*=|<foreignObject\b|<script\b|<iframe\b|<image\b/i, id);
      assert.doesNotMatch(html, /\bfree\b/i, id);
    }
  }
  for (const id of ['unknown', '__proto__', 'constructor', '"><script>']) assert.equal(Art.html(id), '');
});

test('advice copy has no free-product claims, and browser consumers receive the same art catalog', () => {
  for (const note of notes) assert.doesNotMatch(JSON.stringify(note), /\bfree\b/i, note.id);
  const context = { window:{} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../js/advice-illustrations.js'), 'utf8'), context, { timeout:1000 });
  assert.deepEqual(Array.from(context.window.SUAdviceArt.ids), Art.ids);
  for (const id of Art.ids) assert.equal(context.window.SUAdviceArt.html(id, false), Art.html(id, false));
});

test('the four sales lines remain quiet optional invitations with their original identities and artwork', () => {
  for (const id of ['board-trap', 'ghosted', 'wish-list', 'resume-layout']) {
    const before = baseNotes.find(note => note.id === id);
    const after = notes.find(note => note.id === id);
    assert.equal(after.sell, 'More notes like this from The Job Hunt Recipe.');
    for(const key of ['id','g','d'])assert.equal(after[key],before[key],id + ' keeps its identity and artwork');
  }
});

test('every effective advice note is two short sentences or at most three concise bullets',()=>{
  const words=text=>String(text||'').trim().split(/\s+/).filter(Boolean).length;
  const sentences=new Intl.Segmenter('en',{granularity:'sentence'});
  for(const note of notes){
    const why=note.why;
    if(typeof why==='string'){
      assert(words(why)<=45,note.id+' remains brief');
      assert([...sentences.segment(why)].length<=2,note.id+' has at most two sentences');
    }else{
      assert(Array.isArray(why.bullets)&&why.bullets.length<=3,note.id);
      for(const bullet of why.bullets)assert(words(bullet)<=16,note.id+' concise bullet');
      assert(words([why.intro,...why.bullets,why.outro].join(' '))<=45,note.id);
    }
  }
});

test('shortening retains the qualification, date and deadline caveats',()=>{
  const note=id=>notes.find(note=>note.id===id);
  assert.match(note('wish-list').why,/required qualifications.*accepted alternatives/i);
  assert.doesNotMatch(JSON.stringify(note('wish-list')),/not mandatory|everything.*negotiable/i);
  assert.match(note('experience-internship').why,/real title and dates.*full-time experience requirement/i);
  assert.match(note('experience-honest-dates').why,/same three months do not become six months/i);
  assert.match(note('experience-graduation').why,/asks for dates, answer honestly/i);
  assert.match(note('no-weekends').why,/do not wait.*miss a deadline/i);
  assert.match(note('first-come').why,/do not assume.*arrival order/i);
  assert.match(note('canva-resume').why,/tool alone does not determine/i);
  assert.doesNotMatch(JSON.stringify(notes),/2 out of 5|gets you auto-rejected|recruiters read applications in the order/i);
});


// Exercise real modal rendering and iframe recovery with the established offline
// adapter, injecting the same public content/art modules that the page loads.
const fixturePath = path.join(__dirname, 'board-qa.test.cjs');
const fixtureSource = fs.readFileSync(fixturePath, 'utf8').replace('SUStates:require',
  "SUAdviceContent:require('../../js/advice-content.js'),SUAdviceArt:require('../../js/advice-illustrations.js'),SUStates:require");
const fixtureModule = {exports:{}};
vm.runInNewContext(fixtureSource.slice(0,fixtureSource.indexOf('\ntest('))+'\nmodule.exports={board};',{
 require:createRequire(fixturePath),module:fixtureModule,__dirname,Buffer,URL,URLSearchParams,setImmediate
},{filename:fixturePath});
const {board}=fixtureModule.exports;

test('all advice fronts contain one headline, artwork and the existing CTA without secondary copy',()=>{
 for(const note of notes){
  const front=renderContext.adviceCardHtml({...note,sub:'SECONDARY COPY MUST NOT RENDER'},'m',0,'#F2E14B');
  assert(front.includes(renderContext.esc(note.hook)),note.id+' headline');
  assert(front.includes(renderContext.esc(note.cta)),note.id+' CTA');
  assert.match(front,/<svg\b/,note.id+' artwork');
  assert.doesNotMatch(front,/SECONDARY COPY MUST NOT RENDER|note to self|2 out of 5/,note.id);
 }
});

test('graduation uses the same single headline in its front and opened note',()=>{
 const note=notes.find(note=>note.id==='experience-graduation');
 assert.equal(note.hook,'lead with your work, not your grad year');
 const b=board();b.init();b.app.setState({adviceOpen:note.id});
 assert.equal(b.overlay.textContent.split(note.hook).length-1,1);
 assert(b.overlay.textContent.includes('note to self'));
 assert(b.overlay.textContent.includes(note.why));
 assert.doesNotMatch(b.overlay.textContent,/your graduation year is not your whole story/);
 assert.equal(b.overlay.querySelectorAll('iframe').length,1);
 const art=Art.html(note.id,false);assert.match(art,/>your work</);assert.equal((art.match(/<text\b/g)||[]).length,1);
});

test('every shared illustration label explicitly retains the handwritten font token',()=>{
 for(const id of Art.ids){
  for(const label of Art.html(id,false).match(/<text\b[^>]*>/g)||[]){
   assert.match(label,/style="font-family:var\(--su-hand, Indie Flower, cursive\)"/,id);
   assert.doesNotMatch(label,/Lexend/);
  }
 }
});

test('newsletter retry stays hidden on a normal load and recovers an unresolved timeout',()=>{
 const b=board();b.init();b.app.setState({adviceOpen:'experience-graduation'});
 const wrap=b.overlay.querySelector('.su-newsletter-frame'),frame=wrap.querySelector('iframe'),retry=wrap.querySelector('.su-newsletter-retry'),status=wrap.querySelector('[role="status"]');
 assert.equal(retry.hidden,true,'normal loading does not display a failure action');
 b.runTimers(8000);assert.equal(retry.hidden,false);assert.equal(status.hidden,true);assert.equal(wrap.getAttribute('aria-busy'),'false');
 b.fire('load',frame);assert.equal(retry.hidden,true,'a late load removes timeout recovery');
 assert.equal(wrap.getAttribute('aria-busy'),'false');
});

test('an observed newsletter error offers a retry without closing or replacing the form',()=>{
 const b=board();b.init();b.app.setState({adviceOpen:'experience-graduation'});
 const wrap=b.overlay.querySelector('.su-newsletter-frame'),frame=wrap.querySelector('iframe'),retry=wrap.querySelector('.su-newsletter-retry');
 b.fire('error',frame);assert.equal(retry.hidden,false);
 b.fire('load',frame);assert.equal(retry.hidden,false,'a known error is not erased by its error-document load');
 const requested=[];Object.defineProperty(frame,'src',{set:value=>requested.push(value),get:()=>requested.at(-1)});
 retry.click();assert.equal(requested.length,1);assert.equal(requested[0],frame.getAttribute('data-src'));assert.equal(wrap.getAttribute('aria-busy'),'true');assert.equal(retry.hidden,true);
 b.fire('load',frame);assert.equal(retry.hidden,true);assert.equal(wrap.getAttribute('aria-busy'),'false');
 assert.equal(b.app.state.adviceOpen,'experience-graduation');assert.equal(b.overlay.querySelector('iframe'),frame);
 b.fireWindow('su:data-sync');assert.equal(b.overlay.querySelector('iframe'),frame);
});
