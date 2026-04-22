const express = require('express');
const {
  confirmEnergyResalePayment,
  getEnergyResaleStatus,
  getEnergyResalePackage,
  isValidTronAddress,
  normalizePurpose,
  normalizeWallet
} = require('../services/gasstation/energyResale');

const router = express.Router();

router.post('/quote', async (req, res) => {
  try {
    const purpose = normalizePurpose(req.body?.purpose);
    const wallet = normalizeWallet(req.body?.wallet);

    if (!purpose) {
      return res.status(400).json({ ok: false, error: 'purpose is required' });
    }

    if (wallet && !isValidTronAddress(wallet)) {
      return res.status(400).json({ ok: false, error: 'invalid TRON address' });
    }

    const packageConfig = await getEnergyResalePackage(purpose, {
      requiredEnergy: req.body?.requiredEnergy || req.body?.energyShortfall,
      requiredBandwidth: req.body?.requiredBandwidth || req.body?.bandwidthShortfall
    });

    return res.json({
      ok: true,
      result: {
        ...packageConfig,
        wallet: wallet || null
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/confirm', async (req, res) => {
  try {
    const result = await confirmEnergyResalePayment({
      purpose: req.body?.purpose,
      wallet: req.body?.wallet,
      paymentTxid: req.body?.paymentTxId || req.body?.paymentTxHash || req.body?.txid,
      requiredEnergy: req.body?.requiredEnergy || req.body?.energyShortfall,
      requiredBandwidth: req.body?.requiredBandwidth || req.body?.bandwidthShortfall
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

router.get('/status', async (req, res) => {
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
