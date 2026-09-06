'use strict';

const { createHandler } = require('./lib/internship-status.cjs');
const snapshot = require('../../internships-data.json');

exports.handler = createHandler({ snapshot });
