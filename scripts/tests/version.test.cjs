const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const versionTool = import(pathToFileURL(path.join(root, 'scripts/version.mjs')).href);
const initial = () => ({ schemaVersion:1, currentVersion:'2', releases:[{ version:'2', date:'2026-09-05', title:'The new board', changes:['Clearer navigation.'] }] });

test('public releases start at 2 then 2.1.0 and carry each patch digit after 9', async () => {
  const { nextVersion } = await versionTool;
  assert.equal(nextVersion('2'), '2.1.0');
  for (let patch = 0; patch < 9; patch++) assert.equal(nextVersion('2.1.' + patch), '2.1.' + (patch + 1));
  assert.equal(nextVersion('2.1.9'), '2.2.0');
  assert.equal(nextVersion('2.9.9'), '2.10.0');
  assert.equal(nextVersion('2.10.0'), '2.10.1');
});

test('invalid or ambiguous release numbers are rejected', async () => {
  const { nextVersion } = await versionTool;
  for (const version of ['', '2.1', '2.1.10', '2.01.1', '-2.1.1', 'Version 2', '2.1.1-beta', '2.5.0.0', null, 2]) assert.throws(() => nextVersion(version));
});

test('the automatic 2.5.0 release waits for Nic while 2.4.9 remains valid and renderable', async () => {
  const { nextVersion, bumpRelease, validateRelease, renderHistory, renderReleaseScript } = await versionTool;
  const atVersion = version => ({ ...initial(), currentVersion:version, releases:[{ ...initial().releases[0], version }] });
  assert.equal(bumpRelease(atVersion('2.3.9'), { notes:['A completed change.'] }).currentVersion, '2.4.0');
  const boundary = bumpRelease(atVersion('2.4.8'), { notes:['The last change before the decision.'] });
  assert.equal(boundary.currentVersion, '2.4.9');
  assert.doesNotThrow(() => validateRelease(boundary));
  assert.match(renderHistory(boundary), /id="version-2-4-9"/);
  assert.match(renderReleaseScript(boundary), /var version = "2\.4\.9"/);
  assert.equal(nextVersion('2.4.9'), '2.5.0', 'calculating a candidate does not authorize its release');
  const before = JSON.stringify(boundary);
  assert.throws(() => bumpRelease(boundary, { notes:['This release needs a decision.'] }), /stopped before Version 2\.5\.0\. Ask Nic.*three-part.*2\.5\.0.*four parts.*2\.5\.0\.0/);
  assert.equal(JSON.stringify(boundary), before, 'a rejected bump leaves history unchanged');
  assert.equal(bumpRelease(atVersion('3.4.9'), { notes:['A change in an explicitly chosen major.'] }).currentVersion, '3.5.0', 'the decision gate is specific to 2.5.0');
});

test('one deliberate bump prepends notes and preserves every earlier history entry', async () => {
  const { bumpRelease } = await versionTool;
  const before = initial(), serialized = JSON.stringify(before);
  const next = bumpRelease(before, { notes:['  Easier filters.  '], title:'A small fix', date:'2026-09-06' });
  assert.equal(next.currentVersion, '2.1.0');
  assert.deepEqual(next.releases[0], { version:'2.1.0', date:'2026-09-06', title:'A small fix', changes:['Easier filters.'] });
  assert.deepEqual(next.releases[1], before.releases[0]);
  assert.equal(JSON.stringify(before), serialized);
  assert.throws(() => bumpRelease(before, { notes:[] }), /at least one/);
  assert.throws(() => bumpRelease(before, { notes:['A fix.'], date:'2026-02-30' }), /date/);
});

test('release dates follow Eastern time across UTC midnight', async () => {
  const { easternDate } = await versionTool;
  assert.equal(easternDate(new Date('2026-09-06T01:00:00Z')), '2026-09-05');
  assert.equal(easternDate(new Date('2026-09-06T05:00:00Z')), '2026-09-06');
});

test('history is readable without JavaScript and release notes cannot inject markup', async () => {
  const { renderHistory } = await versionTool;
  const data = initial();data.releases[0].title = '<img src=x onerror=alert(1)>';data.releases[0].changes = ['<script>alert("x")</script>'];
  const html = renderHistory(data);
  assert.match(html, /<h1>Version history<\/h1>/);assert.match(html, /id="version-2"/);assert.match(html, /<time datetime="2026-09-05">September 5, 2026<\/time>/);
  assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert(!html.includes('<script>'));assert(!html.includes('<img src=x'));
});

test('static and newly rendered board links share immutable version data and a root history route', async () => {
  const { renderReleaseScript, bumpRelease } = await versionTool;
  const data = bumpRelease(initial(), { notes:['A fix.'] });
  const makeLink = () => ({ textContent:'Version', attributes:{}, setAttribute(name, value) { this.attributes[name] = value; } });
  const homepage = makeLink(), win = {};
  let links = [homepage];
  vm.runInNewContext(renderReleaseScript(data), { window:win, document:{ readyState:'complete', querySelectorAll:() => links } });
  assert.equal(win.SURelease.version, '2.1.0');
  assert(Object.isFrozen(win.SURelease));
  assert.equal(Reflect.set(win.SURelease, 'version', '9'), false);
  assert.equal(Reflect.set(win.SURelease, 'render', () => {}), false);
  const founder = makeLink(), footer = makeLink();
  links = [founder, footer];
  win.SURelease.render();
  for (const link of [homepage, founder, footer]) {
    assert.equal(link.textContent, 'Version 2.1.0');
    assert.equal(link.attributes.href, '/versions.html#version-2-1-0');
    assert.equal(link.attributes['aria-label'], 'Version 2.1.0. View version history');
    for (const page of ['http://localhost:8000/', 'http://localhost:8000/jobs/casino/']) {
      assert.equal(new URL(link.attributes.href, page).href, 'http://localhost:8000/versions.html#version-2-1-0');
    }
  }
});

test('the release helper is ready before DOMContentLoaded and fills initial links when the page is ready', async () => {
  const { renderReleaseScript } = await versionTool;
  const win = {}, listeners = {}, link = { setAttribute() {} };
  vm.runInNewContext(renderReleaseScript(initial()), { window:win, document:{ readyState:'loading',
    querySelectorAll:() => [link], addEventListener(name, callback) { listeners[name] = callback; } } });
  assert.equal(win.SURelease.version, '2');
  assert.equal(typeof win.SURelease.render, 'function');
  assert.equal(link.textContent, undefined);
  listeners.DOMContentLoaded();
  assert.equal(link.textContent, 'Version 2');
});

test('refresh is idempotent; only an explicit bump changes metadata and homepage fallback', async () => {
  const { applyRelease } = await versionTool;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'su-version-'));
  try {
    fs.mkdirSync(path.join(dir, 'js'));
    fs.writeFileSync(path.join(dir, 'releases.json'), JSON.stringify(initial(), null, 2) + '\n');
    fs.writeFileSync(path.join(dir, 'package.json'), '{"version":"1.0.0"}');
    const html = '<a href="./terms.html">Terms</a><a href="./versions.html" data-su-version>Version 2</a><script src="js/release.js?v=2" defer></script>';
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    assert.deepEqual(applyRelease(dir).changed.sort(), ['index.html', 'js/release.js', 'versions.html']);
    assert.deepEqual(applyRelease(dir).changed, []);
    assert.throws(() => applyRelease(dir, { check:true }), /unsealed/);
    assert.equal(applyRelease(dir, { seal:true }).version, '2');
    assert.throws(() => applyRelease(dir, { seal:true }), /only for the unsealed/);
    assert.equal(applyRelease(dir, { check:true }).version, '2');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'releases.json'))).currentVersion, '2');
    const result = applyRelease(dir, { bump:true, notes:['A tested fix.'], date:'2026-09-06' });
    assert.equal(result.version, '2.1.0');
    assert.match(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), /data-su-version[^>]*>Version 2\.1\.0<\/a>/);
    assert.match(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), /js\/release\.js\?v=2\.1\.0/);
    assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), '{"version":"1.0.0"}');
    assert.deepEqual(applyRelease(dir, { check:true }).changed, []);
    fs.appendFileSync(path.join(dir, 'versions.html'), 'drift');
    assert.throws(() => applyRelease(dir, { check:true }), /versions.html/);
  } finally { fs.rmSync(dir, { recursive:true, force:true }); }
});

test('an invalid bump writes no release files', async () => {
  const { applyRelease } = await versionTool;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'su-version-invalid-'));
  try {
    const data = JSON.stringify(initial());fs.writeFileSync(path.join(dir, 'releases.json'), data);
    assert.throws(() => applyRelease(dir, { bump:true, notes:[] }), /Seal the initial/);
    assert.equal(fs.readFileSync(path.join(dir, 'releases.json'), 'utf8'), data);
    assert.deepEqual(fs.readdirSync(dir), ['releases.json']);
  } finally { fs.rmSync(dir, { recursive:true, force:true }); }
});

function releaseFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'su-source-seal-'));
  const put = (name, text) => { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive:true });fs.writeFileSync(path.join(dir, name), text); };
  put('releases.json', JSON.stringify(initial(), null, 2) + '\n');
  put('index.html', '<a href="./terms.html">Terms</a><a href="./versions.html" data-su-version>Version 2</a><script src="js/release.js?v=2" defer></script>');
  put('js/app.js', 'window.boardReady=true;');
  put('assets/logo.svg', '<svg viewBox="0 0 10 10"></svg>');
  put('package.json', '{"version":"1.0.0"}');
  put('netlify.toml', '[build]\npublish="."\n');
  return { dir, put, clean:() => fs.rmSync(dir, { recursive:true, force:true }) };
}

test('the CLI stops at 2.5.0 before writing any files and leaves 2.4.9 check and refresh usable', async () => {
  const { applyRelease } = await versionTool, fixture = releaseFixture(), { dir, put } = fixture;
  try {
    put('scripts/version.mjs', fs.readFileSync(path.join(root, 'scripts/version.mjs')));
    applyRelease(dir, { seal:true });
    const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'releases.json'), 'utf8'));
    metadata.currentVersion = '2.4.8';
    metadata.releases.unshift({ version:'2.4.8', date:'2026-09-06', title:'Boundary fixture', changes:['Ready for the last ordinary bump.'] });
    put('releases.json', JSON.stringify(metadata, null, 2) + '\n');
    applyRelease(dir);
    const run = args => spawnSync(process.execPath, [fs.realpathSync(path.join(dir, 'scripts/version.mjs')), ...args], { encoding:'utf8' });
    const permitted = run(['--bump', '--note', 'The last ordinary release.']);
    assert.equal(permitted.status, 0, permitted.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'releases.json'), 'utf8')).currentVersion, '2.4.9');
    const snapshot = () => Object.fromEntries(fs.readdirSync(dir, { recursive:true }).sort().filter(name => fs.statSync(path.join(dir, name)).isFile()).map(name => [name, fs.readFileSync(path.join(dir, name)).toString('base64')]));
    const before = snapshot(), stopped = run(['--bump', '--note', 'Waiting for the format decision.']);
    assert.equal(stopped.status, 1);
    assert.equal(stopped.stdout, '', 'the CLI must not report a completed release');
    assert.match(stopped.stderr, /Automatic bump stopped before Version 2\.5\.0/);
    assert.match(stopped.stderr, /Ask Nic.*three-part format \(2\.5\.0\).*four parts \(2\.5\.0\.0\)/);
    assert.deepEqual(snapshot(), before, 'metadata, source links, generated output and temporary files stay untouched');
    for (const mode of ['--check', '--refresh']) {
      const result = run([mode]);assert.equal(result.status, 0, result.stderr);assert.match(result.stdout, /Version 2\.4\.9/);
    }
    assert.deepEqual(snapshot(), before, 'checking and refreshing the released boundary do not consume the decision');
  } finally { fixture.clean(); }
});

test('a bump refreshes every marked static page without creating a fingerprint self-reference', async () => {
  const { applyRelease } = await versionTool, fixture = releaseFixture(), { dir, put } = fixture;
  try {
    const html = '<a class="version-link" data-su-version="" href="./versions.html#version-2" aria-label="Version 2. View version history">Version 2</a>' +
      '<a href="./privacy.html">Privacy</a><script src="/js/release.js?v=2" defer></script>';
    for (const page of ['jobs.html', 'tracker.html', 'about.htm']) put(page, html);
    const sealed = applyRelease(dir, { seal:true });
    const bumped = applyRelease(dir, { bump:true, notes:['A release note.'], date:'2026-09-06' });
    assert.equal(bumped.version, '2.1.0');
    assert.deepEqual(bumped.sourceFingerprint, sealed.sourceFingerprint);
    for (const page of ['index.html', 'jobs.html', 'tracker.html', 'about.htm']) {
      const result = fs.readFileSync(path.join(dir, page), 'utf8');
      assert.match(result, /data-su-version[^>]*href="\/versions\.html#version-2-1-0"[^>]*>Version 2\.1\.0<\/a>/);
      assert.match(result, /aria-label="Version 2\.1\.0\. View version history"/);
      assert.match(result, /js\/release\.js\?v=2\.1\.0/);
      assert(result.includes(page === 'index.html' ? '<a href="./terms.html">Terms</a>' : '<a href="./privacy.html">Privacy</a>'));
    }
    applyRelease(dir, { check:true });
    // Derived fallback drift may be repaired without absorbing a source edit.
    put('jobs.html', html);
    assert.throws(() => applyRelease(dir, { check:true }), /need --refresh: jobs.html/);
    applyRelease(dir);applyRelease(dir, { check:true });
    put('jobs.html', fs.readFileSync(path.join(dir, 'jobs.html'), 'utf8').replace('version-link', 'different-layout'));
    assert.throws(() => applyRelease(dir, { check:true }), /Public source changed/);
  } finally { fixture.clean(); }
});

test('public source and asset edits, additions and removals reject check until a deliberate bump', async () => {
  const { applyRelease } = await versionTool, fixture = releaseFixture(), { dir, put } = fixture;
  try {
    const sealed = applyRelease(dir, { seal:true });assert.equal(sealed.version, '2');assert.equal(sealed.sourceFingerprint.algorithm, 'sha256-public-source-v1');
    assert.equal(sealed.sourceFingerprint.fileCount, 5);applyRelease(dir, { check:true });
    const changes = [
      () => put('js/app.js', 'window.boardReady=false;'),
      () => put('assets/logo.svg', '<svg viewBox="0 0 20 20"></svg>'),
      () => put('css/new.css', 'body{color:#222}'),
      () => fs.unlinkSync(path.join(dir, 'assets/logo.svg')),
      () => put('netlify.toml', '[build]\npublish="."\ncommand="node scripts/build.mjs"\n'),
      () => put('scripts/build.mjs', 'console.log("build");'),
      () => put('package.json', '{"version":"1.0.0","dependencies":{"example":"1.0.0"}}')
    ];
    for (const [index, change] of changes.entries()) {
      const before = fs.readFileSync(path.join(dir, 'releases.json'), 'utf8');change();
      assert.throws(() => applyRelease(dir, { check:true }), /Public source changed/);
      assert.throws(() => applyRelease(dir), /--refresh cannot accept source changes/);
      assert.equal(fs.readFileSync(path.join(dir, 'releases.json'), 'utf8'), before);
      const result = applyRelease(dir, { bump:true, notes:['Public improvement ' + index], date:'2026-09-06' });
      assert.equal(result.version, '2.1.' + index);assert.notEqual(result.sourceFingerprint.digest, JSON.parse(before).sourceFingerprint.digest);
      applyRelease(dir, { check:true });
    }
  } finally { fixture.clean(); }
});

test('generated pages, tests, docs and private scratch are excluded from the public-source seal', async () => {
  const { applyRelease, inventoryPublicSource } = await versionTool, fixture = releaseFixture(), { dir, put } = fixture;
  try {
    const before = applyRelease(dir, { seal:true });
    for (const name of ['j/og/original/a.png', 'j/original/a.html', 'jobs/casino/index.html', 'scripts/tests/test.cjs', 'scripts/tests/fixtures/job.json', 'docs/example.js', 'AGENTS.md', 'CLAUDE.md', '_to_delete/js/private.js', 'assets/og-src/source.png', 'scratch.png']) put(name, 'excluded content');
    const after = applyRelease(dir, { check:true });assert.deepEqual(after.sourceFingerprint, before.sourceFingerprint);
    assert.deepEqual(inventoryPublicSource(dir), ['assets/logo.svg', 'index.html', 'js/app.js', 'netlify.toml', 'package.json']);
    // Generated history still has its own deterministic check and can be repaired.
    put('versions.html', 'changed generated HTML');assert.throws(() => applyRelease(dir, { check:true }), /need --refresh/);
    applyRelease(dir);assert.deepEqual(applyRelease(dir, { check:true }).sourceFingerprint, before.sourceFingerprint);
  } finally { fixture.clean(); }
});

test('the real theme generator leaves the source seal valid across deploy-origin rewrites', async () => {
  const { applyRelease } = await versionTool, fixture = releaseFixture(), { dir, put } = fixture;
  try {
    const html = '<title>Jobs</title><meta property="og:title" content="Jobs"><meta property="og:url" content="https://stillunemployed.com/jobs"><meta property="og:image" content="https://stillunemployed.com/assets/og/original.png"><meta name="twitter:title" content="Jobs"><meta name="twitter:image" content="https://stillunemployed.com/assets/og/original.png">';
    put('jobs.html', '<base href="/">' + html + '<a data-su-version href="/versions.html">Version 2</a><script src="js/release.js?v=2" defer></script>');put('tracker.html', html);
    put('scripts/gen-theme-pages.mjs', fs.readFileSync(path.join(root, 'scripts/gen-theme-pages.mjs')));
    applyRelease(dir, { seal:true });
    const before = applyRelease(dir, { bump:true, notes:['Board version links.'], date:'2026-09-06' });
    const result = spawnSync(process.execPath, [path.join(dir, 'scripts/gen-theme-pages.mjs')], { encoding:'utf8', env:{ ...process.env, CONTEXT:'branch-deploy', URL:'https://stillunemployed.com', DEPLOY_PRIME_URL:'https://123--stillunemployed.netlify.app' } });
    assert.equal(result.status, 0, result.stderr);assert(fs.existsSync(path.join(dir, 'jobs/casino/index.html')));
    const theme = fs.readFileSync(path.join(dir, 'jobs/casino/index.html'), 'utf8');
    assert.match(theme, /href="\/versions\.html#version-2-1-0"/);
    assert.match(theme, /src="js\/release\.js\?v=2\.1\.0"/);
    assert.match(theme, /<base href="\/">/);
    assert.match(fs.readFileSync(path.join(dir, 'jobs.html'), 'utf8'), /https:\/\/123--stillunemployed\.netlify\.app/);
    assert.deepEqual(applyRelease(dir, { check:true }).sourceFingerprint, before.sourceFingerprint);
  } finally { fixture.clean(); }
});

test('source symlinks cannot pull outside files into the public fingerprint', async () => {
  const { publicSourceFingerprint } = await versionTool, fixture = releaseFixture(), { dir } = fixture;
  try {
    fs.symlinkSync(path.join(dir, 'releases.json'), path.join(dir, 'js/linked.json'));
    assert.throws(() => publicSourceFingerprint(dir), /symlinks are unsupported/);
  } finally { fixture.clean(); }
});
