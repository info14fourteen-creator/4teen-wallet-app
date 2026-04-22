const express = require('express');
const {
  getWalletSnapshot,
  getTrxPriceInfo
} = require('../services/proxy/walletSnapshot');

const router = express.Router();

function normalizeAddress(value) {
  return String(value || '').trim();
}

function isValidTronAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value || '').trim());
}

router.get('/trx-price', async (_req, res) => {
  try {
    const result = await getTrxPriceInfo();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/snapshot', async (req, res) => {
  try {
    const address = normalizeAddress(req.query.address);

    if (!address) {
      return res.status(400).json({
        ok: false,
        error: 'address is required'
      });
    }

    if (!isValidTronAddress(address)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid TRON address'
      });
    }

    const result = await getWalletSnapshot(address);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

module.exports = router;
