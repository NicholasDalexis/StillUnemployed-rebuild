'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Pay = require('../../js/pay-display.js');

test('annual cards round each endpoint to whole K without modifying exact source amounts', () => {
  for (const [raw, expected] of [
    ['$41,460.00', '$41K'], ['$75,600', '$76K'], ['$138,600', '$139K'],
    ['$77,500-$83,000', '$78K–83K'], ['$70,304-$70,384', '$70K'],
    ['$59.9-87.9K', '$60K–88K'], ['$70K-85K', '$70K–85K'],
    ['$70,000-85K', '$70K–85K'], ['$70K-85,000', '$70K–85K'],
    ['$70,000-$85,000', '$70K–85K'], ['$999/year', '$999/year']
  ]) assert.equal(Pay.compact(raw, { basis:'annual' }), expected, raw);
});

test('explicit hourly pay overrides annual fallback and never becomes annualized K', () => {
  for (const [raw, expected] of [
    ['$45.00-55.00/hour', '$45–55/hour'], ['$45.10 to $55.40 per hour', '$45–55/hour'],
    ['$32.50/hr', '$33/hour'], ['$22.10 hourly', '$22/hour'],
    ['$25/h', '$25/hour'], ['$1.5K/hour', '$1,500/hour']
  ]) assert.equal(Pay.compact(raw, { basis:'annual' }), expected, raw);
});

test('employer-confirmed basis is added while amounts alone never invent a currency or time unit', () => {
  assert.equal(Pay.compact('$23.00', { status:'paid', basis:'not_listed' }), '$23');
  assert.equal(Pay.compact('$28'), '$28');
  assert.equal(Pay.compact('28', { basis:'hour' }), '28/hour');
  assert.equal(Pay.compact('28'), '28');
  assert.equal(Pay.compact('$75,600', { basis:'not_listed' }), '$75,600');
  assert.equal(Pay.compact('$45-55', { basis:'hour', status:'paid' }), '$45–55/hour');
  assert.equal(Pay.compact('$85,000 (time unit not listed)', { basis:'annual' }), '$85,000');
});

test('known currencies are retained or normalized without turning non-USD pay into dollars', () => {
  for (const [raw, expected] of [
    ['USD 45.00 - 55.00/hour', '$45–55/hour'], ['$28 - $28 USD', '$28'],
    ['28 - 30 USD/hour', '$28–30/hour'], ['€25.50/hour', '€26/hour'],
    ['GBP 70,000-85,000/year', 'GBP 70K–85K/year'], ['CAD 25.25/hour', 'CAD 25/hour'],
    ['CA$25/hour', 'CA$25/hour']
  ]) assert.equal(Pay.compact(raw), expected, raw);
  assert.equal(Pay.compact('$25-€30/hour'), '$25-€30/hour', 'conflicting currency is not silently merged');
});

test('compact status labels distinguish confirmed paid, unpaid and undisclosed compensation', () => {
  assert.equal(Pay.compact('Paid; amount not disclosed', { status:'paid' }), 'Paid');
  assert.equal(Pay.compact('', { status:'paid' }), 'Paid');
  assert.equal(Pay.compact('Unpaid', { status:'unpaid' }), 'Unpaid');
  assert.equal(Pay.compact('Unpaid · College credit'), 'Unpaid');
  assert.equal(Pay.compact('Pay not disclosed', { status:'not_disclosed' }), 'Pay not disclosed');
  assert.equal(Pay.compact('Competitive'), 'Pay not disclosed');
  assert.equal(Pay.compact(null), 'Pay not disclosed');
  assert.equal(Pay.compact(28), 'Pay not disclosed', 'numbers outside the string contract are not guessed');
});

test('short qualifiers preserve limits and estimates while program duration stays outside the pay range', () => {
  assert.equal(Pay.compact('Up to $15/hour'), 'Up to $15/hour');
  assert.equal(Pay.compact('$23.00 minimum', { basis:'not_listed' }), 'From $23');
  assert.equal(Pay.compact('$70K+'), 'From $70K');
  assert.equal(Pay.compact('$8,500/month (estimated)'), '~$8,500/month');
  assert.equal(Pay.compact('$9,000 for the 9-week summer program', { basis:'program' }), '$9,000/program');
  assert.equal(Pay.compact('$1,250.50/week'), '$1,251/week');
  assert.equal(Pay.compact('$75,600.00-138,600.00/year (projected, full-calendar-year basis; internship total not stated)', { basis:'annualized_year' }), '~$76K–139K/year');
});

test('separate student rates share one compact envelope only with matching basis and currency', () => {
  assert.equal(Pay.compact('$32.50/hour undergraduate; $40.00/hour graduate', { basis:'hour' }), '$33–40/hour');
  assert.equal(Pay.compact('$21/hour undergraduate; $23/hour graduate, postgraduate or MBA'), '$21–23/hour');
  assert.equal(Pay.compact('$20/hour; $800/week'), '$20/hour; $800/week');
  assert.equal(Pay.compact('$20/hour; €23/hour'), '$20/hour; €23/hour');
});

test('current internship pay labels are compact and formatting leaves all source and sorting fields exact', () => {
  const feed = JSON.parse(fs.readFileSync(path.join(__dirname, '../../internships-data.json'), 'utf8'));
  const before = JSON.stringify(feed);
  for (const job of feed.jobs) {
    const options = Object.freeze({ basis:job.payBasis, status:job.payStatus });
    const label = Pay.compact(job.pay, options);
    assert(label.length <= 36, job.co + ': ' + label);
    assert.doesNotMatch(label, /\d\.\d|not listed|not stated|amount not disclosed/i, job.co + ': ' + label);
    if (job.payBasis === 'not_listed') assert.doesNotMatch(label, /\/(?:hour|week|month|year|program)\b/, job.co);
    assert.equal(Pay.compact(job.pay, options), label, 'pure repeated formatting');
  }
  assert.equal(JSON.stringify(feed), before);
});

test('browser export works without DOM, storage, network or CommonJS dependencies', () => {
  const context = { window:{} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../js/pay-display.js'), 'utf8'), context);
  assert.equal(typeof context.window.SUPayDisplay.compact, 'function');
  assert.equal(context.window.SUPayDisplay.compact('$45.00-55.00/hour'), '$45–55/hour');
});
