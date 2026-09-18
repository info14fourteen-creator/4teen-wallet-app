import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterNativeExchangeEntries,
  getCoreWalletUtilityAction,
  getWalletOverviewAction,
  getWalletGrowthAction,
  isDirectBuyEnabled,
  isNativeSwapEnabled,
} from './native-swap-access.ts';

const SEARCH_FIXTURE = [
  { id: 'route-swap', route: '/swap' },
  { id: 'route-browser', route: '/browser' },
  { id: 'route-buy-4teen', route: '/buy' },
  { id: 'route-earn', route: '/earn' },
  { id: 'route-unlock-timeline', route: '/unlock-timeline' },
  { id: 'route-liquidity-controller', route: '/liquidity-controller' },
  { id: 'route-ambassador-program', route: '/ambassador-program' },
  { id: 'route-airdrop', route: '/airdrop' },
  { id: 'route-wallets', route: '/wallet-manager' },
];

test('shows iOS swap availability without enabling exchange execution', () => {
  assert.equal(isNativeSwapEnabled('ios'), false);
  assert.deepEqual(getCoreWalletUtilityAction('ios'), {
    kind: 'swap-unavailable',
    route: '/swap',
    labelKey: 'SWAP',
  });
});

test('keeps the existing native swap footer action on Android', () => {
  assert.equal(isNativeSwapEnabled('android'), true);
  assert.deepEqual(getCoreWalletUtilityAction('android'), {
    kind: 'swap',
    route: '/swap',
    labelKey: 'SWAP',
  });
});

test('removes exchange and token-purchase routes from the iOS search surface', () => {
  const iosRoutes = filterNativeExchangeEntries(SEARCH_FIXTURE, 'ios');

  assert.equal(iosRoutes.some((item) => item.route === '/swap'), false);
  assert.equal(iosRoutes.some((item) => item.route === '/buy'), false);
  assert.equal(iosRoutes.some((item) => item.route === '/earn'), true);
  assert.equal(iosRoutes.some((item) => item.route === '/unlock-timeline'), true);
  assert.equal(iosRoutes.some((item) => item.route === '/liquidity-controller'), true);
  assert.equal(iosRoutes.some((item) => item.route === '/ambassador-program'), true);
  assert.equal(iosRoutes.some((item) => item.route === '/airdrop'), true);
  assert.equal(iosRoutes.some((item) => item.route === '/browser'), true);
  assert.equal(iosRoutes.some((item) => item.route === '/wallet-manager'), true);
});

test('keeps native exchange and protocol routes in Android search', () => {
  const androidRoutes = filterNativeExchangeEntries(SEARCH_FIXTURE, 'android');

  assert.equal(androidRoutes.some((item) => item.route === '/swap'), true);
  assert.equal(androidRoutes.some((item) => item.route === '/buy'), true);
  assert.equal(androidRoutes.some((item) => item.route === '/liquidity-controller'), true);
});

test('opens the read-only cabinet from iOS growth without enabling purchases', () => {
  assert.equal(isDirectBuyEnabled('ios'), false);
  assert.deepEqual(getWalletGrowthAction('ios'), {
    kind: 'overview',
    route: '/ambassador-program',
    labelKey: 'EARN',
  });
});

test('keeps direct buy as the Android growth action', () => {
  assert.equal(isDirectBuyEnabled('android'), true);
  assert.deepEqual(getWalletGrowthAction('android'), {
    kind: 'direct-buy',
    route: '/buy',
    labelKey: 'EARN',
  });
});

test('opens the read-only protocol overview from the iOS home footer', () => {
  assert.deepEqual(getWalletOverviewAction('ios'), {
    kind: 'protocol',
    route: '/unlock-timeline',
    labelKey: 'HOME',
  });
});

test('unknown platforms never expose ecosystem transaction entry points', () => {
  for (const platform of ['web', 'windows', '']) {
    assert.equal(isNativeSwapEnabled(platform), false);
    assert.equal(isDirectBuyEnabled(platform), false);
    assert.equal(getWalletGrowthAction(platform).route, '/manage-crypto');
  }
});

test('keeps the existing Android ecosystem home action', () => {
  assert.deepEqual(getWalletOverviewAction('android'), {
    kind: 'protocol',
    route: '/unlock-timeline',
    labelKey: 'HOME',
  });
});
