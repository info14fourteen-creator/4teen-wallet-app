const express = require('express');
const { pool } = require('../db/pool');
const {
  confirmEnergyResalePayment,
  getEnergyResaleStatus,
  getEnergyResalePackage,
  isValidTronAddress,
  normalizePurpose,
  normalizeWallet
} = require('../services/gasstation/energyResale');

const router = express.Router();

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
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

async function assertAmbassadorRegistrationCandidate(wallet, slug) {
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

async function assertPurposeSpecificInput({ purpose, wallet, slug }) {
  if (purpose !== 'ambassador_registration') {
    return {};
  }

  const normalizedSlug = normalizeSlug(slug);

  if (!normalizedSlug) {
    const error = new Error('slug is required');
    error.status = 400;
    throw error;
  }

  await assertAmbassadorRegistrationCandidate(wallet, normalizedSlug);

  return {
    slug: normalizedSlug
  };
}

function readSlug(req) {
  return (
    req.body?.slug ||
    req.body?.metadata?.slug ||
    req.query?.slug ||
    req.query?.metadata?.slug
  );
}

router.post('/rental/quote', async (req, res) => {
  try {
    const purpose = normalizePurpose(req.body?.purpose);
    const wallet = normalizeWallet(req.body?.wallet);

    if (!purpose) {
      return res.status(400).json({ ok: false, error: 'purpose is required' });
    }

    if (wallet && !isValidTronAddress(wallet)) {
      return res.status(400).json({ ok: false, error: 'invalid TRON address' });
    }

    const metadata = await assertPurposeSpecificInput({
      purpose,
      wallet,
      slug: readSlug(req)
    });

    const packageConfig = await getEnergyResalePackage(purpose, {
      requiredEnergy: req.body?.requiredEnergy || req.body?.energyShortfall,
      requiredBandwidth: req.body?.requiredBandwidth || req.body?.bandwidthShortfall
    });

    return res.json({
      ok: true,
      result: {
        ...packageConfig,
        wallet: wallet || null,
        ...metadata
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/rental/confirm', async (req, res) => {
  try {
    const purpose = normalizePurpose(req.body?.purpose);
    const wallet = normalizeWallet(req.body?.wallet);

    if (!purpose) {
      return res.status(400).json({ ok: false, error: 'purpose is required' });
    }

    if (!isValidTronAddress(wallet)) {
      return res.status(400).json({ ok: false, error: 'invalid TRON address' });
    }

    const metadata = await assertPurposeSpecificInput({
      purpose,
      wallet,
      slug: readSlug(req)
    });

    const result = await confirmEnergyResalePayment({
      purpose,
      wallet,
      paymentTxid: req.body?.paymentTxId || req.body?.paymentTxHash || req.body?.txid,
      requiredEnergy: req.body?.requiredEnergy || req.body?.energyShortfall,
      requiredBandwidth: req.body?.requiredBandwidth || req.body?.bandwidthShortfall
    });

    return res.json({
      ok: true,
      result: {
        ...result,
        ...metadata
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message,
      details: error.details || undefined
    });
  }
});

router.get('/rental/status', async (req, res) => {
  try {
    const result = await getEnergyResaleStatus({
      purpose: req.query?.purpose,
      wallet: req.query?.wallet,
      requiredEnergy: req.query?.requiredEnergy || req.query?.energyShortfall,
      requiredBandwidth: req.query?.requiredBandwidth || req.query?.bandwidthShortfall
    });

    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message,
      details: error.details || undefined
    });
  }
});

module.exports = router;
