const { TronWeb } = require('tronweb');
const env = require('../../config/env');

const tronGridApiKey =
  env.TRONGRID_API_KEY ||
  env.TRONGRID_API_KEY_1 ||
  env.TRONGRID_API_KEY_2 ||
  env.TRONGRID_API_KEY_3;

const tronWeb = new TronWeb({
  fullHost: env.TRON_FULL_HOST,
  headers: tronGridApiKey
    ? {
        'TRON-PRO-API-KEY': tronGridApiKey
      }
    : undefined,
  privateKey: env.TRON_PRIVATE_KEY
});

module.exports = { tronWeb };
