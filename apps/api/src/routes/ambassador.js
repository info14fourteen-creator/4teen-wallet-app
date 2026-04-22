const express = require('express');
const env = require('../config/env');
const { pool } = require('../db/pool');
const { loadAmbassadorCabinetDb } = require('../db/queries/ambassadorCabinet');
const {
  getWithdrawalEventByTxHash,
  readAmbassadorDashboardOnChain
} = require('../services/ambassador/controller');
const { tronWeb } = require('../services/tron/client');
const {
  quoteEnergyRental,
  rentEnergyForWallet
} = require('../services/gasstation/gasStation');

const router = express.Router();
const SUN = 1_000_000n;

function normalizeWallet(value) {
  return String(value || '').trim();
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
}

function normalizeTxid(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidTronAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value || '').trim());
}

function toBase58Address(value) {
  if (!value) return '';

  try {
    return tronWeb.address.fromHex(String(value));
  } catch (_) {
    return '';
  }
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

function buildReferralLink(slug) {
  const normalized = normalizeSlug(slug);
  return normalized ? `https://4teen.me/?ref=${normalized}` : '';
}

function buildDbFallbackSummary(wallet, ambassador, dbSummary) {
  if (!ambassador) {
    return {
      ambassador_wallet: wallet,
      slug: dbSummary.slug || null,
      exists_on_chain: false,
      active: false,
      effective_level: '0',
      reward_percent: '0',
      created_at_chain: null,
      self_registered: false,
      manual_assigned: false,
      override_enabled: false,
      current_level: '0',
      override_level: '0',
      slug_hash: null,
      meta_hash: null,
      total_buyers: '0',
      buyers_count: String(dbSummary.buyers_count || 0),
      total_volume_sun: '0',
      total_rewards_accrued_sun: '0',
      total_rewards_claimed_sun: '0',
      claimable_rewards_sun: '0',
      ...dbSummary
    };
  }

  return {
    ambassador_wallet: ambassador.ambassador_wallet || wallet,
    slug: ambassador.slug || dbSummary.slug || null,
    exists_on_chain: Boolean(ambassador.exists_on_chain),
    active: Boolean(ambassador.active),
    self_registered: Boolean(ambassador.self_registered),
    manual_assigned: Boolean(ambassador.manual_assigned),
    override_enabled: Boolean(ambassador.override_enabled),
    current_level: String(ambassador.current_level || '0'),
    override_level: String(ambassador.override_level || '0'),
    effective_level: String(ambassador.effective_level || '0'),
    reward_percent: String(ambassador.reward_percent || '0'),
    slug_hash: ambassador.slug_hash || null,
    meta_hash: ambassador.meta_hash || null,
    created_at_chain: ambassador.created_at_chain == null ? null : String(ambassador.created_at_chain),
    total_buyers: String(ambassador.total_buyers || '0'),
    total_volume_sun: String(ambassador.total_volume_sun || '0'),
    total_rewards_accrued_sun: String(ambassador.total_rewards_accrued_sun || '0'),
    total_rewards_claimed_sun: String(ambassador.total_rewards_claimed_sun || '0'),
    claimable_rewards_sun: String(ambassador.claimable_rewards_sun || '0'),
    ...dbSummary
  };
}

function publicErrorMessage(error, fallback) {
  const message = String(error?.message || '').trim();
  return message || error?.code || error?.name || fallback;
}

function getRegistrationEnergyQuantity() {
  return Math.max(
    100000,
    Number(env.GASSTATION_REGISTRATION_ENERGY || 0),
    Number(env.GASSTATION_MIN_ENERGY || 0)
  );
}

function getRegistrationEnergyMode() {
  return String(env.GASSTATION_REGISTRATION_ENERGY_MODE || 'api').trim().toLowerCase();
}

function getResaleRegistrationAmountSun() {
  const configuredSun = String(env.GASSTATION_RESALE_REGISTRATION_AMOUNT_SUN || '').trim();

  if (/^\d+$/.test(configuredSun) && BigInt(configuredSun) > 0n) {
    return configuredSun;
  }

  const configuredTrx = parseTrxToSun(env.GASSTATION_RESALE_REGISTRATION_AMOUNT_TRX);

  if (configuredTrx && BigInt(configuredTrx) > 0n) {
    return configuredTrx;
  }

  return '';
}

async function getAmbassadorByWallet(wallet) {
  const result = await pool.query(
    `
      SELECT ambassador_wallet, slug, active, exists_on_chain
      FROM ambassadors
      WHERE lower(ambassador_wallet) = lower($1)
      LIMIT 1
    `,
    [wallet]
  );

  return result.rows[0] || null;
}

async function getAmbassadorBySlug(slug) {
  const result = await pool.query(
    `
      SELECT ambassador_wallet, slug, exists_on_chain
      FROM ambassadors
      WHERE slug = $1
      LIMIT 1
    `,
    [slug]
  );

  return result.rows[0] || null;
}

async function assertRegistrationCandidate(wallet, slug) {
  const existingBySlug = await getAmbassadorBySlug(slug);

  if (
    existingBySlug &&
    String(existingBySlug.ambassador_wallet || '').toLowerCase() !== wallet.toLowerCase()
  ) {
    const error = new Error('Slug is already taken');
    error.status = 409;
    throw error;
  }

  const ambassador = await getAmbassadorByWallet(wallet);

  if (ambassador?.exists_on_chain) {
    const error = new Error('Wallet is already registered as ambassador');
    error.status = 409;
    throw error;
  }
}

async function buildRegistrationEnergyQuote() {
  if (getRegistrationEnergyMode() === 'resale') {
    const paymentAddress = normalizeWallet(env.GASSTATION_RESALE_REGISTRATION_PAYMENT_ADDRESS);
    const amountSun = getResaleRegistrationAmountSun();

    if (!isValidTronAddress(paymentAddress)) {
      const error = new Error('GasStation resale registration payment address is not configured');
      error.status = 503;
      throw error;
    }

    if (!amountSun) {
      const error = new Error('GasStation resale registration amount is not configured');
      error.status = 503;
      throw error;
    }

    return {
      mode: 'resale',
      paymentAddress,
      amountSun,
      amountTrx: formatSunAsTrx(amountSun),
      energyQuantity: getRegistrationEnergyQuantity(),
      readyEnergy: Math.max(
        Number(env.GASSTATION_RESALE_REGISTRATION_READY_ENERGY || 0),
        Number(env.GASSTATION_MIN_ENERGY || 0)
      )
    };
  }

  const quote = await quoteEnergyRental({
    energyNum: getRegistrationEnergyQuantity()
  });
  const amountSun = String(Math.ceil(Number(quote.amountSun || 0)));

  return {
    mode: 'api',
    paymentAddress: env.OPERATOR_WALLET,
    amountSun,
    amountTrx: formatSunAsTrx(amountSun),
    energyQuantity: quote.energyQuantity
  };
}

async function readWalletEnergyState(wallet) {
  const resources = await tronWeb.trx.getAccountResources(wallet);
  const energyLimit = Number(resources?.EnergyLimit || 0);
  const energyUsed = Number(resources?.EnergyUsed || 0);

  return {
    energyLimit,
    energyUsed,
    availableEnergy: Math.max(0, energyLimit - energyUsed)
  };
}

async function waitForResaleEnergyFulfillment(wallet, requiredEnergy, { attempts = 24, delayMs = 3000 } = {}) {
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

router.get('/cabinet/:wallet', async (req, res) => {
  try {
    const wallet = normalizeWallet(req.params.wallet);

    if (!wallet) {
      return res.status(400).json({ ok: false, error: 'wallet is required' });
    }

    if (!isValidTronAddress(wallet)) {
      return res.status(400).json({ ok: false, error: 'invalid TRON address' });
    }

    const limit = req.query.limit;
    const offset = req.query.offset;
    const [onChainResult, dbResult] = await Promise.all([
      readAmbassadorDashboardOnChain(wallet).catch((error) => ({ error })),
      loadAmbassadorCabinetDb(wallet, { limit, offset }).catch((error) => ({ error }))
    ]);
    const dbError = dbResult?.error || null;
    const onChainError = onChainResult?.error || null;

    if (dbError) {
      console.error('[4TEEN API] ambassador cabinet DB read failed:', dbError);
    }

    if (onChainError) {
      console.error('[4TEEN API] ambassador cabinet on-chain read failed:', onChainError);
    }

    const db = dbError ? null : dbResult;
    const onChain = onChainError ? null : onChainResult;
    const dbAmbassador = db?.ambassador || null;

    if (!onChain?.exists && !dbAmbassador?.exists_on_chain) {
      return res.status(404).json({
        ok: false,
        error: 'Ambassador not found'
      });
    }

    const slug = normalizeSlug(dbAmbassador?.slug || db?.summary?.slug || '');
    const onChainSummary = onChain?.summary || null;
    const summary = {
      ...(onChainSummary || buildDbFallbackSummary(wallet, dbAmbassador, db?.summary || {})),
      slug: slug || onChainSummary?.slug || null,
      ...(db?.summary || {})
    };

    // Contract fields are authoritative and must win over DB sync snapshots.
    if (onChainSummary) {
      Object.assign(summary, {
        ambassador_wallet: wallet,
        exists_on_chain: onChainSummary.exists_on_chain,
        active: onChainSummary.active,
        effective_level: onChainSummary.effective_level,
        reward_percent: onChainSummary.reward_percent,
        created_at_chain: onChainSummary.created_at_chain,
        self_registered: onChainSummary.self_registered,
        manual_assigned: onChainSummary.manual_assigned,
        override_enabled: onChainSummary.override_enabled,
        current_level: onChainSummary.current_level,
        override_level: onChainSummary.override_level,
        slug_hash: onChainSummary.slug_hash,
        meta_hash: onChainSummary.meta_hash,
        total_buyers: onChainSummary.total_buyers,
        total_volume_sun: onChainSummary.total_volume_sun,
        total_rewards_accrued_sun: onChainSummary.total_rewards_accrued_sun,
        total_rewards_claimed_sun: onChainSummary.total_rewards_claimed_sun,
        claimable_rewards_sun: onChainSummary.claimable_rewards_sun
      });
    }

    const profile = {
      wallet,
      slug,
      status: summary.active === false ? 'inactive' : 'active',
      referralLink: buildReferralLink(slug)
    };

    res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');

    return res.json({
      ok: true,
      result: {
        profile,
        summary,
        buyersRows: db?.buyers?.rows || [],
        purchasesRows: db?.purchases?.rows || [],
        pendingRows: db?.pending?.rows || [],
        buyersTotal: Number(db?.buyers?.total || summary.buyers_count || summary.total_buyers || 0),
        purchasesTotal: Number(db?.purchases?.total || 0),
        pendingTotal: Number(db?.pending?.total || 0),
        source: {
          onChain: Boolean(onChainSummary),
          db: Boolean(db),
          dbError: dbError ? publicErrorMessage(dbError, 'Database read failed') : null,
          onChainError: onChainError ? publicErrorMessage(onChainError, 'On-chain read failed') : null
        }
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

async function readTrxPayment(txid) {
  const tx = await tronWeb.trx.getTransaction(txid);
  const info = await tronWeb.trx.getTransactionInfo(txid).catch(() => null);
  const contract = tx?.raw_data?.contract?.[0];
  const value = contract?.parameter?.value || {};

  if (contract?.type !== 'TransferContract') {
    throw new Error('Payment transaction is not a TRX transfer');
  }

  if (info?.receipt?.result && info.receipt.result !== 'SUCCESS') {
    throw new Error('Payment transaction was not successful');
  }

  const owner = toBase58Address(value.owner_address);
  const recipient = toBase58Address(value.to_address);
  const amountSun = String(value.amount || '0');

  if (!owner || !recipient || !/^\d+$/.test(amountSun)) {
    throw new Error('Payment transaction is invalid');
  }

  return {
    txid,
    owner,
    recipient,
    amountSun
  };
}

router.post('/registration-energy/quote', async (req, res) => {
  try {
    const wallet = normalizeWallet(req.body?.wallet);
    const slug = normalizeSlug(req.body?.slug);

    if (!wallet) {
      return res.status(400).json({ ok: false, error: 'wallet is required' });
    }

    if (!isValidTronAddress(wallet)) {
      return res.status(400).json({ ok: false, error: 'invalid TRON address' });
    }

    if (!slug) {
      return res.status(400).json({ ok: false, error: 'slug is required' });
    }

    await assertRegistrationCandidate(wallet, slug);
    const quote = await buildRegistrationEnergyQuote();

    return res.json({
      ok: true,
      result: {
        wallet,
        slug,
        ...quote
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/registration-energy/confirm', async (req, res) => {
  try {
    const wallet = normalizeWallet(req.body?.wallet);
    const slug = normalizeSlug(req.body?.slug);
    const paymentTxid = normalizeTxid(req.body?.paymentTxId || req.body?.paymentTxHash || req.body?.txid);

    if (!wallet) {
      return res.status(400).json({ ok: false, error: 'wallet is required' });
    }

    if (!isValidTronAddress(wallet)) {
      return res.status(400).json({ ok: false, error: 'invalid TRON address' });
    }

    if (!slug) {
      return res.status(400).json({ ok: false, error: 'slug is required' });
    }

    if (!paymentTxid) {
      return res.status(400).json({ ok: false, error: 'paymentTxId is required' });
    }

    await assertRegistrationCandidate(wallet, slug);

    const existing = await pool.query(
      `
        SELECT *
        FROM ambassador_energy_rentals
        WHERE payment_tx_hash = $1
        LIMIT 1
      `,
      [paymentTxid]
    );

    if (existing.rows[0]?.status === 'completed') {
      return res.json({
        ok: true,
        result: existing.rows[0]
      });
    }

    if (existing.rows[0]) {
      return res.status(409).json({
        ok: false,
        error: 'Energy rental is already being processed for this payment'
      });
    }

    const quote = await buildRegistrationEnergyQuote();
    const payment = await readTrxPayment(paymentTxid);

    if (payment.owner !== wallet) {
      return res.status(400).json({
        ok: false,
        error: 'Payment sender does not match wallet'
      });
    }

    if (payment.recipient !== quote.paymentAddress) {
      return res.status(400).json({
        ok: false,
        error: 'Payment recipient does not match rental treasury'
      });
    }

    if (BigInt(payment.amountSun) < BigInt(quote.amountSun)) {
      return res.status(400).json({
        ok: false,
        error: 'Payment amount is lower than current rental quote'
      });
    }

    await pool.query(
      `
        INSERT INTO ambassador_energy_rentals (
          wallet,
          slug,
          payment_tx_hash,
          payment_amount_sun,
          energy_quantity,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'paid')
      `,
      [wallet, slug, paymentTxid, payment.amountSun, quote.energyQuantity]
    );

    if (quote.mode === 'resale') {
      await pool.query(
        `
          UPDATE ambassador_energy_rentals
          SET
            request_id = $2,
            status = 'waiting_resale',
            row_json = $3,
            updated_at = NOW()
          WHERE payment_tx_hash = $1
        `,
        [
          paymentTxid,
          `resale:${paymentTxid.slice(0, 16)}`,
          JSON.stringify({
            mode: 'resale',
            payment,
            quote
          })
        ]
      );

      const energyState = await waitForResaleEnergyFulfillment(
        wallet,
        Number(quote.readyEnergy || quote.energyQuantity || 0)
      );

      const updated = await pool.query(
        `
          UPDATE ambassador_energy_rentals
          SET
            status = 'completed',
            row_json = $2,
            updated_at = NOW()
          WHERE payment_tx_hash = $1
          RETURNING *
        `,
        [
          paymentTxid,
          JSON.stringify({
            mode: 'resale',
            payment,
            quote,
            energyState
          })
        ]
      );

      return res.json({
        ok: true,
        result: updated.rows[0]
      });
    }

    try {
      const rented = await rentEnergyForWallet({
        receiveAddress: wallet,
        energyNum: quote.energyQuantity,
        requestPrefix: 'amb-reg-energy',
        paymentAmountSun: payment.amountSun,
        context: {
          purpose: 'ambassador_registration',
          paymentTxid
        }
      });

      const updated = await pool.query(
        `
          UPDATE ambassador_energy_rentals
          SET
            request_id = $2,
            trade_no = $3,
            status = 'completed',
            row_json = $4,
            updated_at = NOW()
          WHERE payment_tx_hash = $1
          RETURNING *
        `,
        [
          paymentTxid,
          rented.requestId,
          rented.tradeNo,
          JSON.stringify(rented.row || null)
        ]
      );

      return res.json({
        ok: true,
        result: updated.rows[0]
      });
    } catch (rentError) {
      await pool.query(
        `
          UPDATE ambassador_energy_rentals
          SET
            status = 'failed',
            updated_at = NOW()
          WHERE payment_tx_hash = $1
        `,
        [paymentTxid]
      );

      throw rentError;
    }
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/withdrawal/confirm', async (req, res) => {
  try {
    const wallet = normalizeWallet(req.body?.wallet);
    const txid = normalizeTxid(req.body?.txid);

    if (!wallet) {
      return res.status(400).json({ ok: false, error: 'wallet is required' });
    }

    if (!isValidTronAddress(wallet)) {
      return res.status(400).json({ ok: false, error: 'invalid TRON address' });
    }

    if (!txid) {
      return res.status(400).json({ ok: false, error: 'txid is required' });
    }

    const event = await getWithdrawalEventByTxHash(txid);

    if (event.ambassadorWallet !== wallet) {
      return res.status(400).json({
        ok: false,
        error: 'Withdrawal transaction does not belong to the provided wallet'
      });
    }

    const insertResult = await pool.query(
      `
        INSERT INTO ambassador_reward_withdrawals (
          ambassador_wallet,
          amount_sun,
          tx_hash,
          block_time
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tx_hash)
        DO NOTHING
        RETURNING
          id,
          ambassador_wallet,
          amount_sun,
          tx_hash,
          block_time,
          created_at
      `,
      [event.ambassadorWallet, event.amountSun, event.txHash, event.blockTime]
    );

    return res.json({
      ok: true,
      result: {
        wallet,
        txid: event.txHash,
        amountSun: event.amountSun,
        blockTime: event.blockTime,
        inserted: insertResult.rowCount > 0
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

module.exports = router;
