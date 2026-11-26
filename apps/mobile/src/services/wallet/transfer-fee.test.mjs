import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load() {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('./transfer-fee.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports });
  return module.exports;
}
test('one fee includes the full rental price and its network payment cost, not the avoided burn', () => {
  const { calculateTransferFeeSun } = load();
  assert.equal(calculateTransferFeeSun(14000000, { amountSun: '5000000' }, 268000), 5268000);
});
test('no rental uses only the transfer network estimate', () => {
  assert.equal(load().calculateTransferFeeSun(0, null, 0), 0);
});
test('displayed SUN price must match the actual TRX payment', () => {
  assert.throws(() => load().calculateTransferFeeSun(0, { amountSun: '5000000', amountTrx: '6' }, 0));
});
test('missing payment estimate and invalid monetary values never produce a confirmable fee', () => {
  const { calculateTransferFeeSun } = load();
  for (const amountSun of ['', '-1', 'x', '999999999999999999999']) {
    assert.throws(() => calculateTransferFeeSun(0, { amountSun }, 0));
  }
  assert.throws(() => calculateTransferFeeSun(0, { amountSun: '5' }, undefined));
});
