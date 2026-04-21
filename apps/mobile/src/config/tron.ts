function readEnv(name: string) {
  return String(process.env[name] || '').trim();
}

function compact(values: string[]) {
  return values.filter((value) => value.length > 0);
}

export const TRONGRID_BASE_URL = 'https://api.trongrid.io';
export const TRONSCAN_BASE_URL = 'https://apilist.tronscanapi.com/api';

export const TRONSCAN_API_KEYS = compact([
  readEnv('EXPO_PUBLIC_TRONSCAN_API_KEY_1'),
  readEnv('EXPO_PUBLIC_TRONSCAN_API_KEY_2'),
  readEnv('EXPO_PUBLIC_TRONSCAN_API_KEY_3'),
]);

export const TRONGRID_API_KEYS = compact([
  readEnv('EXPO_PUBLIC_TRONGRID_API_KEY_1'),
  readEnv('EXPO_PUBLIC_TRONGRID_API_KEY_2'),
  readEnv('EXPO_PUBLIC_TRONGRID_API_KEY_3'),
]);

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
  const apiKey = getNextTrongridApiKey();
  return apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {};
}

export function assertTronConfig() {
  if (TRONSCAN_API_KEYS.length === 0) {
    throw new Error('Missing EXPO_PUBLIC_TRONSCAN_API_KEY_1..3');
  }

  if (TRONGRID_API_KEYS.length === 0) {
    throw new Error('Missing EXPO_PUBLIC_TRONGRID_API_KEY_1..3');
  }
}
