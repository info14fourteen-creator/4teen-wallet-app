import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const WALLET = 'TSbK3B9cgkVEYtipqZzeE9trChd8QmZkqp';
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// Exercise the real loader, parser, pagination and caches. Only native storage,
// app settings, and the external HTTP boundary need substitutes under node:test.
export function loadApi(fetchImpl) {
  const stored = new Map();
  const storage = {
    getItem: async key => stored.get(key) ?? null,
    setItem: async (key, value) => { stored.set(key, value); },
    removeItem: async key => { stored.delete(key); },
    multiRemove: async keys => { keys.forEach(key => stored.delete(key)); },
  };
  const dependencies = {
    '@react-native-async-storage/async-storage': storage,
    tronweb: require('tronweb'),
    '../../config/tron': {
      assertTronConfig() {}, TRONGRID_BASE_URL: 'https://test.invalid/trongrid',
      TRONSCAN_BASE_URL: 'https://test.invalid/tronscan',
      CMC_PRO_BASE_URL: 'https://test.invalid/cmc', CMC_DATA_API_BASE_URL: 'https://test.invalid/cmc-data',
      CMC_DAPI_BASE_URL: 'https://test.invalid/cmc-dapi',
    },
    '../address-book': { getAddressBookMap: async () => ({}) },
    '../../i18n': { translateNow: value => value },
    '../../settings/display-currency': { getDisplayCurrency: async () => 'USD' },
    './fourteen-price': { FOURTEEN_LOGO: '', getFourteenPriceSnapshot: async () => null },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    fetch: fetchImpl, URL, Response, AbortController, setTimeout, clearTimeout,
    console: { log() {}, info() {}, warn() {}, error() {} }, __DEV__: false,
  }, { filename: 'tron/api.ts' });
  return module.exports;
}

function balanceProvider({ indexed, direct = '100000000', fail = false } = {}) {
  return async (input, init) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/triggerconstantcontract')) {
      const body = JSON.parse(init.body);
      assert.equal(init.method, 'POST');
      assert.equal(body.function_selector, 'balanceOf(address)');
      assert.equal(body.parameter.toLowerCase(), '000000000000000000000000b65606b39efe1d34d2b1ea45abeca31d835403e9');
      if (body.contract_address === USDT && fail) return Response.json({ result: { result: false, message: 'unavailable' } });
      const value = body.contract_address === USDT ? direct : '0';
      return Response.json({ result: { result: true }, constant_result: [BigInt(value).toString(16).padStart(64, '0')] });
    }
    if (url.pathname.endsWith(`/accounts/${WALLET}`)) return Response.json({ success: true,
      data: indexed === undefined ? [] : [{ address: WALLET, balance: 0, trc20: [{ [USDT]: indexed }] }] });
    if (url.pathname.endsWith('/account/tokens')) return Response.json({ code: 200, total: 0, data: [] });
    // Price/metadata providers are not needed to discover an on-chain balance.
    return Response.json({ data: {} });
  };
}

test('unactivated account with empty indexers still shows its on-chain 100 USDT', async () => {
  const api = loadApi(balanceProvider());
  const assets = await api.getAccountTrc20Assets(WALLET);
  const usdt = assets.find(item => item.tokenId === USDT);
  assert.ok(usdt, 'received USDT must not disappear when account has not been activated');
  assert.equal(usdt.balance, '100000000');
  assert.equal(usdt.tokenDecimal, 6);
  assert.equal(usdt.balanceFormatted, '100');
});

test('current contract balance wins over stale indexed positive balance', async () => {
  const api = loadApi(balanceProvider({ indexed: '100000000', direct: '75000000' }));
  const assets = await api.getAccountTrc20Assets(WALLET);
  assert.equal(assets.find(item => item.tokenId === USDT)?.balanceFormatted, '75');
});

test('a confirmed zero contract balance removes stale indexed USDT', async () => {
  const api = loadApi(balanceProvider({ indexed: '100000000', direct: '0' }));
  const assets = await api.getAccountTrc20Assets(WALLET);
  assert.equal(assets.some(item => item.tokenId === USDT), false);
});

test('unavailable contract and absent indexed balance never become a successful zero snapshot', async () => {
  const api = loadApi(balanceProvider({ fail: true }));
  await assert.rejects(api.getWalletSnapshot(WALLET, { force: true }), /balance|USDT|TRC20/i);
});

test('an indexed positive balance remains available during a contract read outage', async () => {
  const api = loadApi(balanceProvider({ indexed: '100000000', fail: true }));
  const assets = await api.getAccountTrc20Assets(WALLET);
  assert.equal(assets.find(item => item.tokenId === USDT)?.balanceFormatted, '100');
});
