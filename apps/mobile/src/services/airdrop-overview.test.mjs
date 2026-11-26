import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const wallet = {
  id: 'qa-wallet',
  name: 'Empty QA wallet',
  address: 'TL26JcroVwpEWLzVe8jAJNuaKSZLZFtoNg',
  kind: 'private-key',
};

function loadService(activeWallet) {
  const source = readFileSync(new URL('./airdrop.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modules = {
    '../privacy/async-storage': {},
    tronweb: { TronWeb: class {} },
    '../config/tron': { getFourteenApiBaseUrls: () => ['https://test.invalid'], TRONGRID_BASE_URL: 'https://test.invalid', buildTrongridHeaders: () => ({}) },
    '../i18n': { translateNow: (value) => value },
    './wallet/import': {},
    './wallet/storage': { getActiveWallet: async () => activeWallet },
    './tron/api': {},
  };
  const exports = {};
  new Function('require', 'exports', compiled)((name) => modules[name] ?? (() => { throw Error(`unexpected import ${name}`); })(), exports);
  return exports;
}

test('an unavailable Telegram overview preserves the selected local wallet', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('Network request failed'); };
  try {
    const result = await loadService(wallet).getActiveWalletTelegramAirdropOverview();
    assert.equal(result.wallet?.id, wallet.id);
    assert.equal(result.overview, null);
    assert.equal(result.overviewUnavailable, true);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('without a selected wallet the overview is absent but not marked as a network failure', async () => {
  const result = await loadService(null).getActiveWalletTelegramAirdropOverview();
  assert.equal(result.wallet, null);
  assert.equal(result.overview, null);
  assert.equal(result.overviewUnavailable, false);
});
