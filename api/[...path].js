'use strict';

const { handler } = require('../src/server');

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
