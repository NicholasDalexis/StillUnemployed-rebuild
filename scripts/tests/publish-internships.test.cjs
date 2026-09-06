const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const P = require('../lib/internship-projection.cjs');
const api = import('../publish-internships.mjs');
const NOW = Date.parse('2030-09-06T16:00:00Z');
const STAMP = '2030-09-06T15:50:00Z';
const PROVENANCE = { spreadsheetId:'1DRfkDn_OIVlnx06xFaNpNbusXl49jvM26oJsl-qq2nU', sheetId:1560669113, sheetTitle:'Internships', exportedAt:STAMP, fullSnapshot:true };

function row(extra = {}) {
  return { ...Object.fromEntries(P.HEADERS.map(key => [key, ''])), Company:'Example Studio', 'Job Title':'Design Intern',
    Link:'https://job-boards.greenhouse.io/example/jobs/12345', Location:'Remote, US', Type:'Remote', Salary:'$22.50/hour',
    Category:'Video & Creative', Description:'Employer role summary', 'Years of Experience':'See eligibility', Pick:'FALSE',
    'Active/Dead':'Active', 'TL;DR':'Prepare visual concepts\nRevise production files', Cycle:'Winter 2031',
    'Eligibility Flags':'Current students\nUS work authorization required', 'College Credit':'Not listed', 'Pay Basis':'hour',
    'Pay Status':'Paid', Benefits:'Transit allowance', 'Application Status':'Open', 'Applications Open':'Open now',
    'Start Date':'Winter 2031', 'Application Deadline':'Rolling', 'Timing Source':'https://example.org/internships', ...extra };
}
function admission(record, extra = {}) {
  return { publicationApproved:true, officialSourceChecked:true, sourceLink:record.Link, sourceUrl:'https://example.org/internships',
    timingSourceUrl:'https://example.org/internships', checkedAt:'2030-09-06T15:00:00Z', applicationStatus:'open', ...extra };
}
function envelope(records = [row()]) {
  return { source:{ schemaVersion:2, provenance:{ ...PROVENANCE }, headers:[...P.HEADERS], rows:records.map(record => P.HEADERS.map(key => record[key])) },
    admissions:records.map(record => admission(record)), publication:{ approved:true, allowEmpty:false } };
}
function sandbox(t, input = envelope()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'su-internship-publish-'));
  t.after(() => fs.rmSync(dir, { recursive:true, force:true }));
  const root = path.join(dir, 'site');fs.mkdirSync(root);
  const inputPath = path.join(dir, 'private-export.json'), output = path.join(root, 'internships-data.json');
  const previous = JSON.stringify({ schemaVersion:1, status:'verified', jobs:[{ link:'https://example.org/previous' }] }) + '\n';
  fs.writeFileSync(output, previous);
  const write = value => fs.writeFileSync(inputPath, JSON.stringify(value));write(input);
  return { root, inputPath, output, previous, write, invoke:async options => (await api).publish({ inputPath, root, now:NOW, ...options }) };
}

test('manual publication writes a validated public snapshot and check performs no writes', async t => {
  const b = sandbox(t), before = fs.readFileSync(b.output, 'utf8');
  const check = await b.invoke({ check:true });assert.equal(check.included, 1);
  assert.equal(fs.readFileSync(b.output, 'utf8'), before);assert.deepEqual(fs.readdirSync(b.root), ['internships-data.json']);
  const result = await b.invoke();assert.equal(result.mode, 'write');assert.equal(result.unchanged, false);
  const output = JSON.parse(fs.readFileSync(b.output, 'utf8'));
  assert.equal(output.schemaVersion, 2);assert.equal(output.status, 'verified');assert.equal(output.jobs[0].pay, '$22.50/hour');
  assert.equal(output.sourceExportedAt, '2030-09-06T15:50:00.000Z');assert.equal(output.jobs[0].startDateISO, undefined);
  assert.equal((await b.invoke()).unchanged, true, 'identical replays are no-ops');
  assert.deepEqual(fs.readdirSync(b.root), ['internships-data.json']);
});

test('manual removals and held statuses disappear; absent previous rows are never merged back', async t => {
  const rows = [row(), ...[
    { 'Active/Dead':'Dead' }, { 'Active/Dead':'' }, { 'Application Status':'Closed' },
    { 'Application Status':'Unknown' }, { 'Application Status':'' }
  ].map((change, index) => row({ Link:'https://example.org/program/' + index, ...change }))];
  const input = envelope(rows);
  input.admissions = input.admissions.map((receipt, index) => index === 0 ? receipt : null);
  const b = sandbox(t, input), result = await b.invoke();
  assert.equal(result.included, 1);assert.equal(result.excluded, 5);
  assert.deepEqual(JSON.parse(fs.readFileSync(b.output, 'utf8')).jobs.map(job => job.link), [rows[0].Link]);
  assert(!fs.readFileSync(b.output, 'utf8').includes('previous'));
});

test('empty replacement requires separate explicit review and then publishes a verified empty snapshot', async t => {
  const input = envelope([row({ 'Active/Dead':'Dead' })]);input.admissions = [null];
  const b = sandbox(t, input);
  await assert.rejects(b.invoke(), /allowEmpty/);assert.equal(fs.readFileSync(b.output, 'utf8'), b.previous);
  input.publication.allowEmpty = true;b.write(input);await b.invoke();
  const out = JSON.parse(fs.readFileSync(b.output, 'utf8'));assert.equal(out.status, 'verified');assert.deepEqual(out.jobs, []);
  const pure = (await api).createSnapshot({ ...input, source:{ ...input.source, rows:[] }, admissions:[] }, { now:NOW });
  assert.equal(pure.included, 0);
});

test('wrong workbook, tab, incomplete export, invalid date or missing publication approval cannot replace prior data', async t => {
  const b = sandbox(t);
  const cases = [
    input => { input.source.provenance.spreadsheetId = 'golden-review-workbook'; },
    input => { input.source.provenance.sheetId = 2134483974; },
    input => { input.source.provenance.sheetTitle = 'Untitled'; },
    input => { input.source.provenance.sheetId = '1560669113'; },
    input => { input.source.provenance.fullSnapshot = false; },
    input => { input.source.provenance.exportedAt = 'yesterday'; },
    input => { input.source.provenance.exportedAt = '2035-01-01T00:00:00Z'; },
    input => { input.publication.approved = false; },
    input => { input.source.schemaVersion = 1; }
  ];
  for (const mutate of cases) {
    const input = envelope();mutate(input);b.write(input);await assert.rejects(b.invoke());
    assert.equal(fs.readFileSync(b.output, 'utf8'), b.previous);assert.deepEqual(fs.readdirSync(b.root), ['internships-data.json']);
  }
});

test('fulltime or malformed headers fail while reordered exact internship headers preserve the same output', async () => {
  const { createSnapshot } = await api, input = envelope(), original = createSnapshot(input, { now:NOW });
  input.source.headers.reverse();input.source.rows.forEach(values => values.reverse());
  assert.deepEqual(createSnapshot(input, { now:NOW }), original);
  for (const mutate of [
    value => { value.source.headers = value.source.headers.slice(0, 15); },
    value => { value.source.headers[0] = 'Company';value.source.headers[1] = ' company '; },
    value => { value.source.rows[0].pop(); },
    value => { value.admissions = []; }
  ]) { const bad = envelope();mutate(bad);assert.throws(() => createSnapshot(bad, { now:NOW })); }
});

test('missing admission, invalid fields and duplicate canonical postings fail the whole publication', async t => {
  const b = sandbox(t);
  const duplicate = row({ Link:'https://boards.greenhouse.io/example/jobs/12345?utm_source=alias' });
  const cases = [envelope([row(), duplicate]), envelope([row({ Salary:'$60/month' })]), envelope([row({ Link:'javascript:alert(1)' })]), envelope()];
  cases.at(-1).admissions[0] = null;
  for (const input of cases) {
    b.write(input);await assert.rejects(b.invoke(), /Publication validation failed|Canonical identity collision/);
    assert.equal(fs.readFileSync(b.output, 'utf8'), b.previous);
  }
  b.write(envelope([row(), row({ Link:'https://boards.greenhouse.io/example/jobs/54321' })]));
  assert.equal((await b.invoke()).included, 2, 'distinct requisitions remain distinct');
});

test('an Active alias cannot resurrect a Dead, Closed or unconfirmed canonical posting', async t => {
  const b = sandbox(t);
  for (const change of [{ 'Active/Dead':'Dead' }, { 'Application Status':'Closed' }, { 'Application Status':'Unknown' }, { 'Application Status':'' }]) {
    const alias = row({ Link:'https://boards.greenhouse.io/example/jobs/12345', ...change });
    const input = envelope([row(), alias]);input.admissions[1] = null;b.write(input);
    await assert.rejects(b.invoke(), /Canonical identity collision.*source rows 2 and 3/);
    assert.equal(fs.readFileSync(b.output, 'utf8'), b.previous);
  }
});

test('duplicate excluded identities fail before a snapshot can reach the stricter hosted catalog', async t => {
  const input = envelope([row(), row({ Link:'https://example.org/held', 'Application Status':'Unknown' }), row({ Link:'https://example.org/held?utm_source=alias', 'Application Status':'Unknown' })]);
  input.admissions[1] = null;input.admissions[2] = null;
  const b = sandbox(t, input);
  await assert.rejects(b.invoke(), /Canonical identity collision.*source rows 3 and 4/);
  assert.equal(fs.readFileSync(b.output, 'utf8'), b.previous);
});

test('publication requires a recent complete export and source receipts from before that export', async t => {
  const b = sandbox(t);
  const cases = [
    input => { input.source.provenance.exportedAt = '2030-09-05T15:59:59Z'; },
    input => { input.admissions[0].checkedAt = '2030-09-05T15:59:59Z'; },
    input => { input.admissions[0].checkedAt = '2030-09-06T15:55:01Z'; },
    input => { input.admissions[0].checkedAt = '2030-09-06T16:05:01Z'; },
    input => { input.admissions[0].checkedAt = '2030-09-06'; }
  ];
  for (const mutate of cases) {
    const input = envelope();mutate(input);b.write(input);
    await assert.rejects(b.invoke(), /24 hours|Publication validation failed/);
    assert.equal(fs.readFileSync(b.output, 'utf8'), b.previous);
    assert.deepEqual(fs.readdirSync(b.root), ['internships-data.json']);
  }
  const boundary = envelope();boundary.source.provenance.exportedAt = '2030-09-05T16:00:00Z';boundary.admissions[0].checkedAt = '2030-09-05T16:00:00Z';
  b.write(boundary);assert.equal((await b.invoke({ check:true })).included, 1, '24-hour boundary is included');
  const skew = envelope();skew.admissions[0].checkedAt = '2030-09-06T15:55:00Z';
  b.write(skew);assert.equal((await b.invoke({ check:true })).included, 1, 'bounded timestamp skew is allowed');
  const removal = envelope([row(), row({ Link:'https://example.org/retired', 'Active/Dead':'Dead' })]);
  removal.admissions[1].checkedAt = '2020-01-01T00:00:00Z';
  b.write(removal);assert.equal((await b.invoke()).excluded, 1, 'old receipts never block an explicit removal');
});

test('private notes and admissions never appear in successful output or validation error text', async t => {
  const record = row({ 'Application Status':'Upcoming', 'Applications Open':'Not announced', 'TL;DR':'',
    'Timing Source':'https://example.org/internships\nPRIVATE_TIMING_QUOTE', 'Upcoming Brand Basis':'PRIVATE_BRAND_RATIONALE' });
  const input = envelope([record]);input.privateNote = 'PRIVATE_TOP_LEVEL';input.source.provenance.privatePath = '/PRIVATE/local/receipt';
  input.admissions[0] = admission(record, { applicationStatus:'upcoming', sourceAnnounced:true, cohortEvidence:'PRIVATE_COHORT',
    announcementEvidence:'PRIVATE_ANNOUNCEMENT', brandApproval:{ basis:'PRIVATE_BRAND', reference:'PRIVATE_REFERENCE' },
    humanReview:{ decision:'approved', reviewer:'PRIVATE_REVIEWER', reference:'PRIVATE_NOTE', checkedAt:'2030-09-06T14:00:00Z' } });
  const b = sandbox(t, input);await b.invoke();const publicText = fs.readFileSync(b.output, 'utf8');
  assert.doesNotMatch(publicText, /PRIVATE|spreadsheetId|sheetId|admissions|publicationApproved|brandApproval/);
  assert.equal(JSON.parse(publicText).jobs[0].verification.reviewerType, 'human');
  input.admissions[0].sourceLink = 'PRIVATE_WRONG_LINK';b.write(input);
  await assert.rejects(b.invoke(), error => !/PRIVATE/.test(error.message));assert.equal(fs.readFileSync(b.output, 'utf8'), publicText);
});

test('older exports and same-time conflicting output cannot resurrect rows after a newer replacement', async t => {
  const input = envelope(), b = sandbox(t, input);await b.invoke();
  input.source.rows[0][P.HEADERS.indexOf('Salary')] = '$24/hour';
  for (const stamp of ['2030-09-06T15:49:00Z', STAMP]) {
    input.source.provenance.exportedAt = stamp;b.write(input);
    await assert.rejects(b.invoke(), /fresh complete export/);
    assert.equal(JSON.parse(fs.readFileSync(b.output, 'utf8')).jobs[0].pay, '$22.50/hour');
  }
  input.source.provenance.exportedAt = '2030-09-06T15:55:00Z';b.write(input);await b.invoke();
  assert.equal(JSON.parse(fs.readFileSync(b.output, 'utf8')).jobs[0].pay, '$24/hour');
});

test('failed atomic rename preserves prior bytes and removes its temporary file and lock', async t => {
  const b = sandbox(t);
  t.mock.method(fs, 'renameSync', (temporary, destination) => {
    assert.equal(destination, b.output);assert.equal(fs.readFileSync(b.output, 'utf8'), b.previous);
    const candidate = JSON.parse(fs.readFileSync(temporary, 'utf8'));assert.equal(candidate.jobs.length, 1);
    throw new Error('Synthetic filesystem refusal');
  });
  await assert.rejects(b.invoke(), /Atomic publication failed/);
  assert.equal(fs.readFileSync(b.output, 'utf8'), b.previous);assert.deepEqual(fs.readdirSync(b.root), ['internships-data.json']);
});

test('existing publication lock and unsafe destination preserve the snapshot and foreign lock', async t => {
  const b = sandbox(t), lock = path.join(b.root, '.internships-data.publish.lock');
  fs.writeFileSync(lock, 'another publisher');await assert.rejects(b.invoke(), /publication may be running/);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'another publisher');assert.equal(fs.readFileSync(b.output, 'utf8'), b.previous);
  fs.unlinkSync(lock);fs.unlinkSync(b.output);fs.symlinkSync(b.inputPath, b.output);
  const inputBefore = fs.readFileSync(b.inputPath, 'utf8');await assert.rejects(b.invoke(), /regular file/);
  assert.equal(fs.readFileSync(b.inputPath, 'utf8'), inputBefore);assert.equal(fs.lstatSync(b.output).isSymbolicLink(), true);
});

test('private input must be explicit, readable and outside the public repository', async t => {
  const b = sandbox(t);
  await assert.rejects(b.invoke({ inputPath:undefined }), /absolute private JSON/);
  await assert.rejects(b.invoke({ inputPath:'relative.json' }), /absolute private JSON/);
  fs.writeFileSync(b.inputPath, '{ PRIVATE invalid JSON');
  await assert.rejects(b.invoke(), error => /not readable JSON/.test(error.message) && !/PRIVATE/.test(error.message));
  const inside = path.join(b.root, 'private.json');fs.writeFileSync(inside, JSON.stringify(envelope()));
  await assert.rejects(b.invoke({ inputPath:inside }), /outside the site repository/);
  const outsideLink = path.join(path.dirname(b.inputPath), 'linked.json');fs.symlinkSync(inside, outsideLink);
  await assert.rejects(b.invoke({ inputPath:outsideLink }), /outside the site repository/);
  const insideLink = path.join(b.root, 'private-link.json');fs.symlinkSync(b.inputPath, insideLink);
  await assert.rejects(b.invoke({ inputPath:insideLink }), /outside the site repository/);
  assert.equal(fs.readFileSync(b.output, 'utf8'), b.previous);
});

test('CLI rejects undeclared output/network flags and publishes only to its own repository snapshot', t => {
  const b = sandbox(t);fs.mkdirSync(path.join(b.root, 'scripts/lib'), { recursive:true });fs.mkdirSync(path.join(b.root, 'js'));
  const repo = path.resolve(__dirname, '../..');
  for (const file of ['scripts/publish-internships.mjs','scripts/lib/internship-projection.cjs','js/internships.js','js/job-identity.js']) fs.copyFileSync(path.join(repo, file), path.join(b.root, file));
  const cli = path.join(b.root, 'scripts/publish-internships.mjs');
  const run = args => spawnSync(process.execPath, [cli, ...args], { encoding:'utf8' });
  const help = run(['--help']);assert.equal(help.status, 0);assert.match(help.stdout, /No network/);
  const rejected = run(['--input', b.inputPath, '--output', '/PRIVATE/elsewhere']);
  assert.equal(rejected.status, 1);assert.doesNotMatch(rejected.stderr, /PRIVATE/);assert.equal(fs.readFileSync(b.output, 'utf8'), b.previous);
  const input = envelope();input.source.provenance.exportedAt = new Date().toISOString();input.admissions[0].checkedAt = new Date().toISOString();b.write(input);
  const checked = run(['--input', b.inputPath, '--check']);assert.equal(checked.status, 0, checked.stderr);
  assert.equal(fs.readFileSync(b.output, 'utf8'), b.previous);
  const result = run(['--input', b.inputPath]);assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).included, 1);assert.equal(JSON.parse(fs.readFileSync(b.output, 'utf8')).jobs.length, 1);
});
