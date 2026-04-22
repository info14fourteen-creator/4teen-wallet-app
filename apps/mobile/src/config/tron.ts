function readEnv(name: string) {
  return String(process.env[name] || '').trim();
}

export const FOURTEEN_API_BASE_URL = (
  readEnv('EXPO_PUBLIC_4TEEN_API_BASE_URL') ||
  'https://api.4teen.me'
).replace(/\/+$/, '');
export const USE_4TEEN_API_PROXY = FOURTEEN_API_BASE_URL.length > 0;

export const TRONGRID_BASE_URL = USE_4TEEN_API_PROXY
  ? `${FOURTEEN_API_BASE_URL}/trongrid`
  : 'https://api.trongrid.io';
export const TRONSCAN_BASE_URL = USE_4TEEN_API_PROXY
  ? `${FOURTEEN_API_BASE_URL}/tronscan`
  : 'https://apilist.tronscanapi.com/api';
export const CMC_PRO_BASE_URL = USE_4TEEN_API_PROXY
  ? `${FOURTEEN_API_BASE_URL}/cmc/pro`
  : 'https://pro-api.coinmarketcap.com';
export const CMC_DATA_API_BASE_URL = USE_4TEEN_API_PROXY
  ? `${FOURTEEN_API_BASE_URL}/cmc/data`
  : 'https://api.coinmarketcap.com';
export const CMC_DAPI_BASE_URL = USE_4TEEN_API_PROXY
  ? `${FOURTEEN_API_BASE_URL}/cmc/dapi`
  : 'https://dapi.coinmarketcap.com';

export const TRONSCAN_API_KEYS: string[] = [];

export const TRONGRID_API_KEYS: string[] = [];

let trongridNextIndex = 0;

export function getNextTrongridApiKey() {
  if (TRONGRID_API_KEYS.length === 0) {
    return '';
  }

  const index = trongridNextIndex % TRONGRID_API_KEYS.length;
  trongridNextIndex = (index + 1) % TRONGRID_API_KEYS.length;
  return TRONGRID_API_KEYS[index] || '';
}

export function buildTrongridHeaders() {
  if (USE_4TEEN_API_PROXY) {
    return {};
  }

  const apiKey = getNextTrongridApiKey();
  return apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {};
}

export function assertTronConfig() {
  return;
}
