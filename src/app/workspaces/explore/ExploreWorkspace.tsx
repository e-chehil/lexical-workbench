/**
 * Explore workspace (PRODUCT_SPEC §3.1 list part, re-organized per Shape Brief §2.2).
 *
 * The workspace is a thin controller: it owns the panel state, mirrors it into the route, and maps
 * it to `rows` requests. All matching, sorting and counting happens in the worker; this file only
 * decides *what* to ask and renders the DTOs it gets back.
 *
 * Layout: the query bar describes itself (kind tabs, search, chips with applicability reasons),
 * the roster owns the full width, the filter drawer and the detail inspector overlay on demand.
 * Kind switching keeps the reader's filters in panel state — inapplicable ranges are withheld from
 * the engine (disabled chips with a reason) instead of being silently dropped.
 *
 * URL contract: kind, text, applicable filters and sort live in `#/explore?q=…` (the same
 * `LexQuery` the engine receives). The scroll offset does not: it is a view position. Selection is
 * view state and is cleared whenever the scope changes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { EntityKind, EntityRef, EntityRowDTO, LearningStatus, MetricId, QueryResult } from '../../../v2/index.ts';
import { useEngine } from '../../providers/EngineProvider.tsx';
import { useLearning } from '../../providers/LearningProvider.tsx';
import { useRoute } from '../../providers/RouteProvider.tsx';
import { canonicalJson } from '../../routing/codec.ts';
import { BulkBar, type BatchReceipt } from './BulkBar.tsx';
import { FilterDrawer } from './FilterDrawer.tsx';
import { FilterPanel } from './FilterPanel.tsx';
import { ProjectionControl } from './ProjectionControl.tsx';
import { QueryBar } from './QueryBar.tsx';
import { ResultTable, type EmptyMessage } from './ResultTable.tsx';
import { useRowsWindow } from './useRowsWindow.ts';
import {
  DEFAULT_COLUMNS,
  EMPTY_FILTERS,
  STATUS_KEYS,
  STATUS_LABELS,
  KIND_LABELS,
  aggregateSpecsFor,
  anchorMetricFor,
  columnLabel,
  countActiveFilters,
  filterChips,
  removeFilterChip,
  requestColumnsFor,
  sanitizeColumns,
  sortForKind,
  toLexQuery,
  fromLexQuery,
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
  const [receipt, setReceipt] = useState<BatchReceipt | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ExploreFilters>(state.filters);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);

  const anchorRef = useRef<number | null>(null);
  const anchorMetric = anchorMetricFor(state.kind);
  const columns = columnsByKind[state.kind];
  const requestColumns = useMemo(() => requestColumnsFor(state.kind, columns), [state.kind, columns]);
  const dataColumns = useMemo(() => requestColumns.filter((metric) => metric !== anchorMetric), [requestColumns, anchorMetric]);
  const aggregates = useMemo(() => aggregateSpecsFor(state.kind, requestColumns), [state.kind, requestColumns]);
  const scope = useMemo(() => toLexQuery(state), [state]);
  const stateKey = useMemo(() => canonicalJson(scope), [scope]);
  const routeKey = useMemo(() => canonicalJson(route.query ?? null), [route.query]);
  const chips = useMemo(() => filterChips(state.filters, state.kind), [state.filters, state.kind]);
  const activeFilterCount = countActiveFilters(state.filters, state.kind);

  const rows = useRowsWindow({ client, engineStatus, scope, columns: requestColumns, aggregates });

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
      commit({ ...state, kind, sort: sortForKind(state.sort, kind) });
    },
    [commit, state]
  );

  const onColumnsChange = useCallback(
    (next: MetricId[]) => {
      // The anchor is the kind's identity column and not user-removable.
      const anchor = anchorMetricFor(state.kind);
      const chosen = next.filter((metric) => metric !== anchor);
      setColumnsByKind((prev) => ({ ...prev, [state.kind]: sanitizeColumns(state.kind, chosen) }));
    },
    [state.kind]
  );

  const onRemoveChip = useCallback(
    (id: string) => {
      commit({ ...state, filters: removeFilterChip(state.filters, id) });
    },
    [commit, state]
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

  const writeStatus = useCallback(
    async (actionRows: EntityRowDTO[], status: LearningStatus): Promise<void> => {
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
        setReceipt({
          batchId,
          targets: targets.length,
          skipped: skipped.length,
          statusLabel: STATUS_LABELS[status],
          undone: false,
        });
        // The store pushes the snapshot to the worker; re-read the windows so status chips follow.
        window.setTimeout(() => rows.refresh(), 160);
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [learning.store, rows]
  );

  // Keyboard 1–5: the selection when one exists, otherwise the focused row.
  const applyStatusKey = useCallback(
    (statusIndex: number) => {
      const status = STATUS_KEYS[statusIndex];
      if (!status) return;
      const actionRows = selected.size > 0 ? [...selected.values()] : ([rows.rowAt(focusIndex)].filter(Boolean) as EntityRowDTO[]);
      void writeStatus(actionRows, status);
    },
    [focusIndex, rows, selected, writeStatus]
  );

  // Inline quick-set from the status cell: always exactly this row's target.
  const applyRowStatus = useCallback(
    (row: EntityRowDTO, status: LearningStatus) => {
      void writeStatus([row], status);
    },
    [writeStatus]
  );

  const undoReceipt = useCallback(async () => {
    const store = learning.store;
    if (!store || !receipt || receipt.undone) return;
    setBusy(true);
    try {
      const restored = await store.undoBatch(receipt.batchId);
      setReceipt((prev) => (prev ? { ...prev, undone: true } : prev));
      setMessage(`已撤销：恢复 ${restored} 个目标之前的状态`);
      window.setTimeout(() => rows.refresh(), 160);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [learning.store, receipt, rows]);

  // Mobile sheet: how many rows would the draft produce?
  useEffect(() => {
    if (!drawerOpen || engineStatus !== 'ready') return;
    const timer = setTimeout(() => {
      const query = { ...toLexQuery({ ...state, filters: draftFilters }), page: { offset: 0, limit: 0 } };
      void client
        .query(query)
        .then((result: QueryResult) => setPreviewTotal(result.total))
        .catch(() => setPreviewTotal(null));
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [drawerOpen, engineStatus, client, state, draftFilters]);

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

  // Empty-with-a-cause: an inert condition on this kind explains the zero and offers a way out.
  const emptyMessage = useMemo<EmptyMessage | null>(() => {
    if (rows.total !== 0 || activeFilterCount === 0) return null;
    const inert = chips.filter((chip) => chip.disabled);
    if (inert.length === 0) return null;
    const actions: EmptyMessage['actions'] = [];
    const lpChip = inert.find((chip) => chip.id === 'lpRank');
    if (lpChip) {
      actions.push({ label: '切换到 COCA 词性条目', onClick: () => onKindChange('coca_lemma_pos') });
      actions.push({ label: '移除官方排名条件', onClick: () => onRemoveChip('lpRank') });
    }
    const hwChip = inert.find((chip) => chip.id === 'hwRank');
    if (hwChip) actions.push({ label: '移除词头排名条件', onClick: () => onRemoveChip('hwRank') });
    return {
      title: '0 条结果的原因',
      detail: inert.map((chip) => `${chip.label} — ${chip.reason ?? '不适用于当前类别'}`),
      actions,
    };
  }, [rows.total, activeFilterCount, chips, onKindChange, onRemoveChip]);

  if (engineStatus !== 'ready') {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
        {engineStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : null}
        {engineStatus === 'loading' ? '索引构建中，稍候即可检索…' : '索引不可用，请重新构建。'}
      </div>
    );
  }

  const openDrawer = (): void => {
    setDraftFilters(state.filters);
    setPreviewTotal(null);
    setDrawerOpen(true);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <QueryBar
        state={state}
        draftText={draftText}
        columns={dataColumns}
        chips={chips}
        total={rows.total}
        onKindChange={onKindChange}
        onTextChange={setDraftText}
        onModeChange={(textMode) => commit({ ...state, textMode })}
        onSortChange={(sort) => commit({ ...state, sort })}
        onColumnsChange={onColumnsChange}
        onRemoveChip={onRemoveChip}
        onOpenFilters={openDrawer}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {/* annotation band: aggregates, operational messages and the projection control */}
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5">
          {aggregateChips.map((chip) => (
            <span key={chip.key} className="shrink-0 rounded-sm bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
              {chip.text}
            </span>
          ))}
          {message && <span className="shrink-0 text-[11px] text-[var(--accent-hover)]">{message}</span>}
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
          kind={state.kind}
          anchorMetric={anchorMetric}
          columns={dataColumns}
          total={rows.total}
          rowAt={rows.rowAt}
          ensureRange={rows.ensureRange}
          selected={selected}
          focusedIndex={focusIndex}
          onFocusIndex={setFocusIndex}
          onToggleRow={onToggleRow}
          onOpenRow={(row) => navigate({ workspace: 'explore', query: toLexQuery(state), ref: row.ref })}
          onStatusKey={applyStatusKey}
          onSetRowStatus={applyRowStatus}
          loading={rows.loading}
          error={rows.error}
          empty={emptyMessage}
        />

        {(selectedRows.length > 0 || receipt) && (
          <BulkBar
            selectedRows={selectedRows}
            receipt={receipt}
            busy={busy}
            message={message}
            db={learning.db}
            onStatus={(status) => void writeStatus(selectedRows, status)}
            onClear={() => setSelected(new Map())}
            onUndoReceipt={() => void undoReceipt()}
            onDismissReceipt={() => setReceipt(null)}
            onMessage={setMessage}
          />
        )}
      </div>

      <FilterDrawer
        open={drawerOpen}
        kindLabel={KIND_LABELS[state.kind]}
        activeCount={countActiveFilters(draftFilters, state.kind)}
        onRequestClose={(commitDraft) => {
          if (commitDraft) commit({ ...state, filters: draftFilters });
          setDrawerOpen(false);
        }}
        footer={
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => {
                commit({ ...state, filters: draftFilters });
                setDrawerOpen(false);
              }}
              className="w-full rounded-md bg-[var(--accent-primary)] py-2.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)]"
            >
              应用{previewTotal === null ? '' : `（${previewTotal.toLocaleString('en-US')} 条）`}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftFilters({ ...EMPTY_FILTERS, extra: state.filters.extra });
              }}
              className="w-full rounded-md border border-[var(--border-subtle)] py-2 text-[11px] text-[var(--text-muted)]"
            >
              清除筛选（只清条件，不动已加入词集与投影集合）
            </button>
          </div>
        }
      >
        <FilterPanel
          value={draftFilters}
          activeCount={countActiveFilters(draftFilters, state.kind)}
          kind={state.kind}
          onChange={setDraftFilters}
        />
      </FilterDrawer>

      {/* Screen-reader live region for asynchronous outcomes (writes, undo, projection). */}
      <p role="status" aria-live="polite" className="sr-only">
        {receipt ? (receipt.undone ? `已撤销批次 ${receipt.batchId}` : `已写入 ${receipt.targets} 个目标为${receipt.statusLabel}`) : (message ?? '')}
      </p>
    </div>
  );
}
