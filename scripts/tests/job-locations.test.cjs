const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const states = require('../../js/us-states.js');
const fixtures = require('./fixtures/job-locations.json');

test('all 162 current job-location labels distinguish multiple offices from a single address', () => {
  assert.equal(fixtures.multiple.length + fixtures.single.length, 162);
  for (const location of fixtures.multiple) assert.equal(states.cardLocation(location), 'Multiple locations', location);
  for (const location of fixtures.single) assert.equal(states.cardLocation(location), location, location);
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
  ]) assert.equal(states.cardLocation(location), 'Multiple locations', location);
  for (const location of [
    'New York, NY, United States',
    'Boston, MA (Main Campus)',
    'Los Angeles, CA - University Park Campus',
    'New York, NY; New York, New York',
    'New York, NY; NYC',
    'New York, NY; NY, New York',
    'Atlanta, LA',
    'St. Louis, MO; St Louis, Missouri',
    'New York, NY; full-time',
    'New York, NY; One World Trade Center',
    'Remote, US; EST',
    'Portland, OR',
    'Washington, DC',
    'Paris, France',
    'Remote, US (state restrictions)',
    'US / Remote',
    'El Segundo, CA; body says hybrid, header says onsite',
  ]) assert.equal(states.cardLocation(location), location, location);
});

test('compact display leaves geography and input records intact and exposes the same browser helper', () => {
  const job = Object.freeze({loc:'Redmond, WA, US; Mountain View, CA, US; New York, NY, US', state:'WA'});
  const before = JSON.stringify(job);
  assert.equal(states.cardLocation(job.loc), 'Multiple locations');
  assert.deepEqual(states.extract(job.state, job.loc), ['CA','NY','WA']);
  assert.equal(JSON.stringify(job), before);
  for (const input of [null, undefined, {}, 27, '']) assert.equal(states.cardLocation(input), '');
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../js/us-states.js'),'utf8'), {window});
  assert.equal(window.SUStates.cardLocation(job.loc), 'Multiple locations');
});
