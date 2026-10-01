import * as SecureStore from 'expo-secure-store';
import { normalizeNote, noteKey, type NoteTarget } from './model';
import { guardedWrite } from '../../privacy/deletion-barrier';

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const pendingWrites = new Map<string, Promise<void>>();
const listeners = new Set<(key: string) => void>();

function indexKey(target: NoteTarget): string {
  // noteKey validates both the Base58 address and the network.
  noteKey(target);
  return `fourteen_transaction_note_index_v1.${target.network}.${target.address}`;
}

async function readIndex(key: string): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(key, STORE_OPTIONS);
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' ||
    !/^[a-f0-9]{64}$/.test(item)) || new Set(value).size !== value.length) {
    throw new Error('Invalid stored transaction note index');
  }
  return value;
}

async function writeIndex(key: string, hashes: string[]): Promise<void> {
  if (hashes.length) await SecureStore.setItemAsync(key, JSON.stringify(hashes), STORE_OPTIONS);
  else await SecureStore.deleteItemAsync(key, STORE_OPTIONS);
}

export async function getNote(target: NoteTarget): Promise<string> {
  const key = noteKey(target);
  await pendingWrites.get(indexKey(target));
  const raw = await SecureStore.getItemAsync(key, STORE_OPTIONS);
  if (raw === null) return '';

  // Only a missing native entry means "no note". Malformed or unsupported
  // payloads must not silently enable an editor with a false empty draft.
  const payload: unknown = JSON.parse(raw);
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('version' in payload) || payload.version !== 1 ||
    !('text' in payload) || typeof payload.text !== 'string' ||
    !payload.text || normalizeNote(payload.text) !== payload.text
  ) {
    throw new Error('Invalid stored transaction note');
  }
  return payload.text;
}

export async function saveNote(target: NoteTarget, text: string): Promise<string> {
  const key = noteKey(target);
  const index = indexKey(target);
  const hash = target.txHash.toLowerCase();
  const normalized = normalizeNote(text);
  const previous = pendingWrites.get(index) ?? Promise.resolve();
  const write = guardedWrite(() => previous.then(async () => {
    const hashes = await readIndex(index);
    if (normalized) {
      // Index first: a failed note write leaves only a harmless index entry,
      // never an unenumerable personal note after wallet deletion.
      if (!hashes.includes(hash)) await writeIndex(index, [...hashes, hash]);
      await SecureStore.setItemAsync(key, JSON.stringify({ version: 1, text: normalized }), STORE_OPTIONS);
    } else {
      await SecureStore.deleteItemAsync(key, STORE_OPTIONS);
      if (hashes.includes(hash)) await writeIndex(index, hashes.filter(item => item !== hash));
    }

    for (const listener of Array.from(listeners)) {
      try {
        // Notification failures cannot turn a committed native write into a
        // failed save, including listeners that happen to return a promise.
        void Promise.resolve(listener(key)).catch(() => {});
      } catch {
        // Keep notifying the remaining subscribers without logging note data.
      }
    }
    return normalized;
  })).then(value => {
    if (value === undefined) throw new Error('Wallet data is being deleted');
    return value;
  });

  // Queue only completion, not the value or failure. The caller still receives
  // the original rejection, while later operations can retry this same key.
  const settled = write.then(() => {}, () => {});
  pendingWrites.set(index, settled);
  void settled.then(() => {
    if (pendingWrites.get(index) === settled) pendingWrites.delete(index);
  });
  return write;
}

export async function deleteNotesForAddress(network: NoteTarget['network'], address: string): Promise<void> {
  const target: NoteTarget = { network, address, txHash: '0'.repeat(64) };
  const index = indexKey(target);
  const deletion = (pendingWrites.get(index) ?? Promise.resolve()).then(async () => {
    const hashes = await readIndex(index);
    for (const txHash of hashes) {
      const key = noteKey({ network, address, txHash });
      await SecureStore.deleteItemAsync(key, STORE_OPTIONS);
      for (const listener of Array.from(listeners)) {
        try { void Promise.resolve(listener(key)).catch(() => {}); } catch { /* Continue cleanup. */ }
      }
    }
    await SecureStore.deleteItemAsync(index, STORE_OPTIONS);
  });
  const settled = deletion.then(() => {}, () => {});
  pendingWrites.set(index, settled);
  void settled.then(() => { if (pendingWrites.get(index) === settled) pendingWrites.delete(index); });
  return deletion;
}

export function subscribeNotes(listener: (key: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
