/**
 * Learning provider: opens the v2 user database and keeps the worker's learning state in sync.
 *
 * The store is the single writer (Dexie), the worker only reads a snapshot. Every committed store
 * change bumps `version`, which pushes the current records into the worker, so queries with a
 * `learning_status` filter and every DTO status stay consistent with what the user just did.
 *
 * An unavailable IndexedDB (private iframe, storage blocked) is reported as `status: 'error'`
 * while the lexical engine keeps working: browsing must not depend on writable storage.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_EVENT_LIMIT, DexieLearningStore, openDatabase, type LexicalWorkbenchDB } from '../../v2/store/dexieStore.ts';
import type { LearningRecord } from '../../v2/index.ts';
import { useEngine } from './EngineProvider.tsx';

export type LearningStatus = 'loading' | 'ready' | 'error';

export interface LearningContextValue {
  /** null while loading or when storage is unavailable. */
  store: DexieLearningStore | null;
  db: LexicalWorkbenchDB | null;
  records: LearningRecord[];
  /** Increments on every committed store change (subscribe → re-read). */
  version: number;
  status: LearningStatus;
  error: Error | null;
  /** Re-opens the database after a failure. */
  reload: () => void;
  /** Recent events, newest first; `null` until loaded. */
  recentEvents: () => Promise<Awaited<ReturnType<DexieLearningStore['events']>>>;
}

const LearningContext = createContext<LearningContextValue | null>(null);

export function LearningProvider({ children }: { children: ReactNode }) {
  const { client, status: engineStatus } = useEngine();
  const [db, setDb] = useState<LexicalWorkbenchDB | null>(null);
  const [store, setStore] = useState<DexieLearningStore | null>(null);
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<LearningStatus>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const storeRef = useRef<DexieLearningStore | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let opened: LexicalWorkbenchDB | null = null;

    setStatus('loading');
    setError(null);

    try {
      opened = openDatabase();
      const nextStore = new DexieLearningStore(opened);
      nextStore
        .load()
        .then(() => {
          if (cancelled) return;
          storeRef.current = nextStore;
          setDb(opened);
          setStore(nextStore);
          setRecords([...nextStore.all()]);
          setStatus('ready');
          setVersion((n) => n + 1);
          unsubscribe = nextStore.subscribe(() => {
            setRecords([...nextStore.all()]);
            setVersion((n) => n + 1);
          });
        })
        .catch((cause: unknown) => {
          if (cancelled) return;
          setError(cause instanceof Error ? cause : new Error(String(cause)));
          setStatus('error');
        });
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
      setStatus('error');
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
      opened?.close();
    };
  }, [attempt]);

  // Push the snapshot after the engine is ready and after every committed change.
  useEffect(() => {
    const current = storeRef.current;
    if (!current || status !== 'ready' || engineStatus !== 'ready') return;
    void client.syncLearning([...current.all()]).catch(() => {
      // A rejected sync leaves the previous worker snapshot in place; the next change retries.
    });
  }, [client, engineStatus, status, version]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const recentEvents = useCallback(async () => {
    const current = storeRef.current;
    if (!current) return [];
    return current.events({ limit: DEFAULT_EVENT_LIMIT });
  }, []);

  const value = useMemo<LearningContextValue>(
    () => ({ store, db, records, version, status, error, reload, recentEvents }),
    [store, db, records, version, status, error, reload, recentEvents]
  );
  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}

export function useLearning(): LearningContextValue {
  const value = useContext(LearningContext);
  if (!value) throw new Error('useLearning() must be used inside <LearningProvider>');
  return value;
}
