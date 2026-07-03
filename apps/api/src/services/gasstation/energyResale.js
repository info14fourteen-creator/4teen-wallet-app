const env = require('../../config/env');
const { pool } = require('../../db/pool');
const { tronWeb } = require('../tron/client');
const { readTrxPayment } = require('../tron/payments');
const {
  quoteResourceRental,
  rentResourcesForWallet
} = require('./gasStation');
const {
  createEnergyQuote: createTronixEnergyQuote,
  createEnergyOrder: createTronixEnergyOrder,
  getEnergyOrder: getTronixEnergyOrder,
  submitEnergyOrderPayment: submitTronixEnergyOrderPayment,
  isEnabled: isTronixRentEnabled
} = require('../tronixRent/client');

const SUN = 1_000_000n;
const API_QUOTE_CACHE_TTL_MS = 30_000;
const apiQuoteCache = new Map();
const apiQuoteInflight = new Map();

function normalizePurpose(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 64);
}

function normalizeWallet(value) {
  return String(value || '').trim();
}

function normalizeResourceRequirement(value) {
  const numeric = Number(value || 0);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.ceil(numeric);
}

function normalizeTxid(value) {
  return String(value || '').trim().toLowerCase();
}

function buildApiQuoteCacheKey({ purpose, requiredEnergy, requiredBandwidth }) {
  return [
    purpose,
    Number(requiredEnergy || 0),
    Number(requiredBandwidth || 0)
  ].join(':');
}

function readCachedApiQuote(key) {
  const cached = apiQuoteCache.get(key);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    apiQuoteCache.delete(key);
    return null;
  }

  return cached.value;
}

function writeCachedApiQuote(key, value) {
  apiQuoteCache.set(key, {
    value,
    expiresAt: Date.now() + API_QUOTE_CACHE_TTL_MS
  });
}

function getEnergyRentalMode() {
  const mode = String(
    env.ENERGY_RENTAL_MODE || env.GASSTATION_ENERGY_RENTAL_MODE || ''
  ).trim().toLowerCase();

  if (mode === 'tronix' || mode === 'tronixrent' || mode === 'tronix_rent') {
    return 'tronix';
  }

  if (mode === 'api') {
    return 'api';
  }

  if (mode === 'resale') {
    return 'resale';
  }

  return isTronixRentEnabled() ? 'tronix' : (isGasStationApiEnabled() ? 'api' : 'resale');
}

function isGasStationApiEnabled() {
  return String(env.GASSTATION_ENABLED || '').toLowerCase().includes('true');
}

function isValidTronAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value || '').trim());
}

function formatSunAsTrx(value) {
  const raw = String(value || '0').trim();

  if (!/^\d+$/.test(raw)) {
    return '0';
  }

  const sun = BigInt(raw);
  const whole = sun / SUN;
  const fraction = String(sun % SUN).padStart(6, '0').replace(/0+$/, '');

  return fraction ? `${whole}.${fraction}` : String(whole);
}

function parseTrxToSun(value) {
  const raw = String(value || '').trim();

  if (!/^\d+(\.\d{1,6})?$/.test(raw)) {
    return '';
  }

  const [whole, fraction = ''] = raw.split('.');
  return String((BigInt(whole) * SUN) + BigInt(fraction.padEnd(6, '0')));
}

function readJsonConfig(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    throw new Error(`Invalid GASSTATION_RESALE_PACKAGES_JSON: ${error.message}`);
  }
}

function normalizePackageConfig(purpose, input) {
  const source = input && typeof input === 'object' ? input : {};
  const paymentAddress = normalizeWallet(source.paymentAddress || source.payment_address);
  const amountSun =
    String(source.amountSun || source.amount_sun || '').trim() ||
    parseTrxToSun(source.amountTrx || source.amount_trx);
  const energyQuantity = Math.max(0, Number(source.energyQuantity || source.energy_quantity || 0));
  const readyEnergy = Math.max(0, Number(source.readyEnergy || source.ready_energy || 0));
  const rentalPeriodSeconds = Math.max(
    0,
    Number(source.rentalPeriodSeconds || source.rental_period_seconds || 0)
  );

  return {
    purpose,
    mode: 'resale',
    paymentAddress,
    amountSun,
    amountTrx: formatSunAsTrx(amountSun),
    energyQuantity,
    readyEnergy: readyEnergy || Math.max(energyQuantity * 0.8, 0),
    rentalPeriodSeconds,
    label: String(source.label || purpose).trim()
  };
}

function applyPackageRequirements(packageConfig, requirements = {}) {
  const requiredEnergy = normalizeResourceRequirement(
    requirements.requiredEnergy || requirements.energyShortfall
  );
  const requiredBandwidth = normalizeResourceRequirement(
    requirements.requiredBandwidth || requirements.bandwidthShortfall
  );
  const packageEnergy = Math.max(
    1,
    normalizeResourceRequirement(packageConfig.readyEnergy || packageConfig.energyQuantity)
  );
  const packageCount = requiredEnergy > packageEnergy
    ? Math.ceil(requiredEnergy / packageEnergy)
    : 1;

  if (packageCount <= 1) {
    return {
      ...packageConfig,
      packageCount: 1,
      requiredEnergy,
      requiredBandwidth
    };
  }

  const amountSun = (BigInt(packageConfig.amountSun) * BigInt(packageCount)).toString();
  const energyQuantity = normalizeResourceRequirement(packageConfig.energyQuantity) * packageCount;
  const readyEnergy = normalizeResourceRequirement(packageConfig.readyEnergy) * packageCount;

  return {
    ...packageConfig,
    amountSun,
    amountTrx: formatSunAsTrx(amountSun),
    energyQuantity,
    readyEnergy,
    packageCount,
    requiredEnergy,
    requiredBandwidth,
    label: `${packageConfig.label || packageConfig.purpose} x${packageCount}`
  };
}

function getFallbackRegistrationPackage(purpose) {
  if (purpose !== 'ambassador_registration') {
    return null;
  }

  return normalizePackageConfig(purpose, {
    paymentAddress: env.GASSTATION_RESALE_REGISTRATION_PAYMENT_ADDRESS,
    amountSun: env.GASSTATION_RESALE_REGISTRATION_AMOUNT_SUN,
    amountTrx: env.GASSTATION_RESALE_REGISTRATION_AMOUNT_TRX,
    energyQuantity: env.GASSTATION_REGISTRATION_ENERGY,
    readyEnergy: env.GASSTATION_RESALE_REGISTRATION_READY_ENERGY,
    label: 'Ambassador registration'
  });
}

function getDefaultPurposeRequirements(purpose) {
  if (purpose !== 'ambassador_registration') {
    return {
      requiredEnergy: 0,
      requiredBandwidth: 0
    };
  }

  return {
    requiredEnergy: Math.max(
      100000,
      Number(env.GASSTATION_REGISTRATION_ENERGY || 0),
      Number(env.GASSTATION_MIN_ENERGY || 0)
    ),
    requiredBandwidth: 0
  };
}

function getApiRentalPaymentAddress() {
  return normalizeWallet(env.OPERATOR_WALLET);
}

function getDefaultRentalDurationSeconds() {
  const parsed = Number(env.TRONIX_RENT_DEFAULT_DURATION_SECONDS || 3600);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 3600;
  }

  return Math.floor(parsed);
}

function mapTronixStatus(order) {
  const paymentStatus = String(order?.paymentStatus || '').trim().toLowerCase();
  const fulfillmentStatus = String(order?.fulfillmentStatus || '').trim().toLowerCase();

  if (fulfillmentStatus === 'completed') {
    return 'completed';
  }

  if (fulfillmentStatus === 'failed' || paymentStatus === 'failed' || paymentStatus === 'expired') {
    return 'failed';
  }

  if (paymentStatus === 'confirmed' || paymentStatus === 'submitted') {
    return 'processing_tronix';
  }

  return 'waiting_tronix_payment';
}

function mapTronixOrderToPackage({ purpose, wallet, quote, order, requiredEnergy, requiredBandwidth }) {
  const energyQuantity = Number(order?.energyAmount || quote?.energyAmount || requiredEnergy || 0);
  const bandwidthQuantity = Number(
    order?.bandwidthAmount || quote?.bandwidthAmount || requiredBandwidth || 0
  );
  const amountSun = String(order?.paymentAmountSun || quote?.amountSun || '0');

  return {
    purpose,
    mode: 'tronix',
    provider: 'tronix_rent',
    wallet,
    paymentAddress: String(order?.paymentAddress || '').trim(),
    amountSun,
    amountTrx: String(order?.paymentAmountTrx || quote?.amountTrx || formatSunAsTrx(amountSun)),
    energyQuantity,
    readyEnergy: requiredEnergy > 0 ? requiredEnergy : energyQuantity,
    bandwidthQuantity,
    readyBandwidth: requiredBandwidth > 0 ? requiredBandwidth : bandwidthQuantity,
    packageCount: 1,
    requiredEnergy,
    requiredBandwidth,
    rentalPeriodSeconds: Number(order?.durationSeconds || quote?.durationSeconds || 0),
    label: 'TronixRent Smart Router',
    quoteId: String(order?.quoteId || quote?.quoteId || '').trim(),
    orderId: String(order?.orderId || '').trim(),
    expiresAt: order?.expiresAt || quote?.expiresAt || null,
    route: order?.route || quote?.route || null,
    included: order?.included || quote?.included || null
  };
}

async function createTronixRentPackage({ purpose, wallet, requiredEnergy, requiredBandwidth }) {
  if (!isValidTronAddress(wallet)) {
    const error = new Error('wallet is required for TronixRent rental');
    error.status = 400;
    throw error;
  }

  const quote = await createTronixEnergyQuote({
    receiverAddress: wallet,
    energyAmount: requiredEnergy,
    bandwidthAmount: requiredBandwidth,
    durationSeconds: getDefaultRentalDurationSeconds()
  });
  const order = await createTronixEnergyOrder(quote.quoteId);

  return mapTronixOrderToPackage({
    purpose,
    wallet,
    quote,
    order,
    requiredEnergy,
    requiredBandwidth
  });
}

function shouldRetryPendingEnergyRentalError(error) {
  const message = String(error?.message || '').trim().toLowerCase();

  return (
    message.includes('operator wallet does not have enough confirmed trx') ||
    message.includes('failed to top up gas station deposit address') ||
    message.includes('gas station balance did not update after top up') ||
    message.includes('gasstation request timed out') ||
    message.includes('fetch failed')
  );
}

function getResalePackage(purposeInput, requirements = {}) {
  const purpose = normalizePurpose(purposeInput);

  if (!purpose) {
    const error = new Error('purpose is required');
    error.status = 400;
    throw error;
  }

  const packages = readJsonConfig(env.GASSTATION_RESALE_PACKAGES_JSON);
  const packageConfig = normalizePackageConfig(purpose, packages[purpose]);
  const fallback = getFallbackRegistrationPackage(purpose);
  const resolved = packageConfig.paymentAddress || packageConfig.amountSun ? packageConfig : fallback;

  if (!resolved || !isValidTronAddress(resolved.paymentAddress)) {
    const error = new Error(`GasStation resale package is not configured for purpose=${purpose}`);
    error.status = 503;
    throw error;
  }

  if (!/^\d+$/.test(String(resolved.amountSun || '')) || BigInt(resolved.amountSun) <= 0n) {
    const error = new Error(`GasStation resale package amount is not configured for purpose=${purpose}`);
    error.status = 503;
    throw error;
  }

  return applyPackageRequirements(resolved, requirements);
}

async function getEnergyResalePackage(purposeInput, requirements = {}) {
  const purpose = normalizePurpose(purposeInput);
  const wallet = normalizeWallet(requirements.wallet || requirements.walletAddress);
  const defaults = getDefaultPurposeRequirements(purpose);
  const requiredEnergy = normalizeResourceRequirement(
    requirements.requiredEnergy || requirements.energyShortfall
  ) || defaults.requiredEnergy;
  const requiredBandwidth = normalizeResourceRequirement(
    requirements.requiredBandwidth || requirements.bandwidthShortfall
  ) || defaults.requiredBandwidth;

  const readApiQuote = async () => {
    const cacheKey = buildApiQuoteCacheKey({
      purpose,
      requiredEnergy,
      requiredBandwidth
    });
    const cached = readCachedApiQuote(cacheKey);

    if (cached) {
      return cached;
    }

    const inflight = apiQuoteInflight.get(cacheKey);

    if (inflight) {
      return inflight;
    }

    const quotePromise = (async () => {
      const quote = await quoteResourceRental({
        energyNum: requiredEnergy,
        bandwidthNum: requiredBandwidth
      });
      const amountSun = String(Math.ceil(Number(quote.amountSun || 0)));
      const mapped = {
        purpose,
        mode: 'api',
        paymentAddress: getApiRentalPaymentAddress(),
        amountSun,
        amountTrx: formatSunAsTrx(amountSun),
        costAmountSun: String(quote.costAmountSun || ''),
        costAmountTrx: quote.costAmountTrx,
        markupAmountSun: String(quote.markupAmountSun || ''),
        markupAmountTrx: quote.markupAmountTrx,
        markupBps: quote.markupBps,
        minMarkupSun: String(quote.minMarkupSun || ''),
        minMarkupTrx: quote.minMarkupTrx,
        energyQuantity: Number(quote.energyQuantity || 0),
        readyEnergy: requiredEnergy > 0 ? requiredEnergy : Number(quote.energyQuantity || 0),
        bandwidthQuantity: Number(quote.bandwidthQuantity || 0),
        readyBandwidth:
          requiredBandwidth > 0 ? requiredBandwidth : Number(quote.bandwidthQuantity || 0),
        packageCount: 1,
        requiredEnergy,
        requiredBandwidth,
        rentalPeriodSeconds: 0,
        label: String(purpose || 'resource-rental')
      };

      writeCachedApiQuote(cacheKey, mapped);
      return mapped;
    })();

    apiQuoteInflight.set(cacheKey, quotePromise);

    try {
      return await quotePromise;
    } finally {
      apiQuoteInflight.delete(cacheKey);
    }
  };

  if (
    getEnergyRentalMode() === 'tronix' &&
    isTronixRentEnabled() &&
    isValidTronAddress(wallet)
  ) {
    return createTronixRentPackage({
      purpose,
      wallet,
      requiredEnergy,
      requiredBandwidth
    });
  }

  if (getEnergyRentalMode() === 'api' && isGasStationApiEnabled()) {
    return readApiQuote();
  }

  try {
    return getResalePackage(purpose, {
      requiredEnergy,
      requiredBandwidth
    });
  } catch (error) {
    if (!isGasStationApiEnabled()) {
      throw error;
    }

    return readApiQuote();
  }
}

async function readWalletEnergyState(wallet) {
  const resources = await tronWeb.trx.getAccountResources(wallet);
  const energyLimit = Number(resources?.EnergyLimit || 0);
  const energyUsed = Number(resources?.EnergyUsed || 0);
  const bandwidthLimit =
    Number(resources?.freeNetLimit || 0) + Number(resources?.NetLimit || 0);
  const bandwidthUsed =
    Number(resources?.freeNetUsed || 0) + Number(resources?.NetUsed || 0);

  return {
    energyLimit,
    energyUsed,
    availableEnergy: Math.max(0, energyLimit - energyUsed),
    bandwidthLimit,
    bandwidthUsed,
    availableBandwidth: Math.max(0, bandwidthLimit - bandwidthUsed)
  };
}

async function waitForEnergyFulfillment(wallet, requiredEnergy, { attempts = 24, delayMs = 3000 } = {}) {
  let lastState = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastState = await readWalletEnergyState(wallet);

    if (lastState.availableEnergy >= requiredEnergy) {
      return lastState;
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const error = new Error('GasStation resale energy was not delivered yet');
  error.status = 202;
  error.details = {
    requiredEnergy,
    lastState
  };
  throw error;
}

async function ensureEnergyResaleOrdersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS energy_resale_orders (
      id BIGSERIAL PRIMARY KEY,
      purpose TEXT NOT NULL,
      wallet TEXT NOT NULL,
      payment_tx_hash TEXT UNIQUE NOT NULL,
      payment_address TEXT NOT NULL,
      payment_amount_sun NUMERIC(78,0) NOT NULL,
      expected_amount_sun NUMERIC(78,0) NOT NULL,
      energy_quantity INTEGER NOT NULL DEFAULT 0,
      ready_energy INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'paid',
      row_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_energy_resale_orders_wallet
      ON energy_resale_orders (wallet)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_energy_resale_orders_purpose
      ON energy_resale_orders (purpose)
  `);
}

async function updateEnergyResaleOrder(paymentTxHash, { status, rowJson }) {
  const result = await pool.query(
    `
      UPDATE energy_resale_orders
      SET
        status = COALESCE(NULLIF($2, ''), status),
        row_json = COALESCE($3::jsonb, row_json),
        updated_at = NOW()
      WHERE payment_tx_hash = $1
      RETURNING *
    `,
    [
      paymentTxHash,
      String(status || '').trim() || null,
      rowJson == null ? null : JSON.stringify(rowJson)
    ]
  );

  return result.rows[0] || null;
}

function buildPendingEnergyResaleError(details = {}) {
  const error = new Error('Energy rental is pending');
  error.status = 202;
  error.details = details;
  return error;
}

function buildPendingEnergyResaleResult(details = {}) {
  return {
    pending: true,
    status: 'processing_api',
    ...details
  };
}

function buildSerializedOrderError(error) {
  return {
    message: String(error?.message || 'Energy rental failed'),
    status: Number(error?.status || 0) || null,
    details: error?.details || null
  };
}

function isCompletedTronixOrder(order) {
  return String(order?.fulfillmentStatus || '').trim().toLowerCase() === 'completed';
}

function isFailedTronixOrder(order) {
  const paymentStatus = String(order?.paymentStatus || '').trim().toLowerCase();
  const fulfillmentStatus = String(order?.fulfillmentStatus || '').trim().toLowerCase();

  return (
    fulfillmentStatus === 'failed' ||
    paymentStatus === 'failed' ||
    paymentStatus === 'expired'
  );
}

async function upsertTronixEnergyResaleOrder({
  purpose,
  wallet,
  paymentTxHash,
  payment,
  packageConfig,
  tronixOrder,
  status
}) {
  await ensureEnergyResaleOrdersTable();

  const rowJson = {
    mode: 'tronix',
    provider: 'tronix_rent',
    package: packageConfig,
    payment,
    tronixOrder
  };

  const result = await pool.query(
    `
      INSERT INTO energy_resale_orders (
        purpose,
        wallet,
        payment_tx_hash,
        payment_address,
        payment_amount_sun,
        expected_amount_sun,
        energy_quantity,
        ready_energy,
        status,
        row_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      ON CONFLICT (payment_tx_hash)
      DO UPDATE SET
        status = EXCLUDED.status,
        row_json = EXCLUDED.row_json,
        updated_at = NOW()
      RETURNING *
    `,
    [
      purpose,
      wallet,
      paymentTxHash,
      packageConfig.paymentAddress,
      payment.amountSun,
      packageConfig.amountSun,
      packageConfig.energyQuantity,
      packageConfig.readyEnergy,
      status,
      JSON.stringify(rowJson)
    ]
  );

  return result.rows[0] || null;
}

async function confirmTronixRentPayment({
  purpose,
  wallet,
  paymentTxid,
  rentalOrderId,
  requiredEnergy,
  requiredBandwidth
}) {
  const orderId = String(rentalOrderId || '').trim();

  if (!orderId) {
    const error = new Error('rentalOrderId is required for TronixRent confirmation');
    error.status = 400;
    throw error;
  }

  const [payment, tronixOrder] = await Promise.all([
    readTrxPayment(paymentTxid),
    getTronixEnergyOrder(orderId)
  ]);

  const packageConfig = mapTronixOrderToPackage({
    purpose,
    wallet,
    quote: null,
    order: tronixOrder,
    requiredEnergy: normalizeResourceRequirement(requiredEnergy) || Number(tronixOrder.energyAmount || 0),
    requiredBandwidth:
      normalizeResourceRequirement(requiredBandwidth) || Number(tronixOrder.bandwidthAmount || 0)
  });

  if (String(tronixOrder.receiverAddress || '').trim().toLowerCase() !== wallet.toLowerCase()) {
    const error = new Error('TronixRent order receiver does not match wallet');
    error.status = 400;
    throw error;
  }

  if (payment.owner !== wallet) {
    const error = new Error('Payment sender does not match wallet');
    error.status = 400;
    throw error;
  }

  if (payment.recipient !== packageConfig.paymentAddress) {
    const error = new Error('Payment recipient does not match TronixRent order');
    error.status = 400;
    throw error;
  }

  if (BigInt(payment.amountSun) < BigInt(packageConfig.amountSun)) {
    const error = new Error('Payment amount is lower than TronixRent order price');
    error.status = 400;
    throw error;
  }

  const submitted = await submitTronixEnergyOrderPayment({
    orderId,
    paymentTxHash: paymentTxid
  }).catch(async (error) => {
    if (Number(error?.status || 0) === 409) {
      return getTronixEnergyOrder(orderId);
    }

    throw error;
  });
  const latestOrder = submitted?.orderId ? submitted : await getTronixEnergyOrder(orderId);
  const status = mapTronixStatus(latestOrder);
  const row = await upsertTronixEnergyResaleOrder({
    purpose,
    wallet,
    paymentTxHash: paymentTxid,
    payment,
    packageConfig,
    tronixOrder: latestOrder,
    status
  });

  if (isCompletedTronixOrder(latestOrder)) {
    return row;
  }

  if (isFailedTronixOrder(latestOrder)) {
    const error = new Error(latestOrder.errorMessage || 'TronixRent rental failed');
    error.status = 502;
    error.details = { orderId, tronixOrder: latestOrder };
    throw error;
  }

  return buildPendingEnergyResaleResult({
    paymentTxid,
    orderStatus: status,
    orderId
  });
}

async function refreshTronixOrderRow(row) {
  const orderId = String(row?.row_json?.tronixOrder?.orderId || row?.row_json?.package?.orderId || '').trim();

  if (!orderId) {
    return row;
  }

  try {
    const tronixOrder = await getTronixEnergyOrder(orderId);
    const status = mapTronixStatus(tronixOrder);
    const updated = await updateEnergyResaleOrder(row.payment_tx_hash, {
      status,
      rowJson: {
        ...(row.row_json || {}),
        tronixOrder
      }
    });

    return updated || row;
  } catch (error) {
    console.warn('[EnergyResale] failed to refresh TronixRent order status', {
      orderId,
      error: String(error?.message || error)
    });
    return row;
  }
}

function scheduleApiEnergyResaleConfirmation({
  paymentTxHash,
  purpose,
  wallet,
  payment,
  packageConfig,
  attempt = 0
}) {
  const delayMs = attempt > 0 ? 5000 : 0;

  setTimeout(() => {
    void (async () => {
      try {
        const rented = await rentResourcesForWallet({
          receiveAddress: wallet,
          energyNum: packageConfig.energyQuantity,
          bandwidthNum: packageConfig.bandwidthQuantity,
          requestPrefix: `energy-resale-${purpose}`,
          paymentAmountSun: payment.amountSun,
          context: {
            purpose,
            paymentTxid: paymentTxHash,
            paymentAddress: packageConfig.paymentAddress
          }
        });

        await updateEnergyResaleOrder(paymentTxHash, {
          status: 'completed',
          rowJson: {
            mode: 'api',
            package: packageConfig,
            payment,
            rented
          }
        });
      } catch (error) {
        if (shouldRetryPendingEnergyRentalError(error) && attempt < 8) {
          console.warn('[EnergyResale] retrying api rental confirmation', {
            purpose,
            wallet,
            paymentTxid: paymentTxHash,
            attempt: attempt + 1,
            error: String(error?.message || error)
          });

          scheduleApiEnergyResaleConfirmation({
            paymentTxHash,
            purpose,
            wallet,
            payment,
            packageConfig,
            attempt: attempt + 1
          });

          return;
        }

        await updateEnergyResaleOrder(paymentTxHash, {
          status: 'failed',
          rowJson: {
            mode: 'api',
            package: packageConfig,
            payment,
            error: buildSerializedOrderError(error)
          }
        }).catch(() => null);
      }
    })();
  }, delayMs);
}

async function confirmEnergyResalePayment({
  purpose,
  wallet,
  paymentTxid,
  rentalOrderId,
  requiredEnergy,
  requiredBandwidth
}) {
  const resolvedPurpose = normalizePurpose(purpose);
  const resolvedWallet = normalizeWallet(wallet);
  const txid = normalizeTxid(paymentTxid);

  if (!resolvedPurpose) {
    const error = new Error('purpose is required');
    error.status = 400;
    throw error;
  }

  if (!isValidTronAddress(resolvedWallet)) {
    const error = new Error('invalid TRON address');
    error.status = 400;
    throw error;
  }

  if (!txid) {
    const error = new Error('paymentTxId is required');
    error.status = 400;
    throw error;
  }

  if (getEnergyRentalMode() === 'tronix' && isTronixRentEnabled()) {
    return confirmTronixRentPayment({
      purpose: resolvedPurpose,
      wallet: resolvedWallet,
      paymentTxid: txid,
      rentalOrderId,
      requiredEnergy,
      requiredBandwidth
    });
  }

  const packageConfig = await getEnergyResalePackage(resolvedPurpose, {
    wallet: resolvedWallet,
    requiredEnergy,
    requiredBandwidth
  });
  const payment = await readTrxPayment(txid);

  if (payment.owner !== resolvedWallet) {
    const error = new Error('Payment sender does not match wallet');
    error.status = 400;
    throw error;
  }

  if (payment.recipient !== packageConfig.paymentAddress) {
    const error = new Error('Payment recipient does not match GasStation resale package');
    error.status = 400;
    throw error;
  }

  if (BigInt(payment.amountSun) < BigInt(packageConfig.amountSun)) {
    const error = new Error('Payment amount is lower than GasStation resale package price');
    error.status = 400;
    throw error;
  }

  await ensureEnergyResaleOrdersTable();

  const existing = await pool.query(
    `
      SELECT *
      FROM energy_resale_orders
      WHERE payment_tx_hash = $1
      LIMIT 1
    `,
    [txid]
  );

  if (existing.rows[0]?.status === 'completed') {
    return existing.rows[0];
  }

  if (existing.rows[0]?.status === 'processing_api' || existing.rows[0]?.status === 'waiting_api') {
    return buildPendingEnergyResaleResult({
      paymentTxid: txid,
      orderStatus: existing.rows[0].status
    });
  }

  if (!existing.rows[0]) {
    await pool.query(
      `
        INSERT INTO energy_resale_orders (
          purpose,
          wallet,
          payment_tx_hash,
          payment_address,
          payment_amount_sun,
          expected_amount_sun,
          energy_quantity,
          ready_energy,
          status,
          row_json
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        resolvedPurpose,
        resolvedWallet,
        txid,
        packageConfig.paymentAddress,
        payment.amountSun,
        packageConfig.amountSun,
        packageConfig.energyQuantity,
        packageConfig.readyEnergy,
        packageConfig.mode === 'api' ? 'waiting_api' : 'waiting_resale',
        JSON.stringify({ mode: packageConfig.mode, package: packageConfig, payment })
      ]
    );
  }

  if (packageConfig.mode === 'api') {
    await updateEnergyResaleOrder(txid, {
      status: 'processing_api',
      rowJson: {
        mode: 'api',
        package: packageConfig,
        payment
      }
    });

    scheduleApiEnergyResaleConfirmation({
      paymentTxHash: txid,
      purpose: resolvedPurpose,
      wallet: resolvedWallet,
      payment,
      packageConfig
    });

    console.info('[EnergyResale] queued api rental confirmation', {
      purpose: resolvedPurpose,
      wallet: resolvedWallet,
      paymentTxid: txid,
      requiredEnergy,
      requiredBandwidth
    });

    return buildPendingEnergyResaleResult({
      paymentTxid: txid,
      orderStatus: 'processing_api'
    });
  }

  const energyState = await waitForEnergyFulfillment(
    resolvedWallet,
    Number(packageConfig.readyEnergy || packageConfig.energyQuantity || 0)
  );

  const updated = await pool.query(
    `
      UPDATE energy_resale_orders
      SET
        status = 'completed',
        row_json = $2,
        updated_at = NOW()
      WHERE payment_tx_hash = $1
      RETURNING *
    `,
    [
      txid,
      JSON.stringify({
        mode: 'resale',
        package: packageConfig,
        payment,
        energyState
      })
    ]
  );

  return updated.rows[0];
}

async function getEnergyResaleStatus({ purpose, wallet, rentalOrderId, requiredEnergy, requiredBandwidth }) {
  const resolvedPurpose = normalizePurpose(purpose);
  const resolvedWallet = normalizeWallet(wallet);

  if (!resolvedPurpose) {
    const error = new Error('purpose is required');
    error.status = 400;
    throw error;
  }

  if (!isValidTronAddress(resolvedWallet)) {
    const error = new Error('invalid TRON address');
    error.status = 400;
    throw error;
  }

  const energyState = await readWalletEnergyState(resolvedWallet);
  const lastOrderResult = await pool.query(
    `
      SELECT *
      FROM energy_resale_orders
      WHERE purpose = $1
        AND lower(wallet) = lower($2)
        AND (
          NULLIF($3, '') IS NULL
          OR row_json->'tronixOrder'->>'orderId' = $3
          OR row_json->'package'->>'orderId' = $3
        )
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [resolvedPurpose, resolvedWallet, String(rentalOrderId || '').trim()]
  ).catch(() => ({ rows: [] }));
  const lastOrderRow = lastOrderResult.rows[0]?.row_json?.mode === 'tronix'
    ? await refreshTronixOrderRow(lastOrderResult.rows[0])
    : lastOrderResult.rows[0];
  const packageConfig = lastOrderRow?.row_json?.package || (
    getEnergyRentalMode() === 'tronix' && isTronixRentEnabled()
      ? {
          purpose: resolvedPurpose,
          mode: 'tronix',
          provider: 'tronix_rent',
          wallet: resolvedWallet,
          energyQuantity: normalizeResourceRequirement(requiredEnergy),
          readyEnergy: normalizeResourceRequirement(requiredEnergy),
          bandwidthQuantity: normalizeResourceRequirement(requiredBandwidth),
          readyBandwidth: normalizeResourceRequirement(requiredBandwidth),
          requiredEnergy: normalizeResourceRequirement(requiredEnergy),
          requiredBandwidth: normalizeResourceRequirement(requiredBandwidth)
        }
      : await getEnergyResalePackage(resolvedPurpose, {
          wallet: resolvedWallet,
          requiredEnergy,
          requiredBandwidth
        })
  );

  const requiredReadyEnergy = Number(packageConfig.readyEnergy || packageConfig.energyQuantity || 0);
  const requiredReadyBandwidth = Number(
    packageConfig.readyBandwidth || packageConfig.bandwidthQuantity || 0
  );

  return {
    purpose: resolvedPurpose,
    wallet: resolvedWallet,
    ready:
      lastOrderRow?.status === 'completed' ||
      (
        energyState.availableEnergy >= requiredReadyEnergy &&
        energyState.availableBandwidth >= requiredReadyBandwidth
      ),
    requiredEnergy: requiredReadyEnergy,
    requiredBandwidth: requiredReadyBandwidth,
    energyState,
    package: packageConfig,
    lastOrder: lastOrderRow
      ? {
          status: lastOrderRow.status || null,
          payment_tx_hash: lastOrderRow.payment_tx_hash || null,
          order_id:
            lastOrderRow.row_json?.tronixOrder?.orderId ||
            lastOrderRow.row_json?.package?.orderId ||
            null,
          error_message:
            lastOrderRow.row_json?.error?.message
              ? String(lastOrderRow.row_json.error.message)
              : lastOrderRow.row_json?.tronixOrder?.errorMessage
                ? String(lastOrderRow.row_json.tronixOrder.errorMessage)
              : null
        }
      : null
  };
}

module.exports = {
  confirmEnergyResalePayment,
  getEnergyResaleStatus,
  getEnergyResalePackage,
  isValidTronAddress,
  normalizePurpose,
  normalizeWallet
};
