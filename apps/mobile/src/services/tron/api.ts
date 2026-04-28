import AsyncStorage from '@react-native-async-storage/async-storage';
import { TronWeb } from 'tronweb';
import {
  assertTronConfig,
  CMC_DATA_API_BASE_URL,
  CMC_DAPI_BASE_URL,
  CMC_PRO_BASE_URL,
  TRONGRID_BASE_URL,
  TRONSCAN_BASE_URL,
} from '../../config/tron';
import { getAddressBookMap } from '../address-book';
import { getDisplayCurrency, type DisplayCurrencyCode } from '../../settings/display-currency';
import { FOURTEEN_LOGO, getFourteenPriceSnapshot } from './fourteen-price';

const CMC_BASE_URL = CMC_PRO_BASE_URL;

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
const WALLET_HISTORY_CACHE_STALE_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_HISTORY_CACHE_PREFIX = 'fourteen_token_history_cache_v11';
const TOKEN_HISTORY_CACHE_PREFIX_ROOT = 'fourteen_token_history_cache_';
const WALLET_HISTORY_CACHE_PREFIX = 'fourteen_wallet_history_cache_v4';
const WALLET_HISTORY_CACHE_PREFIX_ROOT = 'fourteen_wallet_history_cache_';
const DEFAULT_WALLET_HISTORY_LIMIT = 20;

const MARKET_CACHE_TTL_MS = 60 * 60 * 1000;
const MARKET_CACHE_STALE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MARKET_CACHE_STORAGE_KEY = 'fourteen_market_index_cache_v2';
const MARKET_CACHE_STORAGE_KEY_ROOT = 'fourteen_market_index_cache_';
const TRONSCAN_TOKEN_OVERVIEW_CACHE_TTL_MS = 30 * 60 * 1000;
const ACCOUNT_INFO_CACHE_TTL_MS = 2 * 60 * 1000;
const ACCOUNT_TRC20_ASSETS_CACHE_TTL_MS = 2 * 60 * 1000;
const WALLET_SNAPSHOT_CACHE_TTL_MS = 2 * 60 * 1000;
const ACCOUNT_RESOURCES_CACHE_TTL_MS = 2 * 60 * 1000;
const ACCOUNT_INFO_CACHE_STORAGE_KEY_PREFIX = 'fourteen_account_info_cache_v1';
const ACCOUNT_INFO_CACHE_STORAGE_KEY_PREFIX_ROOT = 'fourteen_account_info_cache_';
const ACCOUNT_TRC20_ASSETS_CACHE_STORAGE_KEY_PREFIX = 'fourteen_account_trc20_assets_cache_v1';
const ACCOUNT_TRC20_ASSETS_CACHE_STORAGE_KEY_PREFIX_ROOT = 'fourteen_account_trc20_assets_cache_';
const WALLET_SNAPSHOT_CACHE_STORAGE_KEY_PREFIX = 'fourteen_wallet_snapshot_cache_v1';
const WALLET_SNAPSHOT_CACHE_STORAGE_KEY_PREFIX_ROOT = 'fourteen_wallet_snapshot_cache_';
const TRONGRID_ACCOUNT_CACHE_STORAGE_KEY_PREFIX = 'fourteen_trongrid_account_cache_v1';
const TRONGRID_ACCOUNT_CACHE_STORAGE_KEY_PREFIX_ROOT = 'fourteen_trongrid_account_cache_';
const ACCOUNT_RESOURCES_CACHE_STORAGE_KEY_PREFIX = 'fourteen_account_resources_cache_v1';
const ACCOUNT_RESOURCES_CACHE_STORAGE_KEY_PREFIX_ROOT = 'fourteen_account_resources_cache_';
const CUSTOM_TOKEN_CATALOG_STORAGE_KEY_PREFIX = 'wallet.customTokenCatalog.v2';
const TRONGRID_DETAIL_CACHE_TTL_MS = 10 * 60 * 1000;
const TRONGRID_DETAIL_CACHE_STALE_TTL_MS = 24 * 60 * 60 * 1000;
const TRONGRID_DETAIL_COOLDOWN_DEFAULT_MS = 60 * 1000;
const MAX_TRONGRID_DETAIL_ENRICHMENTS_PER_PAGE = 4;
const TRONSCAN_TOKEN_OVERVIEW_PARALLELISM = 3;
let warnedTrongridEventsRateLimit = false;
let warnedTrongridInternalRateLimit = false;
let trongridEventsCooldownUntil = 0;
let trongridInternalCooldownUntil = 0;

function normalizeCustomTokenCatalogWalletId(walletId: string) {
  return String(walletId || '').trim().toLowerCase();
}

function buildCustomTokenCatalogStorageKey(walletId: string) {
  return `${CUSTOM_TOKEN_CATALOG_STORAGE_KEY_PREFIX}:${normalizeCustomTokenCatalogWalletId(walletId)}`;
}

function isTrongridRateLimitError(error: unknown) {
  const text =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === 'string'
        ? error
        : JSON.stringify(error);

  const normalized = String(text || '').toLowerCase();
  return (
    normalized.includes('http 403') &&
    normalized.includes('rate limit exceeded')
  );
}
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
  displayCurrency?: DisplayCurrencyCode;
};

type CachedMarketIndex = {
  expiresAt: number;
  savedAt: number;
  displayCurrency: DisplayCurrencyCode;
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

type TrongridAccountCacheEntry = {
  savedAt: number;
  data: TrongridAccountItem | null;
};

type AccountResourcesCacheEntry = {
  savedAt: number;
  data: WalletAccountResources;
};

class ProviderRequestError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body}`);
    this.name = 'ProviderRequestError';
    this.status = status;
    this.body = body;
  }
}

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
let usdDisplayRateCache:
  | {
      currency: DisplayCurrencyCode;
      rate: number;
      expiresAt: number;
    }
  | null = null;
let usdDisplayRateInflight: Promise<{ currency: DisplayCurrencyCode; rate: number }> | null = null;
const tokenHistoryMemoryCache = new Map<string, TokenHistoryCachePayload>();
const walletHistoryMemoryCache = new Map<string, WalletHistoryCachePayload>();
const accountInfoMemoryCache = new Map<string, AccountInfoCacheEntry>();
const accountTrc20AssetsMemoryCache = new Map<string, AccountTrc20AssetsCacheEntry>();
const walletSnapshotMemoryCache = new Map<string, WalletSnapshotCacheEntry>();
const trongridAccountMemoryCache = new Map<string, TrongridAccountCacheEntry>();
const accountResourcesMemoryCache = new Map<string, AccountResourcesCacheEntry>();
const accountInfoInflight = new Map<string, Promise<TronAccountInfo>>();
const accountTrc20AssetsInflight = new Map<string, Promise<Trc20Asset[]>>();
const walletSnapshotInflight = new Map<string, Promise<WalletSnapshot>>();
const trongridAccountInflight = new Map<string, Promise<TrongridAccountItem | null>>();
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
const trongridTransactionEventsMemoryCache = new Map<
  string,
  {
    savedAt: number;
    data: TrongridTransactionEventItem[];
  }
>();
const trongridInternalTransactionsMemoryCache = new Map<
  string,
  {
    savedAt: number;
    data: TrongridInternalTransactionItem[];
  }
>();
const trongridTransactionEventsInflight = new Map<string, Promise<TrongridTransactionEventItem[]>>();
const trongridInternalTransactionsInflight = new Map<string, Promise<TrongridInternalTransactionItem[]>>();

function shouldLogCacheDebug() {
  return __DEV__ && (globalThis as any).__FOURTEEN_DEBUG_CACHE__ === true;
}

function logCacheDebug(message: string, ...args: unknown[]) {
  if (!shouldLogCacheDebug()) {
    return;
  }

  console.info(message, ...args);
}

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
export type HistoryTransactionStatus = 'success' | 'failed' | 'pending';

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
  transactionStatus?: HistoryTransactionStatus;
  contractType?: string;
  eventType?: string;
  methodName?: string;
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

type WalletHistoryCursor = {
  txFingerprint?: string;
  trc20Fingerprint?: string;
  bufferedItems?: WalletHistoryItem[];
};

type WalletHistorySourceItem = WalletHistoryItem & {
  sourceRowIndex: number;
};

type WalletTrc20HistorySourceRow = {
  txHash: string;
  timestamp: number;
  tokenId: string;
  fromAddress: string;
  toAddress: string;
  amountRaw: string;
  eventName?: string;
  methodName?: string;
  contractType?: string;
  transactionStatus?: HistoryTransactionStatus;
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

type TrongridTransactionRet = {
  contractRet?: string;
  fee?: number | string;
};

type TrongridTransactionContract = {
  parameter?: {
    value?: Record<string, unknown>;
    type_url?: string;
  };
  type?: string;
};

type TrongridTransactionItem = {
  txID?: string;
  block_timestamp?: number;
  ret?: TrongridTransactionRet[];
  raw_data?: {
    contract?: TrongridTransactionContract[];
    timestamp?: number;
  };
};

type TrongridTransactionsResponse = {
  data?: TrongridTransactionItem[];
  success?: boolean;
  meta?: {
    at?: number;
    fingerprint?: string;
    links?: {
      next?: string;
    };
    page_size?: number;
  };
};

type TrongridTrc20TransactionItem = {
  transaction_id?: string;
  block_timestamp?: number;
  from?: string;
  from_address?: string;
  to?: string;
  to_address?: string;
  type?: string;
  value?: string | number;
  token_info?: {
    address?: string;
    symbol?: string;
    name?: string;
    decimals?: number | string;
  };
};

type TrongridTrc20TransactionsResponse = {
  data?: TrongridTrc20TransactionItem[];
  success?: boolean;
  meta?: {
    at?: number;
    fingerprint?: string;
    links?: {
      next?: string;
    };
    page_size?: number;
  };
};

type TrongridTransactionEventItem = {
  block_timestamp?: number;
  contract_address?: string;
  event_name?: string;
  transaction_id?: string;
  result?: Record<string, unknown>;
};

type TrongridTransactionEventsResponse = {
  data?: TrongridTransactionEventItem[];
  success?: boolean;
  meta?: {
    at?: number;
    fingerprint?: string;
    links?: {
      next?: string;
    };
    page_size?: number;
  };
};

type TrongridInternalTransactionItem = {
  from_address?: string;
  to_address?: string;
  tx_id?: string;
  block_timestamp?: number;
  data?: {
    rejected?: boolean;
    call_value?: Record<string, number | string>;
  };
};

type TrongridInternalTransactionsResponse = {
  data?: TrongridInternalTransactionItem[];
  success?: boolean;
  meta?: {
    at?: number;
    fingerprint?: string;
    links?: {
      next?: string;
    };
    page_size?: number;
  };
};

type TronscanTokenItem = {
  tokenId?: string;
  tokenID?: string;
  tokenAddress?: string;
  contractAddress?: string;
  contract_address?: string;
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
      quote?: Record<
        string,
        {
          price?: number | string;
          percent_change_24h?: number | string;
          market_cap?: number | string;
        }
      >;
    }
  >;
};

type CmcPriceConversionResponse = {
  data?: {
    quote?: Record<
      string,
      {
        price?: number | string;
      }
    >;
  };
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

type TronscanTrc20TransferItem = {
  transaction_id?: string;
  status?: number;
  contract_type?: string | number;
  event_type?: string;
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

function isProviderRateLimitStatus(status: number, body: string) {
  const lower = String(body || '').toLowerCase();

  return (
    status === 429 ||
    (status === 403 &&
      (lower.includes('too many requests') ||
        lower.includes('rate limit') ||
        lower.includes('rate_limit') ||
        lower.includes('quota')))
  );
}

function isProviderRateLimitError(error: ProviderRequestError) {
  return isProviderRateLimitStatus(error.status, error.body);
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

function parseProviderCooldownMs(error: unknown, fallbackMs = TRONGRID_DETAIL_COOLDOWN_DEFAULT_MS) {
  const text = error instanceof Error ? error.message : String(error || '');
  const retryAfterMatch = text.match(/retry after\s+(\d+)\s*s/i);
  if (retryAfterMatch) {
    const seconds = Number(retryAfterMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }

  const suspendedMatch = text.match(/suspended for\s+(\d+)\s*s/i);
  if (suspendedMatch) {
    const seconds = Number(suspendedMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }

  return fallbackMs;
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

async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(safeLimit, items.length) }, () => worker())
  );

  return results;
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

function isInvalidOrOutOfRangeProviderError(error: unknown) {
  if (!(error instanceof ProviderRequestError)) {
    return false;
  }

  if (error.status !== 400) {
    return false;
  }

  const body = error.body.toLowerCase();
  return body.includes('invalid') || body.includes('out of range');
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

function buildStoredRuntimeCacheKey(prefix: string, address: string) {
  return `${prefix}:${normalizeAddressKey(address)}`;
}

function buildAccountInfoStorageKey(address: string) {
  return buildStoredRuntimeCacheKey(ACCOUNT_INFO_CACHE_STORAGE_KEY_PREFIX, address);
}

function buildAccountTrc20AssetsStorageKey(address: string) {
  return buildStoredRuntimeCacheKey(ACCOUNT_TRC20_ASSETS_CACHE_STORAGE_KEY_PREFIX, address);
}

function buildWalletSnapshotStorageKey(address: string) {
  return buildStoredRuntimeCacheKey(WALLET_SNAPSHOT_CACHE_STORAGE_KEY_PREFIX, address);
}

function buildTrongridAccountStorageKey(address: string) {
  return buildStoredRuntimeCacheKey(TRONGRID_ACCOUNT_CACHE_STORAGE_KEY_PREFIX, address);
}

function buildAccountResourcesStorageKey(address: string) {
  return buildStoredRuntimeCacheKey(ACCOUNT_RESOURCES_CACHE_STORAGE_KEY_PREFIX, address);
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

async function readStoredRuntimeCache<T>(storageKey: string, ttlMs: number): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { savedAt?: number; data?: T };

    if (!parsed || typeof parsed.savedAt !== 'number' || !('data' in parsed)) {
      return null;
    }

    if (Date.now() - parsed.savedAt >= ttlMs) {
      await AsyncStorage.removeItem(storageKey).catch(() => null);
      return null;
    }

    return parsed.data as T;
  } catch {
    return null;
  }
}

async function readStoredRuntimeCacheStale<T>(storageKey: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { savedAt?: number; data?: T };

    if (!parsed || typeof parsed.savedAt !== 'number' || !('data' in parsed)) {
      return null;
    }

    return parsed.data as T;
  } catch {
    return null;
  }
}

async function writeStoredRuntimeCache<T>(storageKey: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(
      storageKey,
      JSON.stringify({
        savedAt: Date.now(),
        data,
      })
    );
  } catch {}
}

function clearStoredWalletRuntimeCaches(address: string) {
  const normalized = normalizeAddressKey(address);

  if (!normalized) {
    return;
  }

  void AsyncStorage.multiRemove([
    buildAccountInfoStorageKey(normalized),
    buildAccountTrc20AssetsStorageKey(normalized),
    buildWalletSnapshotStorageKey(normalized),
    buildTrongridAccountStorageKey(normalized),
    buildAccountResourcesStorageKey(normalized),
  ]).catch(() => null);
}

export function clearWalletRuntimeCaches(address: string) {
  const normalized = normalizeAddressKey(address);

  accountInfoMemoryCache.delete(normalized);
  accountTrc20AssetsMemoryCache.delete(normalized);
  walletSnapshotMemoryCache.delete(normalized);
  trongridAccountMemoryCache.delete(normalized);
  accountResourcesMemoryCache.delete(normalized);
  clearStoredWalletRuntimeCaches(normalized);
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
    const tokenId = normalizeTokenId(
      item.tokenId ||
        item.tokenID ||
        item.tokenAddress ||
        item.contractAddress ||
        item.contract_address ||
        ''
    );
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

function isUsableMarketCache(
  cache: CachedMarketIndex | null | undefined,
  tokenIds: string[],
  options?: { allowStale?: boolean; currency?: DisplayCurrencyCode }
) {
  if (!cache || !cache.trx || !cache.byContract || typeof cache.byContract !== 'object') {
    return false;
  }

  if (options?.currency && cache.displayCurrency !== options.currency) {
    return false;
  }

  const now = Date.now();
  const savedAt = typeof cache.savedAt === 'number' ? cache.savedAt : 0;
  const fresh = typeof cache.expiresAt === 'number' && cache.expiresAt > now;
  const staleAllowed =
    options?.allowStale === true &&
    savedAt > 0 &&
    now - savedAt < MARKET_CACHE_STALE_TTL_MS;

  if (!fresh && !staleAllowed) {
    return false;
  }

  return tokenIds.every((tokenId) => tokenId in cache.byContract);
}

async function readStoredMarketCache(options?: {
  allowStale?: boolean;
  tokenIds?: string[];
  currency?: DisplayCurrencyCode;
}): Promise<CachedMarketIndex | null> {
  try {
    const raw = await AsyncStorage.getItem(MARKET_CACHE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedMarketIndex;
    const tokenIds = options?.tokenIds ?? [];

    if (!isUsableMarketCache(parsed, tokenIds, { allowStale: options?.allowStale, currency: options?.currency })) {
      return null;
    }

    marketCache = parsed;
    return parsed;
  } catch (error) {
    console.error('Failed to read market cache:', error);
    return null;
  }
}

async function writeStoredMarketCache(cache: CachedMarketIndex): Promise<void> {
  try {
    await AsyncStorage.setItem(MARKET_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Failed to write market cache:', error);
  }
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

  const entries = await mapWithConcurrencyLimit(
    uniqueTokenIds,
    TRONSCAN_TOKEN_OVERVIEW_PARALLELISM,
    async (tokenId) => {
      return [tokenId, await getTronscanTokenOverview(tokenId)] as const;
    }
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
  limit: number,
  options?: { allowStale?: boolean }
): Promise<WalletHistoryPage | null> {
  const now = Date.now();
  const memory = walletHistoryMemoryCache.get(cacheKey);
  const maxAgeMs = options?.allowStale ? WALLET_HISTORY_CACHE_STALE_TTL_MS : TOKEN_HISTORY_CACHE_TTL_MS;

  if (memory && memory.limit === limit && now - memory.savedAt < maxAgeMs) {
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

    if (now - parsed.savedAt >= maxAgeMs) {
      if (!options?.allowStale) {
        await AsyncStorage.removeItem(cacheKey);
      }
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

export async function getCachedWalletHistoryPage(
  walletAddress: string,
  limit = DEFAULT_WALLET_HISTORY_LIMIT
): Promise<WalletHistoryPage | null> {
  const safeWalletAddress = String(walletAddress || '').trim();
  if (!safeWalletAddress) return null;

  const safeLimit = Math.max(1, Math.min(50, limit));
  const cacheKey = buildWalletHistoryCacheKey(safeWalletAddress, safeLimit);
  return readWalletHistoryCache(cacheKey, safeLimit);
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

  const baseUrl = getProviderBaseUrl(provider);
  const url = buildUrl(baseUrl, path, params);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ProviderRequestError(response.status, text);
  }

  return (await response.json()) as T;
}

async function postWithProviderKeyPool<T>(
  provider: ProviderName,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  assertTronConfig();

  const baseUrl = getProviderBaseUrl(provider);
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ProviderRequestError(response.status, text);
  }

  return (await response.json()) as T;
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
  const url = buildUrl(CMC_BASE_URL, path, params);
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

function convertUsdValue(value: number | undefined, usdToDisplayRate: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return value;
  }

  return value * usdToDisplayRate;
}

async function getUsdToDisplayCurrencyRate(
  currency: DisplayCurrencyCode
): Promise<number> {
  if (currency === 'USD') {
    return 1;
  }

  const now = Date.now();
  if (
    usdDisplayRateCache &&
    usdDisplayRateCache.currency === currency &&
    usdDisplayRateCache.expiresAt > now
  ) {
    return usdDisplayRateCache.rate;
  }

  if (usdDisplayRateInflight) {
    const inflight = await usdDisplayRateInflight;
    if (inflight.currency === currency) {
      return inflight.rate;
    }
  }

  const request = (async () => {
    const response = await cmcFetch<CmcPriceConversionResponse>('/v1/tools/price-conversion', {
      amount: 1,
      symbol: 'USD',
      convert: currency,
    });

    const quote = response.data?.quote?.[currency];
    const rate = parseNumber(quote?.price);

    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Missing USD to ${currency} conversion rate.`);
    }

    const next = {
      currency,
      rate,
      expiresAt: Date.now() + MARKET_CACHE_TTL_MS,
    };
    usdDisplayRateCache = next;
    return { currency, rate };
  })();

  usdDisplayRateInflight = request;

  try {
    const result = await request;
    return result.rate;
  } catch (error) {
    if (usdDisplayRateCache && usdDisplayRateCache.currency === currency) {
      return usdDisplayRateCache.rate;
    }
    throw error;
  } finally {
    usdDisplayRateInflight = null;
  }
}

async function getTrxMarketMeta(
  currency: DisplayCurrencyCode,
  usdToDisplayRate: number
): Promise<MarketMeta> {
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
        priceInUsd: convertUsdValue(parseNumber(stats?.price), usdToDisplayRate),
        priceChange24h: parseNumber(stats?.priceChangePercentage24h),
        marketCap: convertUsdValue(parseNumber(stats?.marketCap), usdToDisplayRate),
        totalSupply: parseNumber(stats?.totalSupply),
        logo: TRX_LOGO,
        displayCurrency: currency,
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
      priceInUsd: convertUsdValue(parseNumber(tronItem?.p) ?? detailLitePrice, usdToDisplayRate),
      priceChange24h: parseNumber(tronItem?.pc24h) ?? detailLiteChange24h,
      marketCap: convertUsdValue(detailLiteMcap, usdToDisplayRate),
      logo: tronItem?.lg || TRX_LOGO,
      displayCurrency: currency,
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
      priceInUsd: convertUsdValue(detailLitePrice, usdToDisplayRate),
      priceChange24h: detailLiteChange24h,
      marketCap: convertUsdValue(detailLiteMcap, usdToDisplayRate),
      logo: TRX_LOGO,
      displayCurrency: currency,
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
    priceInUsd: convertUsdValue(parseNumber(usd?.price), usdToDisplayRate),
    priceChange24h: parseNumber(usd?.percent_change_24h),
    marketCap: convertUsdValue(parseNumber(usd?.market_cap), usdToDisplayRate),
    logo: TRX_LOGO,
    displayCurrency: currency,
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
  },
  currency: DisplayCurrencyCode,
  usdToDisplayRate: number
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
    priceInUsd: convertUsdValue(parseNumber(data?.p), usdToDisplayRate),
    priceChange24h: buildPerformance(data?.sts)[3]?.changePercent,
    marketCap: convertUsdValue(parseNumber(data?.mcap), usdToDisplayRate),
    liquidityUsd: convertUsdValue(parseNumber(data?.liqUsd), usdToDisplayRate),
    totalSupply: parseNumber(data?.ts),
    volume24h: convertUsdValue(parseNumber(
      (data?.sts ?? []).find((entry) => String(entry.tp || '').toLowerCase() === '24h')?.vu
    ), usdToDisplayRate),
    logo: extractDexLogo(data, fallback.logo),
    displayCurrency: currency,
    performance: buildPerformance(data?.sts),
    pools: buildPools(data),
  };
}

async function getFourteenRouterMarketMeta(
  currency: DisplayCurrencyCode,
  usdToDisplayRate: number
): Promise<MarketMeta> {
  const snapshot = await getFourteenPriceSnapshot();

  return {
    name: '4teen',
    symbol: FOURTEEN_SYMBOL,
    decimals: 6,
    priceInUsd: convertUsdValue(snapshot.priceInUsdt, usdToDisplayRate),
    logo: snapshot.logo || FOURTEEN_LOGO,
    displayCurrency: currency,
    performance: buildFallbackPerformance(),
    pools: [],
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
  const currency = await getDisplayCurrency();
  const usdToDisplayRate = await getUsdToDisplayCurrencyRate(currency).catch(() => 1);

  try {
    const meta = await getDexTokenMarketMeta(tokenId, {
      name: fallback.name || tokenId,
      symbol: fallback.symbol || tokenId.slice(0, 6),
      logo: fallback.logo,
    }, currency, usdToDisplayRate);

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
  const currency = await getDisplayCurrency();
  const usdToDisplayRate = await getUsdToDisplayCurrencyRate(currency).catch(() => 1);
  const normalizedContracts = Array.from(
    new Set(
      requestedContracts
        .map((value) => normalizeTokenId(value))
        .filter((value) => value && value !== TRX_TOKEN_ID && value !== TRX_CONTRACT)
    )
  );

  const activeMemoryCache = marketCache;
  if (activeMemoryCache && isUsableMarketCache(activeMemoryCache, normalizedContracts, { currency })) {
    return activeMemoryCache;
  }

  const storedFreshCache = await readStoredMarketCache({
    tokenIds: normalizedContracts,
    currency,
  });

  if (storedFreshCache) {
    return storedFreshCache;
  }

  if (marketIndexInflight) {
    const inflightResult = await marketIndexInflight;
    if (normalizedContracts.every((tokenId) => tokenId in inflightResult.byContract)) {
      return inflightResult;
    }
  }

  const run = async (): Promise<CachedMarketIndex> => {
    const refreshedNow = Date.now();
    const staleCache = await readStoredMarketCache({
      allowStale: true,
      tokenIds: [],
      currency,
    });
    const baseCache = marketCache ?? staleCache;
    const refreshedCacheIsFresh = Boolean(baseCache && baseCache.expiresAt > refreshedNow);

    if (baseCache && isUsableMarketCache(baseCache, normalizedContracts, { currency })) {
      marketCache = baseCache;
      return baseCache;
    }

    const trxMeta =
      refreshedCacheIsFresh && baseCache
        ? baseCache.trx
        : await getTrxMarketMeta(currency, usdToDisplayRate).catch((error): MarketMeta => {
            if (!isCmcInvalidKeyError(error) && !isCmcRateLimitError(error)) {
              console.error('Failed to load TRX market meta:', error);
            }

            return (
              baseCache?.trx ?? {
                name: 'TRON',
                symbol: TRX_SYMBOL,
                logo: TRX_LOGO,
                displayCurrency: currency,
                performance: buildFallbackPerformance(),
                pools: [],
              }
            );
          });

    const byContract: Record<string, MarketMeta> =
      baseCache ? { ...baseCache.byContract } : {};

    if (!refreshedCacheIsFresh || !(USDT_CONTRACT in byContract) || !(FOURTEEN_CONTRACT in byContract)) {
      const [usdtMeta, fourteenMeta] = await Promise.all([
        getDexTokenMarketMeta(USDT_CONTRACT, {
          name: 'Tether USDt',
          symbol: USDT_SYMBOL,
          logo: USDT_LOGO,
        }, currency, usdToDisplayRate).catch((): MarketMeta => (
          byContract[USDT_CONTRACT] ?? {
            name: 'Tether USDt',
            symbol: USDT_SYMBOL,
            decimals: 6,
            logo: USDT_LOGO,
            displayCurrency: currency,
            performance: buildFallbackPerformance(),
            pools: [],
          }
        )),
        getDexTokenMarketMeta(FOURTEEN_CONTRACT, {
          name: '4teen',
          symbol: FOURTEEN_SYMBOL,
          logo: FOURTEEN_LOGO,
        }, currency, usdToDisplayRate).catch(async (): Promise<MarketMeta> => {
          try {
            const routerMeta = await getFourteenRouterMarketMeta(currency, usdToDisplayRate);
            const previousMeta = byContract[FOURTEEN_CONTRACT];

            return {
              ...previousMeta,
              ...routerMeta,
              marketCap: previousMeta?.marketCap,
              liquidityUsd: previousMeta?.liquidityUsd,
              totalSupply: previousMeta?.totalSupply,
              volume24h: previousMeta?.volume24h,
              pools: previousMeta?.pools?.length ? previousMeta.pools : routerMeta.pools,
            };
          } catch {
            return (
              byContract[FOURTEEN_CONTRACT] ?? {
                name: '4teen',
                symbol: FOURTEEN_SYMBOL,
                decimals: 6,
                logo: FOURTEEN_LOGO,
                displayCurrency: currency,
                performance: buildFallbackPerformance(),
                pools: [],
              }
            );
          }
        }),
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
            priceInUsd: convertUsdValue(fallback.priceInUsd, usdToDisplayRate),
            priceChange24h: fallback.priceChange24h,
            liquidityUsd: convertUsdValue(fallback.liquidityUsd, usdToDisplayRate),
            totalSupply: fallback.totalSupply,
            displayCurrency: currency,
            performance: buildFallbackPerformance(fallback.priceChange24h),
            pools: [],
          };

          try {
            const dexMeta = await getDexTokenMarketMeta(tokenId, {
              name: fallbackMeta.name || tokenId,
              symbol: fallbackMeta.symbol || tokenId.slice(0, 6),
              logo: fallbackMeta.logo,
            }, currency, usdToDisplayRate);

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

            return [tokenId, byContract[tokenId] ?? fallbackMeta] as const;
          }
        })
      );

      for (const [tokenId, meta] of loaded) {
        byContract[tokenId] = meta;
      }
    }

    const next: CachedMarketIndex = {
      expiresAt: refreshedNow + MARKET_CACHE_TTL_MS,
      savedAt: refreshedNow,
      displayCurrency: currency,
      trx: trxMeta,
      byContract,
    };

    marketCache = next;
    void writeStoredMarketCache(next);
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

async function getCachedTrongridAccount(
  address: string,
  options?: { force?: boolean }
): Promise<TrongridAccountItem | null> {
  const cacheKey = buildAccountInfoRuntimeCacheKey(address);
  const storageKey = buildTrongridAccountStorageKey(address);
  const staleRuntime = trongridAccountMemoryCache.get(cacheKey)?.data ?? null;

  if (!options?.force) {
    const cached = readFreshRuntimeCache(
      trongridAccountMemoryCache,
      cacheKey,
      ACCOUNT_INFO_CACHE_TTL_MS
    );

    if (cached !== null) {
      return cached;
    }

    const stored = await readStoredRuntimeCache<TrongridAccountItem | null>(
      storageKey,
      ACCOUNT_INFO_CACHE_TTL_MS
    );

    if (stored !== null) {
      writeRuntimeCache(trongridAccountMemoryCache, cacheKey, stored);
      return stored;
    }
  } else {
    trongridAccountMemoryCache.delete(cacheKey);
  }

  const inflight = trongridAccountInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    try {
      const item = await getTrongridAccount(address);
      writeRuntimeCache(trongridAccountMemoryCache, cacheKey, item);
      void writeStoredRuntimeCache(storageKey, item);
      return item;
    } catch (error) {
      if (isProviderRateLimitError(error as ProviderRequestError)) {
        if (staleRuntime !== null) {
          return staleRuntime;
        }

        const staleStored = await readStoredRuntimeCacheStale<TrongridAccountItem | null>(storageKey);
        if (staleStored !== null) {
          writeRuntimeCache(trongridAccountMemoryCache, cacheKey, staleStored);
          return staleStored;
        }
      }

      throw error;
    }
  })();

  trongridAccountInflight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    trongridAccountInflight.delete(cacheKey);
  }
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

function extractTrc20BalancesFromTronscan(items: TronscanTokenItem[]): RawTrc20Balance[] {
  const balances: RawTrc20Balance[] = [];

  for (const item of items) {
    const tokenId = normalizeTokenId(
      item.tokenId ||
        item.tokenID ||
        item.tokenAddress ||
        item.contractAddress ||
        item.contract_address ||
        ''
    );
    const balance = String(item.balance || '').trim();

    if (!tokenId || !balance) continue;
    if (Number(balance) <= 0) continue;

    const tokenType = String(item.tokenType || '').toLowerCase();
    if (tokenType && tokenType !== 'trc20') continue;

    balances.push({
      tokenId,
      balance,
    });
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

function normalizeHistoryContractType(value: unknown) {
  const safe = String(value ?? '').trim();
  return safe || undefined;
}

function normalizeHistoryEventType(value: unknown) {
  const safe = String(value ?? '').trim();
  return safe || undefined;
}

function normalizeHistoryMethodName(value: unknown) {
  const safe = String(value ?? '').trim();
  return safe || undefined;
}

function isUnlimitedApprovalAmount(amountRaw: string) {
  const safe = String(amountRaw || '').trim();
  if (!/^\d+$/.test(safe)) {
    return false;
  }

  return safe.length >= 60;
}

function resolveHistoryTransactionStatus(input: {
  confirmed?: boolean;
  revert?: boolean;
  contractRet?: unknown;
  finalResult?: unknown;
  result?: unknown;
}): HistoryTransactionStatus {
  if (input.revert) {
    return 'failed';
  }

  const labels = [input.contractRet, input.finalResult, input.result]
    .map((value) => String(value ?? '').trim().toUpperCase())
    .filter(Boolean);

  if (
    labels.some(
      (label) =>
        label !== 'SUCCESS' &&
        label !== 'SUCCESSFUL' &&
        label !== 'SUCESS' &&
        label !== 'OK'
    )
  ) {
    return 'failed';
  }

  if (input.confirmed === false) {
    return 'pending';
  }

  return 'success';
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
          transactionStatus: resolveHistoryTransactionStatus({
            confirmed: item.confirmed,
            revert: item.revert,
            contractRet: item.contractRet,
            finalResult: item.finalResult,
          }),
          contractType: normalizeHistoryContractType(item.contract_type),
          eventType: normalizeHistoryEventType(item.event_type),
          methodName: normalizeHistoryMethodName(
            item.trigger_info?.methodName || item.trigger_info?.method
          ),
        };
      })
      .filter(isTokenHistoryItem)
  );
}

function dedupeWalletHistoryItems<T extends WalletHistoryItem>(items: T[]) {
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

function normalizeTrongridAddress(value: unknown) {
  const safe = String(value ?? '').trim();
  if (!safe) return '';
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(safe)) return safe;

  let hex = safe;
  if (hex.startsWith('0x') || hex.startsWith('0X')) {
    hex = hex.slice(2);
  }

  if (hex.length === 40) {
    hex = `41${hex}`;
  }

  if (!/^41[0-9a-fA-F]{40}$/.test(hex)) {
    return safe;
  }

  try {
    return TronWeb.address.fromHex(hex);
  } catch {
    return safe;
  }
}

function getTrongridTransactionContract(tx: TrongridTransactionItem | null | undefined) {
  return tx?.raw_data?.contract?.[0];
}

function getTrongridTransactionContractValue(tx: TrongridTransactionItem | null | undefined) {
  return (getTrongridTransactionContract(tx)?.parameter?.value ?? {}) as Record<string, unknown>;
}

async function getTrongridTransactionEvents(txHash: string) {
  const safeTxHash = String(txHash || '').trim();
  if (!safeTxHash) return [];

  const cached = trongridTransactionEventsMemoryCache.get(safeTxHash);
  const now = Date.now();
  if (cached && now - cached.savedAt < TRONGRID_DETAIL_CACHE_TTL_MS) {
    return cached.data;
  }

  if (trongridEventsCooldownUntil > now) {
    if (cached && now - cached.savedAt < TRONGRID_DETAIL_CACHE_STALE_TTL_MS) {
      return cached.data;
    }
    return [];
  }

  const inflight = trongridTransactionEventsInflight.get(safeTxHash);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    try {
      const response = await trongridFetch<TrongridTransactionEventsResponse>(
        `/v1/transactions/${safeTxHash}/events`
      );
      const data = response.data ?? [];
      trongridTransactionEventsMemoryCache.set(safeTxHash, {
        savedAt: Date.now(),
        data,
      });
      return data;
    } catch (error) {
      if (isTrongridRateLimitError(error)) {
        trongridEventsCooldownUntil = Date.now() + parseProviderCooldownMs(error);
        if (!warnedTrongridEventsRateLimit) {
          warnedTrongridEventsRateLimit = true;
          console.warn(
            'Trongrid transaction events are rate-limited right now. Event details will be partially unavailable until the limit clears.'
          );
        }
        if (cached && Date.now() - cached.savedAt < TRONGRID_DETAIL_CACHE_STALE_TTL_MS) {
          return cached.data;
        }
        return [];
      }
      console.warn('Failed to load Trongrid transaction events:', safeTxHash, error);
      if (cached && Date.now() - cached.savedAt < TRONGRID_DETAIL_CACHE_STALE_TTL_MS) {
        return cached.data;
      }
      return [];
    }
  })();

  trongridTransactionEventsInflight.set(safeTxHash, request);

  try {
    return await request;
  } finally {
    trongridTransactionEventsInflight.delete(safeTxHash);
  }
}

async function getTrongridInternalTransactions(txHash: string) {
  const safeTxHash = String(txHash || '').trim();
  if (!safeTxHash) return [];

  const cached = trongridInternalTransactionsMemoryCache.get(safeTxHash);
  const now = Date.now();
  if (cached && now - cached.savedAt < TRONGRID_DETAIL_CACHE_TTL_MS) {
    return cached.data;
  }

  if (trongridInternalCooldownUntil > now) {
    if (cached && now - cached.savedAt < TRONGRID_DETAIL_CACHE_STALE_TTL_MS) {
      return cached.data;
    }
    return [];
  }

  const inflight = trongridInternalTransactionsInflight.get(safeTxHash);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    try {
      const response = await trongridFetch<TrongridInternalTransactionsResponse>(
        `/v1/transactions/${safeTxHash}/internal-transactions`
      );
      const data = response.data ?? [];
      trongridInternalTransactionsMemoryCache.set(safeTxHash, {
        savedAt: Date.now(),
        data,
      });
      return data;
    } catch (error) {
      if (isTrongridRateLimitError(error)) {
        trongridInternalCooldownUntil = Date.now() + parseProviderCooldownMs(error);
        if (!warnedTrongridInternalRateLimit) {
          warnedTrongridInternalRateLimit = true;
          console.warn(
            'Trongrid internal transactions are rate-limited right now. Internal transfer details will be partially unavailable until the limit clears.'
          );
        }
        if (cached && Date.now() - cached.savedAt < TRONGRID_DETAIL_CACHE_STALE_TTL_MS) {
          return cached.data;
        }
        return [];
      }
      console.warn('Failed to load Trongrid internal transactions:', safeTxHash, error);
      if (cached && Date.now() - cached.savedAt < TRONGRID_DETAIL_CACHE_STALE_TTL_MS) {
        return cached.data;
      }
      return [];
    }
  })();

  trongridInternalTransactionsInflight.set(safeTxHash, request);

  try {
    return await request;
  } finally {
    trongridInternalTransactionsInflight.delete(safeTxHash);
  }
}

function buildWalletTrc20RowsFromTransaction(
  walletAddress: string,
  tx: TrongridTransactionItem,
  events: TrongridTransactionEventItem[]
): WalletTrc20HistorySourceRow[] {
  const txHash = String(tx.txID || '').trim();
  if (!txHash) {
    return [];
  }

  const timestamp = Number(tx.block_timestamp ?? tx.raw_data?.timestamp ?? 0);
  const contractType = normalizeHistoryContractType(getTrongridTransactionContract(tx)?.type);
  const transactionStatus = resolveHistoryTransactionStatus({
    contractRet: tx.ret?.[0]?.contractRet,
  });
  const walletKey = normalizeAddressKey(walletAddress);

  return (events ?? [])
    .map((event): WalletTrc20HistorySourceRow | null => {
      const eventName = String(event.event_name || '').trim();
      const normalizedEventName = eventName.toLowerCase();
      const tokenId = normalizeTokenId(event.contract_address || '');
      if (!tokenId) {
        return null;
      }

      const result = event.result ?? {};

      if (normalizedEventName === 'transfer') {
        const fromAddress = normalizeTrongridAddress(result.from ?? result['0']);
        const toAddress = normalizeTrongridAddress(result.to ?? result['1']);

        if (
          normalizeAddressKey(fromAddress) !== walletKey &&
          normalizeAddressKey(toAddress) !== walletKey
        ) {
          return null;
        }

        return {
          txHash,
          timestamp: Number(event.block_timestamp ?? timestamp),
          tokenId,
          fromAddress,
          toAddress,
          amountRaw: String(result.value ?? result['2'] ?? '0'),
          eventName,
          methodName: 'transfer',
          contractType,
          transactionStatus,
        };
      }

      if (normalizedEventName === 'approval') {
        const ownerAddress = normalizeTrongridAddress(result.owner ?? result['0']);
        const spenderAddress = normalizeTrongridAddress(result.spender ?? result['1']);

        if (normalizeAddressKey(ownerAddress) !== walletKey) {
          return null;
        }

        return {
          txHash,
          timestamp: Number(event.block_timestamp ?? timestamp),
          tokenId,
          fromAddress: ownerAddress,
          toAddress: spenderAddress,
          amountRaw: String(result.value ?? result['2'] ?? '0'),
          eventName,
          methodName: 'approve',
          contractType,
          transactionStatus,
        };
      }

      return null;
    })
    .filter((item): item is WalletTrc20HistorySourceRow => Boolean(item));
}

function buildWalletTrc20RowsFromTrongrid(
  walletAddress: string,
  rows: TrongridTrc20TransactionItem[]
): WalletTrc20HistorySourceRow[] {
  const walletKey = normalizeAddressKey(walletAddress);

  return (rows ?? [])
    .map((item): WalletTrc20HistorySourceRow | null => {
      const txHash = String(item.transaction_id || '').trim();
      const tokenId = normalizeTokenId(item.token_info?.address || '');
      const fromAddress = normalizeTrongridAddress(item.from ?? item.from_address);
      const toAddress = normalizeTrongridAddress(item.to ?? item.to_address);
      const eventName = String(item.type || 'Transfer').trim() || 'Transfer';
      const normalizedEventName = eventName.toLowerCase();

      if (!txHash || !tokenId) {
        return null;
      }

      const fromKey = normalizeAddressKey(fromAddress);
      const toKey = normalizeAddressKey(toAddress);
      if (fromKey !== walletKey && toKey !== walletKey) {
        return null;
      }

      if (normalizedEventName === 'approval' && fromKey !== walletKey) {
        return null;
      }

      return {
        txHash,
        timestamp: Number(item.block_timestamp || 0),
        tokenId,
        fromAddress,
        toAddress,
        amountRaw: String(item.value ?? '0'),
        eventName,
        methodName: normalizedEventName === 'approval' ? 'approve' : 'transfer',
        contractType: 'TriggerSmartContract',
        transactionStatus: 'success',
      };
    })
    .filter((item): item is WalletTrc20HistorySourceRow => Boolean(item));
}

function buildWalletInternalTrxHistoryItems(
  walletAddress: string,
  txHash: string,
  contractType: string | undefined,
  transactionStatus: HistoryTransactionStatus,
  rows: TrongridInternalTransactionItem[],
  addressBook: Record<string, string>
): WalletHistorySourceItem[] {
  const walletKey = normalizeAddressKey(walletAddress);
  const totals = new Map<
    'IN' | 'OUT',
    {
      amountSun: bigint;
      timestamp: number;
      fromAddress?: string;
      toAddress?: string;
      failed: boolean;
    }
  >();

  for (const item of rows) {
    const fromAddress = normalizeTrongridAddress(item.from_address);
    const toAddress = normalizeTrongridAddress(item.to_address);

    if (
      normalizeAddressKey(fromAddress) !== walletKey &&
      normalizeAddressKey(toAddress) !== walletKey
    ) {
      continue;
    }

    const amountRaw = String(item.data?.call_value?._ ?? '0').trim();
    if (!amountRaw || !/^\d+$/.test(amountRaw)) {
      continue;
    }

    const baseType = normalizeHistoryType(walletAddress, fromAddress, toAddress);
    if (baseType === 'SELF') {
      continue;
    }

    const current = totals.get(baseType) ?? {
      amountSun: 0n,
      timestamp: Number(item.block_timestamp || 0),
      fromAddress,
      toAddress,
      failed: false,
    };

    current.amountSun += BigInt(amountRaw);
    current.timestamp = Math.max(current.timestamp, Number(item.block_timestamp || 0));
    current.fromAddress = current.fromAddress || fromAddress;
    current.toAddress = current.toAddress || toAddress;
    current.failed = current.failed || item.data?.rejected === true;
    totals.set(baseType, current);
  }

  return dedupeWalletHistoryItems(
    Array.from(totals.entries())
      .map(([baseType, item], index): WalletHistorySourceItem | null => {
        if (item.amountSun <= 0n) {
          return null;
        }

        const amountRaw = item.amountSun.toString();
        const fromAddress = String(item.fromAddress || '').trim();
        const toAddress = String(item.toAddress || '').trim();
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
          id: `${TRX_TOKEN_ID}:${txHash}:internal:${baseType}:${index}`,
          txHash,
          type: baseType,
          displayType,
          amountRaw,
          amountFormatted: formatHistoryAmount(amountRaw, 6, displayType),
          timestamp: item.timestamp,
          from: fromAddress,
          to: toAddress,
          counterpartyAddress,
          counterpartyLabel: contactName || shortenAddress(counterpartyAddress),
          isKnownContact: Boolean(contactName),
          tronscanUrl: buildTronscanTxUrl(txHash),
          transactionStatus: item.failed ? 'failed' : transactionStatus,
          contractType,
          eventType: 'InternalTransfer',
          methodName: 'internal-transfer',
          tokenId: TRX_TOKEN_ID,
          tokenName: 'TRON',
          tokenSymbol: TRX_SYMBOL,
          tokenLogo: TRX_LOGO,
          sourceRowIndex: index,
        };
      })
      .filter(
        isTokenHistoryItem as unknown as (
          item: WalletHistorySourceItem | null
        ) => item is WalletHistorySourceItem
      )
  );
}

function extractWalletActionAmountRaw(value: Record<string, unknown>) {
  const amountKeysByPriority = [
    'balance',
    'amount',
    'frozen_balance',
    'unfreeze_balance',
    'withdraw_expire_amount',
    'quant',
  ];

  for (const key of amountKeysByPriority) {
    const raw = value[key];
    if (raw === undefined || raw === null || raw === '') {
      continue;
    }

    const safe = String(raw).trim();
    if (/^\d+$/.test(safe)) {
      return safe;
    }
  }

  return '';
}

function resolveWalletActionCounterpartyAddress(
  walletAddress: string,
  value: Record<string, unknown>
) {
  const candidateKeys = [
    'receiver_address',
    'resource_receiver_address',
    'to_address',
    'contract_address',
    'witness_address',
    'account_address',
  ];

  for (const key of candidateKeys) {
    const address = normalizeTrongridAddress(value[key]);
    if (address && !isSameAddress(address, walletAddress)) {
      return address;
    }
  }

  return '';
}

function buildWalletActionHistoryItem(
  walletAddress: string,
  tx: TrongridTransactionItem,
  addressBook: Record<string, string>,
  sourceRowIndex: number
): WalletHistorySourceItem | null {
  const txHash = String(tx.txID || '').trim();
  if (!txHash) {
    return null;
  }

  const contract = getTrongridTransactionContract(tx);
  const contractType = normalizeHistoryContractType(contract?.type);
  if (!contractType || contractType === 'TransferContract' || contractType === 'TriggerSmartContract') {
    return null;
  }

  const value = getTrongridTransactionContractValue(tx);
  const amountRaw = extractWalletActionAmountRaw(value);
  const likelyReceive =
    contractType.startsWith('Un') ||
    contractType.includes('Withdraw') ||
    contractType.includes('Cancel');
  const displayType: TokenHistoryDisplayType = likelyReceive ? 'RECEIVE' : 'SEND';
  const counterpartyAddress = resolveWalletActionCounterpartyAddress(walletAddress, value);
  const counterpartyKey = normalizeAddressKey(counterpartyAddress);
  const contactName = counterpartyKey ? addressBook[counterpartyKey] : undefined;

  return {
    id: `${TRX_TOKEN_ID}:${txHash}:action`,
    txHash,
    type: likelyReceive ? 'IN' : 'OUT',
    displayType,
    amountRaw: amountRaw || '0',
    amountFormatted: amountRaw ? formatHistoryAmount(amountRaw, 6, displayType) : '',
    timestamp: Number(tx.block_timestamp ?? tx.raw_data?.timestamp ?? 0),
    from: normalizeTrongridAddress(value.owner_address),
    to: counterpartyAddress,
    counterpartyAddress: counterpartyAddress || undefined,
    counterpartyLabel: counterpartyAddress
      ? contactName || shortenAddress(counterpartyAddress)
      : undefined,
    isKnownContact: Boolean(contactName),
    tronscanUrl: buildTronscanTxUrl(txHash),
    transactionStatus: resolveHistoryTransactionStatus({
      contractRet: tx.ret?.[0]?.contractRet,
    }),
    contractType,
    eventType: 'Transaction',
    methodName: 'contract-action',
    tokenId: TRX_TOKEN_ID,
    tokenName: 'TRON',
    tokenSymbol: TRX_SYMBOL,
    tokenLogo: TRX_LOGO,
    sourceRowIndex,
  };
}

function buildWalletTrc20HistoryItems(
  walletAddress: string,
  rows: WalletTrc20HistorySourceRow[],
  addressBook: Record<string, string>,
  overviewMap: Record<string, TokenMetaFallback>
): WalletHistorySourceItem[] {
  return dedupeWalletHistoryItems(
    rows
      .map((item, index): WalletHistorySourceItem | null => {
        const txHash = String(item.txHash || `wallet-trc20-${index}`);
        const amountRaw = String(item.amountRaw ?? '0');
        const fromAddress = String(item.fromAddress || '').trim();
        const toAddress = String(item.toAddress || '').trim();
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

        const tokenId = normalizeTokenId(item.tokenId || '');
        if (!tokenId) {
          return null;
        }

        const methodName = normalizeHistoryMethodName(item.methodName ?? item.eventName);
        const isApproval = String(methodName || '').toLowerCase().includes('approve');
        const overview = overviewMap[tokenId] ?? {};
        const known = getKnownTokenMeta(tokenId);

        const tokenDecimals = Number(overview.decimals ?? known?.tokenDecimal ?? 0) || 0;

        const tokenSymbol =
          String(overview.symbol || known?.tokenAbbr || '').trim() ||
          tokenId.slice(0, 6) ||
          'TOKEN';

        const tokenName =
          String(overview.name || known?.tokenName || '').trim() || tokenSymbol || 'Token';

        return {
          id: `${tokenId}:${txHash}`,
          txHash,
          type: baseType,
          displayType,
          amountRaw,
          amountFormatted:
            isApproval && isUnlimitedApprovalAmount(amountRaw)
              ? 'UNLIMITED'
              : formatHistoryAmount(amountRaw, tokenDecimals, displayType),
          timestamp: Number(item.timestamp || 0),
          from: fromAddress,
          to: toAddress,
          counterpartyAddress,
          counterpartyLabel: contactName || shortenAddress(counterpartyAddress),
          isKnownContact: Boolean(contactName),
          tronscanUrl: buildTronscanTxUrl(txHash),
          transactionStatus: item.transactionStatus ?? 'success',
          contractType: normalizeHistoryContractType(item.contractType),
          eventType: normalizeHistoryEventType(item.eventName),
          methodName,
          tokenId,
          tokenName,
          tokenSymbol,
          tokenLogo: overview.logo || known?.tokenLogo,
          sourceRowIndex: index,
        };
      })
      .filter(
        isTokenHistoryItem as unknown as (
          item: WalletHistorySourceItem | null
        ) => item is WalletHistorySourceItem
      )
  );
}

function buildWalletTrxHistoryItems(
  walletAddress: string,
  rows: TrongridTransactionItem[],
  addressBook: Record<string, string>
): WalletHistorySourceItem[] {
  return dedupeWalletHistoryItems(
    rows
      .map((item, index): WalletHistorySourceItem | null => {
        const contract = getTrongridTransactionContract(item);
        const contractType = String(contract?.type || '').trim();
        if (contractType !== 'TransferContract') {
          return null;
        }

        const txHash = String(item.txID || `wallet-trx-${index}`);
        const value = contract?.parameter?.value ?? {};
        const amountRaw = String(value.amount ?? '0');
        const fromAddress = normalizeTrongridAddress(value.owner_address);
        const toAddress = normalizeTrongridAddress(value.to_address);
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
          timestamp: Number(item.block_timestamp ?? item.raw_data?.timestamp ?? 0),
          from: fromAddress,
          to: toAddress,
          counterpartyAddress,
          counterpartyLabel: contactName || shortenAddress(counterpartyAddress),
          isKnownContact: Boolean(contactName),
          tronscanUrl: buildTronscanTxUrl(txHash),
          transactionStatus: resolveHistoryTransactionStatus({
            contractRet: item.ret?.[0]?.contractRet,
          }),
          contractType: normalizeHistoryContractType(contractType),
          eventType: undefined,
          tokenId: TRX_TOKEN_ID,
          tokenName: 'TRON',
          tokenSymbol: TRX_SYMBOL,
          tokenLogo: TRX_LOGO,
          sourceRowIndex: index,
        };
      })
      .filter(
        isTokenHistoryItem as unknown as (
          item: WalletHistorySourceItem | null
        ) => item is WalletHistorySourceItem
      )
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

function isWalletHistoryItemShape(value: unknown): value is WalletHistoryItem {
  if (!value || typeof value !== 'object') return false;

  const item = value as Partial<WalletHistoryItem>;
  return (
    typeof item.txHash === 'string' &&
    typeof item.tokenId === 'string' &&
    typeof item.amountRaw === 'string' &&
    typeof item.amountFormatted === 'string' &&
    typeof item.timestamp === 'number'
  );
}

function parseWalletHistoryCursor(fingerprint?: string): WalletHistoryCursor {
  const safe = String(fingerprint || '').trim();

  if (!safe) {
    return {};
  }

  try {
    const parsed = JSON.parse(safe) as Partial<WalletHistoryCursor>;
    const txFingerprint =
      typeof parsed.txFingerprint === 'string' && parsed.txFingerprint.trim()
        ? parsed.txFingerprint.trim()
        : undefined;
    const trc20Fingerprint =
      typeof parsed.trc20Fingerprint === 'string' && parsed.trc20Fingerprint.trim()
        ? parsed.trc20Fingerprint.trim()
        : undefined;
    const bufferedItems = Array.isArray(parsed.bufferedItems)
      ? parsed.bufferedItems.filter(isWalletHistoryItemShape)
      : [];

    return {
      txFingerprint,
      trc20Fingerprint,
      bufferedItems,
    };
  } catch {
    return {};
  }
}

function stringifyWalletHistoryCursor(cursor: WalletHistoryCursor) {
  return JSON.stringify({
    txFingerprint: String(cursor.txFingerprint || '').trim() || undefined,
    trc20Fingerprint: String(cursor.trc20Fingerprint || '').trim() || undefined,
    bufferedItems: Array.isArray(cursor.bufferedItems) ? cursor.bufferedItems : [],
  });
}

export async function getTokenHistoryPage(
  walletAddress: string,
  tokenId: string,
  decimals: number,
  fingerprint?: string
): Promise<TokenHistoryPage> {
  const limit = 10;

  try {
    const addressBook = await getAddressBookMap().catch(() => ({} as Record<string, string>));

    if (tokenId === TRX_TOKEN_ID) {
      const items: TokenHistoryItem[] = [];
      let nextWalletFingerprint = fingerprint;
      let hasMore = false;
      let attempts = 0;

      while (items.length < limit && attempts < 8) {
        attempts += 1;

        const walletPage = await getWalletHistoryPage(walletAddress, {
          limit: Math.max(limit * 2, DEFAULT_WALLET_HISTORY_LIMIT),
          fingerprint: nextWalletFingerprint,
        });

        const trxItems = walletPage.items
          .filter((item) => item.tokenId === TRX_TOKEN_ID)
          .map(({ tokenId: _tokenId, tokenName: _tokenName, tokenSymbol: _tokenSymbol, tokenLogo: _tokenLogo, ...item }) => item);

        items.push(...trxItems);
        nextWalletFingerprint = walletPage.nextFingerprint;
        hasMore = walletPage.hasMore;

        if (!walletPage.hasMore || !walletPage.nextFingerprint) {
          break;
        }
      }

      return {
        items: dedupeHistoryItems(items).slice(0, limit),
        nextFingerprint: hasMore ? nextWalletFingerprint : undefined,
        hasMore,
      };
    }

    const start = Math.max(0, Number.parseInt(String(fingerprint || '0'), 10) || 0);
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
    if (isInvalidOrOutOfRangeProviderError(error)) {
      return {
        items: [],
        nextFingerprint: undefined,
        hasMore: false,
      };
    }

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
  const cursor = parseWalletHistoryCursor(options?.fingerprint);
  const cacheKey = buildWalletHistoryCacheKey(walletAddress, limit);

  const hasBufferedItems = Array.isArray(cursor.bufferedItems) && cursor.bufferedItems.length > 0;

  if (!options?.force && !cursor.txFingerprint && !hasBufferedItems) {
    const cached = await readWalletHistoryCache(cacheKey, limit);
    if (cached) {
      return cached;
    }
  }

  try {
    const addressBook = await getAddressBookMap().catch(() => ({} as Record<string, string>));
    const batchSize = Math.max(limit * 2, DEFAULT_WALLET_HISTORY_LIMIT);
    const buffer = dedupeWalletHistoryItems(cursor.bufferedItems ?? []).sort(
      (left, right) => right.timestamp - left.timestamp
    );
    let txFingerprint = cursor.txFingerprint;
    let trc20Fingerprint = cursor.trc20Fingerprint;
    let txHasMore = false;
    let trc20HasMore = false;
    let txExhausted = false;
    let trc20Exhausted = false;
    let attempts = 0;
    let encounteredBaseFetchFailure = false;
    let detailEnrichmentsRemaining = MAX_TRONGRID_DETAIL_ENRICHMENTS_PER_PAGE;

    while (buffer.length < limit && attempts < 8) {
      attempts += 1;

      const txPagePromise: Promise<TrongridTransactionsResponse> = txExhausted
        ? Promise.resolve({})
        : trongridFetch<TrongridTransactionsResponse>(
            `/v1/accounts/${walletAddress}/transactions`,
            {
              limit: batchSize,
              order_by: 'block_timestamp,desc',
              only_confirmed: true,
              ...(txFingerprint ? { fingerprint: txFingerprint } : {}),
            }
          );
      const trc20PagePromise: Promise<TrongridTrc20TransactionsResponse> = trc20Exhausted
        ? Promise.resolve({})
        : trongridFetch<TrongridTrc20TransactionsResponse>(
            `/v1/accounts/${walletAddress}/transactions/trc20`,
            {
              limit: batchSize,
              order_by: 'block_timestamp,desc',
              only_confirmed: true,
              ...(trc20Fingerprint ? { fingerprint: trc20Fingerprint } : {}),
            }
          );

      const [txResult, trc20Result] = await Promise.allSettled([
        txPagePromise,
        trc20PagePromise,
      ]);
      const response = txResult.status === 'fulfilled' ? txResult.value : {};
      const trc20Response = trc20Result.status === 'fulfilled' ? trc20Result.value : {};

      if (txResult.status === 'rejected' || trc20Result.status === 'rejected') {
        encounteredBaseFetchFailure = true;
      }

      const txRows = response.data ?? [];
      const nextTxFingerprint =
        String(response.meta?.fingerprint || '').trim() || undefined;
      txHasMore = Boolean(nextTxFingerprint);
      txFingerprint = nextTxFingerprint;
      txExhausted = txExhausted || !nextTxFingerprint;
      const trc20RowsFromEndpoint = buildWalletTrc20RowsFromTrongrid(
        walletAddress,
        trc20Response.data ?? []
      );
      const nextTrc20Fingerprint =
        String(trc20Response.meta?.fingerprint || '').trim() || undefined;
      trc20HasMore = Boolean(nextTrc20Fingerprint);
      trc20Fingerprint = nextTrc20Fingerprint;
      trc20Exhausted = trc20Exhausted || !nextTrc20Fingerprint;

      if (txRows.length === 0 && trc20RowsFromEndpoint.length === 0) {
        break;
      }

      const transactionEntries = await Promise.all(
        txRows.map(async (tx, txIndex) => {
          const contractType = normalizeHistoryContractType(
            getTrongridTransactionContract(tx)?.type
          );
          const transactionStatus = resolveHistoryTransactionStatus({
            contractRet: tx.ret?.[0]?.contractRet,
          });

          const trxItems = buildWalletTrxHistoryItems(walletAddress, [tx], addressBook).map(
            (item, index) => ({
              ...item,
              sourceRowIndex: txIndex * 100 + index,
            })
          );

          const isTriggerSmartContract = contractType === 'TriggerSmartContract';
          const shouldEnrichDetails =
            isTriggerSmartContract && detailEnrichmentsRemaining > 0;
          if (shouldEnrichDetails) {
            detailEnrichmentsRemaining -= 1;
          }
          const [events, internalTransactions] = shouldEnrichDetails
            ? await Promise.all([
                getTrongridTransactionEvents(tx.txID || ''),
                getTrongridInternalTransactions(tx.txID || ''),
              ])
            : [[], []];

          const trc20Rows = buildWalletTrc20RowsFromTransaction(walletAddress, tx, events);
          const internalTrxItems = buildWalletInternalTrxHistoryItems(
            walletAddress,
            String(tx.txID || '').trim(),
            contractType,
            transactionStatus,
            internalTransactions,
            addressBook
          ).map((item, index) => ({
            ...item,
            sourceRowIndex: txIndex * 100 + 50 + index,
          }));
          const actionItem =
            trxItems.length === 0 &&
            trc20Rows.length === 0 &&
            internalTrxItems.length === 0
              ? buildWalletActionHistoryItem(
                  walletAddress,
                  tx,
                  addressBook,
                  txIndex * 100 + 90
                )
              : null;

          return {
            trxItems,
            trc20Rows,
            internalTrxItems,
            actionItems: actionItem ? [actionItem] : [],
          };
        })
      );

      const trc20Rows = transactionEntries
        .flatMap((entry) => entry.trc20Rows)
        .concat(trc20RowsFromEndpoint);
      const tokenIdsToLoad = Array.from(
        new Set(
          trc20Rows
            .map((item) => normalizeTokenId(item.tokenId))
            .filter((tokenId) => Boolean(tokenId) && tokenId !== TRX_TOKEN_ID)
        )
      );
      const overviewMap = tokenIdsToLoad.length
        ? await getTronscanTokenOverviewMap(tokenIdsToLoad)
        : {};

      const trc20Items = buildWalletTrc20HistoryItems(
        walletAddress,
        trc20Rows,
        addressBook,
        overviewMap
      ).map((item, index) => ({
        ...item,
        sourceRowIndex: transactionEntries.length * 100 + index,
      }));

      const pageItems = dedupeWalletHistoryItems(
        transactionEntries
          .flatMap((entry) => [...entry.trxItems, ...entry.internalTrxItems, ...entry.actionItems])
          .concat(trc20Items)
      )
        .sort((left, right) => right.timestamp - left.timestamp)
        .map(({ sourceRowIndex, ...item }) => item);

      if (pageItems.length === 0 && !txHasMore && !trc20HasMore) {
        break;
      }

      buffer.push(...pageItems);
      buffer.sort((left, right) => right.timestamp - left.timestamp);

      if (!txHasMore && !trc20HasMore) {
        break;
      }
    }

    const items = dedupeWalletHistoryItems(buffer).sort((left, right) => right.timestamp - left.timestamp);
    const visibleItems = items.slice(0, limit);
    const bufferedItems = items.slice(limit);
    const hasMore = bufferedItems.length > 0 || txHasMore || trc20HasMore;

    const page: WalletHistoryPage = {
      items: visibleItems,
      nextFingerprint: hasMore
        ? stringifyWalletHistoryCursor({
          txFingerprint,
          trc20Fingerprint,
          bufferedItems,
        })
        : undefined,
      hasMore,
    };

    if (!cursor.txFingerprint && !hasBufferedItems && !encounteredBaseFetchFailure) {
      await writeWalletHistoryCache(cacheKey, page, limit);
    }

    return page;
  } catch (error) {
    console.error('Failed to load wallet history:', walletAddress, error);
    const fallback = await readWalletHistoryCache(cacheKey, limit, { allowStale: true });
    if (fallback) {
      return fallback;
    }
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
  const storageKey = buildAccountInfoStorageKey(address);

  if (!options?.force) {
    const cached = readFreshRuntimeCache(accountInfoMemoryCache, cacheKey, ACCOUNT_INFO_CACHE_TTL_MS);
    if (cached) {
      logCacheDebug(`[cache] account info hit: ${address}`);
      return cached;
    }

    const stored = await readStoredRuntimeCache<TronAccountInfo>(
      storageKey,
      ACCOUNT_INFO_CACHE_TTL_MS
    );

    if (stored) {
      writeRuntimeCache(accountInfoMemoryCache, cacheKey, stored);
      logCacheDebug(`[cache] account info storage hit: ${address}`);
      return stored;
    }
  } else {
    accountInfoMemoryCache.delete(cacheKey);
  }

  const inflight = accountInfoInflight.get(cacheKey);
  if (inflight) {
    logCacheDebug(`[cache] account info join inflight: ${address}`);
    return inflight;
  }

  const request = (async (): Promise<TronAccountInfo> => {
    logCacheDebug(`[cache] account info miss: ${address}`);
    const item = await getCachedTrongridAccount(address, options);
    const balanceSun = typeof item?.balance === 'number' ? item.balance : 0;

    const result: TronAccountInfo = {
      address,
      balanceSun,
      balanceTrx: balanceSun / 1_000_000,
    };

    writeRuntimeCache(accountInfoMemoryCache, cacheKey, result);
    void writeStoredRuntimeCache(storageKey, result);
    logCacheDebug(`[cache] account info store: ${address}`);

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
  const storageKey = buildAccountResourcesStorageKey(address);
  const staleRuntime = accountResourcesMemoryCache.get(cacheKey)?.data ?? null;

  if (!options?.force) {
    const cached = readFreshRuntimeCache(
      accountResourcesMemoryCache,
      cacheKey,
      ACCOUNT_RESOURCES_CACHE_TTL_MS
    );
    if (cached) {
      return cached;
    }

    const stored = await readStoredRuntimeCache<WalletAccountResources>(
      storageKey,
      ACCOUNT_RESOURCES_CACHE_TTL_MS
    );

    if (stored) {
      writeRuntimeCache(accountResourcesMemoryCache, cacheKey, stored);
      return stored;
    }
  } else {
    accountResourcesMemoryCache.delete(cacheKey);
  }

  const inflight = accountResourcesInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async (): Promise<WalletAccountResources> => {
    try {
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
      void writeStoredRuntimeCache(storageKey, result);
      return result;
    } catch (error) {
      if (isProviderRateLimitError(error as ProviderRequestError)) {
        if (staleRuntime) {
          return staleRuntime;
        }

        const staleStored = await readStoredRuntimeCacheStale<WalletAccountResources>(storageKey);
        if (staleStored) {
          writeRuntimeCache(accountResourcesMemoryCache, cacheKey, staleStored);
          return staleStored;
        }
      }

      throw error;
    }
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
  const storageKey = buildAccountTrc20AssetsStorageKey(address);

  if (!options?.force) {
    const cached = readFreshRuntimeCache(
      accountTrc20AssetsMemoryCache,
      cacheKey,
      ACCOUNT_TRC20_ASSETS_CACHE_TTL_MS
    );
    if (cached) {
      logCacheDebug(`[cache] trc20 assets hit: ${address}`);
      return cached;
    }

    const stored = await readStoredRuntimeCache<Trc20Asset[]>(
      storageKey,
      ACCOUNT_TRC20_ASSETS_CACHE_TTL_MS
    );

    if (stored) {
      writeRuntimeCache(accountTrc20AssetsMemoryCache, cacheKey, stored);
      logCacheDebug(`[cache] trc20 assets storage hit: ${address}`);
      return stored;
    }
  } else {
    accountTrc20AssetsMemoryCache.delete(cacheKey);
  }

  const inflight = accountTrc20AssetsInflight.get(cacheKey);
  if (inflight) {
    logCacheDebug(`[cache] trc20 assets join inflight: ${address}`);
    return inflight;
  }

  const request = (async (): Promise<Trc20Asset[]> => {
    logCacheDebug(`[cache] trc20 assets miss: ${address}`);

    let accountLookupFailed = false;
    let tronscanLookupFailed = false;

    const [accountItem, tronscanData] = await Promise.all([
      getCachedTrongridAccount(address, options).catch((error): TrongridAccountItem | null => {
        accountLookupFailed = true;

        if (!isProviderRateLimitError(error as ProviderRequestError)) {
          console.warn('Failed to load raw TronGrid account for TRC20 balances:', address, error);
        }

        return null;
      }),
      tronscanFetch<TronscanTokensResponse>('/account/tokens', {
        address,
        start: 0,
        limit: 200,
        show: 1,
        sortType: 0,
        sortBy: 0,
      }).catch((error): TronscanTokensResponse => {
        tronscanLookupFailed = true;
        console.warn('Failed to load Tronscan token balances:', address, error);
        return {};
      }),
    ]);

    const tronscanTokens = extractTokenList(tronscanData);
    const tronscanIndex = indexTronscanTokens(tronscanTokens);
    const rawBalances = dedupeBalances([
      ...extractTrc20BalancesFromTronscan(tronscanTokens),
      ...extractTrc20BalancesFromTrongrid(accountItem),
    ]);

    if (!rawBalances.length && accountLookupFailed && tronscanLookupFailed) {
      throw new Error('All TRC20 balance providers failed');
    }

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
        fallbackMeta.priceInUsd ??
        0;

      const marketValueInUsd = balanceBase * priceInUsd;

      const valueInUsd =
        typeof marketMeta.priceInUsd === 'number' || typeof fallbackMeta.priceInUsd === 'number'
          ? marketValueInUsd
          : marketValueInUsd;

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
    void writeStoredRuntimeCache(storageKey, result);
    logCacheDebug(`[cache] trc20 assets store: ${address}`);

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
  const storageKey = buildWalletSnapshotStorageKey(address);

  if (!options?.force) {
    const cached = readFreshRuntimeCache(
      walletSnapshotMemoryCache,
      cacheKey,
      WALLET_SNAPSHOT_CACHE_TTL_MS
    );
    if (cached) {
      logCacheDebug(`[cache] wallet snapshot hit: ${address}`);
      return cached;
    }

    const stored = await readStoredRuntimeCache<WalletSnapshot>(
      storageKey,
      WALLET_SNAPSHOT_CACHE_TTL_MS
    );

    if (stored) {
      writeRuntimeCache(walletSnapshotMemoryCache, cacheKey, stored);
      logCacheDebug(`[cache] wallet snapshot storage hit: ${address}`);
      return stored;
    }
  } else {
    clearWalletRuntimeCaches(address);
  }

  const inflight = walletSnapshotInflight.get(cacheKey);
  if (inflight) {
    logCacheDebug(`[cache] wallet snapshot join inflight: ${address}`);
    return inflight;
  }

  const request = (async (): Promise<WalletSnapshot> => {
    logCacheDebug(`[cache] wallet snapshot miss: ${address}`);

    const [accountResult, trc20AssetsResult, trxPriceResult] = await Promise.allSettled([
      getAccountInfo(address, options),
      getAccountTrc20Assets(address, options),
      getTrxPrice(),
    ]);

    if (accountResult.status === 'rejected') {
      if (!isProviderRateLimitError(accountResult.reason as ProviderRequestError)) {
        console.warn(
          'Failed to load TRX account balance, using 0 TRX fallback:',
          address,
          accountResult.reason
        );
      }
    }

    if (trc20AssetsResult.status === 'rejected') {
      const reasonText =
        trc20AssetsResult.reason instanceof Error
          ? trc20AssetsResult.reason.message
          : String(trc20AssetsResult.reason || '');
      const isRateLimit =
        isProviderRateLimitError(trc20AssetsResult.reason as ProviderRequestError) ||
        reasonText.toLowerCase().includes('rate limit');

      if (!isRateLimit) {
        console.warn(
          'Failed to load TRC20 balances, using empty token fallback:',
          address,
          trc20AssetsResult.reason
        );
      }
    }

    if (trxPriceResult.status === 'rejected') {
      console.warn('Failed to load TRX market price, using 0 USD fallback:', address, trxPriceResult.reason);
    }

    const account =
      accountResult.status === 'fulfilled'
        ? accountResult.value
        : {
            address,
            balanceSun: 0,
            balanceTrx: 0,
          };
    const trc20Assets = trc20AssetsResult.status === 'fulfilled' ? trc20AssetsResult.value : [];
    const trxPrice =
      trxPriceResult.status === 'fulfilled'
        ? trxPriceResult.value
        : {
            priceInUsd: 0,
            logo: TRX_LOGO,
          };

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
    void writeStoredRuntimeCache(storageKey, result);
    logCacheDebug(`[cache] wallet snapshot store: ${address}`);

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

let customTokenListMemoryCache: CustomTokenListCachePayload | null = null;
let customTokenListInflight: Promise<TronscanTokenListItem[]> | null = null;

export async function getTronscanTokenList(
  options?: { force?: boolean }
): Promise<TronscanTokenListItem[]> {
  const force = Boolean(options?.force);
  const now = Date.now();

  if (!force && customTokenListMemoryCache && now - customTokenListMemoryCache.savedAt < CUSTOM_TOKEN_LIST_CACHE_TTL_MS) {
    return customTokenListMemoryCache.items;
  }

  if (!force && customTokenListInflight) {
    return customTokenListInflight;
  }

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
          customTokenListMemoryCache = parsed;
          return parsed.items;
        }
      }
    } catch (error) {
      console.error('Failed to read custom token list cache:', error);
    }
  }

  const request = (async (): Promise<TronscanTokenListItem[]> => {
    try {
      const response = await fetch(buildUrl(TRONSCAN_BASE_URL, '/getAssetWithPriceList'), {
        headers: {
          Accept: 'application/json',
        },
      });

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

      const payloadToCache = {
        savedAt: Date.now(),
        items,
      } satisfies CustomTokenListCachePayload;

      customTokenListMemoryCache = payloadToCache;

      try {
        await AsyncStorage.setItem(
          CUSTOM_TOKEN_LIST_CACHE_KEY,
          JSON.stringify(payloadToCache)
        );
      } catch (error) {
        console.error('Failed to write custom token list cache:', error);
      }

      return items;
    } catch (error) {
      console.error('Failed to load Tronscan token list:', error);

      if (customTokenListMemoryCache?.items?.length) {
        return customTokenListMemoryCache.items;
      }

      if (!force) {
        try {
          const raw = await AsyncStorage.getItem(CUSTOM_TOKEN_LIST_CACHE_KEY);

          if (raw) {
            const parsed = JSON.parse(raw) as CustomTokenListCachePayload;
            if (parsed && Array.isArray(parsed.items)) {
              customTokenListMemoryCache = parsed;
              return parsed.items;
            }
          }
        } catch (cacheError) {
          console.error('Failed to read fallback custom token list cache:', cacheError);
        }
      }

      return [];
    }
  })();

  customTokenListInflight = request;

  try {
    return await request;
  } finally {
    if (customTokenListInflight === request) {
      customTokenListInflight = null;
    }
  }
}



export async function clearAllTronCaches(): Promise<void> {
  marketCache = null;
  marketIndexInflight = null;
  usdDisplayRateCache = null;
  usdDisplayRateInflight = null;

  tokenHistoryMemoryCache.clear();
  walletHistoryMemoryCache.clear();
  accountInfoMemoryCache.clear();
  accountTrc20AssetsMemoryCache.clear();
  walletSnapshotMemoryCache.clear();
  trongridAccountMemoryCache.clear();
  accountResourcesMemoryCache.clear();
  tronscanTokenOverviewMemoryCache.clear();
  customTokenListMemoryCache = null;
  customTokenListInflight = null;
  warnedTrongridEventsRateLimit = false;
  warnedTrongridInternalRateLimit = false;
  trongridEventsCooldownUntil = 0;
  trongridInternalCooldownUntil = 0;
  trongridTransactionEventsMemoryCache.clear();
  trongridInternalTransactionsMemoryCache.clear();

  accountInfoInflight.clear();
  accountTrc20AssetsInflight.clear();
  walletSnapshotInflight.clear();
  trongridAccountInflight.clear();
  accountResourcesInflight.clear();
  tronscanTokenOverviewInflight.clear();
  trongridTransactionEventsInflight.clear();
  trongridInternalTransactionsInflight.clear();

  customTokenCatalogMemoryCache.clear();
  customTokenCatalogInflight.clear();
  const keysToRemove: string[] = [];

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    for (const key of allKeys) {
      if (
        key.startsWith(TOKEN_HISTORY_CACHE_PREFIX_ROOT) ||
        key.startsWith(WALLET_HISTORY_CACHE_PREFIX_ROOT) ||
        key.startsWith(ACCOUNT_INFO_CACHE_STORAGE_KEY_PREFIX_ROOT) ||
        key.startsWith(ACCOUNT_TRC20_ASSETS_CACHE_STORAGE_KEY_PREFIX_ROOT) ||
        key.startsWith(WALLET_SNAPSHOT_CACHE_STORAGE_KEY_PREFIX_ROOT) ||
        key.startsWith(TRONGRID_ACCOUNT_CACHE_STORAGE_KEY_PREFIX_ROOT) ||
        key.startsWith(ACCOUNT_RESOURCES_CACHE_STORAGE_KEY_PREFIX_ROOT) ||
        key.startsWith(CUSTOM_TOKEN_LIST_CACHE_KEY) ||
        key === CUSTOM_TOKEN_LIST_CACHE_KEY ||
        key.startsWith(MARKET_CACHE_STORAGE_KEY_ROOT)
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
