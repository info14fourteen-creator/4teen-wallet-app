const crypto = require('crypto');
const { fetch } = require('undici');
const env = require('../../config/env');
const { pool } = require('../../db/pool');
const { listCodexJobs, runCodexJobForTask } = require('./codexJobs');
const { getKnowledgeBaseStatus } = require('./knowledgeBase');
const {
  createTaskFromOpsEvent,
  createTaskFromProductNote,
  getTaskById,
  listTasks,
  updateTaskStatus
} = require('./tasks');
const {
  ensureOpsTables,
  getOwnerTelegramTarget,
  getRuntimeState,
  getTelegramTargetByChatId,
  listActiveTelegramTargets,
  listRecentEvents,
  openOrIncrementEvent,
  setRuntimeState,
  touchTelegramTarget,
  upsertTelegramTarget
} = require('./store');
const { answerOpsQuestion, generateOpsDigest, routeOwnerMessage, structureProductNote, transcribeAudioBuffer } = require('./openai');
const { createProductNote, listProductNotes } = require('./productNotes');

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const CALLBACK_PREFIX = 'ops:';
const DEFAULT_SCREEN = 'summary';
const BOT_MESSAGE_HISTORY_PREFIX = 'ops.telegram.bot_history';
const BOT_LOCALE_PREFIX = 'ops.telegram.locale';
const BOT_MESSAGE_HISTORY_LIMIT = 80;
const SUPPORTED_SCREENS = new Set([
  'summary',
  'overview',
  'screen',
  'health',
  'events',
  'feedback',
  'knowledge',
  'jobs',
  'keys',
  'notes',
  'tasks',
  'queues',
  'targets'
]);
const BOT_COMMANDS = [
  { command: 'menu', description: 'Открыть главное меню' },
  { command: 'summary', description: 'Показать AI-сводку по ситуации' },
  { command: 'ask', description: 'Задать вопрос по живым данным' },
  { command: 'screen', description: 'Проверить реальные app-flow' },
  { command: 'health', description: 'Понять, что сейчас болит' },
  { command: 'events', description: 'Посмотреть активные проблемы' },
  { command: 'feedback', description: 'Посмотреть отзывы из кошелька' },
  { command: 'kb', description: 'Проверить память бота по проекту' },
  { command: 'jobs', description: 'Посмотреть последние Codex jobs' },
  { command: 'notes', description: 'Посмотреть backlog следующей версии' },
  { command: 'tasks', description: 'Посмотреть рабочие задачи' },
  { command: 'codex', description: 'Запустить Codex job по задаче' },
  { command: 'note', description: 'Добавить идею или правку в backlog' },
  { command: 'take', description: 'Взять задачу в работу' },
  { command: 'done', description: 'Закрыть задачу' },
  { command: 'block', description: 'Пометить задачу как blocked' },
  { command: 'todo', description: 'Вернуть задачу в ready_for_codex' },
  { command: 'archive', description: 'Убрать задачу в архив' },
  { command: 'clear', description: 'Почистить прошлые сообщения бота' },
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

function normalizeLocale(value) {
  return String(value || '').trim().toLowerCase() === 'en' ? 'en' : 'ru';
}

function isEnglish(locale) {
  return normalizeLocale(locale) === 'en';
}

function buildChatLocaleKey(chatId) {
  return `${BOT_LOCALE_PREFIX}:${normalizeValue(chatId)}`;
}

async function getChatLocale(chatId) {
  const state = await getRuntimeState(buildChatLocaleKey(chatId)).catch(() => null);
  return normalizeLocale(state?.value_json?.locale);
}

async function setChatLocale(chatId, locale) {
  const safeChatId = normalizeValue(chatId);
  if (!safeChatId) {
    return 'ru';
  }

  const nextLocale = normalizeLocale(locale);
  await setRuntimeState(buildChatLocaleKey(safeChatId), {
    locale: nextLocale,
    updatedAt: new Date().toISOString()
  }).catch(() => null);
  return nextLocale;
}

function detectLocaleRequest(text) {
  const safe = normalizeValue(text);
  const lower = safe.toLowerCase();

  if (!lower) {
    return '';
  }

  const mentionsEnglish = /\benglish\b|англ/i.test(lower);
  const mentionsRussian = /\brussian\b|русск/i.test(lower);
  const directLocaleOnly = /^(english|eng|en|англ(ийский)?|russian|ru|русский)$/i.test(safe);
  const languageAction =
    /язык|language|reply|respond|responses|answers|answer|отвеч|ответ|пиши|говори|смени|сменить|переключ|switch|use\s+english|use\s+russian|на\s+англ|на\s+рус/i.test(lower);

  if (mentionsEnglish && (directLocaleOnly || languageAction)) {
    return 'en';
  }

  if (mentionsRussian && (directLocaleOnly || languageAction)) {
    return 'ru';
  }

  return '';
}

function isClearIntent(text) {
  const safe = normalizeValue(text).toLowerCase();
  if (!safe) return false;

  return [
    '/clear',
    'clear',
    'clear chat',
    'clear history',
    'очистить',
    'очисти',
    'почистить чат',
    'почисти чат',
    'удали сообщения',
    'удали прошлые сообщения'
  ].includes(safe);
}

function buildBotHistoryKey(chatId) {
  return `${BOT_MESSAGE_HISTORY_PREFIX}:${normalizeValue(chatId)}`;
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
  const message = await adminTelegramApi('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup || undefined,
    disable_web_page_preview: true
  });

  await rememberBotMessage(chatId, message?.message_id).catch(() => null);
  return message;
}

async function editTelegramMessage(chatId, messageId, text, replyMarkup) {
  const message = await adminTelegramApi('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: replyMarkup || undefined,
    disable_web_page_preview: true
  });

  await rememberBotMessage(chatId, message?.message_id || messageId).catch(() => null);
  return message;
}

async function answerTelegramCallback(callbackQueryId, text) {
  return adminTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text || undefined,
    show_alert: false
  });
}

async function deleteTelegramMessage(chatId, messageId) {
  if (!normalizeValue(chatId) || !Number.isFinite(Number(messageId || 0))) {
    return false;
  }

  return adminTelegramApi('deleteMessage', {
    chat_id: chatId,
    message_id: Number(messageId)
  }).catch(() => false);
}

async function getTrackedBotMessages(chatId) {
  const state = await getRuntimeState(buildBotHistoryKey(chatId)).catch(() => null);
  const value = state?.value_json && typeof state.value_json === 'object' ? state.value_json : {};
  const ids = Array.isArray(value.messageIds) ? value.messageIds : [];

  return ids
    .map((item) => Number(item || 0))
    .filter((item) => Number.isFinite(item) && item > 0);
}

async function setTrackedBotMessages(chatId, messageIds) {
  const ids = Array.from(
    new Set(
      (Array.isArray(messageIds) ? messageIds : [])
        .map((item) => Number(item || 0))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  ).slice(-BOT_MESSAGE_HISTORY_LIMIT);

  return setRuntimeState(buildBotHistoryKey(chatId), {
    messageIds: ids,
    updatedAt: new Date().toISOString()
  }).catch(() => null);
}

async function rememberBotMessage(chatId, messageId) {
  const safeChatId = normalizeValue(chatId);
  const safeMessageId = Number(messageId || 0);

  if (!safeChatId || !Number.isFinite(safeMessageId) || safeMessageId <= 0) {
    return null;
  }

  const existing = await getTrackedBotMessages(safeChatId);
  existing.push(safeMessageId);
  return setTrackedBotMessages(safeChatId, existing);
}

async function clearTrackedBotMessages(chatId, options = {}) {
  const safeChatId = normalizeValue(chatId);
  if (!safeChatId) {
    return {
      deleted: 0,
      total: 0
    };
  }

  const trackedIds = await getTrackedBotMessages(safeChatId);
  const deleteRequestMessageId = Number(options?.deleteRequestMessageId || 0);
  const idsToDelete = trackedIds.slice().sort((a, b) => b - a);
  let deleted = 0;

  for (const messageId of idsToDelete) {
    const ok = await deleteTelegramMessage(safeChatId, messageId);
    if (ok) {
      deleted += 1;
    }
  }

  if (Number.isFinite(deleteRequestMessageId) && deleteRequestMessageId > 0) {
    await deleteTelegramMessage(safeChatId, deleteRequestMessageId).catch(() => false);
  }

  await setTrackedBotMessages(safeChatId, []);

  return {
    deleted,
    total: trackedIds.length
  };
}

async function downloadTelegramFileBuffer(fileId) {
  const file = await adminTelegramApi('getFile', {
    file_id: normalizeValue(fileId)
  });
  const filePath = normalizeValue(file?.file_path);

  if (!filePath) {
    const error = new Error('Telegram did not return file_path for voice message');
    error.status = 502;
    throw error;
  }

  const response = await fetch(`${TELEGRAM_API_BASE_URL}/file/bot${getAdminBotToken()}/${filePath}`);

  if (!response.ok) {
    const error = new Error(`Telegram file download failed with status ${response.status}`);
    error.status = response.status || 502;
    throw error;
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    filePath
  };
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

async function broadcastLiquidityDailyReport(result) {
  const text = buildLiquidityDailyReportText(result);
  if (!text) {
    return [];
  }

  return broadcastAdminMessage(text);
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

async function isOwnerMessage(message) {
  const owner = await getOwnerTelegramTarget();
  const ownerUserId = normalizeValue(owner?.telegram_user_id);
  const ownerChatId = normalizeValue(owner?.chat_id);
  const userId = normalizeValue(message?.from?.id);
  const chatId = normalizeValue(message?.chat?.id);

  return Boolean(ownerUserId && userId && ownerUserId === userId && (!ownerChatId || ownerChatId === chatId));
}

async function recordBotEvent(input) {
  return openOrIncrementEvent({
    source: 'ops-bot',
    category: normalizeValue(input?.category) || 'bot',
    type: normalizeValue(input?.type) || 'event',
    severity: normalizeValue(input?.severity) || 'warning',
    title: normalizeValue(input?.title) || 'Ops bot event',
    message: normalizeValue(input?.message) || 'No message provided',
    details: input?.details || null,
    fingerprint: normalizeValue(input?.fingerprint) || null
  }).catch(() => null);
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

function formatSunAsTrx(value) {
  const sun = Number(value || 0);
  if (!Number.isFinite(sun)) {
    return '0';
  }

  const trx = sun / 1_000_000;
  return trx.toFixed(6).replace(/\.?0+$/, '');
}

function shortenText(value, maxLength = 160) {
  const safe = normalizeValue(value).replace(/\s+/g, ' ');
  if (safe.length <= maxLength) {
    return safe;
  }

  return `${safe.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function shortenId(value) {
  const safe = normalizeValue(value);
  if (!safe) return '—';
  if (safe.length <= 14) return safe;
  return `${safe.slice(0, 8)}...${safe.slice(-4)}`;
}

function buildLiquidityDailyReportText(result) {
  const safe = result && typeof result === 'object' ? result : {};
  const resources = safe.resources && typeof safe.resources === 'object' ? safe.resources : {};
  const plan = resources.plan && typeof resources.plan === 'object' ? resources.plan : {};
  const before = resources.before && typeof resources.before === 'object' ? resources.before : {};
  const after = resources.after && typeof resources.after === 'object' ? resources.after : {};
  const rented = resources.rented === true;
  const success = safe.ok === true;
  const attempted = safe.attempted === true;

  if (!attempted) {
    return '';
  }

  return [
    success ? '💧 Daily liquidity pass completed' : '🚨 Daily liquidity pass failed',
    `День: ${normalizeValue(safe.today) || 'unknown'}`,
    `Статус: ${normalizeValue(safe.status) || (success ? 'success' : 'failed')}`,
    `Кошелёк: ${shortenAddress(safe.wallet)}`,
    rented
      ? `Ресурсы: арендовал energy ${Number(plan.shortEnergy || 0)} и bandwidth ${Number(plan.shortBandwidth || 0)}`
      : 'Ресурсы: дополнительная аренда не понадобилась',
    Number(before.balanceSun || 0) > 0 || Number(after.balanceSun || 0) > 0
      ? `TRX: было ${formatSunAsTrx(before.balanceSun)} -> стало ${formatSunAsTrx(after.balanceSun)}`
      : '',
    Number(before.availableEnergy || 0) > 0 || Number(after.availableEnergy || 0) > 0
      ? `Energy: было ${Number(before.availableEnergy || 0)} -> стало ${Number(after.availableEnergy || 0)}`
      : '',
    Number(before.availableBandwidth || 0) > 0 || Number(after.availableBandwidth || 0) > 0
      ? `Bandwidth: было ${Number(before.availableBandwidth || 0)} -> стало ${Number(after.availableBandwidth || 0)}`
      : '',
    normalizeValue(safe.txid) ? `TX: ${safe.txid}` : '',
    normalizeValue(safe.tronscanUrl) ? `Tronscan: ${safe.tronscanUrl}` : '',
    normalizeValue(safe.error) ? `Ошибка: ${normalizeValue(safe.error)}` : ''
  ].filter(Boolean).join('\n');
}

function extractCommandArgs(text) {
  const safe = normalizeValue(text);
  const firstSpace = safe.indexOf(' ');
  if (firstSpace < 0) {
    return '';
  }

  return safe.slice(firstSpace + 1).trim();
}

function summaryStatusIcon(status) {
  const safe = normalizeValue(status).toLowerCase();
  if (safe === 'red') return '🔴';
  if (safe === 'orange') return '🟠';
  if (safe === 'yellow') return '🟡';
  return '🟢';
}

function summaryGroupIcon(severity) {
  const safe = normalizeValue(severity).toLowerCase();
  if (safe === 'critical') return '🔴';
  if (safe === 'attention') return '🟠';
  if (safe === 'product') return '💬';
  return '🟢';
}

function productNoteMeta(note) {
  const noteType = normalizeValue(note?.note_type || note?.noteType).toLowerCase();
  const priority = normalizeValue(note?.priority).toLowerCase();

  const typeIconMap = {
    change: '🛠️',
    bug: '🐞',
    ux: '🎯',
    feature: '✨',
    content: '📝',
    infra: '🏗️',
    voice_memo: '🎤'
  };

  const priorityIconMap = {
    low: '⚪',
    normal: '🟢',
    high: '🟠',
    critical: '🔴'
  };

  return {
    typeLabel: noteType || 'change',
    typeIcon: typeIconMap[noteType] || '📝',
    priorityIcon: priorityIconMap[priority] || '🟢'
  };
}

function taskStatusMeta(task) {
  const status = normalizeValue(task?.status).toLowerCase();
  const priority = normalizeValue(task?.priority).toLowerCase();
  const type = normalizeValue(task?.task_type || task?.taskType).toLowerCase();
  const statusIconMap = {
    new: '🆕',
    triaged: '🧭',
    ready_for_codex: '🤖',
    in_progress: '🛠️',
    blocked: '⛔',
    done: '✅',
    archived: '🗃️'
  };
  const priorityIconMap = {
    low: '⚪',
    normal: '🟢',
    high: '🟠',
    critical: '🔴'
  };

  return {
    status,
    type: type || 'task',
    statusIcon: statusIconMap[status] || '📝',
    priorityIcon: priorityIconMap[priority] || '🟢'
  };
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
        { text: '🧠 Summary', callback_data: `${CALLBACK_PREFIX}screen:summary` },
        { text: '🏠 Ops', callback_data: `${CALLBACK_PREFIX}screen:overview` }
      ],
      [
        { text: '🧪 Скринер', callback_data: `${CALLBACK_PREFIX}screen:screen` }
      ],
      [
        { text: '🚨 События', callback_data: `${CALLBACK_PREFIX}screen:events` },
        { text: '💬 Feedback', callback_data: `${CALLBACK_PREFIX}screen:feedback` }
      ],
      [
        { text: '🧾 Tasks', callback_data: `${CALLBACK_PREFIX}screen:tasks` },
        { text: '📚 Knowledge', callback_data: `${CALLBACK_PREFIX}screen:knowledge` },
        { text: '📝 План', callback_data: `${CALLBACK_PREFIX}screen:notes` }
      ],
      [
        { text: '🤖 Jobs', callback_data: `${CALLBACK_PREFIX}screen:jobs` }
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
  const gasStationService = getGasStationService();
  const proxyService = getProxyService();
  const { getSyntheticScreenerSnapshot } = getScreenerService();
  const getGasStationRuntimeState = gasStationService.getGasStationRuntimeState;
  const getGasStationCredentialRuntimeState =
    typeof gasStationService.getGasStationCredentialRuntimeState === 'function'
      ? gasStationService.getGasStationCredentialRuntimeState
      : async () => ({ credentials: [] });
  const getProxyKeyPoolRuntimeState =
    typeof proxyService.getProxyKeyPoolRuntimeState === 'function'
      ? proxyService.getProxyKeyPoolRuntimeState
      : () => ({
          trongrid: { available: 0, total: 0, coolingDown: 0 },
          tronscan: { available: 0, total: 0, coolingDown: 0 },
          cmc: { available: 0, total: 0, coolingDown: 0 }
        });

  const [dbOk, clockState, airdropState, ambassadorState, gasState, events, screeners, recentEvents, notes, tasks] = await Promise.all([
    pool.query('SELECT 1').then(() => true).catch(() => false),
    getRuntimeState('clock.heartbeat').catch(() => null),
    hasEnoughAirdropResources().catch(() => null),
    hasEnoughAmbassadorAllocationResources().catch(() => null),
    getGasStationRuntimeState().catch(() => null),
    listRecentEvents(6, { onlyOpen: true }).catch(() => []),
    getSyntheticScreenerSnapshot().catch(() => null),
    listRecentEvents(20, { onlyOpen: false }).catch(() => []),
    listProductNotes(8, { onlyOpen: true }).catch(() => []),
    listTasks(8, { includeDone: false }).catch(() => [])
  ]);

  return {
    dbOk,
    clockState,
    airdropState,
    ambassadorState,
    gasState,
    events,
    recentEvents,
    feedback: recentEvents.filter(
      (event) =>
        normalizeValue(event?.source) === 'app-feedback' &&
        normalizeValue(event?.category) === 'feedback'
    ),
    notes,
    tasks,
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

async function buildSummaryText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const english = isEnglish(locale);
  const data = await collectOverviewData();
  const digest = await generateOpsDigest(
    {
      health: {
        dbOk: data.dbOk,
        airdropHasEnough: data.airdropState?.hasEnough !== false,
        ambassadorHasEnough: data.ambassadorState?.hasEnough !== false,
        clockStatus: data.clockState?.value_json?.status || 'unknown'
      },
      events: data.events,
      feedback: data.feedback,
      notes: data.notes,
      screeners: data.screeners
    },
    {
      force: options.force === true,
      locale
    }
  );

  if (normalizeValue(digest?.mode) === 'fallback' && normalizeValue(digest?.fallbackReason) && options.force) {
    await recordBotEvent({
      category: 'openai',
      type: 'summary_fallback',
      severity: 'warning',
      title: 'AI summary fell back to deterministic mode',
      message: normalizeValue(digest.fallbackReason),
      fingerprint: `ops-bot:summary_fallback:${normalizeValue(digest.fallbackReason)}`
    });
  }

  const groups = Array.isArray(digest?.groups) ? digest.groups : [];
  const actions = Array.isArray(digest?.actions) ? digest.actions : [];

  return [
    buildHeader(
      english ? '🧠 AI Summary' : '🧠 AI Summary',
      english
        ? 'Short executive view first, noisy raw signals second.'
        : 'Короткая сводка вместо россыпи сигналов. Сначала суть, потом уже детали.'
    ),
    `${summaryStatusIcon(digest?.overallStatus)} ${normalizeValue(digest?.headline) || (english ? 'No summary yet.' : 'Пока без вывода.')}`,
    `${english ? 'Mode' : 'Режим'}: ${normalizeValue(digest?.mode) === 'openai' ? (english ? 'GPT analysis' : 'GPT-анализ') : (english ? 'reliable fallback' : 'надёжный fallback')} • ${english ? 'updated' : 'обновлено'} ${formatRelativeMinutes(digest?.generatedAt)}`,
    '',
    ...groups.map((group) => {
      const items = Array.isArray(group?.items) ? group.items.filter(Boolean) : [];
      return [
        `${summaryGroupIcon(group?.severity)} ${normalizeValue(group?.title) || (english ? 'Group' : 'Группа')}`,
        normalizeValue(group?.summary) || (english ? 'No details.' : 'Без деталей.'),
        ...(items.length ? items.map((item) => `• ${item}`) : [])
      ].join('\n');
    }),
    '',
    english ? 'What to do next:' : 'Что делать дальше:',
    ...(actions.length
      ? actions.map((item, index) => `${index + 1}. ${item}`)
      : [english ? '1. Open the relevant section below for details.' : '1. Откройте детали по нужному разделу ниже.'])
  ].join('\n');
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
  const gasStationEnabled = Boolean(data.gasState?.enabled);
  const gasStationWarn = gasStationEnabled && !gasStation;
  const gasStationError = shortenText(data.gasState?.gasStationError, 140);

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
    `${statusIcon(gasStationEnabled && !gasStationWarn, gasStationWarn || !gasStationEnabled)} GasStation: ${
      gasStationEnabled ? (gasStationWarn ? 'включён, но баланс сейчас не дочитался' : 'включён') : 'выключен'
    }`,
    operator
      ? `💰 Operator TRX: ${operator.balanceTrx} TRX`
      : '💰 Operator TRX: не удалось прочитать',
    gasStation
      ? `🏦 Баланс GasStation: ${gasStation.balanceTrx} TRX на аккаунте ${normalizeValue(gasStation.account) || '—'}`
      : `🏦 Баланс GasStation: не удалось прочитать${gasStationError ? ` (${gasStationError})` : ''}`,
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

async function buildNotesText() {
  const notes = await listProductNotes(8, { onlyOpen: true }).catch(() => []);

  if (!notes.length) {
    return [
      buildHeader('📝 План следующей версии', 'Сюда я складываю ваши идеи, фиксы и голосовые заметки.'),
      'Пока пусто.',
      '',
      'Как быстро добавить:',
      '1. Напишите /note и дальше текстом мысль.',
      '2. Или пришлите голосовое в личку owner-чата, я превращу его в backlog item.'
    ].join('\n');
  }

  return [
    buildHeader('📝 План следующей версии', 'Это ваш живой backlog: что менять дальше, а не просто шум в чате.'),
    `Открытых заметок: ${notes.length}`,
    '',
    ...notes.map((note) => {
      const meta = productNoteMeta(note);
      return [
        `${meta.typeIcon} ${meta.priorityIcon} ${normalizeValue(note?.title) || 'Без названия'}`,
        `Тип: ${meta.typeLabel} • статус: ${normalizeValue(note?.status) || 'open'} • обновлено ${formatRelativeMinutes(note?.updated_at)}`,
        shortenText(note?.body, 220)
      ].join('\n');
    }),
    '',
    'Подсказка:',
    'Если мысль прилетела голосом, просто отправьте её сюда. Я распознаю текст и сохраню как заметку.'
  ].join('\n');
}

async function buildTasksText() {
  const tasks = await listTasks(10, {
    includeDone: false
  }).catch(() => []);

  if (!tasks.length) {
    return [
      buildHeader('🧾 Рабочие задачи', 'Здесь живут уже не мысли, а нормальные тикеты для движения вперёд.'),
      'Сейчас открытых задач нет.',
      '',
      'Как они появляются:',
      '1. Из ваших заметок и голосовых сообщений.',
      '2. Из инцидентов, которые вы руками помечаете в личке.',
      '3. Позже сюда можно будет слать и auto-task из feedback/monitor.'
    ].join('\n');
  }

  return [
    buildHeader('🧾 Рабочие задачи', 'Это уже operational/task board, а не просто backlog мыслей.'),
    `Открытых задач: ${tasks.length}`,
    '',
    ...tasks.map((task) => {
      const meta = taskStatusMeta(task);
      return [
        `${meta.statusIcon} ${meta.priorityIcon} #${task.id} ${normalizeValue(task?.title) || 'Без названия'}`,
        `Статус: ${meta.status} • тип: ${meta.type} • обновлено ${formatRelativeMinutes(task?.updated_at)}`,
        shortenText(task?.body, 220)
      ].join('\n');
    }),
    '',
    'Быстрые действия:',
    '1. /take 123 — взять задачу в работу.',
    '2. /done 123 — закрыть задачу.',
    '3. /block 123 причина — пометить блокер.',
    '4. /todo 123 — вернуть задачу в очередь для Codex.',
    '5. /codex 123 — запустить Codex job по задаче.'
  ].join('\n');
}

async function buildJobsText() {
  const jobs = await listCodexJobs(8).catch(() => []);

  if (!jobs.length) {
    return [
      buildHeader('🤖 Codex Jobs', 'Здесь видно, что уже гонялось через codex-слой.'),
      'Пока ни одного job не запускали.',
      '',
      'Старт: /codex 12'
    ].join('\n');
  }

  return [
    buildHeader('🤖 Codex Jobs', 'Это не просто задача, а конкретный прогон codex-анализа по репо-контексту.'),
    ...jobs.map((job) => {
      const status = normalizeValue(job?.status) || 'unknown';
      const icon =
        status === 'done' ? '✅' :
        status === 'blocked' ? '⛔' :
        status === 'failed' ? '🔴' :
        status === 'running' ? '🛠️' : '🕓';

      return [
        `${icon} Job #${job.id} -> Task #${Number(job.task_id || 0)}`,
        `Статус: ${status} • модель: ${normalizeValue(job.model) || '—'} • обновлено ${formatRelativeMinutes(job.updated_at)}`,
        normalizeValue(job.error_message)
          ? `Ошибка: ${shortenText(job.error_message, 180)}`
          : shortenText(job.response_text, 200) || 'Пока без текста результата.'
      ].join('\n');
    })
  ].join('\n');
}

async function buildKnowledgeText() {
  const status = await getKnowledgeBaseStatus().catch(() => null);

  if (!status?.configured) {
    return [
      buildHeader('📚 Память бота', 'Это база знаний по проекту: доки, backlog и карта репо.'),
      '⚪ OpenAI-слой для knowledge base пока не настроен.',
      '',
      'Когда он включён, бот может лучше отвечать на вопросы вроде:',
      '1. Где это живёт в коде?',
      '2. Что уже планировали на следующий релиз?',
      '3. Какие экраны и маршруты связаны с проблемой?'
    ].join('\n');
  }

  const includedFiles = Array.isArray(status?.includedFiles) ? status.includedFiles : [];
  const summary = status?.summary || {};
  const ready = normalizeValue(status?.fileStatus).toLowerCase() === 'completed';

  return [
    buildHeader('📚 Память бота', 'Здесь видно, что именно бот помнит о проекте помимо live-алертов.'),
    `${ready ? '🟢' : '🟠'} Состояние индекса: ${normalizeValue(status?.fileStatus) || 'ещё не синхронизирован'}`,
    `🗂️ Vector store: ${shortenId(status?.vectorStoreId)}`,
    `🕒 Последняя синхронизация: ${status?.lastSyncedAt ? formatRelativeMinutes(status.lastSyncedAt) : 'ещё не было'}`,
    `📄 Последний файл: ${normalizeValue(status?.lastFilename) || 'ещё не загружался'}`,
    '',
    'Что внутри сейчас:',
    `1. Product notes: ${Number(summary.productNotes || 0)}`,
    `2. Markdown docs: ${Number(summary.docs || 0)}`,
    `3. Mobile screens: ${Number(summary.mobileScreens || 0)}`,
    `4. API routes: ${Number(summary.apiRoutes || 0)}`,
    `5. Ops services: ${Number(summary.opsServices || 0)}`,
    `6. Tasks: ${Number(summary.tasks || 0)}`,
    '',
    includedFiles.length
      ? `Последние включённые docs: ${includedFiles.slice(0, 4).map((item) => '/' + item).join(', ')}`
      : 'Документных источников пока не зафиксировано в состоянии синка.',
    '',
    'Это не заменяет live-данные, а помогает боту помнить контекст проекта и релизов.'
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

async function buildScreenText(screen, options = {}) {
  if (screen === 'summary') return buildSummaryText(options);
  if (screen === 'screen') return buildScreenerText();
  if (screen === 'health') return buildHealthText();
  if (screen === 'events') return buildEventsText();
  if (screen === 'feedback') return buildFeedbackText();
  if (screen === 'knowledge') return buildKnowledgeText();
  if (screen === 'jobs') return buildJobsText();
  if (screen === 'notes') return buildNotesText();
  if (screen === 'tasks') return buildTasksText();
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

async function sendProgressMessage(chatId, text) {
  return sendTelegramMessage(chatId, text);
}

async function finalizeProgressMessage(progressMessage, text) {
  const chatId = normalizeValue(progressMessage?.chat?.id);
  const messageId = progressMessage?.message_id;

  if (!chatId || !messageId) {
    if (!chatId) {
      return null;
    }

    return sendTelegramMessage(chatId, text);
  }

  try {
    return await editTelegramMessage(chatId, messageId, text);
  } catch (_) {
    return sendTelegramMessage(chatId, text);
  }
}

async function sendScreen(chatId, screen, options = {}) {
  const safeScreen = SUPPORTED_SCREENS.has(screen) ? screen : DEFAULT_SCREEN;
  const text = await buildScreenText(safeScreen, options);
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

async function storeOwnerProductNote(rawText, options = {}) {
  const structured = await structureProductNote(rawText);
  const note = await createProductNote({
    source: normalizeValue(options?.source) || 'telegram',
    noteType: structured.noteType,
    priority: structured.priority,
    status: 'open',
    title: structured.title,
    body: structured.body,
    transcriptText: normalizeValue(options?.transcriptText) || null,
    targetRelease: structured.targetRelease,
    createdByChatId: options?.chatId,
    details: {
      mode: structured.mode || 'fallback',
      rawText: normalizeValue(rawText),
      telegramMessageId: options?.messageId || null,
      filePath: normalizeValue(options?.filePath) || null
    }
  });

  return {
    note,
    structured
  };
}

function parseTaskCommandArgs(rawArgs) {
  const safe = normalizeValue(rawArgs);
  if (!safe) {
    return {
      taskId: 0,
      body: ''
    };
  }

  const [rawId, ...rest] = safe.split(/\s+/);
  return {
    taskId: Number(rawId || 0),
    body: rest.join(' ').trim()
  };
}

function extractTaskIdFromNaturalText(text) {
  const safe = normalizeValue(text);
  const match = safe.match(/(?:зада\w*|task|#)\s*#?\s*(\d+)|#(\d+)\b|\b(\d{1,6})\b/i);
  const rawId = match?.[1] || match?.[2] || match?.[3] || '';
  const taskId = Number(rawId || 0);
  return Number.isFinite(taskId) && taskId > 0 ? taskId : 0;
}

function detectTaskPrefilter(text) {
  const safe = normalizeValue(text);
  const lower = safe.toLowerCase();
  const taskId = extractTaskIdFromNaturalText(safe);

  if (!taskId) {
    return null;
  }

  const patterns = [
    {
      status: 'archived',
      usageText: 'Пример: /archive 12',
      commandBody: '',
      matches: /\b(delete|remove|archive|удали|удалить|архив|архивируй|скрой)\b/i
    },
    {
      status: 'done',
      usageText: 'Пример: /done 12',
      commandBody: '',
      matches: /\b(done|finish|finished|close|complete|закрой|закрыть|заверши|заверши|готово)\b/i
    },
    {
      status: 'in_progress',
      usageText: 'Пример: /take 12',
      commandBody: '',
      matches: /\b(take|start|work on|begin|возьми|в работу|начни)\b/i
    },
    {
      status: 'ready_for_codex',
      usageText: 'Пример: /todo 12',
      commandBody: '',
      matches: /\b(todo|queue|back to queue|return|верни|в очередь|назад в кодекс)\b/i
    },
    {
      status: 'blocked',
      usageText: 'Пример: /block 12 жду новый API key',
      commandBody: lower,
      matches: /\b(block|blocked|hold|stuck|блокер|заблокируй|зависло|стоп)\b/i
    }
  ];

  const matched = patterns.find((item) => item.matches.test(lower));
  if (!matched) {
    return null;
  }

  const cleanedBody =
    matched.status === 'blocked'
      ? safe
          .replace(matched.matches, ' ')
          .replace(/(?:зада\w*|task|#)\s*#?\s*\d+/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : matched.commandBody;

  return {
    taskId,
    status: matched.status,
    usageText: matched.usageText,
    body: cleanedBody
  };
}

async function updateTaskFromOwnerCommand(message, status, options = {}) {
  const chatId = normalizeValue(message?.chat?.id);
  const ownerOnly = await isOwnerMessage(message);
  const isPrivate = normalizeValue(message?.chat?.type) === 'private';

  if (!ownerOnly || !isPrivate) {
    await reply(chatId, '⛔ Менять статус задач я даю только owner-аккаунту в личке.');
    return { ok: false, unauthorized: true };
  }

  const args = parseTaskCommandArgs(extractCommandArgs(message?.text));
  if (!Number.isFinite(args.taskId) || args.taskId <= 0) {
    await reply(chatId, options.usageText || 'Укажите id задачи после команды. Например: /done 12');
    return { ok: true, promptShown: true };
  }

  const task = await getTaskById(args.taskId);
  if (!task) {
    await reply(chatId, `⚠️ Задача #${args.taskId} не найдена.`);
    return { ok: false, notFound: true };
  }

  const updated = await updateTaskStatus(args.taskId, status, {
    body: args.body || null,
    details: {
      via: 'telegram',
      actorChatId: chatId,
      telegramMessageId: message?.message_id || null
    }
  });

  if (!updated) {
    await reply(chatId, `⚠️ Не получилось обновить задачу #${args.taskId}.`);
    return { ok: false };
  }

  const meta = taskStatusMeta(updated);
  await reply(
    chatId,
    [
      `${meta.statusIcon} Обновил задачу #${updated.id}`,
      `Новый статус: ${meta.status}`,
      `${meta.priorityIcon} ${normalizeValue(updated.title) || 'Без названия'}`,
      args.body ? `Комментарий: ${args.body}` : ''
    ].filter(Boolean).join('\n')
  );

  return {
    ok: true,
    updated: true,
    taskId: updated.id
  };
}

async function handleOwnerPrefilter(message) {
  const chatId = normalizeValue(message?.chat?.id);
  const rawText = normalizeValue(message?.text);
  const ownerOnly = await isOwnerMessage(message);
  const isPrivate = normalizeValue(message?.chat?.type) === 'private';

  if (!ownerOnly || !isPrivate || !rawText) {
    return {
      matched: false
    };
  }

  const localeRequest = detectLocaleRequest(rawText);
  if (localeRequest) {
    const nextLocale = await setChatLocale(chatId, localeRequest);
    await reply(
      chatId,
      nextLocale === 'en'
        ? '🇬🇧 I got it. I will answer in English now.'
        : '🇷🇺 Принял. Дальше отвечаю по-русски.'
    );

    return {
      matched: true,
      result: {
        ok: true,
        localeChanged: true,
        locale: nextLocale
      }
    };
  }

  const taskAction = detectTaskPrefilter(rawText);
  if (taskAction) {
    const syntheticMessage = {
      ...message,
      text: `/prefilter ${taskAction.taskId}${taskAction.body ? ` ${taskAction.body}` : ''}`
    };

    const result = await updateTaskFromOwnerCommand(syntheticMessage, taskAction.status, {
      usageText: taskAction.usageText
    });

    return {
      matched: true,
      result
    };
  }

  return {
    matched: false
  };
}

async function runCodexTaskFromOwner(message) {
  const chatId = normalizeValue(message?.chat?.id);
  const ownerOnly = await isOwnerMessage(message);
  const isPrivate = normalizeValue(message?.chat?.type) === 'private';

  if (!ownerOnly || !isPrivate) {
    await reply(chatId, '⛔ Запускать Codex jobs я даю только owner-аккаунту в личке.');
    return { ok: false, unauthorized: true };
  }

  const args = parseTaskCommandArgs(extractCommandArgs(message?.text));
  if (!Number.isFinite(args.taskId) || args.taskId <= 0) {
    await reply(chatId, 'Пример: /codex 12');
    return { ok: true, promptShown: true };
  }

  const task = await getTaskById(args.taskId);
  if (!task) {
    await reply(chatId, `⚠️ Задача #${args.taskId} не найдена.`);
    return { ok: false, notFound: true };
  }

  const progressMessage = await sendProgressMessage(
    chatId,
    `🤖 Запускаю Codex job по задаче #${args.taskId}. Смотрю на task, knowledge base и repo-контекст без выдумок...`
  );

  try {
    const result = await runCodexJobForTask(args.taskId, {
      source: 'telegram',
      createdByChatId: chatId
    });
    const taskStatus = normalizeValue(result?.task?.status) || 'unknown';

    await finalizeProgressMessage(
      progressMessage,
      [
        `🤖 Codex job завершён для задачи #${args.taskId}`,
        `Job: #${Number(result?.job?.id || 0)} • итоговый статус задачи: ${taskStatus}`,
        '',
        normalizeValue(result?.result?.summary) || 'Без summary.',
        '',
        Array.isArray(result?.result?.proposedFiles) && result.result.proposedFiles.length
          ? `Файлы:\n${result.result.proposedFiles.map((item) => `- ${normalizeValue(item)}`).join('\n')}`
          : '',
        Array.isArray(result?.result?.implementationSteps) && result.result.implementationSteps.length
          ? `Шаги:\n${result.result.implementationSteps.map((item, index) => `${index + 1}. ${normalizeValue(item)}`).join('\n')}`
          : '',
        normalizeValue(result?.result?.blockerReason) ? `Блокер: ${normalizeValue(result.result.blockerReason)}` : ''
      ].filter(Boolean).join('\n')
    );

    return {
      ok: true,
      ran: true,
      taskId: args.taskId,
      jobId: result?.job?.id || null
    };
  } catch (error) {
    await finalizeProgressMessage(
      progressMessage,
      `⚠️ Codex job по задаче #${args.taskId} не завершился: ${normalizeValue(error.message) || 'unknown error'}`
    );
    return { ok: false, error: error.message };
  }
}

async function answerOwnerQuestion(message, question) {
  const chatId = normalizeValue(message?.chat?.id);
  const ownerOnly = await isOwnerMessage(message);
  const isPrivate = normalizeValue(message?.chat?.type) === 'private';
  const safeQuestion = normalizeValue(question);
  const locale = await getChatLocale(chatId);
  const english = isEnglish(locale);

  if (!ownerOnly || !isPrivate) {
    await reply(
      chatId,
      english
        ? '⛔ I only answer internal AI questions from the owner in the private chat.'
        : '⛔ Вопросы к AI по внутреннему состоянию приложения я принимаю только от owner-а в личном чате.'
    );
    return {
      ok: false,
      unauthorized: true
    };
  }

  if (!safeQuestion) {
    await reply(
      chatId,
      english
        ? '🤖 After /ask just send your question.\n\nExample:\n/ask what is actually hurting the app right now?\n\nYou can also just send that as a normal message.'
        : '🤖 После /ask просто напишите вопрос.\n\nПример:\n/ask что сейчас реально болит у приложения?\n\nИли можно просто прислать такой вопрос обычным сообщением.'
    );
    return {
      ok: true,
      promptShown: true
    };
  }

  const progressMessage = await sendProgressMessage(
    chatId,
    english
      ? '🤖 Looking through live data and project memory, pulling together a short answer...'
      : '🤖 Смотрю на живые данные и память по проекту, собираю короткий ответ...'
  );

  try {
    const data = await collectOverviewData();
    const answer = await answerOpsQuestion(
      safeQuestion,
      {
        health: {
          dbOk: data.dbOk,
          clockStatus: data.clockState?.value_json?.status || 'unknown'
        },
        keyPools: data.keyPools,
        gasState: data.gasState,
        airdropState: data.airdropState,
        ambassadorState: data.ambassadorState,
        events: data.events,
        feedback: data.feedback,
        notes: data.notes,
        tasks: data.tasks,
        screeners: data.screeners
      },
      {
        locale
      }
    );

    if (normalizeValue(answer?.mode) === 'fallback' && normalizeValue(answer?.fallbackReason)) {
      await recordBotEvent({
        category: 'openai',
        type: 'question_fallback',
        severity: 'warning',
        title: 'AI answer fell back to deterministic mode',
        message: normalizeValue(answer.fallbackReason),
        fingerprint: `ops-bot:question_fallback:${normalizeValue(answer.fallbackReason)}`
      });
    }

    await finalizeProgressMessage(
      progressMessage,
      [
        english ? '🤖 Answered it as a question' : '🤖 Ответил как на вопрос',
        `${english ? 'Request' : 'Запрос'}: ${shortenText(safeQuestion, 120)}`,
        '',
        normalizeValue(answer?.answer) || (english ? 'I could not build the answer yet.' : 'Пока не получилось собрать ответ.'),
        '',
        `${english ? 'Mode' : 'Режим'}: ${normalizeValue(answer?.mode) === 'openai' ? (english ? 'GPT analysis' : 'GPT-анализ') : (english ? 'reliable fallback' : 'надёжный fallback')}`
      ].join('\n')
    );

    return {
      ok: true,
      answered: true,
      mode: answer?.mode || 'fallback'
    };
  } catch (error) {
    await recordBotEvent({
      category: 'openai',
      type: 'question_failed',
      severity: 'error',
      title: 'AI question could not be answered',
      message: error.message,
      fingerprint: `ops-bot:question_failed:${normalizeValue(message?.from?.id) || 'unknown'}`,
      details: {
        chatId,
        telegramMessageId: message?.message_id || null,
        question: shortenText(safeQuestion, 300)
      }
    });
    await finalizeProgressMessage(
      progressMessage,
      english
        ? '⚠️ I could not build the answer right now. Please try again in a minute.'
        : '⚠️ Сейчас не получилось собрать ответ. Попробуйте ещё раз через минуту.'
    );
    return {
      ok: false,
      error: error.message
    };
  }
}

async function handleOwnerInboxText(message) {
  const chatId = normalizeValue(message?.chat?.id);
  const ownerOnly = await isOwnerMessage(message);
  const isPrivate = normalizeValue(message?.chat?.type) === 'private';
  const rawText = normalizeValue(message?.text);

  if (!ownerOnly || !isPrivate || !rawText) {
    return {
      ok: false,
      ignored: true
    };
  }

  const data = await collectOverviewData();
  const route = await routeOwnerMessage(rawText, {
    health: {
      dbOk: data.dbOk,
      clockStatus: data.clockState?.value_json?.status || 'unknown'
    },
    keyPools: data.keyPools,
    gasState: data.gasState,
    airdropState: data.airdropState,
    ambassadorState: data.ambassadorState,
    events: data.events,
    feedback: data.feedback,
    notes: data.notes,
    tasks: data.tasks,
    screeners: data.screeners
  });

  if (normalizeValue(route?.mode) === 'fallback' && normalizeValue(route?.fallbackReason)) {
    await recordBotEvent({
      category: 'openai',
      type: 'router_fallback',
      severity: 'warning',
      title: 'Owner inbox router fell back to heuristics',
      message: normalizeValue(route.fallbackReason),
      fingerprint: `ops-bot:router_fallback:${normalizeValue(route.fallbackReason)}`
    });
  }

  if (normalizeValue(route?.intent) === 'product_note') {
    const stored = await storeOwnerProductNote(rawText, {
      source: 'telegram-inbox',
      chatId,
      messageId: message?.message_id
    });
    const taskResult = await createTaskFromProductNote(stored.note, {
      source: 'telegram-inbox',
      createdByChatId: chatId
    }).catch(() => null);

    await reply(
      chatId,
      [
        '📝 Сохранил в план следующей версии',
        route?.answerText || 'Вижу это как задачу на релиз, а не как просто сообщение в чат.',
        `Заголовок: ${normalizeValue(stored.note?.title) || normalizeValue(stored.structured?.title)}`,
        `Тип: ${normalizeValue(stored.note?.note_type || stored.structured?.noteType)} • приоритет: ${normalizeValue(stored.note?.priority || stored.structured?.priority)}`,
        taskResult?.task?.id ? `Task: #${taskResult.task.id} • статус ${normalizeValue(taskResult.task.status)}` : '',
        '',
        'Если хотите, потом можно открыть /tasks и двигать это как обычную задачу.'
      ].join('\n')
    );

    return {
      ok: true,
      routed: 'product_note'
    };
  }

  if (normalizeValue(route?.intent) === 'incident_report') {
    const title = normalizeValue(route?.title) || shortenText(rawText, 100) || 'Owner incident report';
    const severity = normalizeValue(route?.severity) || 'warning';

    const progressMessage = await sendProgressMessage(
      chatId,
      '🚨 Фиксирую это как сигнал о проблеме и быстро проверяю соседние данные...'
    );

    const eventResult = await recordBotEvent({
      category: 'owner-input',
      type: 'owner_flagged_issue',
      severity,
      title,
      message: normalizeValue(route?.eventMessage) || rawText,
      fingerprint: `ops-bot:owner_issue:${title.toLowerCase()}`,
      details: {
        chatId,
        telegramMessageId: message?.message_id || null
      }
    });
    const taskResult = await createTaskFromOpsEvent(eventResult?.event, {
      source: 'owner-incident',
      createdByChatId: chatId
    }).catch(() => null);

    const answer = await answerOpsQuestion(rawText, {
      health: {
        dbOk: data.dbOk,
        clockStatus: data.clockState?.value_json?.status || 'unknown'
      },
      keyPools: data.keyPools,
      gasState: data.gasState,
      airdropState: data.airdropState,
      ambassadorState: data.ambassadorState,
      events: data.events,
      feedback: data.feedback,
      notes: data.notes,
      tasks: data.tasks,
      screeners: data.screeners
    });

    await finalizeProgressMessage(
      progressMessage,
      [
        '🚨 Зафиксировал как инцидент',
        route?.answerText || 'Вижу это как живую проблему, а не просто заметку на потом.',
        taskResult?.task?.id ? `Task: #${taskResult.task.id} • статус ${normalizeValue(taskResult.task.status)}` : '',
        '',
        normalizeValue(answer?.answer) || 'Пока без деталей.',
        '',
        `Режим: ${normalizeValue(answer?.mode) === 'openai' ? 'GPT-анализ' : 'надёжный fallback'}`
      ].join('\n')
    );

    return {
      ok: true,
      routed: 'incident_report'
    };
  }

  return answerOwnerQuestion(message, rawText);
}

async function handleVoiceNote(message) {
  const chatId = normalizeValue(message?.chat?.id);
  const voice = message?.voice;

  if (!chatId || !voice?.file_id) {
    return {
      ok: false,
      ignored: true
    };
  }

  const ownerOnly = await isOwnerMessage(message);
  const isPrivate = normalizeValue(message?.chat?.type) === 'private';

  if (!ownerOnly || !isPrivate) {
    await reply(chatId, '🎤 Голосовые заметки в backlog я принимаю только от owner-а в личном чате.');
    return {
      ok: false,
      unauthorized: true
    };
  }

  const progressMessage = await sendProgressMessage(
    chatId,
    '🎤 Слушаю заметку, превращаю её в текст и складываю в план следующей версии...'
  );

  try {
    const file = await downloadTelegramFileBuffer(voice.file_id);
    const transcription = await transcribeAudioBuffer(file.buffer, {
      fileName: file.filePath.split('/').pop() || 'voice-note.ogg',
      mimeType: 'audio/ogg',
      prompt: 'Founder product note for the next wallet release. Return clean Russian text.'
    });
    const stored = await storeOwnerProductNote(transcription.text, {
      source: 'telegram-voice',
      transcriptText: transcription.text,
      chatId,
      messageId: message?.message_id,
      filePath: file.filePath
    });
    const taskResult = await createTaskFromProductNote(stored.note, {
      source: 'telegram-voice',
      createdByChatId: chatId
    }).catch(() => null);

    await finalizeProgressMessage(
      progressMessage,
      [
        '🎤 Сохранил голосовую заметку в план',
        `Заголовок: ${normalizeValue(stored.note?.title) || normalizeValue(stored.structured?.title)}`,
        `Тип: ${normalizeValue(stored.note?.note_type || stored.structured?.noteType)} • приоритет: ${normalizeValue(stored.note?.priority || stored.structured?.priority)}`,
        taskResult?.task?.id ? `Task: #${taskResult.task.id} • статус ${normalizeValue(taskResult.task.status)}` : '',
        `Текст: ${shortenText(transcription.text, 260)}`,
        '',
        'Откройте /tasks, если хотите увидеть это как рабочую задачу.'
      ].join('\n')
    );

    return {
      ok: true,
      stored: true,
      noteId: stored.note?.id || null
    };
  } catch (error) {
    await recordBotEvent({
      category: 'openai',
      type: 'voice_note_failed',
      severity: 'error',
      title: 'Voice note could not be processed',
      message: error.message,
      fingerprint: `ops-bot:voice_note_failed:${normalizeValue(message?.from?.id) || 'unknown'}`,
      details: {
        chatId,
        telegramFileId: normalizeValue(voice.file_id),
        telegramMessageId: message?.message_id || null
      }
    });

    await finalizeProgressMessage(
      progressMessage,
      '⚠️ Голосовую заметку не получилось обработать. Попробуйте ещё раз или пришлите мысль текстом через /note.'
    );
    return {
      ok: false,
      error: error.message
    };
  }
}

async function handleCommand(message) {
  const chatId = normalizeValue(message?.chat?.id);
  const command = resolveCommandFromText(message?.text);
  const rawText = normalizeValue(message?.text);

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
        await sendScreen(chatId, 'summary', { force: true });

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

  if (command === '/clear' || isClearIntent(rawText)) {
    const cleared = await clearTrackedBotMessages(chatId, {
      deleteRequestMessageId: message?.message_id || null
    });

    await reply(
      chatId,
      [
        '🧹 Почистил историю бота.',
        `Удалил сообщений: ${Number(cleared.deleted || 0)} из ${Number(cleared.total || 0)}.`
      ].join('\n')
    );
    return { ok: true, cleared: true };
  }

  if (command === '/help') {
    await reply(
      chatId,
      [
        '🤝 Я могу говорить по-простому, а не сухими логами.',
        '',
        'Основное:',
        '/menu — открыть меню',
        '/summary — короткая AI-сводка',
        '/ask — задать вопрос по серверу, ключам, feedback и backlog',
        '/screen — проверить реальные app-flow',
        '/health — быстро понять, что болит',
        '/events — активные проблемы',
        '/feedback — отзывы из кошелька',
        '/kb — память бота по проекту',
        '/jobs — последние Codex jobs',
        '/notes — backlog следующей версии',
        '/tasks — рабочие задачи',
        '/codex 12 — прогнать Codex по задаче',
        '/note текст — добавить идею или правку в backlog',
        '/take 12 — взять задачу в работу',
        '/done 12 — закрыть задачу',
        '/block 12 причина — пометить блокер',
        '/todo 12 — вернуть задачу в очередь',
        '/keys — ключи и лимиты',
        '/queues — очереди и фоновые задачи',
        '/targets — куда бот пишет',
        '/allow_here — разрешить этот чат',
        '',
        'Бонус:',
        '1. Голосовое в owner-личку я превращаю в заметку для следующей версии.',
        '2. Любой обычный текст в owner-личке я сам пытаюсь понять: это вопрос, заметка в план или живой инцидент.'
      ].join('\n')
    );
    return { ok: true };
  }

  if (command === '/start' || command === '/menu') {
    await sendScreen(chatId, 'summary', { force: true });
    return { ok: true };
  }

  if (command === '/summary') {
    await sendScreen(chatId, 'summary', { force: true });
    return { ok: true };
  }

  if (command === '/ask') {
    const args = extractCommandArgs(message?.text);
    return answerOwnerQuestion(message, args);
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

  if (command === '/kb') {
    await sendScreen(chatId, 'knowledge');
    return { ok: true };
  }

  if (command === '/notes') {
    await sendScreen(chatId, 'notes');
    return { ok: true };
  }

  if (command === '/tasks') {
    await sendScreen(chatId, 'tasks');
    return { ok: true };
  }

  if (command === '/jobs') {
    await sendScreen(chatId, 'jobs');
    return { ok: true };
  }

  if (command === '/codex') {
    return runCodexTaskFromOwner(message);
  }

  if (command === '/note') {
    const ownerOnly = await isOwnerMessage(message);
    const args = extractCommandArgs(message?.text);

    if (!ownerOnly) {
      await reply(chatId, '⛔ Добавлять product-notes может только owner-аккаунт.');
      return { ok: false };
    }

    if (!args) {
      await reply(
        chatId,
        '📝 После /note просто напишите мысль текстом.\n\nПример:\n/note Сделать понятнее экран send и показать, почему не хватает energy.'
      );
      return { ok: true };
    }

      try {
        const stored = await storeOwnerProductNote(args, {
          source: 'telegram-text',
          chatId,
          messageId: message?.message_id
        });
        const taskResult = await createTaskFromProductNote(stored.note, {
          source: 'telegram-text',
          createdByChatId: chatId
        }).catch(() => null);

        await reply(
          chatId,
        [
          '✅ Сохранил в backlog следующей версии.',
          `Заголовок: ${normalizeValue(stored.note?.title) || normalizeValue(stored.structured?.title)}`,
          `Тип: ${normalizeValue(stored.note?.note_type || stored.structured?.noteType)} • приоритет: ${normalizeValue(stored.note?.priority || stored.structured?.priority)}`,
          `Суть: ${shortenText(stored.note?.body || stored.structured?.body, 220)}`,
          taskResult?.task?.id ? `Task: #${taskResult.task.id} • статус ${normalizeValue(taskResult.task.status)}` : '',
          '',
          'Откройте /tasks, если хотите посмотреть список рабочих задач.'
        ].join('\n')
      );

      return { ok: true, stored: true };
    } catch (error) {
      await recordBotEvent({
        category: 'openai',
        type: 'product_note_failed',
        severity: 'error',
        title: 'Product note could not be stored',
        message: error.message,
        fingerprint: `ops-bot:product_note_failed:${normalizeValue(message?.from?.id) || 'unknown'}`,
        details: {
          chatId,
          telegramMessageId: message?.message_id || null
        }
      });
      await reply(chatId, '⚠️ Не получилось сохранить заметку. Попробуйте ещё раз чуть позже.');
      return { ok: false };
    }
  }

  if (command === '/queues') {
    await sendScreen(chatId, 'queues');
    return { ok: true };
  }

  if (command === '/take') {
    return updateTaskFromOwnerCommand(message, 'in_progress', {
      usageText: 'Пример: /take 12'
    });
  }

  if (command === '/done') {
    return updateTaskFromOwnerCommand(message, 'done', {
      usageText: 'Пример: /done 12'
    });
  }

  if (command === '/block') {
    return updateTaskFromOwnerCommand(message, 'blocked', {
      usageText: 'Пример: /block 12 жду новый API key'
    });
  }

  if (command === '/todo') {
    return updateTaskFromOwnerCommand(message, 'ready_for_codex', {
      usageText: 'Пример: /todo 12'
    });
  }

  if (command === '/archive') {
    return updateTaskFromOwnerCommand(message, 'archived', {
      usageText: 'Пример: /archive 12'
    });
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

  if (await isOwnerMessage(message) && normalizeValue(message?.chat?.type) === 'private' && !normalizeCommand(message?.text).startsWith('/')) {
    const prefiltered = await handleOwnerPrefilter(message);
    if (prefiltered.matched) {
      return prefiltered.result;
    }

    return handleOwnerInboxText(message);
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
    editMessageId: messageId,
    force: screen === 'summary'
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

  if (message?.voice?.file_id) {
    return handleVoiceNote(message);
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
  broadcastLiquidityDailyReport,
  ensureAdminTelegramWebhook,
  getExpectedWebhookUrl,
  handleAdminTelegramWebhookUpdate
};
