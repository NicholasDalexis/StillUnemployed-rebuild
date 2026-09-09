const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const identity = require('../../js/job-identity.js');
const aliasPairs = require('./fixtures/job-aliases.cjs');

const root = path.resolve(__dirname, '../..');
const generator = path.join(root, 'scripts/gen-share.mjs');
const helpers = import(pathToFileURL(generator).href);
const header = ['Company', 'Job Title', 'Link', 'Salary', 'Active/Dead', 'Location', 'Type', 'Years of Experience', 'Pick'];
const row = (changes = {}) => Object.assign({ Company: 'Example', 'Job Title': 'Designer', Link: 'https://example.com/jobs/1', Salary: '$70K-85K', 'Active/Dead': 'Active', Location: 'New York, NY', Type: 'Hybrid', 'Years of Experience': '1-3', Pick: '' }, changes);
const csv = (records = [], columns = header) => [columns, ...records.map(record => columns.map(key => record[key] || ''))]
  .map(cells => cells.map(value => '"' + value.replace(/"/g, '""') + '"').join(',')).join('\r\n');

function homeFeed(fetcher = async () => { throw new Error('offline'); }, identityAvailable = true) {
  const total = { textContent: 'old count' };
  const featured = { innerHTML: 'old jobs', textContent: '', children: [], appendChild(child) { this.children.push(child); } };
  const sandbox = {
    URL, fetch: fetcher, console: { warn() {} }, setInterval() {},
    // Feed-data tests use a ready availability dependency; dedicated moderation tests cover failures and recovery.
    window: { SUJobIdentity: identityAvailable ? identity : undefined, SUJobModeration:{refresh:async()=>({status:'ready',revision:0}),filter:jobs=>jobs}, addEventListener() {} },
    document: {
      readyState: 'loading', addEventListener() {},
      querySelector(selector) { return selector === '#nh-total' ? total : selector === '#nh-featured' ? featured : null; },
      createElement() { return { style:{},setAttribute() {},addEventListener() {},textContent:'' }; }
    }
  };
  // Expose the real closure's feed functions inside the test VM; never boot UI or contact a service.
  const source = fs.readFileSync(path.join(root, 'js/home.js'), 'utf8').replace(/\}\)\(\);\s*$/, 'globalThis.feed = {parseCSV: nhParseCSV, rowsToJobs: nhRowsToJobs, load: nhLoadJobs};\n})();');
  vm.runInNewContext(source, sandbox);
  return { ...sandbox.feed, total, featured };
}

test('production shares use the custom domain; preview shares use their branch domain', async () => {
  const { siteOrigin } = await helpers;
  const env = { URL: 'https://stillunemployed.com', DEPLOY_PRIME_URL: 'https://main--stillunemployed.netlify.app' };
  assert.equal(siteOrigin({ ...env, CONTEXT: 'production' }), env.URL);
  assert.equal(siteOrigin({ ...env, CONTEXT: 'branch-deploy' }), env.DEPLOY_PRIME_URL);
  assert.equal(siteOrigin({}), env.URL);
});

test('generated redirect preserves Unicode job URL, base64 plus and slash, and theme', async () => {
  const { stub } = await helpers;
  const link = 'https://example.com/jobs/🧪?query=~~~';
  const base64 = Buffer.from(link).toString('base64');
  assert.match(base64, /\+/);
  assert.match(base64, /\//);
  const html = stub({ co: 'Example', link, pay: '$85K', loc: 'Remote' }, 'abc', 'mermaid', 'https://preview.example');
  const redirect = JSON.parse(html.match(/location\.replace\(("[^"]+")\)/)[1]);
  const url = new URL(redirect, 'https://preview.example');
  assert.equal(Buffer.from(url.searchParams.get('job'), 'base64').toString('utf8'), link);
  assert.equal(url.searchParams.get('theme'), 'mermaid');
  assert.match(html, /https:\/\/preview\.example\/j\/og\/mermaid\/abc\.png/);
  assert.match(html, /&amp;theme=mermaid/);
});

test('homepage and share eligibility agree on active jobs, links, salaries and hourly floor', async () => {
  const build = await helpers;
  const home = homeFeed();
  const records = [
    row({ Company: 'Annual, "Quoted"\nName', Link: 'https://example.com/annual', Salary: '$70,000-85,000' }),
    ...['$25/h', '$25/hr', '$25/hour', '$25 per hour', '$25 hourly', '$24-26/hr'].map((pay, i) => row({ Salary: pay, Link: 'https://example.com/hourly/' + i })),
    ...['$24/h', '$24/hr', '$24/hour', '$24 per hour', '$24 hourly', '', 'Competitive'].map(Salary => row({ Salary })),
    ...['Dead', 'dead - closed', 'Inactive', 'NO'].map(status => row({ 'Active/Dead': status })),
    ...['javascript:alert(1)', 'data:text/plain,test', '//example.com/job', 'https://'].map(Link => row({ Link })),
    row({ Company: '' }), row({ 'Job Title': '' })
  ];
  const text = '\uFEFF' + csv(records);
  const actual = build.rowsToJobs(build.parseCSV(text));
  const featured = home.rowsToJobs(home.parseCSV(text));
  assert.equal(actual.length, 7);
  assert.deepEqual(actual.map(j => j.link), Array.from(featured, j => j.link));
  assert.equal(actual[0].co, 'Annual, "Quoted"\nName');
});

test('malformed HTTP content, headers, row widths and quotes cannot become an empty success', async () => {
  const build = await helpers;
  const home = homeFeed();
  for (const text of ['', '<html>Service unavailable</html>', csv([], header.filter(h => h !== 'Salary')),
    csv([], [...header, 'Salary']), csv() + '\r\n"Example","truncated"', csv() + '\n"unterminated', csv() + '\n"closed"text']) {
    assert.throws(() => build.rowsToJobs(build.parseCSV(text)));
    assert.throws(() => home.rowsToJobs(home.parseCSV(text)));
  }
  await assert.rejects(build.loadJobs(undefined, async () => ({ ok: false, status: 503, text() { throw new Error('must not read HTTP error body'); } })), /HTTP 503/);
});

test('invalid CSV exits nonzero without deleting previous generated output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'su-share-invalid-'));
  try {
    const out = path.join(dir, 'j');
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'keep.html'), 'previous share');
    const file = path.join(dir, 'jobs.csv');
    fs.writeFileSync(file, '<html>Google error page</html>');
    const result = spawnSync(process.execPath, [generator, file], { env: { ...process.env, SHARE_OUT: out }, encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /gen-share: build failed: Jobs CSV requires/);
    assert.equal(fs.readFileSync(path.join(out, 'keep.html'), 'utf8'), 'previous share');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('valid zero eligible jobs builds successfully and homepage shows zero without a fallback', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'su-share-empty-'));
  const text = csv([row({ 'Active/Dead': 'Dead' })]);
  try {
    const file = path.join(dir, 'jobs.csv');
    fs.writeFileSync(file, text);
    const result = spawnSync(process.execPath, [generator, file], { env: { ...process.env, SHARE_OUT: path.join(dir, 'j') }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /generated 0 jobs/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const calls = [];
  const home = homeFeed(async url => { calls.push(url); return { ok: true, text: async () => text }; });
  await home.load();
  assert.equal(home.total.textContent, '0');
  assert.match(home.featured.textContent, /No roles available/);
  assert.equal(home.featured.innerHTML, '');
  assert.equal(calls.length, 1);
});

test('homepage outage clears old cards and shows unavailable without fetching stale snapshot', async () => {
  const calls = [];
  const home = homeFeed(async url => { calls.push(url); throw new Error('offline'); });
  await home.load();
  assert.equal(calls.length, 1);
  assert.equal(home.featured.innerHTML, '');
  assert.equal(home.total.textContent, '…');
  assert.match(home.featured.children[0].textContent, /Could not check current job availability/);
});

test('home and share loaders collapse confirmed aliases after eligibility, retaining every old share hash', async () => {
  const build = await helpers, home = homeFeed();
  const records = aliasPairs.flatMap(pair => pair.links.map(Link => row({ Company: pair.co, 'Job Title': pair.role, Link })));
  records.unshift(row({ Company: 'Glossier', Link: aliasPairs[0].links[0], Salary: '' }));
  records.push(row({ Company: 'Glossier', 'Job Title': aliasPairs[0].role, Link: 'https://boards.greenhouse.io/glossier/jobs/8054876' }));
  const text = csv(records), jobs = build.rowsToJobs(build.parseCSV(text));
  assert.equal(jobs.length, 6);
  assert.deepEqual(jobs.map(j => j.link), Array.from(home.rowsToJobs(home.parseCSV(text)), j => j.link));
  for (const pair of aliasPairs) {
    const job = jobs.find(j => j.link === pair.links[0]);
    assert.deepEqual(job._aliases, pair.links);
    const entries = build.shareEntries(job);
    assert.deepEqual(entries.map(entry => entry.link), pair.links);
    assert.equal(new Set(entries.map(entry => entry.slug)).size, 2);
    for (const entry of entries) {
      const html = build.stub(job, entry.slug, 'poker', 'https://preview.example');
      assert(html.includes('/j/poker/' + entry.slug + '.html'));
      const redirect = JSON.parse(html.match(/location\.replace\(("[^"]+")\)/)[1]);
      assert.equal(Buffer.from(new URL(redirect, 'https://preview.example').searchParams.get('job'), 'base64').toString(), pair.links[0]);
    }
  }
});

test('homepage missing identity dependency clears stale content instead of rendering unchecked duplicates', async () => {
  const pair = aliasPairs[0], text = csv(pair.links.map(Link => row({ Link }))), calls = [];
  const home = homeFeed(async url => { calls.push(url); return { ok: true, text: async () => text }; }, false);
  assert.throws(() => home.rowsToJobs(home.parseCSV(text)), /identity check unavailable/);
  await home.load();assert.equal(calls.length, 1);assert.equal(home.total.textContent, '…');assert.equal(home.featured.innerHTML, '');
  assert.match(home.featured.children[0].textContent, /Could not check current job availability/);
});
