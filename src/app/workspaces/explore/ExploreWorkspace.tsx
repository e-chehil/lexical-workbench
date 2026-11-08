/**
 * Explore workspace (PRODUCT_SPEC §3.1, list part).
 *
 * The workspace is a thin controller: it owns the panel state, mirrors it into the route, and maps
 * it to `rows` requests. All matching, sorting and counting happens in the worker; this file only
 * decides *what* to ask and renders the DTOs it gets back.
 *
 * URL contract: kind, text, filters and sort live in `#/explore?q=…` (Uint: the same `LexQuery`
 * the engine receives). The scroll offset does not: it is a view position, and putting it in the
 * history would add an entry per scroll. Selection is view state and is cleared whenever the scope
 * changes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Filter, Loader2 } from 'lucide-react';
import type { EntityKind, EntityRef, EntityRowDTO, LearningStatus, MetricId, QueryResult } from '../../../v2/index.ts';
import { useEngine } from '../../providers/EngineProvider.tsx';
import { useLearning } from '../../providers/LearningProvider.tsx';
import { useRoute } from '../../providers/RouteProvider.tsx';
import { canonicalJson } from '../../routing/codec.ts';
import { BulkBar } from './BulkBar.tsx';
import { FilterPanel } from './FilterPanel.tsx';
import { ProjectionControl } from './ProjectionControl.tsx';
import { QueryBar } from './QueryBar.tsx';
import { ResultTable } from './ResultTable.tsx';
import { useRowsWindow } from './useRowsWindow.ts';
import {
  DEFAULT_COLUMNS,
  EMPTY_FILTERS,
  STATUS_KEYS,
  STATUS_LABELS,
  aggregateSpecsFor,
  columnLabel,
  countActiveFilters,
  filtersForKind,
  fromLexQuery,
  sanitizeColumns,
  sortForKind,
  toLexQuery,
  type ExploreFilters,
  type ExploreState,
} from './filterState.ts';
import { targetsForRows } from './selection.ts';

const TEXT_DEBOUNCE_MS = 260;
const PREVIEW_DEBOUNCE_MS = 220;

export function ExploreWorkspace() {
  const { route, navigate, replace } = useRoute();
  const { client, status: engineStatus } = useEngine();
  const learning = useLearning();

  const [state, setState] = useState<ExploreState>(() => fromLexQuery(route.query));
  const [draftText, setDraftText] = useState(state.text);
  const [columnsByKind, setColumnsByKind] = useState<Record<EntityKind, MetricId[]>>(() => {
    const entries = Object.entries(DEFAULT_COLUMNS) as [EntityKind, MetricId[]][];
    return Object.fromEntries(entries.map(([kind, columns]) => [kind, [...columns]])) as Record<EntityKind, MetricId[]>;
  });
  const [selected, setSelected] = useState<Map<EntityRef, EntityRowDTO>>(new Map());
  const [focusIndex, setFocusIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ExploreFilters>(state.filters);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);

  const anchorRef = useRef<number | null>(null);
  const columns = columnsByKind[state.kind];
  const aggregates = useMemo(() => aggregateSpecsFor(state.kind, columns), [state.kind, columns]);
  const scope = useMemo(() => toLexQuery(state), [state]);
  const stateKey = useMemo(() => canonicalJson(scope), [scope]);
  const routeKey = useMemo(() => canonicalJson(route.query ?? null), [route.query]);
  const activeFilterCount = countActiveFilters(state.filters);

  const rows = useRowsWindow({ client, engineStatus, scope, columns, aggregates });

  // Route → panel (back/forward, palette hit, "Open in Explore"). Our own writes are skipped
  // because they already produced exactly this query.
  useEffect(() => {
    if (routeKey === stateKey) return;
    const next = fromLexQuery(route.query, state.kind);
    setState(next);
    setDraftText(next.text);
    setDraftFilters(next.filters);
  }, [routeKey, stateKey, route.query, state.kind]);

  const commit = useCallback(
    (next: ExploreState, history: 'push' | 'replace' = 'push') => {
      setState(next);
      setDraftFilters(next.filters);
      const query = toLexQuery(next);
      const target = route.ref ? { workspace: 'explore' as const, query, ref: route.ref } : { workspace: 'explore' as const, query };
      if (history === 'push') navigate(target);
      else replace(target);
    },
    [navigate, replace, route.ref]
  );

  // Typing is continuous: mirror it into the URL without one history entry per keystroke.
  useEffect(() => {
    if (draftText === state.text) return;
    const timer = setTimeout(() => commit({ ...state, text: draftText }, 'replace'), TEXT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftText, state, commit]);

  // A new scope invalidates the previous selection and focus.
  useEffect(() => {
    setSelected(new Map());
    setFocusIndex(0);
    anchorRef.current = null;
  }, [stateKey]);

  const onKindChange = useCallback(
    (kind: EntityKind) => {
      commit({ ...state, kind, sort: sortForKind(state.sort, kind), filters: filtersForKind(state.filters, kind) });
    },
    [commit, state]
  );

  const onColumnsChange = useCallback(
    (next: MetricId[]) => {
      setColumnsByKind((prev) => ({ ...prev, [state.kind]: sanitizeColumns(state.kind, next) }));
    },
    [state.kind]
  );

  const onToggleRow = useCallback(
    (row: EntityRowDTO, index: number, extend: boolean) => {
      setSelected((prev) => {
        const next = new Map(prev);
        if (extend) {
          const anchor = anchorRef.current ?? index;
          for (const item of rows.rowsInRange(Math.min(anchor, index), Math.max(anchor, index))) next.set(item.ref, item);
          return next;
        }
        anchorRef.current = index;
        if (next.has(row.ref)) next.delete(row.ref);
        else next.set(row.ref, row);
        return next;
      });
    },
    [rows]
  );

  const applyStatus = useCallback(
    async (statusIndex: number) => {
      const status: LearningStatus | undefined = STATUS_KEYS[statusIndex];
      if (!status) return;
      const actionRows = selected.size > 0 ? [...selected.values()] : ([rows.rowAt(focusIndex)].filter(Boolean) as EntityRowDTO[]);
      if (actionRows.length === 0) return;

      const { targets, skipped } = targetsForRows(actionRows);
      if (targets.length === 0) {
        setMessage('这些聚合实体没有单一学习目标：BNC 词族需先选定成员词形');
        return;
      }
      const store = learning.store;
      if (!store) {
        setMessage('本地学习数据不可用，无法写入状态');
        return;
      }

      setBusy(true);
      setMessage(null);
      try {
        const batchId = await store.apply(targets, { status }, { sourceLabel: 'Explore' });
        setMessage(
          `已设为「${STATUS_LABELS[status]}」· ${targets.length} 个目标${skipped.length > 0 ? `（跳过 ${skipped.length} 项聚合）` : ''} · 批次 ${batchId.slice(0, 18)}`
        );
        // The store pushes the snapshot to the worker; re-read the windows so status chips follow.
        window.setTimeout(() => rows.refresh(), 160);
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [focusIndex, learning.store, rows, selected]
  );

  // Mobile sheet: how many rows would the draft produce?
  useEffect(() => {
    if (!sheetOpen || engineStatus !== 'ready') return;
    const timer = setTimeout(() => {
      const query = { ...toLexQuery({ ...state, filters: draftFilters }), page: { offset: 0, limit: 0 } };
      void client
        .query(query)
        .then((result: QueryResult) => setPreviewTotal(result.total))
        .catch(() => setPreviewTotal(null));
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [sheetOpen, engineStatus, client, state, draftFilters]);

  const selectedRows = useMemo(() => [...selected.values()], [selected]);
  const aggregateChips = useMemo(
    () =>
      rows.aggregates
        .filter((aggregate) => (aggregate.value ?? 0) > 0)
        .map((aggregate) => ({
          key: `${aggregate.metric}:${aggregate.op}`,
          text:
            aggregate.op === 'sum'
              ? `合计 ${columnLabel(aggregate.metric)} ${(aggregate.value ?? 0).toLocaleString('en-US')}`
              : `有值 ${columnLabel(aggregate.metric)} ${(aggregate.value ?? 0).toLocaleString('en-US')}`,
        })),
    [rows.aggregates]
  );

  if (engineStatus !== 'ready') {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
        {engineStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : null}
        {engineStatus === 'loading' ? '索引构建中，稍候即可检索…' : '索引不可用，请重新构建。'}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <QueryBar
        state={state}
        draftText={draftText}
        columns={columns}
        total={rows.total}
        onKindChange={onKindChange}
        onTextChange={setDraftText}
        onModeChange={(textMode) => commit({ ...state, textMode })}
        onSortChange={(sort) => commit({ ...state, sort })}
        onColumnsChange={onColumnsChange}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] py-2 lg:block">
          <FilterPanel
            value={state.filters}
            activeCount={activeFilterCount}
            onChange={(filters) => commit({ ...state, filters })}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 lg:hidden">
            <button
              type="button"
              onClick={() => {
                setDraftFilters(state.filters);
                setPreviewTotal(null);
                setSheetOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
            >
              <Filter size={12} />
              筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            <span className="truncate text-[10px] text-[var(--text-muted)]">
              {columnLabel(columns[0])}
              {columns[1] ? ` · ${columnLabel(columns[1])}` : ''}
            </span>
          </div>

          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5">
            {aggregateChips.map((chip) => (
              <span key={chip.key} className="shrink-0 rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                {chip.text}
              </span>
            ))}
            {message && <span className="shrink-0 text-[10px] text-[var(--accent-hover)]">{message}</span>}
            <span className="ml-auto shrink-0">
              <ProjectionControl
                client={client}
                scope={scope}
                total={rows.total}
                currentKind={state.kind}
                onMessage={setMessage}
                onProject={(kind, refs) =>
                  navigate({ workspace: 'explore', query: { kind, filters: [{ type: 'in_refs', refs }] } })
                }
              />
            </span>
          </div>

          <ResultTable
            total={rows.total}
            columns={columns}
            rowAt={rows.rowAt}
            ensureRange={rows.ensureRange}
            selected={selected}
            focusedIndex={focusIndex}
            onFocusIndex={setFocusIndex}
            onToggleRow={onToggleRow}
            onOpenRow={(row) => navigate({ workspace: 'explore', query: toLexQuery(state), ref: row.ref })}
            onStatusKey={(index) => void applyStatus(index)}
            loading={rows.loading}
            error={rows.error}
            empty={rows.total === 0 && activeFilterCount > 0}
          />

          {selectedRows.length > 0 && (
            <BulkBar
              selectedRows={selectedRows}
              busy={busy}
              message={message}
              db={learning.db}
              onStatus={(status) => void applyStatus(STATUS_KEYS.indexOf(status))}
              onClear={() => setSelected(new Map())}
              onMessage={setMessage}
            />
          )}
        </div>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-slate-950/40 lg:hidden" onMouseDown={() => setSheetOpen(false)}>
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 pb-4"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-primary)]">筛选</span>
              <button type="button" onClick={() => setSheetOpen(false)} className="text-[11px] text-[var(--text-muted)]">
                取消
              </button>
            </div>
            <FilterPanel value={draftFilters} activeCount={countActiveFilters(draftFilters)} onChange={setDraftFilters} />
            <button
              type="button"
              onClick={() => {
                commit({ ...state, filters: draftFilters });
                setSheetOpen(false);
              }}
              className="mt-2 w-full rounded-xl bg-[var(--accent-primary)] py-2.5 text-xs font-medium text-white"
            >
              应用{previewTotal === null ? '' : `（${previewTotal.toLocaleString('en-US')} 条）`}
            </button>
            <button
              type="button"
              onClick={() => setDraftFilters({ ...EMPTY_FILTERS, extra: state.filters.extra })}
              className="mt-1.5 w-full rounded-xl border border-[var(--border-subtle)] py-2 text-[11px] text-[var(--text-muted)]"
            >
              清除筛选
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

