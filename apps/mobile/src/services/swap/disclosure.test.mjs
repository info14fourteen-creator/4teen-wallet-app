import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUNIO_SMART_ROUTER_ADDRESS,
  buildSunioRouterExplorerUrl,
  getSunioSwapDisclosure,
} from './disclosure.ts';

test('describes SUN.io as the provider without assigning custody to 4TEEN', () => {
  const disclosure = getSunioSwapDisclosure();

  assert.deepEqual(disclosure, {
    providerName: 'SUN.io',
    providerRoleKey: 'SUN.io is an independent third-party decentralized protocol.',
    custodyKey:
      '4TEEN does not operate SUN.io, act as your counterparty, or take custody of your assets.',
    signatureKey: 'You review and sign every blockchain transaction with your own wallet.',
    routerAddress: 'TJ4NNy8xZEqsowCBhLvZ45LCqPdGjkET5j',
    routerExplorerUrl:
      'https://tronscan.org/#/contract/TJ4NNy8xZEqsowCBhLvZ45LCqPdGjkET5j/code',
  });
});

test('links the published SUN.io router address to Tronscan', () => {
  assert.equal(SUNIO_SMART_ROUTER_ADDRESS, 'TJ4NNy8xZEqsowCBhLvZ45LCqPdGjkET5j');
  assert.equal(
    buildSunioRouterExplorerUrl(),
    'https://tronscan.org/#/contract/TJ4NNy8xZEqsowCBhLvZ45LCqPdGjkET5j/code'
  );
});
