const {
  markEventNotified,
  openOrIncrementEvent,
  resolveEvent,
  setRuntimeState
} = require('./store');
const { broadcastAdminMessage } = require('./telegramAdminBot');

function normalizeValue(value) {
  return String(value || '').trim();
}

function severityIcon(severity) {
  const safe = normalizeValue(severity).toLowerCase();
  if (safe === 'critical' || safe === 'error') return '🚨';
  if (safe === 'warning') return '⚠️';
  return 'ℹ️';
}

function recommendationForEvent(event) {
  const fingerprint = normalizeValue(event?.fingerprint);
  const source = normalizeValue(event?.source);

  if (fingerprint.includes('airdrop:resources_low') || fingerprint.includes('clock:airdrop_resources_low')) {
    return 'Что делать: проверить airdrop wallet и поднять energy.';
  }

  if (fingerprint.includes('ambassador:resources_low') || fingerprint.includes('clock:ambassador_resources_low')) {
    return 'Что делать: посмотреть operator wallet и его energy/bandwidth.';
  }

  if (fingerprint.includes('key_pool_exhausted')) {
    return 'Что делать: проверить квоты провайдеров и запасные API-ключи.';
  }

  if (fingerprint.includes('credential_pool_failed') || source === 'gasstation') {
    return 'Что делать: проверить GasStation credential-ы, лимиты и whitelist.';
  }

  if (fingerprint.includes('clock:heartbeat_stale') || fingerprint.includes('clock:tick_failed')) {
    return 'Что делать: проверить clock dyno и свежесть heartbeat.';
  }

  return 'Что делать: открыть /menu и посмотреть детали в разделах События и Здоровье.';
}

function formatEventLine(event) {
  const severity = normalizeValue(event?.severity || 'info').toUpperCase();
  const source = normalizeValue(event?.source || 'ops');
  const title = normalizeValue(event?.title || 'Untitled event');
  const message = normalizeValue(event?.message || 'No details');
  const count = Number(event?.count || 0);
  const countSuffix = count > 1 ? ` x${count}` : '';

  return [
    `${severityIcon(event?.severity)} ${title}`,
    `Источник: ${source}${countSuffix}`,
    message,
    recommendationForEvent(event)
  ].join('\n');
}

function shouldNotify(input, state) {
  if (input?.notify === false) {
    return false;
  }

  if (state.created) {
    return true;
  }

  const count = Number(state?.event?.count || 0);
  return count === 3 || count === 10 || count === 25;
}

async function recordOpsEvent(input) {
  const state = await openOrIncrementEvent(input);

  if (shouldNotify(input, state)) {
    await broadcastAdminMessage(formatEventLine(state.event)).catch(() => null);
    await markEventNotified(state.event.id).catch(() => null);
  }

  return state.event;
}

async function resolveOpsEvent(input) {
  const event = await resolveEvent(input);

  if (event && input?.notifyOnResolve) {
    await broadcastAdminMessage(
      [
        `✅ Стало лучше: ${normalizeValue(event.title || 'Проблема закрыта')}`,
        `Источник: ${normalizeValue(event.source || 'ops')}`,
        normalizeValue(input?.message || event.message || 'Сигнал восстановился')
      ].join('\n')
    ).catch(() => null);
  }

  return event;
}

async function writeOpsHeartbeat(key, value) {
  return setRuntimeState(key, {
    ...(value || {}),
    heartbeatAt: new Date().toISOString()
  });
}

module.exports = {
  recordOpsEvent,
  resolveOpsEvent,
  writeOpsHeartbeat
};
