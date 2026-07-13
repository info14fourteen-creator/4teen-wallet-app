const { fetch: undiciFetch } = require('undici');
const env = require('../../config/env');

const DEFAULT_BASE_URL = 'https://tronix.rent';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_429_RETRY_ATTEMPTS = 3;
const DEFAULT_429_RETRY_DELAY_MS = 5000;

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeBaseUrl(value) {
  return normalizeValue(value || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function getBaseUrl() {
  return normalizeBaseUrl(env.TRONIX_RENT_INTERNAL_BASE_URL || env.TRONIX_RENT_BASE_URL);
}

function getInternalHeaders() {
  const token = normalizeValue(env.TRONIX_RENT_INTERNAL_TOKEN);

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
    'X-Tronix-Internal-Token': token
  };
}

function normalizeTimeoutMs(value) {
  const parsed = Number(value || DEFAULT_TIMEOUT_MS);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.max(1000, Math.floor(parsed));
}

function isEnabled() {
  return String(env.TRONIX_RENT_ENABLED || '').toLowerCase().includes('true');
}

function normalizeRetryAttempts(value) {
  const parsed = Number(value || DEFAULT_429_RETRY_ATTEMPTS);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_429_RETRY_ATTEMPTS;
  }

  return Math.max(1, Math.min(5, Math.floor(parsed)));
}

function normalizeRetryDelayMs(value) {
  const parsed = Number(value || DEFAULT_429_RETRY_DELAY_MS);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_429_RETRY_DELAY_MS;
  }

  return Math.max(500, Math.floor(parsed));
}

function parseRetryAfterMs(value) {
  const safe = normalizeValue(value);
  const seconds = Number(safe);

  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.floor(seconds * 1000);
  }

  const timestamp = Date.parse(safe);
  if (Number.isFinite(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }

  return 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRequestError({ path, response, payload, raw }) {
  const message =
    payload?.error ||
    payload?.message ||
    `TronixRent HTTP ${response.status}`;
  const error = new Error(message);
  error.status = response.status || 502;
  error.tronixPath = path;
  error.retryAfter = normalizeValue(response.headers.get('retry-after'));
  error.payload = payload;
  error.details = {
    path,
    status: error.status,
    retryAfter: error.retryAfter || null,
    payloadCode: payload?.code || payload?.errorCode || null,
    payloadError: payload?.error || payload?.message || null,
    raw: raw ? raw.slice(0, 500) : ''
  };
  return error;
}

async function requestJsonOnce(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizeTimeoutMs(env.TRONIX_RENT_TIMEOUT_MS));

  try {
    const response = await undiciFetch(`${getBaseUrl()}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...getInternalHeaders(),
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const raw = await response.text();
    let payload = null;

    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch (_) {
      const error = new Error(`TronixRent returned non-JSON response: ${raw.slice(0, 200)}`);
      error.status = response.status || 502;
      error.tronixPath = path;
      error.details = {
        path,
        status: error.status,
        raw: raw.slice(0, 500)
      };
      throw error;
    }

    if (!response.ok || payload?.ok === false) {
      throw buildRequestError({ path, response, payload, raw });
    }

    return payload?.result ?? payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('TronixRent request timed out');
      timeoutError.status = 504;
      timeoutError.tronixPath = path;
      timeoutError.details = { path, status: 504 };
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson(path, options = {}) {
  if (!isEnabled()) {
    const error = new Error('TronixRent is disabled');
    error.status = 503;
    error.tronixPath = path;
    throw error;
  }

  const attempts = normalizeRetryAttempts(env.TRONIX_RENT_429_RETRY_ATTEMPTS);
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestJsonOnce(path, options);
    } catch (error) {
      lastError = error;

      if (Number(error?.status || 0) !== 429 || attempt >= attempts - 1) {
        throw error;
      }

      const retryAfterMs = parseRetryAfterMs(error.retryAfter);
      const delayMs =
        retryAfterMs ||
        normalizeRetryDelayMs(env.TRONIX_RENT_429_RETRY_DELAY_MS) * (attempt + 1);

      console.warn('[tronix-rent] HTTP 429; retrying request', {
        path,
        attempt: attempt + 1,
        attempts,
        delayMs,
        retryAfter: error.retryAfter || null,
        payloadCode: error?.details?.payloadCode || null
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function createEnergyQuote({
  receiverAddress,
  energyAmount,
  bandwidthAmount,
  durationSeconds
}) {
  return requestJson('/v1/energy/quote', {
    method: 'POST',
    body: JSON.stringify({
      receiverAddress,
      energyAmount,
      bandwidthAmount,
      durationSeconds
    })
  });
}

async function createEnergyOrder(quoteId) {
  return requestJson('/v1/energy/orders', {
    method: 'POST',
    body: JSON.stringify({ quoteId })
  });
}

async function createSenderEnergyOrder({
  energyAmount,
  bandwidthAmount,
  durationSeconds
}) {
  return requestJson('/v1/energy/sender-orders', {
    method: 'POST',
    body: JSON.stringify({
      energyAmount,
      bandwidthAmount,
      durationSeconds
    })
  });
}

async function createFrontedEnergyOrder({
  receiverAddress,
  energyAmount,
  bandwidthAmount,
  durationSeconds,
  settlementType,
  metadata
}) {
  return requestJson('/v1/internal/energy/fronted-orders', {
    method: 'POST',
    body: JSON.stringify({
      receiverAddress,
      energyAmount,
      bandwidthAmount,
      durationSeconds,
      settlementType,
      metadata
    })
  });
}

async function getEnergyOrder(orderId) {
  return requestJson(`/v1/energy/orders/${encodeURIComponent(orderId)}`);
}

async function submitEnergyOrderPayment({ orderId, paymentTxHash }) {
  return requestJson(`/v1/energy/orders/${encodeURIComponent(orderId)}/payment`, {
    method: 'POST',
    body: JSON.stringify({ paymentTxHash })
  });
}

async function getDashboard({ force = false } = {}) {
  return requestJson(`/v1/dashboard${force ? '?force=true' : ''}`);
}

module.exports = {
  createEnergyQuote,
  createEnergyOrder,
  createFrontedEnergyOrder,
  createSenderEnergyOrder,
  getEnergyOrder,
  submitEnergyOrderPayment,
  getDashboard,
  isEnabled
};
