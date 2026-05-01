const crypto = require('crypto');
const { fetch } = require('undici');
const env = require('../../config/env');
const { pool } = require('../../db/pool');
const {
  ensureOpsTables,
  getOwnerTelegramTarget,
  getRuntimeState,
  getTelegramTargetByChatId,
  listActiveTelegramTargets,
  listRecentEvents,
  touchTelegramTarget,
  upsertTelegramTarget
} = require('./store');

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';

let webhookEnsurePromise = null;

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeCommand(text) {
  const firstToken = normalizeValue(text).split(/\s+/, 1)[0] || '';
  return firstToken.replace(/@.+$/, '').toLowerCase();
}

function getAirdropService() {
  return require('../airdrop/telegramBot');
}

function getAmbassadorService() {
  return require('../ambassador/replayQueue');
}

function getGasStationService() {
  return require('../gasstation/gasStation');
}

function getProxyService() {
  return require('../proxy/apiProxy');
}

function getAdminBotToken() {
  return normalizeValue(env.ADMIN_TELEGRAM_BOT_TOKEN);
}

function getAdminWebhookBaseUrl() {
  return (
    normalizeValue(env.ADMIN_TELEGRAM_WEBHOOK_BASE_URL) ||
    normalizeValue(env.TELEGRAM_WEBHOOK_BASE_URL)
  );
}

function getAdminWebhookSecret() {
  return normalizeValue(env.ADMIN_TELEGRAM_WEBHOOK_SECRET);
}

function getExpectedWebhookUrl() {
  const baseUrl = getAdminWebhookBaseUrl();
  const secret = getAdminWebhookSecret();

  if (!baseUrl || !secret) {
    return '';
  }

  return `${baseUrl.replace(/\/+$/, '')}/ops/telegram/webhook/${encodeURIComponent(secret)}`;
}

function buildBotApiUrl(method) {
  const token = getAdminBotToken();

  if (!token) {
    const error = new Error('ADMIN_TELEGRAM_BOT_TOKEN is not configured');
    error.status = 503;
    throw error;
  }

  return `${TELEGRAM_API_BASE_URL}/bot${token}/${method}`;
}

async function adminTelegramApi(method, body) {
  const response = await fetch(buildBotApiUrl(method), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body || {})
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.description || `Telegram ${method} failed`);
    error.status = response.status || 500;
    error.details = payload;
    throw error;
  }

  return payload?.result;
}

async function sendTelegramMessage(chatId, text) {
  return adminTelegramApi('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}

async function broadcastAdminMessage(text) {
  const targets = await listActiveTelegramTargets().catch(() => []);

  if (!targets.length) {
    return [];
  }

  const results = [];

  for (const target of targets) {
    try {
      const message = await sendTelegramMessage(target.chat_id, text);
      results.push({
        chatId: target.chat_id,
        ok: true,
        message
      });
    } catch (error) {
      results.push({
        chatId: target.chat_id,
        ok: false,
        error: error.message
      });
    }
  }

  return results;
}

async function claimOwnerIfPossible(message) {
  const chatId = normalizeValue(message?.chat?.id);
  const chatType = normalizeValue(message?.chat?.type);
  const userId = normalizeValue(message?.from?.id);

  if (!chatId || chatType !== 'private') {
    return {
      claimed: false,
      reason: 'owner can only be claimed from a private chat'
    };
  }

  const owner = await getOwnerTelegramTarget();
  if (owner) {
    return {
      claimed: false,
      reason: 'owner already configured'
    };
  }

  const claimed = await upsertTelegramTarget({
    chatId,
    chatType,
    label: message?.from?.username ? `@${message.from.username}` : message?.from?.first_name || 'owner',
    telegramUserId: userId,
    isOwner: true,
    isActive: true
  });

  return {
    claimed: Boolean(claimed),
    target: claimed
  };
}

async function isAuthorizedMessage(message) {
  const chatId = normalizeValue(message?.chat?.id);
  const userId = normalizeValue(message?.from?.id);

  if (!chatId) {
    return false;
  }

  const target = await getTelegramTargetByChatId(chatId);
  if (target?.is_active) {
    if (target.chat_type === 'private' && target.telegram_user_id && userId && target.telegram_user_id !== userId) {
      return false;
    }

    return true;
  }

  const owner = await getOwnerTelegramTarget();
  return Boolean(owner && owner.telegram_user_id && userId && owner.telegram_user_id === userId);
}

function formatRelativeMinutes(timestamp) {
  const time = new Date(timestamp || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) {
    return 'unknown';
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  return `${diffMinutes}m ago`;
}

function formatKeyPoolLine(label, snapshot) {
  const available = Number(snapshot?.available || 0);
  const total = Number(snapshot?.total || 0);
  const coolingDown = Number(snapshot?.coolingDown || 0);
  return `${label}: ${available}/${total} ready, cooldown ${coolingDown}`;
}

function formatTargets(targets) {
  if (!targets.length) {
    return 'No active Telegram targets.';
  }

  return targets
    .map((target) => {
      const prefix = target.is_owner ? 'owner' : 'target';
      const label = normalizeValue(target.label) || target.chat_type;
      return `${prefix}: ${label} (${target.chat_id})`;
    })
    .join('\n');
}

async function buildHealthText() {
  const { hasEnoughAirdropResources } = getAirdropService();
  const { hasEnoughAmbassadorAllocationResources } = getAmbassadorService();
  const { getGasStationRuntimeState } = getGasStationService();
  const { getProxyKeyPoolRuntimeState } = getProxyService();
  const [dbOk, clockState, airdropState, ambassadorState, gasState] = await Promise.all([
    pool.query('SELECT 1').then(() => true).catch(() => false),
    getRuntimeState('clock.heartbeat').catch(() => null),
    hasEnoughAirdropResources().catch(() => null),
    hasEnoughAmbassadorAllocationResources().catch(() => null),
    getGasStationRuntimeState().catch(() => null)
  ]);

  const clockPayload = clockState?.value_json || null;
  const keyPools = getProxyKeyPoolRuntimeState();

  return [
    '4TEEN Ops Health',
    `db: ${dbOk ? 'ok' : 'fail'}`,
    `clock: ${clockPayload?.status || 'unknown'} (${formatRelativeMinutes(clockPayload?.heartbeatAt || clockState?.updated_at)})`,
    `airdrop resources: ${airdropState?.hasEnough ? 'ok' : 'low'}`,
    `ambassador resources: ${ambassadorState?.hasEnough ? 'ok' : 'low'}`,
    `gasstation: ${gasState?.enabled ? 'enabled' : 'disabled'}`,
    formatKeyPoolLine('trongrid', keyPools.trongrid),
    formatKeyPoolLine('tronscan', keyPools.tronscan),
    formatKeyPoolLine('cmc', keyPools.cmc)
  ].join('\n');
}

async function buildKeysText() {
  const { getProxyKeyPoolRuntimeState } = getProxyService();
  const { getGasStationCredentialRuntimeState } = getGasStationService();
  const keyPools = getProxyKeyPoolRuntimeState();
  const gasPool = getGasStationCredentialRuntimeState();

  const gasLines = Array.isArray(gasPool?.credentials)
    ? gasPool.credentials.map((item) => {
        const state = item.state || {};
        const status = state.lastErrorAt ? `last error ${formatRelativeMinutes(state.lastErrorAt)}` : 'ok';
        return `${item.label}: ${status}`;
      })
    : [];

  return [
    'Key Pools',
    formatKeyPoolLine('trongrid', keyPools.trongrid),
    formatKeyPoolLine('tronscan', keyPools.tronscan),
    formatKeyPoolLine('cmc', keyPools.cmc),
    'GasStation:',
    ...(gasLines.length ? gasLines : ['no credentials configured'])
  ].join('\n');
}

async function buildEventsText() {
  const events = await listRecentEvents(8, { onlyOpen: true }).catch(() => []);

  if (!events.length) {
    return 'No open ops events.';
  }

  return [
    'Open Ops Events',
    ...events.map((event) => {
      const severity = normalizeValue(event.severity).toUpperCase();
      const count = Number(event.count || 0);
      return `${severity} • ${event.source} • ${event.title} • x${count}`;
    })
  ].join('\n');
}

async function buildQueuesText() {
  const [clockState, events] = await Promise.all([
    getRuntimeState('clock.heartbeat').catch(() => null),
    listRecentEvents(5, { onlyOpen: true }).catch(() => [])
  ]);

  const clockPayload = clockState?.value_json || {};
  const processed = clockPayload?.processed ?? 'n/a';
  const ambassadorProcessed = clockPayload?.ambassadorProcessed?.totalWallets ?? 'n/a';

  return [
    'Queue Snapshot',
    `telegram claims processed last tick: ${processed}`,
    `ambassador wallets last tick: ${ambassadorProcessed}`,
    `open ops events: ${events.length}`
  ].join('\n');
}

async function ensureAdminTelegramWebhook() {
  const expectedUrl = getExpectedWebhookUrl();

  if (!expectedUrl) {
    return null;
  }

  if (webhookEnsurePromise) {
    return webhookEnsurePromise;
  }

  webhookEnsurePromise = (async () => {
    try {
      const info = await adminTelegramApi('getWebhookInfo', {});
      if (normalizeValue(info?.url) === expectedUrl) {
        return {
          ok: true,
          url: expectedUrl,
          synced: true
        };
      }

      await adminTelegramApi('setWebhook', {
        url: expectedUrl,
        allowed_updates: ['message']
      });

      return {
        ok: true,
        url: expectedUrl,
        synced: true
      };
    } finally {
      webhookEnsurePromise = null;
    }
  })();

  return webhookEnsurePromise;
}

async function bootstrapAdminBotEnv() {
  await ensureOpsTables();

  const token = getAdminBotToken();
  if (!token) {
    return {
      enabled: false,
      reason: 'ADMIN_TELEGRAM_BOT_TOKEN is not configured'
    };
  }

  if (!getAdminWebhookSecret()) {
    return {
      enabled: true,
      warning: 'ADMIN_TELEGRAM_WEBHOOK_SECRET is not configured'
    };
  }

  return ensureAdminTelegramWebhook();
}

async function reply(chatId, text) {
  await sendTelegramMessage(chatId, text);
}

async function handleCommand(message) {
  const chatId = normalizeValue(message?.chat?.id);
  const command = normalizeCommand(message?.text);

  if (!chatId) {
    return {
      ok: false,
      ignored: true
    };
  }

  await touchTelegramTarget(chatId, message?.from?.id).catch(() => null);

  if (command === '/start') {
    const owner = await getOwnerTelegramTarget();
    if (!owner) {
      const claimed = await claimOwnerIfPossible(message);

      if (claimed.claimed) {
        await reply(
          chatId,
          'Owner chat linked. Available commands:\n/help\n/health\n/keys\n/events\n/queues\n/targets\n/allow_here'
        );

        return { ok: true, claimedOwner: true };
      }
    }
  }

  const authorized = await isAuthorizedMessage(message);
  if (!authorized) {
    await reply(chatId, 'This chat is not authorized for 4TEEN ops.');
    return {
      ok: false,
      unauthorized: true
    };
  }

  if (command === '/help' || command === '/start') {
    await reply(
      chatId,
      'Commands:\n/health\n/keys\n/events\n/queues\n/targets\n/allow_here'
    );
    return { ok: true };
  }

  if (command === '/health') {
    await reply(chatId, await buildHealthText());
    return { ok: true };
  }

  if (command === '/keys') {
    await reply(chatId, await buildKeysText());
    return { ok: true };
  }

  if (command === '/events') {
    await reply(chatId, await buildEventsText());
    return { ok: true };
  }

  if (command === '/queues') {
    await reply(chatId, await buildQueuesText());
    return { ok: true };
  }

  if (command === '/targets') {
    const targets = await listActiveTelegramTargets();
    await reply(chatId, formatTargets(targets));
    return { ok: true };
  }

  if (command === '/allow_here') {
    const owner = await getOwnerTelegramTarget();
    const ownerUserId = normalizeValue(owner?.telegram_user_id);
    const currentUserId = normalizeValue(message?.from?.id);

    if (!ownerUserId || ownerUserId !== currentUserId) {
      await reply(chatId, 'Only the owner can allow this chat.');
      return { ok: false };
    }

    const target = await upsertTelegramTarget({
      chatId,
      chatType: message?.chat?.type,
      label: message?.chat?.title || message?.from?.username || message?.from?.first_name || 'ops target',
      telegramUserId: message?.chat?.type === 'private' ? currentUserId : null,
      isOwner: Boolean(owner?.chat_id === chatId),
      isActive: true
    });

    await reply(chatId, `Chat allowed: ${normalizeValue(target?.label) || chatId}`);
    return { ok: true };
  }

  await reply(chatId, 'Unknown command. Use /help.');
  return { ok: true };
}

async function handleAdminTelegramWebhookUpdate(update) {
  const message = update?.message;

  if (!message?.text) {
    return {
      ok: true,
      ignored: true
    };
  }

  return handleCommand(message);
}

module.exports = {
  bootstrapAdminBotEnv,
  broadcastAdminMessage,
  ensureAdminTelegramWebhook,
  getExpectedWebhookUrl,
  handleAdminTelegramWebhookUpdate
};
