const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const states = require('../../js/us-states.js');

test('the filter vocabulary contains exactly the 50 states, alphabetical full names and unique postal values', () => {
  assert.equal(states.STATES.length, 50);
  assert.equal(new Set(states.STATES.map(s => s.code)).size, 50);
  assert.deepEqual(states.STATES.map(s => s.name), states.STATES.map(s => s.name).sort());
  for (const state of states.STATES) {
    assert.equal(states.normalize(state.code.toLowerCase()), state.code);
    assert.equal(states.normalize('  ' + state.name.toUpperCase() + ' '), state.code);
    assert.equal(states.label(state.code), state.name);
    assert.deepEqual(states.extract(state.code, 'A city'), [state.code]);
  }
  for (const absent of ['DC', 'District of Columbia', 'Puerto Rico', 'PR', 'US', 'Remote', 'all', 'constructor', '__proto__', {}, 12, null]) {
    assert.equal(states.normalize(absent), '');
    assert.equal(states.label(absent), '');
  }
});

// Exact location strings read from the Jobs Google CSV on September 7, 2026
// (sheet 1DRfkDn_OIVlnx06xFaNpNbusXl49jvM26oJsl-qq2nU, gid 2134483974).
const jobsFixtures = [
  ['Indianapolis, IN', ['IN']], ['Portland, OR', ['OR']],
  ['Beverly Hills, California', ['CA']], ['Renton, Washington', ['WA']],
  ['San Jose, CALIFORNIA, United States', ['CA']],
  ['California-Los Angeles 1041 N. Formosa Ave', ['CA']],
  ['CA-Los Angeles; 5800 Sunset Blvd (Tribune-KTLA)', ['CA']],
  ['CO-Denver; 100 E. Speer Blvd (Tribune-KDVR/KWGN)', ['CO']],
  ['IL-Chicago; 2501 W. Bradley Place (WGN-TV)', ['IL']], ['NYC', ['NY']],
  ['Chicago, Illinois; Atlanta, Georgia; Agoura Hills, California', ['CA','GA','IL']],
  ['Los Angeles, California, USA; New York, New York, USA; Washington, District of Columbia, USA', ['CA','NY']],
  ['Washington University (West Campus), Clayton, Missouri', ['MO']],
  ['DC-Washington; 2121 Wisconsin Ave NW (Nexstar-WDCW)', []],
  ['DC Washington 820 1st Street NE; GA Atlanta 1050 Techwood Drive NW', ['GA']],
  ['NY New York 30 Hudson Yards; DC Washington 820 1st Street NE', ['NY']],
  ['DC, Washington', []], ['Washington, District of Columbia, USA', []],
  ['Remote, US (state restrictions)', []], ['Remote (Pittsburgh)', []],
  ['Any TEGNA Station Location', []], ['US Remote', []],
  ['San Francisco, CA / Remote, US', ['CA']]
];
for (const [location, expected] of jobsFixtures) test('actual Jobs geography: ' + location, () => {
  assert.deepEqual(states.extract('', location), expected);
  assert.deepEqual(states.extract(location, location), expected);
});

// Exact current internship location strings, including multi-office source text.
test('internship source formats retain every explicit office without parsing notes as states', () => {
  const fixtures = [
    ['El Segundo, CA; body says hybrid, header says onsite', ['CA']],
    ['Beaverton, OR, US; in person', ['OR']],
    ['San Francisco, CA or New York, NY; hub based', ['CA','NY']],
    ['San Jose/San Francisco, CA; Austin, TX; Seattle, WA; Lehi, UT; New York, NY; co-located hybrid', ['CA','NY','TX','UT','WA']],
    ['United States; exact city not listed', []],
    ['Washington, DC (in person or hybrid); United States remote for non-local candidates', []],
    ['United States remote, Eastern or Central time zones; Harrisburg, PA optional meetings/events', ['PA']]
  ];
  for (const [location, expected] of fixtures) assert.deepEqual(states.extract(location, location), expected, location);
});

test('abbreviations require word boundaries and geographic context', () => {
  for (const text of ['work in person or remotely', 'WORK IN PERSON OR REMOTELY', 'Contact ME for an ID', 'REMOTE', 'CANADA', 'INDUSTRY', 'NORMAL', 'ORIENTATION', 'CAREFUL', 'Work with CO workers', 'City 10th St NE']) {
    assert.deepEqual(states.extract('', text), [], text);
  }
  assert.deepEqual(states.extract('NY/CA', ''), ['CA','NY']);
  assert.deepEqual(states.extract('', 'NY / CA'), ['CA','NY']);
  assert.deepEqual(states.extract('', 'Portland, ME 04101'), ['ME']);
  assert.deepEqual(states.extract('', 'Boston, MA 02110-1234'), ['MA']);
  assert.deepEqual(states.extract('', 'Salem, OR'), ['OR']);
  assert.deepEqual(states.extract('in', ''), ['IN']); // an exact structured code
  assert.deepEqual(states.extract('', 'in'), []); // unstructured ordinary word
});

test('multiword names match as a whole, with DC excluded independently of other states', () => {
  assert.deepEqual(states.extract('West Virginia', 'Charleston, WV'), ['WV']);
  assert.deepEqual(states.extract('', 'West Virginia; Virginia; North Carolina; South Dakota'), ['NC','SD','VA','WV']);
  for (const dc of ['Washington, DC', 'Washington D.C.', 'District of Columbia', 'DC Washington 820 1st Street NE']) {
    assert.deepEqual(states.extract('DC', dc), [], dc);
  }
  assert.deepEqual(states.extract('', 'Washington, DC; Seattle, WA'), ['WA']);
  assert.deepEqual(states.extract('NY', 'San Francisco, California'), ['CA','NY']);
});

test('normalization is exact and extraction does not imply remote eligibility or mutate source values', () => {
  assert.equal(states.normalize('California-Los Angeles 1041 N. Formosa Ave'), '');
  assert.equal(states.normalize('new    york'), 'NY');
  const row = Object.freeze({state:'Remote',loc:'Remote, United States'});
  assert.deepEqual(states.extract(row.state, row.loc), []);
  assert.deepEqual(states.extract(null, {state:'CA'}), []);
  assert.equal(Object.isFrozen(states), true);
  assert.equal(Object.isFrozen(states.STATES), true);
  assert.equal(Object.isFrozen(states.BY_CODE), true);
  assert.equal(Object.isFrozen(states.STATES[0]), true);
});

test('plain browser UMD exposes the same pure API without DOM, storage or network', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../js/us-states.js'), 'utf8'), {window});
  assert.equal(window.SUStates.STATES.length, 50);
  assert.deepEqual(Array.from(window.SUStates.extract('CA', 'New York, NY')), ['CA','NY']);
});
