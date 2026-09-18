import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { formatUnits } from './model.ts';

// Exercise the real screen without an RN runtime or live network. The harness
// retains hook state across renders and explicitly drives focus/blur events.
const code = ts.transpileModule(readFileSync(new URL('./screen.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const walletA = { id: 'a', name: 'Wallet A', address: 'address-a', kind: 'watch-only', createdAt: '2026-01-01' };
const walletB = { ...walletA, id: 'b', name: 'Wallet B', address: 'address-b' };
const rowA = { id: 'a:0', txId: 'a'.repeat(64), amount: '7', timestamp: 1000, unlockAt: 1209601000 };
const rowB = { ...rowA, id: 'b:0', txId: 'b'.repeat(64), amount: '9' };
const failureText = 'Data could not be loaded. Please try again.';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function textOf(tree) {
  if (Array.isArray(tree)) return tree.map(textOf).join(' ').replace(/\s+/g, ' ').trim();
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return [tree.props?.title, tree.props?.eyebrow, textOf(tree.props?.children)].filter(Boolean).join(' ').trim();
}
function harness(screen = 'UnlockReadOnlyScreen') {
  const hooks = [], listeners = new Set(), calls = [];
  let index = 0, focusEffect, cleanup, activeWallet = walletA, writes = 0;
  const api = {
    history: async () => ({ rows: [rowA], cursor: 'older-a' }),
    balances: async () => ({ total: '11000000', locked: '3000000' }),
    liquidity: async () => '346164949',
    cabinet: async () => null,
    wallet: async () => activeWallet,
  };
  const jsx = (type, props) => ({ type, props });
  const deps = {
    react: {
      useState(initial) {
        const slot = index++;
        hooks[slot] ??= { value: initial };
        return [hooks[slot].value, next => {
          writes++;
          hooks[slot].value = typeof next === 'function' ? next(hooks[slot].value) : next;
        }];
      },
      useRef(initial) { const slot = index++; return hooks[slot] ??= { current: initial }; },
      useCallback(fn, dependencies) {
        const slot = index++, previous = hooks[slot];
        if (!previous || dependencies.some((item, i) => item !== previous.dependencies[i])) {
          hooks[slot] = { fn, dependencies };
        }
        return hooks[slot].fn;
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', RefreshControl: 'RefreshControl', Text: 'Text',
      TouchableOpacity: 'TouchableOpacity', View: 'View', StyleSheet: { create: value => value },
    },
    'expo-router': { useFocusEffect: fn => { focusEffect = fn; }, useRouter: () => ({ push() {} }) },
    '@expo/vector-icons': { MaterialCommunityIcons: 'Icon' },
    '../../i18n': { useI18n: () => ({ t: value => value, language: 'en' }), useLocaleLayout: () => ({}), getLanguageLocaleTag: () => 'en-US' },
    '../../services/wallet/storage': {
      getActiveWallet: () => api.wallet(),
      subscribeActiveWalletChange: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    },
    '../../ui/product-shell': { ProductScreen: 'ProductScreen', ProductSection: 'ProductSection', ProductStatGrid: 'ProductStatGrid' },
    '../../theme/tokens': { colors: {}, radius: {} },
    '../../utils/open-in-app-browser': { openInAppBrowser() {} },
    './model': { formatUnits },
    './data': {
      loadHistory: (...args) => { calls.push({ kind: 'history', args }); return api.history(...args); },
      loadTokenBalances: (...args) => { calls.push({ kind: 'balances', args }); return api.balances(...args); },
      loadLiquidityBalance: (...args) => api.liquidity(...args),
      loadCabinet: (...args) => api.cabinet(...args),
      PROTOCOL_CONTRACTS: { liquidity: 'liquidity-contract' },
    },
  };
  const exports = {};
  new Function('require', 'exports', code)(name => {
    assert.ok(name in deps, `Unexpected dependency: ${name}`);
    return deps[name];
  }, exports);
  const element = exports[screen]();
  function render() { index = 0; return element.type(element.props); }
  const h = {
    api, calls, render,
    focus() { render(); cleanup = focusEffect(); },
    blur() { cleanup?.(); cleanup = undefined; },
    switchWallet(wallet) { activeWallet = wallet; for (const listener of listeners) listener(wallet?.id ?? null); },
    async settle() { await tick(); return render(); },
    refresh() { render().props.refreshControl.props.onRefresh(); },
    press(label, tree = render()) {
      const button = nodes(tree).find(node => node.type === 'TouchableOpacity' && textOf(node) === label);
      assert.ok(button, `Missing button: ${label}`);
      button.props.onPress();
    },
    get writes() { return writes; },
  };
  return h;
}
function balanceValues(tree) {
  return nodes(tree).filter(node => node.type === 'ProductStatGrid').flatMap(node => node.props.items.map(item => item.value));
}
function errors(tree) {
  return nodes(tree).filter(node => node.props?.accessibilityRole === 'alert');
}
function assertSectionError(tree, label) {
  assert.ok(errors(tree).some(node => textOf(node).includes(label) && textOf(node).includes(failureText)), `Missing visible ${label} error`);
}

test('history failure still displays successful balances and a history-specific error', async () => {
  const h = harness();
  h.api.history = async () => { throw new Error('HTTP 429'); };
  h.focus();
  const tree = await h.settle();
  assert.deepEqual(balanceValues(tree), ['11 4TEEN', '3 4TEEN']);
  assertSectionError(tree, 'History');
  assert.equal(errors(tree).length, 1);
  assert.ok(!textOf(tree).includes('No matching records'));
});

test('balance failure still displays successful history and a balance-specific error', async () => {
  const h = harness();
  h.api.balances = async () => { throw new Error('RPC unavailable'); };
  h.focus();
  const tree = await h.settle();
  assert.ok(textOf(tree).includes('7 4TEEN'));
  assertSectionError(tree, 'Balance');
  assert.equal(errors(tree).length, 1);
  assert.deepEqual(balanceValues(tree), []);
});

for (const pending of ['history', 'balances']) {
  test(`publishes the healthy section while ${pending} is still pending`, async () => {
    const h = harness(), waiting = deferred();
    h.api[pending] = () => waiting.promise;
    h.focus();
    const tree = await h.settle();
    if (pending === 'history') assert.deepEqual(balanceValues(tree), ['11 4TEEN', '3 4TEEN']);
    else assert.ok(textOf(tree).includes('7 4TEEN'));
    // ProductScreen masks its children whenever RefreshControl.refreshing is true.
    assert.equal(tree.props.refreshControl.props.refreshing, false);
    h.blur();
    waiting.reject(new Error('Cancelled after blur'));
    await h.settle();
  });
}

test('both sources failing show separate errors, not zero balances or empty history', async () => {
  const h = harness();
  h.api.history = h.api.balances = async () => { throw new Error('Offline'); };
  h.focus();
  const tree = await h.settle();
  assertSectionError(tree, 'Balance');
  assertSectionError(tree, 'History');
  assert.equal(errors(tree).length, 2);
  assert.deepEqual(balanceValues(tree), []);
  assert.ok(!textOf(tree).includes('No matching records'));
});

test('same-wallet refresh preserves previous history while balances update independently', async () => {
  const h = harness();
  h.focus(); await h.settle();
  const waiting = deferred();
  h.api.history = () => waiting.promise;
  h.api.balances = async () => ({ total: '12000000', locked: '2000000' });
  h.refresh();
  let tree = await h.settle();
  assert.ok(textOf(tree).includes('7 4TEEN'));
  assert.deepEqual(balanceValues(tree), ['12 4TEEN', '2 4TEEN']);
  waiting.reject(new Error('HTTP 429'));
  tree = await h.settle();
  assert.ok(textOf(tree).includes('7 4TEEN'));
  assert.ok(textOf(tree).includes('Load More'));
  assertSectionError(tree, 'History');
});

test('same-wallet refresh preserves previous balances when the RPC fails', async () => {
  const h = harness();
  h.focus(); await h.settle();
  h.api.history = async () => ({ rows: [rowB], cursor: undefined });
  h.api.balances = async () => { throw new Error('RPC unavailable'); };
  h.refresh();
  const tree = await h.settle();
  assert.deepEqual(balanceValues(tree), ['11 4TEEN', '3 4TEEN']);
  assert.ok(textOf(tree).includes('9 4TEEN'));
  assert.ok(!textOf(tree).includes('7 4TEEN'));
  assertSectionError(tree, 'Balance');
});

test('successful retry clears errors and replaces retained data with real zero/empty results', async () => {
  const h = harness();
  h.focus(); await h.settle();
  h.api.history = h.api.balances = async () => { throw new Error('Offline'); };
  h.refresh(); await h.settle();
  h.api.history = async () => ({ rows: [], cursor: undefined });
  h.api.balances = async () => ({ total: '0', locked: '0' });
  h.press('Retry');
  const tree = await h.settle();
  assert.equal(errors(tree).length, 0);
  assert.deepEqual(balanceValues(tree), ['0 4TEEN', '0 4TEEN']);
  assert.ok(textOf(tree).includes('No matching records'));
  assert.ok(!textOf(tree).includes('7 4TEEN'));
  assert.ok(!textOf(tree).includes('Load More'));
});

for (const nextWallet of [walletB, { ...walletB, address: walletA.address }, { ...walletB, id: walletA.id }]) {
  test(`wallet identity ${nextWallet.id}/${nextWallet.address} cannot inherit prior data`, async () => {
    const h = harness();
    h.focus(); await h.settle();
    const waiting = deferred();
    h.api.wallet = () => waiting.promise;
    h.api.history = h.api.balances = async () => { throw new Error('Offline'); };
    h.switchWallet(nextWallet);
    let tree = await h.settle();
    assert.ok(!textOf(tree).includes('Wallet A'));
    assert.deepEqual(balanceValues(tree), []);
    waiting.resolve(nextWallet);
    tree = await h.settle();
    assert.ok(textOf(tree).includes('Wallet B'));
    assert.ok(!textOf(tree).includes('7 4TEEN'));
    assert.deepEqual(balanceValues(tree), []);
    assertSectionError(tree, 'Balance');
    assertSectionError(tree, 'History');
  });
}

test('wallet switch aborts old requests and ignores their late successes and errors', async () => {
  const h = harness(), oldHistory = deferred(), oldBalances = deferred();
  h.api.history = () => oldHistory.promise;
  h.api.balances = () => oldBalances.promise;
  h.focus(); await h.settle();
  const oldCalls = [...h.calls];
  h.api.history = async () => ({ rows: [rowB] });
  h.api.balances = async () => ({ total: '2000000', locked: '0' });
  h.switchWallet(walletB); await h.settle();
  assert.ok(oldCalls.every(call => call.args[call.kind === 'history' ? 2 : 1].aborted));
  oldHistory.resolve({ rows: [rowA] });
  oldBalances.reject(new Error('Late RPC failure'));
  const tree = await h.settle();
  assert.ok(textOf(tree).includes('Wallet B'));
  assert.ok(textOf(tree).includes('9 4TEEN'));
  assert.ok(!textOf(tree).includes('7 4TEEN'));
  assert.deepEqual(balanceValues(tree), ['2 4TEEN', '0 4TEEN']);
  assert.equal(errors(tree).length, 0);
});

test('blur aborts both reads and prevents late state writes or wallet-change reloads', async () => {
  const h = harness(), history = deferred(), balances = deferred();
  h.api.history = () => history.promise;
  h.api.balances = () => balances.promise;
  h.focus(); await h.settle();
  assert.equal(h.calls.length, 2);
  h.blur();
  const writes = h.writes;
  assert.ok(h.calls.every(call => call.args[call.kind === 'history' ? 2 : 1].aborted));
  h.switchWallet(walletB);
  history.resolve({ rows: [rowA] });
  balances.reject(new Error('Late failure'));
  await h.settle();
  assert.equal(h.writes, writes);
  assert.equal(h.calls.length, 2);
});

test('refocus verifies the wallet before redisplaying cached data', async () => {
  const h = harness();
  h.focus(); await h.settle(); h.blur();
  h.switchWallet(walletB);
  h.api.wallet = async () => { throw new Error('Storage unavailable'); };
  h.focus();
  assert.deepEqual(balanceValues(h.render()), []);
  const tree = await h.settle();
  assert.deepEqual(balanceValues(tree), []);
  assert.ok(!textOf(tree).includes('Wallet A'));
});

test('pagination failure preserves data and Retry retries the failed page', async () => {
  const h = harness();
  h.focus(); await h.settle();
  h.api.history = async () => { throw new Error('Page unavailable'); };
  h.press('Load More');
  let tree = await h.settle();
  assert.ok(textOf(tree).includes('7 4TEEN'));
  assert.deepEqual(balanceValues(tree), ['11 4TEEN', '3 4TEEN']);
  assertSectionError(tree, 'History');
  h.api.history = async (_kind, _wallet, _signal, cursor) => {
    assert.equal(cursor, 'older-a');
    return { rows: [rowA, rowB] };
  };
  h.press('Retry', errors(tree)[0]);
  tree = await h.settle();
  assert.equal(errors(tree).length, 0);
  assert.equal(textOf(tree).split('7 4TEEN').length - 1, 1);
  assert.ok(textOf(tree).includes('9 4TEEN'));
});

test('removing the active wallet clears cached sections', async () => {
  const h = harness();
  h.focus(); await h.settle();
  h.switchWallet(null);
  const tree = await h.settle();
  assert.ok(textOf(tree).includes('Wallet Setup'));
  assert.deepEqual(balanceValues(tree), []);
  assert.ok(!textOf(tree).includes('7 4TEEN'));
});

test('liquidity loading shows the wallet and spinner without an unknown balance section', async () => {
  const h = harness('LiquidityReadOnlyScreen'), waiting = deferred();
  h.api.liquidity = () => waiting.promise;
  h.focus();
  const tree = await h.settle();
  assert.ok(textOf(tree).includes('Wallet A'));
  assert.ok(nodes(tree).some(node => node.type === 'ActivityIndicator'));
  assert.ok(!nodes(tree).some(node => node.type === 'ProductSection' && node.props.title === 'LIQUIDITY'));
  assert.ok(!textOf(tree).includes('0 TRX'));
  assert.ok(!textOf(tree).includes('— TRX'));
  h.blur(); waiting.resolve('346164949'); await h.settle();
});

test('liquidity failure shows retry without manufacturing a balance', async () => {
  const h = harness('LiquidityReadOnlyScreen');
  h.api.liquidity = async () => { throw new Error('Balance unavailable'); };
  h.focus();
  const tree = await h.settle();
  assert.ok(textOf(tree).includes(failureText));
  assert.ok(textOf(tree).includes('Retry'));
  assert.ok(!nodes(tree).some(node => node.type === 'ProductSection' && node.props.title === 'LIQUIDITY'));
  assert.ok(!nodes(tree).some(node => node.type === 'ActivityIndicator'));
});

for (const [raw, display] of [['0', '0 TRX'], ['346164949', '346.164949 TRX']]) {
  test(`liquidity renders a successfully loaded balance of ${display}`, async () => {
    const h = harness('LiquidityReadOnlyScreen');
    h.api.liquidity = async () => raw;
    h.focus();
    const tree = await h.settle();
    const section = nodes(tree).find(node => node.type === 'ProductSection' && node.props.title === 'LIQUIDITY');
    assert.ok(section);
    assert.ok(textOf(section).includes(display));
    assert.ok(!nodes(tree).some(node => node.type === 'ActivityIndicator'));
  });
}

test('failed liquidity refresh retains the previous same-wallet balance with an error', async () => {
  const h = harness('LiquidityReadOnlyScreen');
  h.focus(); await h.settle();
  h.api.liquidity = async () => { throw new Error('Balance unavailable'); };
  h.refresh();
  const tree = await h.settle();
  assert.ok(textOf(tree).includes('346.164949 TRX'));
  assert.ok(textOf(tree).includes(failureText));
});

test('ambassador loading keeps its spinner after publishing the wallet context', async () => {
  const h = harness('AmbassadorReadOnlyScreen'), waiting = deferred();
  h.api.cabinet = () => waiting.promise;
  h.focus();
  let tree = await h.settle();
  assert.ok(textOf(tree).includes('Wallet A'));
  assert.ok(nodes(tree).some(node => node.type === 'ActivityIndicator'));
  assert.ok(!textOf(tree).includes('No matching records'));
  waiting.resolve(null);
  tree = await h.settle();
  assert.ok(!nodes(tree).some(node => node.type === 'ActivityIndicator'));
  assert.ok(textOf(tree).includes('No matching records'));
});
