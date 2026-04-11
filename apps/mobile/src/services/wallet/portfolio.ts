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
    name: asset.tokenAbbr || asset.tokenName || 'TOKEN',
    symbol: asset.tokenAbbr || asset.tokenName || 'T',
    amount,
    amountDisplay: asset.balanceFormatted,
    valueInUsd,
    priceChange24h: asset.priceChange24h,
    logo: asset.tokenLogo,
  });
}

export async function getWalletPortfolio(address: string): Promise<WalletPortfolioSnapshot> {
  const snapshot = await getWalletSnapshot(address);

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

export async function getAllWalletPortfolios(): Promise<WalletPortfolioAggregate> {
  const wallets = await listWallets();

  const items = await Promise.all(
    wallets.map(async (wallet): Promise<WalletPortfolioListItem> => {
      const includedInTotal = wallet.kind !== 'watch-only';

      try {
        const portfolio = await getWalletPortfolio(wallet.address);

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
