const crypto = require('crypto');
const { ProxyAgent, fetch: undiciFetch } = require('undici');
const env = require('../../config/env');
const { tronWeb } = require('../tron/client');

const SUN = 1_000_000;
const MIN_OPERATOR_RESERVE_SUN = 2 * SUN;
const DEFAULT_BACKGROUND_REPLENISH_RESERVE_SUN = SUN;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_BASE_URL = 'https://openapi.gasstation.ai';
const DEFAULT_SERVICE_CHARGE_TYPE = '10010';
const DEFAULT_RENTAL_MIN_MARKUP_SUN = SUN;
const MIN_ENERGY_ORDER = 64400;
const MIN_BANDWIDTH_ORDER = 5000;
const ROTATABLE_ERROR_PATTERN =
  /(rate|limit|too many|forbidden|403|429|insufficient|balance|inventory|quota|busy|timeout|network|fetch failed)/i;

let gasStationCredentialCursor = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertNonEmpty(value, fieldName) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

function normalizeTimeoutMs(value) {
  const parsed = Number(value ?? DEFAULT_TIMEOUT_MS);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.max(Math.floor(parsed), 1000);
}

function normalizePositiveInteger(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }

  return Math.ceil(parsed);
}

function safeFiniteNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function toSun(value) {
  const num = Number(value || 0);

  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }

  return Math.floor(num * SUN);
}

function fromSun(value) {
  const num = Number(value || 0);

  if (!Number.isFinite(num)) {
    return 0;
  }

  return num / SUN;
}

function normalizeSunAmount(value, fallback = 0) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function getRentalMarkupBps() {
  const parsed = Number(env.GASSTATION_RENTAL_MARKUP_BPS ?? 3000);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 3000;
  }

  return Math.floor(parsed);
}

function getRentalMinMarkupSun() {
  const parsed = Number(env.GASSTATION_RENTAL_MIN_MARKUP_SUN ?? DEFAULT_RENTAL_MIN_MARKUP_SUN);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_RENTAL_MIN_MARKUP_SUN;
  }

  return Math.floor(parsed);
}

function applyRentalMarkup(costAmountSun) {
  const costSun = normalizeSunAmount(costAmountSun);
  const markupBps = getRentalMarkupBps();
  const percentageMarkupSun = Math.ceil(costSun * markupBps / 10_000);
  const minMarkupSun = getRentalMinMarkupSun();
  const markupAmountSun = Math.max(percentageMarkupSun, minMarkupSun);
  const amountSun = costSun + markupAmountSun;

  return {
    amountSun,
    costAmountSun: costSun,
    markupAmountSun,
    markupBps,
    minMarkupSun
  };
}

function pkcs7Pad(buffer) {
  const blockSize = 16;
  const remainder = buffer.length % blockSize;
  const padLength = remainder === 0 ? blockSize : blockSize - remainder;
  const padding = Buffer.alloc(padLength, padLength);
  return Buffer.concat([buffer, padding]);
}

function encryptAesEcbPkcs7Base64(plainText, secretKey) {
  const key = Buffer.from(assertNonEmpty(secretKey, 'GASSTATION_API_SECRET'), 'utf8');

  if (![16, 24, 32].includes(key.length)) {
    throw new Error('GASSTATION_API_SECRET must be 16, 24, or 32 bytes long');
  }

  const plainBuffer = Buffer.from(plainText, 'utf8');
  const padded = pkcs7Pad(plainBuffer);

  const cipher = crypto.createCipheriv(`aes-${key.length * 8}-ecb`, key, null);
  cipher.setAutoPadding(false);

  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return encrypted.toString('base64');
}

async function performRequestJson({
  url,
  method = 'GET',
  dispatcher,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await undiciFetch(url, {
      method,
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal,
      dispatcher
    });

    const rawBody = await response.text();
    let parsed = null;

    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch (_) {
      throw new Error(
        `GasStation returned non-JSON response: status=${response.status}; body=${rawBody.slice(0, 300)}`
      );
    }

    if (!response.ok) {
      const apiMessage =
        parsed && typeof parsed.msg === 'string' && parsed.msg.trim()
          ? parsed.msg.trim()
          : null;

      throw new Error(
        apiMessage
          ? `GasStation HTTP ${response.status}: ${apiMessage}`
          : `GasStation HTTP ${response.status}; body=${rawBody.slice(0, 300)}`
      );
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('GasStation returned invalid response object');
    }

    const apiCode = safeFiniteNumber(parsed.code, NaN);

    if (!Number.isFinite(apiCode)) {
      throw new Error('GasStation response code is missing or invalid');
    }

    if (apiCode !== 0) {
      const apiMessage =
        typeof parsed.msg === 'string' && parsed.msg.trim()
          ? parsed.msg.trim()
          : `GasStation error ${apiCode}`;

      throw new Error(`GasStation error ${apiCode}: ${apiMessage}`);
    }

    return parsed.data ?? null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRequestError(error) {
  if (error?.name === 'AbortError') {
    return 'GasStation request timed out';
  }

  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return 'fetch failed';
}

async function requestJson({
  url,
  method = 'GET',
  proxyUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  let proxyDispatcher;

  if (!proxyUrl) {
    try {
      return await performRequestJson({
        url,
        method,
        timeoutMs
      });
    } catch (error) {
      throw new Error(`GasStation request failed: ${normalizeRequestError(error)}`);
    }
  }

  try {
    proxyDispatcher = new ProxyAgent(proxyUrl);

    return await performRequestJson({
      url,
      method,
      dispatcher: proxyDispatcher,
      timeoutMs
    });
  } catch (proxyError) {
    const proxyMessage = normalizeRequestError(proxyError);

    try {
      const directResult = await performRequestJson({
        url,
        method,
        timeoutMs
      });

      console.warn('[GasStation] proxy request failed, used direct fallback instead', {
        error: proxyMessage
      });

      return directResult;
    } catch (directError) {
      const directMessage = normalizeRequestError(directError);

      if (/fetch failed/i.test(proxyMessage) && /403|forbidden/i.test(directMessage)) {
        throw new Error(
          'GasStation proxy authentication failed or proxy is invalid; direct access is forbidden by GasStation whitelist'
        );
      }

      throw new Error(
        `GasStation proxy request failed: ${proxyMessage}; direct retry failed: ${directMessage}`
      );
    }
  } finally {
    if (proxyDispatcher) {
      try {
        await proxyDispatcher.close();
      } catch (_) {}
    }
  }
}

class GasStationClient {
  constructor(config) {
    this.appId = assertNonEmpty(config.appId, 'GASSTATION_API_KEY');
    this.secretKey = assertNonEmpty(config.secretKey, 'GASSTATION_API_SECRET');
    this.label = String(config.label || this.appId.slice(0, 8)).trim();
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.proxyUrl = config.proxyUrl ? String(config.proxyUrl).trim() : undefined;
    this.timeoutMs = normalizeTimeoutMs(config.timeoutMs);
  }

  buildEncryptedUrl(path, payload) {
    const plainText = JSON.stringify(payload);
    const encrypted = encryptAesEcbPkcs7Base64(plainText, this.secretKey);

    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('app_id', this.appId);
    url.searchParams.set('data', encrypted);

    return url.toString();
  }

  async getJson(path, payload, method = 'GET') {
    const url = this.buildEncryptedUrl(path, payload);

    return requestJson({
      url,
      method,
      proxyUrl: this.proxyUrl,
      timeoutMs: this.timeoutMs
    });
  }

  async getBalance() {
    return this.getJson(
      '/api/mpc/tron/gas/balance',
      {
        time: String(Math.floor(Date.now() / 1000))
      },
      'GET'
    );
  }

  async getPrice(resourceValue) {
    const payload = {
      service_charge_type: String(env.GASSTATION_SERVICE_CHARGE_TYPE || DEFAULT_SERVICE_CHARGE_TYPE)
    };

    if (resourceValue != null) {
      payload.value = normalizePositiveInteger(resourceValue, 'resourceValue');
    }

    return this.getJson('/api/tron/gas/order/price', payload, 'GET');
  }

  async createEnergyOrder({ requestId, receiveAddress, energyNum }) {
    const normalizedEnergyNum = normalizePositiveInteger(energyNum, 'energyNum');

    if (normalizedEnergyNum < MIN_ENERGY_ORDER) {
      throw new Error(`energyNum must be at least ${MIN_ENERGY_ORDER}`);
    }

    return this.getJson(
      '/api/tron/gas/create_order',
      {
        request_id: assertNonEmpty(requestId, 'requestId'),
        receive_address: assertNonEmpty(receiveAddress, 'receiveAddress'),
        buy_type: 0,
        service_charge_type: String(env.GASSTATION_SERVICE_CHARGE_TYPE || DEFAULT_SERVICE_CHARGE_TYPE),
        energy_num: normalizedEnergyNum
      },
      'POST'
    );
  }

  async createBandwidthOrder({ requestId, receiveAddress, netNum }) {
    const normalizedNetNum = normalizePositiveInteger(netNum, 'netNum');

    if (normalizedNetNum < MIN_BANDWIDTH_ORDER) {
      throw new Error(`netNum must be at least ${MIN_BANDWIDTH_ORDER}`);
    }

    return this.getJson(
      '/api/tron/gas/create_order',
      {
        request_id: assertNonEmpty(requestId, 'requestId'),
        receive_address: assertNonEmpty(receiveAddress, 'receiveAddress'),
        buy_type: 0,
        service_charge_type: String(env.GASSTATION_SERVICE_CHARGE_TYPE || DEFAULT_SERVICE_CHARGE_TYPE),
        net_num: normalizedNetNum
      },
      'POST'
    );
  }

  async getOrderList(requestIds) {
    return this.getJson(
      '/api/tron/gas/record/list',
      {
        request_ids: requestIds.join(',')
      },
      'GET'
    );
  }
}

function readCredentialsJson() {
  const raw = String(env.GASSTATION_CREDENTIALS_JSON || '').trim();

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw new Error(`Invalid GASSTATION_CREDENTIALS_JSON: ${error.message}`);
  }
}

function addCredential(list, input, fallbackLabel) {
  const appId = String(input?.appId || input?.appid || input?.APPID || input?.key || '').trim();
  const secretKey = String(
    input?.secretKey || input?.secret || input?.SecretKey || input?.GASSTATION_API_SECRET || ''
  ).trim();

  if (!appId || !secretKey) {
    return;
  }

  if (list.some((item) => item.appId === appId)) {
    return;
  }

  list.push({
    appId,
    secretKey,
    label: String(input?.label || input?.name || fallbackLabel || appId.slice(0, 8)).trim()
  });
}

function getGasStationCredentials() {
  const credentials = [];

  readCredentialsJson().forEach((item, index) => {
    addCredential(credentials, item, `json_${index + 1}`);
  });

  [
    {
      appId: env.GASSTATION_API_KEY,
      secretKey: env.GASSTATION_API_SECRET,
      label: 'default'
    },
    {
      appId: env.GASSTATION_API_KEY_1,
      secretKey: env.GASSTATION_API_SECRET_1,
      label: 'wallet_1'
    },
    {
      appId: env.GASSTATION_API_KEY_2,
      secretKey: env.GASSTATION_API_SECRET_2,
      label: 'wallet_2'
    },
    {
      appId: env.GASSTATION_API_KEY_3,
      secretKey: env.GASSTATION_API_SECRET_3,
      label: 'wallet_3'
    }
  ].forEach((item) => addCredential(credentials, item, item.label));

  return credentials;
}

function createGasStationClient(credential) {
  return new GasStationClient({
    ...credential,
    baseUrl: env.GASSTATION_API_BASE_URL,
    proxyUrl: env.QUOTAGUARDSTATIC_URL,
    timeoutMs: Number(process.env.GASSTATION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  });
}

function createGasStationClientFromEnv() {
  const credentials = getGasStationCredentials();

  if (!credentials.length) {
    return createGasStationClient({
      appId: env.GASSTATION_API_KEY,
      secretKey: env.GASSTATION_API_SECRET,
      label: 'default'
    });
  }

  const index = gasStationCredentialCursor % credentials.length;
  gasStationCredentialCursor = (gasStationCredentialCursor + 1) % credentials.length;

  return createGasStationClient(credentials[index]);
}

function isRotatableGasStationError(error) {
  return ROTATABLE_ERROR_PATTERN.test(String(error?.message || ''));
}

async function withGasStationClientPool(operation) {
  const credentials = getGasStationCredentials();

  if (!credentials.length) {
    return operation(createGasStationClientFromEnv());
  }

  const start = gasStationCredentialCursor % credentials.length;
  const errors = [];

  for (let i = 0; i < credentials.length; i += 1) {
    const index = (start + i) % credentials.length;
    const client = createGasStationClient(credentials[index]);

    try {
      const result = await operation(client);
      gasStationCredentialCursor = (index + 1) % credentials.length;
      return result;
    } catch (error) {
      errors.push(`${client.label}: ${error.message}`);

      if (!isRotatableGasStationError(error) || i === credentials.length - 1) {
        throw error;
      }
    }
  }

  throw new Error(`All GasStation credentials failed: ${errors.join('; ')}`);
}

function buildRequestId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

async function waitForOrderSuccess(client, requestId, { attempts = 20, delayMs = 3000 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const rows = await client.getOrderList([requestId]);
    const row = Array.isArray(rows) ? rows[0] : null;

    if (row) {
      const status = Number(row.status);

      if (status === 1 || status === 10) {
        return row;
      }

      if (status === 2) {
        throw new Error(`Gas Station order failed for request_id=${requestId}`);
      }
    }

    await sleep(delayMs);
  }

  throw new Error(`Gas Station order timeout for request_id=${requestId}`);
}

async function getOperatorState() {
  const account = await tronWeb.trx.getAccount(env.OPERATOR_WALLET);
  const resources = await tronWeb.trx.getAccountResources(env.OPERATOR_WALLET);
  const balanceSun = Number(await tronWeb.trx.getBalance(env.OPERATOR_WALLET) || 0);

  const freeNetLimit = Number(account?.freeNetLimit || 0);
  const freeNetUsed = Number(account?.freeNetUsed || 0);
  const netLimit = Number(account?.NetLimit || 0);
  const netUsed = Number(account?.NetUsed || 0);

  const energyLimit = Number(resources?.EnergyLimit || 0);
  const energyUsed = Number(resources?.EnergyUsed || 0);

  const availableBandwidth = Math.max(0, freeNetLimit - freeNetUsed) + Math.max(0, netLimit - netUsed);
  const availableEnergy = Math.max(0, energyLimit - energyUsed);

  return {
    wallet: env.OPERATOR_WALLET,
    balanceSun,
    balanceTrx: fromSun(balanceSun),
    availableEnergy,
    availableBandwidth
  };
}

function getOperatorPrivateKey() {
  return assertNonEmpty(
    env.OPERATOR_WALLET_PRIVATE_KEY ||
      env.MANAGER_WALLET_PRIVATE_KEY ||
      env.TRON_PRIVATE_KEY,
    'OPERATOR_WALLET_PRIVATE_KEY'
  );
}

async function sendTrx(toAddress, amountSun) {
  const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
    toAddress,
    amountSun,
    env.OPERATOR_WALLET
  );

  const signedTx = await tronWeb.trx.sign(unsignedTx, getOperatorPrivateKey());
  const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!broadcast?.result) {
    throw new Error('Failed to top up Gas Station deposit address');
  }

  return String(broadcast.txid || signedTx.txID || '');
}

async function resolveGasStationDepositAddress(client, gasBalance = null) {
  const configured = String(env.GASSTATION_DEPOSIT_ADDRESS || '').trim();

  if (configured) {
    return configured;
  }

  const balance = gasBalance || await client.getBalance();
  return String(balance?.deposit_address || '').trim();
}

async function waitForOperatorTopUpCapacity(requiredTopUpSun, minRetainedSun = MIN_OPERATOR_RESERVE_SUN) {
  const requiredSpendableSun = normalizeSunAmount(requiredTopUpSun);
  const requiredRetainedSun = normalizeSunAmount(minRetainedSun);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const operator = await getOperatorState();

    if (operator.balanceSun >= requiredSpendableSun + requiredRetainedSun) {
      return {
        operator,
        waited: attempt > 0,
        attempts: attempt + 1
      };
    }

    if (attempt < 19) {
      await sleep(3000);
    }
  }

  const operator = await getOperatorState();
  const error = new Error('Operator wallet does not have enough confirmed TRX for Gas Station top up yet');
  error.details = {
    requiredTopUpSun: requiredSpendableSun,
    minRetainedSun: requiredRetainedSun,
    operatorBalanceSun: operator.balanceSun
  };
  throw error;
}

async function topUpGasStationIfNeeded(client, requiredAmountSun, options = {}) {
  const gasBalance = await client.getBalance();
  const currentGasBalanceSun = toSun(gasBalance?.balance || 0);
  const requiredSun = normalizeSunAmount(requiredAmountSun);

  if (currentGasBalanceSun >= requiredSun) {
    return {
      toppedUp: false,
      gasStationBalanceSun: currentGasBalanceSun,
      depositAddress: gasBalance?.deposit_address || null,
      topUpTxHash: null,
      topUpAmountSun: 0,
      waitedForOperator: false
    };
  }

  const requiredTopUpSun = Math.max(0, requiredSun - currentGasBalanceSun);
  const { waited } = await waitForOperatorTopUpCapacity(
    requiredTopUpSun,
    options.minOperatorRetainedSun ?? MIN_OPERATOR_RESERVE_SUN
  );

  if (requiredTopUpSun <= 0) {
    throw new Error('Gas Station top up amount is not positive');
  }

  const depositAddress = await resolveGasStationDepositAddress(client, gasBalance);

  if (!depositAddress) {
    throw new Error('Gas Station did not return deposit_address');
  }

  const topUpTxHash = await sendTrx(depositAddress, requiredTopUpSun);

  for (let i = 0; i < 15; i += 1) {
    await sleep(3000);

    const reloaded = await client.getBalance();
    const reloadedSun = toSun(reloaded?.balance || 0);

    if (reloadedSun >= requiredAmountSun) {
      return {
        toppedUp: true,
        gasStationBalanceSun: reloadedSun,
        depositAddress,
        topUpTxHash,
        topUpAmountSun: requiredTopUpSun,
        waitedForOperator: waited
      };
    }
  }

  throw new Error('Gas Station balance did not update after top up');
}

async function replenishGasStationCost(client, costAmountSunInput, minRetainedSunInput = 0) {
  const topUpAmountSun = normalizeSunAmount(costAmountSunInput);
  const minRetainedSun = normalizeSunAmount(minRetainedSunInput);

  if (topUpAmountSun <= 0) {
    return {
      toppedUp: false,
      reason: 'cost amount is not positive',
      minRetainedSun,
      topUpAmountSun
    };
  }

  const { waited } = await waitForOperatorTopUpCapacity(topUpAmountSun, minRetainedSun);

  const depositAddress = await resolveGasStationDepositAddress(client);
  const topUpTxHash = await sendTrx(depositAddress, topUpAmountSun);

  return {
    toppedUp: true,
    minRetainedSun,
    topUpAmountSun,
    depositAddress,
    topUpTxHash,
    waitedForOperator: waited
  };
}

function scheduleGasStationReplenishment(client, costAmountSun, context = {}) {
  const amountSun = normalizeSunAmount(costAmountSun);
  const minRetainedSun = normalizeSunAmount(
    context.minRetainedSun,
    normalizeSunAmount(
      env.GASSTATION_BACKGROUND_REPLENISH_RESERVE_SUN,
      DEFAULT_BACKGROUND_REPLENISH_RESERVE_SUN
    )
  );

  if (amountSun <= 0) {
    return null;
  }

  const task = async () => {
    try {
      const result = await replenishGasStationCost(client, amountSun, minRetainedSun);
      console.info('[GasStation] background replenish complete', {
        purpose: context.purpose || null,
        paymentTxid: context.paymentTxid || null,
        toppedUp: result.toppedUp,
        topUpAmountSun: result.topUpAmountSun,
        topUpTxHash: result.topUpTxHash || null
      });
      return result;
    } catch (error) {
      console.error('[GasStation] background replenish failed', {
        purpose: context.purpose || null,
        paymentTxid: context.paymentTxid || null,
        error: error.message
      });
      return null;
    }
  };

  setTimeout(() => {
    task().catch(() => null);
  }, 0);

  return {
    scheduled: true,
    paymentAmountSun: amountSun,
    reserveSun: minRetainedSun
  };
}

function computeRequiredOrders(state) {
  const minEnergy = Number(env.GASSTATION_MIN_ENERGY || 64400);
  const minBandwidth = Number(env.GASSTATION_MIN_BANDWIDTH || 5000);

  const energyDeficit = Math.max(0, minEnergy - Number(state.availableEnergy || 0));
  const bandwidthDeficit = Math.max(0, minBandwidth - Number(state.availableBandwidth || 0));

  return {
    needEnergy: energyDeficit > 0,
    needBandwidth: bandwidthDeficit > 0,
    energyQuantity: energyDeficit > 0 ? Math.max(minEnergy, energyDeficit) : 0,
    bandwidthQuantity: bandwidthDeficit > 0 ? Math.max(minBandwidth, bandwidthDeficit) : 0
  };
}

async function estimateRentalCostSun(client, orders) {
  let total = 0;
  const details = [];

  if (orders.energyQuantity > 0) {
    const priceData = await client.getPrice(orders.energyQuantity);
    const list = Array.isArray(priceData?.price_builder_list)
      ? priceData.price_builder_list
      : Array.isArray(priceData?.list)
        ? priceData.list
        : [];

    const selected = list.find(
      (item) => String(item?.service_charge_type || '') === String(env.GASSTATION_SERVICE_CHARGE_TYPE || DEFAULT_SERVICE_CHARGE_TYPE)
    ) || list[0];

    if (!selected) {
      throw new Error('Gas Station did not return energy price');
    }

    const unitPriceSun = Math.ceil(Number(selected?.price || 0));
    const remainingNumber = Number(selected?.remaining_number || 0);

    if (remainingNumber > 0 && orders.energyQuantity > remainingNumber) {
      throw new Error('Gas Station energy inventory is insufficient for requested amount');
    }

    const amountSun = Math.ceil(orders.energyQuantity * unitPriceSun);

    total += amountSun;
    details.push({
      resourceType: 'energy',
      quantity: orders.energyQuantity,
      unitPriceSun,
      amountSun
    });
  }

  if (orders.bandwidthQuantity > 0) {
    const priceData = await client.getPrice(orders.bandwidthQuantity);
    const list = Array.isArray(priceData?.price_builder_list)
      ? priceData.price_builder_list
      : Array.isArray(priceData?.list)
        ? priceData.list
        : [];

    const selected = list.find(
      (item) => String(item?.service_charge_type || '') === String(env.GASSTATION_SERVICE_CHARGE_TYPE || DEFAULT_SERVICE_CHARGE_TYPE)
    ) || list[0];

    if (!selected) {
      throw new Error('Gas Station did not return bandwidth price');
    }

    const unitPriceSun = Math.ceil(Number(selected?.price || 0));
    const remainingNumber = Number(selected?.remaining_number || 0);

    if (remainingNumber > 0 && orders.bandwidthQuantity > remainingNumber) {
      throw new Error('Gas Station bandwidth inventory is insufficient for requested amount');
    }

    const amountSun = Math.ceil(orders.bandwidthQuantity * unitPriceSun);

    total += amountSun;
    details.push({
      resourceType: 'net',
      quantity: orders.bandwidthQuantity,
      unitPriceSun,
      amountSun
    });
  }

  return {
    totalAmountSun: total,
    details
  };
}

async function ensureOperatorResources() {
  const before = await getOperatorState();
  const orders = computeRequiredOrders(before);

  if (!orders.needEnergy && !orders.needBandwidth) {
    return {
      rented: false,
      before,
      after: before,
      orders: [],
      topUp: null
    };
  }

  if (!String(env.GASSTATION_ENABLED).toLowerCase().includes('true')) {
    throw new Error('Gas Station is disabled but operator resources are insufficient');
  }

  return withGasStationClientPool(async (client) => {
    const estimate = await estimateRentalCostSun(client, orders);
    const topUp = await topUpGasStationIfNeeded(client, estimate.totalAmountSun);

    const createdOrders = [];

    if (orders.energyQuantity > 0) {
      const requestId = buildRequestId('energy');
      const created = await client.createEnergyOrder({
        requestId,
        receiveAddress: env.OPERATOR_WALLET,
        energyNum: orders.energyQuantity
      });

      const finalRow = await waitForOrderSuccess(client, requestId);

      createdOrders.push({
        resourceType: 'energy',
        requestId,
        tradeNo: String(created?.trade_no || ''),
        quantity: orders.energyQuantity,
        row: finalRow || null
      });
    }

    if (orders.bandwidthQuantity > 0) {
      const requestId = buildRequestId('net');
      const created = await client.createBandwidthOrder({
        requestId,
        receiveAddress: env.OPERATOR_WALLET,
        netNum: orders.bandwidthQuantity
      });

      const finalRow = await waitForOrderSuccess(client, requestId);

      createdOrders.push({
        resourceType: 'net',
        requestId,
        tradeNo: String(created?.trade_no || ''),
        quantity: orders.bandwidthQuantity,
        row: finalRow || null
      });
    }

    await sleep(2000);

    const after = await getOperatorState();

    return {
      rented: true,
      before,
      after,
      orders: createdOrders,
      topUp,
      gasStationAccount: client.label
    };
  });
}

async function quoteEnergyRental({ energyNum }) {
  const normalizedEnergyNum = normalizePositiveInteger(energyNum, 'energyNum');

  return withGasStationClientPool(async (client) => {
    const estimate = await estimateRentalCostSun(client, {
      energyQuantity: normalizedEnergyNum,
      bandwidthQuantity: 0
    });
    const marked = applyRentalMarkup(estimate.totalAmountSun);

    return {
      energyQuantity: normalizedEnergyNum,
      amountSun: marked.amountSun,
      amountTrx: fromSun(marked.amountSun),
      costAmountSun: marked.costAmountSun,
      costAmountTrx: fromSun(marked.costAmountSun),
      markupAmountSun: marked.markupAmountSun,
      markupAmountTrx: fromSun(marked.markupAmountSun),
      markupBps: marked.markupBps,
      minMarkupSun: marked.minMarkupSun,
      minMarkupTrx: fromSun(marked.minMarkupSun),
      estimate,
      gasStationAccount: client.label
    };
  });
}

async function quoteResourceRental({ energyNum = 0, bandwidthNum = 0 }) {
  const energyQuantity = Number(energyNum || 0) > 0
    ? Math.max(MIN_ENERGY_ORDER, normalizePositiveInteger(energyNum, 'energyNum'))
    : 0;
  const bandwidthQuantity = Number(bandwidthNum || 0) > 0
    ? Math.max(MIN_BANDWIDTH_ORDER, normalizePositiveInteger(bandwidthNum, 'bandwidthNum'))
    : 0;

  if (energyQuantity <= 0 && bandwidthQuantity <= 0) {
    throw new Error('energyNum or bandwidthNum is required');
  }

  return withGasStationClientPool(async (client) => {
    const estimate = await estimateRentalCostSun(client, {
      energyQuantity,
      bandwidthQuantity
    });
    const marked = applyRentalMarkup(estimate.totalAmountSun);

    return {
      energyQuantity,
      bandwidthQuantity,
      amountSun: marked.amountSun,
      amountTrx: fromSun(marked.amountSun),
      costAmountSun: marked.costAmountSun,
      costAmountTrx: fromSun(marked.costAmountSun),
      markupAmountSun: marked.markupAmountSun,
      markupAmountTrx: fromSun(marked.markupAmountSun),
      markupBps: marked.markupBps,
      minMarkupSun: marked.minMarkupSun,
      minMarkupTrx: fromSun(marked.minMarkupSun),
      estimate,
      gasStationAccount: client.label
    };
  });
}

async function rentEnergyForWallet({
  receiveAddress,
  energyNum,
  requestPrefix = 'energy',
  paymentAmountSun = 0,
  context = {}
}) {
  if (!String(env.GASSTATION_ENABLED).toLowerCase().includes('true')) {
    throw new Error('Gas Station is disabled');
  }

  const normalizedEnergyNum = normalizePositiveInteger(energyNum, 'energyNum');

  return withGasStationClientPool(async (client) => {
    const estimate = await estimateRentalCostSun(client, {
      energyQuantity: normalizedEnergyNum,
      bandwidthQuantity: 0
    });
    const retainedSun = Math.max(0, normalizeSunAmount(paymentAmountSun) - estimate.totalAmountSun);
    const topUp = await topUpGasStationIfNeeded(client, estimate.totalAmountSun, {
      minOperatorRetainedSun: retainedSun > 0 ? retainedSun : MIN_OPERATOR_RESERVE_SUN
    });
    const replenishCostSun = Math.max(0, estimate.totalAmountSun - normalizeSunAmount(topUp?.topUpAmountSun));
    const backgroundReplenishment = scheduleGasStationReplenishment(client, replenishCostSun, {
      ...context,
      purpose: context.purpose || requestPrefix,
      minRetainedSun: retainedSun > 0 ? retainedSun : MIN_OPERATOR_RESERVE_SUN
    });
    const requestId = buildRequestId(requestPrefix);
    const created = await client.createEnergyOrder({
      requestId,
      receiveAddress: assertNonEmpty(receiveAddress, 'receiveAddress'),
      energyNum: normalizedEnergyNum
    });
    const finalRow = await waitForOrderSuccess(client, requestId);

    return {
      rented: true,
      resourceType: 'energy',
      requestId,
      tradeNo: String(created?.trade_no || ''),
      quantity: normalizedEnergyNum,
      row: finalRow || null,
      estimate,
      topUp,
      backgroundReplenishment,
      gasStationAccount: client.label
    };
  });
}

async function rentResourcesForWallet({
  receiveAddress,
  energyNum = 0,
  bandwidthNum = 0,
  requestPrefix = 'resource',
  paymentAmountSun = 0,
  context = {}
}) {
  if (!String(env.GASSTATION_ENABLED).toLowerCase().includes('true')) {
    throw new Error('Gas Station is disabled');
  }

  const energyQuantity = Number(energyNum || 0) > 0
    ? Math.max(MIN_ENERGY_ORDER, normalizePositiveInteger(energyNum, 'energyNum'))
    : 0;
  const bandwidthQuantity = Number(bandwidthNum || 0) > 0
    ? Math.max(MIN_BANDWIDTH_ORDER, normalizePositiveInteger(bandwidthNum, 'bandwidthNum'))
    : 0;

  if (energyQuantity <= 0 && bandwidthQuantity <= 0) {
    throw new Error('energyNum or bandwidthNum is required');
  }

  return withGasStationClientPool(async (client) => {
    const estimate = await estimateRentalCostSun(client, {
      energyQuantity,
      bandwidthQuantity
    });
    const retainedSun = Math.max(0, normalizeSunAmount(paymentAmountSun) - estimate.totalAmountSun);
    const topUp = await topUpGasStationIfNeeded(client, estimate.totalAmountSun, {
      minOperatorRetainedSun: retainedSun > 0 ? retainedSun : MIN_OPERATOR_RESERVE_SUN
    });
    const replenishCostSun = Math.max(0, estimate.totalAmountSun - normalizeSunAmount(topUp?.topUpAmountSun));
    const backgroundReplenishment = scheduleGasStationReplenishment(client, replenishCostSun, {
      ...context,
      purpose: context.purpose || requestPrefix,
      minRetainedSun: retainedSun > 0 ? retainedSun : MIN_OPERATOR_RESERVE_SUN
    });
    const createdOrders = [];

    if (energyQuantity > 0) {
      const requestId = buildRequestId(`${requestPrefix}-energy`);
      const created = await client.createEnergyOrder({
        requestId,
        receiveAddress: assertNonEmpty(receiveAddress, 'receiveAddress'),
        energyNum: energyQuantity
      });
      const finalRow = await waitForOrderSuccess(client, requestId);

      createdOrders.push({
        resourceType: 'energy',
        requestId,
        tradeNo: String(created?.trade_no || ''),
        quantity: energyQuantity,
        row: finalRow || null
      });
    }

    if (bandwidthQuantity > 0) {
      const requestId = buildRequestId(`${requestPrefix}-net`);
      const created = await client.createBandwidthOrder({
        requestId,
        receiveAddress: assertNonEmpty(receiveAddress, 'receiveAddress'),
        netNum: bandwidthQuantity
      });
      const finalRow = await waitForOrderSuccess(client, requestId);

      createdOrders.push({
        resourceType: 'net',
        requestId,
        tradeNo: String(created?.trade_no || ''),
        quantity: bandwidthQuantity,
        row: finalRow || null
      });
    }

    return {
      rented: true,
      energyQuantity,
      bandwidthQuantity,
      orders: createdOrders,
      estimate,
      topUp,
      backgroundReplenishment,
      gasStationAccount: client.label
    };
  });
}

module.exports = {
  getGasStationCredentials,
  ensureOperatorResources,
  quoteEnergyRental,
  quoteResourceRental,
  rentEnergyForWallet,
  rentResourcesForWallet
};
