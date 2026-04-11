import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  assertTronConfig,
  TRONGRID_API_KEY,
  TRONGRID_BASE_URL,
  TRONSCAN_API_KEY,
  TRONSCAN_BASE_URL,
} from '../../config/tron';
import { getAddressBookMap } from '../address-book';
import { FOURTEEN_LOGO } from './fourteen-price';

const CMC_BASE_URL = 'https://pro-api.coinmarketcap.com';
const CMC_DATA_API_BASE_URL = 'https://api.coinmarketcap.com';
const CMC_DAPI_BASE_URL = 'https://dapi.coinmarketcap.com';
const CMC_API_KEY = String(process.env.EXPO_PUBLIC_CMC_API_KEY || '').trim();

const TRX_CMC_ID = 1958;

const TRX_SYMBOL = 'TRX';
const USDT_SYMBOL = 'USDT';
const FOURTEEN_SYMBOL = '4TEEN';

const TRX_LOGO = 'https://s2.coinmarketcap.com/static/img/coins/64x64/1958.png';
const USDT_LOGO = 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png';

export const TRX_TOKEN_ID = 'trx';
export const TRX_CONTRACT = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
export const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
export const FOURTEEN_CONTRACT = 'TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A';

type MarketMeta = {
  priceInUsd?: number;
  priceChange24h?: number;
  logo?: string;
  name?: string;
  symbol?: string;
  marketCap?: number;
  liquidityUsd?: number;
  volume24h?: number;
  totalSupply?: number;
  performance?: TokenPerformancePoint[];
  pools?: TokenPoolInfo[];
};

type CachedMarketIndex = {
  expiresAt: number;
  byContract: Record<string, MarketMeta>;
  trx: MarketMeta;
};

let marketCache: CachedMarketIndex | null = null;

const TOKEN_HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const TOKEN_HISTORY_CACHE_PREFIX = 'fourteen_token_history_cache_v4';
type TokenHistoryCachePayload = {
  savedAt: number;
  items: TokenHistoryItem[];
  nextFingerprint?: string;
  hasMore: boolean;
};

const tokenHistoryMemoryCache = new Map<string, TokenHistoryCachePayload>();

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
  logo?: string;
};

export type WalletSnapshot = {
  address: string;
  trx: {
    balanceTrx: number;
    valueInUsd: number;
    priceInUsd: number;
    priceChange24h?: number;
    logo?: string;
  };
  trc20Assets: Trc20Asset[];
};

export type TokenPerformancePoint = {
  label: '5m' | '1h' | '4h' | '24h';
  changePercent?: number;
};

export type TokenPoolInfo = {
  id: string;
  dexName: string;
  pairLabel: string;
  liquidityUsd?: number;
  volume24h?: number;
  address?: string;
};

export type TokenHistoryDisplayType =
  | 'RECEIVE'
  | 'SEND';

export type TokenHistoryItem = {
  id: string;
  txHash: string;
  type: 'IN' | 'OUT' | 'SELF';
  displayType: TokenHistoryDisplayType;
  amountRaw: string;
  amountFormatted: string;
  timestamp: number;
  from?: string;
  to?: string;
  counterpartyAddress?: string;
  counterpartyLabel?: string;
  isKnownContact: boolean;
  tronscanUrl: string;
};

export type TokenHistoryPage = {
  items: TokenHistoryItem[];
  nextFingerprint?: string;
  hasMore: boolean;
};

export type TokenDetails = {
  tokenId: string;
  walletAddress: string;
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  logo?: string;
  balanceRaw: string;
  balanceFormatted: string;
  balanceValueUsd: number;
  priceInUsd?: number;
  marketCap?: number;
  liquidityUsd?: number;
  totalSupply?: number;
  performance: TokenPerformancePoint[];
  pools: TokenPoolInfo[];
  history: TokenHistoryItem[];
  historyNextFingerprint?: string;
  historyHasMore: boolean;
};

type TrongridAccountItem = {
  address?: string;
  balance?: number | null;
  trc20?: Record<string, string>[];
};

type TrongridAccountResponse = {
  data?: TrongridAccountItem[];
};

type TronscanTokenItem = {
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
};

type TronscanTokensResponse = {
  trc20token_balances?: TronscanTokenItem[];
  data?: TronscanTokenItem[];
};

type RawTrc20Balance = {
  tokenId: string;
  balance: string;
};

type CmcDetailLiteResponse = {
  data?: {
    id?: number;
    name?: string;
    symbol?: string;
    statistics?: {
      price?: number | string;
      priceChangePercentage24h?: number | string;
      marketCap?: number | string;
      circulatingSupply?: number | string;
      totalSupply?: number | string;
    };
  };
};

type CmcProQuoteResponse = {
  data?: Record<
    string,
    {
      id?: number;
      name?: string;
      symbol?: string;
      quote?: {
        USD?: {
          price?: number | string;
          percent_change_24h?: number | string;
          market_cap?: number | string;
        };
      };
    }
  >;
};

type CmcDapiTokenListResponse = {
  data?: {
    list?: {
      pdex?: string;
      n?: string;
      sym?: string;
      lg?: string;
      p?: number | string;
      pc1h?: number | string;
      pc24h?: number | string;
    }[];
  };
};

type CmcDexTokenStatsItem = {
  tp?: string;
  vu?: string;
  pc?: number | string;
};

type CmcDexTokenResponse = {
  data?: {
    n?: string;
    sym?: string;
    addr?: string;
    dec?: number | string;
    p?: number | string;
    mcap?: number | string;
    ts?: number | string;
    liqUsd?: number | string;
    sts?: CmcDexTokenStatsItem[];
    pls?: {
      addr?: string;
      liqUsd?: number | string;
      v24?: number | string;
      exid?: number | string;
      exn?: string;
      t0?: {
        addr?: string;
        n?: string;
        sym?: string;
        lg?: string;
      };
      t1?: {
        addr?: string;
        n?: string;
        sym?: string;
        lg?: string;
      };
    }[];
  };
};

type TronscanTransferItem = {
  contractRet?: string;
  amount?: string | number;
  transactionHash?: string;
  tokenInfo?: {
    tokenId?: string;
    tokenAbbr?: string;
    tokenName?: string;
    tokenDecimal?: number | string;
    tokenType?: string;
    tokenLogo?: string;
  };
  transferFromAddress?: string;
  transferToAddress?: string;
  block?: number;
  timestamp?: number;
  confirmed?: boolean;
};

type TronscanTransferResponse = {
  total?: number;
  rangeTotal?: number;
  data?: TronscanTransferItem[];
};

type TronscanTrc20TransferItem = {
  transaction_id?: string;
  status?: number;
  block_ts?: number;
  from_address?: string;
  to_address?: string;
  block?: number;
  contract_address?: string;
  quant?: string | number;
  confirmed?: boolean;
  contractRet?: string;
  finalResult?: string;
  revert?: boolean;
  trigger_info?: {
    method?: string;
    methodName?: string;
  };
  tokenInfo?: {
    tokenId?: string;
    tokenAbbr?: string;
    tokenName?: string;
    tokenDecimal?: number | string;
    tokenType?: string;
    vip?: boolean;
  };
};

type TronscanTrc20TransferResponse = {
  total?: number;
  rangeTotal?: number;
  token_transfers?: TronscanTrc20TransferItem[];
};

type TronscanTrc20TransferWithStatusResponse = {
  total?: number;
  rangeTotal?: number;
  data?: TronscanTrc20TransferItem[];
};

function buildUrl(
  base: string,
  path: string,
  params?: Record<string, string | number | undefined>
) {
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

async function cmcFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  if (!CMC_API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_CMC_API_KEY');
  }

  const url = buildUrl(CMC_BASE_URL, path, params);

  const response = await fetch(url, {
    headers: {
      'X-CMC_PRO_API_KEY': CMC_API_KEY,
      Accept: 'application/json',
    },
  });

  return safeJson<T>(response);
}

async function cmcDataApiFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const url = buildUrl(CMC_DATA_API_BASE_URL, path, params);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  return safeJson<T>(response);
}

async function cmcDapiFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const url = buildUrl(CMC_DAPI_BASE_URL, path, params);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  return safeJson<T>(response);
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatTokenBalance(rawBalance: string | number, decimals: number) {
  const balance = typeof rawBalance === 'number' ? String(rawBalance) : rawBalance;
  const value = Number(balance) / Math.pow(10, decimals);

  if (!Number.isFinite(value)) return '0';

  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(Math.max(decimals, 0), 6),
  });
}

function normalizeTokenId(value: string) {
  return String(value || '').trim();
}

function dedupeBalances(items: RawTrc20Balance[]): RawTrc20Balance[] {
  const map = new Map<string, string>();

  for (const item of items) {
    if (!item.tokenId) continue;
    if (!item.balance) continue;
    if (Number(item.balance) <= 0) continue;
    map.set(item.tokenId, item.balance);
  }

  return Array.from(map.entries()).map(([tokenId, balance]) => ({
    tokenId,
    balance,
  }));
}

function extractTokenList(payload: TronscanTokensResponse): TronscanTokenItem[] {
  if (Array.isArray(payload?.trc20token_balances)) {
    return payload.trc20token_balances;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
}

function indexTronscanTokens(items: TronscanTokenItem[]): Record<string, TronscanTokenItem> {
  const indexed: Record<string, TronscanTokenItem> = {};

  for (const item of items) {
    const tokenId = normalizeTokenId(item.tokenId || '');
    if (!tokenId) continue;

    const tokenType = String(item.tokenType || '').toLowerCase();
    if (tokenType && tokenType !== 'trc20') {
      continue;
    }

    indexed[tokenId] = item;
  }

  return indexed;
}

function getKnownTokenMeta(tokenId: string): {
  tokenName: string;
  tokenAbbr: string;
  tokenDecimal: number;
  tokenLogo?: string;
} | null {
  if (tokenId === USDT_CONTRACT) {
    return {
      tokenName: 'Tether USDt',
      tokenAbbr: USDT_SYMBOL,
      tokenDecimal: 6,
      tokenLogo: USDT_LOGO,
    };
  }

  if (tokenId === FOURTEEN_CONTRACT) {
    return {
      tokenName: '4teen',
      tokenAbbr: FOURTEEN_SYMBOL,
      tokenDecimal: 6,
      tokenLogo: FOURTEEN_LOGO,
    };
  }

  return null;
}

function buildPerformance(
  stats: CmcDexTokenStatsItem[] | undefined,
  fallback24h?: number
): TokenPerformancePoint[] {
  const labels: TokenPerformancePoint['label'][] = ['5m', '1h', '4h', '24h'];

  return labels.map((label) => {
    const item = Array.isArray(stats)
      ? stats.find((entry) => String(entry.tp || '').toLowerCase() === label.toLowerCase())
      : undefined;

    if (label === '24h') {
      return {
        label,
        changePercent: parseNumber(item?.pc) ?? fallback24h,
      };
    }

    return {
      label,
      changePercent: parseNumber(item?.pc),
    };
  });
}

function extractDexLogo(
  payload: CmcDexTokenResponse['data'] | undefined,
  fallback?: string
): string | undefined {
  if (!payload) return fallback;

  for (const pool of payload.pls ?? []) {
    if (pool.t0?.addr === payload.addr && pool.t0?.lg) return pool.t0.lg;
    if (pool.t1?.addr === payload.addr && pool.t1?.lg) return pool.t1.lg;
  }

  return fallback;
}

function buildPools(payload: CmcDexTokenResponse['data'] | undefined): TokenPoolInfo[] {
  if (!payload?.pls?.length) return [];

  return payload.pls.map((pool, index) => {
    const token0 = pool.t0?.sym || '?';
    const token1 = pool.t1?.sym || '?';

    return {
      id: pool.addr || `${pool.exn || 'pool'}-${index}`,
      dexName: pool.exn || 'Pool',
      pairLabel: `${token0} / ${token1}`,
      liquidityUsd: parseNumber(pool.liqUsd),
      volume24h: parseNumber(pool.v24),
      address: pool.addr,
    };
  });
}

async function getTrxMarketMeta(): Promise<MarketMeta> {
  try {
    const payload = await cmcDataApiFetch<CmcDetailLiteResponse>(
      '/data-api/v3/cryptocurrency/detail/lite',
      { id: TRX_CMC_ID }
    );

    const data = payload.data;
    const stats = data?.statistics;

    if (data) {
      return {
        name: data.name || 'TRON',
        symbol: data.symbol || TRX_SYMBOL,
        priceInUsd: parseNumber(stats?.price),
        priceChange24h: parseNumber(stats?.priceChangePercentage24h),
        marketCap: parseNumber(stats?.marketCap),
        totalSupply: parseNumber(stats?.totalSupply),
        logo: TRX_LOGO,
        performance: [
          { label: '5m', changePercent: undefined },
          { label: '1h', changePercent: undefined },
          { label: '4h', changePercent: undefined },
          { label: '24h', changePercent: parseNumber(stats?.priceChangePercentage24h) },
        ],
      };
    }
  } catch (error) {
    console.error('Failed to load TRX lite detail:', error);
  }

  let detailLitePrice: number | undefined;
  let detailLiteChange24h: number | undefined;
  let detailLiteMcap: number | undefined;

  try {
    const detailLite = await cmcDataApiFetch<CmcDetailLiteResponse>(
      '/data-api/v3/cryptocurrency/detail/lite',
      {
        id: TRX_CMC_ID,
      }
    );

    detailLitePrice = parseNumber(detailLite.data?.statistics?.price);
    detailLiteChange24h = parseNumber(
      detailLite.data?.statistics?.priceChangePercentage24h
    );
    detailLiteMcap = parseNumber(detailLite.data?.statistics?.marketCap);
  } catch {}

  try {
    const dapi = await cmcDapiFetch<CmcDapiTokenListResponse>('/dex/v1/cdp/tokens', {
      cryptoId: TRX_CMC_ID,
    });

    const tronItem =
      dapi.data?.list?.find((item) => String(item.pdex || '').toUpperCase() === 'TRON') ||
      dapi.data?.list?.[0];

    return {
      name: tronItem?.n || 'TRON',
      symbol: tronItem?.sym || TRX_SYMBOL,
      priceInUsd: parseNumber(tronItem?.p) ?? detailLitePrice,
      priceChange24h: parseNumber(tronItem?.pc24h) ?? detailLiteChange24h,
      marketCap: detailLiteMcap,
      logo: tronItem?.lg || TRX_LOGO,
      performance: [
        { label: '5m', changePercent: undefined },
        { label: '1h', changePercent: parseNumber(tronItem?.pc1h) },
        { label: '4h', changePercent: undefined },
        { label: '24h', changePercent: parseNumber(tronItem?.pc24h) ?? detailLiteChange24h },
      ],
      pools: [],
    };
  } catch {}

  if (
    typeof detailLitePrice === 'number' ||
    typeof detailLiteChange24h === 'number' ||
    typeof detailLiteMcap === 'number'
  ) {
    return {
      name: 'TRON',
      symbol: TRX_SYMBOL,
      priceInUsd: detailLitePrice,
      priceChange24h: detailLiteChange24h,
      marketCap: detailLiteMcap,
      logo: TRX_LOGO,
      performance: [
        { label: '5m', changePercent: undefined },
        { label: '1h', changePercent: undefined },
        { label: '4h', changePercent: undefined },
        { label: '24h', changePercent: detailLiteChange24h },
      ],
      pools: [],
    };
  }

  const fallback = await cmcFetch<CmcProQuoteResponse>(
    '/v2/cryptocurrency/quotes/latest',
    {
      id: TRX_CMC_ID,
    }
  );

  const data = fallback.data?.[String(TRX_CMC_ID)];
  const usd = data?.quote?.USD;

  return {
    name: data?.name || 'TRON',
    symbol: data?.symbol || TRX_SYMBOL,
    priceInUsd: parseNumber(usd?.price),
    priceChange24h: parseNumber(usd?.percent_change_24h),
    marketCap: parseNumber(usd?.market_cap),
    logo: TRX_LOGO,
    performance: [
      { label: '5m', changePercent: undefined },
      { label: '1h', changePercent: undefined },
      { label: '4h', changePercent: undefined },
      { label: '24h', changePercent: parseNumber(usd?.percent_change_24h) },
    ],
    pools: [],
  };
}

async function getDexTokenMarketMeta(
  address: string,
  fallback: {
    name: string;
    symbol: string;
    logo?: string;
  }
): Promise<MarketMeta> {
  const response = await cmcFetch<CmcDexTokenResponse>('/v1/dex/token', {
    platform: 'TRON',
    address,
  });

  const data = response.data;

  return {
    name: data?.n || fallback.name,
    symbol: data?.sym || fallback.symbol,
    priceInUsd: parseNumber(data?.p),
    priceChange24h: buildPerformance(data?.sts)[3]?.changePercent,
    marketCap: parseNumber(data?.mcap),
    liquidityUsd: parseNumber(data?.liqUsd),
    totalSupply: parseNumber(data?.ts),
    volume24h: parseNumber(
      (data?.sts ?? []).find((entry) => String(entry.tp || '').toLowerCase() === '24h')?.vu
    ),
    logo: extractDexLogo(data, fallback.logo),
    performance: buildPerformance(data?.sts),
    pools: buildPools(data),
  };
}

async function getMarketIndex(): Promise<CachedMarketIndex> {
  const now = Date.now();

  if (marketCache && marketCache.expiresAt > now) {
    return marketCache;
  }

  const [trxMeta, usdtMeta, fourteenMeta] = await Promise.all([
    getTrxMarketMeta().catch(
      (): MarketMeta => ({
        name: 'TRON',
        symbol: TRX_SYMBOL,
        logo: TRX_LOGO,
        performance: [
          { label: '5m', changePercent: undefined },
          { label: '1h', changePercent: undefined },
          { label: '4h', changePercent: undefined },
          { label: '24h', changePercent: undefined },
        ],
        pools: [],
      })
    ),
    getDexTokenMarketMeta(USDT_CONTRACT, {
      name: 'Tether USDt',
      symbol: USDT_SYMBOL,
      logo: USDT_LOGO,
    }).catch(
      (): MarketMeta => ({
        name: 'Tether USDt',
        symbol: USDT_SYMBOL,
        logo: USDT_LOGO,
        performance: [
          { label: '5m', changePercent: undefined },
          { label: '1h', changePercent: undefined },
          { label: '4h', changePercent: undefined },
          { label: '24h', changePercent: undefined },
        ],
        pools: [],
      })
    ),
    getDexTokenMarketMeta(FOURTEEN_CONTRACT, {
      name: '4teen',
      symbol: FOURTEEN_SYMBOL,
      logo: FOURTEEN_LOGO,
    }).catch(
      (): MarketMeta => ({
        name: '4teen',
        symbol: FOURTEEN_SYMBOL,
        logo: FOURTEEN_LOGO,
        performance: [
          { label: '5m', changePercent: undefined },
          { label: '1h', changePercent: undefined },
          { label: '4h', changePercent: undefined },
          { label: '24h', changePercent: undefined },
        ],
        pools: [],
      })
    ),
  ]);

  const next: CachedMarketIndex = {
    expiresAt: now + 60_000,
    trx: trxMeta,
    byContract: {
      [USDT_CONTRACT]: usdtMeta,
      [FOURTEEN_CONTRACT]: fourteenMeta,
    },
  };

  marketCache = next;
  return next;
}

async function getTrongridAccount(address: string): Promise<TrongridAccountItem | null> {
  const data = await trongridFetch<TrongridAccountResponse>(`/v1/accounts/${address}`);
  return data?.data?.[0] ?? null;
}

function extractTrc20BalancesFromTrongrid(item: TrongridAccountItem | null): RawTrc20Balance[] {
  const list = Array.isArray(item?.trc20) ? item.trc20 : [];
  const balances: RawTrc20Balance[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;

    for (const [tokenId, balance] of Object.entries(entry)) {
      const normalizedTokenId = normalizeTokenId(tokenId);
      const normalizedBalance = String(balance || '').trim();

      if (!normalizedTokenId || !normalizedBalance) continue;
      if (Number(normalizedBalance) <= 0) continue;

      balances.push({
        tokenId: normalizedTokenId,
        balance: normalizedBalance,
      });
    }
  }

  return dedupeBalances(balances);
}

function buildTronscanTxUrl(txHash: string) {
  return `https://tronscan.org/#/transaction/${txHash}`;
}

function normalizeAddressKey(value?: string) {
  return String(value || '').trim().toLowerCase();
}

function isSameAddress(left?: string, right?: string) {
  const a = normalizeAddressKey(left);
  const b = normalizeAddressKey(right);

  return !!a && !!b && a === b;
}

function shortenAddress(value?: string) {
  const address = String(value || '').trim();

  if (!address) return 'Unknown address';
  if (address.length < 12) return address;

  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function buildTokenHistoryCacheKey(walletAddress: string, tokenId: string) {
  return `${TOKEN_HISTORY_CACHE_PREFIX}:${normalizeAddressKey(walletAddress)}:${normalizeAddressKey(tokenId)}`;
}

async function readTokenHistoryCache(cacheKey: string): Promise<TokenHistoryPage | null> {
  const now = Date.now();
  const memory = tokenHistoryMemoryCache.get(cacheKey);

  if (memory && now - memory.savedAt < TOKEN_HISTORY_CACHE_TTL_MS) {
    return {
      items: memory.items,
      nextFingerprint: memory.nextFingerprint,
      hasMore: memory.hasMore,
    };
  }

  try {
    const raw = await AsyncStorage.getItem(cacheKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as TokenHistoryCachePayload;

    if (
      !parsed ||
      typeof parsed.savedAt !== 'number' ||
      !Array.isArray(parsed.items)
    ) {
      return null;
    }

    if (now - parsed.savedAt >= TOKEN_HISTORY_CACHE_TTL_MS) {
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    tokenHistoryMemoryCache.set(cacheKey, parsed);

    return {
      items: parsed.items,
      nextFingerprint: parsed.nextFingerprint,
      hasMore: Boolean(parsed.hasMore),
    };
  } catch (error) {
    console.error('Failed to read token history cache:', error);
    return null;
  }
}

async function writeTokenHistoryCache(
  cacheKey: string,
  page: TokenHistoryPage
): Promise<void> {
  const payload: TokenHistoryCachePayload = {
    savedAt: Date.now(),
    items: page.items,
    nextFingerprint: page.nextFingerprint,
    hasMore: page.hasMore,
  };

  tokenHistoryMemoryCache.set(cacheKey, payload);

  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to write token history cache:', error);
  }
}

function getCounterpartyAddress(
  walletAddress: string,
  type: 'IN' | 'OUT' | 'SELF',
  fromAddress?: string,
  toAddress?: string
) {
  if (type === 'IN') {
    return fromAddress;
  }

  if (type === 'OUT') {
    return toAddress;
  }

  if (!isSameAddress(fromAddress, walletAddress)) {
    return fromAddress;
  }

  if (!isSameAddress(toAddress, walletAddress)) {
    return toAddress;
  }

  return toAddress || fromAddress;
}

function normalizeTrc20HistoryType(
  walletAddress: string,
  fromAddress?: string,
  toAddress?: string
): 'IN' | 'OUT' | 'SELF' {
  const wallet = String(walletAddress || '').trim();
  const from = String(fromAddress || '').trim();
  const to = String(toAddress || '').trim();

  if (from === wallet && to === wallet) return 'SELF';
  if (to === wallet) return 'IN';
  return 'OUT';
}

function formatHistoryAmount(
  amountRaw: string,
  decimals: number,
  displayType: TokenHistoryDisplayType
): string {
  const normalized = String(amountRaw || '0').trim();
  const base = formatTokenBalance(normalized, decimals);

  if (displayType === 'RECEIVE') {
    return `+${base}`;
  }

  return `-${base}`;
}

function isTokenHistoryItem(item: TokenHistoryItem | null): item is TokenHistoryItem {
  return item !== null;
}

function buildTrc20TransferHistoryItems(
  walletAddress: string,
  decimals: number,
  rows: TronscanTrc20TransferItem[],
  addressBook: Record<string, string>
): TokenHistoryItem[] {
  const dedupe = new Set<string>();

  return rows
    .map((item, index): TokenHistoryItem | null => {
      const txHash = String(item.transaction_id || `tx-${index}`);
      const amountRaw = String(item.quant ?? '0');
      const fromAddress = String(item.from_address || '').trim();
      const toAddress = String(item.to_address || '').trim();
      const walletKey = normalizeAddressKey(walletAddress);

      if (
        normalizeAddressKey(fromAddress) !== walletKey &&
        normalizeAddressKey(toAddress) !== walletKey
      ) {
        return null;
      }

      const baseType = normalizeTrc20HistoryType(walletAddress, fromAddress, toAddress);

      if (baseType === 'SELF') {
        return null;
      }

      const displayType: TokenHistoryDisplayType = baseType === 'IN' ? 'RECEIVE' : 'SEND';
      const counterpartyAddress = getCounterpartyAddress(
        walletAddress,
        baseType,
        item.from_address,
        item.to_address
      );
      const counterpartyKey = normalizeAddressKey(counterpartyAddress);
      const contactName = counterpartyKey ? addressBook[counterpartyKey] : undefined;

      return {
        id: txHash,
        txHash,
        type: baseType,
        displayType,
        amountRaw,
        amountFormatted: formatHistoryAmount(amountRaw, decimals, displayType),
        timestamp: Number(item.block_ts || 0),
        from: item.from_address,
        to: item.to_address,
        counterpartyAddress,
        counterpartyLabel: contactName || shortenAddress(counterpartyAddress),
        isKnownContact: Boolean(contactName),
        tronscanUrl: buildTronscanTxUrl(txHash),
      } satisfies TokenHistoryItem;
    })
    .filter(isTokenHistoryItem)
    .filter((item) => {
      const key = `${item.txHash}:${item.displayType}:${item.amountRaw}`;

      if (dedupe.has(key)) {
        return false;
      }

      dedupe.add(key);
      return true;
    });
}

function buildTrxTransferHistoryItems(
  walletAddress: string,
  rows: TronscanTransferItem[],
  addressBook: Record<string, string>
): TokenHistoryItem[] {
  const dedupe = new Set<string>();

  return rows
    .map((item, index): TokenHistoryItem | null => {
      const tokenAbbr = String(item.tokenInfo?.tokenAbbr || '').trim().toLowerCase();
      const tokenName = String(item.tokenInfo?.tokenName || '').trim().toLowerCase();
      const tokenId = String(item.tokenInfo?.tokenId || '').trim();
      const decimals = Number(item.tokenInfo?.tokenDecimal ?? 6) || 6;

      if (!(tokenAbbr === 'trx' || tokenName === 'trx' || tokenId === '_')) {
        return null;
      }

      const txHash = String(item.transactionHash || `trx-${index}`);
      const amountRaw = String(item.amount ?? '0');
      const baseType = normalizeTrc20HistoryType(
        walletAddress,
        item.transferFromAddress,
        item.transferToAddress
      );

      if (baseType === 'SELF') {
        return null;
      }

      const displayType: TokenHistoryDisplayType = baseType === 'IN' ? 'RECEIVE' : 'SEND';
      const counterpartyAddress = getCounterpartyAddress(
        walletAddress,
        baseType,
        item.transferFromAddress,
        item.transferToAddress
      );
      const counterpartyKey = normalizeAddressKey(counterpartyAddress);
      const contactName = counterpartyKey ? addressBook[counterpartyKey] : undefined;

      return {
        id: txHash,
        txHash,
        type: baseType,
        displayType,
        amountRaw,
        amountFormatted: formatHistoryAmount(amountRaw, decimals, displayType),
        timestamp: Number(item.timestamp || 0),
        from: item.transferFromAddress,
        to: item.transferToAddress,
        counterpartyAddress,
        counterpartyLabel: contactName || shortenAddress(counterpartyAddress),
        isKnownContact: Boolean(contactName),
        tronscanUrl: buildTronscanTxUrl(txHash),
      } satisfies TokenHistoryItem;
    })
    .filter(isTokenHistoryItem)
    .filter((item) => {
      const key = `${item.txHash}:${item.displayType}:${item.amountRaw}`;

      if (dedupe.has(key)) {
        return false;
      }

      dedupe.add(key);
      return true;
    });
}

export async function getTokenHistoryPage(
  walletAddress: string,
  tokenId: string,
  decimals: number,
  fingerprint?: string
): Promise<TokenHistoryPage> {
  const start = Math.max(0, Number.parseInt(String(fingerprint || '0'), 10) || 0);
  const limit = 20;

  try {
    const addressBook = await getAddressBookMap().catch(() => ({} as Record<string, string>));

    if (tokenId === TRX_TOKEN_ID) {
      const response = await tronscanFetch<TronscanTransferResponse>('/transfer', {
        sort: '-timestamp',
        count: 'true',
        limit,
        start,
        address: walletAddress,
        token: '_',
        filterTokenValue: 1,
      });

      const items = buildTrxTransferHistoryItems(walletAddress, response.data ?? [], addressBook);
      const total = parseNumber(response.rangeTotal) ?? parseNumber(response.total) ?? items.length;
      const nextStart = start + limit;
      const hasMore = total > nextStart;

      return {
        items,
        nextFingerprint: hasMore ? String(nextStart) : undefined,
        hasMore,
      };
    }

    const response = await tronscanFetch<TronscanTrc20TransferWithStatusResponse>(
      '/token_trc20/transfers-with-status',
      {
        limit,
        start,
        trc20Id: tokenId,
        address: walletAddress,
        direction: 0,
        db_version: 0,
        reverse: 'true',
      }
    );

    const items = buildTrc20TransferHistoryItems(
      walletAddress,
      decimals,
      response.data ?? [],
      addressBook
    );

    const total = parseNumber(response.rangeTotal) ?? parseNumber(response.total) ?? items.length;
    const nextStart = start + limit;
    const hasMore = total > nextStart;

    return {
      items,
      nextFingerprint: hasMore ? String(nextStart) : undefined,
      hasMore,
    };
  } catch (error) {
    console.error('Failed to load token history page:', tokenId, error);

    return {
      items: [],
      nextFingerprint: undefined,
      hasMore: false,
    };
  }
}

async function getTokenHistory(
  walletAddress: string,
  tokenId: string,
  decimals: number
): Promise<TokenHistoryPage> {
  const cacheKey = buildTokenHistoryCacheKey(walletAddress, tokenId);
  const cached = await readTokenHistoryCache(cacheKey);

  if (
    cached &&
    Array.isArray(cached.items) &&
    cached.items.every(
      (item) =>
        typeof item.displayType === 'string' &&
        (item.displayType === 'RECEIVE' || item.displayType === 'SEND') &&
        typeof item.amountFormatted === 'string' &&
        'counterpartyLabel' in item
    )
  ) {
    return cached;
  }

  const firstPage = await getTokenHistoryPage(walletAddress, tokenId, decimals);
  await writeTokenHistoryCache(cacheKey, firstPage);
  return firstPage;
}

export async function getAccountInfo(address: string): Promise<TronAccountInfo> {
  const item = await getTrongridAccount(address);
  const balanceSun = typeof item?.balance === 'number' ? item.balance : 0;

  return {
    address,
    balanceSun,
    balanceTrx: balanceSun / 1_000_000,
  };
}

export async function getAccountTrc20Assets(address: string): Promise<Trc20Asset[]> {
  const [accountItem, tronscanData, marketIndex] = await Promise.all([
    getTrongridAccount(address),
    tronscanFetch<TronscanTokensResponse>('/account/tokens', {
      address,
      start: 0,
      limit: 200,
      show: 1,
      sortType: 0,
      sortBy: 0,
    }).catch((): TronscanTokensResponse => ({})),
    getMarketIndex(),
  ]);

  const rawBalances = extractTrc20BalancesFromTrongrid(accountItem);
  const tronscanIndex = indexTronscanTokens(extractTokenList(tronscanData));

  return rawBalances.map((item) => {
    const tokenId = item.tokenId;
    const tronscanMeta = tronscanIndex[tokenId];
    const knownMeta = getKnownTokenMeta(tokenId);
    const marketMeta = marketIndex.byContract[tokenId] ?? {};

    const tokenDecimal =
      Number(tronscanMeta?.tokenDecimal ?? knownMeta?.tokenDecimal ?? 0) || 0;

    const tokenName =
      tronscanMeta?.tokenName ?? marketMeta.name ?? knownMeta?.tokenName ?? tokenId;

    const tokenAbbr =
      tronscanMeta?.tokenAbbr ??
      marketMeta.symbol ??
      knownMeta?.tokenAbbr ??
      tokenId.slice(0, 6);

    const tokenLogo =
      marketMeta.logo || tronscanMeta?.tokenLogo || knownMeta?.tokenLogo;

    const balanceFormatted = formatTokenBalance(item.balance, tokenDecimal);
    const balanceBase = Number(item.balance) / Math.pow(10, tokenDecimal || 0);

    const priceInUsd =
      marketMeta.priceInUsd ??
      parseNumber(tronscanMeta?.priceInUsd) ??
      parseNumber(tronscanMeta?.tokenPriceInUsd) ??
      0;

    const valueInUsd =
      parseNumber(tronscanMeta?.amountInUsd) ??
      parseNumber(tronscanMeta?.balanceInUsd) ??
      balanceBase * priceInUsd;

    const priceChange24h =
      marketMeta.priceChange24h ??
      parseNumber(tronscanMeta?.price_change_24h) ??
      parseNumber(tronscanMeta?.priceChange24h);

    return {
      tokenId,
      tokenName,
      tokenAbbr,
      tokenLogo,
      balance: item.balance,
      tokenDecimal,
      balanceFormatted,
      priceInUsd,
      valueInUsd,
      priceChange24h,
    };
  });
}

export async function getTrxPrice(): Promise<TrxPriceInfo> {
  const marketIndex = await getMarketIndex();

  return {
    priceInUsd: marketIndex.trx.priceInUsd ?? 0,
    priceChange24h: marketIndex.trx.priceChange24h,
    logo: marketIndex.trx.logo || TRX_LOGO,
  };
}

export async function getWalletSnapshot(address: string): Promise<WalletSnapshot> {
  const [account, trc20Assets, trxPrice] = await Promise.all([
    getAccountInfo(address),
    getAccountTrc20Assets(address),
    getTrxPrice(),
  ]);

  const trxValueInUsd = account.balanceTrx * (trxPrice.priceInUsd || 0);

  return {
    address,
    trx: {
      balanceTrx: account.balanceTrx,
      valueInUsd: trxValueInUsd,
      priceInUsd: trxPrice.priceInUsd,
      priceChange24h: trxPrice.priceChange24h,
      logo: trxPrice.logo,
    },
    trc20Assets,
  };
}

export async function getTokenDetails(
  walletAddress: string,
  tokenId: string
): Promise<TokenDetails> {
  const marketIndex = await getMarketIndex();

  if (tokenId === TRX_TOKEN_ID) {
    const [account, trxPrice] = await Promise.all([
      getAccountInfo(walletAddress),
      getTrxPrice(),
    ]);

    const historyPage = await getTokenHistory(walletAddress, tokenId, 6);

    return {
      tokenId,
      walletAddress,
      name: marketIndex.trx.name || 'TRON',
      symbol: marketIndex.trx.symbol || TRX_SYMBOL,
      address: TRX_CONTRACT,
      decimals: 6,
      logo: trxPrice.logo,
      balanceRaw: String(Math.round(account.balanceTrx * 1_000_000)),
      balanceFormatted: account.balanceTrx.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
      }),
      balanceValueUsd: account.balanceTrx * (trxPrice.priceInUsd || 0),
      priceInUsd: trxPrice.priceInUsd,
      marketCap: marketIndex.trx.marketCap,
      liquidityUsd: marketIndex.trx.liquidityUsd,
      totalSupply: marketIndex.trx.totalSupply,
      performance:
        marketIndex.trx.performance || [
          { label: '5m', changePercent: undefined },
          { label: '1h', changePercent: undefined },
          { label: '4h', changePercent: undefined },
          { label: '24h', changePercent: trxPrice.priceChange24h },
        ],
      pools: marketIndex.trx.pools || [],
      history: historyPage.items,
      historyNextFingerprint: historyPage.nextFingerprint,
      historyHasMore: historyPage.hasMore,
    };
  }

  const assets = await getAccountTrc20Assets(walletAddress);
  const asset = assets.find((item) => item.tokenId === tokenId);

  if (!asset) {
    throw new Error('Token not found in wallet.');
  }

  const marketMeta = marketIndex.byContract[tokenId] ?? {};
  const historyPage = await getTokenHistory(walletAddress, tokenId, asset.tokenDecimal);

  return {
    tokenId,
    walletAddress,
    name: asset.tokenName || marketMeta.name || tokenId,
    symbol: asset.tokenAbbr || marketMeta.symbol || tokenId.slice(0, 6),
    address: asset.tokenId,
    decimals: asset.tokenDecimal,
    logo: asset.tokenLogo || marketMeta.logo,
    balanceRaw: asset.balance,
    balanceFormatted: asset.balanceFormatted,
    balanceValueUsd: asset.valueInUsd || 0,
    priceInUsd: asset.priceInUsd ?? marketMeta.priceInUsd,
    marketCap: marketMeta.marketCap,
    liquidityUsd: marketMeta.liquidityUsd,
    totalSupply: marketMeta.totalSupply,
    performance:
      marketMeta.performance || [
        { label: '5m', changePercent: undefined },
        { label: '1h', changePercent: undefined },
        { label: '4h', changePercent: undefined },
        { label: '24h', changePercent: asset.priceChange24h },
      ],
    pools: marketMeta.pools || [],
    history: historyPage.items,
    historyNextFingerprint: historyPage.nextFingerprint,
    historyHasMore: historyPage.hasMore,
  };
}
