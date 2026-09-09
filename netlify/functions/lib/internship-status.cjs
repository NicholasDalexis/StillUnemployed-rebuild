'use strict';

const Internships = require('../../../js/internships.js');
const Identity = require('../../../js/job-identity.js');
const SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1DRfkDn_OIVlnx06xFaNpNbusXl49jvM26oJsl-qq2nU/gviz/tq?tqx=out%3Acsv&headers=1&gid=1560669113&tq=select%20C%2CK%2CV';
const LIMITS = Object.freeze({ bytes:1048576, rows:10000, timeoutMs:5000, redirects:3 });
const HEADERS = Object.freeze({
  'Content-Type':'application/json; charset=utf-8',
  'X-Content-Type-Options':'nosniff',
  'Cache-Control':'no-store',
  'CDN-Cache-Control':'no-store',
  'Netlify-CDN-Cache-Control':'no-store'
});

function unavailable() { return new Error('Internship status unavailable'); }

// Small strict parser for the fixed three-column projection. This deliberately
// does not load the share-page generator, canvas, or an operational write client.
function parseCSV(value, limits = LIMITS) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > limits.bytes) throw unavailable();
  value = value.replace(/^\uFEFF/, '');
  const rows = [];let row = [], field = '', quoted = false, closed = false;
  function cell() { row.push(field);field = '';closed = false;if (row.length > 3) throw unavailable(); }
  function line() { cell();rows.push(row);row = [];if (rows.length > limits.rows + 1) throw unavailable(); }
  function append(character) { field += character;if (field.length > 2000) throw unavailable(); }
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(character)) throw unavailable();
    if (quoted) {
      if (character === '"') {
        if (value[index + 1] === '"') { append('"');index++; }
        else { quoted = false;closed = true; }
      } else append(character);
      continue;
    }
    if (character === ',') { cell();continue; }
    if (character === '\r' || character === '\n') {
      line();if (character === '\r' && value[index + 1] === '\n') index++;continue;
    }
    if (closed) throw unavailable();
    if (character === '"') { if (field) throw unavailable();quoted = true; }
    else append(character);
  }
  if (quoted) throw unavailable();
  if (row.length || field || closed) line();
  return rows;
}

function statusIndex(csv, limits = LIMITS) {
  const rows = parseCSV(csv, limits);
  const expected = ['link', 'active/dead', 'application status'];
  if (!rows.length || rows[0].length !== 3 || rows[0].some((value, index) => value.trim().toLowerCase() !== expected[index])) throw unavailable();
  const index = new Map();
  for (const cells of rows.slice(1)) {
    if (cells.every(value => !value.trim())) continue;
    if (cells.length !== 3) throw unavailable();
    const [link, active, phase] = cells.map(value => value.trim());
    // Clearing a Link cell is a removal. No remaining row can keep that job live.
    if (!link) continue;
    if (!Internships.safeUrl(link) || active.length > 64 || phase.length > 64) throw unavailable();
    const keys = Identity.keys(link);
    if (!keys.length) throw unavailable();
    const entry = { active:active.toLowerCase() === 'active', phase:phase.toLowerCase() };
    // Even Active + Dead aliases are ambiguous. A manual dedupe must resolve them.
    for (const key of keys) if (index.has(key)) throw unavailable();
    for (const key of keys) index.set(key, entry);
  }
  return index;
}

function approvedSnapshot(snapshot, now) {
  if (!snapshot || ![1, 2].includes(snapshot.schemaVersion) || !Array.isArray(snapshot.jobs) || snapshot.jobs.length > 2000 || !['verified', 'awaiting_verification'].includes(snapshot.status)) throw unavailable();
  if (snapshot.status === 'awaiting_verification' && snapshot.jobs.length) throw unavailable();
  const jobs = Internships.jobs(snapshot, now);
  if (jobs.length !== snapshot.jobs.length) throw unavailable();
  const out = { schemaVersion:snapshot.schemaVersion, status:snapshot.status, jobs:jobs.map(Internships.publicJob) };
  const exported = Internships.dateValue(snapshot.sourceExportedAt, true);
  if (Number.isFinite(exported) && exported <= now + 300000) out.sourceExportedAt = snapshot.sourceExportedAt;
  return out;
}

function suppress(snapshot, index, checkedAt) {
  return { ...snapshot, jobs:snapshot.jobs.filter(job => {
    const matches = new Set(Identity.keys(job.link).map(key => index.get(key)).filter(Boolean));
    if (matches.size > 1) throw unavailable();
    if (!matches.size) return false;
    const status = matches.values().next().value;
    const phase = job.applicationStatus || (job.verification || {}).status;
    return status.active && ['open', 'upcoming'].includes(phase) && status.phase === phase;
  }), statusCheckedAt:new Date(checkedAt).toISOString() };
}

function allowedRedirect(url) {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    (url.hostname === 'docs.google.com' || /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.googleusercontent\.com$/.test(url.hostname));
}

async function responseText(response, limits) {
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['text/csv', 'text/plain', 'application/csv'].includes(type)) throw unavailable();
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limits.bytes)) throw unavailable();
  if (!response.body || typeof response.body.getReader !== 'function') throw unavailable();
  const reader = response.body.getReader(), chunks = [];let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limits.bytes) { await reader.cancel();throw unavailable(); }
      chunks.push(Buffer.from(part.value));
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder('utf-8', { fatal:true }).decode(Buffer.concat(chunks));
}

async function fetchStatuses(fetchImpl, now, overrides = {}) {
  const limits = { ...LIMITS, ...overrides };
  const controller = new AbortController();let timer;
  const timeout = new Promise((resolve, reject) => { timer = setTimeout(() => { controller.abort();reject(unavailable()); }, limits.timeoutMs); });
  const work = (async () => {
    let url = new URL(SOURCE_URL);url.searchParams.set('_', String(now));
    for (let redirects = 0; redirects <= limits.redirects; redirects++) {
      if (!allowedRedirect(url)) throw unavailable();
      const response = await fetchImpl(url.href, { method:'GET', redirect:'manual', credentials:'omit', cache:'no-store', signal:controller.signal, headers:{ Accept:'text/csv', 'Cache-Control':'no-cache' } });
      if (response.redirected || (response.url && !allowedRedirect(new URL(response.url)))) throw unavailable();
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (response.body) await response.body.cancel();
        if (!location || redirects === limits.redirects) throw unavailable();
        url = new URL(location, url);continue;
      }
      if (response.status !== 200) { if (response.body) await response.body.cancel();throw unavailable(); }
      return statusIndex(await responseText(response, limits), limits);
    }
    throw unavailable();
  })();
  try { return await Promise.race([work, timeout]); }
  finally { clearTimeout(timer);controller.abort(); }
}

function createHandler({ snapshot, displayCopy = {}, fetchImpl = globalThis.fetch, now = Date.now, limits } = {}) {
  return async function handler(event) {
    if (!event || event.httpMethod !== 'GET') return { statusCode:405, headers:{ ...HEADERS, Allow:'GET' }, body:JSON.stringify({ error:'Method not allowed' }) };
    try {
      const approved = approvedSnapshot(snapshot, now());
      const body = approved.jobs.length ? suppress(approved, await fetchStatuses(fetchImpl, now(), limits), now()) : approved;
      // Presentation stays server-side until this approved row survives the live
      // Sheet check. A retired posting never leaves behind a public copy entry.
      body.jobs=body.jobs.map(job=>Internships.withPresentation(job,displayCopy[job.link]));
      return { statusCode:200, headers:{ ...HEADERS }, body:JSON.stringify(body) };
    } catch (_) {
      // Never return cached jobs, source rows, upstream bodies, URLs or stack traces.
      return { statusCode:503, headers:{ ...HEADERS }, body:JSON.stringify({ error:'Internships temporarily unavailable' }) };
    }
  };
}

module.exports = { SOURCE_URL, LIMITS, parseCSV, statusIndex, approvedSnapshot, suppress, fetchStatuses, createHandler };
