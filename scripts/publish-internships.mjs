#!/usr/bin/env node
// Manual, offline publication from a complete private export. Provenance is an
// operator-verified receipt, not a live Sheet read or authentication mechanism.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import projection from './lib/internship-projection.cjs';
import internships from '../js/internships.js';
import identity from '../js/job-identity.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EXPECTED_SOURCE = Object.freeze({
  spreadsheetId:'1DRfkDn_OIVlnx06xFaNpNbusXl49jvM26oJsl-qq2nU',
  sheetId:1560669113,
  sheetTitle:'Internships'
});
const OUTPUT = 'internships-data.json';
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const PUBLICATION_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const within = (parent, child) => child === parent || child.startsWith(parent + path.sep);
const fail = message => { throw new Error(message); };

export function createSnapshot(input, { now = Date.now() } = {}) {
  const source = input?.source, provenance = source?.provenance;
  if (!object(input) || !object(source) || source.schemaVersion !== 2 || !object(provenance)) fail('A schema2 operational source and provenance receipt are required.');
  if (Object.entries(EXPECTED_SOURCE).some(([key, value]) => provenance[key] !== value)) fail('Source must be the approved operational Internships workbook and tab.');
  const exportedAt = internships.dateValue(provenance.exportedAt, true);
  if (!Number.isFinite(now) || !Number.isFinite(exportedAt) || exportedAt > now + CLOCK_SKEW_MS || provenance.fullSnapshot !== true) fail('A complete source snapshot with a valid export timestamp is required.');
  // Publication needs current evidence. This gate never expires or removes an
  // already-published row merely because its earlier receipt grows older.
  if (exportedAt < now - PUBLICATION_FRESHNESS_MS) fail('The complete operational export must be from the last 24 hours.');
  if (!object(input.publication) || input.publication.approved !== true || (input.publication.allowEmpty !== undefined && typeof input.publication.allowEmpty !== 'boolean')) fail('Explicit publication approval is required.');
  if (!Array.isArray(source.headers) || source.headers.length !== projection.HEADERS.length || !source.headers.every(value => typeof value === 'string')) fail('The complete 27-column operational header contract is required.');
  const headers = source.headers.map(value => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length || projection.HEADERS.some(name => !headers.includes(name.toLowerCase()))) fail('Operational headers do not match the Internships contract.');
  if (!Array.isArray(source.rows) || !Array.isArray(input.admissions) || source.rows.length !== input.admissions.length) fail('Each source row requires a corresponding admission or null.');
  const activeIndex = headers.indexOf('active/dead'), statusIndex = headers.indexOf('application status'), linkIndex = headers.indexOf('link');
  const rows = [], admissions = [];
  const rowsByIdentity = new Map();
  source.rows.forEach((values, index) => {
    if (!Array.isArray(values) || values.length !== headers.length) fail('Every source row must match the full operational header width.');
    const keys = internships.safeUrl(values[linkIndex]) ? identity.keys(values[linkIndex]) : [];
    for (const key of keys) {
      const prior = rowsByIdentity.get(key);
      if (prior !== undefined) fail('Canonical identity collision at source rows ' + (prior + 2) + ' and ' + (index + 2) + '. Reconcile the Sheet before publication.');
      rowsByIdentity.set(key, index);
    }
    // Removal and unreviewed states take precedence over any older admission.
    if (values[activeIndex] !== 'Active' || !['Open', 'Upcoming'].includes(values[statusIndex])) return;
    const checkedAt = internships.dateValue(input.admissions[index]?.checkedAt, true);
    if (!Number.isFinite(checkedAt) || checkedAt < now - PUBLICATION_FRESHNESS_MS || checkedAt > now + CLOCK_SKEW_MS || checkedAt > exportedAt + CLOCK_SKEW_MS) fail('Publication validation failed. Included source checks must be from the last 24 hours and precede the operational export.');
    rows.push(values);admissions.push(input.admissions[index]);
  });
  let feed;
  try { feed = projection.projectFeed({ schemaVersion:2, headers:source.headers, rows }, admissions, { now }); }
  catch { fail('Publication validation failed. Check included rows, admission receipts and canonical duplicates.'); }
  if (!feed.jobs.length && input.publication.allowEmpty !== true) fail('Empty replacement requires publication.allowEmpty: true after explicit review.');
  // Only approved public fields and a non-sensitive monotonic export time leave
  // this boundary. Never copy the input envelope, provenance IDs or receipts.
  const snapshot = { schemaVersion:2, status:'verified', sourceExportedAt:new Date(exportedAt).toISOString(), jobs:feed.jobs };
  if (internships.jobs(snapshot, now).length !== rows.length) fail('The final public snapshot did not validate completely.');
  return { snapshot, included:rows.length, excluded:source.rows.length - rows.length };
}

function readInput(inputPath, root) {
  if (typeof inputPath !== 'string' || !path.isAbsolute(inputPath)) fail('--input must name an absolute private JSON file.');
  const absolute = path.resolve(inputPath);
  if (within(root, absolute)) fail('Keep private exports outside the site repository.');
  let real, entry, stat;
  try { entry = path.join(fs.realpathSync(path.dirname(absolute)), path.basename(absolute));real = fs.realpathSync(absolute);stat = fs.statSync(real); }
  catch { fail('The private input file could not be read.'); }
  if (within(root, entry) || within(root, real)) fail('Keep private exports outside the site repository.');
  if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) fail('Input must be a regular JSON file no larger than 16 MiB.');
  try { return JSON.parse(fs.readFileSync(real, 'utf8')); }
  catch { fail('The private input file is not readable JSON.'); }
}

function existingSnapshot(output) {
  let stat;
  try { stat = fs.lstatSync(output); }
  catch (error) { if (error.code === 'ENOENT') return null;fail('The existing public snapshot could not be inspected.'); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('The public snapshot destination must be a regular file.');
  try { const bytes = fs.readFileSync(output, 'utf8');return { bytes, data:JSON.parse(bytes) }; }
  catch { fail('The existing public snapshot is unreadable; preserve it and investigate before replacing.'); }
}

function comparePrevious(previous, snapshot, bytes) {
  if (!previous) return false;
  if (previous.bytes === bytes) return true;
  if (previous.data.sourceExportedAt !== undefined) {
    const last = internships.dateValue(previous.data.sourceExportedAt, true), next = Date.parse(snapshot.sourceExportedAt);
    if (!Number.isFinite(last)) fail('The existing snapshot export timestamp is invalid.');
    if (next <= last) fail('Export is older than, or conflicts with, the last publication. Obtain a fresh complete export.');
  }
  return false;
}

// root is injectable for isolated filesystem tests. The CLI always uses ROOT;
// there is intentionally no --output flag and no network or deployment path.
export function publish({ inputPath, check = false, root = ROOT, now = Date.now() }) {
  root = fs.realpathSync(root);
  const result = createSnapshot(readInput(inputPath, root), { now });
  const bytes = JSON.stringify(result.snapshot, null, 2) + '\n';
  const output = path.join(root, OUTPUT);
  if (check) {
    const unchanged = comparePrevious(existingSnapshot(output), result.snapshot, bytes);
    return { mode:'check', included:result.included, excluded:result.excluded, unchanged };
  }
  const lock = path.join(root, '.internships-data.publish.lock');
  const temp = path.join(root, '.internships-data.' + randomUUID() + '.tmp');
  let lockFd, tempFd;
  try {
    try { lockFd = fs.openSync(lock, 'wx', 0o600); }
    catch { fail('Another publication may be running. Inspect the local publication lock before retrying.'); }
    const unchanged = comparePrevious(existingSnapshot(output), result.snapshot, bytes);
    if (!unchanged) {
      try {
        tempFd = fs.openSync(temp, 'wx', 0o644);
        fs.writeFileSync(tempFd, bytes, 'utf8');fs.fsyncSync(tempFd);
        fs.closeSync(tempFd);tempFd = undefined;
        // This is the only operation that changes the public destination.
        fs.renameSync(temp, output);
      } catch { fail('Atomic publication failed; the previous public snapshot was not replaced.'); }
    }
    return { mode:'write', included:result.included, excluded:result.excluded, unchanged };
  } finally {
    if (tempFd !== undefined) { try { fs.closeSync(tempFd); } catch {} }
    try { fs.unlinkSync(temp); } catch {}
    if (lockFd !== undefined) {
      try { fs.closeSync(lockFd); } catch {}
      try { fs.unlinkSync(lock); } catch {}
    }
  }
}

function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node scripts/publish-internships.mjs --input /absolute/private/export.json [--check]\nWrites only internships-data.json after complete validation. No network, deployment or version changes.\nEnvelope: source {schemaVersion:2, provenance {spreadsheetId, sheetId, sheetTitle, exportedAt, fullSnapshot:true}, headers, rows}, admissions [receipt or null per row], publication {approved:true, allowEmpty:false}.\nExport and included source checks must be from the last 24 hours; checks must precede the export, allowing 5 minutes of clock skew. Reconcile canonical duplicates across all source statuses.\nUse publication.allowEmpty:true only for an explicitly reviewed empty replacement. Obtain a fresh complete export after Sheet removals.');
    return;
  }
  let inputPath, check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && inputPath === undefined && args[i + 1] && !args[i + 1].startsWith('--')) inputPath = args[++i];
    else if (args[i] === '--check' && !check) check = true;
    else fail('Usage: --input /absolute/private/export.json [--check]. No other flags are accepted.');
  }
  const result = publish({ inputPath, check });
  console.log(JSON.stringify(result));
}

let isMain = false;
try { isMain = !!process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch {}
if (isMain) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message);process.exitCode = 1; }
}
