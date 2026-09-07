'use strict';

const { createHandler } = require('./lib/internship-status.cjs');
const snapshot = require('../../internships-data.json');
const displayCopy = require('./lib/internship-display.json');

exports.handler = createHandler({ snapshot, displayCopy });
