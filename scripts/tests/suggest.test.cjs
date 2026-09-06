const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const suggest = require('../../js/suggest.js');
const root = path.resolve(__dirname, '../..');
const link = 'https://job-boards.greenhouse.io/glossier/jobs/8054875?gh_jid=8054875&utm_source=test';

test('valid employer links retain their original identity-bearing query and fragment', () => {
  for (const url of [link, 'https://careers.company.com/?job_id=1&lang=en', 'https://careers.company.com/#/jobs/1']) {
    assert.deepEqual(suggest.validate('  ' + url + '  ', '  A good fit  '), { url, context: 'A good fit' });
  }
});

for (const url of ['', 'javascript:alert(1)', 'data:text/html,hello', 'http://company.com/jobs/1',
  '//company.com/jobs/1', 'https://user:password@company.com/jobs/1',
  'https://localhost/jobs/1', 'https://localhost./jobs/1', 'https://company.local/jobs/1',
  'https://private.internal/jobs/1', 'https://127.0.0.1/jobs/1', 'https://2130706433/jobs/1',
  'https://[::1]/jobs/1', 'https://192.168.1.1/jobs/1', 'https://company.com:8443/jobs/1',
  'https://company.com/a b', 'https://company.com/\\evil', 'https://company..com/job',
  'https://company.com/<script>', 'https://www.linkedin.com/jobs/view/123',
  'https://linkedin.com./jobs/view/123', 'https://bit.ly/123', 'https://jobs.indeed.com/job/123']) {
  test('invalid or indirect intake URL is rejected: ' + url, () => {
    const result = suggest.validate(url, '');
    assert.equal(result.field, 'url'); assert(result.error); assert(!result.url);
  });
}

test('bounds are enforced before encoding without truncating a valid posting URL', () => {
  assert.equal(suggest.validate('https://company.com/' + 'a'.repeat(2048), '').field, 'url');
  assert.equal(suggest.validate(link, 'x'.repeat(501)).field, 'context');
  assert.equal(suggest.validate(link, 'x'.repeat(500)).context.length, 500);
});

test('form encoding treats markup and delimiters as data', () => {
  const payload = { 'job-url': link, context: '<script>alert("x")</script>&role=admin', 'bot-field': '' };
  const encoded = suggest.encode(payload);
  assert(!encoded.includes('<script>'));
  assert.deepEqual(Object.fromEntries(new URLSearchParams(encoded)), payload);
});

function setup({ processed = true, fetch = async () => ({ ok: true }) } = {}) {
  const els = {}, calls = [], focus = [], timers = new Map();
  let nextId = 0, timerId = 0;
  function el(id) {
    return els[id] = {
      value: '', hidden: false, disabled: false, textContent: '', attributes: {}, handlers: {},
      setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; },
      hasAttribute(k) { return Object.hasOwn(this.attributes, k); },
      addEventListener(k, fn) { this.handlers[k] = fn; }, focus() { focus.push(id); }
    };
  }
  for (const id of ['suggest-form', 'suggest-url', 'suggest-context', 'suggest-submit', 'suggest-status',
    'suggest-receipt', 'suggest-receipt-title', 'suggest-request-id', 'suggest-another']) el(id);
  const form = els['suggest-form'];
  form.elements = { 'bot-field': { value: '' } };
  form.reset = () => { els['suggest-url'].value = ''; els['suggest-context'].value = ''; };
  if (!processed) form.attributes['data-netlify'] = 'true';
  els['suggest-receipt'].hidden = true;
  els['suggest-url'].value = link;
  const win = {
    crypto: { randomUUID: () => 'test-request-' + (++nextId) }, AbortController,
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => { calls.push({ url, options }); return fetch(url, options); }
  };
  suggest.mount({ getElementById: id => els[id] }, win);
  return { els, calls, focus, timers, form,
    submit: () => form.handlers.submit({ preventDefault() {} }),
    another: () => els['suggest-another'].handlers.click() };
}

test('unregistered forms cannot send or show a false receipt, even on a static 200 server', async () => {
  const s = setup({ processed: false });
  assert.equal(s.els['suggest-submit'].disabled, true);
  await s.submit();
  assert.equal(s.calls.length, 0);
  assert.equal(s.els['suggest-receipt'].hidden, true);
  assert.match(s.els['suggest-status'].textContent, /not open/);
});

test('only a same-origin acknowledged POST shows the pending-review receipt', async () => {
  const s = setup();
  s.els['suggest-context'].value = 'For the creative team';
  await s.submit();
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].url, '/suggest');
  const options = s.calls[0].options;
  assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
  const payload = Object.fromEntries(new URLSearchParams(options.body));
  assert.deepEqual(Object.keys(payload).sort(), ['bot-field', 'context', 'form-name', 'job-url', 'request-id']);
  assert.equal(payload['form-name'], suggest.formName);
  assert.equal(payload['job-url'], link); assert.equal(payload['bot-field'], '');
  assert.equal(s.form.hidden, true); assert.equal(s.els['suggest-receipt'].hidden, false);
  assert.equal(s.focus.at(-1), 'suggest-receipt-title');
  assert.equal(s.timers.size, 0);
});

test('double submit is suppressed while a request is in flight', async () => {
  let resolve;
  const s = setup({ fetch: () => new Promise(r => { resolve = r; }) });
  const first = s.submit(); await s.submit();
  assert.equal(s.calls.length, 1); assert.equal(s.els['suggest-submit'].disabled, true);
  assert.equal(s.els['suggest-url'].disabled, true);
  resolve({ ok: true }); await first;
  assert.equal(s.els['suggest-url'].disabled, false);
});

for (const [name, fetch] of [
  ['server rejection', async () => ({ ok: false, status: 404 })],
  ['connection failure', async () => { throw new Error('offline'); }]
]) {
  test(name + ' preserves fields and retry ID without claiming success', async () => {
    const s = setup({ fetch });
    s.els['suggest-context'].value = 'keep this note';
    const id = s.els['suggest-request-id'].value;
    await s.submit(); await s.submit();
    assert.equal(s.form.hidden, false); assert.equal(s.els['suggest-receipt'].hidden, true);
    assert.equal(s.els['suggest-url'].value, link); assert.equal(s.els['suggest-context'].value, 'keep this note');
    assert.equal(s.els['suggest-request-id'].value, id);
    assert.equal(s.els['suggest-submit'].disabled, false);
    assert.match(s.els['suggest-status'].textContent, /couldn’t confirm receipt/);
    assert.equal(s.timers.size, 0);
  });
}

test('timeout releases the form and keeps receipt hidden', async () => {
  const s = setup({ fetch: (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }) });
  const submission = s.submit();
  for (const callback of s.timers.values()) callback();
  await submission;
  assert.equal(s.els['suggest-submit'].disabled, false);
  assert.equal(s.els['suggest-receipt'].hidden, true);
  assert.equal(s.timers.size, 0);
});

test('changing a failed suggestion creates a new retry ID', async () => {
  const s = setup({ fetch: async () => ({ ok: false }) });
  await s.submit(); const oldId = s.els['suggest-request-id'].value;
  s.els['suggest-url'].value = 'https://jobs.company.com/job/another';
  await s.submit(); assert.notEqual(s.els['suggest-request-id'].value, oldId);
});

test('validation error focuses the field without an outgoing request', async () => {
  const s = setup(); s.els['suggest-url'].value = 'https://127.0.0.1/job/1';
  await s.submit(); assert.equal(s.calls.length, 0);
  assert.equal(s.focus.at(-1), 'suggest-url');
  assert.equal(s.els['suggest-url'].attributes['aria-invalid'], 'true');
});

test('another suggestion clears content, assigns a new ID and restores input focus', async () => {
  const s = setup(); await s.submit(); const oldId = s.els['suggest-request-id'].value;
  s.another();
  assert.equal(s.els['suggest-receipt'].hidden, true); assert.equal(s.form.hidden, false);
  assert.equal(s.els['suggest-url'].value, '');
  assert.notEqual(s.els['suggest-request-id'].value, oldId);
  assert.equal(s.focus.at(-1), 'suggest-url');
});

test('static form registration and privacy contract match actual outgoing fields', () => {
  const html = fs.readFileSync(path.join(root, 'suggest.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'js/suggest.js'), 'utf8');
  assert.match(html, /name="job-suggestions-v2"[^>]+data-netlify="true"[^>]+netlify-honeypot="bot-field"/);
  for (const name of ['form-name', 'job-url', 'context', 'request-id', 'bot-field']) assert(html.includes('name="' + name + '"'));
  assert.match(html, /maxlength="2048"/); assert.match(html, /maxlength="500"/);
  assert.match(html, /pending review/); assert.match(html, /A person makes the publishing decision/);
  assert(!/type="(?:file|email|password)"|js\/(?:auth|analytics|ga)\.js/.test(html));
  assert(!/innerHTML|insertAdjacentHTML|no-cors|script\.google\.com|addJob/.test(js));
  assert.match(html, /id="suggest-receipt"[^>]+hidden/);
});
