import AsyncStorage from '@react-native-async-storage/async-storage';

import { listWallets, type WalletMeta } from './storage';
import { getWalletSnapshot, type Trc20Asset } from '../tron';

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
  snapshot: WalletPortfolioSnapshot;
};

const PORTFOLIO_CACHE_PREFIX = 'fourteen_wallet_portfolio_cache_v1';
const PORTFOLIO_CACHE_TTL_MS = 2 * 60 * 1000;

const portfolioMemoryCache = new Map<string, PortfolioCachePayload>();
const portfolioInflight = new Map<string, Promise<WalletPortfolioSnapshot>>();

function formatUsd(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function formatSignedUsd(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.0000001) {
    return '$0.00';
  }

  const sign = value > 0 ? '+' : '-';
  return `${sign}${formatUsd(Math.abs(value))}`;
}

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
    valueDisplay: formatUsd(safeValueInUsd),
    deltaDisplay: formatAssetPercent(safePriceChange),
    deltaTone: normalizeDeltaTone(safePriceChange),
    logo: input.logo,
    amount: input.amount,
    valueInUsd: safeValueInUsd,
    priceChange24h: safePriceChange,
    deltaUsd24h,
  };
}

function buildTrxAsset(snapshot: Awaited<ReturnType<typeof getWalletSnapshot>>): PortfolioAsset {
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
  });
}

function buildTokenAsset(asset: Trc20Asset): PortfolioAsset {
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
  });
}

function buildPortfolioCacheKey(address: string) {
  return `${PORTFOLIO_CACHE_PREFIX}:${address.trim().toLowerCase()}`;
}

async function readPortfolioCache(address: string): Promise<WalletPortfolioSnapshot | null> {
  const cacheKey = buildPortfolioCacheKey(address);
  const now = Date.now();

  const memory = portfolioMemoryCache.get(cacheKey);
  if (memory && now - memory.savedAt < PORTFOLIO_CACHE_TTL_MS) {
    return memory.snapshot;
  }

  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PortfolioCachePayload;

    if (
      !parsed ||
      typeof parsed.savedAt !== 'number' ||
      !parsed.snapshot ||
      typeof parsed.snapshot.address !== 'string' ||
      !Array.isArray(parsed.snapshot.assets)
    ) {
      return null;
    }

    if (now - parsed.savedAt >= PORTFOLIO_CACHE_TTL_MS) {
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
    snapshot,
  };

  portfolioMemoryCache.set(cacheKey, payload);

  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to write wallet portfolio cache:', error);
  }
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

function buildPortfolioSnapshot(
  snapshot: Awaited<ReturnType<typeof getWalletSnapshot>>
): WalletPortfolioSnapshot {
  const assets = [
    buildTrxAsset(snapshot),
    ...snapshot.trc20Assets.map(buildTokenAsset),
  ];

  const totalBalanceUsd = assets.reduce((sum, asset) => sum + asset.valueInUsd, 0);
  const totalDeltaUsd24h = assets.reduce((sum, asset) => sum + asset.deltaUsd24h, 0);

  const previousTotalUsd = totalBalanceUsd - totalDeltaUsd24h;
  const totalDeltaPercent24h =
    previousTotalUsd > 0 ? (totalDeltaUsd24h / previousTotalUsd) * 100 : 0;

  return {
    address: snapshot.address,
    totalBalanceUsd,
    totalBalanceDisplay: formatUsd(totalBalanceUsd),
    totalDeltaUsd24h,
    totalDeltaPercent24h,
    totalDeltaDisplay: `${formatSignedUsd(totalDeltaUsd24h)} (${formatSignedPercent(totalDeltaPercent24h)})`,
    totalDeltaTone: normalizeDeltaTone(totalDeltaPercent24h),
    assets,
  };
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
    const snapshot = await getWalletSnapshot(normalizedAddress, options);
    const portfolio = buildPortfolioSnapshot(snapshot);
    await writePortfolioCache(normalizedAddress, portfolio);
    return portfolio;
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
  const wallets = await listWallets();

  const items = await Promise.all(
    wallets.map(async (wallet): Promise<WalletPortfolioListItem> => {
      const includedInTotal = wallet.kind !== 'watch-only';

      try {
        const portfolio = await getWalletPortfolio(wallet.address, options);

        return {
          wallet,
          portfolio,
          includedInTotal,
        };
      } catch (error) {
        console.error('Failed to load wallet portfolio:', wallet.address, error);

        return {
          wallet,
          portfolio: null,
          includedInTotal,
        };
      }
    })
  );

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
    totalBalanceDisplay: formatUsd(totalBalanceUsd),
    totalDeltaUsd24h,
    totalDeltaPercent24h,
    totalDeltaDisplay: `${formatSignedUsd(totalDeltaUsd24h)} (${formatSignedPercent(totalDeltaPercent24h)})`,
    totalDeltaTone: normalizeDeltaTone(totalDeltaPercent24h),
  };
}
