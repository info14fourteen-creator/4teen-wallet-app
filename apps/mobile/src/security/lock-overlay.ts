const listeners = new Set<() => void>();

export function subscribeLockOverlayRelease(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function releaseLockOverlay() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {}
  }
}
