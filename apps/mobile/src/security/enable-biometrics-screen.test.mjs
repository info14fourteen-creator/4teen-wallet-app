import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../../app/enable-biometrics.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function descendants(node) {
  if (Array.isArray(node)) return node.flatMap(descendants);
  return node && typeof node === 'object' ? [node, ...descendants(node.props?.children)] : [];
}
function harness({ available = false, compatible = false, enabled = false, success = true } = {}) {
  const calls = [], settings = [], notices = [];
  let cursor = 0, prompts = 0;
  const values = ['Biometrics', available, compatible, enabled];
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: { useEffect() {}, useState: () => [values[cursor++], () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Text: 'Text', TouchableOpacity: 'Button', View: 'View', StyleSheet: { create: x => x } },
    'expo-router': { Stack: { Screen: 'Screen' }, useLocalSearchParams: () => ({ next: '/import-wallet' }), useRouter: () => ({ replace: path => calls.push(path) }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    'expo-local-authentication': { authenticateAsync: async () => { prompts++; return { success }; } },
    '../src/ui/navigation': { useNavigationInsets: () => ({ top: 0 }) },
    '../src/ui/screen-brow': { default: 'Brow' },
    '../src/ui/use-bottom-inset': { useBottomInset: () => 0 },
    '../src/theme/tokens': { colors: {}, layout: {}, radius: {} },
    '../src/theme/ui': { ui: {} },
    '../src/security/local-auth': { getBiometricsStatus() {}, setBiometricsEnabled: async value => settings.push(value) },
    '../src/notice/notice-provider': { useNotice: () => ({ showSuccessNotice: x => notices.push(x), showNeutralNotice: x => notices.push(x) }) },
    '../src/i18n': { useI18n: () => ({ t: x => x }) },
  };
  const exports = {};
  new Function('require', 'exports', code)(name => {
    assert.ok(name in modules, `Unmocked ${name}`);
    return modules[name];
  }, exports);
  const buttons = descendants(exports.default()).filter(n => n.type === 'Button');
  return { calls, settings, notices, get prompts() { return prompts; }, press: index => buttons[index].props.onPress() };
}
for (const compatible of [false, true]) {
  test(`Continue Without Biometrics advances with passcode protection (compatible=${compatible})`, async () => {
    const h = harness({ compatible });
    await h.press(0);
    assert.deepEqual(h.calls, ['/import-wallet']);
    assert.deepEqual(h.settings, [false]);
    assert.deepEqual(h.notices, []);
    assert.equal(h.prompts, 0);
  });
}
test('available biometrics still require successful system authentication', async () => {
  const h = harness({ available: true });
  await h.press(0);
  assert.equal(h.prompts, 1);
  assert.deepEqual(h.settings, [true]);
  assert.deepEqual(h.calls, ['/import-wallet']);
});
test('cancelled biometric authentication neither enables nor advances', async () => {
  const h = harness({ available: true, success: false });
  await h.press(0);
  assert.deepEqual(h.settings, []);
  assert.deepEqual(h.calls, []);
});
test('Keep It On does not disable an existing biometric setting', async () => {
  const h = harness({ enabled: true });
  await h.press(1);
  assert.deepEqual(h.settings, []);
  assert.deepEqual(h.calls, ['/import-wallet']);
});
