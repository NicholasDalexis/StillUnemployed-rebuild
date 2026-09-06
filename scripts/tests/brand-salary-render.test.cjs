const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Reuse the established offline DOM adapter without registering its test cases.
// It executes App.init/render from the real app.js; no card markup is recreated here.
const fixturePath = path.join(__dirname, 'board-qa.test.cjs');
const fixtureSource = fs.readFileSync(fixturePath, 'utf8');
const firstTest = fixtureSource.indexOf('\ntest(');
assert(firstTest > 0, 'the board adapter precedes its regression cases');
const fixtureModule = { exports:{} };
vm.runInNewContext(fixtureSource.slice(0, firstTest) + '\nmodule.exports={board,job};', {
  require:createRequire(fixturePath), module:fixtureModule, __dirname,
  Buffer, URL, URLSearchParams, setImmediate
}, { filename:fixturePath });
const { board, job } = fixtureModule.exports;
const bands = [
  { tier:'low', pay:'$70,000–$79,999' },
  { tier:'mid', pay:'$80,000–$99,999' },
  { tier:'high', pay:'$90,000–$110,000' }
];

function specimens() {
  return bands.map(({ tier, pay }) => job({ co:'Example ' + tier, pay, pick:false, link:'https://example.com/salary/' + tier }));
}

function renderedCard(b, link) {
  const card = b.grid.querySelectorAll('.note[data-link]').find(node => node.getAttribute('data-link') === link);
  assert(card, 'rendered card for ' + link);
  const apply = card.querySelector('a[data-act="apply"]');
  const stamp = card.querySelectorAll('div').find(node => /^Human[- ]verified$/i.test(node.textContent.trim()));
  assert(apply, 'the card retains its real Apply action');
  assert(stamp, 'the card retains its verification stamp');
  assert.equal(apply.getAttribute('href'), link);
  return { card, background:card.style.background, ink:card.style.color, apply:apply.style.color, stamp:stamp.style.color };
}

function colors(rendered) {
  return { background:rendered.background, ink:rendered.ink, apply:rendered.apply, stamp:rendered.stamp };
}

for (const look of ['original', 'poker', 'mermaid', 'girly', 'bratt', 'noir', 'beauty', 'chess']) {
  test('featured markers preserve low/mid/high salary surfaces and matching text in ' + look, () => {
    const b = board({ look }), jobs = specimens();b.init(jobs);
    assert.equal(b.app.state.look, look);
    const before = jobs.map((listing, i) => {
      assert.equal(b.app.payTier(listing.pay), bands[i].tier);
      const rendered = renderedCard(b, listing.link);
      assert(rendered.card.textContent.includes(listing.pay));
      assert(!rendered.card.textContent.includes('pick!'));
      return colors(rendered);
    });
    assert.equal(new Set(before.map(item => item.background)).size, 3, 'all three salary bands remain visually distinct');
    b.app.jobs.forEach(listing => { listing.pick = true; });b.app.render();
    jobs.forEach((listing, i) => {
      const rendered = renderedCard(b, listing.link);
      assert(rendered.card.textContent.includes('pick!'), 'the featured indicator still renders');
      assert(rendered.card.textContent.includes(listing.pay), 'the salary remains visible');
      assert.deepEqual(colors(rendered), before[i], bands[i].tier + ' colors must depend on pay, not featured status');
    });
    b.app.jobs.forEach(listing => { listing.pick = false; });b.app.render();
    jobs.forEach((listing, i) => assert.deepEqual(colors(renderedCard(b, listing.link)), before[i], 'removing featured status restores only the marker'));
  });
}

test('rendered original Apply text meets normal-text contrast against every salary gradient stop', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../css/brand.css'), 'utf8');
  const tokens = new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
  function resolve(value) {
    const reference = value.match(/^var\((--[\w-]+)\)$/);
    if (!reference) return value;
    assert(tokens.has(reference[1]), 'rendered style references a defined shared token');
    return tokens.get(reference[1]);
  }
  function luminance(hex) {
    assert.match(hex, /^#[a-f0-9]{6}$/i);
    const rgb = [1,3,5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }
  const b = board(), jobs = specimens();b.init(jobs);
  for (const listing of jobs) {
    const rendered = renderedCard(b, listing.link), ink = resolve(rendered.apply);
    const stops = resolve(rendered.background).match(/#[a-f0-9]{6}\b/gi);
    assert(stops && stops.length >= 2, 'actual rendered salary surface resolves to its gradient stops');
    for (const stop of stops) {
      const foreground = luminance(ink), background = luminance(stop);
      const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      assert(contrast >= 4.5, listing.pay + ' Apply text contrast is ' + contrast.toFixed(3) + ':1 against ' + stop);
    }
  }
});
