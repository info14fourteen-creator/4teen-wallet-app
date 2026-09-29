// A completed deletion finishes by reloading the JS application. Until then,
// stale screens and network callbacks must not recreate data we just erased.
let frozen = false;
const pending = new Set<Promise<unknown>>();

export function guardedWrite<T>(write: () => Promise<T>): Promise<T | undefined> {
  if (frozen) return Promise.resolve(undefined);
  const task = Promise.resolve().then(write);
  pending.add(task);
  void task.then(() => pending.delete(task), () => pending.delete(task));
  return task;
}

export async function freezeLocalWrites(): Promise<void> {
  frozen = true;
  // All mutations admitted before the barrier must settle before erasure.
  await Promise.allSettled([...pending]);
}

export function isLocalDeletionInProgress() {
  return frozen;
}
