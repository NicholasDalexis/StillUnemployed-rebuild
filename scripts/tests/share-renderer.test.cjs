const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { setImmediate: nextTurn } = require('node:timers/promises');

const generatorURL = pathToFileURL(path.resolve(__dirname, '../gen-share.mjs')).href;
const themes = ['original', 'poker', 'girly', 'mermaid', 'bratt', 'noir', 'beauty', 'chess'];
const cases = [
  { co: 'Example', role: 'Designer', pay: '$90K-110K', loc: 'New York, NY', type: 'Hybrid', yrs: '1-3' },
  { co: '', role: '', pay: '', loc: '', type: '', yrs: '' },
  { co: 'A very long company name '.repeat(5), role: 'Senior creative and brand designer '.repeat(4), pay: '$120K-150K', loc: 'Multiple locations '.repeat(5), type: 'Remote', yrs: '3+' },
  { co: 'Café · Créativité 🧪', role: 'Design / デザイン', pay: '$35/hour', loc: 'Montréal → Remote', type: 'Contract', yrs: '0-2' },
];

test('reused share surface matches fresh surfaces across all themes and varied copy', async () => {
  const { createCardRenderer } = await import(generatorURL);
  const reused = await createCardRenderer();
  const anchor = reused(cases[0], 'original');
  const retainedCopy = Buffer.from(anchor);
  for (const job of cases) {
    for (const theme of themes) {
      const fresh = await createCardRenderer();
      const expected = fresh(job, theme);
      const actual = reused(job, theme);
      assert.deepEqual(actual, expected, `${theme}: ${job.co}`);
      assert.equal(actual.readUInt32BE(16), 1200);
      assert.equal(actual.readUInt32BE(20), 630);
    }
    await nextTurn();
  }
  assert.deepEqual(reused(cases[0], 'original'), retainedCopy, 'later themes must not leave drawing state behind');
  assert.deepEqual(anchor, retainedCopy, 'returned PNG buffers must remain immutable after later renders');
  assert.deepEqual(reused(cases[0], 'unknown'), retainedCopy, 'unknown themes retain the original fallback');
});

test('footer star renders in every theme without any font glyph or glyph metrics', async () => {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const { createCardRenderer } = await import(generatorURL);
  const render = await createCardRenderer();
  const probe = createCanvas(1200, 630).getContext('2d');
  const proto = Object.getPrototypeOf(probe);
  const originals = { fillText: proto.fillText, measureText: proto.measureText };
  // Model a build host with no star glyph: neither drawing nor sizing may use it.
  for (const method of Object.keys(originals)) {
    proto[method] = function (text, ...args) {
      assert.doesNotMatch(String(text), /\u2605/, 'the footer star must not depend on host fonts');
      return originals[method].call(this, text, ...args);
    };
  }
  const colors = {
    original: [178, 58, 30, 255], poker: [212, 175, 55, 255], girly: [58, 14, 38, 255],
    mermaid: [255, 199, 184, 255], bratt: [10, 20, 0, 255], noir: [236, 236, 238, 255],
    beauty: [243, 217, 184, 255], chess: [244, 244, 244, 255],
  };
  try {
    for (const theme of themes) {
      const png = render({ co: 'Example', role: 'Designer', pay: '$90K', loc: 'New York, NY', style: 'Hybrid', exp: '1–3 years' }, theme);
      probe.drawImage(await loadImage(png), 0, 0);
      const pixel = (x, y) => Array.from(probe.getImageData(x, y, 1, 1).data);
      assert.deepEqual(pixel(115, 500), colors[theme], theme + ': star center stays visible');
      assert.deepEqual(pixel(115, 489), colors[theme], theme + ': upper point stays visible');
      assert.notDeepEqual(pixel(102, 491), colors[theme], theme + ': the mark is a star, not a filled box');
    }
  } finally {
    for (const method of Object.keys(originals)) proto[method] = originals[method];
  }
});

test('the real renderer retains fitting full titles and bounds long copy without changing pay or footer', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { createCardRenderer } = await import(generatorURL);
  const render = await createCardRenderer();
  const probe = createCanvas(1200, 630).getContext('2d');
  const proto = Object.getPrototypeOf(probe), original = proto.fillText;
  const wmg = { co:'Warner Music Group', role:'Junior Manager, Creator Strategy & Partnerships', pay:'$66-72K', loc:'New York, NY', style:'In-person', exp:'3+ yrs' };
  const long = { co:'WNBC / WNJU (NBCUniversal)', role:'Worldwide creative strategy and partnerships '.repeat(8), pay:'$72,400-138,600/year', loc:'New York, NY; Los Angeles, CA; San Francisco, CA; Washington, DC; Chicago, IL', style:'Hybrid', exp:'3+ yrs' };
  let drawn = [];
  proto.fillText = function (text, x, y, ...rest) {
    drawn.push({ text:String(text), x, y, font:this.font, width:this.measureText(String(text)).width });
    return original.call(this, text, x, y, ...rest);
  };
  try {
    for (const theme of themes) {
      for (const job of [wmg, long]) {
        drawn = [];render(job, theme);
        const company=drawn.find(r=>r.y===98), role=drawn.find(r=>r.y===188), location=drawn.find(r=>r.y===382);
        for(const line of [company,role,location])assert(line.width<=1004,`${theme}: ${line.text} exceeds the text area`);
        assert.match(company.font,/66px/);assert.match(role.font,/36px/);assert.match(location.font,/30px/);
        if(job===wmg){
          assert.equal(company.text,wmg.co);
          assert.equal(role.text,wmg.role,'the complete WMG title fits; never cut Partnerships');
          assert.equal(location.text,'New York, NY  ·  In-person  ·  3+ yrs');
        }else{
          for(const line of [company,role,location])assert.match(line.text,/…$/,'omitted copy must be marked');
        }
        assert.equal(drawn.find(r=>r.y===294).text,job.pay,'employer pay remains exact');
        const footer=drawn.find(r=>r.y===470);
        assert.equal(footer.text,'stillunemployed.com');assert.equal(footer.x,141.41);
        assert.equal(drawn.find(r=>r.y===528).text,"roles I'd actually apply to");
      }
    }
  } finally { proto.fillText = original; }
});

test('measured single-line fitting handles exact edges, word breaks, wide words, Unicode and empty strings', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { createCardRenderer, fitCanvasText } = await import(generatorURL);
  await createCardRenderer();
  const ctx=createCanvas(1200,630).getContext('2d');ctx.font="600 36px 'SUBody', Archivo, sans-serif";
  const full='Café 👩🏽‍💻 Design';
  const exact=ctx.measureText(full).width;
  assert.equal(fitCanvasText(ctx,full,exact),full,'an exact-fitting line remains intact');
  const smaller=fitCanvasText(ctx,full,exact-0.01);
  assert.match(smaller,/…$/);assert(ctx.measureText(smaller).width<=exact-0.01);
  const words='Creative Strategy Partnerships Worldwide';
  const wordWidth=ctx.measureText('Creative Strategy Pa…').width;
  assert.equal(fitCanvasText(ctx,words,wordWidth),'Creative Strategy…');
  const wide=fitCanvasText(ctx,'W'.repeat(100),200);
  assert.match(wide,/^W+…$/);assert(ctx.measureText(wide).width<=200);
  const unicode='e\u0301👩🏽‍💻'.repeat(30), width=ctx.measureText('e\u0301👩🏽‍💻e\u0301…').width;
  const shortened=fitCanvasText(ctx,unicode,width);
  const boundaries=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(unicode)].map(p=>p.index);
  assert.match(shortened,/…$/);assert(boundaries.includes(shortened.slice(0,-1).length),'never split an accented grapheme or emoji sequence');
  assert(ctx.measureText(shortened).width<=width);
  assert.equal(fitCanvasText(ctx,'',1004),'');
  assert.equal(fitCanvasText(ctx,null,1004),'');
  assert.equal(fitCanvasText(ctx,'Designer',0),'');
  assert.equal(fitCanvasText(ctx,'Designer',ctx.measureText('…').width-0.01),'');
});

test('sequential share batches keep native canvas memory bounded', { timeout: 45000 }, () => {
  // Run separately so other tests and their native allocations cannot affect RSS.
  // The old renderer grew by >500 MiB in 176 images. A generous 384 MiB growth
  // limit catches that regression without relying on exact platform RSS values.
  const script = `
    import { setImmediate as nextTurn } from 'node:timers/promises';
    const { createCardRenderer } = await import(process.argv[1]);
    const render = await createCardRenderer();
    const themes = ${JSON.stringify(themes)};
    const jobs = ${JSON.stringify(cases)};
    const start = process.memoryUsage().rss;
    let peak = start;
    for (let i = 0; i < 256; i++) {
      render(jobs[Math.floor(i / 8) % jobs.length], themes[i % 8]);
      if ((i + 1) % 8 === 0) {
        await nextTurn();
        peak = Math.max(peak, process.memoryUsage().rss);
        if (peak - start > 384 * 1024 * 1024 || peak > 768 * 1024 * 1024) {
          throw new Error('Native share memory grew without a bound: ' + JSON.stringify({ images: i + 1, start, peak }));
        }
      }
    }
    process.stdout.write(JSON.stringify({ images: 256, start, peak }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, generatorURL], {
    encoding: 'utf8', timeout: 40000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const measured = JSON.parse(result.stdout);
  assert.equal(measured.images, 256);
  assert(measured.peak - measured.start <= 384 * 1024 * 1024, JSON.stringify(measured));
});
