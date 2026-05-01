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
  const source = normalizeValue(event?.source);
  const category = normalizeValue(event?.category);
  const type = normalizeValue(event?.type);

  if (source === 'airdrop' && category === 'resources' && type === 'resource_floor_low') {
    return 'Что делать: проверить airdrop wallet и поднять energy.';
  }

  if (source === 'ambassador' && category === 'resources' && type === 'resource_floor_low') {
    return 'Что делать: посмотреть operator wallet и его energy/bandwidth.';
  }

  if (source === 'proxy' && category === 'keys' && type === 'key_pool_exhausted') {
    return 'Что делать: проверить квоты провайдеров и запасные API-ключи.';
  }

  if (source === 'gasstation' && category === 'keys' && type === 'credential_pool_failed') {
    return 'Что делать: проверить GasStation credential-ы, лимиты и whitelist.';
  }

  if (source === 'clock' && category === 'heartbeat' && type === 'clock_stale') {
    return 'Что делать: проверить clock dyno и свежесть heartbeat.';
  }

  if (source === 'screeners' && type === 'wallet_market_pipeline') {
    return 'Что делать: проверить proxy для Trongrid/Tronscan и не упёрлись ли ключи в лимиты.';
  }

  if (source === 'screeners' && type === 'ambassador_energy_quote') {
    return 'Что делать: проверить quote на energy, режим GasStation и конфиг resale fallback.';
  }

  if (source === 'screeners' && type === 'telegram_airdrop_flow') {
    return 'Что делать: проверить airdrop wallet, его energy/bandwidth и скорость очереди claim.';
  }

  if (source === 'screeners' && type === 'ambassador_allocation_flow') {
    return 'Что делать: проверить operator wallet и не залипают ли ambassador allocation/replay.';
  }

  if (source === 'app-feedback' && category === 'feedback') {
    return 'Что делать: открыть связанный экран в кошельке и воспроизвести сценарий, который пользователь отметил руками.';
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
