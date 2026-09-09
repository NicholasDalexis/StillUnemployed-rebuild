const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Reuse the established offline DOM adapter without registering its test cases.
// It executes App.init/render from the real app.js; no card markup is recreated here.
const fixturePath = path.join(__dirname, 'board-qa.test.cjs');
const fixtureSource = fs.readFileSync(fixturePath, 'utf8')
  .replace("look='original',response", "look='original',internships=false,response")
  .replace("pathname:'/jobs.html'", "pathname:internships?'/internships.html':'/jobs.html'");
const firstTest = fixtureSource.indexOf('\ntest(');
assert(firstTest > 0, 'the board adapter precedes its regression cases');
const fixtureModule = { exports:{} };
vm.runInNewContext(fixtureSource.slice(0, firstTest) + '\nmodule.exports={board,job};', {
  require:createRequire(fixturePath), module:fixtureModule, __dirname,
  Buffer, URL, URLSearchParams, setImmediate
}, { filename:fixturePath });
const { board, job } = fixtureModule.exports;
const Internships = require('../../js/internships.js');
const looks = ['original', 'poker', 'mermaid', 'girly', 'bratt', 'noir', 'beauty', 'chess'];
const bands = [
  { tier:'low', pay:'$70,000–$79,999' },
  { tier:'mid', pay:'$80,000–$99,999' },
  { tier:'high', pay:'$90,000–$110,000' }
];

function specimens() {
  return bands.map(({ tier, pay }) => job({ co:'Example ' + tier, pay, pick:false, link:'https://example.com/salary/' + tier }));
}

function assertActiveRoute(apply, link, internships=false) {
  assert.equal(apply.getAttribute('data-link'),link,'normal activation retains the source identity');
  const target=new URL(apply.getAttribute('href'),'https://preview--stillunemployed.netlify.app');
  assert.equal(target.origin,'https://preview--stillunemployed.netlify.app','alternate activation remains on the moderated board');
  assert.equal(target.pathname,internships?'/internships.html':'/jobs.html');
  assert.equal(Buffer.from(target.searchParams.get('job'),'base64').toString('utf8'),link);
}

function renderedCard(b, link) {
  const card = b.grid.querySelectorAll('.note[data-link]').find(node => node.getAttribute('data-link') === link);
  assert(card, 'rendered card for ' + link);
  const apply = card.querySelector('a[data-act="apply"]');
  const stamp = card.querySelectorAll('div').find(node => /^Human[- ]verified$/i.test(node.textContent.trim()));
  assert(apply, 'the card retains its real Apply action');
  assert(stamp, 'the card retains its verification stamp');
  assertActiveRoute(apply,link);
  return { card, background:card.style.background, ink:card.style.color, apply:apply.style.color, stamp:stamp.style.color };
}

function colors(rendered) {
  return { background:rendered.background, ink:rendered.ink, apply:rendered.apply, stamp:rendered.stamp };
}

for (const look of looks) {
  test('featured markers preserve low/mid/high salary surfaces and matching text in ' + look, () => {
    const b = board({ look }), jobs = specimens();b.init(jobs);b.app.jobs.forEach((_j,id)=>b.app.state.openNotes[id]='done');b.app.render();
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

function contrastHelpers() {
  const css = fs.readFileSync(path.join(__dirname, '../../css/brand.css'), 'utf8');
  const tokens = new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
  function resolve(value) {
    const reference = value.match(/^var\((--[\w-]+)\)$/);
    if (!reference) return value;
    assert(tokens.has(reference[1]), 'rendered style references a defined shared token');
    return tokens.get(reference[1]);
  }
  function luminance(hex) {
    if (/^#[a-f0-9]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map(value => value + value).join('');
    assert.match(hex, /^#[a-f0-9]{6}$/i);
    const rgb = [1,3,5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }
  return { resolve, ratio(ink,stop) {
    const foreground = luminance(resolve(ink)), background = luminance(stop);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  } };
}

const hoverRules = ['styles.css','internships.css'].flatMap(name => {
  const css = fs.readFileSync(path.join(__dirname, '../../css', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => match[1].includes('.applylink2:hover'))
    .map(match => ({ selector:match[1].trim(), declarations:match[2], file:name }));
});

test('Apply hover retains theme ink instead of forcing one color across papers', () => {
  assert(hoverRules.length > 0, 'the actual Apply hover treatment is inspected');
  for (const rule of hoverRules) {
    const color = rule.declarations.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    if (color) assert.match(color[1].trim(), /^(?:inherit|currentColor)(?:\s*!important)?$/i,
      rule.file + ' ' + rule.selector + ' must not replace all theme-specific inks with one accent');
  }
});

for (const internships of [false,true]) for (const look of looks) {
  test('rendered ' + look + ' ' + (internships?'internship':'job') + ' Apply text clears 4.5:1 on all three papers, including hover', () => {
    const { resolve, ratio } = contrastHelpers();
    const b = board({ look, internships }), jobs = specimens();
    if (internships) {
      b.window.SUInternships = Internships;
      jobs.forEach(listing => Object.assign(listing, { internship:true,pay:'$25/hour',payBasis:'hour',payStatus:'paid',applicationStatus:'open',verification:{status:'open',checkedAt:'2026-09-07T15:00:00Z'} }));
    }
    b.init(jobs);b.app.jobs.forEach((_j,id)=>b.app.state.openNotes[id]='done');b.app.render();
    assert.equal(b.app.internships, internships, 'test renders the intended board');
    const papers = new Set();
    for (const listing of jobs) {
      const card = b.grid.querySelectorAll('.note[data-link]').find(node => node.getAttribute('data-link') === listing.link);
      assert(card, 'the source listing renders a real card');
      const apply = card.querySelector('a[data-act="apply"]');
      assert(apply, 'the actual Apply action renders');
      assertActiveRoute(apply,listing.link,internships);
      papers.add(card.style.background);
      const stops = resolve(card.style.background).match(/#[a-f0-9]{6}\b/gi);
      assert(stops && stops.length >= 2, 'the rendered paper resolves to gradient stops');
      let hoverInk = apply.style.color;
      for (const rule of hoverRules) {
        if (!internships && rule.selector.includes('.su-internship-card')) continue;
        const color = rule.declarations.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
        if (!color) continue;
        const value = color[1].replace(/\s*!important\s*$/i,'').trim();
        hoverInk = /^(?:inherit|currentColor)$/i.test(value) ? card.style.color : value;
      }
      for (const [state,ink] of [['normal',apply.style.color],['hover',hoverInk]]) for (const stop of stops) {
        const contrast = ratio(ink,stop);
        assert(contrast >= 4.5, look + ' ' + listing.link.split('/').pop() + ' ' + state + ' Apply contrast is ' + contrast.toFixed(3) + ':1 against ' + stop);
      }
    }
    assert.equal(papers.size, 3, 'this actually covers low, middle and high paper treatments');
  });
}

test('Girlies navigation and accent controls render readable ink on the board and tracker', () => {
  const { ratio } = contrastHelpers(), b = board({ look:'girly' });b.init(specimens());
  const nav = b.grid.querySelector('.su-main-nav');assert(nav);
  const declaration = nav.getAttribute('style');
  const navInk = declaration.match(/--su-nav-ink:\s*([^;]+)/)[1];
  const navBg = declaration.match(/--su-nav-bg:\s*([^;]+)/)[1];
  assert(ratio(navInk,navBg) >= 4.5, 'board navigation text clears normal-text contrast');
  assert(ratio(b.document.body.style['--su-action-ink'],b.document.body.style['--su-action-paper']) >= 4.5,
    'Girlies board accent controls use readable ink');

  const trackerPath = path.join(__dirname,'tracker-sync.test.cjs');
  const trackerSource = fs.readFileSync(trackerPath,'utf8');
  const trackerPrefix = trackerSource.slice(0,trackerSource.indexOf('\ntest('))
    .replace('style:{setProperty(){}}','style:{setProperty(key,value){this[key]=value;}}');
  const trackerModule = { exports:{} };
  vm.runInNewContext(trackerPrefix + '\nmodule.exports=tracker;', {
    require:createRequire(trackerPath),module:trackerModule,__dirname,Buffer,URL,Blob,Date,console,clearTimeout
  },{filename:trackerPath});
  const t = trackerModule.exports();t.storage.setItem('su_look','girly');t.storageChange('su_look');
  assert.equal(t.app.look,'girly');
  assert(ratio(t.board.style['--su-nav-ink'],t.board.style['--su-nav-bg']) >= 4.5,
    'tracker navigation text clears normal-text contrast');
  assert(ratio(t.board.style['--trk-accink'],t.board.style['--trk-acc']) >= 4.5,
    'tracker accent controls use readable ink');
});

test('active filter count retains normal-text contrast at its small rendered size', () => {
  const { ratio } = contrastHelpers();
  for (const look of looks) {
    const b = board({ look });b.init(specimens());b.app.setState({ ws:'Remote',fr:'Recently added' });
    const badge = b.grid.querySelector('[data-act="toggleFilters"]').querySelector('span');
    assert.equal(badge.textContent,'2','the real active filter count is visible');
    assert(ratio(badge.style.color,badge.style.background) >= 4.5, look + ' filter-count contrast');
  }
});
