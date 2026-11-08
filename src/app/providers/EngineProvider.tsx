/**
 * Engine provider: owns the single RPC client for the session.
 *
 * The worker builds its index lazily on the first request, so `ready()` is both the ping and the
 * loading state. A failure keeps the client usable for a retry (a fetch problem is transient); the
 * retry path replaces the worker entirely, which is the only correct recovery after a crash.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EngineClient, EngineClientError, createEngineClient } from '../../v2/worker/client.ts';
import type { LexicalEngineApi } from '../../v2/index.ts';

export type EngineStatus = 'loading' | 'ready' | 'error';
export type EngineReadyInfo = Awaited<ReturnType<LexicalEngineApi['ready']>>;

export interface EngineContextValue {
  client: EngineClient;
  status: EngineStatus;
  ready: EngineReadyInfo | null;
  error: EngineClientError | Error | null;
  /** Replaces the worker and starts the session again. */
  retry: () => void;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<EngineClient>(() => createEngineClient());
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<EngineStatus>('loading');
  const [ready, setReady] = useState<EngineReadyInfo | null>(null);
  const [error, setError] = useState<EngineClientError | Error | null>(null);
  const ownedClients = useRef<EngineClient[]>([]);

  // Track every client this provider created so a retry/unmount can terminate the old worker.
  if (!ownedClients.current.includes(client)) ownedClients.current.push(client);

  useEffect(() => {
    const current = client;
    let cancelled = false;
    setStatus('loading');
    setError(null);

    current
      .ready()
      .then((info) => {
        if (cancelled) return;
        setReady(info);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [client, attempt]);

  const retry = useCallback(() => {
    const previous = ownedClients.current;
    const next = createEngineClient();
    ownedClients.current = [next];
    for (const old of previous) old.terminate();
    setReady(null);
    setClient(next);
    setAttempt((n) => n + 1);
  }, []);

  // Terminating on unmount stops the worker thread (and its ~200 MB index) with the page.
  useEffect(
    () => () => {
      for (const owned of ownedClients.current) owned.terminate();
    },
    []
  );

  const value = useMemo<EngineContextValue>(() => ({ client, status, ready, error, retry }), [client, status, ready, error, retry]);
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineContextValue {
  const value = useContext(EngineContext);
  if (!value) throw new Error('useEngine() must be used inside <EngineProvider>');
  return value;
}
