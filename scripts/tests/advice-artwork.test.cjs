'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
const renderContext = { window:{ SUAdviceArt:Art } };
vm.runInNewContext(renderer('adviceGraphicHtml') + '\n' + renderer('adviceDoodleHtml'), renderContext, { timeout:1000 });

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

test('the four sales lines become a quiet optional invitation without changing their advice or identities', () => {
  for (const id of ['board-trap', 'ghosted', 'wish-list', 'resume-layout']) {
    const before = baseNotes.find(note => note.id === id);
    const after = notes.find(note => note.id === id);
    assert.equal(after.sell, 'More notes like this from The Job Hunt Recipe.');
    const { sell:_beforeSell, ...originalAdvice } = before;
    const { sell:_afterSell, ...currentAdvice } = after;
    assert.deepEqual(currentAdvice, originalAdvice, id + ' keeps its original advice and routing fields');
  }
});
