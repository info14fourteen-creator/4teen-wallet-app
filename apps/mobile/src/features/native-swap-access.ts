export type CoreWalletUtilityAction = {
  kind: 'swap' | 'swap-info' | 'assets' | 'browser';
  route: '/swap' | '/manage-crypto' | '/browser';
  labelKey: 'SWAP' | 'ASSETS' | 'Browser';
};

export type WalletGrowthAction = {
  kind: 'direct-buy' | 'overview' | 'assets';
  route: '/buy' | '/ambassador-program' | '/manage-crypto';
  labelKey: 'EARN' | 'History' | 'ASSETS';
};

export type WalletGrowthPrimaryAction = {
  kind: 'direct-buy' | 'buy-info' | 'assets';
  route: '/buy' | '/manage-crypto';
  labelKey: 'BUY' | 'ASSETS';
};

export type WalletOverviewAction = {
  kind: 'protocol' | 'wallets';
  route: '/unlock-timeline' | '/wallet-manager';
  labelKey: 'HOME' | 'WALLETS';
};

const IOS_UNAVAILABLE_EXCHANGE_ROUTE_IDS = new Set([
  'route-swap',
  'route-buy-4teen',
  'route-earn',
  'route-unlock-timeline',
  'route-liquidity-controller',
  'route-ambassador-program',
  'route-airdrop',
]);

export function isNativeSwapEnabled(platform: string | undefined = process.env.EXPO_OS) {
  return platform === 'android';
}

export function isDirectBuyEnabled(platform: string | undefined = process.env.EXPO_OS) {
  return platform === 'android';
}

export function isProtocolOverviewEnabled(platform: string | undefined = process.env.EXPO_OS) {
  return platform === 'android' || platform === 'ios';
}

export function getCoreWalletUtilityAction(
  platform: string | undefined = process.env.EXPO_OS
): CoreWalletUtilityAction {
  if (platform === 'ios') {
    return { kind: 'swap-info', route: '/swap', labelKey: 'SWAP' };
  }
  if (isNativeSwapEnabled(platform)) {
    return {
      kind: 'swap',
      route: '/swap',
      labelKey: 'SWAP',
    };
  }

  return {
    kind: 'browser',
    route: '/browser',
    labelKey: 'Browser',
  };
}

export function getWalletGrowthAction(
  platform: string | undefined = process.env.EXPO_OS
): WalletGrowthAction {
  if (platform === 'ios') {
    return { kind: 'overview', route: '/ambassador-program', labelKey: 'History' };
  }
  if (isDirectBuyEnabled(platform)) {
    return {
      kind: 'direct-buy',
      route: '/buy',
      labelKey: 'EARN',
    };
  }

  return {
    kind: 'assets',
    route: '/manage-crypto',
    labelKey: 'ASSETS',
  };
}

export function getWalletOverviewAction(
  platform: string | undefined = process.env.EXPO_OS
): WalletOverviewAction {
  if (isProtocolOverviewEnabled(platform)) {
    return {
      kind: 'protocol',
      route: '/unlock-timeline',
      labelKey: 'HOME',
    };
  }

  return {
    kind: 'wallets',
    route: '/wallet-manager',
    labelKey: 'WALLETS',
  };
}

// Every displayed menu entry must open a supported screen. Do not represent
// an unavailable purchase with a disabled button or a placeholder notice.
export function getWalletGrowthPrimaryAction(
  platform: string | undefined = process.env.EXPO_OS
): WalletGrowthPrimaryAction {
  if (platform === 'ios') return { kind: 'buy-info', route: '/buy', labelKey: 'BUY' };
  return isDirectBuyEnabled(platform)
    ? { kind: 'direct-buy', route: '/buy', labelKey: 'BUY' }
    : { kind: 'assets', route: '/manage-crypto', labelKey: 'ASSETS' };
}

export function filterNativeExchangeEntries<T extends { id: string }>(
  entries: readonly T[],
  platform: string | undefined = process.env.EXPO_OS
): T[] {
  if (platform === 'android') {
    return [...entries];
  }

  if (platform === 'ios') {
    return entries.filter((entry) => entry.id !== 'route-whitepaper');
  }

  return entries.filter((entry) => !IOS_UNAVAILABLE_EXCHANGE_ROUTE_IDS.has(entry.id));
}
