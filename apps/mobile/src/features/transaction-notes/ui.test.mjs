import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const target = { network: 'tron-mainnet', address: 'TN95o1fsA7mNwJGYGedvf3y7DJZKLH6TCT', txHash: 'a'.repeat(64) };
const transaction = { target, title: 'Receive', amount: '+100', tokenLabel: 'USDT', timeLabel: 'Sep 19', statusLabel: 'Success' };
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function textOf(tree) {
  if (Array.isArray(tree)) return tree.map(textOf).join(' ');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? textOf(tree.props?.children) : String(tree);
}
function harness(component = 'TransactionCardContent', initial = '') {
  const hooks = [], effects = [], listeners = new Set(), appListeners = new Set(), alerts = [], writes = [];
  let index = 0, closed = 0, explorer = 0, persisted = initial, props = { transaction, onClose: () => closed++, onOpenExplorer: () => explorer++ };
  const api = { read: async () => persisted, save: async (_target, value) => { persisted = value.trim(); return persisted; } };
  const jsx = (type, props) => ({ type, props });
  function changed(previous, deps) { return !previous || deps === undefined || deps.some((value, i) => value !== previous.deps?.[i]); }
  const react = {
    useState(initial) { const slot = index++; hooks[slot] ??= { value: typeof initial === 'function' ? initial() : initial }; return [hooks[slot].value, value => { hooks[slot].value = typeof value === 'function' ? value(hooks[slot].value) : value; }]; },
    useRef(value) { const slot = index++; return hooks[slot] ??= { current: value }; },
    useCallback(fn, deps) { const slot = index++; if (changed(hooks[slot], deps)) hooks[slot] = { value: fn, deps }; return hooks[slot].value; },
    useEffect(fn, deps) { const slot = index++; if (changed(hooks[slot], deps)) { const previous = hooks[slot]; hooks[slot] = { deps, cleanup: previous?.cleanup }; effects.push(() => { previous?.cleanup?.(); hooks[slot].cleanup = fn(); }); } },
  };
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Text: 'Text', TextInput: 'TextInput', View: 'View',
      Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView',
      Platform: { OS: 'ios' }, StyleSheet: { create: value => value },
      AppState: { currentState: 'active', addEventListener: (_name, fn) => { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; } },
      Alert: { alert: (...args) => alerts.push(args) }, Keyboard: { dismiss() {} },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../../i18n': { useI18n: () => ({ t: (text, params) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(params?.[key] ?? '')) }) },
    '../../theme/tokens': { colors: { accent: 'orange' }, radius: { lg: 24, md: 16 }, fontFamilies: { display: 'Sora' } },
    './note-icon': { NoteIcon: 'NoteIcon' },
    './storage': {
      getNote: (...args) => api.read(...args),
      saveNote: async (...args) => { writes.push(args); const result = await api.save(...args); for (const listener of listeners) listener(modules['./model'].noteKey(args[0])); return result; },
      subscribeNotes: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    },
  };
  function load(name) {
    if (modules[name]) return modules[name];
    const file = name === './model' || name === './use-note' ? name + '.ts' : name + '.tsx';
    const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    new Function('require', 'exports', code)(dependency => {
      if (dependency === 'tronweb') return { TronWeb: { isAddress: value => /^[T][1-9A-HJ-NP-Za-km-z]{33}$/.test(value) } };
      return load(dependency);
    }, exports);
    return modules[name] = exports;
  }
  // Load actual model/hook/component; only native boundaries are substituted.
  load('./model');
  const Component = load(component === 'HistoryNote' ? './history-note' : './transaction-card')[component];
  if (component === 'HistoryNote') props = { target, onPress: () => closed++ };
  const h = {
    api, alerts, writes,
    render() { index = 0; const tree = Component(props); for (const effect of effects.splice(0)) effect(); return tree; },
    async settle() { for (let i = 0; i < 5; i++) { h.render(); await tick(); } return h.render(); },
    find(type, tree = h.render()) { const node = nodes(tree).find(node => node.type === type); assert.ok(node, `Missing ${type}`); return node; },
    button(label, tree = h.render()) { const node = nodes(tree).find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label); assert.ok(node, `Missing button ${label}: ${textOf(tree)}`); return node; },
    press(label) { const button = h.button(label); assert.ok(!button.props.disabled, `Disabled ${label}`); return button.props.onPress(); },
    edit(value) { h.find('TextInput').props.onChangeText(value); },
    background() { for (const listener of appListeners) listener('background'); },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
    update(next) { props = { ...props, ...next }; },
    get closed() { return closed; }, get explorer() { return explorer; }, get persisted() { return persisted; },
  };
  return h;
}

test('loads a note, explicitly saves changes and keeps note out of explorer navigation', async () => {
  const h = harness('TransactionCardContent', 'Rent');
  await h.settle();
  assert.equal(h.find('TextInput').props.value, 'Rent');
  assert.equal(h.button('Save note').props.disabled, true);
  h.edit('Coffee');
  await h.press('Save note');
  await h.settle();
  assert.equal(h.persisted, 'Coffee');
  assert.deepEqual(h.writes, [[target, 'Coffee']]);
  assert.equal(h.button('Save note').props.disabled, true);
  h.press('View on Tronscan');
  assert.equal(h.explorer, 1);
  h.unmount();
});

test('read failure cannot become a blank editable note; retry loads the original', async () => {
  const h = harness('TransactionCardContent', 'Saved');
  h.api.read = async () => { throw new Error('locked'); };
  let tree = await h.settle();
  assert.equal(nodes(tree).some(node => node.type === 'TextInput'), false);
  assert.ok(textOf(tree).includes('Could not load your note. Try again.'));
  h.api.read = async () => 'Saved';
  h.press('Retry');
  await h.settle();
  assert.equal(h.find('TextInput').props.value, 'Saved');
  h.unmount();
});

test('failed writes preserve the draft and previously saved value', async () => {
  const h = harness('TransactionCardContent', 'Original');
  await h.settle(); h.edit('New');
  h.api.save = async () => { throw new Error('disk'); };
  await h.press('Save note');
  const tree = await h.settle();
  assert.equal(h.find('TextInput').props.value, 'New');
  assert.equal(h.persisted, 'Original');
  assert.ok(textOf(tree).includes('Could not save your note. Your changes are still here.'));
  assert.equal(h.button('Save note').props.disabled, false);
  h.unmount();
});

test('delete requires confirmation and leaves the editor empty only after persistence', async () => {
  const h = harness('TransactionCardContent', 'Original');
  await h.settle(); h.press('Delete note');
  assert.equal(h.writes.length, 0);
  await h.alerts.at(-1)[2].find(button => button.style === 'destructive').onPress();
  await h.settle();
  assert.equal(h.persisted, '');
  assert.equal(h.find('TextInput').props.value, '');
  h.unmount();
});

test('dirty close asks before discarding; background closes without keeping a modal over the app lock', async () => {
  const h = harness(); await h.settle(); h.edit('Draft'); h.press('Close');
  assert.equal(h.closed, 0);
  const buttons = h.alerts.at(-1)[2];
  assert.ok(buttons.some(button => button.style === 'cancel'));
  buttons.find(button => button.style === 'destructive').onPress();
  assert.equal(h.closed, 1);
  h.background();
  assert.equal(h.closed, 2);
  assert.equal(h.writes.length, 0);
  h.unmount();
});

test('pending save prevents duplicate submission and close; stale reads do not reset edits', async () => {
  const h = harness(); await h.settle(); h.edit('Draft');
  const pending = deferred(); h.api.save = () => pending.promise;
  const saving = h.press('Save note');
  assert.equal(h.button('Save note').props.disabled, true);
  assert.equal(h.find('TextInput').props.editable, false);
  assert.equal(h.button('Close').props.disabled, true);
  pending.resolve('Draft'); await saving; await h.settle();
  assert.equal(h.find('TextInput').props.value, 'Draft');
  h.unmount();
});

test('120 Unicode code points are counted without truncating emoji halves', async () => {
  const h = harness(); await h.settle(); h.edit('😀'.repeat(121));
  const tree = h.render();
  assert.equal(Array.from(h.find('TextInput', tree).props.value).length, 120);
  assert.ok(textOf(tree).replace(/\s+/g, ' ').includes('120 / 120'));
  h.unmount();
});

test('history has a non-overlapping 48 point action and a two-line preview', async () => {
  const h = harness('HistoryNote', 'A private note'); const tree = await h.settle();
  const button = h.button('Edit note', tree);
  const style = Object.assign({}, ...[button.props.style].flat().filter(Boolean));
  assert.ok(style.minHeight >= 48);
  assert.ok(style.minWidth >= 48);
  assert.ok(nodes(tree).some(node => node.type === 'Text' && node.props.numberOfLines === 2 && textOf(node).includes('A private note')));
  assert.equal(nodes(tree).filter(node => node.type === 'Pressable').length, 1);
  h.unmount();
});

test('wallet switch immediately hides old note and late reads cannot leak into new wallet', async () => {
  const h = harness('HistoryNote', 'Wallet A note');
  const waiting = deferred();
  h.api.read = () => waiting.promise;
  h.render();
  const other = { ...target, address: 'TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL' };
  h.api.read = async () => 'Wallet B note';
  h.update({ target: other });
  assert.ok(!textOf(h.render()).includes('Wallet A note'));
  assert.ok(textOf(await h.settle()).includes('Wallet B note'));
  waiting.resolve('Wallet A note');
  const tree = await h.settle();
  assert.ok(textOf(tree).includes('Wallet B note'));
  assert.ok(!textOf(tree).includes('Wallet A note'));
  h.unmount();
});

test('failed deletion retains the existing note and retry action', async () => {
  const h = harness('TransactionCardContent', 'Original');
  await h.settle();
  h.api.save = async () => { throw new Error('disk'); };
  h.press('Delete note');
  await h.alerts.at(-1)[2].find(button => button.style === 'destructive').onPress();
  const tree = await h.settle();
  assert.equal(h.find('TextInput').props.value, 'Original');
  assert.equal(h.persisted, 'Original');
  assert.ok(textOf(tree).includes('Could not save your note. Your changes are still here.'));
  assert.equal(h.button('Delete note').props.disabled, false);
  h.unmount();
});
