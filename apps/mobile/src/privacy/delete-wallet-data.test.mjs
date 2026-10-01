import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const LIST = 'fourteen_wallet_list_v1', ACTIVE = 'fourteen_active_wallet_id_v1';
const PIN = 'fourteen_wallet_local_passcode_v1';
const CONTACTS = 'fourteen_wallet_address_book_v3', RECENT = 'fourteen_wallet_recent_recipients_v1';
const A = { id: 'wallet_1', name: 'Disposable A', address: 'TAddressOne', kind: 'mnemonic' };
const B = { id: 'wallet_10', name: 'Keep B', address: 'TAddressTwo', kind: 'private-key' };
const secret = w => `fourteen_wallet_secret_${w.id}`;
const request = { walletId: A.id, backupAcknowledged: true, passcode: '482619' };

function harness(wallets = [A, B]) {
  const data = new Map([[LIST, JSON.stringify(wallets)], [ACTIVE, A.id], ['settings.language.v1', 'ru'],
    [`wallet.homeVisibleTokenIds.v2:${A.id}`, 'A tokens'], [`wallet.customTokenCatalog.v2:${A.id}`, 'custom'],
    [`wallet.homeVisibleTokenIds.v2:${B.id}`, 'B tokens'],
    [`fourteen_token_history_cache_v11:${A.address.toLowerCase()}:USDT`, 'history'],
    [`wallet_history_cache_v4:${A.address.toLowerCase()}:20`, 'history'],
    [`ambassador:${A.address.toLowerCase()}`, 'identity'],
    [`airdrop:${A.address.toLowerCase()}`, 'records'],
    [`portfolio:${B.address.toLowerCase()}`, 'B portfolio'],
    ['fourteen_swap_draft_v1', JSON.stringify({ walletId: A.id })],
    ['fourteen_direct_buy_draft_v1', 'draft']]);
  const secure = new Map([[PIN, request.passcode], [secret(A), 'test-only A'], [secret(B), 'test-only B'],
    [CONTACTS, JSON.stringify([{ address: A.address }, { address: B.address }])],
    [RECENT, JSON.stringify([{ address: A.address }, { address: B.address }])],
    ['fourteen_wallet_biometrics_enabled_v1', 'true'], ['fourteen_wallet_auto_lock_mode_v1', '1m']]);
  const faults = { secret: false, silentSecret: false, registry: false, asyncSilent: false };
  const storage = {
    getItem: async k => data.get(k) ?? null, getAllKeys: async () => [...data.keys()],
    setItem: async (k, v) => { if (faults.registry && k === LIST) throw Error('failure'); data.set(k, v); },
    removeItem: async k => { data.delete(k); },
    multiRemove: async keys => { if (!faults.asyncSilent) keys.forEach(k => data.delete(k)); },
    multiSet: async pairs => { pairs.forEach(([k, v]) => data.set(k, v)); },
    mergeItem: async (k, v) => { data.set(k, v); }, multiMerge: async () => {}, clear: async () => data.clear(),
  };
  const nativeSecure = {
    getItemAsync: async k => secure.get(k) ?? null,
    setItemAsync: async (k, v) => { secure.set(k, v); },
    deleteItemAsync: async k => {
      if (k === secret(A) && faults.secret) throw Error('failure');
      if (!(k === secret(A) && faults.silentSecret)) secure.delete(k);
    },
  };
  const deletedNoteAddresses = [];
  const modules = {
    '@react-native-async-storage/async-storage': storage, 'expo-secure-store': nativeSecure,
    '../features/transaction-notes/storage': {
      deleteNotesForAddress: async (network, address) => { assert.equal(network, 'tron-mainnet'); deletedNoteAddresses.push(address); },
    },
  };
  function load(name) {
    if (name in modules) return modules[name];
    const filename = name.replace(/^\.\//, '');
    const source = readFileSync(new URL(`./${filename}.ts`, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const exports = {};
    new Function('require', 'exports', compiled)(load, exports);
    modules[name] = exports;
    return exports;
  }
  return { data, secure, faults, deletedNoteAddresses, engine: load('./delete-wallet-data'), barrier: load('./deletion-barrier'), storage: load('./async-storage').default, keychain: load('./secure-store') };
}

test('single deletion erases its secret, all scoped caches, contacts and active drafts, preserving another wallet', async () => {
  const h = harness(); await h.engine.deleteWalletData(request);
  assert.deepEqual(h.deletedNoteAddresses, [A.address]);
  assert.equal(h.secure.has(secret(A)), false);
  assert.equal(h.secure.get(secret(B)), 'test-only B');
  assert.deepEqual(JSON.parse(h.data.get(LIST)), [B]); assert.equal(h.data.get(ACTIVE), B.id);
  assert.equal(h.data.get(`wallet.homeVisibleTokenIds.v2:${B.id}`), 'B tokens');
  assert.equal(h.data.get(`portfolio:${B.address.toLowerCase()}`), 'B portfolio');
  assert.equal(h.data.get('settings.language.v1'), 'ru'); assert.equal(h.secure.get(PIN), request.passcode);
  for (const key of h.data.keys()) assert.equal(h.engine.belongsToWallet(key, [A]), false, key);
  assert.equal(h.data.has('fourteen_swap_draft_v1'), false); assert.equal(h.data.has('fourteen_direct_buy_draft_v1'), false);
  for (const key of [CONTACTS, RECENT]) assert.deepEqual(JSON.parse(h.secure.get(key)), [{ address: B.address }]);
});

test('delete all erases wallet registry, all local preferences and all known wallet/security keys', async () => {
  const h = harness(); await h.engine.deleteWalletData({ ...request, allWallets: true });
  assert.equal(h.data.size, 0); assert.equal(h.secure.size, 0); assert.equal(h.barrier.isLocalDeletionInProgress(), true);
});

test('deleting the last wallet clears active selection without clearing unrelated preferences', async () => {
  const h = harness([A]); await h.engine.deleteWalletData(request);
  assert.equal(h.data.has(LIST), false); assert.equal(h.data.has(ACTIVE), false); assert.equal(h.data.get('settings.language.v1'), 'ru');
});

for (const [label, override, code] of [['missing backup', { backupAcknowledged: false }, 'backup'], ['incorrect passcode', { passcode: '000000' }, 'passcode'], ['unknown wallet', { walletId: 'unknown' }, 'missing']]) {
  test(`${label} cannot mutate or freeze any data`, async () => {
    const h = harness(), before = [...h.data], secrets = [...h.secure];
    await assert.rejects(h.engine.deleteWalletData({ ...request, ...override }), e => e.code === code);
    assert.deepEqual([...h.data], before); assert.deepEqual([...h.secure], secrets);
    assert.equal(h.barrier.isLocalDeletionInProgress(), false);
  });
}

for (const corrupt of ['registry', 'contacts', 'draft']) {
  test(`corrupt ${corrupt} fails safely before secret erasure`, async () => {
    const h = harness();
    if (corrupt === 'contacts') h.secure.set(CONTACTS, '{');
    else h.data.set(corrupt === 'registry' ? LIST : 'fourteen_swap_draft_v1', '{');
    await assert.rejects(h.engine.deleteWalletData(request), e => e.code === 'storage');
    assert.equal(h.secure.get(secret(A)), 'test-only A'); assert.equal(h.barrier.isLocalDeletionInProgress(), false);
  });
}

for (const fault of ['secret', 'silentSecret', 'registry', 'asyncSilent']) {
  test(`${fault} failure is not reported as success; original registry survives and retry completes`, async () => {
    const h = harness(); h.faults[fault] = true;
    await assert.rejects(h.engine.deleteWalletData(request), e => e.code === 'storage');
    assert.deepEqual(JSON.parse(h.data.get(LIST)), [A, B]); assert.equal(h.barrier.isLocalDeletionInProgress(), true);
    h.faults[fault] = false; await h.engine.deleteWalletData(request);
    assert.deepEqual(JSON.parse(h.data.get(LIST)), [B]); assert.equal(h.secure.has(secret(A)), false);
  });
}

test('non-active wallet deletion preserves another wallet’s drafts and selection', async () => {
  const h = harness(); h.data.set(ACTIVE, B.id); h.data.set('fourteen_swap_draft_v1', JSON.stringify({ walletId: B.id }));
  await h.engine.deleteWalletData(request);
  assert.equal(h.data.get(ACTIVE), B.id); assert.ok(h.data.has('fourteen_swap_draft_v1')); assert.ok(h.data.has('fourteen_direct_buy_draft_v1'));
});

test('legacy active draft is erased; wallet ID prefixes never match other wallets', async () => {
  const h = harness(); h.data.set('fourteen_swap_draft_v1', '{}'); await h.engine.deleteWalletData(request);
  assert.equal(h.data.has('fourteen_swap_draft_v1'), false);
  assert.equal(h.engine.belongsToWallet('cache:wallet_10', [A]), false);
});

test('concurrent deletion and a different retry target are refused', async () => {
  const h = harness(); h.faults.secret = true;
  const first = h.engine.deleteWalletData(request);
  await assert.rejects(h.engine.deleteWalletData(request), e => e.code === 'busy');
  await assert.rejects(first, e => e.code === 'storage');
  await assert.rejects(h.engine.deleteWalletData({ ...request, walletId: B.id }), e => e.code === 'busy');
});

test('in-flight writes drain before erasure; late AsyncStorage/SecureStore callbacks cannot restore data', async () => {
  const h = harness(); let release;
  const writing = h.barrier.guardedWrite(() => new Promise(resolve => { release = () => { h.data.set(`late:${A.id}`, 'private'); resolve(); }; }));
  await Promise.resolve(); const deleting = h.engine.deleteWalletData(request);
  while (!h.barrier.isLocalDeletionInProgress()) await Promise.resolve();
  assert.equal(h.secure.get(secret(A)), 'test-only A');
  release(); await writing; await deleting;
  await h.storage.setItem(`late:${A.id}`, 'restored'); await h.storage.multiSet([[LIST, 'restored']]);
  await h.keychain.setItemAsync(secret(A), 'restored'); await h.storage.clear(); await h.keychain.deleteItemAsync(secret(B));
  assert.equal(h.data.has(`late:${A.id}`), false); assert.equal(h.secure.has(secret(A)), false);
  assert.deepEqual(JSON.parse(h.data.get(LIST)), [B]); assert.equal(h.secure.get(secret(B)), 'test-only B');
});

test('all production storage mutations use guarded adapters; old unauthenticated removeWallet is gone', () => {
  const root = new URL('../../', import.meta.url);
  function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
  for (const file of [...walk(fileURLToPath(new URL('app', root))), ...walk(fileURLToPath(new URL('src', root)))].filter(f => /\.tsx?$/.test(f))) {
    // Transaction notes use the native store for both ordinary guarded writes
    // and the explicit post-freeze deletion sweep.
    if (/\/privacy\/(async-storage|secure-store|delete-wallet-data)\.ts$/.test(file) ||
      /\/features\/transaction-notes\/storage\.ts$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /from ['"](?:@react-native-async-storage\/async-storage|expo-secure-store)['"]/, file);
    assert.doesNotMatch(source, /\bremoveWallet\(/, file);
  }
});
