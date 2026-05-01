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

function formatEventLine(event) {
  const severity = normalizeValue(event?.severity || 'info').toUpperCase();
  const source = normalizeValue(event?.source || 'ops');
  const title = normalizeValue(event?.title || 'Untitled event');
  const message = normalizeValue(event?.message || 'No details');
  const count = Number(event?.count || 0);
  const countSuffix = count > 1 ? ` x${count}` : '';

  return [
    `${severity} • ${source}${countSuffix}`,
    title,
    message
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
        `RESOLVED • ${normalizeValue(event.source || 'ops')}`,
        normalizeValue(event.title || 'Resolved'),
        normalizeValue(input?.message || event.message || 'Recovered')
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
