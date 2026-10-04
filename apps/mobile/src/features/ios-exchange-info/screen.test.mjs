import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('iOS Buy and Swap show live read-only records, not disabled placeholders', () => {
  const screen = read('./screen.tsx');
  assert.match(screen, /loadHistory\('unlock'/);
  assert.match(screen, /loadTokenBalances\(/);
  assert.match(screen, /getWalletPortfolio\(/);
  assert.match(screen, /ProductScreen/);
  assert.doesNotMatch(screen, /executeDirectBuy|executeSwap|signTransaction|just\.money|sun\.io/);
});

test('iOS direct Buy confirmation cannot reach the signing flow', () => {
  const buy = read('../../../app/buy.tsx');
  const confirm = read('../../../app/buy-confirm.tsx');
  assert.match(buy, /Platform\.OS === 'ios' \? <IOSExchangeInfoScreen mode="buy"/);
  assert.match(confirm, /Platform\.OS === 'ios' \? <Redirect href="\/buy"/);
});

test('read-only page copy exists for every supported language', () => {
  const source = read('../../i18n/ios-exchange-info-slices.ts');
  for (const language of ['en', 'ru', 'uz', 'tr', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ar', 'hi', 'ja', 'zh-CN', 'ko']) {
    assert.match(source, new RegExp(`(?:^|\\n)  ['"]?${language.replace('-', '\\-')}['"]?:`, 'm'));
  }
});
