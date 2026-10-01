import { useCallback, useEffect, useState } from 'react';
import { noteKey, type NoteTarget } from './model';
import { getNote, subscribeNotes } from './storage';

type NoteState = { key: string; status: 'loading' | 'ready' | 'error'; note: string };

// No persistent plaintext cache. A target change masks the previous value even
// before the effect cleanup, and a late native read cannot cross wallet scopes.
export function useNote(target: NoteTarget) {
  const key = noteKey(target);
  const { network, address, txHash } = target;
  const [state, setState] = useState<NoteState>({ key, status: 'loading', note: '' });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    let alive = true;
    let request = 0;
    const load = async () => {
      const id = ++request;
      try {
        const note = await getNote({ network, address, txHash });
        if (alive && id === request) setState({ key, status: 'ready', note });
      } catch {
        if (alive && id === request) setState({ key, status: 'error', note: '' });
      }
    };
    setState({ key, status: 'loading', note: '' });
    const unsubscribe = subscribeNotes(changedKey => { if (changedKey === key) void load(); });
    void load();
    return () => { alive = false; unsubscribe(); };
  }, [address, key, network, revision, txHash]);

  return { ...(state.key === key ? state : { key, status: 'loading' as const, note: '' }), retry };
}
