import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tronweb = require('tronweb');
const ADDRESS_A = 'TN95o1fsA7mNwJGYGedvf3y7DJZKLH6TCT';
const ADDRESS_B = 'TSbK3B9cgkVEYtipqZzeE9trChd8QmZkqp';
const HASH = 'abcdef0123456789'.repeat(4);
const TARGET = { network: 'tron-mainnet', address: ADDRESS_A, txHash: HASH };

// Execute the actual TypeScript modules. Only unavailable native/app boundaries
// are substituted; validation, persistence, queues and subscriptions stay real.
function loadModule(relativePath, dependencies) {
  const url = new URL(relativePath, import.meta.url);
  assert.ok(existsSync(url), `Missing production module: ${relativePath}`);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: name => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console: new Proxy({}, { get: () => () => assert.fail('Notes must not be logged') }),
    fetch: () => assert.fail('Notes must not use the network'),
  }, { filename: url.pathname });
  return module.exports;
}

function loadModel() {
  return loadModule('./model.ts', { tronweb });
}

test('keys preserve Base58 case, canonicalize hash hex and are native-key safe', () => {
  const { noteKey } = loadModel();
  const key = noteKey(TARGET);
  assert.match(key, /^[A-Za-z0-9._-]+$/);
  assert.ok(key.includes(ADDRESS_A));
  assert.ok(key.includes(HASH));
  assert.equal(noteKey({ ...TARGET, txHash: HASH.toUpperCase() }), key);
  assert.notEqual(noteKey({ ...TARGET, address: ADDRESS_B }), key);
  assert.notEqual(noteKey({ ...TARGET, txHash: '0'.repeat(64) }), key);
});

test('a watch-only upgrade or wallet ID change keeps the same note target', () => {
  const { noteKey } = loadModel();
  assert.equal(
    noteKey({ ...TARGET, walletId: 'watch-wallet', kind: 'watch-only' }),
    noteKey({ ...TARGET, walletId: 'imported-wallet', kind: 'mnemonic' }),
  );
});

test('invalid networks, non-Base58 addresses and bad checksums reject', () => {
  const { noteKey } = loadModel();
  for (const address of [
    '', 'T'.repeat(34), ADDRESS_A.toLowerCase(),
    `${ADDRESS_A.slice(0, -1)}U`, `t${ADDRESS_A.slice(1)}`,
    ` ${ADDRESS_A}`, `${ADDRESS_A}\n`,
    '41857fa6ff9cc8f786841596b2e915e78ecdc887e5', null, 42,
  ]) {
    assert.throws(() => noteKey({ ...TARGET, address }));
  }
  for (const network of ['tron-testnet', '', undefined]) {
    assert.throws(() => noteKey({ ...TARGET, network }));
  }
  assert.throws(() => noteKey(null));
});

test('only exactly 64 hexadecimal transaction characters are accepted', () => {
  const { noteKey } = loadModel();
  for (const txHash of ['', HASH.slice(1), `${HASH}0`, `0x${HASH}`, 'z'.repeat(64),
    `${HASH}\n`, ` ${HASH}`, null, 42]) {
    assert.throws(() => noteKey({ ...TARGET, txHash }));
  }
});

test('normalization trims outer whitespace without changing interior text', () => {
  const { normalizeNote } = loadModel();
  assert.equal(normalizeNote(' \n  Rent  🏠\nSeptember \t '), 'Rent  🏠\nSeptember');
  assert.equal(normalizeNote('\t\n\u00a0 '), '');
  assert.equal(normalizeNote('e\u0301'), 'e\u0301');
  for (const value of [null, undefined, 42, {}]) {
    assert.throws(() => normalizeNote(value));
  }
});

test('120 Unicode code points fit; 121 reject without truncating', () => {
  const { normalizeNote, NOTE_MAX_LENGTH } = loadModel();
  assert.equal(NOTE_MAX_LENGTH, 120);
  assert.equal(normalizeNote(`  ${'📝'.repeat(120)} \n`), '📝'.repeat(120));
  assert.equal(normalizeNote('e\u0301'.repeat(60)), 'e\u0301'.repeat(60));
  assert.throws(() => normalizeNote('📝'.repeat(121)));
  assert.throws(() => normalizeNote(`${'e\u0301'.repeat(60)}!`));
});

function createNativeStore() {
  const values = new Map();
  const calls = [];
  const before = {};
  const native = {
    // A sentinel distinct from the default accessibility constant.
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
    async getItemAsync(key, options) {
      calls.push({ operation: 'read', key, options });
      await before.read?.(key);
      return values.has(key) ? values.get(key) : null;
    },
    async setItemAsync(key, value, options) {
      calls.push({ operation: 'write', key, value, options });
      await before.write?.(key, value);
      values.set(key, value);
    },
    async deleteItemAsync(key, options) {
      calls.push({ operation: 'delete', key, options });
      await before.delete?.(key);
      values.delete(key);
    },
  };
  return { values, calls, before, native };
}

function loadStorage(boundary = createNativeStore()) {
  const model = loadModel();
  const storage = loadModule('./storage.ts', {
    './model': model,
    'expo-secure-store': boundary.native,
    '../../privacy/deletion-barrier': { guardedWrite: write => Promise.resolve().then(write) },
  });
  return { ...storage, ...model, boundary };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('save, edit and empty deletion persist individually with device-only options', async () => {
  const { getNote, saveNote, noteKey, boundary } = loadStorage();
  const key = noteKey(TARGET);
  assert.equal(await getNote(TARGET), '');
  assert.equal(await saveNote(TARGET, '  Rent 🏠  '), 'Rent 🏠');
  assert.equal(boundary.values.size, 2, 'One note and one deletion index');
  assert.equal(await getNote(TARGET), 'Rent 🏠');
  assert.equal(await saveNote(TARGET, 'September'), 'September');
  assert.equal(await getNote(TARGET), 'September');
  assert.equal(await saveNote(TARGET, ' \n\t '), '');
  assert.equal(boundary.values.size, 0, 'Empty notes remove the native entry');
  assert.equal(await getNote(TARGET), '');
  assert.equal(await saveNote(TARGET, ''), '', 'Deletion of an absent note is safe');
  assert.ok(boundary.calls.some(call => call.operation === 'write' && call.key === key));
  for (const call of boundary.calls) {
    assert.ok(call.key === key || call.key.includes('transaction_note_index_v1'));
    assert.equal(call.options?.keychainAccessible, 7);
  }
});

test('notes survive module restart and stay separate by address and transaction', async () => {
  const boundary = createNativeStore();
  const initial = loadStorage(boundary);
  const walletB = { ...TARGET, address: ADDRESS_B };
  const transactionB = { ...TARGET, txHash: '1'.repeat(64) };
  await initial.saveNote({ ...TARGET, walletId: 'watch-wallet' }, 'Rent');
  assert.equal(await initial.getNote(walletB), '');
  assert.equal(await initial.getNote(transactionB), '');
  await initial.saveNote(walletB, 'Groceries');
  await initial.saveNote(transactionB, 'Refund');
  const restarted = loadStorage(boundary);
  assert.equal(await restarted.getNote({ ...TARGET, walletId: 'new-wallet', txHash: HASH.toUpperCase() }), 'Rent');
  assert.equal(await restarted.getNote(walletB), 'Groceries');
  assert.equal(await restarted.getNote(transactionB), 'Refund');
  await restarted.saveNote(TARGET, '');
  assert.equal(await loadStorage(boundary).getNote(TARGET), '');
  assert.equal(await restarted.getNote(walletB), 'Groceries');
});

test('wallet-data cleanup removes only that address\'s private notes', async () => {
  const boundary = createNativeStore();
  const storage = loadStorage(boundary);
  const otherAddress = { ...TARGET, address: ADDRESS_B };
  const otherTx = { ...TARGET, txHash: '1'.repeat(64) };
  await storage.saveNote(TARGET, 'First');
  await storage.saveNote(otherTx, 'Second');
  await storage.saveNote(otherAddress, 'Keep');
  await storage.deleteNotesForAddress('tron-mainnet', ADDRESS_A);
  const restarted = loadStorage(boundary);
  assert.equal(await restarted.getNote(TARGET), '');
  assert.equal(await restarted.getNote(otherTx), '');
  assert.equal(await restarted.getNote(otherAddress), 'Keep');
  assert.ok([...boundary.values.keys()].every(key => !key.includes(ADDRESS_A)));
});

test('invalid input rejects before any native call and preserves existing content', async () => {
  const { getNote, saveNote, subscribeNotes, boundary } = loadStorage();
  await saveNote(TARGET, 'Previous');
  const saved = [...boundary.values];
  const events = [];
  subscribeNotes(key => events.push(key));
  boundary.calls.length = 0;
  for (const target of [null, { ...TARGET, network: 'tron-testnet' },
    { ...TARGET, address: 'T'.repeat(34) }, { ...TARGET, txHash: 'bad' }]) {
    await assert.rejects(getNote(target));
    await assert.rejects(saveNote(target, 'Rejected'));
  }
  await assert.rejects(saveNote(TARGET, '📝'.repeat(121)));
  await assert.rejects(saveNote(TARGET, null));
  assert.deepEqual(boundary.calls, []);
  assert.deepEqual([...boundary.values], saved);
  assert.deepEqual(events, []);
  assert.equal(await getNote(TARGET), 'Previous');
  assert.equal(await saveNote(TARGET, '📝'.repeat(120)), '📝'.repeat(120));
  assert.equal(await getNote(TARGET), '📝'.repeat(120));
});

test('native read failures reject even after a successful read, never return stale or empty data', async () => {
  const { getNote, saveNote, boundary } = loadStorage();
  await saveNote(TARGET, 'Previous');
  assert.equal(await getNote(TARGET), 'Previous');
  const failure = new Error('Device is locked');
  boundary.before.read = () => { throw failure; };
  await assert.rejects(getNote(TARGET), error => error === failure);
  await assert.rejects(getNote({ ...TARGET, address: ADDRESS_B }), error => error === failure);
  delete boundary.before.read;
  assert.equal(await getNote(TARGET), 'Previous');
});

for (const operation of ['write', 'delete']) {
  test(`native ${operation} failures reject, preserve the note and do not notify`, async () => {
    const { getNote, saveNote, subscribeNotes, boundary } = loadStorage();
    await saveNote(TARGET, 'Previous');
    const saved = [...boundary.values];
    const events = [];
    subscribeNotes(key => events.push(key));
    const failure = new Error('Native operation failed');
    boundary.before[operation] = () => { throw failure; };
    await assert.rejects(saveNote(TARGET, operation === 'write' ? 'Replacement' : ''),
      error => error === failure);
    assert.deepEqual([...boundary.values], saved);
    assert.deepEqual(events, []);
    assert.equal(await getNote(TARGET), 'Previous');
    delete boundary.before[operation];
    assert.equal(await saveNote(TARGET, 'Retry'), 'Retry');
    assert.equal(await getNote(TARGET), 'Retry');
  });
}

test('malformed, wrong-version and invalid persisted values reject instead of becoming empty notes', async () => {
  const { getNote, saveNote, noteKey, boundary } = loadStorage();
  await saveNote(TARGET, 'Previous');
  const key = noteKey(TARGET);
  const valid = boundary.values.get(key);
  const payload = JSON.parse(valid);
  const corruptValues = [
    '', 'broken JSON', 'null', 'false', '42', '[]', '{}', '"plain text"',
    JSON.stringify({ ...payload, version: 999 }),
    ...[null, 42, {}, '', '   ', ' untrimmed ', '📝'.repeat(201)]
      .map(text => JSON.stringify({ ...payload, text })),
  ];
  for (const corrupt of corruptValues) {
    boundary.values.set(key, corrupt);
    await assert.rejects(getNote(TARGET));
    assert.equal(boundary.values.get(key), corrupt, 'A failed read must not overwrite data');
  }
  boundary.values.set(key, valid);
  assert.equal(await getNote(TARGET), 'Previous');
});

test('notifications follow persistence, contain only the key and can be unsubscribed', async () => {
  const { saveNote, subscribeNotes, noteKey, boundary } = loadStorage();
  const started = deferred();
  const gate = deferred();
  boundary.before.write = () => { started.resolve(); return gate.promise; };
  const events = [];
  const unsubscribe = subscribeNotes((...args) => {
    events.push({ args, exists: boundary.values.has(args[0]) });
  });
  const saving = saveNote(TARGET, 'Private note');
  await started.promise;
  assert.deepEqual(events, []);
  gate.resolve();
  await saving;
  await saveNote(TARGET, '');
  assert.deepEqual(events, [
    { args: [noteKey(TARGET)], exists: true },
    { args: [noteKey(TARGET)], exists: false },
  ]);
  unsubscribe();
  unsubscribe();
  await saveNote(TARGET, 'Another note');
  assert.equal(events.length, 2);
});

test('throwing and asynchronously rejecting listeners cannot fail a committed save or other listeners', async () => {
  const { getNote, saveNote, subscribeNotes, noteKey } = loadStorage();
  subscribeNotes(() => { throw new Error('Listener failed'); });
  subscribeNotes(async () => { throw new Error('Async listener failed'); });
  const events = [];
  subscribeNotes(key => events.push(key));
  assert.equal(await saveNote(TARGET, 'Committed'), 'Committed');
  assert.equal(await getNote(TARGET), 'Committed');
  assert.equal(await saveNote(TARGET, ''), '');
  assert.equal(await getNote(TARGET), '');
  await setImmediate();
  assert.deepEqual(events, [noteKey(TARGET), noteKey(TARGET)]);
});

test('same-key writes serialize, including mixed hash case; reads wait for all earlier writes', async () => {
  const { getNote, saveNote, noteKey, boundary } = loadStorage();
  const firstStarted = deferred();
  const secondStarted = deferred();
  const firstGate = deferred();
  const secondGate = deferred();
  let writes = 0;
  boundary.before.write = key => {
    if (key !== noteKey(TARGET)) return;
    if (++writes === 1) { firstStarted.resolve(); return firstGate.promise; }
    secondStarted.resolve();
    return secondGate.promise;
  };
  const first = saveNote(TARGET, 'First');
  const second = saveNote({ ...TARGET, txHash: HASH.toUpperCase() }, 'Second');
  const reading = getNote(TARGET);
  await firstStarted.promise;
  await setImmediate();
  assert.equal(boundary.calls.filter(call => call.operation === 'write' && call.key === noteKey(TARGET)).length, 1);
  firstGate.resolve();
  await secondStarted.promise;
  await setImmediate();
  assert.equal(boundary.calls.filter(call => call.operation === 'write' && call.key === noteKey(TARGET)).length, 2);
  secondGate.resolve();
  assert.deepEqual(await Promise.all([first, second, reading]), ['First', 'Second', 'Second']);
});

test('delete waits for a previous save and the following read waits for deletion', async () => {
  const { getNote, saveNote, noteKey, boundary } = loadStorage();
  const started = deferred();
  const gate = deferred();
  boundary.before.write = key => { if (key === noteKey(TARGET)) { started.resolve(); return gate.promise; } };
  const saving = saveNote(TARGET, 'First');
  const deleting = saveNote(TARGET, '');
  const reading = getNote(TARGET);
  await started.promise;
  await setImmediate();
  assert.equal(boundary.calls.filter(call => call.operation === 'write' && call.key === noteKey(TARGET)).length, 1);
  gate.resolve();
  assert.deepEqual(await Promise.all([saving, deleting, reading]), ['First', '', '']);
  assert.equal(boundary.values.size, 0);
});

test('a save waits for pending deletion and is not erased by that deletion', async () => {
  const { getNote, saveNote, noteKey, boundary } = loadStorage();
  await saveNote(TARGET, 'Previous');
  boundary.calls.length = 0;
  const started = deferred();
  const gate = deferred();
  boundary.before.delete = () => { started.resolve(); return gate.promise; };
  const deleting = saveNote(TARGET, '');
  const saving = saveNote(TARGET, 'Replacement');
  const reading = getNote(TARGET);
  await started.promise;
  await setImmediate();
  assert.equal(boundary.calls.filter(call => call.operation === 'delete' && call.key === noteKey(TARGET)).length, 1);
  gate.resolve();
  assert.deepEqual(await Promise.all([deleting, saving, reading]), ['', 'Replacement', 'Replacement']);
});

test('a failed queued write does not poison the next write or waiting read', async () => {
  const { getNote, saveNote, boundary } = loadStorage();
  const started = deferred();
  const gate = deferred();
  let writes = 0;
  boundary.before.write = () => {
    if (++writes === 1) { started.resolve(); return gate.promise; }
  };
  const failure = new Error('First write failed');
  const failed = assert.rejects(saveNote(TARGET, 'Rejected'), error => error === failure);
  const saving = saveNote(TARGET, 'Recovered');
  const reading = getNote(TARGET);
  await started.promise;
  gate.reject(failure);
  await failed;
  assert.equal(await saving, 'Recovered');
  assert.equal(await reading, 'Recovered');
});

test('one blocked address does not block another address', { timeout: 2000 }, async () => {
  const { getNote, saveNote, noteKey, boundary } = loadStorage();
  const started = deferred();
  const gate = deferred();
  boundary.before.write = key => {
    if (key === noteKey(TARGET)) { started.resolve(); return gate.promise; }
  };
  const blocked = saveNote(TARGET, 'Blocked');
  try {
    await started.promise;
    for (const target of [{ ...TARGET, address: ADDRESS_B }]) {
      assert.equal(await saveNote(target, 'Independent'), 'Independent');
      assert.equal(await getNote(target), 'Independent');
    }
  } finally {
    gate.resolve();
    await blocked;
  }
});

test('real clearAllAppCaches execution leaves notes intact across storage restart', async () => {
  const boundary = createNativeStore();
  await loadStorage(boundary).saveNote(TARGET, 'Survives cache clearing');
  const caches = [];
  const dependencies = {};
  // The coordinator stays real. Its cache services depend on native/network
  // runtimes, so give each an isolated disposable cache at that boundary.
  for (const [path, name] of [
    ['./asset-wallets', 'clearAssetWalletsCaches'],
    ['./ambassador', 'clearAmbassadorCaches'],
    ['./direct-buy', 'clearDirectBuyCaches'],
    ['./liquidity-controller', 'clearLiquidityControllerCaches'],
    ['./tron/api', 'clearAllTronCaches'],
    ['./unlock-timeline', 'clearUnlockTimelineCaches'],
    ['./wallet/portfolio', 'clearAllWalletPortfolioCaches'],
    ['./wallet/resources', 'clearWalletResourcePricingCache'],
    ['./wallet/send', 'clearSendAssetCaches'],
  ]) {
    const cache = new Map([['cached-item', 'disposable']]);
    caches.push(cache);
    dependencies[path] = { [name]: async () => { cache.clear(); } };
  }
  const { clearAllAppCaches } = loadModule('../../services/app-cache.ts', dependencies);
  await clearAllAppCaches();
  assert.ok(caches.every(cache => cache.size === 0));
  assert.equal(await loadStorage(boundary).getNote(TARGET), 'Survives cache clearing');
});
