const express = require('express');
const env = require('../config/env');
const { recordOpsEvent, resolveOpsEvent } = require('../services/ops/events');
const { runMonitorTick } = require('../services/ops/monitor');
const { ensureOpsTables, listRecentEvents } = require('../services/ops/store');
const { getSyntheticScreenerSnapshot } = require('../services/ops/screeners');
const {
  bootstrapAdminBotEnv,
  getExpectedWebhookUrl,
  handleAdminTelegramWebhookUpdate
} = require('../services/ops/telegramAdminBot');

const router = express.Router();

function normalizeValue(value) {
  return String(value || '').trim();
}

function sanitizeText(value, maxLength = 500) {
  return normalizeValue(value)
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function sanitizeJsonValue(value, depth = 0) {
  if (depth > 3) {
    return null;
  }

  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) => sanitizeJsonValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 24)
        .map(([key, item]) => [sanitizeText(key, 80), sanitizeJsonValue(item, depth + 1)])
    );
  }

  if (typeof value === 'string') {
    return sanitizeText(value, 500);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return sanitizeText(value, 120);
}

function normalizeAppFeedbackType(value) {
  const safe = sanitizeText(value, 40).toLowerCase();

  if (['issue', 'confusing', 'slow', 'idea', 'praise'].includes(safe)) {
    return safe;
  }

  return 'issue';
}

function severityForAppFeedback(type) {
  if (type === 'praise' || type === 'idea') {
    return 'info';
  }

  return 'warning';
}

function shouldNotifyAppFeedback(type) {
  return type === 'issue' || type === 'slow' || type === 'confusing';
}

function shouldKeepAppFeedbackOpen(type) {
  return type === 'issue' || type === 'slow' || type === 'confusing';
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
    const [bootstrap, screeners] = await Promise.all([
      bootstrapAdminBotEnv().catch((error) => ({
        ok: false,
        error: error.message
      })),
      getSyntheticScreenerSnapshot().catch(() => null)
    ]);

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
      adminBot,
      screeners: screeners
        ? {
            checkedAt: screeners.checkedAt || null,
            summary: screeners.summary || null,
            items: Array.isArray(screeners.items)
              ? screeners.items.map((item) => ({
                  key: item.key,
                  label: item.label,
                  status: item.status,
                  summary: item.summary
                }))
              : []
          }
        : null
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

router.post('/feedback/app', async (req, res) => {
  try {
    const type = normalizeAppFeedbackType(req.body?.type);
    const payload = {
      title: sanitizeText(req.body?.title, 120) || 'Wallet feedback',
      message: sanitizeText(req.body?.message, 500) || 'No message provided',
      sourceScreen: sanitizeText(req.body?.sourceScreen, 80) || 'unknown',
      appVersion: sanitizeText(req.body?.appVersion, 80) || null,
      walletAddressMasked: sanitizeText(req.body?.walletAddressMasked, 60) || null,
      details: sanitizeJsonValue(req.body?.details, 0)
    };

    const fingerprint =
      sanitizeText(req.body?.fingerprint, 200) ||
      `app-feedback:${type}:${payload.sourceScreen}:${payload.title}:${payload.message}`;

    const event = await recordOpsEvent({
      source: 'app-feedback',
      category: 'feedback',
      type: `app_${type}`,
      severity: severityForAppFeedback(type),
      title: payload.title,
      message: payload.message,
      details: payload,
      fingerprint,
      notify: shouldNotifyAppFeedback(type)
    });

    if (!shouldKeepAppFeedbackOpen(type)) {
      await resolveOpsEvent({
        source: 'app-feedback',
        category: 'feedback',
        type: `app_${type}`,
        fingerprint,
        message: 'Feedback stored.'
      }).catch(() => null);
    }

    return res.json({
      ok: true,
      result: {
        id: event?.id || null,
        stored: true
      }
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
    const [events, screeners] = await Promise.all([
      listRecentEvents(10, { onlyOpen: true }).catch(() => []),
      getSyntheticScreenerSnapshot().catch(() => null)
    ]);

    return res.json({
      ok: true,
      openEvents: events.length,
      screeners: screeners
        ? {
            checkedAt: screeners.checkedAt || null,
            summary: screeners.summary || null
          }
        : null
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

module.exports = router;
