import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(name, dependencies) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(name, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: name => {
    assert.ok(dependencies[name], name); return dependencies[name];
  } });
  return module.exports;
}
function scenario() {
  const values = new Map();
  const state = { buys: 0, sends: 0, signs: 0, energy: 1000, fee: 100, deliveryFails: false, confirmFails: false, writeFails: false, pending: null };
  const storage = { getItem: async k => values.get(k) ?? null,
    setItem: async (k,v) => { if (state.writeFails) throw Error('Disk'); values.set(k,v); }, removeItem: async k => values.delete(k) };
  const recorded = load('./recorded-transfer.ts', { '../../privacy/async-storage': storage });
  const ledger = load('./operation-ledger.ts', { '../../privacy/async-storage': storage, './recorded-transfer': recorded });
  const fee = load('./operation-fee.ts', {});
  const tronWeb = {
    transactionBuilder: {
      estimateEnergy: async () => ({ energy_required: state.energy }),
      triggerSmartContract: async (_a,_s,options) => ({ result: { result: true }, transaction: {
        txID: (++state.signs).toString(16).padStart(64,'0'), raw_data: { fee_limit: options.feeLimit },
      } }),
    },
    trx: { getBalance: async () => state.balance ?? 1000000, sign: async tx => tx, sendRawTransaction: async () => { state.sends++; return { result: true }; } },
  };
  const deps = {
    '../energy-resale': { getPendingEnergyRentalQuote: async () => state.pending,
      rentEnergyForPurpose: async () => { if (!state.pending) state.buys++; state.pending = quote; if(state.deliveryFails) throw Error('Delivery pending'); } },
    './recorded-transfer': recorded, './operation-ledger': ledger, './operation-fee': fee,
    './resources': { getResourceUnitPricing: async () => ({ energySun: 1, bandwidthSun: 1 }), estimateSignedTransactionBandwidth: () => 300 },
    './send': { waitForTransferConfirmation: async txId => { if(state.confirmFails) throw Error('Unknown receipt'); return { txId, receipt: { fee: state.fee } }; } },
  };
  const quote = { mode: 'tronix', amountSun: '1000', orderId: 'order', wallet: 'wallet', purpose: 'direct_buy' };
  const approval = { operationId: 'test-operation', wallet: 'wallet', purpose: 'direct_buy', maxFeeSun: 10000, feeSun: 1100, paymentSun: 100, quote };
  const input = { tronWeb, privateKey: 'unused', wallet: 'wallet', approval, identity: 'buy:1', contractAddress: 'contract', functionSelector: 'buyTokens()' };
  const restart = () => load('./contract-operation.ts', deps);
  return { ...restart(), restart, state, input, ledger, values };
}

test('confirmed stage survives partial journal cleanup without a second broadcast', async () => {
  const s = scenario();
  const first = await s.executeContractOperation(s.input);
  s.values.delete('recorded-transfer:v1:operation:wallet:direct_buy:execute');
  assert.equal(await s.restart().executeContractOperation(s.input), first);
  assert.equal(s.state.sends, 1);
});

test('retry after completed cleanup returns the confirmed transaction', async () => {
  const s = scenario(); const first = await s.executeContractOperation(s.input);
  await s.ledger.finishOperationLedger('wallet', 'direct_buy');
  assert.equal(await s.restart().executeContractOperation(s.input), first);
  assert.equal(s.state.sends, 1); assert.equal(s.state.buys, 1);
});

test('insufficient balance including call value stops before rental payment', async () => {
  const s = scenario(); s.state.balance = 15000;
  await assert.rejects(s.executeContractOperation({ ...s.input, callValue: 10000 }), /balance/);
  assert.equal(s.state.buys, 0); assert.equal(s.state.sends, 0);
});

test('resuming a confirmed operation restores the enclosing transaction journal', async () => {
  const s = scenario(); await s.executeContractOperation(s.input);
  let recorded;
  const txId = await s.restart().executeContractOperation({ ...s.input, beforeBroadcast: async hash => { recorded = hash; } });
  assert.equal(recorded, txId); assert.equal(s.state.sends, 1);
});

test('one confirmed operation persists before broadcast and accounts rental plus network fee', async () => {
  const s=scenario(); await s.executeContractOperation(s.input);
  assert.equal(s.state.buys,1); assert.equal(s.state.sends,1);
  const ledger=await s.ledger.readOperationLedger('wallet','direct_buy');
  assert.equal(ledger.rentalReservedSun,1100); assert.equal(ledger.stages.execute.feeSun,100);
});
test('restart after a lost receipt confirms the same transaction without signing or spending again', async () => {
  const s=scenario(); s.state.confirmFails=true;
  await assert.rejects(s.executeContractOperation(s.input),/Unknown/);
  s.state.confirmFails=false;
  await s.restart().executeContractOperation(s.input);
  assert.equal(s.state.sends,1); assert.equal(s.state.signs,1); assert.equal(s.state.buys,1);
});
test('unknown delivery never falls through to burn or repays the provider', async () => {
  const s=scenario(); s.state.deliveryFails=true;
  await assert.rejects(s.executeContractOperation(s.input),/pending/);
  await assert.rejects(s.restart().executeContractOperation(s.input),/pending/);
  assert.equal(s.state.buys,1); assert.equal(s.state.sends,0);
});
test('database write failure blocks every financial action', async () => {
  const s=scenario(); s.state.writeFails=true;
  await assert.rejects(s.executeContractOperation(s.input),/Disk/);
  assert.equal(s.state.buys,0); assert.equal(s.state.sends,0);
});
test('if rent plus execution does not fit, burn is selected before rental payment', async () => {
  const s=scenario(); s.input.approval.maxFeeSun=3500;
  await s.executeContractOperation(s.input);
  assert.equal(s.state.buys,0); assert.equal(s.state.sends,1);
});
test('different operation cannot reuse a paid or pending intent', async () => {
  const s=scenario(); await s.executeContractOperation(s.input);
  await assert.rejects(s.executeContractOperation({...s.input,identity:'buy:2'}),/Previous/);
  assert.equal(s.state.sends,1);
});
test('swap stages consume the same budget, not a fresh ceiling per call', async () => {
  const s=scenario(); s.input.approval.quote=null; s.input.approval.maxFeeSun=5000;
  s.state.fee=2500;
  await s.executeContractOperation({...s.input,stage:'approval'});
  await assert.rejects(s.executeContractOperation({...s.input,stage:'swap'}),/budget/);
  assert.equal(s.state.sends,1);
});
