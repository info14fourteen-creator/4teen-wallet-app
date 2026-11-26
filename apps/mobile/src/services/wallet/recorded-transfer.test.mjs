import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(values = new Map(), beforeWrite = () => {}) {
  const module = { exports: {} };
  const storage = {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { beforeWrite(); values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
  const code = ts.transpileModule(readFileSync(new URL('./recorded-transfer.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: () => storage });
  return module.exports;
}

test('lost broadcast response and restart resume the original hash without signing or paying again', async () => {
  const values = new Map();
  const first = load(values);
  let sends = 0;
  const input = {
    key: 'rent-1', identity: 'wallet:order-1',
    send: async beforeBroadcast => { sends++; await beforeBroadcast('a'.repeat(64)); throw new Error('Network lost'); },
    confirm: async txId => ({ txId }),
  };
  await assert.rejects(first.runRecordedTransfer(input), /Network lost/);
  const result = await load(values).runRecordedTransfer(input);
  assert.equal(result.txId, 'a'.repeat(64));
  assert.equal(sends, 1);
});

test('concurrent approval sends once and confirmation failure remains recoverable', async () => {
  const api = load();
  let sends = 0;
  let ready = false;
  const input = {
    key: 'transfer', identity: 'wallet:token:recipient:1',
    send: async persist => { sends++; await persist('b'.repeat(64)); },
    confirm: async txId => { if (!ready) throw new Error('Pending'); return { txId }; },
  };
  const results = await Promise.allSettled([api.runRecordedTransfer(input), api.runRecordedTransfer(input)]);
  assert.ok(results.every(result => result.status === 'rejected'));
  ready = true;
  assert.equal((await api.runRecordedTransfer(input)).txId, 'b'.repeat(64));
  assert.equal(sends, 1);
});

test('storage failure stops broadcast and mismatched intent cannot reuse payment', async () => {
  const values = new Map();
  let broadcasts = 0;
  const input = {
    key: 'payment', identity: 'wallet:order',
    send: async persist => { await persist('c'.repeat(64)); broadcasts++; },
    confirm: async txId => ({ txId }),
  };
  await assert.rejects(load(values, () => { throw new Error('Storage unavailable'); }).runRecordedTransfer(input));
  assert.equal(broadcasts, 0);
  const api = load(values);
  await api.runRecordedTransfer(input);
  await assert.rejects(api.runRecordedTransfer({ ...input, identity: 'other-wallet:order' }));
  assert.equal(broadcasts, 1);
});

test('corrupt storage fails closed and successful acknowledgement allows a new intended transfer', async () => {
  const values = new Map([['recorded-transfer:v1:send', '{broken']]);
  const api = load(values);
  let sends = 0;
  const input = { key: 'send', identity: 'intent', context: { amount: '1' },
    send: async persist => { sends++; await persist('d'.repeat(64), { txID: 'd'.repeat(64) }); },
    confirm: async (txId, signed) => { assert.equal(signed.txID, txId); return { txId }; },
  };
  await assert.rejects(api.runRecordedTransfer(input));
  assert.equal(sends, 0);
  values.clear();
  await api.runRecordedTransfer(input);
  assert.equal((await api.getRecordedTransfer('send')).context.amount, '1');
  await assert.rejects(api.acknowledgeRecordedTransfer('send', 'e'.repeat(64)));
  await api.acknowledgeRecordedTransfer('send', 'd'.repeat(64));
  await api.runRecordedTransfer({ ...input, identity: 'new-intent' });
  assert.equal(sends, 2);
});
