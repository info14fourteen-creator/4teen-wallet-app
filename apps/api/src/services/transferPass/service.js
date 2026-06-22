const env = require('../../config/env');
const { pool } = require('../../db/pool');
const { quoteResourceRental, rentResourcesForWallet } = require('../gasstation/gasStation');
const { getTrxPriceInfo } = require('../proxy/walletSnapshot');

const SUN = 1_000_000;
const DEFAULT_PLANS = [
  {
    code: 'starter',
    name: 'Starter',
    monthlyPriceUsdt: 19,
    includedTransfers: 30,
    overagePriceUsdt: 0.89,
    active: true
  },
  {
    code: 'pro',
    name: 'Pro',
    monthlyPriceUsdt: 49,
    includedTransfers: 100,
    overagePriceUsdt: 0.69,
    active: true
  },
  {
    code: 'business',
    name: 'Business',
    monthlyPriceUsdt: 129,
    includedTransfers: 300,
    overagePriceUsdt: 0.49,
    active: true
  }
];

function assertDatabaseConfigured() {
  if (!normalizeValue(env.DATABASE_URL)) {
    const error = new Error('DATABASE_URL is not configured');
    error.status = 503;
    throw error;
  }
}

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeAddress(value) {
  return normalizeValue(value);
}

function isValidTronAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizeAddress(value));
}

function normalizeCode(value) {
  return normalizeValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 64);
}

function roundMoney(value, digits = 6) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  const power = 10 ** digits;
  return Math.round(numeric * power) / power;
}

function toTrx(amountSun) {
  const numeric = Number(amountSun || 0);
  if (!Number.isFinite(numeric)) return 0;
  return roundMoney(numeric / SUN, 6);
}

function parsePositiveNumber(value, field) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    const error = new Error(`${field} must be a valid non-negative number`);
    error.status = 400;
    throw error;
  }

  return numeric;
}

function assertTransferPassEnabled() {
  if (!String(env.TRANSFER_PASS_ENABLED || '').toLowerCase().includes('true')) {
    const error = new Error('Transfer Pass is disabled');
    error.status = 503;
    throw error;
  }
}

function parsePlansConfig() {
  const raw = normalizeValue(env.TRANSFER_PASS_PLANS_JSON);
  if (!raw) {
    return DEFAULT_PLANS;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid TRANSFER_PASS_PLANS_JSON: ${error.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('TRANSFER_PASS_PLANS_JSON must be an array');
  }

  return parsed.map((plan, index) => {
    const code = normalizeCode(plan?.code || `plan_${index + 1}`);
    if (!code) {
      throw new Error(`Invalid plan code at index ${index}`);
    }

    return {
      code,
      name: normalizeValue(plan?.name || code),
      monthlyPriceUsdt: roundMoney(plan?.monthlyPriceUsdt || plan?.monthly_price_usdt || 0, 2),
      includedTransfers: Math.max(0, Math.floor(Number(plan?.includedTransfers || plan?.included_transfers || 0))),
      overagePriceUsdt: roundMoney(plan?.overagePriceUsdt || plan?.overage_price_usdt || 0, 2),
      active: String(plan?.active ?? 'true').toLowerCase() !== 'false'
    };
  });
}

async function ensureTransferPassTables() {
  assertDatabaseConfigured();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('transfer_pass_schema_v1'))`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transfer_pass_plans (
        id BIGSERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        monthly_price_usdt NUMERIC(18,6) NOT NULL DEFAULT 0,
        included_transfers INTEGER NOT NULL DEFAULT 0,
        overage_price_usdt NUMERIC(18,6) NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transfer_pass_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        plan_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_payment',
        period_start TIMESTAMPTZ,
        period_end TIMESTAMPTZ,
        transfers_used INTEGER NOT NULL DEFAULT 0,
        transfers_remaining INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transfer_pass_subscriptions_wallet
        ON transfer_pass_subscriptions (wallet_address, created_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sponsored_transfers (
        id BIGSERIAL PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        recipient_address TEXT NOT NULL,
        amount_usdt NUMERIC(18,6) NOT NULL DEFAULT 0,
        quoted_fee_usdt NUMERIC(18,6) NOT NULL DEFAULT 0,
        quoted_fee_trx NUMERIC(18,6) NOT NULL DEFAULT 0,
        quoted_cost_trx NUMERIC(18,6) NOT NULL DEFAULT 0,
        quoted_cost_usdt NUMERIC(18,6) NOT NULL DEFAULT 0,
        energy_quantity INTEGER NOT NULL DEFAULT 0,
        bandwidth_quantity INTEGER NOT NULL DEFAULT 0,
        billing_mode TEXT NOT NULL DEFAULT 'one_off',
        subscription_id BIGINT,
        status TEXT NOT NULL DEFAULT 'quoted',
        payment_address TEXT,
        provider_order_json JSONB,
        note TEXT,
        failure_reason TEXT,
        delivered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sponsored_transfers_wallet
        ON sponsored_transfers (wallet_address, created_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sponsored_transfers_status
        ON sponsored_transfers (status, created_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS saved_recipients (
        id BIGSERIAL PRIMARY KEY,
        owner_wallet TEXT NOT NULL,
        label TEXT NOT NULL,
        recipient_wallet TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_saved_recipients_owner_wallet
        ON saved_recipients (owner_wallet, created_at DESC)
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

async function syncPlans() {
  await ensureTransferPassTables();
  const plans = parsePlansConfig();

  for (const plan of plans) {
    await pool.query(
      `
        INSERT INTO transfer_pass_plans (
          code,
          name,
          monthly_price_usdt,
          included_transfers,
          overage_price_usdt,
          active,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (code)
        DO UPDATE SET
          name = EXCLUDED.name,
          monthly_price_usdt = EXCLUDED.monthly_price_usdt,
          included_transfers = EXCLUDED.included_transfers,
          overage_price_usdt = EXCLUDED.overage_price_usdt,
          active = EXCLUDED.active,
          updated_at = NOW()
      `,
      [
        plan.code,
        plan.name,
        plan.monthlyPriceUsdt,
        plan.includedTransfers,
        plan.overagePriceUsdt,
        plan.active
      ]
    );
  }
}

async function listPlans() {
  await syncPlans();
  const result = await pool.query(
    `
      SELECT
        code,
        name,
        monthly_price_usdt,
        included_transfers,
        overage_price_usdt,
        active
      FROM transfer_pass_plans
      WHERE active = TRUE
      ORDER BY monthly_price_usdt ASC, included_transfers ASC
    `
  );

  return result.rows.map((row) => ({
    code: row.code,
    name: row.name,
    monthlyPriceUsdt: roundMoney(row.monthly_price_usdt, 2),
    includedTransfers: Number(row.included_transfers || 0),
    overagePriceUsdt: roundMoney(row.overage_price_usdt, 2),
    active: Boolean(row.active)
  }));
}

async function getLatestSubscription(walletAddress) {
  await ensureTransferPassTables();
  const wallet = normalizeAddress(walletAddress);
  if (!wallet) return null;

  const result = await pool.query(
    `
      SELECT
        s.id,
        s.wallet_address,
        s.plan_code,
        s.status,
        s.period_start,
        s.period_end,
        s.transfers_used,
        s.transfers_remaining,
        s.note,
        s.created_at,
        s.updated_at,
        p.name AS plan_name,
        p.monthly_price_usdt,
        p.included_transfers,
        p.overage_price_usdt
      FROM transfer_pass_subscriptions s
      LEFT JOIN transfer_pass_plans p
        ON p.code = s.plan_code
      WHERE lower(s.wallet_address) = lower($1)
      ORDER BY s.created_at DESC
      LIMIT 1
    `,
    [wallet]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    walletAddress: row.wallet_address,
    planCode: row.plan_code,
    planName: row.plan_name || row.plan_code,
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    transfersUsed: Number(row.transfers_used || 0),
    transfersRemaining: Number(row.transfers_remaining || 0),
    monthlyPriceUsdt: roundMoney(row.monthly_price_usdt, 2),
    includedTransfers: Number(row.included_transfers || 0),
    overagePriceUsdt: roundMoney(row.overage_price_usdt, 2),
    note: row.note || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildRecommendedPlan(plans, oneOffFeeUsdt) {
  if (!plans.length || oneOffFeeUsdt <= 0) return null;

  const mapped = plans
    .filter((plan) => plan.monthlyPriceUsdt > 0 && plan.includedTransfers > 0)
    .map((plan) => ({
      ...plan,
      breakEvenTransfers: Math.ceil(plan.monthlyPriceUsdt / oneOffFeeUsdt)
    }))
    .sort((left, right) => left.breakEvenTransfers - right.breakEvenTransfers);

  return mapped[0] || null;
}

async function quoteTransferPassSend({ walletAddress, recipientAddress, amountUsdt }) {
  assertTransferPassEnabled();
  await syncPlans();

  const wallet = normalizeAddress(walletAddress);
  const recipient = normalizeAddress(recipientAddress);
  const usdtAmount = parsePositiveNumber(amountUsdt, 'amountUsdt');

  if (!isValidTronAddress(wallet)) {
    const error = new Error('invalid walletAddress');
    error.status = 400;
    throw error;
  }

  if (!isValidTronAddress(recipient)) {
    const error = new Error('invalid recipientAddress');
    error.status = 400;
    throw error;
  }

  if (usdtAmount <= 0) {
    const error = new Error('amountUsdt is required');
    error.status = 400;
    throw error;
  }

  const [plans, subscription, trxPrice, rentalQuote] = await Promise.all([
    listPlans(),
    getLatestSubscription(wallet),
    getTrxPriceInfo(),
    quoteResourceRental({
      energyNum: env.TRANSFER_PASS_DEFAULT_ENERGY,
      bandwidthNum: env.TRANSFER_PASS_DEFAULT_BANDWIDTH
    })
  ]);

  const quotedCostTrx = roundMoney(rentalQuote.amountTrx || toTrx(rentalQuote.amountSun), 6);
  const trxPriceUsd = roundMoney(trxPrice?.priceInUsd || 0, 6);
  const quotedCostUsdt = roundMoney(quotedCostTrx * trxPriceUsd, 6);

  const oneOffMarkupFactor = 1 + Number(env.TRANSFER_PASS_ONE_OFF_MARKUP_BPS || 0) / 10_000;
  const oneOffFeeUsdt = roundMoney(
    Math.max(
      quotedCostUsdt * oneOffMarkupFactor,
      Number(env.TRANSFER_PASS_ONE_OFF_MIN_FEE_USDT || 0)
    ),
    6
  );

  let billingMode = 'one_off';
  let quotedFeeUsdt = oneOffFeeUsdt;
  let quotedFeeTrx = trxPriceUsd > 0 ? roundMoney(quotedFeeUsdt / trxPriceUsd, 6) : 0;

  if (subscription?.status === 'active' && subscription.transfersRemaining > 0) {
    billingMode = 'included_transfer';
    quotedFeeUsdt = 0;
    quotedFeeTrx = 0;
  } else if (subscription?.status === 'active') {
    billingMode = 'subscription_overage';
    quotedFeeUsdt = roundMoney(
      Math.max(subscription.overagePriceUsdt || 0, oneOffFeeUsdt),
      6
    );
    quotedFeeTrx = trxPriceUsd > 0 ? roundMoney(quotedFeeUsdt / trxPriceUsd, 6) : 0;
  }

  return {
    walletAddress: wallet,
    recipientAddress: recipient,
    amountUsdt: roundMoney(usdtAmount, 6),
    pricing: {
      billingMode,
      quotedFeeUsdt,
      quotedFeeTrx,
      quotedCostTrx,
      quotedCostUsdt,
      trxPriceUsd
    },
    resources: {
      energyQuantity: Number(rentalQuote.energyQuantity || env.TRANSFER_PASS_DEFAULT_ENERGY || 0),
      bandwidthQuantity: Number(
        rentalQuote.bandwidthQuantity || env.TRANSFER_PASS_DEFAULT_BANDWIDTH || 0
      )
    },
    subscription,
    recommendedPlan: buildRecommendedPlan(plans, oneOffFeeUsdt),
    paymentAddress: billingMode === 'included_transfer' ? null : normalizeValue(env.OPERATOR_WALLET) || null
  };
}

async function createSubscriptionIntent({ walletAddress, planCode, note }) {
  assertTransferPassEnabled();
  await syncPlans();

  const wallet = normalizeAddress(walletAddress);
  const code = normalizeCode(planCode);

  if (!isValidTronAddress(wallet)) {
    const error = new Error('invalid walletAddress');
    error.status = 400;
    throw error;
  }

  if (!code) {
    const error = new Error('planCode is required');
    error.status = 400;
    throw error;
  }

  const planResult = await pool.query(
    `
      SELECT code, name, monthly_price_usdt, included_transfers, overage_price_usdt
      FROM transfer_pass_plans
      WHERE code = $1 AND active = TRUE
      LIMIT 1
    `,
    [code]
  );

  const plan = planResult.rows[0];
  if (!plan) {
    const error = new Error('Unknown transfer pass plan');
    error.status = 404;
    throw error;
  }

  const result = await pool.query(
    `
      INSERT INTO transfer_pass_subscriptions (
        wallet_address,
        plan_code,
        status,
        transfers_used,
        transfers_remaining,
        note
      )
      VALUES ($1, $2, 'pending_payment', 0, 0, $3)
      RETURNING *
    `,
    [wallet, code, normalizeValue(note) || null]
  );

  return {
    subscriptionId: Number(result.rows[0].id),
    walletAddress: wallet,
    planCode: plan.code,
    planName: plan.name,
    status: 'pending_payment',
    monthlyPriceUsdt: roundMoney(plan.monthly_price_usdt, 2),
    includedTransfers: Number(plan.included_transfers || 0),
    overagePriceUsdt: roundMoney(plan.overage_price_usdt, 2)
  };
}

async function activateSubscriptionAdmin({ walletAddress, planCode, note }) {
  assertTransferPassEnabled();
  await syncPlans();

  const wallet = normalizeAddress(walletAddress);
  const code = normalizeCode(planCode);

  if (!isValidTronAddress(wallet)) {
    const error = new Error('invalid walletAddress');
    error.status = 400;
    throw error;
  }

  if (!code) {
    const error = new Error('planCode is required');
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const planResult = await client.query(
      `
        SELECT code, name, included_transfers, monthly_price_usdt, overage_price_usdt
        FROM transfer_pass_plans
        WHERE code = $1 AND active = TRUE
        LIMIT 1
      `,
      [code]
    );

    const plan = planResult.rows[0];
    if (!plan) {
      const error = new Error('Unknown transfer pass plan');
      error.status = 404;
      throw error;
    }

    await client.query(
      `
        UPDATE transfer_pass_subscriptions
        SET status = 'replaced', updated_at = NOW()
        WHERE lower(wallet_address) = lower($1)
          AND status IN ('pending_payment', 'active')
      `,
      [wallet]
    );

    const inserted = await client.query(
      `
        INSERT INTO transfer_pass_subscriptions (
          wallet_address,
          plan_code,
          status,
          period_start,
          period_end,
          transfers_used,
          transfers_remaining,
          note
        )
        VALUES (
          $1,
          $2,
          'active',
          NOW(),
          NOW() + ($3 || ' days')::interval,
          0,
          $4,
          $5
        )
        RETURNING *
      `,
      [
        wallet,
        code,
        Number(env.TRANSFER_PASS_INCLUDED_TRANSFER_PERIOD_DAYS || 30),
        Number(plan.included_transfers || 0),
        normalizeValue(note) || null
      ]
    );

    await client.query('COMMIT');

    return {
      id: Number(inserted.rows[0].id),
      walletAddress: wallet,
      planCode: code,
      status: 'active',
      transfersRemaining: Number(inserted.rows[0].transfers_remaining || 0),
      periodStart: inserted.rows[0].period_start,
      periodEnd: inserted.rows[0].period_end,
      planName: plan.name,
      monthlyPriceUsdt: roundMoney(plan.monthly_price_usdt, 2),
      overagePriceUsdt: roundMoney(plan.overage_price_usdt, 2)
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

async function getSponsoredTransferById(id) {
  await ensureTransferPassTables();
  const result = await pool.query(
    `
      SELECT *
      FROM sponsored_transfers
      WHERE id = $1
      LIMIT 1
    `,
    [Number(id)]
  );

  const row = result.rows[0];
  if (!row) {
    const error = new Error('Sponsored transfer not found');
    error.status = 404;
    throw error;
  }

  return {
    id: Number(row.id),
    walletAddress: row.wallet_address,
    recipientAddress: row.recipient_address,
    amountUsdt: roundMoney(row.amount_usdt, 6),
    quotedFeeUsdt: roundMoney(row.quoted_fee_usdt, 6),
    quotedFeeTrx: roundMoney(row.quoted_fee_trx, 6),
    quotedCostTrx: roundMoney(row.quoted_cost_trx, 6),
    quotedCostUsdt: roundMoney(row.quoted_cost_usdt, 6),
    energyQuantity: Number(row.energy_quantity || 0),
    bandwidthQuantity: Number(row.bandwidth_quantity || 0),
    billingMode: row.billing_mode,
    subscriptionId: row.subscription_id ? Number(row.subscription_id) : null,
    status: row.status,
    paymentAddress: row.payment_address || null,
    providerOrder: row.provider_order_json || null,
    note: row.note || null,
    failureReason: row.failure_reason || null,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function createSponsoredTransfer(input) {
  const quote = await quoteTransferPassSend(input);

  const subscription = quote.subscription;
  const result = await pool.query(
    `
      INSERT INTO sponsored_transfers (
        wallet_address,
        recipient_address,
        amount_usdt,
        quoted_fee_usdt,
        quoted_fee_trx,
        quoted_cost_trx,
        quoted_cost_usdt,
        energy_quantity,
        bandwidth_quantity,
        billing_mode,
        subscription_id,
        status,
        payment_address,
        note
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )
      RETURNING id
    `,
    [
      quote.walletAddress,
      quote.recipientAddress,
      quote.amountUsdt,
      quote.pricing.quotedFeeUsdt,
      quote.pricing.quotedFeeTrx,
      quote.pricing.quotedCostTrx,
      quote.pricing.quotedCostUsdt,
      quote.resources.energyQuantity,
      quote.resources.bandwidthQuantity,
      quote.pricing.billingMode,
      subscription?.id || null,
      quote.pricing.billingMode === 'included_transfer' ? 'queued_for_sponsorship' : 'payment_required',
      quote.paymentAddress,
      normalizeValue(input.note) || null
    ]
  );

  const sendId = Number(result.rows[0].id);

  if (quote.pricing.billingMode === 'included_transfer') {
    return fulfillSponsoredTransferAdmin({ sendId, note: input.note });
  }

  return getSponsoredTransferById(sendId);
}

async function fulfillSponsoredTransferAdmin({ sendId, note }) {
  assertTransferPassEnabled();
  await ensureTransferPassTables();

  const client = await pool.connect();
  let sendRow;
  try {
    await client.query('BEGIN');

    const sendResult = await client.query(
      `
        SELECT *
        FROM sponsored_transfers
        WHERE id = $1
        FOR UPDATE
      `,
      [Number(sendId)]
    );

    sendRow = sendResult.rows[0];
    if (!sendRow) {
      const error = new Error('Sponsored transfer not found');
      error.status = 404;
      throw error;
    }

    if (sendRow.status === 'resources_delivered') {
      await client.query('COMMIT');
      return getSponsoredTransferById(sendId);
    }

    await client.query(
      `
        UPDATE sponsored_transfers
        SET status = 'processing', updated_at = NOW(), note = COALESCE($2, note)
        WHERE id = $1
      `,
      [Number(sendId), normalizeValue(note) || null]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    throw error;
  } finally {
    client.release();
  }

  try {
    const rented = await rentResourcesForWallet({
      receiveAddress: sendRow.wallet_address,
      energyNum: Number(sendRow.energy_quantity || 0),
      bandwidthNum: Number(sendRow.bandwidth_quantity || 0),
      requestPrefix: 'transfer-pass',
      context: {
        purpose: 'transfer_pass',
        sendId: Number(sendId)
      }
    });

    const finalizeClient = await pool.connect();
    try {
      await finalizeClient.query('BEGIN');

      await finalizeClient.query(
        `
          UPDATE sponsored_transfers
          SET
            status = 'resources_delivered',
            provider_order_json = $2::jsonb,
            delivered_at = NOW(),
            updated_at = NOW(),
            failure_reason = NULL
          WHERE id = $1
        `,
        [Number(sendId), JSON.stringify(rented)]
      );

      if (sendRow.subscription_id) {
        await finalizeClient.query(
          `
            UPDATE transfer_pass_subscriptions
            SET
              transfers_used = transfers_used + 1,
              transfers_remaining = GREATEST(0, transfers_remaining - 1),
              updated_at = NOW()
            WHERE id = $1
          `,
          [Number(sendRow.subscription_id)]
        );
      }

      await finalizeClient.query('COMMIT');
    } catch (error) {
      await finalizeClient.query('ROLLBACK').catch(() => null);
      throw error;
    } finally {
      finalizeClient.release();
    }
  } catch (error) {
    await pool.query(
      `
        UPDATE sponsored_transfers
        SET
          status = 'failed',
          failure_reason = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [Number(sendId), String(error?.message || 'Sponsored transfer failed')]
    );
    throw error;
  }

  return getSponsoredTransferById(sendId);
}

async function getTransferPassHistory({ walletAddress, limit = 25 }) {
  assertTransferPassEnabled();
  await ensureTransferPassTables();

  const wallet = normalizeAddress(walletAddress);
  if (!isValidTronAddress(wallet)) {
    const error = new Error('invalid walletAddress');
    error.status = 400;
    throw error;
  }

  const safeLimit = Math.max(1, Math.min(100, Number(limit || 25)));
  const result = await pool.query(
    `
      SELECT *
      FROM sponsored_transfers
      WHERE lower(wallet_address) = lower($1)
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [wallet, safeLimit]
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    walletAddress: row.wallet_address,
    recipientAddress: row.recipient_address,
    amountUsdt: roundMoney(row.amount_usdt, 6),
    quotedFeeUsdt: roundMoney(row.quoted_fee_usdt, 6),
    billingMode: row.billing_mode,
    status: row.status,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    failureReason: row.failure_reason || null
  }));
}

module.exports = {
  ensureTransferPassTables,
  listPlans,
  getLatestSubscription,
  quoteTransferPassSend,
  createSponsoredTransfer,
  getSponsoredTransferById,
  getTransferPassHistory,
  createSubscriptionIntent,
  activateSubscriptionAdmin,
  fulfillSponsoredTransferAdmin
};
