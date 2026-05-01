import { translateNow } from '../../i18n';

const FOURTEEN = 'TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A';
const TRX = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const ROUTER_URL = 'https://rot.endjgfsv.link/swap/routerUniversal';

export const FOURTEEN_LOGO =
  'https://static.tronscan.org/production/upload/logo/new/TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A.png';

const DECIMALS = {
  [TRX]: 6,
  [USDT]: 6,
};

type RouterResponse = Record<string, unknown>;

function findAmountOutDeep(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;

  const obj = input as Record<string, unknown>;
  const keys = ['amountOut', 'amountOutStr', 'toAmount', 'toTokenAmount', 'outputAmount', 'amountOutMin'];

  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== '') {
      return String(value).trim();
    }
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      const nested = findAmountOutDeep(item);
      if (nested !== null) return nested;
    }
    return null;
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const nested = findAmountOutDeep(value);
      if (nested !== null) return nested;
    }
  }

  return null;
}

function normalizeAmount(raw: string, decimals: number) {
  const value = Number(raw) / Math.pow(10, decimals);
  if (!Number.isFinite(value)) return 0;
  return value;
}

async function getQuote(fromToken: string, toToken: string, amountInRaw: string) {
  const url =
    ROUTER_URL +
    '?fromToken=' + encodeURIComponent(fromToken) +
    '&toToken=' + encodeURIComponent(toToken) +
    '&amountIn=' + encodeURIComponent(amountInRaw) +
    '&typeList=' +
    '&includeUnverifiedV4Hook=true';

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`Router request failed: HTTP ${response.status}`);
  }

  const json = (await response.json()) as RouterResponse;
  const amountOut = findAmountOutDeep(json);

  if (!amountOut) {
    throw new Error(translateNow('Router response is missing output amount.'));
  }

  return amountOut;
}

export type FourteenPriceSnapshot = {
  priceInTrx: number;
  priceInUsdt: number;
  logo: string;
  pairBaseAmount: number;
};

export async function getFourteenPriceSnapshot(): Promise<FourteenPriceSnapshot> {
  const amountInRaw = '1000000';

  const [trxOutRaw, usdtOutRaw] = await Promise.all([
    getQuote(FOURTEEN, TRX, amountInRaw),
    getQuote(FOURTEEN, USDT, amountInRaw),
  ]);

  const priceInTrx = normalizeAmount(trxOutRaw, DECIMALS[TRX]);
  const priceInUsdt = normalizeAmount(usdtOutRaw, DECIMALS[USDT]);

  return {
    priceInTrx,
    priceInUsdt,
    logo: FOURTEEN_LOGO,
    pairBaseAmount: 1,
  };
}
