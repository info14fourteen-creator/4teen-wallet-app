const express = require('express');
const env = require('../config/env');
const { pool } = require('../db/pool');
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

function getRegistrationEnergyQuantity() {
  return Math.max(
    100000,
    Number(env.GASSTATION_REGISTRATION_ENERGY || 0),
    Number(env.GASSTATION_MIN_ENERGY || 0)
  );
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
  const quote = await quoteEnergyRental({
    energyNum: getRegistrationEnergyQuantity()
  });
  const amountSun = String(Math.ceil(Number(quote.amountSun || 0)));

  return {
    paymentAddress: env.OPERATOR_WALLET,
    amountSun,
    amountTrx: formatSunAsTrx(amountSun),
    energyQuantity: quote.energyQuantity
  };
}

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

    try {
      const rented = await rentEnergyForWallet({
        receiveAddress: wallet,
        energyNum: quote.energyQuantity,
        requestPrefix: 'amb-reg-energy'
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

module.exports = router;
