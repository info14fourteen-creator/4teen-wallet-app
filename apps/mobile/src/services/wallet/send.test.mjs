import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const SENDER = 'TN95o1fsA7mNwJGYGedvf3y7DJZKLH6TCT';
const RECEIVER = 'TSbK3B9cgkVEYtipqZzeE9trChd8QmZkqp';

function load() {
  const state = { broadcasts: 0, resources: { EnergyLimit: 100000, NetLimit: 1000 }, info: {}, saved: false };
  const txId = 'a'.repeat(64);
  class TronWeb {
    static isAddress(value) { return [SENDER, RECEIVER].includes(value); }
    constructor() {
      this.transactionBuilder = {
        sendTrx: async () => ({ txID: txId, raw_data_hex: 'aa'.repeat(200) }),
        triggerSmartContract: async (_address, _method, options) => { state.contractFeeLimit = options.feeLimit; return { transaction: { txID: txId, raw_data_hex: 'aa'.repeat(200) } }; },
        estimateEnergy: async () => { if (state.estimateFails) throw new Error('RPC unavailable'); return { energy_required: 65000 }; },
      };
      this.trx = {
        sign: async tx => ({ ...tx, signature: ['bb'.repeat(65)] }),
        getChainParameters: async () => [], getEnergyPrices: async () => '', getBandwidthPrices: async () => '',
        getAccountResources: async () => state.resources,
        sendRawTransaction: async tx => { assert.equal(state.saved, true); assert.equal(tx.txID, txId); state.broadcasts++; state.info = { id: txId, blockNumber: 42, receipt: { result: 'SUCCESS' } }; return { result: true, txid: txId }; },
        getTransactionInfo: async () => state.info,
      };
    }
  }
  const deps = {
    './contract-operation': { executeContractOperation: async () => { throw new Error('Unexpected contract operation'); } },
    tronweb: { TronWeb },
    '../../config/tron': { buildTrongridHeaders: () => ({}), TRONGRID_BASE_URL: 'unused' },
    '../tron/api': {
      FOURTEEN_CONTRACT: 'fourteen', TRX_TOKEN_ID: 'trx',
      getAccountResources: async () => ({ energyLimit: 100000, energyUsed: 0, bandwidthLimit: 1000, bandwidthUsed: 0 }),
      getTokenDetails: async (_wallet, tokenId) => ({ tokenId, address: tokenId, decimals: 6, balanceRaw: '1000000000', symbol: tokenId }),
    },
    './portfolio': { getWalletPortfolio: async () => ({}) },
    './storage': { getActiveWallet: async () => ({ address: SENDER, id: 'id', kind: 'private-key' }), getWalletSecret: async () => ({ privateKey: '1'.repeat(64) }) },
    './resources': {
      getResourceBurnSun: ({ energyShortfall = 0, bandwidthShortfall = 0 }) => energyShortfall * 420 + bandwidthShortfall * 1000,
      getResourceShortfall: (required, available) => Math.max(0, required - available),
      normalizeResourceAmount: value => Math.max(0, Math.floor(Number(value) || 0)), normalizeSunAmount: value => Math.max(0, Number(value) || 0),
    },
    '../../settings/display-currency': { getDisplayCurrency: async () => 'USD' },
    '../../ui/currency-format': { formatDisplayCurrency: String },
    '../../i18n': { translateNow: text => text },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('./send.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { assert.ok(deps[name], name); return deps[name]; }, setTimeout: fn => fn() });
  return { ...module.exports, state, txId, input: {
    tokenId: 'token', toAddress: RECEIVER, amount: '1', expectedWalletAddress: SENDER, requireResources: true,
    beforeBroadcast: async hash => { assert.equal(hash, txId); state.saved = true; },
  } };
}

test('final contract transfer persists its hash before broadcast', async () => {
  const s = load();
  assert.equal((await s.sendAssetTransfer(s.input)).txId, s.txId);
  assert.equal(s.state.broadcasts, 1);
});
test('payment cannot exceed the approved network fee using a stale resource cache', async () => {
  const s = load();
  s.state.resources = { EnergyLimit: 0, NetLimit: 0 };
  await assert.rejects(s.sendAssetTransfer({ ...s.input, tokenId: 'trx', requireResources: false, maxNetworkFeeSun: 0 }), /fee changed/);
  assert.equal(s.state.broadcasts, 0);
  assert.equal(s.state.saved, false);
});
test('contract burn uses live resources and rejects an insufficient approved fee', async () => {
  const s = load();
  s.state.resources = { EnergyLimit: 0, NetLimit: 0 };
  await assert.rejects(s.sendAssetTransfer({ ...s.input, requireResources: false, maxNetworkFeeSun: 1000000 }), /fee changed/);
  assert.equal(s.state.broadcasts, 0);
});
test('contract burn caps the transaction fee limit with bandwidth reserved', async () => {
  const s = load();
  s.state.resources = { EnergyLimit: 0, NetLimit: 0 };
  await s.sendAssetTransfer({ ...s.input, requireResources: false, maxNetworkFeeSun: 30000000 });
  assert.ok(s.state.contractFeeLimit <= 29000000);
  assert.equal(s.state.broadcasts, 1);
});
test('live resource shortfall overrides a stale sufficient cache and never burns', async () => {
  for (const tokenId of ['token', 'trx']) {
    const s = load();
    s.state.resources = { EnergyLimit: 0, NetLimit: 0 };
    await assert.rejects(s.sendAssetTransfer({ ...s.input, tokenId }), /not ready/);
    assert.equal(s.state.broadcasts, 0);
  }
});
test('unavailable Energy estimation cannot fall back to a guessed amount for guarded sends', async () => {
  const s = load();
  s.state.estimateFails = true;
  await assert.rejects(s.sendAssetTransfer(s.input), /Unable to verify/);
  assert.equal(s.state.broadcasts, 0);
});
test('changed wallet or failed durable write never broadcasts', async () => {
  for (const patch of [{ expectedWalletAddress: 'other' }, { beforeBroadcast: async () => { throw new Error('Disk'); } }]) {
    const s = load();
    await assert.rejects(s.sendAssetTransfer({ ...s.input, ...patch }), /wallet changed|Disk/);
    assert.equal(s.state.broadcasts, 0);
  }
});
test('confirmation accepts a mined success, rejects revert and retains pending uncertainty', async () => {
  const s = load();
  s.state.info = { id: s.txId, blockNumber: 42, receipt: { result: 'SUCCESS' } };
  assert.equal((await s.waitForTransferConfirmation(s.txId)).txId, s.txId);
  s.state.info.receipt.result = 'REVERT';
  await assert.rejects(s.waitForTransferConfirmation(s.txId), /REVERT/);
  s.state.info = {};
  await assert.rejects(s.waitForTransferConfirmation(s.txId), /pending/);
});

test('restart can rebroadcast the same unexpired signed transaction, never an expired one', async () => {
  const s = load();
  s.state.saved = true;
  const signed = { txID: s.txId, raw_data: { expiration: Date.now() + 60000 }, signature: ['signed'] };
  assert.equal((await s.waitForTransferConfirmation(s.txId, signed)).txId, s.txId);
  assert.equal(s.state.broadcasts, 1);
  s.state.info = {};
  signed.raw_data.expiration = 1;
  await assert.rejects(s.waitForTransferConfirmation(s.txId, signed), /pending/);
  assert.equal(s.state.broadcasts, 1);
});
