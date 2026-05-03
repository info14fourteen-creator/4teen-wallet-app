const crypto = require('crypto');
const { fetch } = require('undici');
const env = require('../../config/env');
const { pool } = require('../../db/pool');
const { listCodexJobs, runCodexJobForTask } = require('./codexJobs');
const {
  cancelExecutionRequest,
  confirmExecutionRequestByCode,
  findLatestCompletedApplyRequest,
  findLatestPendingConfirmationByChat,
  inferRepoKeyFromTask,
  issueExecutionRequest,
  listExecutionRequests,
  normalizeActionType,
  normalizeRepoKey
} = require('./executionRequests');
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
  'engineer',
  'run',
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
  { command: 'run', description: 'Показать запуск задач и code-run' },
  { command: 'engineer', description: 'Открыть инженерный режим' },
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
  { command: 'execute', description: 'Подготовить кодовую задачу к исполнению' },
  { command: 'confirm', description: 'Подтвердить исполнение 6-значным кодом' },
  { command: 'publish', description: 'Подготовить push/deploy после кода' },
  { command: 'deploy', description: 'Подготовить деплой после кода' },
  { command: 'restart', description: 'Подготовить рестарт после деплоя' },
  { command: 'cancelrun', description: 'Отменить запрос на исполнение' },
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

function logTelegramTrace(stage, payload = {}) {
  const safePayload = Object.fromEntries(
    Object.entries(payload || {}).map(([key, value]) => {
      if (value == null) {
        return [key, value];
      }

      if (typeof value === 'string') {
        return [key, shortenText(value.replace(/\s+/g, ' ').trim(), 220)];
      }

      if (Array.isArray(value)) {
        return [key, value.slice(0, 8)];
      }

      if (typeof value === 'object') {
        return [key, JSON.parse(JSON.stringify(value))];
      }

      return [key, value];
    })
  );

  console.log(`[ops-bot] ${stage}`, safePayload);
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

function pickLocale(locale, ruText, enText) {
  return isEnglish(locale) ? enText : ruText;
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

function detectAudioMimeType(filePath, fallbackMimeType = '') {
  const safePath = normalizeValue(filePath).toLowerCase();
  const safeMimeType = normalizeValue(fallbackMimeType).toLowerCase();

  if (safeMimeType) {
    return safeMimeType;
  }

  if (safePath.endsWith('.ogg') || safePath.endsWith('.oga')) return 'audio/ogg';
  if (safePath.endsWith('.mp3')) return 'audio/mpeg';
  if (safePath.endsWith('.m4a')) return 'audio/mp4';
  if (safePath.endsWith('.mp4')) return 'video/mp4';
  if (safePath.endsWith('.wav')) return 'audio/wav';
  if (safePath.endsWith('.webm')) return 'audio/webm';
  return 'audio/ogg';
}

function extractAudioAttachment(message) {
  if (message?.voice?.file_id) {
    return {
      fileId: normalizeValue(message.voice.file_id),
      kind: 'voice',
      mimeType: normalizeValue(message.voice.mime_type) || 'audio/ogg'
    };
  }

  if (message?.audio?.file_id) {
    return {
      fileId: normalizeValue(message.audio.file_id),
      kind: 'audio',
      mimeType: normalizeValue(message.audio.mime_type)
    };
  }

  if (message?.video_note?.file_id) {
    return {
      fileId: normalizeValue(message.video_note.file_id),
      kind: 'video_note',
      mimeType: 'video/mp4'
    };
  }

  const document = message?.document;
  if (document?.file_id && /^audio\//i.test(normalizeValue(document?.mime_type))) {
    return {
      fileId: normalizeValue(document.file_id),
      kind: 'document_audio',
      mimeType: normalizeValue(document.mime_type)
    };
  }

  return null;
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

function formatRelativeMinutes(timestamp, locale = 'ru') {
  const time = new Date(timestamp || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) {
    return pickLocale(locale, 'неизвестно', 'unknown');
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (diffMinutes < 1) return pickLocale(locale, 'только что', 'just now');
  if (diffMinutes < 60) return pickLocale(locale, `${diffMinutes} мин назад`, `${diffMinutes} min ago`);
  const hours = Math.floor(diffMinutes / 60);
  const restMinutes = diffMinutes % 60;
  return restMinutes > 0
    ? pickLocale(locale, `${hours} ч ${restMinutes} мин назад`, `${hours}h ${restMinutes}m ago`)
    : pickLocale(locale, `${hours} ч назад`, `${hours}h ago`);
}

function formatKeyPoolLine(label, snapshot, locale = 'ru') {
  const available = Number(snapshot?.available || 0);
  const total = Number(snapshot?.total || 0);
  const coolingDown = Number(snapshot?.coolingDown || 0);
  const icon = available === 0 ? '🔴' : available === total ? '🟢' : '🟠';
  return pickLocale(
    locale,
    `${icon} ${label}: готово ${available}/${total}, в cooldown ${coolingDown}`,
    `${icon} ${label}: ready ${available}/${total}, cooling down ${coolingDown}`
  );
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

function feedbackTypeMeta(type, locale = 'ru') {
  const safe = normalizeValue(type).toLowerCase();

  if (safe === 'app_issue') {
    return { icon: '🚨', label: pickLocale(locale, 'поломка', 'broken') };
  }

  if (safe === 'app_confusing') {
    return { icon: '🤔', label: pickLocale(locale, 'непонятно', 'confusing') };
  }

  if (safe === 'app_slow') {
    return { icon: '🐢', label: pickLocale(locale, 'тормозит', 'slow') };
  }

  if (safe === 'app_idea') {
    return { icon: '💡', label: pickLocale(locale, 'идея', 'idea') };
  }

  if (safe === 'app_praise') {
    return { icon: '❤️', label: pickLocale(locale, 'похвала', 'praise') };
  }

  return { icon: '💬', label: pickLocale(locale, 'отзыв', 'feedback') };
}

function feedbackStatusLabel(event, locale = 'ru') {
  if (event?.resolved_at) {
    return pickLocale(locale, 'разобрано', 'reviewed');
  }

  return pickLocale(locale, 'ждёт внимания', 'needs attention');
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

function buildScreenerStateSummary(snapshot, locale = 'ru') {
  const summary = snapshot?.summary || {};
  const ok = Number(summary.ok || 0);
  const warn = Number(summary.warn || 0);
  const fail = Number(summary.fail || 0);
  const total = Number(summary.total || 0);

  if (total <= 0) {
    return pickLocale(locale, 'ещё нет прогона', 'not run yet');
  }

  if (fail > 0) {
    return pickLocale(
      locale,
      `${ok}/${total} ок, ${warn} под давлением, ${fail} сломано`,
      `${ok}/${total} ok, ${warn} under pressure, ${fail} broken`
    );
  }

  if (warn > 0) {
    return pickLocale(locale, `${ok}/${total} ок, ${warn} под давлением`, `${ok}/${total} ok, ${warn} under pressure`);
  }

  return pickLocale(locale, `${ok}/${total} ок`, `${ok}/${total} ok`);
}

function buildEventRecommendation(event, locale = 'ru') {
  const source = normalizeValue(event?.source);
  const category = normalizeValue(event?.category);
  const type = normalizeValue(event?.type);
  const details = parseJson(event?.details_json, {});

  if (source === 'airdrop' && category === 'resources' && type === 'resource_floor_low') {
    return pickLocale(
      locale,
      `Совет: докинуть energy на airdrop-кошелёк ${shortenAddress(details?.walletAddress)}.`,
      `Advice: add energy to the airdrop wallet ${shortenAddress(details?.walletAddress)}.`
    );
  }

  if (source === 'ambassador' && category === 'resources' && type === 'resource_floor_low') {
    return pickLocale(
      locale,
      `Совет: проверить operator wallet ${shortenAddress(details?.walletAddress)} и поднять energy.`,
      `Advice: check operator wallet ${shortenAddress(details?.walletAddress)} and top up energy.`
    );
  }

  if (source === 'proxy' && category === 'keys' && type === 'key_pool_exhausted') {
    return pickLocale(locale, 'Совет: часть провайдерских ключей упёрлась в лимиты. Стоит проверить квоты и запасные ключи.', 'Advice: some provider keys hit their limits. Check quotas and spare keys.');
  }

  if (source === 'gasstation' && category === 'keys' && type === 'credential_pool_failed') {
    return pickLocale(locale, 'Совет: проверить лимиты/whitelist GasStation и хватает ли средств для top-up.', 'Advice: check GasStation limits/whitelist and whether there are enough funds for top-up.');
  }

  if (source === 'clock' && category === 'heartbeat' && type === 'clock_stale') {
    return pickLocale(locale, 'Совет: проверить clock dyno и свежесть heartbeat.', 'Advice: check the clock dyno and heartbeat freshness.');
  }

  if (source === 'screeners' && type === 'wallet_market_pipeline') {
    return pickLocale(locale, 'Совет: проверить proxy до Trongrid/Tronscan и запас по ключам.', 'Advice: check the proxy path to Trongrid/Tronscan and remaining key capacity.');
  }

  if (source === 'screeners' && type === 'ambassador_energy_quote') {
    return pickLocale(locale, 'Совет: проверить quote на energy и fallback-конфиг для resale.', 'Advice: check the energy quote and the resale fallback config.');
  }

  if (source === 'screeners' && type === 'telegram_airdrop_flow') {
    return pickLocale(
      locale,
      `Совет: посмотреть airdrop wallet ${shortenAddress(details?.meta?.walletAddress || details?.walletAddress)} и его ресурсы.`,
      `Advice: inspect airdrop wallet ${shortenAddress(details?.meta?.walletAddress || details?.walletAddress)} and its resources.`
    );
  }

  if (source === 'screeners' && type === 'ambassador_allocation_flow') {
    return pickLocale(
      locale,
      `Совет: проверить operator wallet ${shortenAddress(details?.meta?.walletAddress || details?.walletAddress)} и не застряли ли аллокации.`,
      `Advice: inspect operator wallet ${shortenAddress(details?.meta?.walletAddress || details?.walletAddress)} and check for stuck allocations.`
    );
  }

  if (source === 'app-feedback' && category === 'feedback') {
    return pickLocale(locale, 'Совет: открыть экран, который человек указал в отзыве, и быстро воспроизвести путь руками.', 'Advice: open the screen mentioned in the feedback and quickly reproduce the path by hand.');
  }

  return pickLocale(locale, 'Совет: откройте детали ниже и посмотрите соседние сигналы в разделе здоровья.', 'Advice: open the details below and compare nearby signals in the health section.');
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

function isAdvancedScreen(screen) {
  return new Set(['engineer', 'screen', 'health', 'keys', 'queues', 'knowledge', 'jobs', 'notes', 'targets']).has(
    normalizeValue(screen)
  );
}

function buildClockWalletOpsSummary(clockPayload, locale = 'ru') {
  const app = clockPayload?.app || {};
  const claims = app.telegramClaimsProcessed;
  const wallets = app.ambassadorWalletsProcessed;
  const failed = app.ambassadorWalletsFailed;

  if (claims == null && wallets == null) {
    return pickLocale(locale, 'данные по wallet workers ещё не записаны', 'wallet worker data has not been recorded yet');
  }

  return `claims ${claims ?? 'n/a'} • ambassador wallets ${wallets ?? 'n/a'} • failed ${failed ?? 'n/a'}`;
}

function buildClockSiteSummary(clockPayload, locale = 'ru') {
  const site = clockPayload?.site || {};
  const total = Number(site.total || 0);
  const ok = Number(site.ok || 0);
  const stale = Number(site.stale || 0);
  const failed = Number(site.failed || 0);

  if (total <= 0) {
    return pickLocale(locale, 'сайтовый refresh ещё не зафиксирован', 'site refresh has not been recorded yet');
  }

  return `${total} endpoints • ok ${ok} • stale ${stale} • fail ${failed}`;
}

function listClockSiteIssues(clockPayload) {
  const endpoints = Array.isArray(clockPayload?.site?.endpoints) ? clockPayload.site.endpoints : [];
  return endpoints
    .filter((item) => !item?.ok || item?.stale)
    .slice(0, 4)
    .map((item) => {
      const status = !item?.ok ? 'fail' : 'stale';
      return `${normalizeValue(item?.key) || 'unknown'} (${status})`;
    });
}

function buildMenuMarkup(currentScreen, options = {}) {
  const safeScreen = SUPPORTED_SCREENS.has(currentScreen) ? currentScreen : DEFAULT_SCREEN;
  const locale = normalizeLocale(options?.locale);
  const refreshRow = [{ text: pickLocale(locale, '🔄 Обновить', '🔄 Refresh'), callback_data: `${CALLBACK_PREFIX}refresh:${safeScreen}` }];
  const rerunRows =
    safeScreen === 'screen'
      ? [[{ text: pickLocale(locale, '🧪 Прогнать скринер сейчас', '🧪 Run screener now'), callback_data: `${CALLBACK_PREFIX}rerun:screen` }]]
      : [];
  const advancedRows = isAdvancedScreen(safeScreen)
    ? [
        [
          { text: pickLocale(locale, '🧪 Скринер', '🧪 Screeners'), callback_data: `${CALLBACK_PREFIX}screen:screen` },
          { text: pickLocale(locale, '🩺 Здоровье', '🩺 Health'), callback_data: `${CALLBACK_PREFIX}screen:health` }
        ],
        [
          { text: pickLocale(locale, '🔑 Ключи', '🔑 Keys'), callback_data: `${CALLBACK_PREFIX}screen:keys` },
          { text: pickLocale(locale, '📦 Очереди', '📦 Queues'), callback_data: `${CALLBACK_PREFIX}screen:queues` }
        ],
        [
          { text: pickLocale(locale, '🤖 Джобы', '🤖 Jobs'), callback_data: `${CALLBACK_PREFIX}screen:jobs` },
          { text: pickLocale(locale, '📚 Память', '📚 Knowledge'), callback_data: `${CALLBACK_PREFIX}screen:knowledge` }
        ],
        [
          { text: pickLocale(locale, '📝 План', '📝 Notes'), callback_data: `${CALLBACK_PREFIX}screen:notes` },
          { text: pickLocale(locale, '👥 Чаты', '👥 Targets'), callback_data: `${CALLBACK_PREFIX}screen:targets` }
        ]
      ]
    : [];

  return {
    inline_keyboard: [
      [
        { text: pickLocale(locale, '🧠 Сводка', '🧠 Summary'), callback_data: `${CALLBACK_PREFIX}screen:summary` },
        { text: pickLocale(locale, '🏠 Founder', '🏠 Founder'), callback_data: `${CALLBACK_PREFIX}screen:overview` }
      ],
      [
        { text: pickLocale(locale, '🚨 Проблемы', '🚨 Problems'), callback_data: `${CALLBACK_PREFIX}screen:events` },
        { text: pickLocale(locale, '💬 Отзывы', '💬 Feedback'), callback_data: `${CALLBACK_PREFIX}screen:feedback` }
      ],
      [
        { text: pickLocale(locale, '🧾 Задачи', '🧾 Tasks'), callback_data: `${CALLBACK_PREFIX}screen:tasks` },
        { text: pickLocale(locale, '🚀 Запуск', '🚀 Run'), callback_data: `${CALLBACK_PREFIX}screen:run` }
      ],
      [
        { text: pickLocale(locale, '🛠 Engineer', '🛠 Engineer'), callback_data: `${CALLBACK_PREFIX}screen:engineer` }
      ],
      ...advancedRows,
      ...rerunRows,
      refreshRow
    ]
  };
}

async function collectOverviewData() {
  const { getAirdropResourceSignal, getAmbassadorResourceSignal } = require('./resourceSignals');
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
    getAirdropResourceSignal().catch(() => null),
    getAmbassadorResourceSignal().catch(() => null),
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

function formatProbeMode(resourceState) {
  const probe = resourceState?._probe || null;
  if (!probe) {
    return '';
  }

  if (probe.rateLimited) {
    return ' · probe paused after 429';
  }

  if (probe.stale) {
    return ' · cached';
  }

  return '';
}

function formatTargets(targets, locale = 'ru') {
  if (!targets.length) {
    return pickLocale(locale, 'Пока нет ни одного разрешённого чата.', 'No authorized chats yet.');
  }

  return targets
    .map((target) => {
      const prefix = target.is_owner ? '👑 owner' : pickLocale(locale, '🔔 чат', '🔔 target');
      const label = normalizeValue(target.label) || target.chat_type;
      return `${prefix}: ${label} (${target.chat_id})`;
    })
    .join('\n');
}

function buildRecommendationLines(data, locale = 'ru') {
  const lines = [];

  if (data.airdropState && data.airdropState.hasEnough === false) {
    lines.push(
      pickLocale(
        locale,
        `1. Поднять energy для airdrop-кошелька ${shortenAddress(data.airdropState.walletAddress)}.`,
        `1. Add energy to the airdrop wallet ${shortenAddress(data.airdropState.walletAddress)}.`
      )
    );
  }

  if (data.ambassadorState && data.ambassadorState.hasEnough === false) {
    lines.push(
      pickLocale(
        locale,
        `2. Проверить operator wallet ${shortenAddress(data.ambassadorState.walletAddress)} и его energy.`,
        `2. Check operator wallet ${shortenAddress(data.ambassadorState.walletAddress)} and its energy.`
      )
    );
  }

  if (Number(data.keyPools?.trongrid?.available || 0) === 0) {
    lines.push(
      pickLocale(
        locale,
        '3. Все Trongrid-ключи сейчас упёрлись в лимит. Нужны свежие/запасные ключи.',
        '3. All Trongrid keys are currently rate-limited. Fresh or spare keys are needed.'
      )
    );
  }

  if (data.gasState?.enabled && Number(data.gasState?.operator?.balanceSun || 0) <= 3_000_000) {
    lines.push(
      pickLocale(
        locale,
        '4. У operator wallet маленький запас TRX для топ-апов GasStation.',
        '4. The operator wallet has a small TRX reserve for GasStation top-ups.'
      )
    );
  }

  if (Number(data.screeners?.summary?.fail || 0) > 0) {
    lines.push(
      pickLocale(
        locale,
        '5. Один или несколько реальных app-flow уже падают. Откройте раздел «Скринер».',
        '5. One or more real app flows are already failing. Open the Screeners section.'
      )
    );
  } else if (Number(data.screeners?.summary?.warn || 0) > 0) {
    lines.push(
      pickLocale(
        locale,
        '5. Есть flow под давлением. Лучше заранее посмотреть раздел «Скринер».',
        '5. A flow is under pressure. It is better to review the Screeners section early.'
      )
    );
  }

  if (!lines.length) {
    lines.push(
      pickLocale(
        locale,
        'Срочных красных действий не вижу. Можно просто иногда поглядывать на события.',
        'I do not see urgent red actions right now. You can just keep an eye on events.'
      )
    );
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
    `${english ? 'Mode' : 'Режим'}: ${normalizeValue(digest?.mode) === 'openai' ? (english ? 'GPT analysis' : 'GPT-анализ') : (english ? 'reliable fallback' : 'надёжный fallback')} • ${english ? 'updated' : 'обновлено'} ${formatRelativeMinutes(digest?.generatedAt, locale)}`,
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

async function buildOverviewText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const english = isEnglish(locale);
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
      pickLocale(locale, '🏠 4TEEN Ops', '🏠 4TEEN Ops'),
      pickLocale(locale, 'Коротко и по-человечески: вот что вижу прямо сейчас.', 'Short and human: this is what I see right now.')
    ),
    `${statusIcon(data.dbOk)} ${pickLocale(locale, 'API и база', 'API and database')}: ${data.dbOk ? pickLocale(locale, 'живы', 'healthy') : pickLocale(locale, 'есть проблема с базой', 'database issue detected')}`,
    `${statusIcon(clockPayload?.status === 'ok', clockPayload?.status !== 'ok')} Clock: ${
      clockPayload?.status === 'ok' ? pickLocale(locale, 'работает', 'running') : pickLocale(locale, 'надо проверить', 'needs attention')
    } (${formatRelativeMinutes(clockPayload?.heartbeatAt || data.clockState?.updated_at, locale)})`,
    `${statusIcon(!airdropWarn, airdropWarn)} ${pickLocale(locale, 'Airdrop wallet', 'Airdrop wallet')}: ${
      airdropWarn ? pickLocale(locale, 'ресурсов не хватает', 'not enough resources') : pickLocale(locale, 'по ресурсам всё ок', 'resources look fine')
    }`,
    `${statusIcon(!ambassadorWarn, ambassadorWarn)} ${pickLocale(locale, 'Operator wallet', 'Operator wallet')}: ${
      ambassadorWarn ? pickLocale(locale, 'ресурсов не хватает для ambassador flow', 'not enough resources for ambassador flow') : pickLocale(locale, 'по ресурсам всё ок', 'resources look fine')
    }`,
    `${statusIcon(!anyKeysWarn, anyKeysWarn)} ${pickLocale(locale, 'Ключи провайдеров', 'Provider keys')}: ${
      anyKeysWarn ? pickLocale(locale, 'часть ключей под давлением', 'some keys are under pressure') : pickLocale(locale, 'запас нормальный', 'pool looks healthy')
    }`,
    `${screenerStatusIcon(
      Number(data.screeners?.summary?.fail || 0) > 0
        ? 'fail'
        : Number(data.screeners?.summary?.warn || 0) > 0
          ? 'warn'
          : 'ok'
    )} ${pickLocale(locale, 'Реальные app-flow', 'Real app flows')}: ${buildScreenerStateSummary(data.screeners, locale)}`,
    `${openEvents > 0 ? '🟠' : '🟢'} ${pickLocale(locale, 'Открытых событий', 'Open events')}: ${openEvents}`,
    '',
    pickLocale(locale, 'Что я бы рекомендовал сейчас:', 'What I would do next:'),
    ...(english
      ? [
          data.dbOk ? '1. Database is fine.' : '1. Database needs attention first.',
          clockPayload?.status === 'ok' ? '2. Clock heartbeat is fresh.' : '2. Check the clock worker first.',
          airdropWarn ? '3. Top up resources for the airdrop wallet.' : '3. Airdrop wallet resources are okay.',
          ambassadorWarn ? '4. Top up operator resources for ambassador flow.' : '4. Operator wallet resources are okay.',
          Number(data.screeners?.summary?.fail || 0) > 0
            ? '5. One or more real app flows are failing. Open Screeners.'
            : Number(data.screeners?.summary?.warn || 0) > 0
              ? '5. Some flows are under pressure. Screeners are worth checking now.'
              : '5. No urgent red actions right now.'
        ]
      : buildRecommendationLines(data, locale))
  ].join('\n');
}

async function buildEngineerText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const data = await collectOverviewData();
  const clockPayload = data.clockState?.value_json || {};
  const siteIssues = listClockSiteIssues(clockPayload);
  const anyKeyPressure =
    Number(data.keyPools?.trongrid?.coolingDown || 0) > 0 ||
    Number(data.keyPools?.tronscan?.coolingDown || 0) > 0 ||
    Number(data.keyPools?.cmc?.coolingDown || 0) > 0;

  return [
    buildHeader(pickLocale(locale, '🛠 Engineer View', '🛠 Engineer View'), pickLocale(locale, 'Здесь уже не founder-картинка, а инженерный разрез по системам.', 'This is the engineering cut, not the founder summary.')),
    `🕒 ${pickLocale(locale, 'Clock сейчас смешанный: wallet workers + site snapshot refresh', 'Clock is mixed right now: wallet workers + site snapshot refresh')} (${formatRelativeMinutes(clockPayload?.heartbeatAt || data.clockState?.updated_at, locale)})`,
    `⚙️ ${pickLocale(locale, 'Wallet workers', 'Wallet workers')}: ${buildClockWalletOpsSummary(clockPayload, locale)}`,
    `🌐 ${pickLocale(locale, 'Site refresh внутри clock', 'Site refresh inside clock')}: ${buildClockSiteSummary(clockPayload, locale)}`,
    `${statusIcon(data.dbOk)} ${pickLocale(locale, 'База', 'Database')}: ${data.dbOk ? 'ok' : pickLocale(locale, 'падает', 'failing')}`,
    `${statusIcon(Number(data.screeners?.summary?.fail || 0) === 0, Number(data.screeners?.summary?.fail || 0) > 0)} Screeners: ${buildScreenerStateSummary(data.screeners, locale)}`,
    `${statusIcon(!anyKeyPressure, anyKeyPressure)} ${pickLocale(locale, 'Provider keys', 'Provider keys')}: ${anyKeyPressure ? pickLocale(locale, 'есть cooldown/pressure', 'cooldown/pressure is present') : pickLocale(locale, 'без явного pressure', 'no visible pressure')}`,
    '',
    pickLocale(locale, 'Что это значит:', 'What this means:'),
    pickLocale(locale, '1. Шум вокруг clock не только про кошелёк. Там реально сидит и сайтовый refresh.', '1. Clock noise is not only about the wallet. Site refresh really lives there too.'),
    pickLocale(locale, '2. Если в clock всё зелёное, а сайт шумит, это ещё не значит, что mobile/app-flow болит.', '2. If clock looks green but the website is noisy, that does not automatically mean the app flow is unhealthy.'),
    ...(siteIssues.length ? ['', `${pickLocale(locale, 'Сейчас по site-refresh выделяются', 'Site refresh issues right now')}: ${siteIssues.join(', ')}`] : [])
  ].join('\n');
}

async function buildScreenerText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const { getSyntheticScreenerSnapshot } = getScreenerService();
  const snapshot = await getSyntheticScreenerSnapshot().catch(() => null);
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const summary = snapshot?.summary || {};
  const checkedAt = snapshot?.checkedAt ? formatRelativeMinutes(snapshot.checkedAt, locale) : pickLocale(locale, 'ещё не запускался', 'not run yet');

  if (!items.length) {
    return [
      buildHeader(
        pickLocale(locale, '🧪 Реальный скринер', '🧪 Real screeners'),
        pickLocale(locale, 'Это проверка глазами пользователя, а не просто healthcheck сервера.', 'This is a user-visible flow check, not just a server healthcheck.')
      ),
      pickLocale(locale, '⚪ Скринер ещё не запускался.', '⚪ Screeners have not run yet.'),
      '',
      pickLocale(locale, 'Нажмите кнопку «Прогнать скринер сейчас», и я проверю ключевые app-flow.', 'Press “Run screener now” and I will check the key app flows.')
    ].join('\n');
  }

  return [
    buildHeader(pickLocale(locale, '🧪 Реальный скринер', '🧪 Real screeners'), pickLocale(locale, 'Показываю, проходят ли ключевые сценарии приложения целиком.', 'This shows whether the key user flows actually pass end-to-end.')),
    `${pickLocale(locale, 'Последний прогон', 'Last run')}: ${checkedAt}`,
    `${pickLocale(locale, 'Итог', 'Result')}: ${buildScreenerStateSummary(snapshot, locale)}`,
    '',
    ...items.map((item) => {
      const meta = item?.meta && typeof item.meta === 'object' ? item.meta : null;
      const address = meta?.walletAddress ? ` (${shortenAddress(meta.walletAddress)})` : '';
      return [
        `${screenerStatusIcon(item.status)} ${normalizeValue(item.label)}${address}`,
        normalizeValue(item.summary),
        `${pickLocale(locale, 'Что это значит', 'What this means')}: ${normalizeValue(item.recommendation) || pickLocale(locale, 'Это один из сценариев, который пользователь чувствует сразу.', 'This is one of the flows users feel immediately.')}`
      ].join('\n');
    }),
    '',
    pickLocale(locale, 'Как читать экран:', 'How to read this screen:'),
    pickLocale(locale, '1. Красный — сценарий уже сломан.', '1. Red means the flow is already broken.'),
    pickLocale(locale, '2. Оранжевый — ещё живо, но пользователь скоро почувствует деградацию.', '2. Orange means the flow still works, but users will feel degradation soon.'),
    pickLocale(locale, '3. Зелёный — путь проходит целиком.', '3. Green means the whole path passes.')
  ].join('\n');
}

async function buildHealthText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const data = await collectOverviewData();
  const clockPayload = data.clockState?.value_json || {};
  const operator = data.gasState?.operator || null;
  const gasStation = data.gasState?.gasStation || null;
  const gasStationEnabled = Boolean(data.gasState?.enabled);
  const gasStationWarn = gasStationEnabled && !gasStation;
  const gasStationError = shortenText(data.gasState?.gasStationError, 140);

  return [
    buildHeader(pickLocale(locale, '🩺 Здоровье системы', '🩺 System health'), pickLocale(locale, 'Не технично, а по сути: где спокойно, а где уже больно.', 'High signal only: where things are calm and where they already hurt.')),
    `${statusIcon(data.dbOk)} ${pickLocale(locale, 'База данных', 'Database')}: ${data.dbOk ? pickLocale(locale, 'отвечает', 'responding') : pickLocale(locale, 'не отвечает', 'not responding')}`,
    `${statusIcon(clockPayload?.status === 'ok', clockPayload?.status !== 'ok')} Clock: ${
      clockPayload?.status === 'ok' ? pickLocale(locale, 'тикнул нормально', 'heartbeat is healthy') : pickLocale(locale, 'нужна проверка', 'needs checking')
    } (${formatRelativeMinutes(clockPayload?.heartbeatAt || data.clockState?.updated_at, locale)})`,
    `${statusIcon(data.airdropState?.hasEnough === true, data.airdropState?.hasEnough === false)} Airdrop wallet ${shortenAddress(
      data.airdropState?.walletAddress
    )}: energy ${Number(data.airdropState?.energyAvailable || 0)}, bandwidth ${Number(data.airdropState?.bandwidthAvailable || 0)}${formatProbeMode(data.airdropState)}`,
    `${statusIcon(data.ambassadorState?.hasEnough === true, data.ambassadorState?.hasEnough === false)} Operator wallet ${shortenAddress(
      data.ambassadorState?.walletAddress
    )}: energy ${Number(data.ambassadorState?.energyAvailable || 0)}, bandwidth ${Number(data.ambassadorState?.bandwidthAvailable || 0)}${formatProbeMode(data.ambassadorState)}`,
    `${statusIcon(gasStationEnabled && !gasStationWarn, gasStationWarn || !gasStationEnabled)} GasStation: ${
      gasStationEnabled ? (gasStationWarn ? pickLocale(locale, 'включён, но баланс сейчас не дочитался', 'enabled, but the balance could not be read') : pickLocale(locale, 'включён', 'enabled')) : pickLocale(locale, 'выключен', 'disabled')
    }`,
    operator
      ? `💰 Operator TRX: ${operator.balanceTrx} TRX`
      : pickLocale(locale, '💰 Operator TRX: не удалось прочитать', '💰 Operator TRX: could not be read'),
    gasStation
      ? `${pickLocale(locale, '🏦 Баланс GasStation', '🏦 GasStation balance')}: ${gasStation.balanceTrx} TRX ${pickLocale(locale, 'на аккаунте', 'on account')} ${normalizeValue(gasStation.account) || '—'}`
      : `${pickLocale(locale, '🏦 Баланс GasStation: не удалось прочитать', '🏦 GasStation balance: could not be read')}${gasStationError ? ` (${gasStationError})` : ''}`,
    '',
    pickLocale(locale, 'Подсказка:', 'Quick advice:'),
    ...(isEnglish(locale) ? [
      data.airdropState?.hasEnough === false ? '1. Airdrop wallet needs resources.' : '1. Airdrop wallet is okay.',
      data.ambassadorState?.hasEnough === false ? '2. Operator wallet needs resources for ambassador flow.' : '2. Operator wallet is okay.',
      gasStationWarn ? '3. GasStation metrics need a re-check.' : '3. GasStation metrics are readable.'
    ] : buildRecommendationLines(data, locale))
  ].join('\n');
}

async function buildKeysText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const { keyPools, gasPool } = await collectOverviewData();

  const gasLines = Array.isArray(gasPool?.credentials)
    ? gasPool.credentials.map((item) => {
        const state = item.state || {};
        const status = state.lastErrorAt
          ? pickLocale(locale, `🟠 была ошибка ${formatRelativeMinutes(state.lastErrorAt, locale)}`, `🟠 last error ${formatRelativeMinutes(state.lastErrorAt, locale)}`)
          : state.lastSuccessAt
            ? pickLocale(locale, `🟢 последний успех ${formatRelativeMinutes(state.lastSuccessAt, locale)}`, `🟢 last success ${formatRelativeMinutes(state.lastSuccessAt, locale)}`)
            : pickLocale(locale, '⚪ пока без истории', '⚪ no history yet');
        return `• ${item.label}: ${status}`;
      })
    : [];

  return [
    buildHeader(pickLocale(locale, '🔑 Ключи и лимиты', '🔑 Keys and limits'), pickLocale(locale, 'Сюда удобно смотреть, когда приложение внезапно начинает тупить из-за провайдеров.', 'Open this first when the app starts degrading because of providers.')),
    formatKeyPoolLine('trongrid', keyPools.trongrid, locale),
    formatKeyPoolLine('tronscan', keyPools.tronscan, locale),
    formatKeyPoolLine('cmc', keyPools.cmc, locale),
    '',
    'GasStation credentials:',
    ...(gasLines.length ? gasLines : [pickLocale(locale, '• пока не вижу настроенных credential-ов', '• no configured credentials yet')]),
    '',
    pickLocale(locale, 'Если здесь краснеет:', 'If this goes red:'),
    pickLocale(locale, '1. Сначала проверь лимиты и cooldown.', '1. Check limits and cooldown first.'),
    pickLocale(locale, '2. Потом посмотри, не умер ли один конкретный ключ/credential.', '2. Then check whether one specific key or credential died.'),
    pickLocale(locale, '3. Если красное держится долго, значит запасных ключей мало.', '3. If the warning stays for long, your spare pool is too small.')
  ].join('\n');
}

async function buildEventsText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const events = await listRecentEvents(8, { onlyOpen: true }).catch(() => []);

  if (!events.length) {
    return [
      buildHeader(
        pickLocale(locale, '🚨 Активные события', '🚨 Active events'),
        pickLocale(locale, 'Сейчас тут пусто, и это хороший знак.', 'This section is empty right now, which is a good sign.')
      ),
      pickLocale(locale, '🟢 Открытых проблем не вижу.', '🟢 No open problems right now.')
    ].join('\n');
  }

  return [
    buildHeader(pickLocale(locale, '🚨 Активные события', '🚨 Active events'), pickLocale(locale, 'Самое важное сверху. Без сухого лога, только суть.', 'The most important issues first. No dry logs, just signal.')),
    ...events.map((event) => {
      const icon = severityIcon(event.severity);
      const count = Number(event.count || 0);
      return `${icon} ${event.title}\n${pickLocale(locale, 'Источник', 'Source')}: ${normalizeValue(event.source)} • ${pickLocale(locale, 'повторов', 'repeats')}: ${count}\n${buildEventRecommendation(event, locale)}`;
    })
  ].join('\n');
}

async function buildFeedbackText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const events = await listRecentEvents(20, { onlyOpen: false }).catch(() => []);
  const feedbackEvents = events.filter(
    (event) =>
      normalizeValue(event?.source) === 'app-feedback' &&
      normalizeValue(event?.category) === 'feedback'
  );

  if (!feedbackEvents.length) {
    return [
      buildHeader(
        pickLocale(locale, '💬 Feedback из кошелька', '💬 Wallet feedback'),
        pickLocale(locale, 'Здесь будут живые отзывы прямо из приложения.', 'Live feedback from the app will show up here.')
      ),
      pickLocale(locale, 'Пока пусто. Когда кто-то нажмёт feedback в кошельке, я покажу это здесь.', 'Nothing here yet. When someone sends feedback from the wallet, I will show it here.')
    ].join('\n');
  }

  const openCount = feedbackEvents.filter((event) => !event.resolved_at).length;
  const issueCount = feedbackEvents.filter((event) => normalizeValue(event?.type) === 'app_issue').length;
  const confusingCount = feedbackEvents.filter((event) => normalizeValue(event?.type) === 'app_confusing').length;
  const slowCount = feedbackEvents.filter((event) => normalizeValue(event?.type) === 'app_slow').length;
  const ideaCount = feedbackEvents.filter((event) => normalizeValue(event?.type) === 'app_idea').length;
  const praiseCount = feedbackEvents.filter((event) => normalizeValue(event?.type) === 'app_praise').length;

  return [
    buildHeader(
      pickLocale(locale, '💬 Feedback из кошелька', '💬 Wallet feedback'),
      pickLocale(locale, 'Не логи, а живой голос пользователя: что раздражает, где тупит и что нравится.', 'Not logs, but the user voice: what annoys them, what feels slow, and what they like.')
    ),
    `${pickLocale(locale, 'Сейчас ждут внимания', 'Waiting for attention now')}: ${openCount}`,
    `${pickLocale(locale, 'Срез последних отзывов', 'Latest feedback mix')}: 🚨 ${issueCount} • 🤔 ${confusingCount} • 🐢 ${slowCount} • 💡 ${ideaCount} • ❤️ ${praiseCount}`,
    '',
    ...feedbackEvents.slice(0, 6).map((event) => {
      const meta = feedbackTypeMeta(event?.type, locale);
      const details = parseJson(event?.details_json, {});
      const sourceScreen = normalizeValue(details?.sourceScreen) || 'unknown';
      const appVersion = normalizeValue(details?.appVersion) || 'unknown';
      const walletAddress = normalizeValue(details?.walletAddressMasked);
      const walletLine = walletAddress ? pickLocale(locale, ` • кошелёк ${walletAddress}`, ` • wallet ${walletAddress}`) : '';
      const count = Number(event?.count || 0);
      const repeatLine = count > 1 ? pickLocale(locale, ` • повторов ${count}`, ` • repeats ${count}`) : '';

      return [
        `${meta.icon} ${normalizeValue(event?.title) || meta.label}`,
        `${pickLocale(locale, 'Статус', 'Status')}: ${feedbackStatusLabel(event, locale)} • ${meta.label} • ${formatRelativeMinutes(event?.last_seen_at, locale)}`,
        `${pickLocale(locale, 'Экран', 'Screen')}: ${sourceScreen} • ${pickLocale(locale, 'версия', 'version')} ${appVersion}${walletLine}${repeatLine}`,
        `${pickLocale(locale, 'Что человек сказал', 'What the person said')}: ${shortenText(event?.message, 220)}`,
        buildEventRecommendation(event, locale)
      ].join('\n');
    }),
    '',
    pickLocale(locale, 'Как читать этот экран:', 'How to read this screen:'),
    pickLocale(locale, '1. 🚨 🤔 🐢 — это полезные сигналы, на них лучше смотреть первыми.', '1. 🚨 🤔 🐢 are the most actionable signals, so start with them.'),
    pickLocale(locale, '2. 💡 и ❤️ я тоже храню, но они не шумят в активных алертах.', '2. 💡 and ❤️ are stored too, but they do not pollute active alerts.'),
    pickLocale(locale, '3. Если один и тот же отзыв повторяется, значит проблема уже не случайная.', '3. If the same feedback repeats, the issue is no longer random.')
  ].join('\n');
}

async function buildNotesText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const notes = await listProductNotes(8, { onlyOpen: true }).catch(() => []);

  if (!notes.length) {
    return [
      buildHeader(
        pickLocale(locale, '📝 План следующей версии', '📝 Next release plan'),
        pickLocale(locale, 'Сюда я складываю ваши идеи, фиксы и голосовые заметки.', 'This is where I put your ideas, fixes, and voice notes.')
      ),
      pickLocale(locale, 'Пока пусто.', 'Nothing here yet.'),
      '',
      pickLocale(locale, 'Как быстро добавить:', 'How to add quickly:'),
      pickLocale(locale, '1. Напишите /note и дальше текстом мысль.', '1. Send /note followed by your thought.'),
      pickLocale(locale, '2. Или пришлите голосовое в личку owner-чата, я превращу его в backlog item.', '2. Or send a voice note in the owner chat and I will turn it into a backlog item.')
    ].join('\n');
  }

  return [
    buildHeader(
      pickLocale(locale, '📝 План следующей версии', '📝 Next release plan'),
      pickLocale(locale, 'Это ваш живой backlog: что менять дальше, а не просто шум в чате.', 'This is your live backlog: what to change next, not just chat noise.')
    ),
    `${pickLocale(locale, 'Открытых заметок', 'Open notes')}: ${notes.length}`,
    '',
    ...notes.map((note) => {
      const meta = productNoteMeta(note);
      return [
        `${meta.typeIcon} ${meta.priorityIcon} ${normalizeValue(note?.title) || pickLocale(locale, 'Без названия', 'Untitled')}`,
        `${pickLocale(locale, 'Тип', 'Type')}: ${meta.typeLabel} • ${pickLocale(locale, 'статус', 'status')}: ${normalizeValue(note?.status) || 'open'} • ${pickLocale(locale, 'обновлено', 'updated')} ${formatRelativeMinutes(note?.updated_at, locale)}`,
        shortenText(note?.body, 220)
      ].join('\n');
    }),
    '',
    pickLocale(locale, 'Подсказка:', 'Tip:'),
    pickLocale(locale, 'Если мысль прилетела голосом, просто отправьте её сюда. Я распознаю текст и сохраню как заметку.', 'If the idea comes as voice, just send it here. I will transcribe it and save it as a note.')
  ].join('\n');
}

async function buildTasksText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const tasks = await listTasks(10, {
    includeDone: false
  }).catch(() => []);

  if (!tasks.length) {
    return [
      buildHeader(
        pickLocale(locale, '🧾 Рабочие задачи', '🧾 Working tasks'),
        pickLocale(locale, 'Здесь живут уже не мысли, а нормальные тикеты для движения вперёд.', 'This is no longer ideas, but real tickets to move things forward.')
      ),
      pickLocale(locale, 'Сейчас открытых задач нет.', 'There are no open tasks right now.'),
      '',
      pickLocale(locale, 'Как они появляются:', 'How tasks appear:'),
      pickLocale(locale, '1. Из ваших заметок и голосовых сообщений.', '1. From your notes and voice messages.'),
      pickLocale(locale, '2. Из инцидентов, которые вы руками помечаете в личке.', '2. From incidents you flag manually in the private chat.'),
      pickLocale(locale, '3. Позже сюда можно будет слать и auto-task из feedback/monitor.', '3. Later this can also receive auto-tasks from feedback and monitoring.')
    ].join('\n');
  }

  return [
    buildHeader(
      pickLocale(locale, '🧾 Рабочие задачи', '🧾 Working tasks'),
      pickLocale(locale, 'Это уже operational/task board, а не просто backlog мыслей.', 'This is an operational task board, not just an idea backlog.')
    ),
    `${pickLocale(locale, 'Открытых задач', 'Open tasks')}: ${tasks.length}`,
    '',
    ...tasks.map((task) => {
      const meta = taskStatusMeta(task);
      return [
        `${meta.statusIcon} ${meta.priorityIcon} #${task.id} ${normalizeValue(task?.title) || pickLocale(locale, 'Без названия', 'Untitled')}`,
        `${pickLocale(locale, 'Статус', 'Status')}: ${meta.status} • ${pickLocale(locale, 'тип', 'type')}: ${meta.type} • ${pickLocale(locale, 'обновлено', 'updated')} ${formatRelativeMinutes(task?.updated_at, locale)}`,
        shortenText(task?.body, 220)
      ].join('\n');
    }),
    '',
    pickLocale(locale, 'Быстрые действия:', 'Quick actions:'),
    pickLocale(locale, '1. /take 123 — взять задачу в работу.', '1. /take 123 — start working on a task.'),
    pickLocale(locale, '2. /done 123 — закрыть задачу.', '2. /done 123 — close a task.'),
    pickLocale(locale, '3. /block 123 причина — пометить блокер.', '3. /block 123 reason — mark a blocker.'),
    pickLocale(locale, '4. /todo 123 — вернуть задачу в очередь для Codex.', '4. /todo 123 — return a task to the Codex queue.'),
    pickLocale(locale, '5. /codex 123 — запустить Codex job по задаче.', '5. /codex 123 — run a Codex job for a task.')
  ].join('\n');
}

async function buildJobsText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const jobs = await listCodexJobs(8).catch(() => []);

  if (!jobs.length) {
    return [
      buildHeader('🤖 Codex Jobs', pickLocale(locale, 'Здесь видно, что уже гонялось через codex-слой.', 'This shows what has already run through the Codex layer.')),
      pickLocale(locale, 'Пока ни одного job не запускали.', 'No jobs have been run yet.'),
      '',
      pickLocale(locale, 'Старт: /codex 12', 'Start with: /codex 12')
    ].join('\n');
  }

  return [
    buildHeader('🤖 Codex Jobs', pickLocale(locale, 'Это не просто задача, а конкретный прогон codex-анализа по репо-контексту.', 'This is not just a task, but a concrete Codex analysis run against repo context.')),
    ...jobs.map((job) => {
      const status = normalizeValue(job?.status) || 'unknown';
      const icon =
        status === 'done' ? '✅' :
        status === 'blocked' ? '⛔' :
        status === 'failed' ? '🔴' :
        status === 'running' ? '🛠️' : '🕓';

      return [
        `${icon} Job #${job.id} -> Task #${Number(job.task_id || 0)}`,
        `${pickLocale(locale, 'Статус', 'Status')}: ${status} • ${pickLocale(locale, 'модель', 'model')}: ${normalizeValue(job.model) || '—'} • ${pickLocale(locale, 'обновлено', 'updated')} ${formatRelativeMinutes(job.updated_at, locale)}`,
        normalizeValue(job.error_message)
          ? `${pickLocale(locale, 'Ошибка', 'Error')}: ${shortenText(job.error_message, 180)}`
          : shortenText(job.response_text, 200) || pickLocale(locale, 'Пока без текста результата.', 'No result text yet.')
      ].join('\n');
    })
  ].join('\n');
}

async function buildRunText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const [tasks, awaitingConfirmation, confirmed, running, jobs] = await Promise.all([
    listTasks(20, { includeDone: false }).catch(() => []),
    listExecutionRequests(6, { status: 'awaiting_confirmation' }).catch(() => []),
    listExecutionRequests(6, { status: 'confirmed' }).catch(() => []),
    listExecutionRequests(6, { status: 'running' }).catch(() => []),
    listCodexJobs(4).catch(() => [])
  ]);

  const readyForCodex = tasks.filter((task) => normalizeValue(task?.status) === 'ready_for_codex').length;
  const inProgress = tasks.filter((task) => normalizeValue(task?.status) === 'in_progress').length;
  const blocked = tasks.filter((task) => normalizeValue(task?.status) === 'blocked').length;
  const latestJob = jobs[0] || null;

  return [
    buildHeader('🚀 Run & Delivery', pickLocale(locale, 'Здесь путь от задачи до реального code-run, а не просто список тикетов.', 'This is the path from a task to a real code run, not just a ticket list.')),
    `🧾 ${pickLocale(locale, 'Открытых задач', 'Open tasks')}: ${tasks.length} • ready_for_codex ${readyForCodex} • in_progress ${inProgress} • blocked ${blocked}`,
    `🔐 ${pickLocale(locale, 'Ждут 6-значного подтверждения', 'Waiting for 6-digit confirmation')}: ${awaitingConfirmation.length}`,
    `⏳ ${pickLocale(locale, 'Подтверждены и ждут runner', 'Confirmed and waiting for runner')}: ${confirmed.length}`,
    `🛠 ${pickLocale(locale, 'Сейчас выполняются', 'Running now')}: ${running.length}`,
    latestJob
      ? `🤖 ${pickLocale(locale, 'Последний Codex job', 'Latest Codex job')}: #${latestJob.id} • task #${Number(latestJob.task_id || 0)} • ${normalizeValue(latestJob.status) || 'unknown'}`
      : pickLocale(locale, '🤖 Codex jobs пока не запускались.', '🤖 Codex jobs have not run yet.'),
    '',
    pickLocale(locale, 'Как пользоваться без командной каши:', 'How to use it without command overload:'),
    pickLocale(locale, '1. Просто напишите: выполни задачу 12 в приложении.', '1. Just write: run task 12 in the app.'),
    pickLocale(locale, '2. Повторите 6 цифр.', '2. Repeat the 6 digits.'),
    pickLocale(locale, '3. Потом, если всё ок: запушь задачу 12 или задеплой задачу 12.', '3. Then, if all looks good: publish task 12 or deploy task 12.'),
    '',
    pickLocale(locale, 'Важно:', 'Important:'),
    pickLocale(locale, 'Runner у вас уже умеет apply/publish, а deploy всё ещё должен вести себя осторожно и может честно уйти в blocked.', 'Your runner already supports apply and publish, while deploy still behaves carefully and may honestly return blocked.')
  ].join('\n');
}

async function buildKnowledgeText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const status = await getKnowledgeBaseStatus().catch(() => null);

  if (!status?.configured) {
    return [
      buildHeader(
        pickLocale(locale, '📚 Память бота', '📚 Bot memory'),
        pickLocale(locale, 'Это база знаний по проекту: доки, backlog и карта репо.', 'This is the project knowledge base: docs, backlog, and repo map.')
      ),
      pickLocale(locale, '⚪ OpenAI-слой для knowledge base пока не настроен.', '⚪ The OpenAI layer for the knowledge base is not configured yet.'),
      '',
      pickLocale(locale, 'Когда он включён, бот может лучше отвечать на вопросы вроде:', 'When enabled, the bot can answer questions like:'),
      pickLocale(locale, '1. Где это живёт в коде?', '1. Where does this live in the code?'),
      pickLocale(locale, '2. Что уже планировали на следующий релиз?', '2. What was already planned for the next release?'),
      pickLocale(locale, '3. Какие экраны и маршруты связаны с проблемой?', '3. Which screens and routes are connected to the issue?')
    ].join('\n');
  }

  const includedFiles = Array.isArray(status?.includedFiles) ? status.includedFiles : [];
  const summary = status?.summary || {};
  const ready = normalizeValue(status?.fileStatus).toLowerCase() === 'completed';

  return [
    buildHeader(
      pickLocale(locale, '📚 Память бота', '📚 Bot memory'),
      pickLocale(locale, 'Здесь видно, что именно бот помнит о проекте помимо live-алертов.', 'This shows what the bot remembers about the project beyond live alerts.')
    ),
    `${ready ? '🟢' : '🟠'} ${pickLocale(locale, 'Состояние индекса', 'Index status')}: ${normalizeValue(status?.fileStatus) || pickLocale(locale, 'ещё не синхронизирован', 'not synced yet')}`,
    `🗂️ Vector store: ${shortenId(status?.vectorStoreId)}`,
    `🕒 ${pickLocale(locale, 'Последняя синхронизация', 'Last sync')}: ${status?.lastSyncedAt ? formatRelativeMinutes(status.lastSyncedAt, locale) : pickLocale(locale, 'ещё не было', 'never')}`,
    `📄 ${pickLocale(locale, 'Последний файл', 'Last file')}: ${normalizeValue(status?.lastFilename) || pickLocale(locale, 'ещё не загружался', 'nothing uploaded yet')}`,
    '',
    pickLocale(locale, 'Что внутри сейчас:', 'What is inside right now:'),
    `1. Product notes: ${Number(summary.productNotes || 0)}`,
    `2. Markdown docs: ${Number(summary.docs || 0)}`,
    `3. Mobile screens: ${Number(summary.mobileScreens || 0)}`,
    `4. API routes: ${Number(summary.apiRoutes || 0)}`,
    `5. Ops services: ${Number(summary.opsServices || 0)}`,
    `6. Tasks: ${Number(summary.tasks || 0)}`,
    '',
    includedFiles.length
      ? `${pickLocale(locale, 'Последние включённые docs', 'Latest included docs')}: ${includedFiles.slice(0, 4).map((item) => '/' + item).join(', ')}`
      : pickLocale(locale, 'Документных источников пока не зафиксировано в состоянии синка.', 'No document sources are recorded in the sync state yet.'),
    '',
    pickLocale(locale, 'Это не заменяет live-данные, а помогает боту помнить контекст проекта и релизов.', 'This does not replace live data, but it helps the bot remember project and release context.')
  ].join('\n');
}

async function buildQueuesText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const { clockState, events } = await collectOverviewData();

  const clockPayload = clockState?.value_json || {};
  const walletSummary = buildClockWalletOpsSummary(clockPayload);
  const siteSummary = buildClockSiteSummary(clockPayload);
  const siteIssues = listClockSiteIssues(clockPayload);

  return [
    buildHeader(
      pickLocale(locale, '📦 Очереди и фоновые задачи', '📦 Queues and background work'),
      pickLocale(locale, 'Здесь я уже отдельно показываю wallet work и сайтовый шум, чтобы не путать одно с другим.', 'Here I separate wallet work from website noise so they do not get mixed together.')
    ),
    `⚙️ ${pickLocale(locale, 'Wallet workers за последний tick', 'Wallet workers in the last tick')}: ${buildClockWalletOpsSummary(clockPayload, locale)}`,
    `🌐 ${pickLocale(locale, 'Site snapshot refresh в том же clock', 'Site snapshot refresh in the same clock')}: ${buildClockSiteSummary(clockPayload, locale)}`,
    `🚨 ${pickLocale(locale, 'Открытых событий сейчас', 'Open events right now')}: ${events.length}`,
    '',
    pickLocale(locale, 'Важно:', 'Important:'),
    pickLocale(locale, '1. Этот clock смешанный: он обслуживает и wallet background work, и сайтовые snapshots.', '1. This clock is mixed: it handles both wallet background work and website snapshots.'),
    pickLocale(locale, '2. Поэтому часть шума здесь реально относится к сайту, а не к mobile/app-flow.', '2. That is why some of the noise here really belongs to the website, not the mobile app flow.'),
    ...(siteIssues.length ? [pickLocale(locale, `3. Сейчас сайтовый хвост: ${siteIssues.join(', ')}`, `3. Current website tail: ${siteIssues.join(', ')}`)] : [pickLocale(locale, '3. Явного сайтового хвоста в последнем tick не видно.', '3. No obvious website tail is visible in the last tick.')]),
    '',
    pickLocale(locale, 'Если wallet-цифры растут, а события не закрываются:', 'If wallet metrics rise while events stay open:'),
    pickLocale(locale, '1. Смотри раздел «События».', '1. Check the Events section.'),
    pickLocale(locale, '2. Потом «Здоровье».', '2. Then check Health.'),
    pickLocale(locale, '3. Обычно корень проблемы там, а не в самой очереди.', '3. The root cause is usually there, not in the queue itself.')
  ].join('\n');
}

async function buildTargetsText(options = {}) {
  const locale = normalizeLocale(options?.locale);
  const targets = await listActiveTelegramTargets();
  const owner = await getOwnerTelegramTarget();

  return [
    buildHeader(
      pickLocale(locale, '👥 Чаты и уведомления', '👥 Chats and notifications'),
      pickLocale(locale, 'Куда бот имеет право писать сейчас.', 'Where the bot is allowed to write right now.')
    ),
    formatTargets(targets, locale),
    '',
    owner
      ? `${pickLocale(locale, 'Главный owner', 'Primary owner')}: ${normalizeValue(owner.label) || owner.chat_id}`
      : pickLocale(locale, 'Owner пока не привязан.', 'Owner is not linked yet.'),
    '',
    pickLocale(locale, 'Как добавить группу позже:', 'How to add a group later:'),
    pickLocale(locale, '1. Добавьте туда бота.', '1. Add the bot to the group.'),
    pickLocale(locale, '2. Напишите в группе /allow_here именно с вашего owner-аккаунта.', '2. Send /allow_here in that group from your owner account.'),
    pickLocale(locale, '3. После этого бот сможет слать туда алерты.', '3. After that, the bot will be able to send alerts there.')
  ].join('\n');
}

async function buildScreenText(screen, options = {}) {
  if (screen === 'summary') return buildSummaryText(options);
  if (screen === 'overview') return buildOverviewText(options);
  if (screen === 'engineer') return buildEngineerText(options);
  if (screen === 'run') return buildRunText(options);
  if (screen === 'screen') return buildScreenerText(options);
  if (screen === 'health') return buildHealthText(options);
  if (screen === 'events') return buildEventsText(options);
  if (screen === 'feedback') return buildFeedbackText(options);
  if (screen === 'knowledge') return buildKnowledgeText(options);
  if (screen === 'jobs') return buildJobsText(options);
  if (screen === 'notes') return buildNotesText(options);
  if (screen === 'tasks') return buildTasksText(options);
  if (screen === 'keys') return buildKeysText(options);
  if (screen === 'queues') return buildQueuesText(options);
  if (screen === 'targets') return buildTargetsText(options);
  return buildOverviewText(options);
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
  const locale = normalizeLocale(options?.locale || (await getChatLocale(chatId)));
  const text = await buildScreenText(safeScreen, {
    ...options,
    locale
  });
  const replyMarkup = buildMenuMarkup(safeScreen, {
    locale
  });

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

function extractConfirmationCode(text) {
  const safe = normalizeValue(text);
  if (!safe) {
    return '';
  }

  const direct = safe.match(/^(?:\/confirm\s+)?(\d{6})$/i);
  if (direct?.[1]) {
    return direct[1];
  }

  const embedded = safe.match(/\b(?:code|код)\D*(\d{6})\b/i);
  if (embedded?.[1]) {
    return embedded[1];
  }

  return '';
}

function buildRepoLabel(repoKey, locale = 'ru') {
  return normalizeRepoKey(repoKey) === 'website'
    ? pickLocale(locale, 'сайт', 'website')
    : pickLocale(locale, 'приложение', 'app');
}

function buildActionLabel(actionType, locale = 'ru') {
  const safe = normalizeActionType(actionType);
  if (safe === 'publish') return pickLocale(locale, 'push ветки', 'branch publish');
  if (safe === 'deploy') return pickLocale(locale, 'деплой', 'deploy');
  if (safe === 'restart') return pickLocale(locale, 'рестарт', 'restart');
  return pickLocale(locale, 'исполнение кода', 'code execution');
}
}

function detectExecutionRequestPrefilter(text) {
  const safe = normalizeValue(text);
  const lower = safe.toLowerCase();
  const taskId = extractTaskIdFromNaturalText(safe);

  if (!taskId) {
    return null;
  }

  const wantsExecute =
    /\b(execute|run|apply|implement|ship|commit|deploy|fix|edit|change|code|выполни|запусти|примени|внеси|исправь|измени|поменяй|задеплой|закоммить)\b/i.test(
      lower
    );

  if (!wantsExecute) {
    return null;
  }

  const repoKey = normalizeRepoKey(safe);
  return {
    taskId,
    repoKey
  };
}

function detectExecutionCancelIntent(text) {
  const safe = normalizeValue(text).toLowerCase();
  if (!safe) {
    return false;
  }

  return /\b(cancel run|cancel execute|cancel code|отмени запуск|отмени исполнение|отмени код|отмена кода|сбрось код)\b/i.test(
    safe
  );
}

function detectPostExecutionRequestPrefilter(text) {
  const safe = normalizeValue(text);
  const lower = safe.toLowerCase();
  const taskId = extractTaskIdFromNaturalText(safe);

  if (!taskId) {
    return null;
  }

  const actionPatterns = [
    {
      actionType: 'deploy',
      matches: /\b(deploy|release|ship|задепл|выпусти|релиз)\b/i
    },
    {
      actionType: 'restart',
      matches: /\b(restart|reboot|перезапуск|рестарт|перегрузи)\b/i
    },
    {
      actionType: 'publish',
      matches: /\b(push|publish|branch|пуш|запуш|опубликуй|ветк)\b/i
    }
  ];

  const matched = actionPatterns.find((item) => item.matches.test(lower));
  if (!matched) {
    return null;
  }

  return {
    taskId,
    actionType: matched.actionType,
    repoKey: normalizeRepoKey(safe)
  };
}

async function updateTaskFromOwnerCommand(message, status, options = {}) {
  const chatId = normalizeValue(message?.chat?.id);
  const locale = await getChatLocale(chatId);
  const english = isEnglish(locale);
  const ownerOnly = await isOwnerMessage(message);
  const isPrivate = normalizeValue(message?.chat?.type) === 'private';

  if (!ownerOnly || !isPrivate) {
    await reply(chatId, english ? '⛔ I only allow task status changes from the owner in the private chat.' : '⛔ Менять статус задач я даю только owner-аккаунту в личке.');
    return { ok: false, unauthorized: true };
  }

  const args = parseTaskCommandArgs(extractCommandArgs(message?.text));
  if (!Number.isFinite(args.taskId) || args.taskId <= 0) {
    await reply(chatId, english ? 'Provide the task id after the command. Example: /done 12' : (options.usageText || 'Укажите id задачи после команды. Например: /done 12'));
    return { ok: true, promptShown: true };
  }

  const task = await getTaskById(args.taskId);
  if (!task) {
    await reply(chatId, english ? `⚠️ Task #${args.taskId} was not found.` : `⚠️ Задача #${args.taskId} не найдена.`);
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
    await reply(chatId, english ? `⚠️ I could not update task #${args.taskId}.` : `⚠️ Не получилось обновить задачу #${args.taskId}.`);
    return { ok: false };
  }

  const meta = taskStatusMeta(updated);
  await reply(
    chatId,
    [
      english ? `${meta.statusIcon} Updated task #${updated.id}` : `${meta.statusIcon} Обновил задачу #${updated.id}`,
      english ? `New status: ${meta.status}` : `Новый статус: ${meta.status}`,
      `${meta.priorityIcon} ${normalizeValue(updated.title) || (english ? 'Untitled' : 'Без названия')}`,
      args.body ? (english ? `Comment: ${args.body}` : `Комментарий: ${args.body}`) : ''
    ].filter(Boolean).join('\n')
  );

  return {
    ok: true,
    updated: true,
    taskId: updated.id
  };
}

async function startExecutionRequestFromOwner(message, options = {}) {
  const chatId = normalizeValue(message?.chat?.id);
  const locale = await getChatLocale(chatId);
  const english = isEnglish(locale);
  const ownerOnly = await isOwnerMessage(message);
  const isPrivate = normalizeValue(message?.chat?.type) === 'private';

  if (!ownerOnly || !isPrivate) {
    await reply(chatId, english ? '⛔ I only allow code execution requests from the owner in the private chat.' : '⛔ Запускать кодовые задачи я даю только owner-аккаунту в личке.');
    return { ok: false, unauthorized: true };
  }

  const args = options?.taskId
    ? {
        taskId: Number(options.taskId || 0),
        body: normalizeValue(options.repoKey)
      }
    : parseTaskCommandArgs(extractCommandArgs(message?.text));

  if (!Number.isFinite(args.taskId) || args.taskId <= 0) {
    await reply(
      chatId,
      english
        ? '🛠️ Tell me which task to execute.\n\nExamples:\n/execute 12 app\n/execute 14 website\nor simply: run task 12 in the app'
        : '🛠️ Укажите задачу для исполнения.\n\nПримеры:\n/execute 12 app\n/execute 14 website\nили просто: выполни задачу 12 в приложении'
    );
    return { ok: true, promptShown: true };
  }

  let task = await getTaskById(args.taskId);
  if (!task) {
    await reply(chatId, english ? `⚠️ Task #${args.taskId} was not found.` : `⚠️ Задача #${args.taskId} не найдена.`);
    return { ok: false, notFound: true };
  }

  const requestedRepoKey = normalizeRepoKey(options?.repoKey || args.body);
  const progressMessage = await sendProgressMessage(
    chatId,
    english
      ? `🛠️ Preparing task #${args.taskId} for real execution in the repo. First I will confirm that it has a grounded work order...`
      : `🛠️ Готовлю задачу #${args.taskId} к реальному исполнению в repo. Сначала проверю, что у неё есть grounded work order...`
  );

  try {
    const taskDetails = parseJson(task?.details_json, {});
    const hasWorkOrder =
      normalizeValue(taskDetails?.codexOutcome) === 'done' ||
      (Array.isArray(taskDetails?.proposedFiles) && taskDetails.proposedFiles.length > 0);

    let codexRan = false;
    if (!hasWorkOrder) {
      const codexResult = await runCodexJobForTask(task.id, {
        source: 'telegram-execute',
        createdByChatId: chatId
      });
      task = codexResult?.task || (await getTaskById(task.id)) || task;
      codexRan = true;

      if (normalizeValue(codexResult?.result?.outcome) !== 'done') {
        await finalizeProgressMessage(
          progressMessage,
          [
            `⚠️ Сначала прогнал Codex по задаче #${task.id}, но он не собрал надёжный work order.`,
            normalizeValue(codexResult?.result?.blockerReason) ? (english ? `Blocker: ${normalizeValue(codexResult.result.blockerReason)}` : `Блокер: ${normalizeValue(codexResult.result.blockerReason)}`) : '',
            english ? 'Please refine the task wording or give me more context, then we can try again.' : 'Сначала поправьте формулировку задачи или дайте больше контекста, потом повторим запуск.'
          ]
            .filter(Boolean)
            .join('\n')
        );
        return { ok: false, blocked: true };
      }
    }

    const issued = await issueExecutionRequest({
      taskId: task.id,
      repoKey: requestedRepoKey || inferRepoKeyFromTask(task),
      requestedByChatId: chatId,
      requestedByUserId: normalizeValue(message?.from?.id),
      requestedMessage: normalizeValue(message?.text),
      details: {
        via: 'telegram',
        telegramMessageId: message?.message_id || null
      }
    });

    if (issued.alreadyActive) {
      await finalizeProgressMessage(
        progressMessage,
        [
          `⏳ Для задачи #${task.id} уже есть активный запрос на исполнение.`,
          `Repo: ${buildRepoLabel(issued.repoKey, locale)}`,
          english ? `Status: ${normalizeValue(issued.request?.status) || 'unknown'}` : `Статус: ${normalizeValue(issued.request?.status) || 'unknown'}`,
          english ? 'A new confirmation code is not needed while this request is still active.' : 'Новый код подтверждения не нужен, пока этот запрос не завершён или не отменён.'
        ].join('\n')
      );
      return {
        ok: true,
        alreadyActive: true,
        requestId: issued.request?.id || null
      };
    }

    await finalizeProgressMessage(
      progressMessage,
      [
        codexRan ? `🤖 Сначала добрал work order для задачи #${task.id}, теперь она готова к исполнению.` : `🛠️ Подготовил задачу #${task.id} к исполнению.`,
        `Repo: ${buildRepoLabel(issued.repoKey, locale)}`,
        english ? `Task: ${normalizeValue(task.title) || `#${task.id}`}` : `Задача: ${normalizeValue(task.title) || `#${task.id}`}`,
        '',
        english ? `To confirm, reply with only this code: ${issued.confirmationCode}` : `Для подтверждения напишите только этот код: ${issued.confirmationCode}`,
        english ? 'If you change your mind, just write: cancel code' : 'Если передумаете, просто напишите: отмена кода'
      ].join('\n')
    );

    return {
      ok: true,
      requested: true,
      requestId: issued.request?.id || null
    };
  } catch (error) {
    await finalizeProgressMessage(
      progressMessage,
      english
        ? `⚠️ I could not prepare task #${args.taskId} for execution: ${normalizeValue(error.message) || 'unknown error'}`
        : `⚠️ Не получилось подготовить задачу #${args.taskId} к исполнению: ${normalizeValue(error.message) || 'unknown error'}`
    );
    return { ok: false, error: error.message };
  }
}

async function confirmExecutionRequestFromOwner(message, explicitCode = '') {
  const chatId = normalizeValue(message?.chat?.id);
  const locale = await getChatLocale(chatId);
  const english = isEnglish(locale);
  const ownerOnly = await isOwnerMessage(message);
  const isPrivate = normalizeValue(message?.chat?.type) === 'private';

  if (!ownerOnly || !isPrivate) {
    await reply(chatId, english ? '⛔ I only allow execution confirmations from the owner in the private chat.' : '⛔ Подтверждать кодовые задачи я даю только owner-аккаунту в личке.');
    return { ok: false, unauthorized: true };
  }

  const code = explicitCode || extractConfirmationCode(message?.text);
  if (!code) {
    await reply(chatId, english ? '🔐 Send the 6-digit confirmation code. Example: 381042' : '🔐 Пришлите 6-значный код подтверждения. Например: 381042');
    return { ok: true, promptShown: true };
  }

  const result = await confirmExecutionRequestByCode({
    chatId,
    code
  });

  if (!result.confirmed) {
    await reply(
      chatId,
      english
        ? '⚠️ I could not find that code. It may have expired, or another run may already be confirmed. If needed, just ask me to prepare the task again.'
        : '⚠️ Такой код не нашёлся. Возможно, он истёк или вы уже подтвердили другой запуск. Если нужно, просто попросите подготовить задачу ещё раз.'
    );
    return { ok: false, invalidCode: true };
  }

  await reply(
    chatId,
    [
      english
        ? `✅ Confirmed ${buildActionLabel(result?.request?.action_type, locale)} for task #${Number(result?.task?.id || result?.request?.task_id || 0)}`
        : `✅ Подтвердил ${buildActionLabel(result?.request?.action_type, locale)} для задачи #${Number(result?.task?.id || result?.request?.task_id || 0)}`,
      `Repo: ${buildRepoLabel(result?.request?.repo_key, locale)}`,
      english ? 'The request is now in the runner queue. As soon as the runner claims it, the status will move into progress.' : 'Запрос ушёл в очередь runner-а. Как только он заберёт задачу, статус пойдёт в работу.'
    ].join('\n')
  );

  return {
    ok: true,
    confirmed: true,
    requestId: result?.request?.id || null
  };
}

async function cancelExecutionRequestFromOwner(message, options = {}) {
  const chatId = normalizeValue(message?.chat?.id);
  const ownerOnly = await isOwnerMessage(message);
  const isPrivate = normalizeValue(message?.chat?.type) === 'private';

  if (!ownerOnly || !isPrivate) {
    await reply(chatId, '⛔ Отменять кодовые запуски я даю только owner-аккаунту в личке.');
    return { ok: false, unauthorized: true };
  }

  const requestId = Number(options?.requestId || extractCommandArgs(message?.text) || 0);
  const canceled = await cancelExecutionRequest({
    requestId: Number.isFinite(requestId) && requestId > 0 ? requestId : null,
    chatId
  }).catch(() => null);

  if (!canceled) {
    await reply(chatId, 'ℹ️ Сейчас не вижу активного запроса на исполнение, который можно отменить.');
    return { ok: true, nothingToCancel: true };
  }

  await reply(
    chatId,
    [
      `🛑 Отменил запрос на исполнение #${canceled.id}`,
      `Repo: ${buildRepoLabel(canceled.repo_key)}`,
      `Task: #${Number(canceled.task_id || 0)}`
    ].join('\n')
  );

  return {
    ok: true,
    canceled: true,
    requestId: canceled.id
  };
}

async function startPostExecutionRequestFromOwner(message, options = {}) {
  const chatId = normalizeValue(message?.chat?.id);
  const ownerOnly = await isOwnerMessage(message);
  const isPrivate = normalizeValue(message?.chat?.type) === 'private';
  const actionType = normalizeActionType(options?.actionType);

  if (!ownerOnly || !isPrivate) {
    await reply(chatId, '⛔ Готовить push/deploy я даю только owner-аккаунту в личке.');
    return { ok: false, unauthorized: true };
  }

  const args = parseTaskCommandArgs(extractCommandArgs(message?.text));
  const taskId = Number(options?.taskId || args.taskId || 0);
  if (!Number.isFinite(taskId) || taskId <= 0) {
    await reply(
      chatId,
      '🚀 Укажите задачу.\n\nПримеры:\n/publish 12 app\n/deploy 12 website\nили просто: задеплой задачу 12'
    );
    return { ok: true, promptShown: true };
  }

  const task = await getTaskById(taskId);
  if (!task) {
    await reply(chatId, `⚠️ Задача #${taskId} не найдена.`);
    return { ok: false, notFound: true };
  }

  const requestedRepoKey = normalizeRepoKey(options?.repoKey || args.body);
  const lastApply = await findLatestCompletedApplyRequest(taskId, requestedRepoKey || inferRepoKeyFromTask(task));
  if (!lastApply) {
    await reply(
      chatId,
      [
        `⚠️ Для задачи #${taskId} пока нет завершённого code-run, после которого можно делать ${buildActionLabel(actionType)}.`,
        'Сначала запустите исполнение кода, подтвердите его 6-значным кодом и дождитесь коммита.'
      ].join('\n')
    );
    return { ok: false, missingApply: true };
  }

  const repoKey = normalizeRepoKey(requestedRepoKey || lastApply.repo_key || inferRepoKeyFromTask(task));
  const issued = await issueExecutionRequest({
    taskId,
    repoKey,
    actionType,
    requestedByChatId: chatId,
    requestedByUserId: normalizeValue(message?.from?.id),
    requestedMessage: normalizeValue(message?.text),
    details: {
      via: 'telegram',
      afterExecutionRequestId: lastApply.id,
      telegramMessageId: message?.message_id || null
    }
  });

  if (issued.alreadyActive) {
    await reply(
      chatId,
      [
        `⏳ Для задачи #${taskId} уже есть активный запрос на ${buildActionLabel(actionType)}.`,
        `Repo: ${buildRepoLabel(repoKey)}`,
        `Статус: ${normalizeValue(issued.request?.status) || 'unknown'}`
      ].join('\n')
    );
    return { ok: true, alreadyActive: true };
  }

  await reply(
    chatId,
    [
      `🚀 Подготовил ${buildActionLabel(actionType)} для задачи #${taskId}`,
      `Repo: ${buildRepoLabel(repoKey)}`,
      '',
      `Для подтверждения напишите только этот код: ${issued.confirmationCode}`,
      'Это отдельное подтверждение, чтобы не выпускать изменения в один шаг.'
    ].join('\n')
  );

  return {
    ok: true,
    requested: true,
    actionType,
    requestId: issued.request?.id || null
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
    logTelegramTrace('owner_prefilter.locale', {
      chatId,
      messageId: message?.message_id || null,
      locale: nextLocale,
      text: rawText
    });
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

  const pendingConfirmation = await findLatestPendingConfirmationByChat(chatId).catch(() => null);
  const confirmationCode = extractConfirmationCode(rawText);
  if (pendingConfirmation && confirmationCode) {
    logTelegramTrace('owner_prefilter.confirm_code', {
      chatId,
      messageId: message?.message_id || null,
      requestId: pendingConfirmation?.id || null
    });
    const result = await confirmExecutionRequestFromOwner(message, confirmationCode);
    return {
      matched: true,
      result
    };
  }

  if (pendingConfirmation && detectExecutionCancelIntent(rawText)) {
    logTelegramTrace('owner_prefilter.cancel_execution', {
      chatId,
      messageId: message?.message_id || null,
      requestId: pendingConfirmation?.id || null
    });
    const result = await cancelExecutionRequestFromOwner(message);
    return {
      matched: true,
      result
    };
  }

  const taskAction = detectTaskPrefilter(rawText);
  if (taskAction) {
    logTelegramTrace('owner_prefilter.task_action', {
      chatId,
      messageId: message?.message_id || null,
      taskId: taskAction.taskId,
      status: taskAction.status,
      text: rawText
    });
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

  const postExecutionAction = detectPostExecutionRequestPrefilter(rawText);
  if (postExecutionAction) {
    logTelegramTrace('owner_prefilter.post_execution', {
      chatId,
      messageId: message?.message_id || null,
      taskId: postExecutionAction.taskId,
      actionType: postExecutionAction.actionType,
      repoKey: postExecutionAction.repoKey,
      text: rawText
    });
    const result = await startPostExecutionRequestFromOwner(message, postExecutionAction);
    return {
      matched: true,
      result
    };
  }

  const executionAction = detectExecutionRequestPrefilter(rawText);
  if (executionAction) {
    logTelegramTrace('owner_prefilter.execution', {
      chatId,
      messageId: message?.message_id || null,
      taskId: executionAction.taskId,
      repoKey: executionAction.repoKey,
      text: rawText
    });
    const result = await startExecutionRequestFromOwner(message, executionAction);
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

async function answerOwnerQuestion(message, question, options = {}) {
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
    const data = options?.preloadedData || (await collectOverviewData());
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
  const locale = await getChatLocale(chatId);
  const english = isEnglish(locale);

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

  logTelegramTrace('owner_inbox.route', {
    chatId,
    messageId: message?.message_id || null,
    text: rawText,
    mode: route?.mode || 'unknown',
    intent: route?.intent || 'unknown',
    fallbackReason: route?.fallbackReason || null,
    title: route?.title || null
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
        english ? '📝 Saved it into the next release plan' : '📝 Сохранил в план следующей версии',
        route?.answerText || (english ? 'I see this as release work, not just a casual chat message.' : 'Вижу это как задачу на релиз, а не как просто сообщение в чат.'),
        `${english ? 'Title' : 'Заголовок'}: ${normalizeValue(stored.note?.title) || normalizeValue(stored.structured?.title)}`,
        `${english ? 'Type' : 'Тип'}: ${normalizeValue(stored.note?.note_type || stored.structured?.noteType)} • ${english ? 'priority' : 'приоритет'}: ${normalizeValue(stored.note?.priority || stored.structured?.priority)}`,
        taskResult?.task?.id ? `Task: #${taskResult.task.id} • статус ${normalizeValue(taskResult.task.status)}` : '',
        '',
        english ? 'You can open /tasks later and move it like a normal task.' : 'Если хотите, потом можно открыть /tasks и двигать это как обычную задачу.'
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
      english ? '🚨 Treating this as an incident signal and checking nearby data...' : '🚨 Фиксирую это как сигнал о проблеме и быстро проверяю соседние данные...'
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
        english ? '🚨 Logged it as an incident' : '🚨 Зафиксировал как инцидент',
        route?.answerText || (english ? 'I see this as a live problem, not just a note for later.' : 'Вижу это как живую проблему, а не просто заметку на потом.'),
        taskResult?.task?.id ? `Task: #${taskResult.task.id} • статус ${normalizeValue(taskResult.task.status)}` : '',
        '',
        normalizeValue(answer?.answer) || (english ? 'No extra details yet.' : 'Пока без деталей.'),
        '',
        `${english ? 'Mode' : 'Режим'}: ${normalizeValue(answer?.mode) === 'openai' ? (english ? 'GPT analysis' : 'GPT-анализ') : (english ? 'reliable fallback' : 'надёжный fallback')}`
      ].join('\n')
    );

    return {
      ok: true,
      routed: 'incident_report'
    };
  }

  return answerOwnerQuestion(message, rawText, {
    preloadedData: data
  });
}

async function handleVoiceNote(message) {
  const chatId = normalizeValue(message?.chat?.id);
  const attachment = extractAudioAttachment(message);
  const locale = await getChatLocale(chatId);
  const english = isEnglish(locale);

  if (!chatId || !attachment?.fileId) {
    return {
      ok: false,
      ignored: true
    };
  }

  const ownerOnly = await isOwnerMessage(message);
  const isPrivate = normalizeValue(message?.chat?.type) === 'private';

  if (!ownerOnly || !isPrivate) {
    await reply(chatId, english ? '🎤 I only accept voice notes into the backlog from the owner in the private chat.' : '🎤 Голосовые заметки в backlog я принимаю только от owner-а в личном чате.');
    return {
      ok: false,
      unauthorized: true
    };
  }

  const progressMessage = await sendProgressMessage(
    chatId,
    english
      ? '🎤 Listening, turning this into text, and figuring out whether it is a question, an incident, or a release note...'
      : '🎤 Слушаю заметку, превращаю её в текст и понимаю, это вопрос, инцидент или заметка на релиз...'
  );

  try {
    const file = await downloadTelegramFileBuffer(attachment.fileId);
    const mimeType = detectAudioMimeType(file.filePath, attachment.mimeType);
    const transcription = await transcribeAudioBuffer(file.buffer, {
      fileName: file.filePath.split('/').pop() || 'voice-note.ogg',
      mimeType,
      prompt: english
        ? 'Founder product note for the next wallet release. Return clean text in the original language.'
        : 'Founder product note for the next wallet release. Return clean text in the original language.'
    });
    const data = await collectOverviewData();
    const route = await routeOwnerMessage(transcription.text, {
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

    logTelegramTrace('voice_note.route', {
      chatId,
      messageId: message?.message_id || null,
      text: transcription.text,
      mode: route?.mode || 'unknown',
      intent: route?.intent || 'unknown',
      fallbackReason: route?.fallbackReason || null,
      title: route?.title || null
    });

    if (normalizeValue(route?.mode) === 'fallback' && normalizeValue(route?.fallbackReason)) {
      await recordBotEvent({
        category: 'openai',
        type: 'voice_router_fallback',
        severity: 'warning',
        title: 'Voice router fell back to heuristics',
        message: normalizeValue(route.fallbackReason),
        fingerprint: `ops-bot:voice_router_fallback:${normalizeValue(route.fallbackReason)}`
      });
    }

    if (normalizeValue(route?.intent) === 'incident_report') {
      const title = normalizeValue(route?.title) || shortenText(transcription.text, 100) || 'Owner voice incident report';
      const severity = normalizeValue(route?.severity) || 'warning';

      const eventResult = await recordBotEvent({
        category: 'owner-input',
        type: 'owner_flagged_issue',
        severity,
        title,
        message: normalizeValue(route?.eventMessage) || transcription.text,
        fingerprint: `ops-bot:owner_voice_issue:${title.toLowerCase()}`,
        details: {
          chatId,
          telegramMessageId: message?.message_id || null,
          transcriptText: shortenText(transcription.text, 400),
          filePath: file.filePath
        }
      });
      const taskResult = await createTaskFromOpsEvent(eventResult?.event, {
        source: 'owner-voice-incident',
        createdByChatId: chatId
      }).catch(() => null);

      const answer = await answerOpsQuestion(transcription.text, {
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
      }, {
        locale
      });

      await finalizeProgressMessage(
        progressMessage,
        [
          english ? '🎤 Treated the voice note as an incident' : '🎤 Разобрал голосовую как инцидент',
          `${english ? 'Transcript' : 'Текст'}: ${shortenText(transcription.text, 220)}`,
          route?.answerText || (english ? 'I see this as a live problem, not just a release note.' : 'Вижу это как живую проблему, а не просто заметку на релиз.'),
          taskResult?.task?.id ? `Task: #${taskResult.task.id} • ${english ? 'status' : 'статус'} ${normalizeValue(taskResult.task.status)}` : '',
          '',
          normalizeValue(answer?.answer) || (english ? 'No extra details yet.' : 'Пока без деталей.'),
          '',
          `${english ? 'Mode' : 'Режим'}: ${normalizeValue(answer?.mode) === 'openai' ? (english ? 'GPT analysis' : 'GPT-анализ') : (english ? 'reliable fallback' : 'надёжный fallback')}`
        ].filter(Boolean).join('\n')
      );

      return {
        ok: true,
        routed: 'incident_report',
        transcript: transcription.text
      };
    }

    if (normalizeValue(route?.intent) === 'question') {
      const answer = await answerOpsQuestion(transcription.text, {
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
      }, {
        locale
      });

      if (normalizeValue(answer?.mode) === 'fallback' && normalizeValue(answer?.fallbackReason)) {
        await recordBotEvent({
          category: 'openai',
          type: 'voice_question_fallback',
          severity: 'warning',
          title: 'Voice question fell back to deterministic mode',
          message: normalizeValue(answer.fallbackReason),
          fingerprint: `ops-bot:voice_question_fallback:${normalizeValue(answer.fallbackReason)}`
        });
      }

      await finalizeProgressMessage(
        progressMessage,
        [
          english ? '🎤 Treated the voice note as a question' : '🎤 Разобрал голосовую как вопрос',
          `${english ? 'Transcript' : 'Текст'}: ${shortenText(transcription.text, 220)}`,
          '',
          normalizeValue(answer?.answer) || (english ? 'I could not build the answer yet.' : 'Пока не получилось собрать ответ.'),
          '',
          `${english ? 'Mode' : 'Режим'}: ${normalizeValue(answer?.mode) === 'openai' ? (english ? 'GPT analysis' : 'GPT-анализ') : (english ? 'reliable fallback' : 'надёжный fallback')}`
        ].join('\n')
      );

      return {
        ok: true,
        routed: 'question',
        transcript: transcription.text
      };
    }

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
        english ? '🎤 Saved the voice note into the plan' : '🎤 Сохранил голосовую заметку в план',
        `${english ? 'Title' : 'Заголовок'}: ${normalizeValue(stored.note?.title) || normalizeValue(stored.structured?.title)}`,
        `${english ? 'Type' : 'Тип'}: ${normalizeValue(stored.note?.note_type || stored.structured?.noteType)} • ${english ? 'priority' : 'приоритет'}: ${normalizeValue(stored.note?.priority || stored.structured?.priority)}`,
        taskResult?.task?.id ? `Task: #${taskResult.task.id} • ${english ? 'status' : 'статус'} ${normalizeValue(taskResult.task.status)}` : '',
        `${english ? 'Text' : 'Текст'}: ${shortenText(transcription.text, 260)}`,
        '',
        english ? 'Open /tasks if you want to see it as a working task.' : 'Откройте /tasks, если хотите увидеть это как рабочую задачу.'
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
        telegramFileId: normalizeValue(attachment.fileId),
        telegramMessageId: message?.message_id || null
      }
    });

    await finalizeProgressMessage(
      progressMessage,
      english
        ? '⚠️ I could not process this voice note. Please try again or send the idea as text.'
        : '⚠️ Голосовую заметку не получилось обработать. Попробуйте ещё раз или пришлите мысль текстом через /note.'
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

  const locale = await getChatLocale(chatId);
  const english = isEnglish(locale);
  await touchTelegramTarget(chatId, message?.from?.id).catch(() => null);
  logTelegramTrace('message.command_entry', {
    chatId,
    messageId: message?.message_id || null,
    fromId: normalizeValue(message?.from?.id),
    chatType: normalizeValue(message?.chat?.type),
    command: command || '(plain-text)',
    text: rawText
  });

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
      english
        ? '⛔ This chat is not linked to 4TEEN Ops yet.\n\nIf this is your private chat, just send /start.\nIf this is a group, first link your owner private chat and then use /allow_here in the group.'
        : '⛔ Этот чат пока не привязан к 4TEEN Ops.\n\nЕсли это ваш личный чат, просто напишите /start.\nЕсли это группа, сначала привяжите личку owner-аккаунта, а потом уже используйте /allow_here в группе.'
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
        english ? '🧹 Cleared the bot history.' : '🧹 Почистил историю бота.',
        english
          ? `Deleted messages: ${Number(cleared.deleted || 0)} of ${Number(cleared.total || 0)}.`
          : `Удалил сообщений: ${Number(cleared.deleted || 0)} из ${Number(cleared.total || 0)}.`
      ].join('\n')
    );
    return { ok: true, cleared: true };
  }

  if (command === '/help') {
    await reply(
      chatId,
      english
        ? [
            '🤝 I can speak plainly instead of dumping dry logs.',
            '',
            'Main commands:',
            '/menu — open the menu',
            '/summary — short AI summary',
            '/run — current path from task to code run',
            '/engineer — engineering view',
            '/ask — ask about server state, keys, feedback, and backlog',
            '/screen — check real app flows',
            '/health — quickly see what hurts',
            '/events — active problems',
            '/feedback — wallet feedback',
            '/kb — bot memory for the project',
            '/jobs — latest Codex jobs',
            '/notes — next release backlog',
            '/tasks — working tasks',
            '/codex 12 — run Codex for a task',
            '/execute 12 app — prepare real code execution',
            '/publish 12 app — prepare branch push',
            '/deploy 12 app — prepare deploy',
            '/restart 12 app — prepare restart',
            '/confirm 381042 — confirm a run with a 6-digit code',
            '/cancelrun — cancel the active execution request',
            '/note text — add an idea or fix into backlog',
            '/take 12 — start a task',
            '/done 12 — close a task',
            '/block 12 reason — mark a blocker',
            '/todo 12 — return a task to the queue',
            '/keys — keys and limits',
            '/queues — queues and background work',
            '/targets — where the bot can write',
            '/allow_here — authorize this chat',
            '',
            'Bonus:',
            '1. A voice note in the owner private chat becomes a note for the next release.',
            '2. Any normal text in the owner private chat is auto-routed as a question, backlog note, or live incident.'
          ].join('\n')
        : [
            '🤝 Я могу говорить по-простому, а не сухими логами.',
            '',
            'Основное:',
            '/menu — открыть меню',
            '/summary — короткая AI-сводка',
            '/run — текущий путь от задачи до code-run',
            '/engineer — инженерный разрез по системам',
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
            '/execute 12 app — подготовить реальное исполнение кода',
            '/publish 12 app — подготовить push ветки',
            '/deploy 12 app — подготовить деплой',
            '/restart 12 app — подготовить рестарт',
            '/confirm 381042 — подтвердить запуск 6-значным кодом',
            '/cancelrun — отменить активный запрос на исполнение',
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

  if (command === '/run') {
    await sendScreen(chatId, 'run');
    return { ok: true };
  }

  if (command === '/engineer') {
    await sendScreen(chatId, 'engineer');
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

  if (command === '/execute') {
    return startExecutionRequestFromOwner(message);
  }

  if (command === '/publish') {
    return startPostExecutionRequestFromOwner(message, {
      actionType: 'publish'
    });
  }

  if (command === '/deploy') {
    return startPostExecutionRequestFromOwner(message, {
      actionType: 'deploy'
    });
  }

  if (command === '/restart') {
    return startPostExecutionRequestFromOwner(message, {
      actionType: 'restart'
    });
  }

  if (command === '/confirm') {
    return confirmExecutionRequestFromOwner(message);
  }

  if (command === '/cancelrun') {
    return cancelExecutionRequestFromOwner(message);
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

  await reply(chatId, english ? 'I did not understand that command. Press /menu, it is easier there.' : 'Не понял команду. Нажмите /menu, там удобнее.');
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
  const locale = await getChatLocale(chatId);

  await answerTelegramCallback(
    callbackQuery?.id,
    action === 'refresh'
      ? pickLocale(locale, 'Обновляю картину...', 'Refreshing...')
      : action === 'rerun'
        ? pickLocale(locale, 'Гоняю реальные сценарии...', 'Running real scenarios...')
        : pickLocale(locale, 'Открываю раздел...', 'Opening the section...')
  ).catch(() => null);

  if (action === 'rerun') {
    const { runSyntheticScreeners } = getScreenerService();
    await runSyntheticScreeners('telegram', { force: true }).catch(() => null);
    await sendScreen(chatId, 'screen', {
      editMessageId: messageId,
      locale
    });

    return {
      ok: true,
      screen: 'screen',
      rerun: true
    };
  }

  await sendScreen(chatId, screen, {
    editMessageId: messageId,
    force: screen === 'summary',
    locale
  });

  return {
    ok: true,
    screen
  };
}

async function handleAdminTelegramWebhookUpdate(update) {
  const message = update?.message;
  const callbackQuery = update?.callback_query;

  logTelegramTrace('webhook.update_received', {
    updateId: update?.update_id || null,
    hasMessage: Boolean(message),
    hasCallback: Boolean(callbackQuery),
    chatId: normalizeValue(message?.chat?.id || callbackQuery?.message?.chat?.id),
    chatType: normalizeValue(message?.chat?.type || callbackQuery?.message?.chat?.type),
    messageId: message?.message_id || callbackQuery?.message?.message_id || null,
    text: normalizeValue(message?.text),
    callbackData: normalizeValue(callbackQuery?.data)
  });

  if (callbackQuery?.data) {
    return handleCallbackQuery(callbackQuery);
  }

  if (extractAudioAttachment(message)?.fileId) {
    return handleVoiceNote(message);
  }

  if (!message?.text) {
    logTelegramTrace('webhook.ignored_non_text', {
      updateId: update?.update_id || null,
      chatId: normalizeValue(message?.chat?.id)
    });
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
