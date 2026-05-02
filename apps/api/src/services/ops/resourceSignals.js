const { hasEnoughAirdropResources } = require('../airdrop/telegramBot');
const { hasEnoughAmbassadorAllocationResources } = require('../ambassador/replayQueue');
const { getRuntimeState, setRuntimeState } = require('./store');

const SIGNAL_KEY_PREFIX = 'ops.resource_signal.';
const FRESH_TTL_MS = 20 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MS = 45 * 60 * 1000;
const ERROR_BACKOFF_MS = 10 * 60 * 1000;

const inflightSignals = new Map();

function normalizeValue(value) {
  return String(value || '').trim();
}

function isRateLimitedError(error) {
  const message = normalizeValue(error?.message).toLowerCase();
  return Number(error?.status || 0) === 429 || /\b429\b/.test(message) || message.includes('rate limit');
}

function buildStateKey(name) {
  return `${SIGNAL_KEY_PREFIX}${normalizeValue(name).toLowerCase()}`;
}

function normalizeStoredSignal(value) {
  const safe = value && typeof value === 'object' ? value : {};
  return {
    state: safe.state && typeof safe.state === 'object' ? safe.state : null,
    fetchedAt: normalizeValue(safe.fetchedAt) || null,
    nextAttemptAt: normalizeValue(safe.nextAttemptAt) || null,
    backoffReason: normalizeValue(safe.backoffReason) || null,
    lastError: normalizeValue(safe.lastError) || null,
    lastErrorAt: normalizeValue(safe.lastErrorAt) || null,
    lastRateLimitedAt: normalizeValue(safe.lastRateLimitedAt) || null
  };
}

function decorateState(payload, overrides = {}) {
  const state = payload?.state && typeof payload.state === 'object' ? payload.state : {};
  const stale = overrides.stale === true;
  const rateLimited = overrides.rateLimited === true;

  return {
    ...state,
    _probe: {
      source: normalizeValue(overrides.source) || 'unknown',
      stale,
      rateLimited,
      fetchedAt: normalizeValue(overrides.fetchedAt || payload?.fetchedAt) || null,
      nextAttemptAt: normalizeValue(overrides.nextAttemptAt || payload?.nextAttemptAt) || null,
      lastError: normalizeValue(overrides.lastError || payload?.lastError) || null,
      lastErrorAt: normalizeValue(overrides.lastErrorAt || payload?.lastErrorAt) || null,
      lastRateLimitedAt:
        normalizeValue(overrides.lastRateLimitedAt || payload?.lastRateLimitedAt) || null
    }
  };
}

async function readSignalState(name) {
  const row = await getRuntimeState(buildStateKey(name)).catch(() => null);
  return normalizeStoredSignal(row?.value_json || {});
}

async function writeSignalState(name, value) {
  return setRuntimeState(buildStateKey(name), value).catch(() => null);
}

async function fetchSignal(name, loader) {
  const existing = inflightSignals.get(name);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const cached = await readSignalState(name);
    const now = Date.now();
    const fetchedAt = cached.fetchedAt ? new Date(cached.fetchedAt).getTime() : 0;
    const nextAttemptAt = cached.nextAttemptAt ? new Date(cached.nextAttemptAt).getTime() : 0;
    const hasCachedState = Boolean(cached.state && typeof cached.state === 'object');

    if (hasCachedState && fetchedAt > 0 && now - fetchedAt < FRESH_TTL_MS) {
      return decorateState(cached, {
        source: 'cache',
        stale: false,
        rateLimited: false
      });
    }

    if (hasCachedState && nextAttemptAt > now) {
      return decorateState(cached, {
        source: 'cache',
        stale: true,
        rateLimited: cached.backoffReason === 'rate_limit'
      });
    }

    try {
      const liveState = await loader();
      const stored = {
        state: liveState,
        fetchedAt: new Date().toISOString(),
        nextAttemptAt: new Date(Date.now() + FRESH_TTL_MS).toISOString(),
        backoffReason: null,
        lastError: null,
        lastErrorAt: null,
        lastRateLimitedAt: null
      };
      await writeSignalState(name, stored);
      return decorateState(stored, {
        source: 'live',
        stale: false,
        rateLimited: false
      });
    } catch (error) {
      const rateLimited = isRateLimitedError(error);
      const nextAttemptIso = new Date(
        Date.now() + (rateLimited ? RATE_LIMIT_BACKOFF_MS : ERROR_BACKOFF_MS)
      ).toISOString();

      const stored = {
        ...cached,
        nextAttemptAt: nextAttemptIso,
        backoffReason: rateLimited ? 'rate_limit' : 'error',
        lastError: error instanceof Error ? error.message : String(error),
        lastErrorAt: new Date().toISOString(),
        lastRateLimitedAt: rateLimited ? new Date().toISOString() : cached.lastRateLimitedAt || null
      };

      await writeSignalState(name, stored);

      if (hasCachedState) {
        return decorateState(stored, {
          source: 'cache',
          stale: true,
          rateLimited
        });
      }

      return {
        hasEnough: null,
        walletAddress: null,
        energyAvailable: null,
        bandwidthAvailable: null,
        _probe: {
          source: 'error',
          stale: true,
          rateLimited,
          fetchedAt: null,
          nextAttemptAt: nextAttemptIso,
          lastError: error instanceof Error ? error.message : String(error),
          lastErrorAt: new Date().toISOString(),
          lastRateLimitedAt: rateLimited ? new Date().toISOString() : null
        }
      };
    }
  })();

  inflightSignals.set(name, promise);

  try {
    return await promise;
  } finally {
    inflightSignals.delete(name);
  }
}

async function getAirdropResourceSignal() {
  return fetchSignal('airdrop', hasEnoughAirdropResources);
}

async function getAmbassadorResourceSignal() {
  return fetchSignal('ambassador', hasEnoughAmbassadorAllocationResources);
}

module.exports = {
  getAirdropResourceSignal,
  getAmbassadorResourceSignal
};
