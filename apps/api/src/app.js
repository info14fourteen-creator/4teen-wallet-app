const express = require('express');
const env = require('./config/env');
const healthRouter = require('./routes/health');
const proxyRouter = require('./routes/proxy');
const walletRouter = require('./routes/wallet');
const ambassadorRouter = require('./routes/ambassador');
const energyResaleRouter = require('./routes/energyResale');

const app = express();

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '').toLowerCase();
}

function parseAllowedOrigins(value) {
  return String(value || '')
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

app.disable('x-powered-by');

app.use((req, res, next) => {
  const requestOriginRaw = req.headers.origin;
  const requestOrigin = normalizeOrigin(requestOriginRaw);

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOriginRaw);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return next();
});

app.use(express.json({ limit: '1mb' }));

app.use('/', healthRouter);
app.use('/', proxyRouter);
app.use('/wallet', walletRouter);
app.use('/energy-resale', energyResaleRouter);
app.use('/ambassador', ambassadorRouter);

module.exports = app;
