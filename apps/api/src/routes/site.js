const express = require('express');

const env = require('../config/env');
const {
  getPublicAirdropSnapshot,
  getPublicAmbassadorSnapshot,
  getPublicMarketPriceSnapshot,
  getPublicSiteSummary,
  refreshPublicSiteData
} = require('../services/publicData/siteData');

const router = express.Router();

function normalizeValue(value) {
  return String(value || '').trim();
}

function readAdminToken(req) {
  const authHeader = normalizeValue(req.headers.authorization);

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return normalizeValue(authHeader.slice(7));
  }

  return (
    normalizeValue(req.headers['x-admin-token']) ||
    normalizeValue(req.query.adminToken) ||
    normalizeValue(req.body?.adminToken)
  );
}

function requireAdminToken(req, res, next) {
  const expected = normalizeValue(env.ADMIN_SYNC_TOKEN);

  if (!expected) {
    return res.status(503).json({
      ok: false,
      error: 'ADMIN_SYNC_TOKEN is not configured'
    });
  }

  const received = readAdminToken(req);

  if (!received || received !== expected) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized'
    });
  }

  return next();
}

function setPublicCache(res, ttlSeconds) {
  const ttl = Math.max(30, Number(ttlSeconds) || 120);
  res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 10}`);
}

router.get('/health', (_req, res) => {
  return res.json({
    ok: true,
    service: 'fourteen-site-public-data',
    timestamp: Date.now()
  });
});

router.get('/summary', async (_req, res) => {
  try {
    const result = await getPublicSiteSummary();
    setPublicCache(res, env.SITE_PUBLIC_SUMMARY_TTL_SECONDS);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to load public site summary'
    });
  }
});

router.get('/airdrop', async (_req, res) => {
  try {
    const result = await getPublicAirdropSnapshot();
    setPublicCache(res, env.SITE_PUBLIC_AIRDROP_TTL_SECONDS);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to load public airdrop snapshot'
    });
  }
});

router.get('/ambassador', async (_req, res) => {
  try {
    const result = await getPublicAmbassadorSnapshot();
    setPublicCache(res, env.SITE_PUBLIC_AMBASSADOR_TTL_SECONDS);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to load public ambassador snapshot'
    });
  }
});

router.get('/market-price', async (_req, res) => {
  try {
    const result = await getPublicMarketPriceSnapshot();
    setPublicCache(res, env.SITE_PUBLIC_MARKET_TTL_SECONDS);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to load public market snapshot'
    });
  }
});

router.post('/admin/refresh', requireAdminToken, async (_req, res) => {
  try {
    const result = await refreshPublicSiteData();
    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Refresh failed'
    });
  }
});

module.exports = router;
