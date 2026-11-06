'use strict';

const { handler } = require('../src/server');

module.exports = (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = String(url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '');
  req.url = `/sandbox/${id}`;
  return handler(req, res);
};

module.exports.config = { api: { bodyParser: false } };
