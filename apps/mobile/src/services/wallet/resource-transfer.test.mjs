import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function scenario({ shortage = true, quote = true, delivered = true, native = false, balance = '10000000', approvedFeeSun, allowBurnFallback = false, pending = null } = {}) {
  const events = [];
  let rented = false;
  const estimate = () => ({
    wallet: { address: 'wallet-A' }, token: { isNative: native, amountRaw: '9000000' },
    trxCoverage: { trxBalanceRaw: balance, requiredTrxSun: 2000000 },
    resources: { energyShortfall: shortage && !rented ? 60000 : 0, bandwidthShortfall: 0, estimatedBurnSun: 2000000 },
  });
  const deps = {
    './transfer-fee': { calculateTransferFeeSun: (_burn, quote, paymentBurn) => Number(quote.amountSun) + paymentBurn },
    './recorded-transfer': { runRecordedTransfer: async input => {
      await input.send(async () => events.push('persist-final'));
      return input.confirm('final-hash');
    } },
    './send': {
      estimateAssetTransfer: async () => estimate(),
      sendAssetTransfer: async input => { assert.equal(input.requireResources, !native && !(allowBurnFallback && !quote && !pending)); if (!input.requireResources) assert.equal(input.maxNetworkFeeSun, approvedFeeSun); await input.beforeBroadcast('final-hash'); events.push('send'); },
      waitForTransferConfirmation: async txId => { events.push('confirmed'); return { txId }; },
    },
    '../tron/api': { TRX_TOKEN_ID: 'trx', clearWalletRuntimeCaches() {} },
    '../energy-resale': {
      getPendingEnergyRentalQuote: async () => pending,
      rentEnergyForPurpose: async () => { events.push('rent'); if (!delivered) throw new Error('Delivery pending'); rented = true; },
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('./resource-transfer.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { assert.ok(deps[name], name); return deps[name]; } });
  return { events, run: () => module.exports.sendWithResources({
    wallet: 'wallet-A', tokenId: 'token', toAddress: 'recipient', amount: '1',
    approvedFeeSun, allowBurnFallback,
    quote: quote ? { mode: 'tronix', wallet: 'wallet-A', orderId: 'order', amountSun: '5000000', requiredEnergy: 60000, requiredBandwidth: 0 } : null,
  }) };
}

test('shortage automatically rents, then records and confirms the final transfer', async () => {
  const s = scenario();
  assert.equal((await s.run()).txId, 'final-hash');
  assert.deepEqual(s.events, ['rent', 'persist-final', 'send', 'confirmed']);
});
test('a higher fee cannot be charged under the previous approval', async () => {
  const s = scenario({ approvedFeeSun: 6000000 });
  await assert.rejects(s.run(), /fee changed/);
  assert.deepEqual(s.events, []);
});
test('native TRX transfer bypasses rental even when resources are short', async () => {
  const s = scenario({ native: true });
  await s.run();
  assert.deepEqual(s.events, ['persist-final', 'send', 'confirmed']);
});
test('unavailable rental and pending delivery never broadcast the final transfer', async () => {
  for (const options of [{ quote: false }, { delivered: false }]) {
    const s = scenario(options);
    await assert.rejects(s.run());
    assert.ok(!s.events.includes('send'));
  }
});
test('sufficient own resources skip paid rental', async () => {
  const s = scenario({ shortage: false, quote: false });
  await s.run();
  assert.deepEqual(s.events, ['persist-final', 'send', 'confirmed']);
});

test('explicit burn approval can replace unavailable rental before any payment', async () => {
  const s = scenario({ quote: false, allowBurnFallback: true, approvedFeeSun: 2000000 });
  await s.run();
  assert.deepEqual(s.events, ['persist-final', 'send', 'confirmed']);
});
test('burn fallback rejects missing or insufficient approval', async () => {
  for (const approvedFeeSun of [undefined, 1000000, NaN]) {
    const s = scenario({ quote: false, allowBurnFallback: true, approvedFeeSun });
    await assert.rejects(s.run());
    assert.deepEqual(s.events, []);
  }
});
test('pending rental or delivery failure cannot silently switch to burn', async () => {
  const pending = { mode: 'tronix', orderId: 'paid-order', amountSun: '1000000' };
  const s = scenario({ quote: false, allowBurnFallback: true, approvedFeeSun: 2000000, pending, delivered: false });
  await assert.rejects(s.run(), /Delivery pending/);
  assert.deepEqual(s.events, ['rent']);
});
