// Public release numbering is separate from package.json's tooling version.
// Check: node scripts/version.mjs --check
// Refresh generated files without a bump: node scripts/version.mjs --refresh
// Seal the first finished Version 2 once: node scripts/version.mjs --seal
// Record one completed release: --bump --note "Full internal change"
// Add viewer copy explicitly: --public-title "What is new" --public-note "Visible change"
// With no public copy, a release stays out of the two-entry public history.
// Nic confirmed the three-part format at 2.5.0 on 2026-09-09.
// Patches carry after 9 without automatically changing the major.
import { readFileSync, writeFileSync, existsSync, renameSync, readdirSync, lstatSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)\.[0-9])?$/;
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const label = version => 'Version ' + version;
const anchor = version => 'version-' + version.replace(/\./g, '-');
const FINGERPRINT_ALGORITHM = 'sha256-public-source-v1';
const SOURCE_ROOTS = ['js', 'css', 'assets', '__', 'scripts', '.github', 'netlify'];
const SOURCE_EXTENSIONS = new Set(['.html', '.htm', '.css', '.scss', '.sass', '.less', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.json', '.toml', '.yaml', '.yml', '.xml', '.webmanifest', '.sh', '.py', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.webm', '.wav', '.pdf']);
const OMIT_PARTS = new Set(['node_modules', '_to_delete', 'tests', 'test', '__tests__', 'fixtures', 'docs', 'coverage', 'test-results', 'playwright-report']);

function excludedSource(path) {
  const parts = path.split('/');
  return path === 'releases.json' || path === 'versions.html' || path === 'js/release.js' || path === '_fonttest.mjs' ||
    parts[0] === 'j' || parts[0] === 'jobs' || path.startsWith('assets/og-src/') ||
    parts.some(part => OMIT_PARTS.has(part) || (part.startsWith('.') && part !== '.github')) ||
    /(?:^|\/)(?:AGENTS|CLAUDE)\.md$/i.test(path) || /(?:\.|-)(?:test|spec)\.[^.]+$/.test(path);
}
function meaningfulSource(path) {
  return !excludedSource(path) && (SOURCE_EXTENSIONS.has(extname(path).toLowerCase()) || ['_headers', '_redirects', 'robots.txt', 'CNAME'].includes(path));
}

export function inventoryPublicSource(root) {
  const candidates = new Set();
  // Include tracked public files even when a future feature adds another source
  // directory. Known public roots also admit new intended files before commit.
  try {
    const tracked = execFileSync('git', ['ls-files', '-z', '--'], { cwd:root, encoding:'utf8', stdio:['ignore', 'pipe', 'ignore'] });
    tracked.split('\0').filter(Boolean).forEach(path => { if (meaningfulSource(path)) candidates.add(path); });
  } catch (_) { /* Exported builds need no Git checkout; public roots still work. */ }
  function walk(path) {
    if (excludedSource(path)) return;
    const absolute = join(root, path), stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error('Public source symlinks are unsupported: ' + path);
    if (stat.isDirectory()) readdirSync(absolute).sort().forEach(name => walk(path + '/' + name));
    else if (stat.isFile() && meaningfulSource(path)) candidates.add(path);
  }
  for (const entry of readdirSync(root, { withFileTypes:true })) {
    if (entry.isFile() && meaningfulSource(entry.name) && !/\.(?:png|jpe?g|webp|gif|avif)$/i.test(entry.name)) candidates.add(entry.name);
    else if (SOURCE_ROOTS.includes(entry.name)) walk(entry.name);
  }
  return [...candidates].filter(path => existsSync(join(root, path))).sort().map(path => {
    if (lstatSync(join(root, path)).isSymbolicLink()) throw new Error('Public source symlinks are unsupported: ' + path);
    return path;
  });
}

function fingerprintBytes(path, bytes) {
  if (!/\.html?$/i.test(path)) return bytes;
  let html = bytes.toString('utf8');
  if (path === 'index.html' || path === 'jobs.html' || path === 'tracker.html') {
    // gen-theme-pages changes these exact origins in the build output. The
    // destination host varies per deploy; page content and paths remain covered.
    html = html.replace(/https:\/\/(?:[A-Za-z0-9-]+--)?stillunemployed\.netlify\.app\//g, 'https://stillunemployed.com/');
  }
  // Labels, history anchors and script cache keys are derived release output
  // wherever a public source page opts in, including board and tracker pages.
  return Buffer.from(refreshVersionLinks(html, 'PUBLIC_RELEASE'));
}
export function publicSourceFingerprint(root, overrides = new Map()) {
  const files = inventoryPublicSource(root).map(path => {
    const bytes = overrides.has(path) ? Buffer.from(overrides.get(path)) : readFileSync(join(root, path));
    return [path, createHash('sha256').update(fingerprintBytes(path, bytes)).digest('hex')];
  });
  return { algorithm:FINGERPRINT_ALGORITHM, digest:createHash('sha256').update(JSON.stringify(files)).digest('hex'), fileCount:files.length };
}

export function nextVersion(version) {
  if (typeof version !== 'string' || !VERSION.test(version)) throw new Error('Invalid public version: ' + version);
  const parts = version.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Version number is too large');
  if (parts.length === 1) return version + '.1.0';
  const [major, minor, patch] = parts;
  if (patch < 9) return `${major}.${minor}.${patch + 1}`;
  if (!Number.isSafeInteger(minor + 1)) throw new Error('Version number is too large');
  return `${major}.${minor + 1}.0`;
}

function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T12:00:00Z');
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}
export function validateRelease(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.releases) || !data.releases.length) throw new Error('Invalid release metadata');
  const seen = new Set();
  for (const release of data.releases) {
    nextVersion(release.version);
    if (seen.has(release.version)) throw new Error('Duplicate version in history');
    seen.add(release.version);
    if (!validDate(release.date)) throw new Error('Invalid release date');
    if (typeof release.title !== 'string' || !release.title.trim()) throw new Error('A release title is required');
    if (!Array.isArray(release.changes) || !release.changes.length || release.changes.some(note => typeof note !== 'string' || !note.trim())) throw new Error('At least one release note is required');
    if (release.public !== undefined && release.public !== false) {
      const visible = release.public;
      if (!visible || typeof visible.title !== 'string' || !visible.title.trim() || !Array.isArray(visible.changes) || !visible.changes.length || visible.changes.some(note => typeof note !== 'string' || !note.trim())) throw new Error('Public notes need an explicit title and at least one viewer-facing change');
    }
  }
  if (data.currentVersion !== data.releases[0].version) throw new Error('Current version must match the newest history entry');
  if (data.sourceFingerprint !== undefined) {
    const fingerprint = data.sourceFingerprint;
    if (!fingerprint || fingerprint.algorithm !== FINGERPRINT_ALGORITHM || !/^[a-f0-9]{64}$/.test(fingerprint.digest) || !Number.isSafeInteger(fingerprint.fileCount) || fingerprint.fileCount < 1) throw new Error('Invalid public-source fingerprint');
  }
  return data;
}
export function easternDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function bumpRelease(data, { notes, title = 'Small improvements', date = easternDate(), publicNotes = [], publicTitle } = {}) {
  validateRelease(data);
  if (!Array.isArray(notes) || !notes.length || notes.some(note => typeof note !== 'string' || !note.trim())) throw new Error('--bump needs at least one --note');
  if (!Array.isArray(publicNotes) || publicNotes.some(note => typeof note !== 'string' || !note.trim())) throw new Error('Invalid public notes');
  if (publicNotes.length && (typeof publicTitle !== 'string' || !publicTitle.trim())) throw new Error('--public-note needs --public-title');
  if (publicTitle !== undefined && !publicNotes.length) throw new Error('--public-title needs at least one --public-note');
  const version = nextVersion(data.currentVersion);
  const release = { version, date, title, changes:notes.map(note => note.trim()) };
  if (publicNotes.length) release.public = { title:publicTitle.trim(), changes:publicNotes.map(note => note.trim()) };
  return validateRelease({ ...data, currentVersion:version, releases:[release, ...data.releases] });
}

// Full notes are build-only. A release is public only after a writer explicitly
// supplies viewer-facing copy; do not guess from technical keywords or dates.
export function publicReleaseData(data) {
  validateRelease(data);
  const result = {
    schemaVersion:1,
    currentVersion:data.currentVersion,
    releases:data.releases.filter(release => release.public).slice(0,2).map(release => ({
      version:release.version, date:release.date,
      title:release.public.title, changes:[...release.public.changes]
    }))
  };
  if (data.sourceFingerprint) result.sourceFingerprint = {
    algorithm:data.sourceFingerprint.algorithm, digest:data.sourceFingerprint.digest, fileCount:data.sourceFingerprint.fileCount
  };
  return result;
}

export function renderReleaseScript(data) {
  validateRelease(data);
  return `/* Generated from releases.json by scripts/version.mjs. */
(function () {
  'use strict';
  var version = ${JSON.stringify(data.currentVersion)};
  function render() {
    document.querySelectorAll('[data-su-version]').forEach(function (link) {
      link.textContent = 'Version ' + version;
      link.setAttribute('href', '/versions.html#version-' + version.replace(/\\./g, '-'));
      link.setAttribute('aria-label', 'Version ' + version + '. Explore Version 2 features');
    });
  }
  // The board calls render after replacing its markup. No observer is needed.
  window.SURelease = Object.freeze({ version: version, render: render });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
`;
}

export function renderHistory(data) {
  validateRelease(data);
  // This is a durable feature overview, not a patch feed. Full release notes
  // remain in build-only metadata; publicReleaseData keeps its separate contract.
  const features = [
    ['Advice notes', 'A little help between applications. Open a note for practical job-hunt advice.'],
    ['More themes', 'Make the board feel like you. Pick a look, from the original notebook to Casino, Mermaid and more.'],
    ['Internships', 'A place for your first step. Browse internships and see the pay, timing and requirements.'],
    ['Job tracker', 'Applications, interviews, offers. Keep your progress and notes in one place.'],
    ['Google sign-in', 'Keep your saved jobs and tracker together on your phone or computer.'],
    ['Your preferences', 'Tell the board what you want to explore. Your answers help sort roles without ruling you out.'],
    ['Show hidden jobs', 'Changed your mind? Use the Board menu to see roles you dismissed and bring them back.'],
    ['Suggest Jobs', 'Know a role worth sharing? Send it through Suggest Jobs for review.']
  ];
  const cards = features.map(([title, description], index) => `    <article aria-labelledby="feature-${index + 1}">
      <h2 id="feature-${index + 1}">${esc(title)}</h2>
      <p>${esc(description)}</p>
    </article>`).join('\n');
  const arrow = '<svg class="drawn-arrow" viewBox="0 0 48 20" aria-hidden="true" focusable="false"><path d="M3 12c12-3 25-3 40-2M35 3l9 7-10 7"/></svg>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Version 2 | StillUnemployed.com</title>
  <meta name="description" content="Explore Version 2: advice notes, themes, internships, your job tracker and more ways to make the board yours.">
  <link rel="stylesheet" href="/css/brand.css">
  <style>
    *{box-sizing:border-box}body{margin:0;background:var(--su-bg);color:var(--su-ink);font:400 16px/1.6 var(--su-body)}
    main{max-width:880px;margin:auto;padding:24px 24px 64px;scroll-margin-top:24px}nav{display:flex;justify-content:space-between;gap:12px 20px;flex-wrap:wrap;margin-bottom:28px}
    a{color:var(--su-orange-text);text-underline-offset:4px}nav a{display:inline-flex;align-items:center;gap:8px;min-height:44px;font:400 22px/1.25 var(--su-hand)}nav a:first-child{color:var(--su-ink)}
    h1,h2,p{margin:0}h1{display:inline-block;font:400 clamp(40px,8vw,56px)/1.15 var(--su-hand);text-decoration:underline;text-decoration-color:var(--su-yellow);text-decoration-thickness:6px;text-underline-offset:5px}.intro{max-width:54ch;margin-top:16px}.current-version{margin:12px 0 28px;color:var(--su-muted);font-size:14px}
    .features{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}article{min-width:0;padding:22px 24px 24px;border-left:2px solid var(--su-orange);background:var(--su-paper);box-shadow:var(--su-note-shadow);overflow-wrap:anywhere}h2{font:400 29px/1.25 var(--su-hand);margin-bottom:10px}article p{line-height:1.6}
    .drawn-arrow{width:36px;height:20px;flex:none;fill:none;stroke:var(--su-orange);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}footer{display:flex;gap:8px 24px;flex-wrap:wrap;margin-top:32px;font-size:14px}footer a{display:inline-flex;align-items:center;gap:8px;min-height:44px}
    a:focus-visible{outline:3px solid var(--su-orange);outline-offset:4px;border-radius:2px}@media(max-width:600px){main{padding:20px 16px 48px}.features{grid-template-columns:minmax(0,1fr);gap:16px}article{padding:20px}.current-version{margin-bottom:24px}}
  </style>
</head>
<body>
  <main id="${anchor(data.currentVersion)}">
    <nav aria-label="Site navigation"><a href="/index.html">StillUnemployed.com</a><a href="/jobs.html">Just jobs ${arrow}</a></nav>
    <h1>Version 2</h1>
    <p class="intro">More ways to find a role and keep your job hunt together.</p>
    <p class="current-version">Current board version ${esc(data.currentVersion)}</p>
    <section class="features" aria-label="Version 2 features">
${cards}
    </section>
    <footer><a href="/style-guide.html">For designers: check out our style guide ${arrow}</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/index.html">Home</a></footer>
  </main>
</body>
</html>
`;
}

export function refreshVersionLinks(html, version) {
  return html.replace(/(<a\b[^>]*\bdata-su-version(?=\s|=|>)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*>)[^<]*(<\/a>)/g, (_match, open, close) => {
    const attributes = open.slice(0, -1).replace(/\s+(?:href|aria-label)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return attributes + ' href="/versions.html#' + anchor(version) + '" aria-label="' + esc(label(version) + '. Explore Version 2 features') + '">' + label(version) + close;
  })
    .replace(/(js\/release\.js\?v=)[^"'\s>]+/g, (_match, prefix) => prefix + version);
}
export function applyRelease(root = ROOT, options = {}) {
  const metadataPath = join(root, 'releases.json');
  const original = readFileSync(metadataPath, 'utf8');
  let data = validateRelease(JSON.parse(original));
  if (options.bump && options.seal) throw new Error('Choose either --seal or --bump');
  if (options.seal && (data.sourceFingerprint || data.currentVersion !== '2' || data.releases.length !== 1)) throw new Error('--seal is only for the unsealed initial Version 2. Use --bump for later changes.');
  if (options.bump && !data.sourceFingerprint) throw new Error('Seal the initial Version 2 before recording a later release.');
  if (options.bump) data = bumpRelease(data, options);
  const files = new Map([
    ['js/release.js', renderReleaseScript(data)],
    ['versions.html', renderHistory(data)]
  ]);
  // Keep every opted-in static page correct even with JavaScript disabled.
  // Generated /j and /jobs pages stay excluded and inherit their source page.
  for (const path of inventoryPublicSource(root).filter(path => /\.html?$/i.test(path))) {
    files.set(path, refreshVersionLinks(readFileSync(join(root, path), 'utf8'), data.currentVersion));
  }
  const fingerprint = publicSourceFingerprint(root, files);
  if (options.seal || options.bump) {
    data = validateRelease({ ...data, sourceFingerprint:fingerprint });
    files.set('releases.json', JSON.stringify(data, null, 2) + '\n');
  } else if (data.sourceFingerprint && (data.sourceFingerprint.digest !== fingerprint.digest || data.sourceFingerprint.fileCount !== fingerprint.fileCount)) {
    throw new Error('Public source changed after ' + label(data.currentVersion) + ' was sealed. Use --bump --note "What changed"; --refresh cannot accept source changes.');
  } else if (options.check && !data.sourceFingerprint) {
    throw new Error('Version 2 is unsealed. Finish this initial release, then run --seal once before deployment.');
  }
  const changed = [...files].filter(([file, content]) => !existsSync(join(root, file)) || readFileSync(join(root, file), 'utf8') !== content);
  if (options.check) {
    if (changed.length) throw new Error('Release files need --refresh: ' + changed.map(([file]) => file).join(', '));
    return { version:data.currentVersion, changed:[], sourceFingerprint:data.sourceFingerprint };
  }
  // Prepare every output before replacing any destination. Metadata is written
  // last; --check detects a partial interruption before a future deployment.
  const staged = changed.map(([file, content]) => {
    const target = join(root, file), temporary = target + '.release-' + process.pid + '.tmp';
    writeFileSync(temporary, content);
    return { temporary, target };
  });
  staged.forEach(({ temporary, target }) => renameSync(temporary, target));
  return { version:data.currentVersion, changed:changed.map(([file]) => file), sourceFingerprint:data.sourceFingerprint };
}

function main(args) {
  const options = { notes:[], publicNotes:[] };
  let mode = '--check';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--check' || arg === '--refresh' || arg === '--seal' || arg === '--bump') {
      if (options.mode) throw new Error('Choose one of --check, --refresh, --seal or --bump');
      mode = arg; options.mode = true;
    } else if (arg === '--note' || arg === '--title' || arg === '--date' || arg === '--public-note' || arg === '--public-title') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(arg + ' needs a value');
      if (arg === '--note') options.notes.push(value);
      else if (arg === '--public-note') options.publicNotes.push(value);
      else if (arg === '--public-title') options.publicTitle = value;
      else options[arg.slice(2)] = value;
    } else throw new Error('Unknown option: ' + arg);
  }
  if (mode !== '--bump' && (options.notes.length || options.publicNotes.length || options.publicTitle || options.title || options.date)) throw new Error('Release notes, title and date require --bump');
  const result = applyRelease(ROOT, { ...options, check:mode === '--check', seal:mode === '--seal', bump:mode === '--bump' });
  console.log(label(result.version) + (mode === '--check' ? ' checked.' : result.changed.length ? ' updated: ' + result.changed.join(', ') : ' already current.'));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error('version:', error.message); process.exitCode = 1; }
}
