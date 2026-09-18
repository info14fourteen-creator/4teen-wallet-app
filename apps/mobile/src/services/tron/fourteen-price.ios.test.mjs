import test from 'node:test';
import assert from 'node:assert/strict';

import { getFourteenPriceSnapshot } from './fourteen-price.ios.ts';

test('does not request a DEX quote for 4TEEN pricing on iOS', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('network request must not run');
  };

  try {
    await assert.rejects(getFourteenPriceSnapshot(), /unavailable on iOS/i);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
