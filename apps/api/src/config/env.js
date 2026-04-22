function optionalEnv(name, fallback = '') {
  const value = process.env[name];

  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized === '' ? fallback : normalized;
}

function requiredEnv(name) {
  const value = optionalEnv(name, '');

  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }

  return value;
}

function numberEnv(name, fallback) {
  const raw = optionalEnv(name, '');

  if (!raw) return fallback;

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number env: ${name}`);
  }

  return parsed;
}

module.exports = {
  PORT: numberEnv('PORT', 3000),

  DATABASE_URL: optionalEnv('DATABASE_URL', ''),
  TRON_FULL_HOST: optionalEnv('TRON_FULL_HOST', 'https://api.trongrid.io'),
  TRON_PRIVATE_KEY: optionalEnv('TRON_PRIVATE_KEY', ''),
  TRONGRID_API_KEY: optionalEnv('TRONGRID_API_KEY', ''),
  TRONGRID_API_KEY_1: optionalEnv('TRONGRID_API_KEY_1', ''),
  TRONGRID_API_KEY_2: optionalEnv('TRONGRID_API_KEY_2', ''),
  TRONGRID_API_KEY_3: optionalEnv('TRONGRID_API_KEY_3', ''),
  TRONSCAN_API_KEY: optionalEnv('TRONSCAN_API_KEY', ''),
  TRONSCAN_API_KEY_1: optionalEnv('TRONSCAN_API_KEY_1', ''),
  TRONSCAN_API_KEY_2: optionalEnv('TRONSCAN_API_KEY_2', ''),
  TRONSCAN_API_KEY_3: optionalEnv('TRONSCAN_API_KEY_3', ''),
  CMC_API_KEY: optionalEnv('CMC_API_KEY', ''),
  CMC_API_KEY_1: optionalEnv('CMC_API_KEY_1', ''),
  CMC_API_KEY_2: optionalEnv('CMC_API_KEY_2', ''),
  CMC_API_KEY_3: optionalEnv('CMC_API_KEY_3', ''),

  FOURTEEN_TOKEN_CONTRACT: optionalEnv('FOURTEEN_TOKEN_CONTRACT', 'TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A'),
  FOURTEEN_CONTROLLER_CONTRACT: optionalEnv('FOURTEEN_CONTROLLER_CONTRACT', 'TF8yhohRfMxsdVRr7fFrYLh5fxK8sAFkeZ'),

  ADMIN_SYNC_TOKEN: optionalEnv('ADMIN_SYNC_TOKEN', ''),
  ALLOWED_ORIGINS: optionalEnv(
    'ALLOWED_ORIGINS',
    'https://4teen.me,https://www.4teen.me,http://localhost:3000,http://127.0.0.1:3000'
  ),

  GASSTATION_ENABLED: optionalEnv('GASSTATION_ENABLED', 'false'),
  GASSTATION_API_BASE_URL: optionalEnv('GASSTATION_API_BASE_URL', 'https://openapi.gasstation.ai'),
  GASSTATION_API_KEY: optionalEnv('GASSTATION_API_KEY', ''),
  GASSTATION_API_SECRET: optionalEnv('GASSTATION_API_SECRET', ''),
  GASSTATION_SERVICE_CHARGE_TYPE: optionalEnv('GASSTATION_SERVICE_CHARGE_TYPE', '10010'),
  GASSTATION_MIN_BANDWIDTH: numberEnv('GASSTATION_MIN_BANDWIDTH', 5000),
  GASSTATION_MIN_ENERGY: numberEnv('GASSTATION_MIN_ENERGY', 64400),
  GASSTATION_REGISTRATION_ENERGY: numberEnv('GASSTATION_REGISTRATION_ENERGY', 100000),
  GASSTATION_REGISTRATION_ENERGY_MODE: optionalEnv('GASSTATION_REGISTRATION_ENERGY_MODE', 'api'),
  GASSTATION_RESALE_REGISTRATION_PAYMENT_ADDRESS: optionalEnv('GASSTATION_RESALE_REGISTRATION_PAYMENT_ADDRESS', ''),
  GASSTATION_RESALE_REGISTRATION_AMOUNT_SUN: optionalEnv('GASSTATION_RESALE_REGISTRATION_AMOUNT_SUN', ''),
  GASSTATION_RESALE_REGISTRATION_AMOUNT_TRX: optionalEnv('GASSTATION_RESALE_REGISTRATION_AMOUNT_TRX', ''),
  GASSTATION_RESALE_REGISTRATION_READY_ENERGY: numberEnv('GASSTATION_RESALE_REGISTRATION_READY_ENERGY', 90000),
  GASSTATION_RESALE_PACKAGES_JSON: optionalEnv('GASSTATION_RESALE_PACKAGES_JSON', ''),
  QUOTAGUARDSTATIC_URL: optionalEnv('QUOTAGUARDSTATIC_URL', ''),
  OPERATOR_WALLET: optionalEnv('OPERATOR_WALLET', 'TN95o1fsA7mNwJGYGedvf3y7DJZKLH6TCT')
};
