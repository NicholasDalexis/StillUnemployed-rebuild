'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Status = require('../../netlify/functions/lib/internship-status.cjs');
const Internships = require('../../js/internships.js');
const NOW = Date.parse('2030-09-06T16:00:00Z');
function job(id = '12345', extra = {}) {
  const link = 'https://job-boards.greenhouse.io/example/jobs/' + id;
  return { co:'Example Studio', role:'Design Intern', link, loc:'Chicago, IL', ind:'Video & Creative',
    pay:'$22.50/hour', payStatus:'paid', payBasis:'hour', collegeCredit:'not_listed',
    eligibility:'Current students; enrollment and work authorization required.',
    eligibilityFlags:['Current students'], duties:['Prepare source-backed design work.'], benefits:[],
    applicationStatus:'open', timingSourceUrl:'https://example.org/internships',
    verification:{ status:'open', checkedAt:'2030-09-06T15:00:00Z', sourceUrl:link, reviewerType:'source_check' }, ...extra };
}
function upcoming(id = '23456', extra = {}) {
  const original = job(id);
  return job(id, { applicationStatus:'upcoming', applicationsOpen:'Later this fall', duties:[],
    verification:{ ...original.verification, status:'upcoming', sourceAnnounced:true, upcomingApproved:true }, ...extra });
}
function snapshot(jobs = [job()], extra = {}) { return { schemaVersion:2, status:'verified', jobs, ...extra }; }
function csv(rows = [[job().link, 'Active', 'Open']], headings = ['Link', 'Active/Dead', 'Application Status']) {
  return [headings, ...rows].map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\r\n');
}
function response(body = csv(), init = {}) { return new Response(body, { status:200, headers:{ 'Content-Type':'text/csv; charset=utf-8' }, ...init }); }
function handler(data, fetchImpl = async () => response(), extra = {}) { return Status.createHandler({ snapshot:data, fetchImpl, now:() => NOW, ...extra }); }
const request = { httpMethod:'GET' };
const payload = result => JSON.parse(result.body);

test('manual dead, cleared link, deleted row, inactive and unknown statuses suppress approved jobs', async () => {
  const first = job(), second = job('22222'), data = snapshot([first, second]), original = JSON.stringify(data);
  for (const removal of [null, ['', 'Active', 'Open'], [first.link, 'Dead', 'Open'], [first.link, 'Inactive', 'Open'], [first.link, 'Active', 'Unknown'], [first.link, 'Active', 'Closed'], [first.link, 'Active', '']]) {
    const rows = [[second.link, 'Active', 'Open']];if (removal) rows.push(removal);
    const result = await handler(data, async () => response(csv(rows)))(request);
    assert.equal(result.statusCode, 200);assert.deepEqual(payload(result).jobs.map(row => row.link), [second.link]);
  }
  assert.equal(JSON.stringify(data), original, 'the approved snapshot is never mutated');
});

test('server-only display copy is attached only after its source row survives live suppression',async()=>{
  const source=require('../../internships-data.json'),displayCopy=require('../../netlify/functions/lib/internship-display.json');
  const [first,retired]=source.jobs;assert(first&&retired);
  const data=snapshot([first,retired]);
  const result=await handler(data,async()=>response(csv([[first.link,'Active','Open'],[retired.link,'Dead','Closed']])),{displayCopy})(request);
  assert.equal(result.statusCode,200);
  const body=payload(result);assert.equal(body.jobs.length,1);assert.equal(body.jobs[0].link,first.link);
  assert.deepEqual(body.jobs[0].presentation,displayCopy[first.link]);
  assert(!result.body.includes(retired.link));assert(!result.body.includes(displayCopy[retired.link].detailBullets[0]));
  const failed=await handler(data,async()=>response('<html>Sign in</html>',{headers:{'Content-Type':'text/html'}}),{displayCopy})(request);
  assert.equal(failed.statusCode,503);assert(!failed.body.includes(first.link));assert(!failed.body.includes(displayCopy[first.link].detailBullets[0]));
});

test('a valid empty status readback suppresses every snapshot job without becoming a service error', async () => {
  const result = await handler(snapshot(), async () => response(csv([])))(request);
  assert.equal(result.statusCode, 200);assert.deepEqual(payload(result).jobs, []);
  assert.equal(payload(result).status, 'verified');assert.equal(payload(result).statusCheckedAt, new Date(NOW).toISOString());
});

test('new Sheet rows never add a job and source phase changes never activate an approved upcoming program', async () => {
  const open = job(), future = upcoming(), data = snapshot([open, future]);
  const rows = [[open.link, 'Active', 'Open'], [future.link, 'Active', 'Open'], [job('99999').link, 'Active', 'Open']];
  const result = await handler(data, async () => response(csv(rows)))(request);
  assert.deepEqual(payload(result).jobs.map(row => row.link), [open.link]);
  const reverse = await handler(data, async () => response(csv([[open.link, 'Active', 'Upcoming'], [future.link, 'Active', 'Upcoming']])))(request);
  assert.deepEqual(payload(reverse).jobs.map(row => row.link), [future.link]);
  assert.equal(payload(reverse).jobs[0].applicationStatus, 'upcoming');
  assert.equal(Internships.canApply(payload(reverse).jobs[0], NOW), false);
});

test('an elapsed announced date remains recheck-only and is not rewritten by the live matching phase', async () => {
  const row = upcoming('23456', { applicationsOpenISO:'2030-09-05' });
  const result = await handler(snapshot([row]), async () => response(csv([[row.link, 'Active', 'Upcoming']])))(request);
  assert.equal(result.statusCode, 200);assert.equal(payload(result).jobs.length, 1);
  assert.equal(Internships.applicationState(payload(result).jobs[0], NOW), 'needs_recheck');
  assert.equal(Internships.canApply(payload(result).jobs[0], NOW), false);
});

test('one canonical alias matches without changing the saved or shared snapshot URL', async () => {
  const row = job();const alias = row.link.replace('job-boards.greenhouse.io', 'boards.greenhouse.io') + '?utm_source=fixture';
  const result = await handler(snapshot([row]), async () => response(csv([[alias, ' Active ', ' open ']])))(request);
  assert.equal(result.statusCode, 200);assert.equal(payload(result).jobs[0].link, row.link);
});

test('duplicate identities fail closed even for inactive aliases or unrelated operational jobs', async () => {
  const row = job(), alias = row.link + '?utm_source=fixture';
  for (const rows of [
    [[row.link, 'Active', 'Open'], [row.link, 'Active', 'Open']],
    [[row.link, 'Active', 'Open'], [alias, 'Dead', 'Open']],
    [[row.link, 'Active', 'Open'], [job('88888').link, 'Dead', 'Unknown'], [job('88888').link + '?utm_medium=fixture', 'Dead', 'Unknown']]
  ]) {
    const result = await handler(snapshot(), async () => response(csv(rows)))(request);
    assert.equal(result.statusCode, 503);assert.equal(payload(result).jobs, undefined);
  }
});

test('different employers and requisitions remain independent identities', async () => {
  const rows = [job(), job('54321'), job('12345', { link:job().link.replace('/example/', '/another/') })];
  const result = await handler(snapshot(rows), async () => response(csv(rows.map(row => [row.link, 'Active', 'Open']))))(request);
  assert.equal(result.statusCode, 200);assert.equal(payload(result).jobs.length, 3);
});

test('empty approved and empty awaiting snapshots skip the upstream and expose no Sheet identifiers', async () => {
  for (const data of [snapshot([]), { schemaVersion:1, status:'awaiting_verification', jobs:[], source:{ privateId:'fixture-private-sheet' } }]) {
    let calls = 0;const result = await handler(data, async () => { calls++;throw Error('Must not fetch'); })(request);
    assert.equal(result.statusCode, 200);assert.equal(calls, 0);assert.deepEqual(payload(result).jobs, []);
    assert.equal(payload(result).statusCheckedAt, undefined);assert.doesNotMatch(result.body, /fixture-private-sheet|source"/);
  }
});

test('invalid snapshots fail before fetch instead of silently serving their valid subset', async () => {
  const malformed = [snapshot([job(), job('54321', { eligibility:'' })]), snapshot([job(), job()]), snapshot([job()], { status:'awaiting_verification' }), snapshot([], { schemaVersion:99 })];
  for (const data of malformed) {
    let called = false;const result = await handler(data, async () => { called = true;return response(); })(request);
    assert.equal(result.statusCode, 503);assert.equal(called, false);
  }
});

test('only whitelisted public job fields and genuine timestamps leave the service', async () => {
  const row = job();row.privateNotes = 'fixture-private-rationale';row.sheetRow = 91;row.verification.reviewerEmail = 'private@example.org';
  const result = await handler(snapshot([row], { sourceExportedAt:'2030-09-06T15:30:00Z', source:{ id:'fixture-private-source' }, admissions:['fixture-private-decision'] }))(request);
  assert.equal(result.statusCode, 200);assert.equal(payload(result).sourceExportedAt, '2030-09-06T15:30:00Z');
  assert.doesNotMatch(result.body, /fixture-private|sheetRow|reviewerEmail|private@example|admissions|spreadsheetId/);
  for (const value of ['not-a-time', { private:'hidden' }, '2035-09-06T15:30:00Z']) {
    const output = await handler(snapshot([], { sourceExportedAt:value }))(request);
    assert.equal(payload(output).sourceExportedAt, undefined);
  }
});

test('request input cannot change the upstream source or forward credentials', async () => {
  let captured;const result = await handler(snapshot(), async (url, options) => { captured = { url:new URL(url), options };return response(); })({ ...request, queryStringParameters:{ url:'https://attacker.example/status', gid:'0' }, headers:{ Authorization:'Bearer fixture-private', Cookie:'fixture-private' }, body:'fixture-private' });
  assert.equal(result.statusCode, 200);assert.equal(captured.url.hostname, 'docs.google.com');
  assert.equal(captured.url.searchParams.get('gid'), '1560669113');assert.equal(captured.url.searchParams.get('tq'), 'select C,K,V');
  assert.equal(captured.url.searchParams.get('headers'), '1');assert.equal(captured.url.searchParams.get('_'), String(NOW));
  assert.equal(captured.options.method, 'GET');assert.equal(captured.options.credentials, 'omit');assert.equal(captured.options.redirect, 'manual');
  assert.equal(captured.options.cache, 'no-store');assert.equal(captured.options.headers['Cache-Control'], 'no-cache');
  assert.doesNotMatch(JSON.stringify(captured.options.headers), /fixture-private|Authorization|Cookie/);
});

test('CSV accepts BOM, quoted commas, CRLF and escaped quotes without accepting malformed widths or headers', () => {
  assert.deepEqual(Status.parseCSV('\uFEFF"one","two, three","four""five"\r\n'), [['one', 'two, three', 'four"five']]);
  assert.deepEqual(Status.parseCSV('"one\ntwo",three,four'), [['one\ntwo', 'three', 'four']]);
  assert.equal(Status.statusIndex('\uFEFF' + csv()).size > 0, true);
  for (const value of ['"Link","Link","Application Status"\n', csv([], ['Link', 'Application Status', 'Active/Dead']), csv([], ['Link', 'Active/Dead']), 'Link,Active/Dead,Application Status\nhttps://example.org/job,Active', 'Link,Active/Dead,Application Status\n"broken,Active,Open', 'Link,Active/Dead,Application Status\n"https://example.org/job"oops,Active,Open']) assert.throws(() => Status.statusIndex(value));
});

test('malformed status links cannot become permissive identity fallbacks', async () => {
  for (const link of ['javascript:alert(1)', 'https://user:password@example.org/job', 'https://127.0.0.1/job', 'https://example.org/job?token=private', 'https://example.org/job\nprivate-note']) {
    const result = await handler(snapshot(), async () => response(csv([[link, 'Active', 'Open']])))(request);
    assert.equal(result.statusCode, 503);assert.doesNotMatch(result.body, /private-note|password|token=/);
  }
});

test('HTTP errors, login HTML, wrong MIME and invalid UTF-8 return503 without a snapshot fallback', async () => {
  const failures = [() => response('upstream private error', { status:500 }), () => response('<html>Sign in</html>', { headers:{ 'Content-Type':'text/html' } }), () => response('<html>Sign in</html>'), () => response(csv(), { headers:{ 'Content-Type':'application/json' } }), () => response(new Uint8Array([0xff, 0xfe]))];
  for (const fail of failures) {
    const result = await handler(snapshot(), async () => fail())(request);
    assert.equal(result.statusCode, 503);assert.equal(result.body, '{"error":"Internships temporarily unavailable"}');
  }
});

test('declared and actual streamed body sizes are both enforced, and excess rows fail closed', async () => {
  const declared = await handler(snapshot(), async () => response(csv(), { headers:{ 'Content-Type':'text/csv', 'Content-Length':String(Status.LIMITS.bytes + 1) } }))(request);
  assert.equal(declared.statusCode, 503);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(80)));controller.enqueue(new TextEncoder().encode('y'.repeat(80))); }, cancel() { cancelled = true; } });
  const streamed = await handler(snapshot(), async () => response(stream), { limits:{ bytes:100 } })(request);
  assert.equal(streamed.statusCode, 503);assert.equal(cancelled, true);
  const rows = await handler(snapshot(), async () => response(csv([[job().link, 'Active', 'Open'], [job('23456').link, 'Active', 'Open']])), { limits:{ rows:1 } })(request);
  assert.equal(rows.statusCode, 503);
});

test('redirects stay on HTTPS Google export hosts and never forward request credentials', async () => {
  const calls = [];
  const result = await handler(snapshot(), async (url, options) => { calls.push({ url, options });return calls.length === 1 ? response('', { status:302, headers:{ Location:'https://doc-abc-sheets.googleusercontent.com/export' } }) : response(); })(request);
  assert.equal(result.statusCode, 200);assert.equal(calls.length, 2);assert.equal(new URL(calls[1].url).hostname, 'doc-abc-sheets.googleusercontent.com');
  for (const target of ['https://accounts.google.com/login', 'https://googleusercontent.com.attacker.example/export', 'http://docs.google.com/export', 'https://user:secret@docs.google.com/export', 'https://docs.google.com:444/export']) {
    let count = 0;const output = await handler(snapshot(), async () => { count++;return response('', { status:302, headers:{ Location:target } }); })(request);
    assert.equal(output.statusCode, 503);assert.equal(count, 1);
  }
  let count = 0;const looping = await handler(snapshot(), async () => { count++;return response('', { status:302, headers:{ Location:'https://docs.google.com/loop' } }); })(request);
  assert.equal(looping.statusCode, 503);assert.equal(count, Status.LIMITS.redirects + 1);
});

test('one deadline bounds both headers and a stalled body across the entire redirect chain', async () => {
  let signal;
  const pending = await handler(snapshot(), (url, options) => { signal = options.signal;return new Promise(() => {}); }, { limits:{ timeoutMs:15 } })(request);
  assert.equal(pending.statusCode, 503);assert.equal(signal.aborted, true);
  let calls = 0;
  const stalled = await handler(snapshot(), async (url, options) => {
    calls++;if (calls === 1) return response('', { status:302, headers:{ Location:'https://docs.google.com/next' } });
    return response(new ReadableStream({ start(controller) { options.signal.addEventListener('abort', () => controller.error(Error('aborted'))); } }));
  }, { limits:{ timeoutMs:15 } })(request);
  assert.equal(stalled.statusCode, 503);assert.equal(calls, 2);
});

test('all responses disable browser/CDN caching and the packaged entry is GET-only', async () => {
  const entry = require('../../netlify/functions/internships-catalog.cjs');
  for (const method of ['POST', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']) {
    const result = await entry.handler({ httpMethod:method });assert.equal(result.statusCode, 405);assert.equal(result.headers.Allow, 'GET');
  }
  for (const result of [await handler(snapshot([]))(request), await handler(snapshot(), async () => { throw Error('private-upstream'); })(request), await entry.handler({ httpMethod:'POST' })]) {
    assert.equal(result.headers['Cache-Control'], 'no-store');assert.equal(result.headers['CDN-Cache-Control'], 'no-store');assert.equal(result.headers['Netlify-CDN-Cache-Control'], 'no-store');
    assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');assert.match(result.headers['Content-Type'], /^application\/json/);
  }
});
