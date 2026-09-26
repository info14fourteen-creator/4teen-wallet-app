import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as access from '../features/native-swap-access.ts';
import * as routes from './navigation-routes.ts';

const source = readFileSync(new URL('./footer-nav.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
function harness(platform, pathname = '/wallet', kind = 'full-access') {
  const state = [], calls = [], notices = [];
  let cursor = 0, signingChecks = 0;
  const jsx = (type, props) => ({ type, props });
  class Value { interpolate() { return 0; } setValue() {} stopAnimation() {} }
  const dependencies = {
    react: {
      useState(initial) {
        const slot = cursor++;
        if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial;
        return [state[slot], next => { state[slot] = typeof next === 'function' ? next(state[slot]) : next; }];
      },
      useRef(initial) { const slot = cursor++; return state[slot] ??= { current: initial }; },
      useMemo: fn => fn(), useCallback: fn => fn, useEffect() {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      Animated: { Value, View: 'Animated.View' }, Easing: {},
      Image: 'Image', Text: 'Text', TouchableOpacity: 'Button', View: 'View',
      StyleSheet: { create: x => x, absoluteFillObject: {} },
    },
    '@expo/vector-icons': { MaterialCommunityIcons: 'Icon' },
    'expo-router': { usePathname: () => pathname, useRouter: () => ({
      push: path => calls.push(path), replace: path => calls.push(path),
    }) },
    'react-native-svg': { default: 'Svg', Defs: 'Defs', Line: 'Line', LinearGradient: 'Gradient', Stop: 'Stop' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../i18n': { useI18n: () => ({ t: x => x }) },
    '../theme/tokens': { colors: { red: '#f00', green: '#0f0', white: '#fff', accent: '#f80', bg: '#000' }, radius: {} },
    '../notice/notice-provider': { useNotice: () => ({ showNeutralNotice: message => notices.push(message) }) },
    '../wallet/wallet-session': { useWalletSession: () => ({ hasWallet: true, activeWalletKind: kind, footerTickerItems: [] }) },
    '../services/wallet/storage': { ensureSigningWalletActive: async () => { signingChecks++; return false; } },
    './navigation-routes': routes,
    './fourteen-wallet-loader': { default: 'Loader' },
    './lottie-icon': { default: 'Lottie' },
    '../features/native-swap-access': Object.fromEntries(Object.entries(access).map(([name, fn]) => [name, () => fn(platform)])),
  };
  const exported = {};
  new Function('require', 'exports', 'requestAnimationFrame', code)(name => {
    if (name.endsWith('.json')) return { asset: name };
    assert.ok(name in dependencies, `Unmocked dependency: ${name}`);
    return dependencies[name];
  }, exported, fn => fn());
  function expand(tree) {
    if (Array.isArray(tree)) return tree.map(expand);
    if (!tree || typeof tree !== 'object') return tree;
    if (typeof tree.type === 'function') return expand(tree.type(tree.props));
    return { ...tree, props: { ...tree.props, children: expand(tree.props?.children) } };
  }
  function render() { cursor = 0; return expand(exported.default({})); }
  return {
    render, calls, notices,
    get signingChecks() { return signingChecks; },
    labels() { return nodes(render()).filter(n => n.type === 'Button').map(text); },
    async press(label) {
      const button = nodes(render()).find(n => n.type === 'Button' && text(n) === label);
      assert.ok(button, `Missing ${platform} ${pathname} button ${label}`);
      await button.props.onPress();
      for (const node of nodes(render())) {
        if (node.props?.onAnimationFinish) node.props.onAnimationFinish(false);
      }
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test('iOS main footer preserves five working destinations with no exchange placeholder', async () => {
  const h = harness('ios');
  assert.deepEqual(h.labels(), ['HOME', 'SEND', 'WALLET', 'ASSETS', 'History']);
  await h.press('ASSETS');
  assert.deepEqual(h.calls, ['/manage-crypto']);
  assert.equal(h.signingChecks, 0);
  assert.deepEqual(h.notices, []);
});

for (const path of ['/ambassador-program', '/airdrop']) {
  test(`iOS ${path} has no BUY button and assets opens normally`, async () => {
    const h = harness('ios', path, 'watch-only');
    assert.deepEqual(h.labels(), ['ASSETS', 'AIRDROP', 'WALLET', 'AMBASSADOR', 'MAIN']);
    await h.press('ASSETS');
    assert.deepEqual(h.calls, ['/manage-crypto']);
    assert.equal(h.signingChecks, 0);
    assert.deepEqual(h.notices, []);
  });
}

for (const [path, label, destination] of [
  ['/wallet', 'HOME', '/unlock-timeline'],
  ['/wallet', 'History', '/ambassador-program'],
  ['/unlock-timeline', 'LIQUIDITY', '/liquidity-controller'],
  ['/unlock-timeline', 'INFO', '/earn'],
  ['/ambassador-program', 'AIRDROP', '/airdrop'],
  ['/airdrop', 'AMBASSADOR', '/ambassador-program'],
]) {
  test(`iOS ${label} animation completes into ${destination}`, async () => {
    const h = harness('ios', path, 'watch-only');
    await h.press(label);
    assert.deepEqual(h.calls, [destination]);
    assert.deepEqual(h.notices, []);
    assert.equal(h.signingChecks, 0);
  });
}

test('Android keeps SWAP, EARN and BUY', async () => {
  assert.deepEqual(harness('android').labels(), ['HOME', 'SEND', 'WALLET', 'SWAP', 'EARN']);
  const h = harness('android', '/ambassador-program');
  assert.deepEqual(h.labels(), ['BUY', 'AIRDROP', 'WALLET', 'AMBASSADOR', 'MAIN']);
  await h.press('BUY');
  assert.deepEqual(h.calls, ['/buy']);
});

test('Android swap retains its watch-only signing guard', async () => {
  const h = harness('android', '/wallet', 'watch-only');
  await h.press('SWAP');
  assert.equal(h.signingChecks, 1);
  assert.deepEqual(h.calls, []);
  assert.match(h.notices[0], /requires a signing wallet/);
});

test('iOS send retains its watch-only signing guard', async () => {
  const h = harness('ios', '/wallet', 'watch-only');
  await h.press('SEND');
  assert.equal(h.signingChecks, 1);
  assert.deepEqual(h.calls, []);
  assert.match(h.notices[0], /requires a signing wallet/);
});
