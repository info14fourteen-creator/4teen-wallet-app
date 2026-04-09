import {
  assertTronConfig,
  TRONGRID_API_KEY,
  TRONGRID_BASE_URL,
  TRONSCAN_API_KEY,
  TRONSCAN_BASE_URL,
} from '../../config/tron';

export type TronAccountInfo = {
  address: string;
  balanceSun: number;
  balanceTrx: number;
};

export type Trc20Asset = {
  tokenId: string;
  tokenName: string;
  tokenAbbr: string;
  tokenLogo?: string;
  balance: string;
  tokenDecimal: number;
  balanceFormatted: string;
  priceInUsd?: number;
  valueInUsd?: number;
  priceChange24h?: number;
};

export type TrxPriceInfo = {
  priceInUsd: number;
  priceChange24h?: number;
};

function buildUrl(base: string, path: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(`${base}${path}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

async function safeJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function trongridFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  assertTronConfig();

  const url = buildUrl(TRONGRID_BASE_URL, path, params);

  const response = await fetch(url, {
    headers: {
      'TRON-PRO-API-KEY': TRONGRID_API_KEY,
      Accept: 'application/json',
    },
  });

  return safeJson<T>(response);
}

export async function tronscanFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  assertTronConfig();

  const url = buildUrl(TRONSCAN_BASE_URL, path, params);

  const response = await fetch(url, {
    headers: {
      'TRON-PRO-API-KEY': TRONSCAN_API_KEY,
      Accept: 'application/json',
    },
  });

  return safeJson<T>(response);
}

function formatTokenBalance(rawBalance: string | number, decimals: number) {
  const balance = typeof rawBalance === 'number' ? String(rawBalance) : rawBalance;
  const value = Number(balance) / Math.pow(10, decimals);

  if (!Number.isFinite(value)) return '0';

  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(decimals, 6),
  });
}

export async function getAccountInfo(address: string): Promise<TronAccountInfo> {
  const data = await trongridFetch<{ data?: Array<{ address: string; balance: number }> }>(
    `/v1/accounts/${address}`
  );

  const item = data?.data?.[0];

  return {
    address,
    balanceSun: item?.balance ?? 0,
    balanceTrx: (item?.balance ?? 0) / 1_000_000,
  };
}

type TronscanTokensResponse = {
  trc20token_balances?: Array<{
    tokenId?: string;
    balance?: string;
    tokenName?: string;
    tokenAbbr?: string;
    tokenDecimal?: number | string;
    tokenLogo?: string;
    tokenType?: string;
    vip?: boolean;
    priceInUsd?: string | number;
    tokenPriceInUsd?: string | number;
    amountInUsd?: string | number;
    balanceInUsd?: string | number;
    price_change_24h?: string | number;
    priceChange24h?: string | number;
  }>;
};

export async function getAccountTrc20Assets(address: string): Promise<Trc20Asset[]> {
  const data = await tronscanFetch<TronscanTokensResponse>('/account/tokens', {
    address,
  });

  const balances = data?.trc20token_balances ?? [];

  return balances
    .filter((item) => item.tokenId && item.balance && Number(item.balance) > 0)
    .map((item) => {
      const decimals = Number(item.tokenDecimal ?? 0);
      const balance = item.balance ?? '0';

      const priceInUsdRaw =
        item.priceInUsd ??
        item.tokenPriceInUsd;

      const valueInUsdRaw =
        item.amountInUsd ??
        item.balanceInUsd;

      const priceChangeRaw =
        item.price_change_24h ??
        item.priceChange24h;

      return {
        tokenId: item.tokenId ?? '',
        tokenName: item.tokenName ?? '',
        tokenAbbr: item.tokenAbbr ?? '',
        tokenLogo: item.tokenLogo,
        balance,
        tokenDecimal: decimals,
        balanceFormatted: formatTokenBalance(balance, decimals),
        priceInUsd:
          priceInUsdRaw === undefined || priceInUsdRaw === null
            ? undefined
            : Number(priceInUsdRaw),
        valueInUsd:
          valueInUsdRaw === undefined || valueInUsdRaw === null
            ? undefined
            : Number(valueInUsdRaw),
        priceChange24h:
          priceChangeRaw === undefined || priceChangeRaw === null
            ? undefined
            : Number(priceChangeRaw),
      };
    });
}

type TrxPriceResponse = {
  price_in_usd?: string | number;
  priceInUsd?: string | number;
  change1d?: string | number;
  price_change_24h?: string | number;
};

export async function getTrxPrice(): Promise<TrxPriceInfo> {
  const data = await tronscanFetch<TrxPriceResponse>('/token/price', {
    contract: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
  });

  const rawPrice =
    data?.priceInUsd ??
    data?.price_in_usd ??
    0;

  const rawChange =
    data?.price_change_24h ??
    data?.change1d;

  return {
    priceInUsd: Number(rawPrice ?? 0),
    priceChange24h:
      rawChange === undefined || rawChange === null ? undefined : Number(rawChange),
  };
}

export async function getWalletSnapshot(address: string) {
  const [account, trc20Assets, trxPrice] = await Promise.all([
    getAccountInfo(address),
    getAccountTrc20Assets(address),
    getTrxPrice(),
  ]);

  const trxValueInUsd = account.balanceTrx * trxPrice.priceInUsd;

  return {
    address,
    trx: {
      balanceTrx: account.balanceTrx,
      valueInUsd: trxValueInUsd,
      priceInUsd: trxPrice.priceInUsd,
      priceChange24h: trxPrice.priceChange24h,
    },
    trc20Assets,
  };
}
