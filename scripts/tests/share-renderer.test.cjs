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
