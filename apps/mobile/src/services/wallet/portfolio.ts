import AsyncStorage from '@react-native-async-storage/async-storage';

import { listWallets, type WalletMeta } from './storage';
import { getDisplayCurrency, type DisplayCurrencyCode } from '../../settings/display-currency';
import { getWalletSnapshot, type Trc20Asset } from '../tron';
import {
  formatAdaptiveDisplayCurrency,
  formatAdaptiveSignedDisplayCurrency,
} from '../../ui/currency-format';

export type PortfolioAsset = {
  id: string;
  name: string;
  symbol: string;
  amountDisplay: string;
  valueDisplay: string;
  deltaDisplay: string;
  deltaTone: 'green' | 'red' | 'dim';
  logo?: string;
  amount: number;
  valueInUsd: number;
  priceChange24h?: number;
  deltaUsd24h: number;
};

export type WalletPortfolioSnapshot = {
  address: string;
  totalBalanceUsd: number;
  totalBalanceDisplay: string;
  totalDeltaUsd24h: number;
  totalDeltaPercent24h: number;
  totalDeltaDisplay: string;
  totalDeltaTone: 'green' | 'red' | 'dim';
  assets: PortfolioAsset[];
};

export type WalletPortfolioListItem = {
  wallet: WalletMeta;
  portfolio: WalletPortfolioSnapshot | null;
  includedInTotal: boolean;
};

export type WalletPortfolioAggregate = {
  items: WalletPortfolioListItem[];
  totalBalanceUsd: number;
  totalBalanceDisplay: string;
  totalDeltaUsd24h: number;
  totalDeltaPercent24h: number;
  totalDeltaDisplay: string;
  totalDeltaTone: 'green' | 'red' | 'dim';
};

type PortfolioCachePayload = {
  savedAt: number;
  marketVersion?: string;
  snapshot: WalletPortfolioSnapshot;
};

const PORTFOLIO_CACHE_PREFIX = 'fourteen_wallet_portfolio_cache_v3';
const PORTFOLIO_CACHE_PREFIX_ROOT = 'fourteen_wallet_portfolio_cache_';
const PORTFOLIO_CACHE_TTL_MS = 2 * 60 * 1000;
const PORTFOLIO_MARKET_VERSION = 'cmc-pool-v1';

const portfolioMemoryCache = new Map<string, PortfolioCachePayload>();
const portfolioInflight = new Map<string, Promise<WalletPortfolioSnapshot>>();

function formatSignedPercent(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.0000001) {
    return '0.00%';
  }

  const sign = value > 0 ? '+' : '-';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function formatAssetPercent(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function normalizeDeltaTone(value?: number): 'green' | 'red' | 'dim' {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'dim';
  if (value > 0) return 'green';
  if (value < 0) return 'red';
  return 'dim';
}

function normalizeAssetAmount(balance: string, decimals: number) {
  const raw = Number(balance);
  if (!Number.isFinite(raw)) return 0;
  return raw / Math.pow(10, decimals);
}

function buildAsset(input: {
  id: string;
  name: string;
  symbol: string;
  amount: number;
  amountDisplay: string;
  valueInUsd: number;
  priceChange24h?: number;
  logo?: string;
  currency: DisplayCurrencyCode;
}): PortfolioAsset {
  const safeValueInUsd = Number.isFinite(input.valueInUsd) ? input.valueInUsd : 0;
  const safePriceChange =
    typeof input.priceChange24h === 'number' && Number.isFinite(input.priceChange24h)
      ? input.priceChange24h
      : undefined;

  const deltaUsd24h =
    typeof safePriceChange === 'number'
      ? safeValueInUsd * (safePriceChange / 100)
      : 0;

  return {
    id: input.id,
    name: input.name,
    symbol: input.symbol,
    amountDisplay: input.amountDisplay,
    valueDisplay: formatAdaptiveDisplayCurrency(safeValueInUsd, { currency: input.currency }),
    deltaDisplay: formatAssetPercent(safePriceChange),
    deltaTone: normalizeDeltaTone(safePriceChange),
    logo: input.logo,
    amount: input.amount,
    valueInUsd: safeValueInUsd,
    priceChange24h: safePriceChange,
    deltaUsd24h,
  };
}

function buildTrxAsset(
  snapshot: Awaited<ReturnType<typeof getWalletSnapshot>>,
  currency: DisplayCurrencyCode
): PortfolioAsset {
  return buildAsset({
    id: 'trx',
    name: 'TRX',
    symbol: 'TRX',
    amount: snapshot.trx.balanceTrx,
    amountDisplay: snapshot.trx.balanceTrx.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    }),
    valueInUsd: snapshot.trx.valueInUsd || 0,
    priceChange24h: snapshot.trx.priceChange24h,
    logo: snapshot.trx.logo,
    currency,
  });
}

function buildTokenAsset(asset: Trc20Asset, currency: DisplayCurrencyCode): PortfolioAsset {
  const amount = normalizeAssetAmount(asset.balance, asset.tokenDecimal);
  const valueInUsd =
    typeof asset.valueInUsd === 'number' && Number.isFinite(asset.valueInUsd)
      ? asset.valueInUsd
      : typeof asset.priceInUsd === 'number' && Number.isFinite(asset.priceInUsd)
        ? amount * asset.priceInUsd
        : 0;

  return buildAsset({
    id: asset.tokenId,
    name: asset.tokenName || asset.tokenAbbr || 'TOKEN',
    symbol: asset.tokenAbbr || asset.tokenName || 'T',
    amount,
    amountDisplay: asset.balanceFormatted,
    valueInUsd,
    priceChange24h: asset.priceChange24h,
    logo: asset.tokenLogo,
    currency,
  });
}

function buildPortfolioCacheKey(address: string) {
  return `${PORTFOLIO_CACHE_PREFIX}:${address.trim().toLowerCase()}`;
}

async function readPortfolioCache(
  address: string,
  options?: { allowStale?: boolean }
): Promise<WalletPortfolioSnapshot | null> {
  const cacheKey = buildPortfolioCacheKey(address);
  const now = Date.now();

  const memory = portfolioMemoryCache.get(cacheKey);
  if (memory && (options?.allowStale || now - memory.savedAt < PORTFOLIO_CACHE_TTL_MS)) {
    return memory.snapshot;
  }

  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PortfolioCachePayload;

    if (
      !parsed ||
      typeof parsed.savedAt !== 'number' ||
      parsed.marketVersion !== PORTFOLIO_MARKET_VERSION ||
      !parsed.snapshot ||
      typeof parsed.snapshot.address !== 'string' ||
      !Array.isArray(parsed.snapshot.assets)
    ) {
      return null;
    }

    if (!options?.allowStale && now - parsed.savedAt >= PORTFOLIO_CACHE_TTL_MS) {
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    portfolioMemoryCache.set(cacheKey, parsed);
    return parsed.snapshot;
  } catch (error) {
    console.error('Failed to read wallet portfolio cache:', error);
    return null;
  }
}

async function writePortfolioCache(
  address: string,
  snapshot: WalletPortfolioSnapshot
): Promise<void> {
  const cacheKey = buildPortfolioCacheKey(address);
  const payload: PortfolioCachePayload = {
    savedAt: Date.now(),
    marketVersion: PORTFOLIO_MARKET_VERSION,
    snapshot,
  };

  portfolioMemoryCache.set(cacheKey, payload);

  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to write wallet portfolio cache:', error);
  }
}

function formatAssetAmountDisplay(amount: number, decimals = 6) {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const maxFractionDigits = Math.max(0, Math.min(6, decimals));

  return safeAmount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

async function rebuildPortfolioSnapshot(
  address: string,
  assets: PortfolioAsset[]
): Promise<WalletPortfolioSnapshot> {
  const currency = await getDisplayCurrency();
  const normalizedAssets = assets.map((asset) => ({
    ...asset,
    amount: Number.isFinite(asset.amount) ? Math.max(0, asset.amount) : 0,
    amountDisplay: formatAssetAmountDisplay(asset.amount, asset.id === 'trx' ? 6 : 6),
    valueInUsd: Number.isFinite(asset.valueInUsd) ? Math.max(0, asset.valueInUsd) : 0,
    valueDisplay: formatAdaptiveDisplayCurrency(
      Number.isFinite(asset.valueInUsd) ? Math.max(0, asset.valueInUsd) : 0,
      { currency }
    ),
    deltaUsd24h: Number.isFinite(asset.deltaUsd24h) ? asset.deltaUsd24h : 0,
  }));

  const totalBalanceUsd = normalizedAssets.reduce((sum, asset) => sum + asset.valueInUsd, 0);
  const totalDeltaUsd24h = normalizedAssets.reduce((sum, asset) => sum + asset.deltaUsd24h, 0);
  const previousTotalUsd = totalBalanceUsd - totalDeltaUsd24h;
  const totalDeltaPercent24h =
    previousTotalUsd > 0 ? (totalDeltaUsd24h / previousTotalUsd) * 100 : 0;

  return {
    address,
    totalBalanceUsd,
    totalBalanceDisplay: formatAdaptiveDisplayCurrency(totalBalanceUsd, { currency }),
    totalDeltaUsd24h,
    totalDeltaPercent24h,
    totalDeltaDisplay: `${formatAdaptiveSignedDisplayCurrency(totalDeltaUsd24h, currency)} (${formatSignedPercent(totalDeltaPercent24h)})`,
    totalDeltaTone: normalizeDeltaTone(totalDeltaPercent24h),
    assets: normalizedAssets,
  };
}

export async function getCachedWalletPortfolio(
  address: string,
  options?: { allowStale?: boolean }
): Promise<WalletPortfolioSnapshot | null> {
  const normalizedAddress = address.trim();
  if (!normalizedAddress) return null;

  return readPortfolioCache(normalizedAddress, options);
}

export async function clearWalletPortfolioCache(address: string): Promise<void> {
  const cacheKey = buildPortfolioCacheKey(address);
  portfolioMemoryCache.delete(cacheKey);

  try {
    await AsyncStorage.removeItem(cacheKey);
  } catch (error) {
    console.error('Failed to clear wallet portfolio cache:', error);
  }
}

export async function applyOutgoingTransferToPortfolioCache(input: {
  walletAddress: string;
  tokenId: string;
  tokenDecimals: number;
  amountRaw: string;
  estimatedBurnSun: number;
}): Promise<void> {
  const walletAddress = String(input.walletAddress || '').trim();
  if (!walletAddress) return;

  const current = await readPortfolioCache(walletAddress);
  if (!current) return;

  const tokenAmount =
    Number(String(input.amountRaw || '0')) / Math.pow(10, Math.max(0, input.tokenDecimals));
  const burnTrx = Math.max(0, Number(input.estimatedBurnSun || 0)) / 1_000_000;

  const nextAssets = current.assets.map((asset) => {
    const previousAmount = Number.isFinite(asset.amount) ? Math.max(0, asset.amount) : 0;
    const unitPrice =
      previousAmount > 0 && Number.isFinite(asset.valueInUsd) ? asset.valueInUsd / previousAmount : 0;
    const unitDeltaUsd24h =
      previousAmount > 0 && Number.isFinite(asset.deltaUsd24h) ? asset.deltaUsd24h / previousAmount : 0;

    if (asset.id === 'trx') {
      const trxDelta = input.tokenId === 'trx' ? tokenAmount + burnTrx : burnTrx;
      const nextAmount = Math.max(0, asset.amount - trxDelta);
      return {
        ...asset,
        amount: nextAmount,
        valueInUsd: nextAmount * unitPrice,
        deltaUsd24h: nextAmount * unitDeltaUsd24h,
      };
    }

    if (asset.id === input.tokenId) {
      const nextAmount = Math.max(0, asset.amount - tokenAmount);
      return {
        ...asset,
        amount: nextAmount,
        valueInUsd: nextAmount * unitPrice,
        deltaUsd24h: nextAmount * unitDeltaUsd24h,
      };
    }

    return asset;
  });

  const nextSnapshot = await rebuildPortfolioSnapshot(walletAddress, nextAssets);
  await writePortfolioCache(walletAddress, nextSnapshot);
}

async function buildPortfolioSnapshot(
  snapshot: Awaited<ReturnType<typeof getWalletSnapshot>>
): Promise<WalletPortfolioSnapshot> {
  const currency = await getDisplayCurrency();
  const assets = [
    buildTrxAsset(snapshot, currency),
    ...snapshot.trc20Assets.map((asset) => buildTokenAsset(asset, currency)),
  ];

  const totalBalanceUsd = assets.reduce((sum, asset) => sum + asset.valueInUsd, 0);
  const totalDeltaUsd24h = assets.reduce((sum, asset) => sum + asset.deltaUsd24h, 0);

  const previousTotalUsd = totalBalanceUsd - totalDeltaUsd24h;
  const totalDeltaPercent24h =
    previousTotalUsd > 0 ? (totalDeltaUsd24h / previousTotalUsd) * 100 : 0;

  return {
    address: snapshot.address,
    totalBalanceUsd,
    totalBalanceDisplay: formatAdaptiveDisplayCurrency(totalBalanceUsd, { currency }),
    totalDeltaUsd24h,
    totalDeltaPercent24h,
    totalDeltaDisplay: `${formatAdaptiveSignedDisplayCurrency(totalDeltaUsd24h, currency)} (${formatSignedPercent(totalDeltaPercent24h)})`,
    totalDeltaTone: normalizeDeltaTone(totalDeltaPercent24h),
    assets,
  };
}


export async function clearAllWalletPortfolioCaches(): Promise<void> {
  portfolioMemoryCache.clear();
  portfolioInflight.clear();

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter((key) => key.startsWith(PORTFOLIO_CACHE_PREFIX_ROOT));

    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch (error) {
    console.error('Failed to clear wallet portfolio caches:', error);
    throw error;
  }
}

export async function getWalletPortfolio(
  address: string,
  options?: { force?: boolean }
): Promise<WalletPortfolioSnapshot> {
  const normalizedAddress = address.trim();
  const force = Boolean(options?.force);

  if (!force) {
    const cached = await readPortfolioCache(normalizedAddress);
    if (cached) {
      return cached;
    }
  }

  const inflightKey = `${normalizedAddress.toLowerCase()}:${force ? 'force' : 'normal'}`;
  const existingInflight = portfolioInflight.get(inflightKey);
  if (existingInflight) {
    return existingInflight;
  }

  const request = (async () => {
    try {
      const snapshot = await getWalletSnapshot(normalizedAddress, options);
      const portfolio = await buildPortfolioSnapshot(snapshot);
      await writePortfolioCache(normalizedAddress, portfolio);
      return portfolio;
    } catch (error) {
      const stale = await readPortfolioCache(normalizedAddress, { allowStale: true });

      if (stale) {
        console.warn('Using stale wallet portfolio cache:', normalizedAddress, error);
        return stale;
      }

      throw error;
    }
  })();

  portfolioInflight.set(inflightKey, request);

  try {
    return await request;
  } finally {
    portfolioInflight.delete(inflightKey);
  }
}

export async function getAllWalletPortfolios(
  options?: { force?: boolean }
): Promise<WalletPortfolioAggregate> {
  const currency = await getDisplayCurrency();
  const wallets = await listWallets();
  const items: WalletPortfolioListItem[] = [];

  for (const wallet of wallets) {
    const includedInTotal = wallet.kind !== 'watch-only';

    try {
      const portfolio = await getWalletPortfolio(wallet.address, options);

      items.push({
        wallet,
        portfolio,
        includedInTotal,
      });
    } catch (error) {
      console.error('Failed to load wallet portfolio:', wallet.address, error);

      items.push({
        wallet,
        portfolio: null,
        includedInTotal,
      });
    }
  }

  const totalBalanceUsd = items.reduce((sum, item) => {
    if (!item.includedInTotal || !item.portfolio) return sum;
    return sum + item.portfolio.totalBalanceUsd;
  }, 0);

  const totalDeltaUsd24h = items.reduce((sum, item) => {
    if (!item.includedInTotal || !item.portfolio) return sum;
    return sum + item.portfolio.totalDeltaUsd24h;
  }, 0);

  const previousTotalUsd = totalBalanceUsd - totalDeltaUsd24h;
  const totalDeltaPercent24h =
    previousTotalUsd > 0 ? (totalDeltaUsd24h / previousTotalUsd) * 100 : 0;

  return {
    items,
    totalBalanceUsd,
    totalBalanceDisplay: formatAdaptiveDisplayCurrency(totalBalanceUsd, { currency }),
    totalDeltaUsd24h,
    totalDeltaPercent24h,
    totalDeltaDisplay: `${formatAdaptiveSignedDisplayCurrency(totalDeltaUsd24h, currency)} (${formatSignedPercent(totalDeltaPercent24h)})`,
    totalDeltaTone: normalizeDeltaTone(totalDeltaPercent24h),
  };
}
