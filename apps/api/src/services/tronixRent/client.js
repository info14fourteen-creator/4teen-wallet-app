const { fetch: undiciFetch } = require('undici');
const env = require('../../config/env');

const DEFAULT_BASE_URL = 'https://tronix.rent';
const DEFAULT_TIMEOUT_MS = 15000;

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

async function requestJson(path, options = {}) {
  if (!isEnabled()) {
    const error = new Error('TronixRent is disabled');
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    normalizeTimeoutMs(env.TRONIX_RENT_TIMEOUT_MS)
  );

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
      throw error;
    }

    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.error || `TronixRent HTTP ${response.status}`);
      error.status = response.status || 502;
      error.payload = payload;
      throw error;
    }

    return payload?.result ?? payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('TronixRent request timed out');
      timeoutError.status = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  createSenderEnergyOrder,
  getEnergyOrder,
  submitEnergyOrderPayment,
  getDashboard,
  isEnabled
};
