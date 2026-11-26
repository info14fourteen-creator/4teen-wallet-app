import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load() {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./operation-fee.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports });
  return module.exports;
}
test('displayed rental fee includes payment bandwidth while maximum is a total ceiling', () => {
  const { calculateOperationFee } = load();
  assert.deepEqual(JSON.parse(JSON.stringify(calculateOperationFee({ burnSun: 12000000, rentalSun: 4000000, paymentSun: 300000 }))),
    { feeSun: 4300000, maxFeeSun: 12000000, rent: true });
});
test('unavailable or more expensive rental falls back before any payment', () => {
  const { calculateOperationFee } = load();
  for (const rentalSun of [undefined, 13000000]) {
    const fee = calculateOperationFee({ burnSun: 12000000, rentalSun, paymentSun: 0 });
    assert.equal(fee.rent, false);
    assert.equal(fee.feeSun, 12000000);
  }
});
test('invalid amounts cannot become an approvable zero fee', () => {
  const { calculateOperationFee } = load();
  for (const burnSun of [NaN, -1, Infinity, 0.5]) assert.throws(() => calculateOperationFee({ burnSun }));
});
test('preview never advertises rental when its execution cannot fit the total ceiling', () => {
  const { calculateOperationFee } = load();
  assert.equal(calculateOperationFee({ burnSun: 10000, maxFeeSun: 11500,
    rentalSun: 2000, executionFloorSun: 10000 }).rent, false);
  assert.equal(calculateOperationFee({ burnSun: 10000, maxFeeSun: 11500,
    rentalSun: 1000, executionFloorSun: 10000 }).rent, true);
});
test('all spent and reserved costs consume the same maximum', () => {
  const { remainingOperationFee } = load();
  assert.equal(remainingOperationFee(12000000, [4000000, 300000, 2000000]), 5700000);
  assert.throws(() => remainingOperationFee(12000000, [4000000, 9000000]));
  assert.throws(() => remainingOperationFee(12000000, [NaN]));
});
test('display preserves every SUN of the approved ceiling', () => {
  const { formatOperationSun } = load();
  assert.equal(formatOperationSun(12000123), '12.000123');
  assert.equal(formatOperationSun(4000000), '4');
});
