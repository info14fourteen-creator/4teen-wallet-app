const express = require('express');
const { recordGasStationNotification } = require('../services/gasstation/notifications');

const router = express.Router();

router.post('/notify/tron', async (req, res) => {
  try {
    await recordGasStationNotification(req.body || {});
    return res.type('text/plain').send('SUCCESS');
  } catch (error) {
    console.error('GasStation notification failed:', error);
    return res.type('text/plain').status(error.status || 500).send('FAILURE');
  }
});

module.exports = router;
