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
const CALLBACK_PREFIX = 'ops:';
const DEFAULT_SCREEN = 'overview';
const SUPPORTED_SCREENS = new Set(['overview', 'health', 'events', 'keys', 'queues', 'targets']);
const BOT_COMMANDS = [
  { command: 'menu', description: 'Открыть главное меню' },
  { command: 'health', description: 'Понять, что сейчас болит' },
  { command: 'events', description: 'Посмотреть активные проблемы' },
  { command: 'keys', description: 'Проверить ключи и лимиты' },
  { command: 'queues', description: 'Посмотреть очереди и фоновые задачи' },
  { command: 'targets', description: 'Увидеть разрешённые чаты' },
  { command: 'allow_here', description: 'Разрешить этот чат для уведомлений' }
];

let webhookEnsurePromise = null;

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeCommand(text) {
  const firstToken = normalizeValue(text).split(/\s+/, 1)[0] || '';
  return firstToken.replace(/@.+$/, '').toLowerCase();
}

function normalizeMenuIntent(text) {
  const safe = normalizeValue(text).toLowerCase();
  if (!safe) return '';
  if (safe === 'меню' || safe === 'menu' || safe === '🏠 меню') return '/menu';
  if (safe === 'обновить' || safe === 'refresh' || safe === '🔄 обновить') return '/menu';
  return '';
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

async function sendTelegramMessage(chatId, text, replyMarkup) {
  return adminTelegramApi('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup || undefined,
    disable_web_page_preview: true
  });
}

async function editTelegramMessage(chatId, messageId, text, replyMarkup) {
  return adminTelegramApi('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: replyMarkup || undefined,
    disable_web_page_preview: true
  });
}

async function answerTelegramCallback(callbackQueryId, text) {
  return adminTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text || undefined,
    show_alert: false
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
    return 'неизвестно';
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (diffMinutes < 1) return 'только что';
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;
  const hours = Math.floor(diffMinutes / 60);
  const restMinutes = diffMinutes % 60;
  return restMinutes > 0 ? `${hours} ч ${restMinutes} мин назад` : `${hours} ч назад`;
}

function formatKeyPoolLine(label, snapshot) {
  const available = Number(snapshot?.available || 0);
  const total = Number(snapshot?.total || 0);
  const coolingDown = Number(snapshot?.coolingDown || 0);
  const icon = available === 0 ? '🔴' : available === total ? '🟢' : '🟠';
  return `${icon} ${label}: готово ${available}/${total}, в cooldown ${coolingDown}`;
}

function shortenAddress(address) {
  const safe = normalizeValue(address);
  if (!safe) return '—';
  if (safe.length <= 14) return safe;
  return `${safe.slice(0, 6)}...${safe.slice(-6)}`;
}

function statusIcon(ok, warn = false) {
  if (ok === true) return '🟢';
  if (warn === true) return '🟠';
  return '🔴';
}

function severityIcon(severity) {
  const safe = normalizeValue(severity).toLowerCase();
  if (safe === 'critical') return '🔴';
  if (safe === 'error') return '🔴';
  if (safe === 'warning') return '🟠';
  return '🟢';
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch (_) {
    return fallback;
  }
}

function buildEventRecommendation(event) {
  const fingerprint = normalizeValue(event?.fingerprint);
  const source = normalizeValue(event?.source);
  const details = parseJson(event?.details_json, {});

  if (fingerprint.includes('airdrop:resources_low') || fingerprint.includes('clock:airdrop_resources_low')) {
    return `Совет: докинуть energy на airdrop-кошелёк ${shortenAddress(details?.walletAddress)}.`;
  }

  if (fingerprint.includes('ambassador:resources_low') || fingerprint.includes('clock:ambassador_resources_low')) {
    return `Совет: проверить operator wallet ${shortenAddress(details?.walletAddress)} и поднять energy.`;
  }

  if (fingerprint.includes('key_pool_exhausted')) {
    return 'Совет: часть провайдерских ключей упёрлась в лимиты. Стоит проверить квоты и запасные ключи.';
  }

  if (fingerprint.includes('credential_pool_failed') || source === 'gasstation') {
    return 'Совет: проверить лимиты/whitelist GasStation и хватает ли средств для top-up.';
  }

  if (fingerprint.includes('clock:heartbeat_stale') || fingerprint.includes('clock:tick_failed')) {
    return 'Совет: проверить clock dyno и свежесть heartbeat.';
  }

  return 'Совет: откройте детали ниже и посмотрите соседние сигналы в разделе здоровья.';
}

function buildHeader(title, subtitle) {
  return `${title}\n${subtitle}`;
}

function buildMenuMarkup(currentScreen) {
  const safeScreen = SUPPORTED_SCREENS.has(currentScreen) ? currentScreen : DEFAULT_SCREEN;

  return {
    inline_keyboard: [
      [
        { text: '🏠 Сводка', callback_data: `${CALLBACK_PREFIX}screen:overview` },
        { text: '🚨 События', callback_data: `${CALLBACK_PREFIX}screen:events` }
      ],
      [
        { text: '🩺 Здоровье', callback_data: `${CALLBACK_PREFIX}screen:health` },
        { text: '🔑 Ключи', callback_data: `${CALLBACK_PREFIX}screen:keys` }
      ],
      [
        { text: '📦 Очереди', callback_data: `${CALLBACK_PREFIX}screen:queues` },
        { text: '👥 Чаты', callback_data: `${CALLBACK_PREFIX}screen:targets` }
      ],
      [{ text: '🔄 Обновить', callback_data: `${CALLBACK_PREFIX}refresh:${safeScreen}` }]
    ]
  };
}

async function collectOverviewData() {
  const { hasEnoughAirdropResources } = getAirdropService();
  const { hasEnoughAmbassadorAllocationResources } = getAmbassadorService();
  const { getGasStationRuntimeState, getGasStationCredentialRuntimeState } = getGasStationService();
  const { getProxyKeyPoolRuntimeState } = getProxyService();

  const [dbOk, clockState, airdropState, ambassadorState, gasState, events] = await Promise.all([
    pool.query('SELECT 1').then(() => true).catch(() => false),
    getRuntimeState('clock.heartbeat').catch(() => null),
    hasEnoughAirdropResources().catch(() => null),
    hasEnoughAmbassadorAllocationResources().catch(() => null),
    getGasStationRuntimeState().catch(() => null),
    listRecentEvents(6, { onlyOpen: true }).catch(() => [])
  ]);

  return {
    dbOk,
    clockState,
    airdropState,
    ambassadorState,
    gasState,
    events,
    keyPools: getProxyKeyPoolRuntimeState(),
    gasPool: getGasStationCredentialRuntimeState()
  };
}

function formatTargets(targets) {
  if (!targets.length) {
    return 'Пока нет ни одного разрешённого чата.';
  }

  return targets
    .map((target) => {
      const prefix = target.is_owner ? '👑 owner' : '🔔 target';
      const label = normalizeValue(target.label) || target.chat_type;
      return `${prefix}: ${label} (${target.chat_id})`;
    })
    .join('\n');
}

function buildRecommendationLines(data) {
  const lines = [];

  if (data.airdropState && data.airdropState.hasEnough === false) {
    lines.push(
      `1. Поднять energy для airdrop-кошелька ${shortenAddress(data.airdropState.walletAddress)}.`
    );
  }

  if (data.ambassadorState && data.ambassadorState.hasEnough === false) {
    lines.push(
      `2. Проверить operator wallet ${shortenAddress(data.ambassadorState.walletAddress)} и его energy.`
    );
  }

  if (Number(data.keyPools?.trongrid?.available || 0) === 0) {
    lines.push('3. Все Trongrid-ключи сейчас упёрлись в лимит. Нужны свежие/запасные ключи.');
  }

  if (data.gasState?.enabled && Number(data.gasState?.operator?.balanceSun || 0) <= 3_000_000) {
    lines.push('4. У operator wallet маленький запас TRX для топ-апов GasStation.');
  }

  if (!lines.length) {
    lines.push('Срочных красных действий не вижу. Можно просто иногда поглядывать на события.');
  }

  return lines;
}

async function buildOverviewText() {
  const data = await collectOverviewData();
  const clockPayload = data.clockState?.value_json || {};
  const openEvents = Array.isArray(data.events) ? data.events.length : 0;
  const airdropWarn = data.airdropState?.hasEnough === false;
  const ambassadorWarn = data.ambassadorState?.hasEnough === false;
  const anyKeysWarn =
    Number(data.keyPools?.trongrid?.available || 0) < Number(data.keyPools?.trongrid?.total || 0) ||
    Number(data.keyPools?.tronscan?.available || 0) < Number(data.keyPools?.tronscan?.total || 0) ||
    Number(data.keyPools?.cmc?.available || 0) < Number(data.keyPools?.cmc?.total || 0);

  return [
    buildHeader(
      '🏠 4TEEN Ops',
      'Коротко и по-человечески: вот что вижу прямо сейчас.'
    ),
    `${statusIcon(data.dbOk)} API и база: ${data.dbOk ? 'живы' : 'есть проблема с базой'}`,
    `${statusIcon(clockPayload?.status === 'ok', clockPayload?.status !== 'ok')} Clock: ${
      clockPayload?.status === 'ok' ? 'работает' : 'надо проверить'
    } (${formatRelativeMinutes(clockPayload?.heartbeatAt || data.clockState?.updated_at)})`,
    `${statusIcon(!airdropWarn, airdropWarn)} Airdrop wallet: ${
      airdropWarn ? 'ресурсов не хватает' : 'по ресурсам всё ок'
    }`,
    `${statusIcon(!ambassadorWarn, ambassadorWarn)} Operator wallet: ${
      ambassadorWarn ? 'ресурсов не хватает для ambassador flow' : 'по ресурсам всё ок'
    }`,
    `${statusIcon(!anyKeysWarn, anyKeysWarn)} Ключи провайдеров: ${
      anyKeysWarn ? 'часть ключей под давлением' : 'запас нормальный'
    }`,
    `${openEvents > 0 ? '🟠' : '🟢'} Открытых событий: ${openEvents}`,
    '',
    'Что я бы рекомендовал сейчас:',
    ...buildRecommendationLines(data)
  ].join('\n');
}

async function buildHealthText() {
  const data = await collectOverviewData();
  const clockPayload = data.clockState?.value_json || {};
  const operator = data.gasState?.operator || null;
  const gasStation = data.gasState?.gasStation || null;

  return [
    buildHeader('🩺 Здоровье системы', 'Не технично, а по сути: где спокойно, а где уже больно.'),
    `${statusIcon(data.dbOk)} База данных: ${data.dbOk ? 'отвечает' : 'не отвечает'}`,
    `${statusIcon(clockPayload?.status === 'ok', clockPayload?.status !== 'ok')} Clock: ${
      clockPayload?.status === 'ok' ? 'тикнул нормально' : 'нужна проверка'
    } (${formatRelativeMinutes(clockPayload?.heartbeatAt || data.clockState?.updated_at)})`,
    `${statusIcon(data.airdropState?.hasEnough === true, data.airdropState?.hasEnough === false)} Airdrop wallet ${shortenAddress(
      data.airdropState?.walletAddress
    )}: energy ${Number(data.airdropState?.energyAvailable || 0)}, bandwidth ${Number(data.airdropState?.bandwidthAvailable || 0)}`,
    `${statusIcon(data.ambassadorState?.hasEnough === true, data.ambassadorState?.hasEnough === false)} Operator wallet ${shortenAddress(
      data.ambassadorState?.walletAddress
    )}: energy ${Number(data.ambassadorState?.energyAvailable || 0)}, bandwidth ${Number(data.ambassadorState?.bandwidthAvailable || 0)}`,
    `${statusIcon(Boolean(data.gasState?.enabled), !data.gasState?.enabled)} GasStation: ${
      data.gasState?.enabled ? 'включён' : 'выключен'
    }`,
    operator
      ? `💰 Operator TRX: ${operator.balanceTrx} TRX`
      : '💰 Operator TRX: не удалось прочитать',
    gasStation
      ? `🏦 Баланс GasStation: ${gasStation.balanceTrx} TRX на аккаунте ${normalizeValue(gasStation.account) || '—'}`
      : '🏦 Баланс GasStation: не удалось прочитать',
    '',
    'Подсказка:',
    ...buildRecommendationLines(data)
  ].join('\n');
}

async function buildKeysText() {
  const { keyPools, gasPool } = await collectOverviewData();

  const gasLines = Array.isArray(gasPool?.credentials)
    ? gasPool.credentials.map((item) => {
        const state = item.state || {};
        const status = state.lastErrorAt
          ? `🟠 была ошибка ${formatRelativeMinutes(state.lastErrorAt)}`
          : state.lastSuccessAt
            ? `🟢 последний успех ${formatRelativeMinutes(state.lastSuccessAt)}`
            : '⚪ пока без истории';
        return `• ${item.label}: ${status}`;
      })
    : [];

  return [
    buildHeader('🔑 Ключи и лимиты', 'Сюда удобно смотреть, когда приложение внезапно начинает тупить из-за провайдеров.'),
    formatKeyPoolLine('trongrid', keyPools.trongrid),
    formatKeyPoolLine('tronscan', keyPools.tronscan),
    formatKeyPoolLine('cmc', keyPools.cmc),
    '',
    'GasStation credentials:',
    ...(gasLines.length ? gasLines : ['• пока не вижу настроенных credential-ов']),
    '',
    'Если здесь краснеет:',
    '1. Сначала проверь лимиты и cooldown.',
    '2. Потом посмотри, не умер ли один конкретный ключ/credential.',
    '3. Если красное держится долго, значит запасных ключей мало.'
  ].join('\n');
}

async function buildEventsText() {
  const events = await listRecentEvents(8, { onlyOpen: true }).catch(() => []);

  if (!events.length) {
    return [
      buildHeader('🚨 Активные события', 'Сейчас тут пусто, и это хороший знак.'),
      '🟢 Открытых проблем не вижу.'
    ].join('\n');
  }

  return [
    buildHeader('🚨 Активные события', 'Самое важное сверху. Без сухого лога, только суть.'),
    ...events.map((event) => {
      const icon = severityIcon(event.severity);
      const count = Number(event.count || 0);
      return `${icon} ${event.title}\nИсточник: ${normalizeValue(event.source)} • повторов: ${count}\n${buildEventRecommendation(event)}`;
    })
  ].join('\n');
}

async function buildQueuesText() {
  const { clockState, events } = await collectOverviewData();

  const clockPayload = clockState?.value_json || {};
  const processed = clockPayload?.processed ?? 'n/a';
  const ambassadorProcessed = clockPayload?.ambassadorProcessed?.totalWallets ?? 'n/a';
  const ambassadorFailed = clockPayload?.ambassadorProcessed?.failed ?? 'n/a';

  return [
    buildHeader('📦 Очереди и фоновые задачи', 'Полезно, когда нужно понять, всё ли движется или что-то застряло.'),
    `✈️ Telegram claims за последний tick: ${processed}`,
    `🧩 Ambassador wallets за последний tick: ${ambassadorProcessed}`,
    `⚠️ Ambassador ошибок в последнем tick: ${ambassadorFailed}`,
    `🚨 Открытых событий сейчас: ${events.length}`,
    '',
    'Если тут цифры растут, а события не закрываются:',
    '1. Смотри раздел «События».',
    '2. Потом «Здоровье».',
    '3. Обычно корень проблемы там, а не в самой очереди.'
  ].join('\n');
}

async function buildTargetsText() {
  const targets = await listActiveTelegramTargets();
  const owner = await getOwnerTelegramTarget();

  return [
    buildHeader('👥 Чаты и уведомления', 'Куда бот имеет право писать сейчас.'),
    formatTargets(targets),
    '',
    owner
      ? `Главный owner: ${normalizeValue(owner.label) || owner.chat_id}`
      : 'Owner пока не привязан.',
    '',
    'Как добавить группу позже:',
    '1. Добавьте туда бота.',
    '2. Напишите в группе /allow_here именно с вашего owner-аккаунта.',
    '3. После этого бот сможет слать туда алерты.'
  ].join('\n');
}

async function buildScreenText(screen) {
  if (screen === 'health') return buildHealthText();
  if (screen === 'events') return buildEventsText();
  if (screen === 'keys') return buildKeysText();
  if (screen === 'queues') return buildQueuesText();
  if (screen === 'targets') return buildTargetsText();
  return buildOverviewText();
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
      await adminTelegramApi('setMyCommands', {
        commands: BOT_COMMANDS
      }).catch(() => null);

      const allowedUpdates = Array.isArray(info?.allowed_updates) ? info.allowed_updates : [];
      const needsAllowedUpdatesRefresh =
        !allowedUpdates.includes('message') || !allowedUpdates.includes('callback_query');

      if (normalizeValue(info?.url) === expectedUrl && !needsAllowedUpdatesRefresh) {
        return {
          ok: true,
          url: expectedUrl,
          synced: true
        };
      }

      await adminTelegramApi('setWebhook', {
        url: expectedUrl,
        allowed_updates: ['message', 'callback_query']
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

async function sendScreen(chatId, screen, options = {}) {
  const safeScreen = SUPPORTED_SCREENS.has(screen) ? screen : DEFAULT_SCREEN;
  const text = await buildScreenText(safeScreen);
  const replyMarkup = buildMenuMarkup(safeScreen);

  if (options.editMessageId) {
    try {
      return await editTelegramMessage(chatId, options.editMessageId, text, replyMarkup);
    } catch (error) {
      if (/message is not modified/i.test(String(error?.message || ''))) {
        return {
          ok: true,
          unchanged: true
        };
      }

      throw error;
    }
  }

  return sendTelegramMessage(chatId, text, replyMarkup);
}

function resolveCommandFromText(text) {
  const normalizedIntent = normalizeMenuIntent(text);
  if (normalizedIntent) {
    return normalizedIntent;
  }

  return normalizeCommand(text);
}

async function handleCommand(message) {
  const chatId = normalizeValue(message?.chat?.id);
  const command = resolveCommandFromText(message?.text);

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
        await sendScreen(chatId, 'overview');

        return { ok: true, claimedOwner: true };
      }
    }
  }

  const authorized = await isAuthorizedMessage(message);
  if (!authorized) {
    await reply(
      chatId,
      '⛔ Этот чат пока не привязан к 4TEEN Ops.\n\nЕсли это ваш личный чат, просто напишите /start.\nЕсли это группа, сначала привяжите личку owner-аккаунта, а потом уже используйте /allow_here в группе.'
    );
    return {
      ok: false,
      unauthorized: true
    };
  }

  if (command === '/help') {
    await reply(
      chatId,
      [
        '🤝 Я могу говорить по-простому, а не сухими логами.',
        '',
        'Основное:',
        '/menu — открыть меню',
        '/health — быстро понять, что болит',
        '/events — активные проблемы',
        '/keys — ключи и лимиты',
        '/queues — очереди и фоновые задачи',
        '/targets — куда бот пишет',
        '/allow_here — разрешить этот чат',
        '',
        'Самый удобный путь: просто жмите кнопки в меню.'
      ].join('\n')
    );
    return { ok: true };
  }

  if (command === '/start' || command === '/menu') {
    await sendScreen(chatId, 'overview');
    return { ok: true };
  }

  if (command === '/health') {
    await sendScreen(chatId, 'health');
    return { ok: true };
  }

  if (command === '/keys') {
    await sendScreen(chatId, 'keys');
    return { ok: true };
  }

  if (command === '/events') {
    await sendScreen(chatId, 'events');
    return { ok: true };
  }

  if (command === '/queues') {
    await sendScreen(chatId, 'queues');
    return { ok: true };
  }

  if (command === '/targets') {
    await sendScreen(chatId, 'targets');
    return { ok: true };
  }

  if (command === '/allow_here') {
    const owner = await getOwnerTelegramTarget();
    const ownerUserId = normalizeValue(owner?.telegram_user_id);
    const currentUserId = normalizeValue(message?.from?.id);

    if (!ownerUserId || ownerUserId !== currentUserId) {
      await reply(chatId, '⛔ Разрешать новые чаты может только owner-аккаунт.');
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

    await reply(
      chatId,
      `✅ Чат добавлен для уведомлений.\n\nТеперь сюда можно слать алерты.\nМетка: ${normalizeValue(target?.label) || chatId}`
    );
    return { ok: true };
  }

  await reply(chatId, 'Не понял команду. Нажмите /menu, там удобнее.');
  return { ok: true };
}

async function handleCallbackQuery(callbackQuery) {
  const data = normalizeValue(callbackQuery?.data);
  const chatId = normalizeValue(callbackQuery?.message?.chat?.id);
  const messageId = callbackQuery?.message?.message_id;

  if (!data.startsWith(CALLBACK_PREFIX) || !chatId || !messageId) {
    await answerTelegramCallback(callbackQuery?.id, 'Не понял действие.');
    return {
      ok: false,
      ignored: true
    };
  }

  const authorized = await isAuthorizedMessage({
    chat: callbackQuery?.message?.chat,
    from: callbackQuery?.from
  });

  if (!authorized) {
    await answerTelegramCallback(callbackQuery?.id, 'Этот чат пока не авторизован.');
    return {
      ok: false,
      unauthorized: true
    };
  }

  const [, action, rawScreen] = data.split(':');
  const screen = SUPPORTED_SCREENS.has(rawScreen) ? rawScreen : DEFAULT_SCREEN;

  await answerTelegramCallback(
    callbackQuery?.id,
    action === 'refresh' ? 'Обновляю картину...' : 'Открываю раздел...'
  ).catch(() => null);

  await sendScreen(chatId, screen, {
    editMessageId: messageId
  });

  return {
    ok: true,
    screen
  };
}

async function handleAdminTelegramWebhookUpdate(update) {
  const message = update?.message;
  const callbackQuery = update?.callback_query;

  if (callbackQuery?.data) {
    return handleCallbackQuery(callbackQuery);
  }

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
