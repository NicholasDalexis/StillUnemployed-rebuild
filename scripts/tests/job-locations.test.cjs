const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const states = require('../../js/us-states.js');
const fixtures = require('./fixtures/job-locations.json');

test('all 162 current job-location labels distinguish multiple offices from a single address', () => {
  assert.equal(fixtures.multiple.length + fixtures.single.length, 162);
  for (const location of fixtures.multiple) assert.equal(states.cardLocation(location), 'Multiple Locations', location);
  for (const location of fixtures.single) assert.notEqual(states.cardLocation(location), 'Multiple Locations', location);
});

test('city/state commas are not separators, while repeated-state cities and DC offices count separately', () => {
  for (const location of [
    'San Francisco, CA or New York, NY',
    'San Jose/San Francisco, CA',
    'Los Angeles, CA, San Francisco, CA',
    'Los Angeles, California and San Francisco, California',
    'Washington, DC; Washington, PA',
    'Portland, OR / Seattle, WA',
    'Boston | Chicago',
    'New York, Atlanta, LA, Chicago',
    'New York, NY 10001; Boston, MA 02111',
    'Multiple locations, US',
    'Various locations',
  ]) assert.equal(states.cardLocation(location), 'Multiple Locations', location);
  for (const [location, expected] of [
    ['New York, NY, United States', 'New York, NY'],
    ['Boston, MA (Main Campus)', 'Boston, MA'],
    ['Los Angeles, CA - University Park Campus', 'Los Angeles, CA'],
    ['New York, NY; New York, New York', 'New York, NY'],
    ['New York, NY; NYC', 'New York, NY'],
    ['New York, NY; NY, New York', 'New York, NY'],
    ['Atlanta, LA', 'Atlanta, LA'],
    ['St. Louis, MO; St Louis, Missouri', 'St. Louis, MO'],
    ['New York, NY; full-time', 'New York, NY'],
    ['New York, NY; One World Trade Center', 'New York, NY'],
    ['Remote, US; EST', 'Remote'],
    ['Portland, OR', 'Portland, OR'],
    ['Washington, DC', 'Washington, DC'],
    ['Paris, France', 'Paris, France'],
    ['Remote, US (state restrictions)', 'Remote'],
    ['US / Remote', 'Remote'],
    ['El Segundo, CA; body says hybrid, header says onsite', 'El Segundo, CA'],
  ]) assert.equal(states.cardLocation(location), expected, location);
});

test('compact display leaves geography and input records intact and exposes the same browser helper', () => {
  const job = Object.freeze({loc:'Redmond, WA, US; Mountain View, CA, US; New York, NY, US', state:'WA'});
  const before = JSON.stringify(job);
  assert.equal(states.cardLocation(job.loc), 'Multiple Locations');
  assert.deepEqual(states.extract(job.state, job.loc), ['CA','NY','WA']);
  assert.equal(JSON.stringify(job), before);
  for (const input of [null, undefined, {}, 27, '']) assert.equal(states.cardLocation(input), '');
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../js/us-states.js'),'utf8'), {window});
  assert.equal(window.SUStates.cardLocation(job.loc), 'Multiple Locations');
});

test('single workplace addresses display City, ST without changing the stored location or state filtering', () => {
  const examples = [
    ['CA-Sacramento; 4655 Fruitridge Road (Tribune-KTXL)', 'Sacramento, CA', ['CA']],
    ['CA-San Diego; 4575 Viewridge Ave (Nexstar - KUSI & KSWB)', 'San Diego, CA', ['CA']],
    ['CO-Denver; 100 E. Speer Blvd (Tribune-KDVR/KWGN)', 'Denver, CO', ['CO']],
    ['IL-Chicago; 2501 W. Bradley Place (WGN-TV)', 'Chicago, IL', ['IL']],
    ['California-Los Angeles 1041 N. Formosa Ave', 'Los Angeles, CA', ['CA']],
    ['DC-Washington; 2121 Wisconsin Ave NW (Nexstar-WDCW)', 'Washington, DC', []],
    ['DC Washington 820 1st Street NE', 'Washington, DC', []],
    ['DC, Washington', 'Washington, DC', []],
    ['NY, New York', 'New York, NY', ['NY']],
    ['Washington University (West Campus), Clayton, Missouri', 'Clayton, MO', ['MO']],
    ['San Jose, CALIFORNIA, United States', 'San Jose, CA', ['CA']],
    ['Universal City, CALIFORNIA, United States', 'Universal City, CA', ['CA']],
    ['Seattle, Washington, USA', 'Seattle, WA', ['WA']],
    ['123 Main Street, Sacramento, CA 95814', 'Sacramento, CA', ['CA']],
  ];
  for (const [location, expected, geography] of examples) {
    const row = Object.freeze({loc:location});
    const before = JSON.stringify(row);
    assert.equal(states.cardLocation(row.loc), expected, location);
    assert.deepEqual(states.extract('', row.loc), geography, location);
    assert.equal(JSON.stringify(row), before, 'raw details/search data stays exact');
    assert.equal(states.cardLocation(row.loc), expected, 'repeated formatting is stable');
  }
});

test('removing address tails neither invents extra offices nor merges separate cities', () => {
  assert.equal(states.cardLocation('NY New York 30 Hudson Yards; New York, NY'), 'New York, NY');
  assert.equal(states.cardLocation('CA-Sacramento; 4655 Fruitridge Road; CA-San Diego; 4575 Viewridge Ave'), 'Multiple Locations');
  assert.equal(states.cardLocation('DC Washington 820 1st Street NE; GA Atlanta 1050 Techwood Drive NW'), 'Multiple Locations');
  assert.equal(states.cardLocation('Los Angeles, CA / San Francisco, CA'), 'Multiple Locations');
  for (const source of ['Remote - US', 'Remote, United States', 'Remote, US (state restrictions)']) {
    assert.equal(states.cardLocation(source), 'Remote');
  }
  assert.equal(states.cardLocation('United States; hybrid office not specified'), 'Location not listed');
  for (const unknown of ['Worcester', 'Ithaca (Main Campus)', 'Paris, France', 'Company headquarters']) {
    assert.equal(states.cardLocation(unknown), unknown, 'unknown geography is not guessed');
  }
});
