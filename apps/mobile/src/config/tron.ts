function readEnv(name: string) {
  return String(process.env[name] || '').trim();
}

export const FOURTEEN_API_BASE_URL = (
  readEnv('EXPO_PUBLIC_4TEEN_API_BASE_URL') ||
  'https://api.4teen.me'
).replace(/\/+$/, '');

export const TRONGRID_BASE_URL = `${FOURTEEN_API_BASE_URL}/trongrid`;
export const TRONSCAN_BASE_URL = `${FOURTEEN_API_BASE_URL}/tronscan`;
export const CMC_PRO_BASE_URL = `${FOURTEEN_API_BASE_URL}/cmc/pro`;
export const CMC_DATA_API_BASE_URL = `${FOURTEEN_API_BASE_URL}/cmc/data`;
export const CMC_DAPI_BASE_URL = `${FOURTEEN_API_BASE_URL}/cmc/dapi`;

export function buildTrongridHeaders() {
  return {};
}

export function assertTronConfig() {
  return;
}
