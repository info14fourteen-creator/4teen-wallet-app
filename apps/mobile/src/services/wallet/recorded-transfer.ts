import AsyncStorage from '../../privacy/async-storage';

const inflight = new Map<string, { identity: string; promise: Promise<unknown> }>();

export async function getRecordedTransfer(key: string): Promise<{ identity: string; txId: string; context?: unknown } | null> {
  const raw = await AsyncStorage.getItem(`recorded-transfer:v1:${key}`);
  if (raw === null) return null;
  const saved = JSON.parse(raw);
  if (saved.version !== 1 || typeof saved.identity !== 'string' || !/^[a-fA-F0-9]{64}$/.test(saved.txId)) {
    throw new Error('Stored transaction requires reconciliation');
  }
  return saved;
}

export async function acknowledgeRecordedTransfer(key: string, txId: string) {
  if (inflight.has(key)) throw new Error('Transaction is still processing');
  const storageKey = `recorded-transfer:v1:${key}`;
  const raw = await AsyncStorage.getItem(storageKey);
  if (raw === null) return;
  const saved = JSON.parse(raw);
  if (saved.txId !== txId) throw new Error('Transaction acknowledgement mismatch');
  await AsyncStorage.removeItem(storageKey);
}

// Persist the hash before broadcast. An uncertain response must never authorize
// a newly signed payment. Pending/failed hashes require reconciliation, not expiry.
export function runRecordedTransfer<T>(input: {
  key: string;
  identity: string;
  context?: unknown;
  send: (beforeBroadcast: (txId: string, signedTransaction?: unknown) => Promise<void>) => Promise<unknown>;
  confirm: (txId: string, signedTransaction?: unknown) => Promise<T>;
}): Promise<T> {
  const existing = inflight.get(input.key);
  if (existing) {
    if (existing.identity !== input.identity) return Promise.reject(new Error('Transaction intent mismatch'));
    return existing.promise as Promise<T>;
  }
  const promise = (async () => {
    const key = `recorded-transfer:v1:${input.key}`;
    const raw = await AsyncStorage.getItem(key);
    let txId: string | undefined;
    let signedTransaction: unknown;
    if (raw !== null) {
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || saved.identity !== input.identity || !/^[a-fA-F0-9]{64}$/.test(saved.txId)) {
        throw new Error('Stored transaction requires reconciliation');
      }
      txId = saved.txId;
      signedTransaction = saved.signedTransaction;
    } else {
      await input.send(async (hash, transaction) => {
        if (!/^[a-fA-F0-9]{64}$/.test(hash)) throw new Error('Invalid transaction hash');
        await AsyncStorage.setItem(key, JSON.stringify({ version: 1, identity: input.identity, txId: hash, signedTransaction: transaction, context: input.context }));
        txId = hash;
        signedTransaction = transaction;
      });
    }
    if (!txId) throw new Error('Transaction hash was not recorded');
    return input.confirm(txId, signedTransaction);
  })();
  inflight.set(input.key, { identity: input.identity, promise });
  void promise.finally(() => inflight.delete(input.key)).catch(() => {});
  return promise;
}
