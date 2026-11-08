/**
 * Windowed row loading for the virtualised Explore table.
 *
 * The table asks for the window under the viewport instead of the whole result set: `rows` is
 * called with `offset/limit` (200 rows) and each answered window is cached. Four properties matter:
 *
 *   - **no stale results**: a scope change (kind, text, filters, sort) bumps a generation, and a
 *     response from an older generation is dropped, so a slow request can never overwrite a newer
 *     scope — the same guarantee the palette has;
 *   - **no duplicate requests**: loaded or in-flight windows are not requested again;
 *   - **re-fetch the same window after a displayed mutation** (`refresh`), because status chips come
 *     from the worker and the cached DTOs would otherwise show the old value;
 *   - **no jump when columns change**: only the cells change, so `total` and `aggregates` survive and
 *     the scrollbar does not reset while a reader adds a column.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AggregateValue, AggregateSpec, EntityRowDTO, LexQuery, MetricId } from '../../../v2/index.ts';
import { canonicalJson } from '../../routing/codec.ts';
import type { EngineClient } from '../../../v2/worker/client.ts';
import type { EngineStatus } from '../../providers/EngineProvider.tsx';

export const WINDOW_SIZE = 200;

/** How long the visible range must be stable before windows are requested. */
export const RANGE_DEBOUNCE_MS = 90;

export interface RowsWindowRequest {
  client: EngineClient;
  engineStatus: EngineStatus;
  /** Scope without `page`/`aggregates`: those are added per request. */
  scope: LexQuery;
  columns: MetricId[];
  aggregates: AggregateSpec[];
  /** A version that changes after the worker acknowledged a learning snapshot. */
  statusVersion?: number;
}

export interface RowsWindowApi {
  total: number | null;
  aggregates: AggregateValue[];
  loading: boolean;
  error: string | null;
  /** Row at a result index, or undefined while its window has not arrived. */
  rowAt: (index: number) => EntityRowDTO | undefined;
  /** Rows of one loaded window in index order (for range selection). */
  rowsInRange: (start: number, end: number) => EntityRowDTO[];
  /** Called by the table when the visible range changes. */
  ensureRange: (start: number, end: number) => void;
  /** Re-reads every loaded window (after a status change). */
  refresh: () => void;
}

interface WindowsState {
  total: number | null;
  aggregates: AggregateValue[];
  windows: Map<number, EntityRowDTO[]>;
}

const EMPTY_STATE: WindowsState = { total: null, aggregates: [], windows: new Map() };

export function useRowsWindow({ client, engineStatus, scope, columns, aggregates, statusVersion = 0 }: RowsWindowRequest): RowsWindowApi {
  const queryKey = useMemo(() => canonicalJson(scope), [scope]);
  const columnsKey = useMemo(() => canonicalJson({ columns, aggregates }), [columns, aggregates]);

  const [state, setState] = useState<WindowsState>(EMPTY_STATE);
  const [loadingCount, setLoadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const generation = useRef(0);
  const inFlight = useRef(new Set<number>());
  const windowsRef = useRef<Map<number, EntityRowDTO[]>>(new Map());
  const wantedRange = useRef<{ start: number; end: number } | null>(null);
  const pendingRange = useRef<{ start: number; end: number } | null>(null);
  const rangeTimer = useRef<number | null>(null);
  const scopeRef = useRef(scope);
  const columnsRef = useRef(columns);
  const aggregatesRef = useRef(aggregates);
  const engineReady = useRef(engineStatus === 'ready');
  scopeRef.current = scope;
  columnsRef.current = columns;
  aggregatesRef.current = aggregates;
  engineReady.current = engineStatus === 'ready';

  const fetchWindow = useCallback(
    (windowIndex: number, force = false) => {
      if (!engineReady.current) return;
      // `force` also bypasses the in-flight guard: after a scope change the previous request for
      // this window belongs to a dead generation, so waiting for it would drop the window forever.
      if (!force && inFlight.current.has(windowIndex)) return;
      if (!force && windowsRef.current.has(windowIndex)) return;
      inFlight.current.add(windowIndex);
      const requestGeneration = generation.current;
      setLoadingCount((count) => count + 1);

      const query: LexQuery = { ...scopeRef.current, page: { offset: windowIndex * WINDOW_SIZE, limit: WINDOW_SIZE } };
      if (aggregatesRef.current.length > 0) query.aggregates = aggregatesRef.current;

      void client
        .rows({ query, columns: columnsRef.current })
        .then((page) => {
          if (generation.current !== requestGeneration) return; // a newer scope already won
          windowsRef.current.set(windowIndex, page.rows);
          setError(null);
          setState((prev) => ({
            total: page.total,
            aggregates: page.aggregates.length > 0 ? page.aggregates : prev.aggregates,
            windows: new Map(windowsRef.current),
          }));
        })
        .catch((cause: unknown) => {
          if (generation.current !== requestGeneration) return;
          setError(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => {
          inFlight.current.delete(windowIndex);
          setLoadingCount((count) => Math.max(0, count - 1));
        });
    },
    [client]
  );

  /**
   * Visible range → windows. A fling would otherwise queue a full 95k-row sort per intermediate
   * window (measured ≈0.4 s each in the worker), so the request waits 90 ms for the range to
   * settle. The first window is fetched by the scope effect, so first paint is never delayed.
   */
  const ensureRange = useCallback(
    (start: number, end: number) => {
      wantedRange.current = { start, end };
      pendingRange.current = { start, end };
      if (rangeTimer.current !== null) clearTimeout(rangeTimer.current);
      rangeTimer.current = window.setTimeout(() => {
        rangeTimer.current = null;
        const range = pendingRange.current;
        if (!range) return;
        const first = Math.floor(Math.max(0, range.start) / WINDOW_SIZE);
        const last = Math.floor(Math.max(0, range.end) / WINDOW_SIZE);
        for (let index = first; index <= last; index++) fetchWindow(index);
      }, RANGE_DEBOUNCE_MS);
    },
    [fetchWindow]
  );

  // The effects below must run only on a real scope/readiness change, never because a callback
  // identity changed, or the scope reset would re-trigger itself and drop every response.
  const fetchRef = useRef(fetchWindow);
  const ensureRef = useRef(ensureRange);
  fetchRef.current = fetchWindow;
  ensureRef.current = ensureRange;

  useEffect(
    () => () => {
      if (rangeTimer.current !== null) window.clearTimeout(rangeTimer.current);
    },
    []
  );

  const refresh = useCallback(() => {
    for (const index of [...windowsRef.current.keys()]) fetchWindow(index, true);
  }, [fetchWindow]);

  // Scope change: drop everything and reload. Window 0 is always fetched because it carries the
  // `total` the virtualiser needs; without it the table would have a count of 0 and never ask.
  useEffect(() => {
    generation.current += 1;
    inFlight.current.clear();
    windowsRef.current = new Map();
    setState(EMPTY_STATE);
    setError(null);
    fetchRef.current(0, true);
    const range = wantedRange.current;
    if (range) ensureRef.current(range.start, range.end);
  }, [queryKey]);

  // The engine may become ready after this hook mounted (worker still building).
  useEffect(() => {
    if (engineStatus !== 'ready') return;
    if (windowsRef.current.size === 0) fetchRef.current(0, true);
  }, [engineStatus]);

  // Learning state was synchronised into the worker: status cells are part of the DTO, so the
  // already loaded windows must be re-read without resetting the scroll position.
  const lastStatusVersion = useRef(statusVersion);
  useEffect(() => {
    if (lastStatusVersion.current === statusVersion) return;
    lastStatusVersion.current = statusVersion;
    // Invalidate responses already in flight: a status refresh must not be overwritten by a
    // snapshot that was requested before the new learning state reached the worker.
    generation.current += 1;
    const loaded = [...windowsRef.current.keys()];
    // On first mount the initial window may still be in flight; reload window 0 explicitly so a
    // status acknowledgement cannot leave an empty roster behind.
    for (const index of loaded.length > 0 ? loaded : [0]) fetchRef.current(index, true);
  }, [statusVersion]);

  // Column change: same rows, new cells. Forced reload replaces the cached DTOs in place.
  const firstColumnsRun = useRef(true);
  useEffect(() => {
    if (firstColumnsRun.current) {
      firstColumnsRun.current = false;
      return;
    }
    for (const index of [...windowsRef.current.keys()]) fetchRef.current(index, true);
  }, [columnsKey]);

  const rowAt = useCallback(
    (index: number): EntityRowDTO | undefined => state.windows.get(Math.floor(index / WINDOW_SIZE))?.[index % WINDOW_SIZE],
    [state.windows]
  );

  const rowsInRange = useCallback(
    (start: number, end: number): EntityRowDTO[] => {
      const out: EntityRowDTO[] = [];
      for (let index = start; index <= end; index++) {
        const row = rowAt(index);
        if (row) out.push(row);
      }
      return out;
    },
    [rowAt]
  );

  return {
    total: state.total,
    aggregates: state.aggregates,
    loading: loadingCount > 0,
    error,
    rowAt,
    rowsInRange,
    ensureRange,
    refresh,
  };
}
