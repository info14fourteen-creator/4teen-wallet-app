import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  assertTronConfig,
  TRONGRID_API_KEYS,
  TRONGRID_BASE_URL,
  TRONSCAN_API_KEYS,
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

export const TRX_LOGO = 'https://s2.coinmarketcap.com/static/img/coins/64x64/1958.png';
const USDT_LOGO = 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png';
export { FOURTEEN_LOGO };

export const TRX_TOKEN_ID = 'trx';
export const TRX_CONTRACT = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
export const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
export const FOURTEEN_CONTRACT = 'TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A';

const TOKEN_HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const TOKEN_HISTORY_CACHE_PREFIX = 'fourteen_token_history_cache_v10';
const WALLET_HISTORY_CACHE_PREFIX = 'fourteen_wallet_history_cache_v1';
const DEFAULT_WALLET_HISTORY_LIMIT = 20;

const KEY_COOLDOWN_MS = 30_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MARKET_CACHE_TTL_MS = 5 * 60 * 1000;
const CMC_KEY_COOLDOWN_MS = 60_000;
const TRONSCAN_TOKEN_OVERVIEW_CACHE_TTL_MS = 30 * 60 * 1000;
const ACCOUNT_INFO_CACHE_TTL_MS = 2 * 60 * 1000;
const ACCOUNT_TRC20_ASSETS_CACHE_TTL_MS = 2 * 60 * 1000;
const WALLET_SNAPSHOT_CACHE_TTL_MS = 2 * 60 * 1000;
const ACCOUNT_RESOURCES_CACHE_TTL_MS = 2 * 60 * 1000;
const CUSTOM_TOKEN_CATALOG_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CUSTOM_TOKEN_CATALOG_STORAGE_KEY_PREFIX = 'wallet.customTokenCatalog.v2';

function normalizeCustomTokenCatalogWalletId(walletId: string) {
  return String(walletId || '').trim().toLowerCase();
}

function buildCustomTokenCatalogStorageKey(walletId: string) {
  return `${CUSTOM_TOKEN_CATALOG_STORAGE_KEY_PREFIX}:${normalizeCustomTokenCatalogWalletId(walletId)}`;
}
const TRONSCAN_PRICED_TOKENS_URL = 'https://apilist.tronscanapi.com/api/getAssetWithPriceList';

type ProviderName = 'tronscan' | 'trongrid';

type MarketMeta = {
  priceInUsd?: number;
  priceChange24h?: number;
  logo?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
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

type TokenHistoryCachePayload = {
  savedAt: number;
  items: TokenHistoryItem[];
  nextFingerprint?: string;
  hasMore: boolean;
};

type WalletHistoryCachePayload = {
  savedAt: number;
  items: WalletHistoryItem[];
  limit: number;
  nextFingerprint?: string;
  hasMore?: boolean;
};

type AccountInfoCacheEntry = {
  savedAt: number;
  data: TronAccountInfo;
};

type AccountTrc20AssetsCacheEntry = {
  savedAt: number;
  data: Trc20Asset[];
};

type WalletSnapshotCacheEntry = {
  savedAt: number;
  data: WalletSnapshot;
};

type AccountResourcesCacheEntry = {
  savedAt: number;
  data: WalletAccountResources;
};

type ProviderKeyState = {
  nextIndex: number;
  cooldownUntil: number[];
};

type TokenMetaFallback = {
  name?: string;
  symbol?: string;
  logo?: string;
  decimals?: number;
  priceInUsd?: number;
  priceChange24h?: number;
  liquidityUsd?: number;
  totalSupply?: number;
};

export type CmcDexSearchToken = {
  id: string;
  name: string;
  abbr: string;
  logo?: string;
  liquidityUsd?: number;
};

type CustomTokenCatalogCachePayload = {
  savedAt: number;
  items: CustomTokenCatalogItem[];
};

export type CustomTokenCatalogItem = {
  id: string;
  name: string;
  abbr: string;
  logo?: string;
  type?: string;
  vip?: boolean;
};


let marketCache: CachedMarketIndex | null = null;
let marketIndexInflight: Promise<CachedMarketIndex> | null = null;
let cmcCooldownUntil = 0;
const tokenHistoryMemoryCache = new Map<string, TokenHistoryCachePayload>();
const walletHistoryMemoryCache = new Map<string, WalletHistoryCachePayload>();
const accountInfoMemoryCache = new Map<string, AccountInfoCacheEntry>();
const accountTrc20AssetsMemoryCache = new Map<string, AccountTrc20AssetsCacheEntry>();
const walletSnapshotMemoryCache = new Map<string, WalletSnapshotCacheEntry>();
const accountResourcesMemoryCache = new Map<string, AccountResourcesCacheEntry>();
const accountInfoInflight = new Map<string, Promise<TronAccountInfo>>();
const accountTrc20AssetsInflight = new Map<string, Promise<Trc20Asset[]>>();
const walletSnapshotInflight = new Map<string, Promise<WalletSnapshot>>();
const accountResourcesInflight = new Map<string, Promise<WalletAccountResources>>();
const tronscanTokenOverviewMemoryCache = new Map<
  string,
  {
    savedAt: number;
    data: TokenMetaFallback;
  }
>();
const tronscanTokenOverviewInflight = new Map<string, Promise<TokenMetaFallback>>();
const customTokenCatalogMemoryCache = new Map<string, CustomTokenCatalogItem[]>();
const customTokenCatalogInflight = new Map<string, Promise<CustomTokenCatalogItem[]>>();

const providerKeyState: Record<ProviderName, ProviderKeyState> = {
  tronscan: {
    nextIndex: 0,
    cooldownUntil: [],
  },
  trongrid: {
    nextIndex: 0,
    cooldownUntil: [],
  },
};

export type TronAccountInfo = {
  address: string;
  balanceSun: number;
  balanceTrx: number;
};

export type WalletAccountResources = {
  address: string;
  energyUsed: number;
  energyLimit: number;
  bandwidthUsed: number;
  bandwidthLimit: number;
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

export type TokenHistoryDisplayType = 'RECEIVE' | 'SEND';

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

export type WalletHistoryItem = TokenHistoryItem & {
  tokenId: string;
  tokenName: string;
  tokenSymbol: string;
  tokenLogo?: string;
};

export type WalletHistoryPage = {
  items: WalletHistoryItem[];
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

type TronscanTokenOverviewItem = {
  symbol?: string;
  contract_address?: string;
  icon_url?: string;
  decimals?: number | string;
  name?: string;
  total_supply?: number | string;
  total_supply_with_decimals?: number | string;
  market_info?: {
    priceInUsd?: number | string;
    gain?: number | string;
    liquidity?: number | string;
  };
};

type TronscanTokenOverviewResponse = {
  total?: number;
  rangeTotal?: number;
  trc20_tokens?: TronscanTokenOverviewItem[];
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

type TronAccountResourcesResponse = {
  freeNetUsed?: number | string;
  freeNetLimit?: number | string;
  NetUsed?: number | string;
  NetLimit?: number | string;
  EnergyUsed?: number | string;
  EnergyLimit?: number | string;
};

function getProviderBaseUrl(provider: ProviderName) {
  return provider === 'tronscan' ? TRONSCAN_BASE_URL : TRONGRID_BASE_URL;
}

function getProviderApiKeys(provider: ProviderName) {
  return provider === 'tronscan' ? TRONSCAN_API_KEYS : TRONGRID_API_KEYS;
}

function buildUrl(
  base: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined>
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

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePositiveCount(value: unknown): number | undefined {
  const parsed = parseNumber(value);
  if (typeof parsed !== 'number') return undefined;
  if (parsed < 0) return undefined;
  return parsed;
}

function parseRetryDelayMsFromText(text: string) {
  const secondsMatch = text.match(/(\d+)\s*s/i);
  if (!secondsMatch) {
    return KEY_COOLDOWN_MS;
  }

  const seconds = Number(secondsMatch[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return KEY_COOLDOWN_MS;
  }

  return seconds * 1000;
}

function isCmcRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('HTTP 429');
}

function isCmcInvalidKeyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();

  return (
    message.includes('HTTP 401') &&
    (message.includes('1001') || lower.includes('api key is invalid'))
  );
}

function getSafeCmcCooldownUntil() {
  return cmcCooldownUntil > Date.now() ? cmcCooldownUntil : 0;
}

function buildFallbackPerformance(
  fallback24h?: number
): TokenPerformancePoint[] {
  return [
    { label: '5m', changePercent: undefined },
    { label: '1h', changePercent: undefined },
    { label: '4h', changePercent: undefined },
    { label: '24h', changePercent: fallback24h },
  ];
}

function mergeTokenMetaFallbacks(
  primary?: TokenMetaFallback,
  secondary?: TokenMetaFallback,
  tertiary?: TokenMetaFallback
): TokenMetaFallback {
  return {
    name: primary?.name ?? secondary?.name ?? tertiary?.name,
    symbol: primary?.symbol ?? secondary?.symbol ?? tertiary?.symbol,
    logo: primary?.logo ?? secondary?.logo ?? tertiary?.logo,
    decimals: primary?.decimals ?? secondary?.decimals ?? tertiary?.decimals,
    priceInUsd: primary?.priceInUsd ?? secondary?.priceInUsd ?? tertiary?.priceInUsd,
    priceChange24h: primary?.priceChange24h ?? secondary?.priceChange24h ?? tertiary?.priceChange24h,
    liquidityUsd: primary?.liquidityUsd ?? secondary?.liquidityUsd ?? tertiary?.liquidityUsd,
    totalSupply: primary?.totalSupply ?? secondary?.totalSupply ?? tertiary?.totalSupply,
  };
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

function normalizeAddressKey(value?: string) {
  return String(value || '').trim().toLowerCase();
}

function buildAccountInfoRuntimeCacheKey(address: string) {
  return normalizeAddressKey(address);
}

function buildAccountTrc20AssetsRuntimeCacheKey(address: string) {
  return normalizeAddressKey(address);
}

function buildWalletSnapshotRuntimeCacheKey(address: string) {
  return normalizeAddressKey(address);
}

function buildAccountResourcesRuntimeCacheKey(address: string) {
  return normalizeAddressKey(address);
}

function readFreshRuntimeCache<T extends { savedAt: number; data: unknown }>(
  cache: Map<string, T>,
  key: string,
  ttlMs: number
): T['data'] | null {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.savedAt >= ttlMs) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

function writeRuntimeCache<T>(
  cache: Map<string, { savedAt: number; data: T }>,
  key: string,
  data: T
) {
  cache.set(key, {
    savedAt: Date.now(),
    data,
  });
}

export function clearWalletRuntimeCaches(address: string) {
  const normalized = normalizeAddressKey(address);

  accountInfoMemoryCache.delete(normalized);
  accountTrc20AssetsMemoryCache.delete(normalized);
  walletSnapshotMemoryCache.delete(normalized);
  accountResourcesMemoryCache.delete(normalized);
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

function buildTronscanTxUrl(txHash: string) {
  return `https://tronscan.org/#/transaction/${txHash}`;
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

function buildTronscanTokenOverviewFallback(
  item: TronscanTokenOverviewItem | undefined,
  knownMeta?: {
    tokenName: string;
    tokenAbbr: string;
    tokenDecimal: number;
    tokenLogo?: string;
  } | null
): TokenMetaFallback {
  return mergeTokenMetaFallbacks(
    {
      name: item?.name,
      symbol: item?.symbol,
      logo: item?.icon_url,
      decimals: parseNumber(item?.decimals),
      priceInUsd: parseNumber(item?.market_info?.priceInUsd),
      priceChange24h: parseNumber(item?.market_info?.gain),
      liquidityUsd: parseNumber(item?.market_info?.liquidity),
      totalSupply: parseNumber(item?.total_supply_with_decimals) || parseNumber(item?.total_supply),
    },
    {
      name: knownMeta?.tokenName,
      symbol: knownMeta?.tokenAbbr,
      logo: knownMeta?.tokenLogo,
      decimals: knownMeta?.tokenDecimal,
    }
  );
}

function readTronscanTokenOverviewCache(tokenId: string): TokenMetaFallback | null {
  const cacheKey = normalizeAddressKey(tokenId);
  const cached = tronscanTokenOverviewMemoryCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.savedAt >= TRONSCAN_TOKEN_OVERVIEW_CACHE_TTL_MS) {
    tronscanTokenOverviewMemoryCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function writeTronscanTokenOverviewCache(tokenId: string, data: TokenMetaFallback) {
  tronscanTokenOverviewMemoryCache.set(normalizeAddressKey(tokenId), {
    savedAt: Date.now(),
    data,
  });
}

async function getTronscanTokenOverview(tokenId: string): Promise<TokenMetaFallback> {
  const normalizedTokenId = normalizeTokenId(tokenId);
  if (!normalizedTokenId) {
    return {};
  }

  const cached = readTronscanTokenOverviewCache(normalizedTokenId);
  if (cached) {
    return cached;
  }

  const inflight = tronscanTokenOverviewInflight.get(normalizeAddressKey(normalizedTokenId));
  if (inflight) {
    return inflight;
  }

  const request = (async (): Promise<TokenMetaFallback> => {
    const knownMeta = getKnownTokenMeta(normalizedTokenId);

    try {
      const response = await tronscanFetch<TronscanTokenOverviewResponse>('/token_trc20', {
        contract: normalizedTokenId,
        showAll: 1,
        start: 0,
        limit: 1,
      });

      const item =
        (response.trc20_tokens ?? []).find(
          (entry) => normalizeTokenId(entry.contract_address || '') === normalizedTokenId
        ) || response.trc20_tokens?.[0];

      const fallback = buildTronscanTokenOverviewFallback(item, knownMeta);
      writeTronscanTokenOverviewCache(normalizedTokenId, fallback);
      return fallback;
    } catch (error) {
      console.warn('Failed to load Tronscan token overview:', normalizedTokenId, error);
      const fallback = buildTronscanTokenOverviewFallback(undefined, knownMeta);
      writeTronscanTokenOverviewCache(normalizedTokenId, fallback);
      return fallback;
    }
  })();

  tronscanTokenOverviewInflight.set(normalizeAddressKey(normalizedTokenId), request);

  try {
    return await request;
  } finally {
    tronscanTokenOverviewInflight.delete(normalizeAddressKey(normalizedTokenId));
  }
}

async function getTronscanTokenOverviewMap(tokenIds: string[]): Promise<Record<string, TokenMetaFallback>> {
  const uniqueTokenIds = Array.from(
    new Set(
      tokenIds
        .map((tokenId) => normalizeTokenId(tokenId))
        .filter(Boolean)
    )
  );

  const entries = await Promise.all(
    uniqueTokenIds.map(async (tokenId) => {
      return [tokenId, await getTronscanTokenOverview(tokenId)] as const;
    })
  );

  return Object.fromEntries(entries);
}

function normalizeCustomTokenCatalogItems(value: unknown): CustomTokenCatalogItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: CustomTokenCatalogItem[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const id = String(record.id || '').trim();
    const name = String(record.name || '').trim();
    const abbr = String(record.abbr || '').trim();
    const logo = String(record.logo || '').trim() || undefined;
    const type = String(record.type || '').trim() || undefined;
    const vip = Boolean(record.vip);

    if (!id || (!name && !abbr)) {
      continue;
    }

    items.push({
      id,
      name,
      abbr,
      logo,
      type,
      vip,
    });
  }

  return items.sort((a, b) => {
    const left = (a.name || a.abbr || a.id).toLowerCase();
    const right = (b.name || b.abbr || b.id).toLowerCase();
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  });
}
export async function getCustomTokenCatalog(walletId: string): Promise<CustomTokenCatalogItem[]> {
  const safeWalletId = normalizeCustomTokenCatalogWalletId(walletId);
  if (!safeWalletId) return [];

  const storageKey = buildCustomTokenCatalogStorageKey(safeWalletId);
  const memory = customTokenCatalogMemoryCache.get(storageKey);
  if (memory) {
    return memory;
  }

  const inflight = customTokenCatalogInflight.get(storageKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);

      if (!raw) {
        customTokenCatalogMemoryCache.set(storageKey, []);
        return [];
      }

      const parsed = JSON.parse(raw) as unknown;

      if (
        parsed &&
        typeof parsed === 'object' &&
        'savedAt' in (parsed as Record<string, unknown>) &&
        'items' in (parsed as Record<string, unknown>)
      ) {
        await AsyncStorage.removeItem(storageKey);
        customTokenCatalogMemoryCache.delete(storageKey);
        return [];
      }

      const normalized = normalizeCustomTokenCatalogItems(parsed);
      customTokenCatalogMemoryCache.set(storageKey, normalized);
      return normalized;
    } catch (error) {
      console.error('Failed to read custom token catalog:', error);
      return [];
    } finally {
      customTokenCatalogInflight.delete(storageKey);
    }
  })();

  customTokenCatalogInflight.set(storageKey, request);
  return request;
}

export async function clearCustomTokenCatalog(walletId: string): Promise<void> {
  const safeWalletId = normalizeCustomTokenCatalogWalletId(walletId);
  if (!safeWalletId) return;

  const storageKey = buildCustomTokenCatalogStorageKey(safeWalletId);
  customTokenCatalogMemoryCache.delete(storageKey);
  customTokenCatalogInflight.delete(storageKey);

  try {
    await AsyncStorage.removeItem(storageKey);
  } catch (error) {
    console.error('Failed to clear custom token catalog:', error);
    throw error;
  }
}

export async function setCustomTokenCatalog(
  walletId: string,
  items: CustomTokenCatalogItem[]
): Promise<void> {
  const safeWalletId = normalizeCustomTokenCatalogWalletId(walletId);
  if (!safeWalletId) {
    throw new Error('Wallet id is required.');
  }

  const normalized = normalizeCustomTokenCatalogItems(items);
  const storageKey = buildCustomTokenCatalogStorageKey(safeWalletId);

  customTokenCatalogMemoryCache.set(storageKey, normalized);
  customTokenCatalogInflight.delete(storageKey);

  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(normalized));
  } catch (error) {
    console.error('Failed to write custom token catalog:', error);
    throw error;
  }
}

function buildTokenHistoryCacheKey(walletAddress: string, tokenId: string) {
  return `${TOKEN_HISTORY_CACHE_PREFIX}:${normalizeAddressKey(walletAddress)}:${normalizeAddressKey(tokenId)}`;
}

function buildWalletHistoryCacheKey(walletAddress: string, limit: number) {
  return `${WALLET_HISTORY_CACHE_PREFIX}:${normalizeAddressKey(walletAddress)}:${limit}`;
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

    if (!parsed || typeof parsed.savedAt !== 'number' || !Array.isArray(parsed.items)) {
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

async function writeTokenHistoryCache(cacheKey: string, page: TokenHistoryPage): Promise<void> {
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

async function readWalletHistoryCache(
  cacheKey: string,
  limit: number
): Promise<WalletHistoryPage | null> {
  const now = Date.now();
  const memory = walletHistoryMemoryCache.get(cacheKey);

  if (memory && memory.limit === limit && now - memory.savedAt < TOKEN_HISTORY_CACHE_TTL_MS) {
    return {
      items: memory.items,
      nextFingerprint: (memory as any).nextFingerprint,
      hasMore: Boolean((memory as any).hasMore),
    };
  }

  try {
    const raw = await AsyncStorage.getItem(cacheKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as WalletHistoryCachePayload;

    if (
      !parsed ||
      typeof parsed.savedAt !== 'number' ||
      !Array.isArray(parsed.items) ||
      typeof parsed.limit !== 'number'
    ) {
      return null;
    }

    if (parsed.limit !== limit) {
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    if (now - parsed.savedAt >= TOKEN_HISTORY_CACHE_TTL_MS) {
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    walletHistoryMemoryCache.set(cacheKey, parsed);
    return {
      items: parsed.items,
      nextFingerprint: (parsed as any).nextFingerprint,
      hasMore: Boolean((parsed as any).hasMore),
    };
  } catch (error) {
    console.error('Failed to read wallet history cache:', error);
    return null;
  }
}

async function writeWalletHistoryCache(
  cacheKey: string,
  page: WalletHistoryPage,
  limit: number
): Promise<void> {
  const payload: WalletHistoryCachePayload = {
    savedAt: Date.now(),
    items: page.items,
    limit,
    nextFingerprint: page.nextFingerprint,
    hasMore: page.hasMore,
  };

  walletHistoryMemoryCache.set(cacheKey, payload);

  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to write wallet history cache:', error);
  }
}

export async function clearWalletHistoryCache(
  walletAddress: string,
  limit = DEFAULT_WALLET_HISTORY_LIMIT
): Promise<void> {
  const cacheKey = buildWalletHistoryCacheKey(walletAddress, limit);
  walletHistoryMemoryCache.delete(cacheKey);

  try {
    await AsyncStorage.removeItem(cacheKey);
  } catch (error) {
    console.error('Failed to clear wallet history cache:', error);
  }
}

export async function prependWalletHistoryCacheItem(
  walletAddress: string,
  item: WalletHistoryItem,
  limit = DEFAULT_WALLET_HISTORY_LIMIT
): Promise<void> {
  const cacheKey = buildWalletHistoryCacheKey(walletAddress, limit);
  const current = await readWalletHistoryCache(cacheKey, limit);
  const nextItems = dedupeWalletHistoryItems([item, ...(current?.items || [])])
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);

  await writeWalletHistoryCache(
    cacheKey,
    {
      items: nextItems,
      nextFingerprint: current?.nextFingerprint,
      hasMore: current?.hasMore ?? false,
    },
    limit
  );
}

export async function prependTokenHistoryCacheItem(
  walletAddress: string,
  tokenId: string,
  item: TokenHistoryItem
): Promise<void> {
  const cacheKey = buildTokenHistoryCacheKey(walletAddress, tokenId);
  const current = await readTokenHistoryCache(cacheKey);
  const nextItems = dedupeHistoryItems([item, ...(current?.items || [])]).sort(
    (a, b) => b.timestamp - a.timestamp
  );

  await writeTokenHistoryCache(cacheKey, {
    items: nextItems,
    nextFingerprint: current?.nextFingerprint,
    hasMore: current?.hasMore ?? false,
  });
}

export async function clearTokenHistoryCache(
  walletAddress: string,
  tokenId: string
): Promise<void> {
  const cacheKey = buildTokenHistoryCacheKey(walletAddress, tokenId);
  tokenHistoryMemoryCache.delete(cacheKey);

  try {
    await AsyncStorage.removeItem(cacheKey);
  } catch (error) {
    console.error('Failed to clear token history cache:', error);
  }
}

async function fetchWithProviderKeyPool<T>(
  provider: ProviderName,
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  assertTronConfig();

  const keys = getProviderApiKeys(provider);
  const baseUrl = getProviderBaseUrl(provider);
  const state = providerKeyState[provider];

  if (!keys.length) {
    throw new Error(`No API keys configured for ${provider}`);
  }

  if (state.cooldownUntil.length !== keys.length) {
    state.cooldownUntil = new Array(keys.length).fill(0);
  }

  const now = Date.now();
  const orderedIndexes = Array.from({ length: keys.length }, (_, offset) => {
    return (state.nextIndex + offset) % keys.length;
  });

  const availableIndexes = orderedIndexes.filter((index) => state.cooldownUntil[index] <= now);
  const fallbackIndexes = availableIndexes.length > 0 ? availableIndexes : orderedIndexes;

  let lastError: Error | null = null;

  for (const index of fallbackIndexes) {
    const apiKey = keys[index];
    const url = buildUrl(baseUrl, path, params);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          'TRON-PRO-API-KEY': apiKey,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();

        if (response.status === 429) {
          state.cooldownUntil[index] = Date.now() + parseRetryDelayMsFromText(text);
        }

        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      state.nextIndex = (index + 1) % keys.length;
      state.cooldownUntil[index] = 0;

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeout);

      lastError =
        error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown request error');

      if (String(lastError.message).toLowerCase().includes('aborted')) {
        state.cooldownUntil[index] = Date.now() + 5_000;
      }

      console.warn(`[${provider}] request failed with key #${index + 1}:`, lastError.message);
    }
  }

  throw lastError || new Error(`All ${provider} keys failed`);
}

async function postWithProviderKeyPool<T>(
  provider: ProviderName,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  assertTronConfig();

  const baseUrl = getProviderBaseUrl(provider);
  const keys = getProviderApiKeys(provider);
  const state = providerKeyState[provider];

  if (!keys.length) {
    throw new Error(`No API keys configured for ${provider}`);
  }

  if (state.cooldownUntil.length !== keys.length) {
    state.cooldownUntil = new Array(keys.length).fill(0);
  }

  const now = Date.now();
  const orderedIndexes = Array.from({ length: keys.length }, (_, offset) => {
    return (state.nextIndex + offset) % keys.length;
  });

  const availableIndexes = orderedIndexes.filter((index) => state.cooldownUntil[index] <= now);
  const fallbackIndexes = availableIndexes.length > 0 ? availableIndexes : orderedIndexes;

  let lastError: Error | null = null;

  for (const index of fallbackIndexes) {
    const apiKey = keys[index];
    const url = `${baseUrl}${path}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'TRON-PRO-API-KEY': apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();

        if (response.status === 429) {
          state.cooldownUntil[index] = Date.now() + parseRetryDelayMsFromText(text);
        }

        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      state.nextIndex = (index + 1) % keys.length;
      state.cooldownUntil[index] = 0;

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeout);

      lastError =
        error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown request error');

      if (String(lastError.message).toLowerCase().includes('aborted')) {
        state.cooldownUntil[index] = Date.now() + 5_000;
      }

      console.warn(`[${provider}] request failed with key #${index + 1}:`, lastError.message);
    }
  }

  throw lastError || new Error(`All ${provider} keys failed`);
}

export async function tronscanFetch<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  return fetchWithProviderKeyPool<T>('tronscan', path, params);
}

export async function trongridFetch<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  return fetchWithProviderKeyPool<T>('trongrid', path, params);
}

export async function trongridPost<T>(
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  return postWithProviderKeyPool<T>('trongrid', path, body);
}

async function cmcFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  if (!CMC_API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_CMC_API_KEY');
  }

  const activeCooldownUntil = getSafeCmcCooldownUntil();
  if (activeCooldownUntil) {
    throw new Error(`HTTP 429: CMC cooldown active until ${activeCooldownUntil}`);
  }

  const url = buildUrl(CMC_BASE_URL, path, params);

  const response = await fetch(url, {
    headers: {
      'X-CMC_PRO_API_KEY': CMC_API_KEY,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();

    if (response.status === 429) {
      cmcCooldownUntil = Date.now() + CMC_KEY_COOLDOWN_MS;
    }

    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  cmcCooldownUntil = 0;
  return response.json() as Promise<T>;
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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
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
      { id: TRX_CMC_ID }
    );

    detailLitePrice = parseNumber(detailLite.data?.statistics?.price);
    detailLiteChange24h = parseNumber(detailLite.data?.statistics?.priceChangePercentage24h);
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

  const fallback = await cmcFetch<CmcProQuoteResponse>('/v2/cryptocurrency/quotes/latest', {
    id: TRX_CMC_ID,
  });

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
    decimals: parseNumber(data?.dec),
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

export async function getCmcDexSearchToken(address: string): Promise<CmcDexSearchToken | null> {
  const tokenId = normalizeTokenId(address);
  if (!tokenId || tokenId === TRX_TOKEN_ID || tokenId === TRX_CONTRACT) {
    return null;
  }

  const known = getKnownTokenMeta(tokenId);
  const overview = await getTronscanTokenOverview(tokenId).catch((): TokenMetaFallback => ({}));
  const fallback = mergeTokenMetaFallbacks(overview, {
    name: known?.tokenName,
    symbol: known?.tokenAbbr,
    logo: known?.tokenLogo,
    decimals: known?.tokenDecimal,
  });

  try {
    const meta = await getDexTokenMarketMeta(tokenId, {
      name: fallback.name || tokenId,
      symbol: fallback.symbol || tokenId.slice(0, 6),
      logo: fallback.logo,
    });

    return {
      id: tokenId,
      name: meta.name || fallback.name || tokenId,
      abbr: meta.symbol || fallback.symbol || tokenId.slice(0, 6),
      logo: meta.logo || fallback.logo,
      liquidityUsd: meta.liquidityUsd ?? fallback.liquidityUsd,
    };
  } catch (error) {
    if (!isCmcInvalidKeyError(error) && !isCmcRateLimitError(error)) {
      console.error('Failed to load CMC dex search token:', tokenId, error);
    }

    if (!fallback.name && !fallback.symbol && !fallback.logo) {
      return null;
    }

    return {
      id: tokenId,
      name: fallback.name || tokenId,
      abbr: fallback.symbol || tokenId.slice(0, 6),
      logo: fallback.logo,
      liquidityUsd: fallback.liquidityUsd,
    };
  }
}

async function getMarketIndex(
  requestedContracts: string[] = [],
  marketFallbacks: Record<string, TokenMetaFallback> = {}
): Promise<CachedMarketIndex> {
  const now = Date.now();
  const cacheIsFresh = Boolean(marketCache && marketCache.expiresAt > now);

  const normalizedContracts = Array.from(
    new Set(
      requestedContracts
        .map((value) => normalizeTokenId(value))
        .filter((value) => value && value !== TRX_TOKEN_ID && value !== TRX_CONTRACT)
    )
  );

  if (
    cacheIsFresh &&
    marketCache &&
    normalizedContracts.every((tokenId) => !!marketCache && tokenId in marketCache.byContract)
  ) {
    return marketCache;
  }

  if (marketIndexInflight) {
    const inflightResult = await marketIndexInflight;
    if (normalizedContracts.every((tokenId) => tokenId in inflightResult.byContract)) {
      return inflightResult;
    }
  }

  const run = async (): Promise<CachedMarketIndex> => {
    const refreshedNow = Date.now();
    const refreshedCacheIsFresh = Boolean(marketCache && marketCache.expiresAt > refreshedNow);

    if (
      refreshedCacheIsFresh &&
      marketCache &&
      normalizedContracts.every((tokenId) => !!marketCache && tokenId in marketCache.byContract)
    ) {
      return marketCache;
    }

    const trxMeta =
      refreshedCacheIsFresh && marketCache
        ? marketCache.trx
        : await getTrxMarketMeta().catch((error): MarketMeta => {
            if (!isCmcInvalidKeyError(error) && !isCmcRateLimitError(error)) {
              console.error('Failed to load TRX market meta:', error);
            }

            return {
              name: 'TRON',
              symbol: TRX_SYMBOL,
              logo: TRX_LOGO,
              performance: buildFallbackPerformance(),
              pools: [],
            };
          });

    const byContract: Record<string, MarketMeta> =
      refreshedCacheIsFresh && marketCache ? { ...marketCache.byContract } : {};

    if (!refreshedCacheIsFresh) {
      const [usdtMeta, fourteenMeta] = await Promise.all([
        getDexTokenMarketMeta(USDT_CONTRACT, {
          name: 'Tether USDt',
          symbol: USDT_SYMBOL,
          logo: USDT_LOGO,
        }).catch(
          (): MarketMeta => ({
            name: 'Tether USDt',
            symbol: USDT_SYMBOL,
            decimals: 6,
            logo: USDT_LOGO,
            performance: buildFallbackPerformance(),
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
            decimals: 6,
            logo: FOURTEEN_LOGO,
            performance: buildFallbackPerformance(),
            pools: [],
          })
        ),
      ]);

      byContract[USDT_CONTRACT] = usdtMeta;
      byContract[FOURTEEN_CONTRACT] = fourteenMeta;
    }

    const missingContracts = normalizedContracts.filter((tokenId) => !(tokenId in byContract));

    if (missingContracts.length > 0) {
      const loaded = await Promise.all(
        missingContracts.map(async (tokenId) => {
          const known = getKnownTokenMeta(tokenId);
          const fallback = mergeTokenMetaFallbacks(marketFallbacks[tokenId], {
            name: known?.tokenName,
            symbol: known?.tokenAbbr,
            logo: known?.tokenLogo,
            decimals: known?.tokenDecimal,
          });

          const fallbackMeta: MarketMeta = {
            name: fallback.name || tokenId,
            symbol: fallback.symbol || tokenId.slice(0, 6),
            decimals: fallback.decimals,
            logo: fallback.logo,
            priceInUsd: fallback.priceInUsd,
            priceChange24h: fallback.priceChange24h,
            liquidityUsd: fallback.liquidityUsd,
            totalSupply: fallback.totalSupply,
            performance: buildFallbackPerformance(fallback.priceChange24h),
            pools: [],
          };

          try {
            const dexMeta = await getDexTokenMarketMeta(tokenId, {
              name: fallbackMeta.name || tokenId,
              symbol: fallbackMeta.symbol || tokenId.slice(0, 6),
              logo: fallbackMeta.logo,
            });

            return [
              tokenId,
              {
                name: dexMeta.name ?? fallbackMeta.name,
                symbol: dexMeta.symbol ?? fallbackMeta.symbol,
                decimals: dexMeta.decimals ?? fallbackMeta.decimals,
                logo: dexMeta.logo ?? fallbackMeta.logo,
                priceInUsd: dexMeta.priceInUsd ?? fallbackMeta.priceInUsd,
                priceChange24h: dexMeta.priceChange24h ?? fallbackMeta.priceChange24h,
                marketCap: dexMeta.marketCap ?? fallbackMeta.marketCap,
                liquidityUsd: dexMeta.liquidityUsd ?? fallbackMeta.liquidityUsd,
                totalSupply: dexMeta.totalSupply ?? fallbackMeta.totalSupply,
                volume24h: dexMeta.volume24h ?? fallbackMeta.volume24h,
                performance: dexMeta.performance ?? fallbackMeta.performance,
                pools: dexMeta.pools ?? fallbackMeta.pools,
              },
            ] as const;
          } catch (error) {
            if (!isCmcInvalidKeyError(error) && !isCmcRateLimitError(error)) {
              console.error('Failed to load CMC dex token meta:', tokenId, error);
            }

            return [tokenId, fallbackMeta] as const;
          }
        })
      );

      for (const [tokenId, meta] of loaded) {
        byContract[tokenId] = meta;
      }
    }

    const next: CachedMarketIndex = {
      expiresAt: refreshedNow + MARKET_CACHE_TTL_MS,
      trx: trxMeta,
      byContract,
    };

    marketCache = next;
    return next;
  };

  marketIndexInflight = run();

  try {
    return await marketIndexInflight;
  } finally {
    marketIndexInflight = null;
  }
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

function buildTokenMetaFallbackMap(
  rawBalances: RawTrc20Balance[],
  tronscanIndex: Record<string, TronscanTokenItem>,
  tokenOverviewMap: Record<string, TokenMetaFallback>
): Record<string, TokenMetaFallback> {
  return Object.fromEntries(
    rawBalances.map((item) => {
      const tokenId = item.tokenId;
      const tronscanMeta = tronscanIndex[tokenId];
      const knownMeta = getKnownTokenMeta(tokenId);

      const merged = mergeTokenMetaFallbacks(
        tokenOverviewMap[tokenId],
        {
          name: tronscanMeta?.tokenName,
          symbol: tronscanMeta?.tokenAbbr,
          logo: tronscanMeta?.tokenLogo,
          decimals: parseNumber(tronscanMeta?.tokenDecimal),
          priceInUsd: parseNumber(tronscanMeta?.priceInUsd) ?? parseNumber(tronscanMeta?.tokenPriceInUsd),
          priceChange24h: parseNumber(tronscanMeta?.price_change_24h) ?? parseNumber(tronscanMeta?.priceChange24h),
        },
        {
          name: knownMeta?.tokenName,
          symbol: knownMeta?.tokenAbbr,
          logo: knownMeta?.tokenLogo,
          decimals: knownMeta?.tokenDecimal,
        }
      );

      return [tokenId, merged];
    })
  );
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

function normalizeHistoryType(
  walletAddress: string,
  fromAddress?: string,
  toAddress?: string
): 'IN' | 'OUT' | 'SELF' {
  if (isSameAddress(fromAddress, walletAddress) && isSameAddress(toAddress, walletAddress)) {
    return 'SELF';
  }

  if (isSameAddress(toAddress, walletAddress)) {
    return 'IN';
  }

  if (isSameAddress(fromAddress, walletAddress)) {
    return 'OUT';
  }

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

function dedupeHistoryItems(items: TokenHistoryItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.txHash}:${item.displayType}:${item.amountRaw}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildTrc20TransferHistoryItems(
  walletAddress: string,
  decimals: number,
  rows: TronscanTrc20TransferItem[],
  addressBook: Record<string, string>
): TokenHistoryItem[] {
  return dedupeHistoryItems(
    rows
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

        const baseType = normalizeHistoryType(walletAddress, fromAddress, toAddress);

        if (baseType === 'SELF') {
          return null;
        }

        const displayType: TokenHistoryDisplayType = baseType === 'IN' ? 'RECEIVE' : 'SEND';
        const counterpartyAddress = getCounterpartyAddress(
          walletAddress,
          baseType,
          fromAddress,
          toAddress
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
          from: fromAddress,
          to: toAddress,
          counterpartyAddress,
          counterpartyLabel: contactName || shortenAddress(counterpartyAddress),
          isKnownContact: Boolean(contactName),
          tronscanUrl: buildTronscanTxUrl(txHash),
        };
      })
      .filter(isTokenHistoryItem)
  );
}

function buildTrxTransferHistoryItems(
  walletAddress: string,
  rows: TronscanTransferItem[],
  addressBook: Record<string, string>
): TokenHistoryItem[] {
  return dedupeHistoryItems(
    rows
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
        const fromAddress = String(item.transferFromAddress || '').trim();
        const toAddress = String(item.transferToAddress || '').trim();
        const baseType = normalizeHistoryType(walletAddress, fromAddress, toAddress);

        if (baseType === 'SELF') {
          return null;
        }

        const displayType: TokenHistoryDisplayType = baseType === 'IN' ? 'RECEIVE' : 'SEND';
        const counterpartyAddress = getCounterpartyAddress(
          walletAddress,
          baseType,
          fromAddress,
          toAddress
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
          from: fromAddress,
          to: toAddress,
          counterpartyAddress,
          counterpartyLabel: contactName || shortenAddress(counterpartyAddress),
          isKnownContact: Boolean(contactName),
          tronscanUrl: buildTronscanTxUrl(txHash),
        };
      })
      .filter(isTokenHistoryItem)
  );
}

function dedupeWalletHistoryItems(items: WalletHistoryItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.tokenId}:${item.txHash}:${item.displayType}:${item.amountRaw}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildWalletTrc20HistoryItems(
  walletAddress: string,
  rows: TronscanTrc20TransferItem[],
  addressBook: Record<string, string>
): WalletHistoryItem[] {
  return dedupeWalletHistoryItems(
    rows
      .map((item, index): WalletHistoryItem | null => {
        const txHash = String(item.transaction_id || `wallet-trc20-${index}`);
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

        const baseType = normalizeHistoryType(walletAddress, fromAddress, toAddress);

        if (baseType === 'SELF') {
          return null;
        }

        const displayType: TokenHistoryDisplayType = baseType === 'IN' ? 'RECEIVE' : 'SEND';
        const counterpartyAddress = getCounterpartyAddress(
          walletAddress,
          baseType,
          fromAddress,
          toAddress
        );
        const counterpartyKey = normalizeAddressKey(counterpartyAddress);
        const contactName = counterpartyKey ? addressBook[counterpartyKey] : undefined;

        const tokenId =
          normalizeTokenId(item.contract_address || '') ||
          normalizeTokenId(item.tokenInfo?.tokenId || '');

        const tokenDecimals =
          Number(item.tokenInfo?.tokenDecimal ?? 0) || 0;

        const tokenSymbol =
          String(item.tokenInfo?.tokenAbbr || '').trim() || tokenId.slice(0, 6) || 'TOKEN';

        const tokenName =
          String(item.tokenInfo?.tokenName || '').trim() || tokenSymbol || 'Token';

        return {
          id: `${tokenId}:${txHash}`,
          txHash,
          type: baseType,
          displayType,
          amountRaw,
          amountFormatted: formatHistoryAmount(amountRaw, tokenDecimals, displayType),
          timestamp: Number(item.block_ts || 0),
          from: fromAddress,
          to: toAddress,
          counterpartyAddress,
          counterpartyLabel: contactName || shortenAddress(counterpartyAddress),
          isKnownContact: Boolean(contactName),
          tronscanUrl: buildTronscanTxUrl(txHash),
          tokenId,
          tokenName,
          tokenSymbol,
          tokenLogo: undefined,
        };
      })
      .filter(isTokenHistoryItem as unknown as (item: WalletHistoryItem | null) => item is WalletHistoryItem)
  );
}

function buildWalletTrxHistoryItems(
  walletAddress: string,
  rows: TronscanTransferItem[],
  addressBook: Record<string, string>
): WalletHistoryItem[] {
  return dedupeWalletHistoryItems(
    rows
      .map((item, index): WalletHistoryItem | null => {
        const tokenAbbr = String(item.tokenInfo?.tokenAbbr || '').trim().toLowerCase();
        const tokenName = String(item.tokenInfo?.tokenName || '').trim().toLowerCase();
        const tokenId = String(item.tokenInfo?.tokenId || '').trim();

        if (!(tokenAbbr === 'trx' || tokenName === 'trx' || tokenId === '_')) {
          return null;
        }

        const txHash = String(item.transactionHash || `wallet-trx-${index}`);
        const amountRaw = String(item.amount ?? '0');
        const fromAddress = String(item.transferFromAddress || '').trim();
        const toAddress = String(item.transferToAddress || '').trim();
        const baseType = normalizeHistoryType(walletAddress, fromAddress, toAddress);

        if (baseType === 'SELF') {
          return null;
        }

        const displayType: TokenHistoryDisplayType = baseType === 'IN' ? 'RECEIVE' : 'SEND';
        const counterpartyAddress = getCounterpartyAddress(
          walletAddress,
          baseType,
          fromAddress,
          toAddress
        );
        const counterpartyKey = normalizeAddressKey(counterpartyAddress);
        const contactName = counterpartyKey ? addressBook[counterpartyKey] : undefined;

        return {
          id: `${TRX_TOKEN_ID}:${txHash}`,
          txHash,
          type: baseType,
          displayType,
          amountRaw,
          amountFormatted: formatHistoryAmount(amountRaw, 6, displayType),
          timestamp: Number(item.timestamp || 0),
          from: fromAddress,
          to: toAddress,
          counterpartyAddress,
          counterpartyLabel: contactName || shortenAddress(counterpartyAddress),
          isKnownContact: Boolean(contactName),
          tronscanUrl: buildTronscanTxUrl(txHash),
          tokenId: TRX_TOKEN_ID,
          tokenName: 'TRON',
          tokenSymbol: TRX_SYMBOL,
          tokenLogo: TRX_LOGO,
        };
      })
      .filter(isTokenHistoryItem as unknown as (item: WalletHistoryItem | null) => item is WalletHistoryItem)
  );
}

function resolveHasMore(params: {
  total?: number;
  start: number;
  rowsLength: number;
  limit: number;
}) {
  const { total, start, rowsLength, limit } = params;

  if (typeof total === 'number') {
    return start + rowsLength < total;
  }

  return rowsLength >= limit;
}

export async function getTokenHistoryPage(
  walletAddress: string,
  tokenId: string,
  decimals: number,
  fingerprint?: string
): Promise<TokenHistoryPage> {
  const start = Math.max(0, Number.parseInt(String(fingerprint || '0'), 10) || 0);
  const limit = 10;

  try {
    const addressBook = await getAddressBookMap().catch(() => ({} as Record<string, string>));

    if (tokenId === TRX_TOKEN_ID) {
      const response = await tronscanFetch<TronscanTransferResponse>('/transfer', {
        sort: '-timestamp',
        count: true,
        limit,
        start,
        address: walletAddress,
        token: '_',
        filterTokenValue: 1,
      });

      const rows = response.data ?? [];
      const items = buildTrxTransferHistoryItems(walletAddress, rows, addressBook);
      const total = parsePositiveCount(response.rangeTotal) ?? parsePositiveCount(response.total);
      const nextStart = start + limit;
      const hasMore = resolveHasMore({
        total,
        start,
        rowsLength: rows.length,
        limit,
      });

      return {
        items,
        nextFingerprint: hasMore ? String(nextStart) : undefined,
        hasMore,
      };
    }

    const response = await tronscanFetch<TronscanTrc20TransferResponse>(
      '/token_trc20/transfers',
      {
        relatedAddress: walletAddress,
        contract_address: tokenId,
        start,
        limit,
        reverse: true,
      }
    );

    const rows = response.token_transfers ?? [];
    const items = buildTrc20TransferHistoryItems(walletAddress, decimals, rows, addressBook);
    const total = parsePositiveCount(response.rangeTotal) ?? parsePositiveCount(response.total);
    const nextStart = start + limit;
    const hasMore = resolveHasMore({
      total,
      start,
      rowsLength: rows.length,
      limit,
    });

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

export async function getWalletHistoryPage(
  walletAddress: string,
  options?: {
    force?: boolean;
    limit?: number;
    fingerprint?: string;
  }
): Promise<WalletHistoryPage> {
  const limit = Math.max(1, Math.min(50, options?.limit ?? DEFAULT_WALLET_HISTORY_LIMIT));
  const start = Math.max(0, Number.parseInt(String(options?.fingerprint || '0'), 10) || 0);
  const cacheKey = buildWalletHistoryCacheKey(walletAddress, limit);

  if (!options?.force && start === 0) {
    const cached = await readWalletHistoryCache(cacheKey, limit);
    if (cached) {
      return cached;
    }
  }

  try {
    const addressBook = await getAddressBookMap().catch(() => ({} as Record<string, string>));

    const [trxResponse, trc20Response] = await Promise.all([
      tronscanFetch<TronscanTransferResponse>('/transfer', {
        sort: '-timestamp',
        count: true,
        limit,
        start,
        address: walletAddress,
        token: '_',
        filterTokenValue: 1,
      }).catch((): TronscanTransferResponse => ({})),
      tronscanFetch<TronscanTrc20TransferResponse>('/token_trc20/transfers', {
        relatedAddress: walletAddress,
        start,
        limit,
        reverse: true,
      }).catch((): TronscanTrc20TransferResponse => ({})),
    ]);

    const trxItems = buildWalletTrxHistoryItems(
      walletAddress,
      trxResponse.data ?? [],
      addressBook
    );

    const trc20Items = buildWalletTrc20HistoryItems(
      walletAddress,
      trc20Response.token_transfers ?? [],
      addressBook
    );

    const tokenIdsToLoad = Array.from(
      new Set(
        trc20Items
          .map((item) => normalizeTokenId(item.tokenId))
          .filter((tokenId) => Boolean(tokenId) && tokenId !== TRX_TOKEN_ID)
      )
    );

    const overviewMap = tokenIdsToLoad.length
      ? await getTronscanTokenOverviewMap(tokenIdsToLoad)
      : {};

    const items = dedupeWalletHistoryItems([...trxItems, ...trc20Items])
      .map((item) => {
        if (item.tokenId === TRX_TOKEN_ID) {
          return item;
        }

        const overview = overviewMap[item.tokenId] ?? {};
        const tokenName =
          String(item.tokenName || '').trim() ||
          String(overview.name || '').trim() ||
          shortenAddress(item.tokenId);

        const tokenSymbol =
          String(item.tokenSymbol || '').trim() ||
          String(overview.symbol || '').trim() ||
          shortenAddress(item.tokenId);

        return {
          ...item,
          tokenName,
          tokenSymbol,
          tokenLogo: item.tokenLogo || overview.logo,
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    const trxTotal = parsePositiveCount(trxResponse.rangeTotal) ?? parsePositiveCount(trxResponse.total);
    const trc20Total = parsePositiveCount(trc20Response.rangeTotal) ?? parsePositiveCount(trc20Response.total);

    const trxHasMore = resolveHasMore({
      total: trxTotal,
      start,
      rowsLength: (trxResponse.data ?? []).length,
      limit,
    });

    const trc20HasMore = resolveHasMore({
      total: trc20Total,
      start,
      rowsLength: (trc20Response.token_transfers ?? []).length,
      limit,
    });

    const page: WalletHistoryPage = {
      items,
      nextFingerprint: trxHasMore || trc20HasMore ? String(start + limit) : undefined,
      hasMore: trxHasMore || trc20HasMore,
    };

    if (start === 0) {
      await writeWalletHistoryCache(cacheKey, page, limit);
    }

    return page;
  } catch (error) {
    console.error('Failed to load wallet history:', walletAddress, error);
    return {
      items: [],
      nextFingerprint: undefined,
      hasMore: false,
    };
  }
}

export async function getWalletHistory(
  walletAddress: string,
  options?: {
    force?: boolean;
    limit?: number;
  }
): Promise<WalletHistoryItem[]> {
  const page = await getWalletHistoryPage(walletAddress, {
    force: options?.force,
    limit: options?.limit,
  });

  return page.items;
}

export async function getAccountInfo(
  address: string,
  options?: { force?: boolean }
): Promise<TronAccountInfo> {
  const cacheKey = buildAccountInfoRuntimeCacheKey(address);

  if (!options?.force) {
    const cached = readFreshRuntimeCache(accountInfoMemoryCache, cacheKey, ACCOUNT_INFO_CACHE_TTL_MS);
    if (cached) {
      console.info(`[cache] account info hit: ${address}`);
      return cached;
    }
  } else {
    accountInfoMemoryCache.delete(cacheKey);
  }

  const inflight = accountInfoInflight.get(cacheKey);
  if (inflight) {
    console.info(`[cache] account info join inflight: ${address}`);
    return inflight;
  }

  const request = (async (): Promise<TronAccountInfo> => {
    console.info(`[cache] account info miss: ${address}`);
    const item = await getTrongridAccount(address);
    const balanceSun = typeof item?.balance === 'number' ? item.balance : 0;

    const result: TronAccountInfo = {
      address,
      balanceSun,
      balanceTrx: balanceSun / 1_000_000,
    };

    writeRuntimeCache(accountInfoMemoryCache, cacheKey, result);
    console.info(`[cache] account info store: ${address}`);

    return result;
  })();

  accountInfoInflight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    accountInfoInflight.delete(cacheKey);
  }
}

export async function getAccountResources(
  address: string,
  options?: { force?: boolean }
): Promise<WalletAccountResources> {
  const cacheKey = buildAccountResourcesRuntimeCacheKey(address);

  if (!options?.force) {
    const cached = readFreshRuntimeCache(
      accountResourcesMemoryCache,
      cacheKey,
      ACCOUNT_RESOURCES_CACHE_TTL_MS
    );
    if (cached) {
      return cached;
    }
  } else {
    accountResourcesMemoryCache.delete(cacheKey);
  }

  const inflight = accountResourcesInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async (): Promise<WalletAccountResources> => {
    const payload = await trongridPost<TronAccountResourcesResponse>('/wallet/getaccountresource', {
      address,
      visible: true,
    });

    const freeNetUsed = parsePositiveCount(payload?.freeNetUsed) ?? 0;
    const freeNetLimit = parsePositiveCount(payload?.freeNetLimit) ?? 0;
    const netUsed = parsePositiveCount(payload?.NetUsed) ?? 0;
    const netLimit = parsePositiveCount(payload?.NetLimit) ?? 0;

    const result: WalletAccountResources = {
      address,
      energyUsed: parsePositiveCount(payload?.EnergyUsed) ?? 0,
      energyLimit: parsePositiveCount(payload?.EnergyLimit) ?? 0,
      bandwidthUsed: freeNetUsed + netUsed,
      bandwidthLimit: freeNetLimit + netLimit,
    };

    writeRuntimeCache(accountResourcesMemoryCache, cacheKey, result);
    return result;
  })();

  accountResourcesInflight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    accountResourcesInflight.delete(cacheKey);
  }
}

export async function getAccountTrc20Assets(
  address: string,
  options?: { force?: boolean }
): Promise<Trc20Asset[]> {
  const cacheKey = buildAccountTrc20AssetsRuntimeCacheKey(address);

  if (!options?.force) {
    const cached = readFreshRuntimeCache(
      accountTrc20AssetsMemoryCache,
      cacheKey,
      ACCOUNT_TRC20_ASSETS_CACHE_TTL_MS
    );
    if (cached) {
      console.info(`[cache] trc20 assets hit: ${address}`);
      return cached;
    }
  } else {
    accountTrc20AssetsMemoryCache.delete(cacheKey);
  }

  const inflight = accountTrc20AssetsInflight.get(cacheKey);
  if (inflight) {
    console.info(`[cache] trc20 assets join inflight: ${address}`);
    return inflight;
  }

  const request = (async (): Promise<Trc20Asset[]> => {
    console.info(`[cache] trc20 assets miss: ${address}`);

    const [accountItem, tronscanData] = await Promise.all([
      getTrongridAccount(address),
      tronscanFetch<TronscanTokensResponse>('/account/tokens', {
        address,
        start: 0,
        limit: 200,
        show: 1,
        sortType: 0,
        sortBy: 0,
      }).catch((): TronscanTokensResponse => ({})),
    ]);

    const rawBalances = extractTrc20BalancesFromTrongrid(accountItem);
    const tronscanIndex = indexTronscanTokens(extractTokenList(tronscanData));
    const tokenOverviewMap = await getTronscanTokenOverviewMap(rawBalances.map((item) => item.tokenId));
    const marketFallbacks = buildTokenMetaFallbackMap(rawBalances, tronscanIndex, tokenOverviewMap);

    const marketIndex = await getMarketIndex(
      rawBalances.map((item) => item.tokenId),
      marketFallbacks
    );

    const result = rawBalances.map((item) => {
      const tokenId = item.tokenId;
      const tronscanMeta = tronscanIndex[tokenId];
      const knownMeta = getKnownTokenMeta(tokenId);
      const fallbackMeta = mergeTokenMetaFallbacks(
        tokenOverviewMap[tokenId],
        marketFallbacks[tokenId],
        mergeTokenMetaFallbacks(
          {
            name: tronscanMeta?.tokenName,
            symbol: tronscanMeta?.tokenAbbr,
            logo: tronscanMeta?.tokenLogo,
            decimals: parseNumber(tronscanMeta?.tokenDecimal),
            priceInUsd: parseNumber(tronscanMeta?.priceInUsd) ?? parseNumber(tronscanMeta?.tokenPriceInUsd),
            priceChange24h: parseNumber(tronscanMeta?.price_change_24h) ?? parseNumber(tronscanMeta?.priceChange24h),
          },
          {
            name: knownMeta?.tokenName,
            symbol: knownMeta?.tokenAbbr,
            logo: knownMeta?.tokenLogo,
            decimals: knownMeta?.tokenDecimal,
          }
        )
      );
      const marketMeta = marketIndex.byContract[tokenId] ?? {};

      const tokenDecimal = Number(marketMeta.decimals ?? fallbackMeta.decimals ?? 0) || 0;
      const tokenName = marketMeta.name ?? fallbackMeta.name ?? tokenId;
      const tokenAbbr = marketMeta.symbol ?? fallbackMeta.symbol ?? tokenId.slice(0, 6);
      const tokenLogo = marketMeta.logo || fallbackMeta.logo;

      const balanceFormatted = formatTokenBalance(item.balance, tokenDecimal);
      const balanceBase = Number(item.balance) / Math.pow(10, tokenDecimal || 0);

      const priceInUsd =
        marketMeta.priceInUsd ??
        parseNumber(tronscanMeta?.priceInUsd) ??
        parseNumber(tronscanMeta?.tokenPriceInUsd) ??
        fallbackMeta.priceInUsd ??
        0;

      const marketValueInUsd = balanceBase * priceInUsd;

      const valueInUsd =
        typeof marketMeta.priceInUsd === 'number' || typeof fallbackMeta.priceInUsd === 'number'
          ? marketValueInUsd
          : parseNumber(tronscanMeta?.amountInUsd) ??
            parseNumber(tronscanMeta?.balanceInUsd) ??
            marketValueInUsd;

      const priceChange24h =
        marketMeta.priceChange24h ??
        parseNumber(tronscanMeta?.price_change_24h) ??
        parseNumber(tronscanMeta?.priceChange24h) ??
        fallbackMeta.priceChange24h;

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

    writeRuntimeCache(accountTrc20AssetsMemoryCache, cacheKey, result);
    console.info(`[cache] trc20 assets store: ${address}`);

    return result;
  })();

  accountTrc20AssetsInflight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    accountTrc20AssetsInflight.delete(cacheKey);
  }
}

export async function getTrxPrice(): Promise<TrxPriceInfo> {
  const marketIndex = await getMarketIndex();

  return {
    priceInUsd: marketIndex.trx.priceInUsd ?? 0,
    priceChange24h: marketIndex.trx.priceChange24h,
    logo: marketIndex.trx.logo || TRX_LOGO,
  };
}

export async function getWalletSnapshot(
  address: string,
  options?: { force?: boolean }
): Promise<WalletSnapshot> {
  const cacheKey = buildWalletSnapshotRuntimeCacheKey(address);

  if (!options?.force) {
    const cached = readFreshRuntimeCache(
      walletSnapshotMemoryCache,
      cacheKey,
      WALLET_SNAPSHOT_CACHE_TTL_MS
    );
    if (cached) {
      console.info(`[cache] wallet snapshot hit: ${address}`);
      return cached;
    }
  } else {
    clearWalletRuntimeCaches(address);
  }

  const inflight = walletSnapshotInflight.get(cacheKey);
  if (inflight) {
    console.info(`[cache] wallet snapshot join inflight: ${address}`);
    return inflight;
  }

  const request = (async (): Promise<WalletSnapshot> => {
    console.info(`[cache] wallet snapshot miss: ${address}`);

    const [account, trc20Assets, trxPrice] = await Promise.all([
      getAccountInfo(address, options),
      getAccountTrc20Assets(address, options),
      getTrxPrice(),
    ]);

    const trxValueInUsd = account.balanceTrx * (trxPrice.priceInUsd || 0);

    const result: WalletSnapshot = {
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

    writeRuntimeCache(walletSnapshotMemoryCache, cacheKey, result);
    console.info(`[cache] wallet snapshot store: ${address}`);

    return result;
  })();

  walletSnapshotInflight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    walletSnapshotInflight.delete(cacheKey);
  }
}


export type TronscanTokenListItem = {
  id: string;
  name: string;
  abbr: string;
  logo?: string;
};

type TronscanAssetWithPriceItem = {
  id?: string;
  name?: string;
  abbr?: string;
  logo?: string;
};

type TronscanAssetWithPriceResponse = {
  data?: TronscanAssetWithPriceItem[];
};

const CUSTOM_TOKEN_LIST_CACHE_KEY = 'fourteen_custom_token_list_cache_v1';
const CUSTOM_TOKEN_LIST_CACHE_TTL_MS = 30 * 60 * 1000;

type CustomTokenListCachePayload = {
  savedAt: number;
  items: TronscanTokenListItem[];
};

export async function getTronscanTokenList(
  options?: { force?: boolean }
): Promise<TronscanTokenListItem[]> {
  const force = Boolean(options?.force);

  if (!force) {
    try {
      const raw = await AsyncStorage.getItem(CUSTOM_TOKEN_LIST_CACHE_KEY);

      if (raw) {
        const parsed = JSON.parse(raw) as CustomTokenListCachePayload;

        if (
          parsed &&
          typeof parsed.savedAt === 'number' &&
          Array.isArray(parsed.items) &&
          Date.now() - parsed.savedAt < CUSTOM_TOKEN_LIST_CACHE_TTL_MS
        ) {
          return parsed.items;
        }
      }
    } catch (error) {
      console.error('Failed to read custom token list cache:', error);
    }
  }

  try {
    const response = await fetch(
      'https://apilist.tronscanapi.com/api/getAssetWithPriceList',
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const payload = (await response.json()) as TronscanAssetWithPriceResponse;
    const list = Array.isArray(payload?.data) ? payload.data : [];

    const items = list
      .map((item) => ({
        id: String(item?.id || '').trim(),
        name: String(item?.name || '').trim(),
        abbr: String(item?.abbr || '').trim(),
        logo: String(item?.logo || '').trim() || undefined,
      }))
      .filter((item) => item.id && item.name)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      );

    try {
      await AsyncStorage.setItem(
        CUSTOM_TOKEN_LIST_CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          items,
        } satisfies CustomTokenListCachePayload)
      );
    } catch (error) {
      console.error('Failed to write custom token list cache:', error);
    }

    return items;
  } catch (error) {
    console.error('Failed to load Tronscan token list:', error);

    if (!force) {
      try {
        const raw = await AsyncStorage.getItem(CUSTOM_TOKEN_LIST_CACHE_KEY);

        if (raw) {
          const parsed = JSON.parse(raw) as CustomTokenListCachePayload;
          if (parsed && Array.isArray(parsed.items)) {
            return parsed.items;
          }
        }
      } catch (cacheError) {
        console.error('Failed to read fallback custom token list cache:', cacheError);
      }
    }

    return [];
  }
}



export async function clearAllTronCaches(): Promise<void> {
  marketCache = null;
  marketIndexInflight = null;

  tokenHistoryMemoryCache.clear();
  walletHistoryMemoryCache.clear();
  accountInfoMemoryCache.clear();
  accountTrc20AssetsMemoryCache.clear();
  walletSnapshotMemoryCache.clear();
  tronscanTokenOverviewMemoryCache.clear();

  accountInfoInflight.clear();
  accountTrc20AssetsInflight.clear();
  walletSnapshotInflight.clear();
  tronscanTokenOverviewInflight.clear();

  customTokenCatalogMemoryCache.clear();
  customTokenCatalogInflight.clear();

  const keysToRemove: string[] = [];

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    for (const key of allKeys) {
      if (
        key.startsWith(TOKEN_HISTORY_CACHE_PREFIX) ||
        key.startsWith(WALLET_HISTORY_CACHE_PREFIX) ||
        key.startsWith(CUSTOM_TOKEN_LIST_CACHE_KEY) ||
        key === CUSTOM_TOKEN_LIST_CACHE_KEY ||
        key.startsWith(CUSTOM_TOKEN_CATALOG_STORAGE_KEY_PREFIX)
      ) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch (error) {
    console.error('Failed to clear tron async caches:', error);
    throw error;
  }
}

export async function getTokenDetails(
  walletAddress: string,
  tokenId: string,
  includeHistory = true,
  walletId?: string
): Promise<TokenDetails> {
  if (tokenId === TRX_TOKEN_ID) {
    const marketIndex = await getMarketIndex();
    const [account, trxPrice] = await Promise.all([
      getAccountInfo(walletAddress),
      getTrxPrice(),
    ]);
    const historyPage = includeHistory
      ? await getTokenHistory(walletAddress, tokenId, 6)
      : { items: [], nextFingerprint: undefined, hasMore: false };

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
        marketIndex.trx.performance || buildFallbackPerformance(trxPrice.priceChange24h),
      pools: marketIndex.trx.pools || [],
      history: historyPage.items,
      historyNextFingerprint: historyPage.nextFingerprint,
      historyHasMore: historyPage.hasMore,
    };
  }

  const assets = await getAccountTrc20Assets(walletAddress);
  const asset = assets.find((item) => item.tokenId === tokenId);

  if (!asset) {
    const [catalog, overview] = await Promise.all([
      getCustomTokenCatalog(walletId || '').catch(() => []),
      getTronscanTokenOverview(tokenId).catch((): TokenMetaFallback => ({})),
    ]);

    const custom = catalog.find((item) => item.id === tokenId);
    const marketIndex = await getMarketIndex([tokenId], {
      [tokenId]: overview,
    }).catch(() => ({ byContract: {} } as any));
    const marketMeta = marketIndex?.byContract?.[tokenId] ?? {};
    const decimals = Number(marketMeta.decimals ?? overview.decimals ?? 0) || 0;
    const historyPage = includeHistory
      ? await getTokenHistory(walletAddress, tokenId, decimals)
      : { items: [], nextFingerprint: undefined, hasMore: false };

    return {
      tokenId,
      walletAddress,
      name: marketMeta.name || overview.name || custom?.name || tokenId,
      symbol: marketMeta.symbol || overview.symbol || custom?.abbr || tokenId.slice(0, 6),
      address: tokenId,
      decimals,
      logo: marketMeta.logo || overview.logo || custom?.logo,
      balanceRaw: '0',
      balanceFormatted: '0',
      balanceValueUsd: 0,
      priceInUsd: marketMeta.priceInUsd ?? overview.priceInUsd,
      marketCap: marketMeta.marketCap,
      liquidityUsd: marketMeta.liquidityUsd ?? overview.liquidityUsd,
      totalSupply: marketMeta.totalSupply ?? overview.totalSupply,
      performance:
        marketMeta.performance || buildFallbackPerformance(marketMeta.priceChange24h ?? overview.priceChange24h),
      pools: marketMeta.pools || [],
      history: historyPage.items,
      historyNextFingerprint: historyPage.nextFingerprint,
      historyHasMore: historyPage.hasMore,
    };
  }

  const marketMeta = marketCache?.byContract[tokenId] ?? {};
  const historyPage = includeHistory
    ? await getTokenHistory(walletAddress, tokenId, asset.tokenDecimal)
    : { items: [], nextFingerprint: undefined, hasMore: false };

  return {
    tokenId,
    walletAddress,
    name: marketMeta.name || asset.tokenName || tokenId,
    symbol: marketMeta.symbol || asset.tokenAbbr || tokenId.slice(0, 6),
    address: asset.tokenId,
    decimals: asset.tokenDecimal,
    logo: marketMeta.logo || asset.tokenLogo,
    balanceRaw: asset.balance,
    balanceFormatted: asset.balanceFormatted,
    balanceValueUsd: asset.valueInUsd || 0,
    priceInUsd: asset.priceInUsd ?? marketMeta.priceInUsd,
    marketCap: marketMeta.marketCap,
    liquidityUsd: marketMeta.liquidityUsd,
    totalSupply: marketMeta.totalSupply,
    performance:
      marketMeta.performance || buildFallbackPerformance(asset.priceChange24h),
    pools: marketMeta.pools || [],
    history: historyPage.items,
    historyNextFingerprint: historyPage.nextFingerprint,
    historyHasMore: historyPage.hasMore,
  };
}
