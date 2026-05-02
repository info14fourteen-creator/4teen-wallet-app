const express = require('express');
const env = require('../config/env');
const {
  ensureTelegramAirdropTables,
  getTelegramAirdropOverview,
  getTelegramAirdropGuardStatus,
  importLegacyTelegramClaims,
  upsertTelegramAccountLink
} = require('../services/airdrop/telegramClaims');
const {
  enqueueTelegramClaimDrain,
  getAirdropWalletResources,
  handleTelegramWebhookUpdate,
  hasEnoughAirdropResources,
  prepareTelegramSession,
  syncTelegramWebhook,
  verifyTelegramSession
} = require('../services/airdrop/telegramBot');

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

router.get('/telegram/health', async (_req, res) => {
  try {
    await ensureTelegramAirdropTables();
    const resourceState = await hasEnoughAirdropResources().catch(() => null);

    return res.json({
      ok: true,
      platform: 'telegram',
      botConfigured: Boolean(String(env.TELEGRAM_BOT_TOKEN || '').trim()),
      webhookConfigured: Boolean(
        String(env.TELEGRAM_WEBHOOK_BASE_URL || '').trim() &&
          String(env.TELEGRAM_WEBHOOK_SECRET || '').trim()
      ),
      resourceState
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/telegram/overview', async (req, res) => {
  try {
    const result = await getTelegramAirdropOverview({
      walletAddress: req.query?.walletAddress
    });

    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/telegram/guard-status', async (req, res) => {
  try {
    const result = await getTelegramAirdropGuardStatus({
      walletAddress: req.body?.walletAddress,
      telegramUserId: req.body?.telegramUserId
    });

    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/telegram/session', async (req, res) => {
  try {
    const result = await prepareTelegramSession(req.body?.walletAddress);

    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/telegram/session/verify', async (req, res) => {
  try {
    const result = await verifyTelegramSession({
      walletAddress: req.body?.walletAddress,
      sessionToken: req.body?.sessionToken,
      signature: req.body?.signature
    });

    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/telegram/webhook/:secret', async (req, res) => {
  try {
    const expectedSecret = normalizeValue(env.TELEGRAM_WEBHOOK_SECRET);

    if (!expectedSecret) {
      return res.status(503).json({
        ok: false,
        error: 'TELEGRAM_WEBHOOK_SECRET is not configured'
      });
    }

    if (normalizeValue(req.params.secret) !== expectedSecret) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized'
      });
    }

    const result = await handleTelegramWebhookUpdate(req.body || {});
    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/telegram/link', requireAdminToken, async (req, res) => {
  try {
    const link = await upsertTelegramAccountLink({
      walletAddress: req.body?.walletAddress,
      telegramUserId: req.body?.telegramUserId,
      telegramUsername: req.body?.telegramUsername,
      telegramChatId: req.body?.telegramChatId,
      legacyClaimed: req.body?.legacyClaimed,
      notes: req.body?.notes
    });

    return res.json({
      ok: true,
      result: link
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message,
      details: error.details || null
    });
  }
});

router.post('/telegram/admin/process-queue', requireAdminToken, async (_req, res) => {
  try {
    const processed = await enqueueTelegramClaimDrain();
    const resources = await getAirdropWalletResources().catch(() => null);

    return res.json({
      ok: true,
      result: {
        processed,
        resources
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/telegram/admin/webhook/sync', requireAdminToken, async (_req, res) => {
  try {
    const result = await syncTelegramWebhook();

    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/telegram/admin/import-legacy', requireAdminToken, async (req, res) => {
  try {
    const result = await importLegacyTelegramClaims({
      sourceConnectionString: req.body?.sourceDatabaseUrl
    });

    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

module.exports = router;
