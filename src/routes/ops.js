const express = require('express');
const env = require('../config/env');
const { recordOpsEvent, resolveOpsEvent } = require('../services/ops/events');
const {
  buildKnowledgeBaseExport,
  getKnowledgeBaseStatus,
  syncKnowledgeBase
} = require('../services/ops/knowledgeBase');
const { runMonitorTick } = require('../services/ops/monitor');
const { ensureOpsTables, listRecentEvents } = require('../services/ops/store');
const { getSyntheticScreenerSnapshot } = require('../services/ops/screeners');
const { structureProductNote } = require('../services/ops/openai');
const {
  buildProductNotesMarkdown,
  createProductNote,
  listProductNotes
} = require('../services/ops/productNotes');
const {
  buildTaskWorkOrder,
  buildTaskWorkOrdersMarkdown,
  buildTasksMarkdown,
  createTask,
  getTaskById,
  listTasks,
  updateTaskStatus
} = require('../services/ops/tasks');
const {
  listCodexJobs,
  runCodexJobForTask
} = require('../services/ops/codexJobs');
const {
  cancelExecutionRequest,
  claimExecutionRequest,
  confirmExecutionRequestByCode,
  finishExecutionRequest,
  getExecutionRequestById,
  issueExecutionRequest,
  listExecutionRequests,
  normalizeActionType,
  normalizeRepoKey
} = require('../services/ops/executionRequests');
const { generateApplyPlan, validateChanges } = require('../services/ops/remoteApplyPlan');
const { verifyGithubActionsOidcToken } = require('../services/ops/githubOidc');
const {
  bootstrapAdminBotEnv,
  broadcastAdminMessage,
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

function normalizeAppRuntimeSource(value) {
  const safe = sanitizeText(value, 40).toLowerCase();

  if (safe === 'global' || safe === 'boundary' || safe === 'unhandledrejection') {
    return safe;
  }

  return 'global';
}

function normalizeBlogPublicationStatus(value) {
  const safe = sanitizeText(value, 40).toLowerCase();

  if (['published', 'success', 'ok', 'done', 'posted', 'live'].includes(safe)) {
    return 'published';
  }

  if (['failed', 'error', 'fail'].includes(safe)) {
    return 'failed';
  }

  if (['skipped', 'noop', 'ignored', 'canceled', 'cancelled'].includes(safe)) {
    return 'skipped';
  }

  return 'failed';
}

function normalizeBlogPublicationSeverity(status) {
  if (status === 'failed') {
    return 'error';
  }

  if (status === 'skipped') {
    return 'warning';
  }

  return 'info';
}

function buildBlogPublicationIdentity(payload) {
  return sanitizeText(
    payload?.slug ||
      payload?.url ||
      payload?.title ||
      payload?.locale ||
      payload?.repo ||
      'unknown',
    200
  ).toLowerCase();
}

function buildBlogPublicationNotification(payload) {
  const title = sanitizeText(payload?.title, 160) || 'Без названия';
  const status = normalizeBlogPublicationStatus(payload?.status);
  const link = sanitizeText(payload?.url || payload?.publicUrl, 400) || '';
  const slug = sanitizeText(payload?.slug, 120) || '';
  const locale = sanitizeText(payload?.locale, 40) || '';
  const repo = sanitizeText(payload?.repo, 80) || '4teen-website';
  const runUrl = sanitizeText(payload?.runUrl, 400) || '';
  const commitSha = sanitizeText(payload?.commitSha, 80) || '';
  const errorMessage =
    sanitizeText(payload?.error || payload?.errorMessage || payload?.message, 500) || 'Причина не передана';

  if (status === 'published') {
    return [
      '📰 Статья размещена в блоге',
      `Заголовок: ${title}`,
      slug ? `Slug: ${slug}` : '',
      locale ? `Язык: ${locale}` : '',
      `Репозиторий: ${repo}`,
      link ? `Ссылка: ${link}` : '',
      runUrl ? `Run: ${runUrl}` : '',
      commitSha ? `Commit: ${commitSha}` : ''
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    status === 'skipped' ? '⚠️ Статья не была размещена' : '🚨 Статья не разместилась',
    `Заголовок: ${title}`,
    slug ? `Slug: ${slug}` : '',
    locale ? `Язык: ${locale}` : '',
    `Репозиторий: ${repo}`,
    link ? `Планируемая ссылка: ${link}` : '',
    `Причина: ${errorMessage}`,
    runUrl ? `Run: ${runUrl}` : '',
    commitSha ? `Commit: ${commitSha}` : ''
  ]
    .filter(Boolean)
    .join('\n');
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

function readBearerToken(req) {
  const authHeader = normalizeValue(req.headers.authorization);
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return '';
  }

  return normalizeValue(authHeader.slice(7));
}

async function resolveOpsAuth(req, options = {}) {
  const expected = normalizeValue(env.ADMIN_SYNC_TOKEN);
  const receivedAdminToken = readAdminToken(req);
  if (expected && receivedAdminToken && receivedAdminToken === expected) {
    return {
      kind: 'admin'
    };
  }

  if (options.allowGithubRunner) {
    return verifyGithubActionsOidcToken(readBearerToken(req), {
      repoKey: options.expectedRepoKey || ''
    });
  }

  if (!expected) {
    const error = new Error('ADMIN_SYNC_TOKEN is not configured');
    error.status = 503;
    throw error;
  }

  const error = new Error('Unauthorized');
  error.status = 401;
  throw error;
}

function requireOpsAuth(options = {}) {
  return async (req, res, next) => {
    try {
      req.opsAuth = await resolveOpsAuth(req, options);
      return next();
    } catch (error) {
      return res.status(error.status || 500).json({
        ok: false,
        error: error.message
      });
    }
  };
}

const requireAdminToken = requireOpsAuth();

function sanitizeRunnerFileSnapshots(input) {
  const items = Array.isArray(input) ? input : [];
  return items.slice(0, 8).map((item) => ({
    path: sanitizeText(item?.path, 240).replace(/^\/+/, ''),
    content: String(item?.content || '').slice(0, 40_000)
  }));
}

function ensureRunnerCanAccessExecutionRequest(req, executionRequest) {
  if (!executionRequest) {
    const error = new Error('Execution request not found');
    error.status = 404;
    throw error;
  }

  if (req.opsAuth?.kind !== 'github-runner') {
    return;
  }

  if (normalizeRepoKey(executionRequest.repo_key) !== normalizeRepoKey(req.opsAuth.repoKey)) {
    const error = new Error('GitHub runner cannot access a different repository request');
    error.status = 403;
    throw error;
  }

  if (normalizeActionType(executionRequest.action_type) === 'apply' && normalizeValue(executionRequest.status) !== 'running') {
    const error = new Error('Execution request is not in running state');
    error.status = 409;
    throw error;
  }
}

function buildRunnerConfigForExecutionRequest(executionRequest) {
  const repoKey = normalizeRepoKey(executionRequest?.repo_key);
  const actionType = normalizeActionType(executionRequest?.action_type);
  const config = {
    repoKey,
    actionType,
    github: {
      owner: normalizeValue(env.GITHUB_REMOTE_OWNER) || 'info14fourteen-creator',
      walletRepo: normalizeValue(env.GITHUB_WALLET_REPO) || '4teen-wallet-app',
      websiteRepo: normalizeValue(env.GITHUB_WEBSITE_REPO) || '4teen-website'
    }
  };

  if (repoKey === 'wallet-app' && (actionType === 'deploy' || actionType === 'restart')) {
    const appName = normalizeValue(env.OPS_WALLET_HEROKU_APP_NAME) || 'fourteen-wallet-api';
    config.heroku = {
      configured: Boolean(
        normalizeValue(env.OPS_REMOTE_HEROKU_API_KEY) &&
          normalizeValue(env.OPS_REMOTE_HEROKU_EMAIL) &&
          appName
      ),
      appName,
      email: normalizeValue(env.OPS_REMOTE_HEROKU_EMAIL) || null,
      apiKey: normalizeValue(env.OPS_REMOTE_HEROKU_API_KEY) || null,
      gitUrl: appName ? `https://git.heroku.com/${appName}.git` : null,
      deploySubdir: 'apps/api'
    };
  }

  if (repoKey === 'website' && actionType === 'deploy') {
    config.cloudflare = {
      configured: Boolean(normalizeValue(env.OPS_REMOTE_CLOUDFLARE_API_TOKEN)),
      apiToken: normalizeValue(env.OPS_REMOTE_CLOUDFLARE_API_TOKEN) || null
    };
  }

  return config;
}

router.get('/health', async (_req, res) => {
  try {
    await ensureOpsTables();
    const [bootstrap, screeners, knowledgeBase] = await Promise.all([
      bootstrapAdminBotEnv().catch((error) => ({
        ok: false,
        error: error.message
      })),
      getSyntheticScreenerSnapshot().catch(() => null),
      getKnowledgeBaseStatus().catch(() => null)
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
      knowledgeBase: knowledgeBase
        ? {
            configured: knowledgeBase.configured === true,
            vectorStoreId: knowledgeBase.vectorStoreId || null,
            lastSyncedAt: knowledgeBase.lastSyncedAt || null,
            fileStatus: knowledgeBase.fileStatus || null
          }
        : null,
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

    const update = req.body || {};
    res.json({
      ok: true,
      accepted: true
    });

    Promise.resolve()
      .then(() => handleAdminTelegramWebhookUpdate(update))
      .catch(async (error) => {
        await recordOpsEvent({
          source: 'ops-bot',
          category: 'webhook',
          type: 'webhook_failure',
          severity: 'error',
          title: 'Admin bot webhook handler failed',
          message: error.message,
          fingerprint: 'ops-bot:webhook_failure'
        }).catch(() => null);
        console.error('[ops-bot] webhook_failure', {
          error: error.message,
          updateId: update?.update_id || null
        });
      });

    return;
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

router.post('/content/blog-publication', requireAdminToken, async (req, res) => {
  try {
    const status = normalizeBlogPublicationStatus(req.body?.status);
    const payload = {
      status,
      title: sanitizeText(req.body?.title, 160) || 'Blog article',
      slug: sanitizeText(req.body?.slug, 120) || null,
      url: sanitizeText(req.body?.url || req.body?.publicUrl, 400) || null,
      locale: sanitizeText(req.body?.locale, 40) || null,
      repo: sanitizeText(req.body?.repo, 80) || '4teen-website',
      runUrl: sanitizeText(req.body?.runUrl || req.body?.workflowRunUrl, 400) || null,
      commitSha: sanitizeText(req.body?.commitSha, 80) || null,
      message: sanitizeText(req.body?.message, 500) || null,
      error: sanitizeText(req.body?.error || req.body?.errorMessage, 500) || null,
      publishedAt: sanitizeText(req.body?.publishedAt, 80) || null,
      details: sanitizeJsonValue(req.body?.details, 0)
    };

    const identity = buildBlogPublicationIdentity(payload);
    const failureFingerprint = `website-blog:publish_failed:${identity}`;
    const successFingerprint = `website-blog:publish_success:${identity}`;

    if (status === 'published') {
      const successEvent = await recordOpsEvent({
        source: 'website-blog',
        category: 'content',
        type: 'blog_publish_success',
        severity: 'info',
        title: payload.title,
        message: payload.url
          ? `Статья опубликована: ${payload.url}`
          : 'Статья опубликована в блоге.',
        details: payload,
        fingerprint: successFingerprint,
        notify: false
      });

      await resolveOpsEvent({
        source: 'website-blog',
        category: 'content',
        type: 'blog_publish_success',
        fingerprint: successFingerprint,
        message: 'Публикация зафиксирована.'
      }).catch(() => null);

      await resolveOpsEvent({
        source: 'website-blog',
        category: 'content',
        type: 'blog_publish_failed',
        fingerprint: failureFingerprint,
        message: payload.url
          ? `Статья опубликована: ${payload.url}`
          : 'Проблема закрыта успешной публикацией.'
      }).catch(() => null);

      const text = buildBlogPublicationNotification(payload);
      const delivered = await broadcastAdminMessage(text)
        .then(() => true)
        .catch(() => false);

      return res.json({
        ok: true,
        result: {
          status,
          delivered,
          eventId: successEvent?.id || null
        }
      });
    }

    const failureEvent = await recordOpsEvent({
      source: 'website-blog',
      category: 'content',
      type: 'blog_publish_failed',
      severity: normalizeBlogPublicationSeverity(status),
      title: payload.title,
      message:
        payload.error ||
        payload.message ||
        (status === 'skipped'
          ? 'Публикация статьи была пропущена.'
          : 'Публикация статьи завершилась ошибкой.'),
      details: payload,
      fingerprint: failureFingerprint,
      notify: true
    });

    return res.json({
      ok: true,
      result: {
        status,
        eventId: failureEvent?.id || null
      }
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

router.post('/errors/app', async (req, res) => {
  try {
    const source = normalizeAppRuntimeSource(req.body?.source);
    const fatal = req.body?.fatal === true;
    const payload = {
      title: sanitizeText(req.body?.title, 120) || 'App runtime error',
      message: sanitizeText(req.body?.message, 500) || 'Unknown runtime error',
      currentPath: sanitizeText(req.body?.currentPath, 120) || 'unknown',
      lastStablePath: sanitizeText(req.body?.lastStablePath, 120) || 'unknown',
      recentPaths: Array.isArray(req.body?.recentPaths)
        ? req.body.recentPaths.map((item) => sanitizeText(item, 120)).filter(Boolean).slice(-6)
        : [],
      appVersion: sanitizeText(req.body?.appVersion, 80) || null,
      walletAddressMasked: sanitizeText(req.body?.walletAddressMasked, 60) || null,
      details: sanitizeJsonValue(req.body?.details, 0),
      fatal,
      source,
    };

    const fingerprint =
      sanitizeText(req.body?.fingerprint, 200) ||
      `app-runtime:${source}:${payload.currentPath}:${payload.title}:${payload.message}`;

    const event = await recordOpsEvent({
      source: 'app-runtime',
      category: 'runtime',
      type: `mobile_${source}`,
      severity: fatal ? 'error' : 'warning',
      title: payload.title,
      message: payload.message,
      details: payload,
      fingerprint,
      notify: true,
    });

    return res.json({
      ok: true,
      result: {
        id: event?.id || null,
        stored: true,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message,
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

router.post('/notes', requireAdminToken, async (req, res) => {
  try {
    const rawText = sanitizeText(req.body?.rawText || req.body?.body, 2_000);
    const structured = rawText
      ? await structureProductNote(rawText).catch(() => null)
      : null;

    const note = await createProductNote({
      source: sanitizeText(req.body?.source, 60) || 'ops-api',
      noteType: sanitizeText(req.body?.noteType, 40) || structured?.noteType || 'change',
      priority: sanitizeText(req.body?.priority, 40) || structured?.priority || 'normal',
      status: sanitizeText(req.body?.status, 40) || 'open',
      title: sanitizeText(req.body?.title, 140) || structured?.title || 'Product note',
      body: sanitizeText(req.body?.body, 2_000) || structured?.body || rawText || 'No details provided',
      transcriptText: sanitizeText(req.body?.transcriptText, 2_000) || null,
      targetRelease: sanitizeText(req.body?.targetRelease, 80) || structured?.targetRelease || null,
      createdByChatId: sanitizeText(req.body?.createdByChatId, 80) || null,
      details: sanitizeJsonValue(req.body?.details, 0)
    });

    return res.json({
      ok: true,
      result: note
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/notes/export', requireAdminToken, async (_req, res) => {
  try {
    const notes = await listProductNotes(50, { onlyOpen: false });
    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      items: notes,
      markdown: buildProductNotesMarkdown(notes)
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/tasks', requireAdminToken, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    const status = sanitizeText(req.query.status, 40);
    const includeDone = normalizeValue(req.query.includeDone).toLowerCase() === 'true';
    const tasks = await listTasks(limit, {
      status: status || null,
      includeDone
    });

    return res.json({
      ok: true,
      items: tasks
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/tasks', requireAdminToken, async (req, res) => {
  try {
    const result = await createTask({
      source: sanitizeText(req.body?.source, 60) || 'ops-api',
      taskType: sanitizeText(req.body?.taskType, 40) || 'task',
      status: sanitizeText(req.body?.status, 40) || 'new',
      priority: sanitizeText(req.body?.priority, 40) || 'normal',
      title: sanitizeText(req.body?.title, 160) || 'Untitled task',
      body: sanitizeText(req.body?.body, 2_000) || 'No details provided',
      dedupeKey: sanitizeText(req.body?.dedupeKey, 200) || null,
      createdByChatId: sanitizeText(req.body?.createdByChatId, 80) || null,
      noteId: Number(req.body?.noteId || 0) || null,
      eventId: Number(req.body?.eventId || 0) || null,
      details: sanitizeJsonValue(req.body?.details, 0)
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

router.patch('/tasks/:id/status', requireAdminToken, async (req, res) => {
  try {
    const task = await updateTaskStatus(req.params.id, req.body?.status, {
      body: sanitizeText(req.body?.body, 2_000) || null,
      details: sanitizeJsonValue(req.body?.details, 0)
    });

    if (!task) {
      return res.status(404).json({
        ok: false,
        error: 'Task not found'
      });
    }

    return res.json({
      ok: true,
      result: task
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/tasks/export', requireAdminToken, async (_req, res) => {
  try {
    const tasks = await listTasks(100, {
      includeDone: true
    });

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      items: tasks,
      markdown: buildTasksMarkdown(tasks)
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/tasks/:id/work-order', requireAdminToken, async (req, res) => {
  try {
    const task = await getTaskById(req.params.id);
    if (!task) {
      return res.status(404).json({
        ok: false,
        error: 'Task not found'
      });
    }

    return res.json({
      ok: true,
      item: buildTaskWorkOrder(task)
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/work-orders/export', requireAdminToken, async (_req, res) => {
  try {
    const tasks = await listTasks(100, {
      includeDone: true
    });

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      items: tasks.map((task) => buildTaskWorkOrder(task)),
      markdown: buildTaskWorkOrdersMarkdown(tasks)
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/tasks/:id/codex-run', requireAdminToken, async (req, res) => {
  try {
    const result = await runCodexJobForTask(req.params.id, {
      source: sanitizeText(req.body?.source, 60) || 'ops-api',
      createdByChatId: sanitizeText(req.body?.createdByChatId, 80) || null
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

router.post('/tasks/:id/execution-request', requireAdminToken, async (req, res) => {
  try {
    const result = await issueExecutionRequest({
      taskId: req.params.id,
      repoKey: sanitizeText(req.body?.repoKey, 60),
      actionType: sanitizeText(req.body?.actionType, 40),
      requestedByChatId: sanitizeText(req.body?.requestedByChatId, 80),
      requestedByUserId: sanitizeText(req.body?.requestedByUserId, 80),
      requestedMessage: sanitizeText(req.body?.requestedMessage, 1_000),
      details: sanitizeJsonValue(req.body?.details, 0)
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

router.get('/execution-requests', requireAdminToken, async (req, res) => {
  try {
    const items = await listExecutionRequests(Number(req.query.limit || 20), {
      status: sanitizeText(req.query.status, 40) || null,
      repoKey: normalizeRepoKey(req.query.repoKey),
      actionType: sanitizeText(req.query.actionType, 40) || null
    });

    return res.json({
      ok: true,
      items
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/execution-requests/confirm', requireAdminToken, async (req, res) => {
  try {
    const result = await confirmExecutionRequestByCode({
      chatId: sanitizeText(req.body?.chatId, 80),
      code: sanitizeText(req.body?.code, 20)
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

router.post('/execution-requests/claim', requireOpsAuth({
  allowGithubRunner: true
}), async (req, res) => {
  try {
    const result = await claimExecutionRequest({
      repoKey:
        req.opsAuth?.kind === 'github-runner'
          ? normalizeRepoKey(req.opsAuth.repoKey)
          : sanitizeText(req.body?.repoKey, 60),
      actionType: sanitizeText(req.body?.actionType, 40),
      runnerId: sanitizeText(req.body?.runnerId, 120)
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

router.get('/execution-requests/:id/work-order', requireOpsAuth({
  allowGithubRunner: true
}), async (req, res) => {
  try {
    const executionRequest = await getExecutionRequestById(req.params.id);
    ensureRunnerCanAccessExecutionRequest(req, executionRequest);

    const task = await getTaskById(executionRequest.task_id);
    if (!task) {
      return res.status(404).json({
        ok: false,
        error: 'Task not found'
      });
    }

    return res.json({
      ok: true,
      item: buildTaskWorkOrder(task),
      request: executionRequest
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/execution-requests/:id/runner-config', requireOpsAuth({
  allowGithubRunner: true
}), async (req, res) => {
  try {
    const executionRequest = await getExecutionRequestById(req.params.id);
    ensureRunnerCanAccessExecutionRequest(req, executionRequest);

    return res.json({
      ok: true,
      result: buildRunnerConfigForExecutionRequest(executionRequest),
      request: executionRequest
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/execution-requests/:id/apply-plan', requireOpsAuth({
  allowGithubRunner: true
}), async (req, res) => {
  try {
    const executionRequest = await getExecutionRequestById(req.params.id);
    ensureRunnerCanAccessExecutionRequest(req, executionRequest);

    if (normalizeActionType(executionRequest.action_type) !== 'apply') {
      return res.status(422).json({
        ok: false,
        error: 'Execution request is not an apply request'
      });
    }

    const task = await getTaskById(executionRequest.task_id);
    if (!task) {
      return res.status(404).json({
        ok: false,
        error: 'Task not found'
      });
    }

    const workOrder = buildTaskWorkOrder(task);
    const fileSnapshots = sanitizeRunnerFileSnapshots(req.body?.fileSnapshots).filter(
      (item) => item.path && item.content
    );

    if (!fileSnapshots.length) {
      return res.status(422).json({
        ok: false,
        error: 'fileSnapshots are required'
      });
    }

    const plan = await generateApplyPlan(executionRequest.repo_key, workOrder, fileSnapshots);
    if (normalizeValue(plan?.outcome) === 'apply') {
      try {
        validateChanges(plan, fileSnapshots.map((item) => item.path));
      } catch (error) {
        return res.json({
          ok: true,
          result: {
            outcome: 'blocked',
            summary: 'Server rejected unsafe patch plan',
            blockedReason: error.message,
            commitMessage: normalizeValue(plan?.commitMessage) || '',
            verificationHints: Array.isArray(plan?.verificationHints) ? plan.verificationHints : [],
            changes: []
          }
        });
      }
    }

    return res.json({
      ok: true,
      result: plan
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/execution-requests/:id/finish', requireOpsAuth({
  allowGithubRunner: true
}), async (req, res) => {
  try {
    const executionRequest = await getExecutionRequestById(req.params.id);
    ensureRunnerCanAccessExecutionRequest(req, executionRequest);
    const result = await finishExecutionRequest(req.params.id, {
      status: sanitizeText(req.body?.status, 40),
      runnerId: sanitizeText(req.body?.runnerId, 120),
      summary: sanitizeText(req.body?.summary, 500),
      resultMessage: sanitizeText(req.body?.resultMessage, 2_000),
      details: sanitizeJsonValue(req.body?.details, 0)
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

router.post('/execution-requests/:id/cancel', requireAdminToken, async (req, res) => {
  try {
    const result = await cancelExecutionRequest({
      requestId: req.params.id,
      chatId: sanitizeText(req.body?.chatId, 80)
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

router.get('/codex-jobs', requireAdminToken, async (req, res) => {
  try {
    const jobs = await listCodexJobs(Number(req.query.limit || 20), {
      taskId: Number(req.query.taskId || 0) || null
    });

    return res.json({
      ok: true,
      items: jobs
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/knowledge/export', requireAdminToken, async (_req, res) => {
  try {
    const payload = await buildKnowledgeBaseExport();
    return res.json({
      ok: true,
      ...payload
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/knowledge/sync', requireAdminToken, async (_req, res) => {
  try {
    const result = await syncKnowledgeBase();
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
