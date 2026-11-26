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

test('iOS direct Buy reaches the shared confirmation flow', () => {
  const buy = read('../../../app/buy.tsx');
  const confirm = read('../../../app/buy-confirm.tsx');
  const iosBuy = read('../../../app/buy.ios.tsx');
  const iosConfirm = read('../../../app/buy-confirm.ios.tsx');
  const iosEntry = read('../../../app/buy-4teen.ios.tsx');
  assert.match(iosBuy, /export \{ default \} from '\.\/buy\.tsx'/);
  assert.match(iosConfirm, /export \{ default \} from '\.\/buy-confirm\.tsx'/);
  assert.match(iosEntry, /Redirect href="\/buy"/);
  assert.match(buy, /return <AndroidBuyScreen \/>/);
  assert.match(confirm, /return <AndroidBuyConfirmScreen \/>/);
  assert.match(confirm, /executeDirectBuy/);
});

test('iOS Ambassador and Airdrop use the shared interactive flows', () => {
  for (const name of ['ambassador-program', 'ambassador-confirm', 'ambassador-withdraw-confirm', 'airdrop']) {
    assert.match(read(`../../../app/${name}.ios.tsx`), new RegExp(`export \\{ default \\} from '\\.\\/${name}\\.tsx'`));
  }
  assert.match(read('../../../app/airdrop.tsx'), /startTelegramAirdropFlow/);
  assert.match(read('../../../app/ambassador-confirm.tsx'), /registerAmbassadorWithOptions/);
  assert.match(read('../../../app/ambassador-withdraw-confirm.tsx'), /withdrawAmbassadorRewards/);
});

test('read-only page copy exists for every supported language', () => {
  const source = read('../../i18n/ios-exchange-info-slices.ts');
  for (const language of ['en', 'ru', 'uz', 'tr', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ar', 'hi', 'ja', 'zh-CN', 'ko']) {
    assert.match(source, new RegExp(`(?:^|\\n)  ['"]?${language.replace('-', '\\-')}['"]?:`, 'm'));
  }
});
