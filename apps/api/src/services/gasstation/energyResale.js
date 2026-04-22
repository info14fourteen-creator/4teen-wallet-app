const env = require('../../config/env');
const { pool } = require('../../db/pool');
const { tronWeb } = require('../tron/client');
const { readTrxPayment } = require('../tron/payments');
const {
  quoteResourceRental,
  rentResourcesForWallet
} = require('./gasStation');

const SUN = 1_000_000n;

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

function getEnergyRentalMode() {
  const mode = String(env.GASSTATION_ENERGY_RENTAL_MODE || 'resale').trim().toLowerCase();
  return mode === 'api' ? 'api' : 'resale';
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
  const defaults = getDefaultPurposeRequirements(purpose);
  const requiredEnergy = normalizeResourceRequirement(
    requirements.requiredEnergy || requirements.energyShortfall
  ) || defaults.requiredEnergy;
  const requiredBandwidth = normalizeResourceRequirement(
    requirements.requiredBandwidth || requirements.bandwidthShortfall
  ) || defaults.requiredBandwidth;

  if (getEnergyRentalMode() === 'api' && isGasStationApiEnabled()) {
    const quote = await quoteResourceRental({
      energyNum: requiredEnergy,
      bandwidthNum: requiredBandwidth
    });
    const amountSun = String(Math.ceil(Number(quote.amountSun || 0)));

    return {
      purpose,
      mode: 'api',
      paymentAddress: env.OPERATOR_WALLET,
      amountSun,
      amountTrx: formatSunAsTrx(amountSun),
      costAmountSun: String(quote.costAmountSun || ''),
      costAmountTrx: quote.costAmountTrx,
      markupAmountSun: String(quote.markupAmountSun || ''),
      markupAmountTrx: quote.markupAmountTrx,
      markupBps: quote.markupBps,
      energyQuantity: Number(quote.energyQuantity || 0),
      readyEnergy: Number(quote.energyQuantity || 0),
      bandwidthQuantity: Number(quote.bandwidthQuantity || 0),
      readyBandwidth: Number(quote.bandwidthQuantity || 0),
      packageCount: 1,
      requiredEnergy,
      requiredBandwidth,
      rentalPeriodSeconds: 0,
      label: String(purpose || 'resource-rental')
    };
  }

  return getResalePackage(purpose, {
    requiredEnergy,
    requiredBandwidth
  });
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

async function confirmEnergyResalePayment({
  purpose,
  wallet,
  paymentTxid,
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

  const packageConfig = await getEnergyResalePackage(resolvedPurpose, {
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
    const rented = await rentResourcesForWallet({
      receiveAddress: resolvedWallet,
      energyNum: packageConfig.energyQuantity,
      bandwidthNum: packageConfig.bandwidthQuantity,
      requestPrefix: `energy-resale-${resolvedPurpose}`,
      paymentAmountSun: payment.amountSun,
      context: {
        purpose: resolvedPurpose,
        paymentTxid: txid
      }
    });

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
          mode: 'api',
          package: packageConfig,
          payment,
          rented
        })
      ]
    );

    return updated.rows[0];
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

async function getEnergyResaleStatus({ purpose, wallet, requiredEnergy, requiredBandwidth }) {
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

  const packageConfig = await getEnergyResalePackage(resolvedPurpose, {
    requiredEnergy,
    requiredBandwidth
  });
  const energyState = await readWalletEnergyState(resolvedWallet);
  const lastOrder = await pool.query(
    `
      SELECT *
      FROM energy_resale_orders
      WHERE purpose = $1
        AND lower(wallet) = lower($2)
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [resolvedPurpose, resolvedWallet]
  ).catch(() => ({ rows: [] }));

  const requiredReadyEnergy = Number(packageConfig.readyEnergy || packageConfig.energyQuantity || 0);
  const requiredReadyBandwidth = Number(
    packageConfig.readyBandwidth || packageConfig.bandwidthQuantity || 0
  );

  return {
    purpose: resolvedPurpose,
    wallet: resolvedWallet,
    ready:
      energyState.availableEnergy >= requiredReadyEnergy &&
      energyState.availableBandwidth >= requiredReadyBandwidth,
    requiredEnergy: requiredReadyEnergy,
    requiredBandwidth: requiredReadyBandwidth,
    energyState,
    package: packageConfig,
    lastOrder: lastOrder.rows[0] || null
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
