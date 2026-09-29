import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { WALLET_DELETION_KEYS, WALLET_DELETION_SLICES } from '../i18n/wallet-deletion-slices.ts';

const source = readFileSync(new URL('../../app/delete-wallet.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const wallet = { id: 'demo', name: 'Disposable demo', address: 'TTestAddress', kind: 'mnemonic' };
const tick = () => new Promise(resolve => setImmediate(resolve));
function nodes(n) { return Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : []; }
function text(n) { return Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : typeof n === 'string' ? n : ''; }
function harness({ selected = false, protectedApp = true, listFails = false, deletionError = null, reloadFails = false } = {}) {
  const states = [], refs = [], calls = []; let cursor, refCursor, root, mounted = false, focus, frozen = false, blocked = false, reloads = 0, backs = 0;
  class WalletDeletionError extends Error { constructor(code) { super(code); this.code = code; } }
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: { useCallback: f => f, useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; }, useRef: initial => { const i = refCursor++; return refs[i] ??= { current: initial }; } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ActivityIndicator: 'Spinner', Pressable: 'Button', Text: 'Text', TextInput: 'Input', View: 'View', StyleSheet: { create: x => x } },
    'expo-router': { useRouter: () => ({ back: () => backs++ }), useLocalSearchParams: () => selected ? { walletId: wallet.id } : {}, useFocusEffect: f => { if (!mounted) focus = f; } },
    '@react-navigation/native': { usePreventRemove: v => { blocked = v; } },
    expo: { reloadAppAsync: async () => { reloads++; if (reloadFails) throw Error('failed'); } },
    '@expo/vector-icons': { MaterialCommunityIcons: 'Icon' },
    '../src/i18n': { useI18n: () => ({ t: x => x }), useLocaleLayout: () => ({}) },
    '../src/ui/product-shell': { ProductScreen: 'Screen' }, '../src/theme/tokens': { colors: {}, radius: {} }, '../src/theme/ui': { ui: {} },
    '../src/security/local-auth': { hasPasscode: async () => protectedApp },
    '../src/privacy/deletion-barrier': { isLocalDeletionInProgress: () => frozen },
    '../src/privacy/delete-wallet-data': { WalletDeletionError, listWalletsForDeletion: async () => { if (listFails) throw Error('read'); return [wallet]; }, deleteWalletData: async r => { calls.push(r); if (deletionError) { frozen = deletionError !== 'passcode'; throw new WalletDeletionError(deletionError); } frozen = true; } },
  };
  const exports = {}; new Function('require', 'exports', compiled)(name => { assert.ok(name in modules, name); return modules[name]; }, exports);
  function render() { cursor = refCursor = 0; root = exports.default(); if (!mounted) { mounted = true; focus(); } return root; }
  function findButton(label) { return nodes(root).find(n => n.type === 'Button' && text(n) === label); }
  return {
    calls, render, get root() { return root; }, get blocked() { return blocked; }, get reloads() { return reloads; }, get backs() { return backs; },
    async ready() { render(); await tick(); render(); },
    findButton, async press(label) { const button = findButton(label); assert.ok(button, label); assert.ok(!button.props.disabled, `${label} enabled`); button.props.onPress(); await tick(); render(); },
    ack() { nodes(root).find(n => n.props?.accessibilityRole === 'checkbox').props.onPress(); render(); },
    pin(value) { nodes(root).find(n => n.type === 'Input').props.onChangeText(value); render(); },
  };
}

test('deletion route presents an explicit all-wallet option and per-wallet entry without deleting on navigation', async () => {
  const h = harness(); await h.ready();
  assert.ok(h.findButton('Delete all wallets and wallet data')); assert.match(text(h.root), /Disposable demo/); assert.equal(h.calls.length, 0);
});
test('backup acknowledgement and six-digit passcode are both required', async () => {
  const h = harness({ selected: true }); await h.ready();
  assert.equal(h.findButton('Delete this wallet').props.disabled, true);
  h.pin('482619'); assert.equal(h.findButton('Delete this wallet').props.disabled, true);
  h.ack(); assert.equal(h.findButton('Delete this wallet').props.disabled, false);
  await h.press('Delete this wallet'); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].walletId, wallet.id); assert.equal(h.calls[0].allWallets, false);
  assert.match(text(h.root), /Deletion complete/); assert.equal(h.blocked, true); assert.equal(h.reloads, 0);
  await h.press('Done'); assert.equal(h.reloads, 1);
});
test('cancel does not remove any wallet or leave a destructive selection armed', async () => {
  const h = harness({ selected: true }); await h.ready(); h.ack(); h.pin('482619'); await h.press('Cancel');
  assert.equal(h.calls.length, 0); assert.equal(h.findButton('Delete this wallet'), undefined); assert.equal(h.blocked, false);
});
test('all-wallet deletion is separately selected and has the same backup/authentication checks', async () => {
  const h = harness(); await h.ready(); await h.press('Delete all wallets and wallet data');
  assert.equal(h.findButton('Delete all wallets and wallet data').props.disabled, true);
  h.ack(); h.pin('482619'); await h.press('Delete all wallets and wallet data');
  assert.equal(h.calls[0].allWallets, true); assert.equal(h.calls[0].backupAcknowledged, true);
});
test('an unprotected imported/local wallet can be deleted after explicit backup acknowledgement', async () => {
  const h = harness({ selected: true, protectedApp: false }); await h.ready(); h.ack(); await h.press('Delete this wallet'); assert.equal(h.calls.length, 1);
});
test('wrong passcode clears input, keeps wallet confirmation, and never claims success', async () => {
  const h = harness({ selected: true, deletionError: 'passcode' }); await h.ready(); h.ack(); h.pin('000000'); await h.press('Delete this wallet');
  assert.match(text(h.root), /Wrong passcode/); assert.doesNotMatch(text(h.root), /Deletion complete/); assert.equal(h.blocked, false); assert.equal(h.reloads, 0);
  assert.equal(nodes(h.root).find(n => n.type === 'Input').props.value, '');
});
test('failed storage deletion preserves retry screen and prevents leaving for stale wallet data', async () => {
  const h = harness({ selected: true, deletionError: 'storage' }); await h.ready(); h.ack(); h.pin('482619'); await h.press('Delete this wallet');
  assert.match(text(h.root), /could not be completed/); assert.equal(h.findButton('Cancel'), undefined); assert.equal(h.blocked, true); assert.equal(h.reloads, 0);
  await h.press('Delete this wallet'); assert.equal(h.calls.length, 2);
});
test('corrupt registry does not expose an all-wallet confirmation as if the registry were empty', async () => {
  const h = harness({ listFails: true }); await h.ready(); assert.equal(h.findButton('Delete all wallets and wallet data'), undefined); assert.match(text(h.root), /could not be completed/);
});
test('restart failure does not claim completion of reload or expose old wallets', async () => {
  const h = harness({ selected: true, reloadFails: true }); await h.ready(); h.ack(); h.pin('482619'); await h.press('Delete this wallet'); await h.press('Done');
  assert.match(text(h.root), /Close and reopen/); assert.equal(h.blocked, true);
});
test('all sixteen languages cover every deletion warning, result and action', () => {
  assert.equal(Object.keys(WALLET_DELETION_SLICES).length, 16);
  for (const [language, slice] of Object.entries(WALLET_DELETION_SLICES)) for (const key of WALLET_DELETION_KEYS) {
    assert.equal(typeof slice[key], 'string', `${language}: ${key}`); assert.ok(slice[key].trim());
    if (language !== 'en') assert.notEqual(slice[key], key, `${language}: English fallback`);
  }
});
