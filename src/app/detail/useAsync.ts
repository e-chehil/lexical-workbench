/** Tiny async loader with a generation guard: stale responses can never overwrite a newer ref. */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAsync<T>(load: () => Promise<T>, key: string, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const generation = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    loadRef
      .current()
      .then((value) => {
        if (generation.current !== current) return;
        setData(value);
      })
      .catch((cause: unknown) => {
        if (generation.current !== current) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setData(null);
      })
      .finally(() => {
        if (generation.current === current) setLoading(false);
      });
  }, [key, nonce, ...deps]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, loading, error, reload };
}
