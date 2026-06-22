const express = require('express');
const env = require('../config/env');
const {
  ensureTransferPassTables,
  listPlans,
  getLatestSubscription,
  quoteTransferPassSend,
  createSponsoredTransfer,
  getSponsoredTransferById,
  getTransferPassHistory,
  createSubscriptionIntent,
  activateSubscriptionAdmin,
  fulfillSponsoredTransferAdmin
} = require('../services/transferPass/service');

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

function readErrorMessage(error, fallback = 'Transfer Pass request failed') {
  if (normalizeValue(error?.message)) {
    return normalizeValue(error.message);
  }

  if (normalizeValue(error?.code)) {
    return normalizeValue(error.code);
  }

  return fallback;
}

router.get('/health', async (_req, res) => {
  try {
    await ensureTransferPassTables();
    return res.json({
      ok: true,
      enabled: String(env.TRANSFER_PASS_ENABLED || '').toLowerCase().includes('true'),
      defaultEnergy: Number(env.TRANSFER_PASS_DEFAULT_ENERGY || 0),
      defaultBandwidth: Number(env.TRANSFER_PASS_DEFAULT_BANDWIDTH || 0)
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: readErrorMessage(error, 'Failed to load Transfer Pass health')
    });
  }
});

router.get('/plans', async (_req, res) => {
  try {
    const result = await listPlans();
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: readErrorMessage(error) });
  }
});

router.get('/subscription', async (req, res) => {
  try {
    const walletAddress = normalizeValue(req.query.wallet || req.query.walletAddress);
    if (!walletAddress) {
      return res.status(400).json({ ok: false, error: 'wallet or walletAddress is required' });
    }

    const result = await getLatestSubscription(walletAddress);
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: readErrorMessage(error) });
  }
});

router.post('/quote-send', async (req, res) => {
  try {
    const result = await quoteTransferPassSend({
      walletAddress: req.body?.walletAddress || req.body?.wallet,
      recipientAddress: req.body?.recipientAddress || req.body?.recipient,
      amountUsdt: req.body?.amountUsdt || req.body?.amount
    });
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: readErrorMessage(error) });
  }
});

router.post('/create-send', async (req, res) => {
  try {
    const result = await createSponsoredTransfer({
      walletAddress: req.body?.walletAddress || req.body?.wallet,
      recipientAddress: req.body?.recipientAddress || req.body?.recipient,
      amountUsdt: req.body?.amountUsdt || req.body?.amount,
      note: req.body?.note
    });
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: readErrorMessage(error) });
  }
});

router.get('/send-status/:id', async (req, res) => {
  try {
    const result = await getSponsoredTransferById(req.params.id);
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: readErrorMessage(error) });
  }
});

router.get('/history', async (req, res) => {
  try {
    const result = await getTransferPassHistory({
      walletAddress: req.query.wallet || req.query.walletAddress,
      limit: req.query.limit
    });
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: readErrorMessage(error) });
  }
});

router.post('/subscribe', async (req, res) => {
  try {
    const result = await createSubscriptionIntent({
      walletAddress: req.body?.walletAddress || req.body?.wallet,
      planCode: req.body?.planCode || req.body?.plan,
      note: req.body?.note
    });
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: readErrorMessage(error) });
  }
});

router.post('/admin/subscriptions/activate', requireAdminToken, async (req, res) => {
  try {
    const result = await activateSubscriptionAdmin({
      walletAddress: req.body?.walletAddress || req.body?.wallet,
      planCode: req.body?.planCode || req.body?.plan,
      note: req.body?.note
    });
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: readErrorMessage(error) });
  }
});

router.post('/admin/sends/:id/fulfill', requireAdminToken, async (req, res) => {
  try {
    const result = await fulfillSponsoredTransferAdmin({
      sendId: req.params.id,
      note: req.body?.note
    });
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
