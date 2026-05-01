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
const SUPPORTED_SCREENS = new Set([
  'overview',
  'screen',
  'health',
  'events',
  'feedback',
  'keys',
  'queues',
  'targets'
]);
const BOT_COMMANDS = [
  { command: 'menu', description: 'Открыть главное меню' },
  { command: 'screen', description: 'Проверить реальные app-flow' },
  { command: 'health', description: 'Понять, что сейчас болит' },
  { command: 'events', description: 'Посмотреть активные проблемы' },
  { command: 'feedback', description: 'Посмотреть отзывы из кошелька' },
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

function getScreenerService() {
  return require('./screeners');
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

function feedbackTypeMeta(type) {
  const safe = normalizeValue(type).toLowerCase();

  if (safe === 'app_issue') {
    return { icon: '🚨', label: 'поломка' };
  }

  if (safe === 'app_confusing') {
    return { icon: '🤔', label: 'непонятно' };
  }

  if (safe === 'app_slow') {
    return { icon: '🐢', label: 'тормозит' };
  }

  if (safe === 'app_idea') {
    return { icon: '💡', label: 'идея' };
  }

  if (safe === 'app_praise') {
    return { icon: '❤️', label: 'похвала' };
  }

  return { icon: '💬', label: 'отзыв' };
}

function feedbackStatusLabel(event) {
  if (event?.resolved_at) {
    return 'разобрано';
  }

  return 'ждёт внимания';
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

function screenerStatusIcon(status) {
  const safe = normalizeValue(status).toLowerCase();
  if (safe === 'ok') return '🟢';
  if (safe === 'warn') return '🟠';
  return '🔴';
}

function buildScreenerStateSummary(snapshot) {
  const summary = snapshot?.summary || {};
  const ok = Number(summary.ok || 0);
  const warn = Number(summary.warn || 0);
  const fail = Number(summary.fail || 0);
  const total = Number(summary.total || 0);

  if (total <= 0) {
    return 'ещё нет прогона';
  }

  if (fail > 0) {
    return `${ok}/${total} ок, ${warn} под давлением, ${fail} сломано`;
  }

  if (warn > 0) {
    return `${ok}/${total} ок, ${warn} под давлением`;
  }

  return `${ok}/${total} ок`;
}

function buildEventRecommendation(event) {
  const source = normalizeValue(event?.source);
  const category = normalizeValue(event?.category);
  const type = normalizeValue(event?.type);
  const details = parseJson(event?.details_json, {});

  if (source === 'airdrop' && category === 'resources' && type === 'resource_floor_low') {
    return `Совет: докинуть energy на airdrop-кошелёк ${shortenAddress(details?.walletAddress)}.`;
  }

  if (source === 'ambassador' && category === 'resources' && type === 'resource_floor_low') {
    return `Совет: проверить operator wallet ${shortenAddress(details?.walletAddress)} и поднять energy.`;
  }

  if (source === 'proxy' && category === 'keys' && type === 'key_pool_exhausted') {
    return 'Совет: часть провайдерских ключей упёрлась в лимиты. Стоит проверить квоты и запасные ключи.';
  }

  if (source === 'gasstation' && category === 'keys' && type === 'credential_pool_failed') {
    return 'Совет: проверить лимиты/whitelist GasStation и хватает ли средств для top-up.';
  }

  if (source === 'clock' && category === 'heartbeat' && type === 'clock_stale') {
    return 'Совет: проверить clock dyno и свежесть heartbeat.';
  }

  if (source === 'screeners' && type === 'wallet_market_pipeline') {
    return 'Совет: проверить proxy до Trongrid/Tronscan и запас по ключам.';
  }

  if (source === 'screeners' && type === 'ambassador_energy_quote') {
    return 'Совет: проверить quote на energy и fallback-конфиг для resale.';
  }

  if (source === 'screeners' && type === 'telegram_airdrop_flow') {
    return `Совет: посмотреть airdrop wallet ${shortenAddress(details?.meta?.walletAddress || details?.walletAddress)} и его ресурсы.`;
  }

  if (source === 'screeners' && type === 'ambassador_allocation_flow') {
    return `Совет: проверить operator wallet ${shortenAddress(details?.meta?.walletAddress || details?.walletAddress)} и не застряли ли аллокации.`;
  }

  if (source === 'app-feedback' && category === 'feedback') {
    return 'Совет: открыть экран, который человек указал в отзыве, и быстро воспроизвести путь руками.';
  }

  return 'Совет: откройте детали ниже и посмотрите соседние сигналы в разделе здоровья.';
}

function buildHeader(title, subtitle) {
  return `${title}\n${subtitle}`;
}

function shortenText(value, maxLength = 160) {
  const safe = normalizeValue(value).replace(/\s+/g, ' ');
  if (safe.length <= maxLength) {
    return safe;
  }

  return `${safe.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildMenuMarkup(currentScreen) {
  const safeScreen = SUPPORTED_SCREENS.has(currentScreen) ? currentScreen : DEFAULT_SCREEN;
  const refreshRow = [{ text: '🔄 Обновить', callback_data: `${CALLBACK_PREFIX}refresh:${safeScreen}` }];
  const rerunRows =
    safeScreen === 'screen'
      ? [[{ text: '🧪 Прогнать скринер сейчас', callback_data: `${CALLBACK_PREFIX}rerun:screen` }]]
      : [];

  return {
    inline_keyboard: [
      [
        { text: '🏠 Сводка', callback_data: `${CALLBACK_PREFIX}screen:overview` },
        { text: '🧪 Скринер', callback_data: `${CALLBACK_PREFIX}screen:screen` }
      ],
      [
        { text: '🚨 События', callback_data: `${CALLBACK_PREFIX}screen:events` },
        { text: '💬 Feedback', callback_data: `${CALLBACK_PREFIX}screen:feedback` }
      ],
      [
        { text: '🩺 Здоровье', callback_data: `${CALLBACK_PREFIX}screen:health` },
        { text: '🔑 Ключи', callback_data: `${CALLBACK_PREFIX}screen:keys` },
        { text: '📦 Очереди', callback_data: `${CALLBACK_PREFIX}screen:queues` }
      ],
      [
        { text: '👥 Чаты', callback_data: `${CALLBACK_PREFIX}screen:targets` }
      ],
      ...rerunRows,
      refreshRow
    ]
  };
}

async function collectOverviewData() {
  const { hasEnoughAirdropResources } = getAirdropService();
  const { hasEnoughAmbassadorAllocationResources } = getAmbassadorService();
  const { getGasStationRuntimeState, getGasStationCredentialRuntimeState } = getGasStationService();
  const { getProxyKeyPoolRuntimeState } = getProxyService();
  const { getSyntheticScreenerSnapshot } = getScreenerService();

  const [dbOk, clockState, airdropState, ambassadorState, gasState, events, screeners] = await Promise.all([
    pool.query('SELECT 1').then(() => true).catch(() => false),
    getRuntimeState('clock.heartbeat').catch(() => null),
    hasEnoughAirdropResources().catch(() => null),
    hasEnoughAmbassadorAllocationResources().catch(() => null),
    getGasStationRuntimeState().catch(() => null),
    listRecentEvents(6, { onlyOpen: true }).catch(() => []),
    getSyntheticScreenerSnapshot().catch(() => null)
  ]);

  return {
    dbOk,
    clockState,
    airdropState,
    ambassadorState,
    gasState,
    events,
    screeners,
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

  if (Number(data.screeners?.summary?.fail || 0) > 0) {
    lines.push('5. Один или несколько реальных app-flow уже падают. Откройте раздел «Скринер».');
  } else if (Number(data.screeners?.summary?.warn || 0) > 0) {
    lines.push('5. Есть flow под давлением. Лучше заранее посмотреть раздел «Скринер».');
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
    `${screenerStatusIcon(
      Number(data.screeners?.summary?.fail || 0) > 0
        ? 'fail'
        : Number(data.screeners?.summary?.warn || 0) > 0
          ? 'warn'
          : 'ok'
    )} Реальные app-flow: ${buildScreenerStateSummary(data.screeners)}`,
    `${openEvents > 0 ? '🟠' : '🟢'} Открытых событий: ${openEvents}`,
    '',
    'Что я бы рекомендовал сейчас:',
    ...buildRecommendationLines(data)
  ].join('\n');
}

async function buildScreenerText() {
  const { getSyntheticScreenerSnapshot } = getScreenerService();
  const snapshot = await getSyntheticScreenerSnapshot().catch(() => null);
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const summary = snapshot?.summary || {};
  const checkedAt = snapshot?.checkedAt ? formatRelativeMinutes(snapshot.checkedAt) : 'ещё не запускался';

  if (!items.length) {
    return [
      buildHeader('🧪 Реальный скринер', 'Это проверка глазами пользователя, а не просто healthcheck сервера.'),
      '⚪ Скринер ещё не запускался.',
      '',
      'Нажмите кнопку «Прогнать скринер сейчас», и я проверю ключевые app-flow.'
    ].join('\n');
  }

  return [
    buildHeader('🧪 Реальный скринер', 'Показываю, проходят ли ключевые сценарии приложения целиком.'),
    `Последний прогон: ${checkedAt}`,
    `Итог: ${buildScreenerStateSummary(snapshot)}`,
    '',
    ...items.map((item) => {
      const meta = item?.meta && typeof item.meta === 'object' ? item.meta : null;
      const address = meta?.walletAddress ? ` (${shortenAddress(meta.walletAddress)})` : '';
      return [
        `${screenerStatusIcon(item.status)} ${normalizeValue(item.label)}${address}`,
        normalizeValue(item.summary),
        `Что это значит: ${normalizeValue(item.recommendation) || 'Это один из сценариев, который пользователь чувствует сразу.'}`
      ].join('\n');
    }),
    '',
    'Как читать экран:',
    '1. Красный — сценарий уже сломан.',
    '2. Оранжевый — ещё живо, но пользователь скоро почувствует деградацию.',
    '3. Зелёный — путь проходит целиком.'
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

async function buildFeedbackText() {
  const events = await listRecentEvents(20, { onlyOpen: false }).catch(() => []);
  const feedbackEvents = events.filter(
    (event) =>
      normalizeValue(event?.source) === 'app-feedback' &&
      normalizeValue(event?.category) === 'feedback'
  );

  if (!feedbackEvents.length) {
    return [
      buildHeader('💬 Feedback из кошелька', 'Здесь будут живые отзывы прямо из приложения.'),
      'Пока пусто. Когда кто-то нажмёт feedback в кошельке, я покажу это здесь.'
    ].join('\n');
  }

  const openCount = feedbackEvents.filter((event) => !event.resolved_at).length;
  const issueCount = feedbackEvents.filter((event) => normalizeValue(event?.type) === 'app_issue').length;
  const confusingCount = feedbackEvents.filter((event) => normalizeValue(event?.type) === 'app_confusing').length;
  const slowCount = feedbackEvents.filter((event) => normalizeValue(event?.type) === 'app_slow').length;
  const ideaCount = feedbackEvents.filter((event) => normalizeValue(event?.type) === 'app_idea').length;
  const praiseCount = feedbackEvents.filter((event) => normalizeValue(event?.type) === 'app_praise').length;

  return [
    buildHeader('💬 Feedback из кошелька', 'Не логи, а живой голос пользователя: что раздражает, где тупит и что нравится.'),
    `Сейчас ждут внимания: ${openCount}`,
    `Срез последних отзывов: 🚨 ${issueCount} • 🤔 ${confusingCount} • 🐢 ${slowCount} • 💡 ${ideaCount} • ❤️ ${praiseCount}`,
    '',
    ...feedbackEvents.slice(0, 6).map((event) => {
      const meta = feedbackTypeMeta(event?.type);
      const details = parseJson(event?.details_json, {});
      const sourceScreen = normalizeValue(details?.sourceScreen) || 'unknown';
      const appVersion = normalizeValue(details?.appVersion) || 'unknown';
      const walletAddress = normalizeValue(details?.walletAddressMasked);
      const walletLine = walletAddress ? ` • кошелёк ${walletAddress}` : '';
      const count = Number(event?.count || 0);
      const repeatLine = count > 1 ? ` • повторов ${count}` : '';

      return [
        `${meta.icon} ${normalizeValue(event?.title) || meta.label}`,
        `Статус: ${feedbackStatusLabel(event)} • ${meta.label} • ${formatRelativeMinutes(event?.last_seen_at)}`,
        `Экран: ${sourceScreen} • версия ${appVersion}${walletLine}${repeatLine}`,
        `Что человек сказал: ${shortenText(event?.message, 220)}`,
        buildEventRecommendation(event)
      ].join('\n');
    }),
    '',
    'Как читать этот экран:',
    '1. 🚨 🤔 🐢 — это полезные сигналы, на них лучше смотреть первыми.',
    '2. 💡 и ❤️ я тоже храню, но они не шумят в активных алертах.',
    '3. Если один и тот же отзыв повторяется, значит проблема уже не случайная.'
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
  if (screen === 'screen') return buildScreenerText();
  if (screen === 'health') return buildHealthText();
  if (screen === 'events') return buildEventsText();
  if (screen === 'feedback') return buildFeedbackText();
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
        '/screen — проверить реальные app-flow',
        '/health — быстро понять, что болит',
        '/events — активные проблемы',
        '/feedback — отзывы из кошелька',
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

  if (command === '/screen') {
    await sendScreen(chatId, 'screen');
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

  if (command === '/feedback') {
    await sendScreen(chatId, 'feedback');
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
    action === 'refresh'
      ? 'Обновляю картину...'
      : action === 'rerun'
        ? 'Гоняю реальные сценарии...'
        : 'Открываю раздел...'
  ).catch(() => null);

  if (action === 'rerun') {
    const { runSyntheticScreeners } = getScreenerService();
    await runSyntheticScreeners('telegram', { force: true }).catch(() => null);
    await sendScreen(chatId, 'screen', {
      editMessageId: messageId
    });

    return {
      ok: true,
      screen: 'screen',
      rerun: true
    };
  }

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
