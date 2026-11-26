import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const screens = [
  '../../../app/send-confirm.tsx',
  '../../../app/buy-confirm.tsx',
  '../../../app/liquidity-confirm.tsx',
  '../../../app/ambassador-confirm.tsx',
  '../../../app/ambassador-withdraw-confirm.tsx',
  '../../features/native-swap/swap-confirm-screen.android.tsx',
];
for (const path of screens) {
  test(`${path} uses the existing fee row with a shared total ceiling`, () => {
    const source = read(path);
    assert.match(source, /useOperationFee\(/);
    assert.match(source, /formatOperationSun\(operationFee\.plan\.feeSun\)/);
    assert.match(source, /no more than \{\{amount\}\} TRX/);
    assert.match(source, /formatOperationSun\(operationFee\.plan\.maxFeeSun\)/);
    assert.match(source, /operationFee\.approved\.current/);
    assert.doesNotMatch(source, /<EnergyResaleCard|<ConfirmNetworkLoadCard/);
  });
}
test('ordinary TRX transfers bypass the contract rental approval', () => {
  assert.match(read('../../../app/send-confirm.tsx'), /feeApproval: estimate\.token\.isNative \? undefined/);
});
test('all wallet contract services use the durable operation executor', () => {
  for (const path of ['../direct-buy.ts', '../liquidity-controller.ts', '../ambassador.ts', '../swap/sunio.ts']) {
    const source = read(path);
    assert.match(source, /executeContractOperation\(/);
    assert.doesNotMatch(source, /\.send\(/);
  }
});
