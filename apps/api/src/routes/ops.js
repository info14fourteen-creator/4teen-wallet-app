const express = require('express');
const env = require('../config/env');
const { recordOpsEvent } = require('../services/ops/events');
const { runMonitorTick } = require('../services/ops/monitor');
const { ensureOpsTables, listRecentEvents } = require('../services/ops/store');
const {
  bootstrapAdminBotEnv,
  getExpectedWebhookUrl,
  handleAdminTelegramWebhookUpdate
} = require('../services/ops/telegramAdminBot');

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

router.get('/health', async (_req, res) => {
  try {
    await ensureOpsTables();
    const bootstrap = await bootstrapAdminBotEnv().catch((error) => ({
      ok: false,
      error: error.message
    }));

    const adminBot = bootstrap
      ? {
          enabled: bootstrap.enabled !== false,
          ok: bootstrap.ok === true,
          synced: bootstrap.synced === true,
          warning: bootstrap.warning || null,
          error: bootstrap.error || null
        }
      : {
          enabled: false,
          ok: false,
          synced: false,
          warning: null,
          error: null
        };

    return res.json({
      ok: true,
      webhookConfigured: Boolean(getExpectedWebhookUrl()),
      adminBot
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
    const expectedSecret = normalizeValue(env.ADMIN_TELEGRAM_WEBHOOK_SECRET);
    const receivedSecret = normalizeValue(req.params.secret);

    if (!expectedSecret || receivedSecret !== expectedSecret) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized'
      });
    }

    const result = await handleAdminTelegramWebhookUpdate(req.body || {});
    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    await recordOpsEvent({
      source: 'ops-bot',
      category: 'webhook',
      type: 'webhook_failure',
      severity: 'error',
      title: 'Admin bot webhook handler failed',
      message: error.message,
      fingerprint: 'ops-bot:webhook_failure'
    }).catch(() => null);

    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/feedback', requireAdminToken, async (req, res) => {
  try {
    const payload = {
      title: normalizeValue(req.body?.title) || 'Manual feedback',
      message: normalizeValue(req.body?.message) || 'No message provided',
      sourceScreen: normalizeValue(req.body?.sourceScreen) || null,
      appVersion: normalizeValue(req.body?.appVersion) || null,
      walletAddressMasked: normalizeValue(req.body?.walletAddressMasked) || null,
      details: req.body?.details || null
    };

    const event = await recordOpsEvent({
      source: 'feedback',
      category: 'feedback',
      type: normalizeValue(req.body?.type) || 'manual_feedback',
      severity: normalizeValue(req.body?.severity) || 'info',
      title: payload.title,
      message: payload.message,
      details: payload,
      fingerprint:
        normalizeValue(req.body?.fingerprint) ||
        `feedback:${payload.title}:${payload.message}:${payload.sourceScreen || 'unknown'}`
    });

    return res.json({
      ok: true,
      result: event
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/monitor/run', requireAdminToken, async (_req, res) => {
  try {
    await runMonitorTick('manual');
    const events = await listRecentEvents(10, { onlyOpen: true }).catch(() => []);

    return res.json({
      ok: true,
      openEvents: events.length
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

module.exports = router;
