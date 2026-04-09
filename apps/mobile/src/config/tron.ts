export const TRONGRID_API_KEY = process.env.EXPO_PUBLIC_TRONGRID_API_KEY ?? '';
export const TRONSCAN_API_KEY = process.env.EXPO_PUBLIC_TRONSCAN_API_KEY ?? '';

export const TRONGRID_BASE_URL = 'https://api.trongrid.io';
export const TRONSCAN_BASE_URL = 'https://apilist.tronscanapi.com/api';

export function assertTronConfig() {
  if (!TRONGRID_API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_TRONGRID_API_KEY');
  }

  if (!TRONSCAN_API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_TRONSCAN_API_KEY');
  }
}
