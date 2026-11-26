import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, deps, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, require: name => { assert.ok(deps[name], name); return deps[name]; },
    URL, console, setTimeout: callback => { callback(); return 0; }, ...globals,
  });
  return module.exports;
}

const quote = { purpose: 'send_transfer', mode: 'tronix', wallet: 'wallet', orderId: 'order-1',
  paymentAddress: 'broker', amountTrx: '2', amountSun: '2000000', requiredEnergy: 60000, requiredBandwidth: 300 };
function harness() {
  const values = new Map();
  const state = { broadcasts: 0, finalBroadcasts: 0, delivered: false, failure: null, ready: true, bandwidth: 300, confirms: [], statusReads: 0 };
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
  function restart() {
    const recorded = load('./wallet/recorded-transfer.ts', { '../../privacy/async-storage': storage });
    const sender = {
      estimateAssetTransfer: async () => ({ wallet: { address: 'wallet' }, token: { isNative: false }, trxCoverage: { trxBalanceRaw: '100000000', requiredTrxSun: 2000000 }, resources: {
        energyShortfall: state.delivered ? 0 : 60000, bandwidthShortfall: state.delivered ? 0 : 300,
      } }),
      sendAssetTransfer: async input => {
        assert.equal(input.expectedWalletAddress, 'wallet');
        const payment = input.tokenId === 'trx';
        await input.beforeBroadcast((payment ? 'a' : 'b').repeat(64));
        if (payment) state.broadcasts++; else state.finalBroadcasts++;
        if ((payment && state.failure === 'broadcast') || (!payment && state.failure === 'final')) throw new Error('Lost broadcast response');
        return { txId: (payment ? 'a' : 'b').repeat(64) };
      },
      waitForTransferConfirmation: async txId => ({ txId }),
    };
    const rental = load('./energy-resale.ts', {
      '../privacy/async-storage': storage,
      '../config/tron': { FOURTEEN_API_BASE_URL: 'https://test.invalid', getFourteenApiBaseUrls: () => ['https://test.invalid'] },
      '../i18n': { translateNow: text => text },
      './tron/api': { TRX_TOKEN_ID: 'trx' },
      './wallet/recorded-transfer': recorded,
      './wallet/send': sender,
    }, {
      fetch: async (url, options) => {
        if (url.includes('/confirm')) {
          state.confirms.push(JSON.parse(options.body));
          if (state.failure === 'confirm') throw new Error('API unavailable');
          return { ok: true, status: 202, json: async () => ({ ok: true, result: { status: 'processing_tronix' } }) };
        }
        assert.ok(url.includes('/status'));
        state.statusReads++;
        state.delivered = state.ready && state.bandwidth >= 300;
        return { ok: true, status: 200, json: async () => ({ ok: true, result: {
          ready: state.ready, energyState: { availableEnergy: 60000, availableBandwidth: state.bandwidth },
          lastOrder: { status: state.ready ? 'completed' : 'processing_tronix' },
        } }) };
      },
    });
    const coordinator = load('./wallet/resource-transfer.ts', {
      './transfer-fee': load('./wallet/transfer-fee.ts', {}),
      './recorded-transfer': recorded, './send': sender, '../energy-resale': rental,
      '../tron/api': { TRX_TOKEN_ID: 'trx', clearWalletRuntimeCaches() {} },
    });
    return { ...rental, ...coordinator };
  }
  return { state, restart, input: { purpose: 'send_transfer', wallet: 'wallet', quote } };
}

test('HTTP 202 with ok:true waits for actual delivery of both resources', async () => {
  const h = harness();
  h.state.bandwidth = 0;
  await assert.rejects(h.restart().rentEnergyForPurpose(h.input));
  assert.equal(h.state.broadcasts, 1);
  assert.equal(h.state.statusReads, 20);
  h.state.bandwidth = 300;
  await h.restart().rentEnergyForPurpose(h.input);
  assert.equal(h.state.broadcasts, 1);
});
for (const failure of ['broadcast', 'confirm']) {
  test(`${failure} failure and new quote after restart reuse the paid order`, async () => {
    const h = harness();
    h.state.failure = failure;
    await assert.rejects(h.restart().rentEnergyForPurpose(h.input));
    h.state.failure = null;
    await h.restart().rentEnergyForPurpose({ ...h.input, quote: { ...quote, orderId: 'new-order', amountTrx: '5' } });
    assert.equal(h.state.broadcasts, 1);
    assert.equal(h.state.confirms.at(-1).rentalOrderId, 'order-1');
    assert.equal(h.state.confirms.at(-1).paymentTxId, 'a'.repeat(64));
  });
}
test('concurrent rental calls pay once', async () => {
  const h = harness();
  const api = h.restart();
  await Promise.all([api.rentEnergyForPurpose(h.input), api.rentEnergyForPurpose(h.input)]);
  assert.equal(h.state.broadcasts, 1);
});
test('wrong wallet, legacy provider and expired quote reject before payment', async () => {
  for (const patch of [{ wallet: 'other' }, { mode: 'api' }, { expiresAt: '2000-01-01T00:00:00Z' }]) {
    const h = harness();
    await assert.rejects(h.restart().rentEnergyForPurpose({ ...h.input, quote: { ...quote, ...patch } }));
    assert.equal(h.state.broadcasts, 0);
  }
});

test('full transfer workflow survives delivery timeout and final broadcast response loss with one payment and one transfer', async () => {
  const h = harness();
  const input = { wallet: 'wallet', tokenId: 'usdt', toAddress: 'recipient', amount: '1', quote };
  h.state.ready = false;
  await assert.rejects(h.restart().sendWithResources(input));
  assert.equal(h.state.broadcasts, 1);
  assert.equal(h.state.finalBroadcasts, 0);
  h.state.ready = true;
  h.state.failure = 'final';
  await assert.rejects(h.restart().sendWithResources(input), /Lost broadcast/);
  h.state.failure = null;
  const result = await h.restart().sendWithResources(input);
  assert.equal(result.txId, 'b'.repeat(64));
  assert.equal(h.state.broadcasts, 1);
  assert.equal(h.state.finalBroadcasts, 1);
});
