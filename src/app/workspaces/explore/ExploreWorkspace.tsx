/**
 * Explore workspace — the observation desk.
 *
 * A thin controller: it owns URL-backed state, asks the worker for row windows and renders the
 * DTOs. Filtering, sorting, matching and counting stay in the engine. The inline filter rail is a
 * desktop tool; below 1280 px the same rail is presented as a full-screen sheet with a preview
 * count before applying.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import type { EntityKind, EntityRef, EntityRowDTO, LearningStatus, MetricId, QueryResult } from '../../../v2/index.ts';
import { useEngine } from '../../providers/EngineProvider.tsx';
import { useLearning } from '../../providers/LearningProvider.tsx';
import { useRoute } from '../../providers/RouteProvider.tsx';
import { canonicalJson } from '../../routing/codec.ts';
import { CollectionDialog } from '../../collections/CollectionDialog.tsx';
import { BulkBar, type BatchReceipt } from './BulkBar.tsx';
import { FilterRail } from './FilterRail.tsx';
import { ProjectionDialog } from './ProjectionDialog.tsx';
import { QueryHeader } from './QueryHeader.tsx';
import { RosterTable, type EmptyMessage } from './RosterTable.tsx';
import { useRowsWindow } from './useRowsWindow.ts';
import {
  DEFAULT_COLUMNS,
  EMPTY_FILTERS,
  STATUS_KEYS,
  STATUS_LABELS,
  KIND_LABELS,
  aggregateSpecsFor,
  anchorMetricFor,
  countActiveFilters,
  filterChips,
  fromLexQuery,
  removeFilterChip,
  requestColumnsFor,
  sanitizeColumns,
  sortForKind,
  toLexQuery,
  type ExploreFilters,
  type ExploreState,
} from './filterState.ts';
import { targetForRow, targetsForRows } from './selection.ts';
import { Modal } from '../../ui/index.tsx';
import { n } from '../../ui/format.ts';

const TEXT_DEBOUNCE_MS = 240;
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
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ExploreFilters>(state.filters);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [projectionOpen, setProjectionOpen] = useState(false);
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
  const rows = useRowsWindow({ client, engineStatus, scope, columns: requestColumns, aggregates, statusVersion: learning.syncedVersion });

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

  useEffect(() => {
    if (draftText === state.text) return;
    const timer = setTimeout(() => commit({ ...state, text: draftText }, 'replace'), TEXT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftText, state, commit]);

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
      const anchor = anchorMetricFor(state.kind);
      setColumnsByKind((previous) => ({ ...previous, [state.kind]: sanitizeColumns(state.kind, next.filter((metric) => metric !== anchor)) }));
    },
    [state.kind]
  );

  const onRemoveChip = useCallback(
    (id: string) => commit({ ...state, filters: removeFilterChip(state.filters, id) }),
    [commit, state]
  );

  const onToggleRow = useCallback(
    (row: EntityRowDTO, index: number, extend: boolean) => {
      setSelected((previous) => {
        const next = new Map(previous);
        if (extend) {
          const anchor = Math.max(0, Math.min(index, anchorRef.current ?? index));
          for (const item of rows.rowsInRange(anchor, Math.max(anchor, index))) next.set(item.ref, item);
          return next;
        }
        anchorRef.current = index;
        if (next.has(row.ref)) next.delete(row.ref);
        else next.set(row.ref, row);
        return next;
      });
    },
    [focusIndex, rows]
  );

  const writeStatus = useCallback(
    async (actionRows: EntityRowDTO[], status: LearningStatus): Promise<void> => {
      if (actionRows.length === 0 || busy) return;
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
        setReceipt({ batchId, targets: targets.length, skipped: skipped.length, statusLabel: STATUS_LABELS[status], undone: false });
        // Keep the selection DTOs truthful for the bulk bar / CSV export; the table itself is
        // refreshed from the worker after the snapshot acknowledgement.
        setSelected((previous) => {
          const next = new Map(previous);
          for (const row of actionRows) {
            if (!next.has(row.ref)) continue;
            const target = targetForRow(row);
            next.set(row.ref, { ...row, status: { status, origin: 'own', from: target } });
          }
          return next;
        });
        window.setTimeout(() => rows.refresh(), 140);
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [busy, learning.store, rows]
  );

  const applyStatusKey = useCallback(
    (statusIndex: number) => {
      const status = STATUS_KEYS[statusIndex];
      if (!status) return;
      const actionRows = selected.size > 0 ? [...selected.values()] : ([rows.rowAt(focusIndex)].filter(Boolean) as EntityRowDTO[]);
      void writeStatus(actionRows, status);
    },
    [focusIndex, rows, selected, writeStatus]
  );

  const applyRowStatus = useCallback((row: EntityRowDTO, status: LearningStatus) => void writeStatus([row], status), [writeStatus]);

  const undoReceipt = useCallback(async () => {
    const store = learning.store;
    if (!store || !receipt || receipt.undone) return;
    setBusy(true);
    try {
      const restored = await store.undoBatch(receipt.batchId);
      setReceipt((previous) => (previous ? { ...previous, undone: true } : previous));
      // A receipt's previous states are not kept in the row DTOs; clear the selection instead
      // of exporting a stale status after an undo.
      setSelected(new Map());
      setMessage(`已撤销：恢复 ${restored} 个目标之前的状态`);
      window.setTimeout(() => rows.refresh(), 140);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [learning.store, receipt, rows]);

  useEffect(() => {
    if (!filterSheetOpen) {
      setPreviewTotal(null);
      return;
    }
    if (engineStatus !== 'ready') return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const query = { ...toLexQuery({ ...state, filters: draftFilters }), page: { offset: 0, limit: 0 } };
      void client
        .query(query)
        .then((result: QueryResult) => {
          if (!cancelled) setPreviewTotal(result.total);
        })
        .catch(() => {
          if (!cancelled) setPreviewTotal(null);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filterSheetOpen, engineStatus, client, state, draftFilters]);

  const selectedRows = useMemo(() => [...selected.values()], [selected]);
  const emptyMessage = useMemo<EmptyMessage | null>(() => {
    if (rows.total !== 0 || activeFilterCount === 0) return null;
    const inert = chips.filter((chip) => chip.disabled);
    if (inert.length === 0) return null;
    const actions: EmptyMessage['actions'] = [];
    if (inert.some((chip) => chip.id === 'lpRank')) {
      actions.push({ label: '切换到 COCA 词性条目', onClick: () => onKindChange('coca_lemma_pos') });
      actions.push({ label: '移除官方排名条件', onClick: () => onRemoveChip('lpRank') });
    }
    if (inert.some((chip) => chip.id === 'hwRank')) actions.push({ label: '移除词头排名条件', onClick: () => onRemoveChip('hwRank') });
    return {
      title: '0 条结果的原因',
      detail: inert.map((chip) => `${chip.label} — ${chip.reason ?? '不适用于当前类别'}`),
      actions,
    };
  }, [rows.total, activeFilterCount, chips, onKindChange, onRemoveChip]);

  if (engineStatus !== 'ready') {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[12px] text-[var(--text-muted)]">
        {engineStatus === 'loading' && <Loader2 size={14} className="animate-spin" />}
        {engineStatus === 'loading' ? '索引构建中，稍候即可检索…' : '索引不可用，请重新构建。'}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <QueryHeader
        state={state}
        draftText={draftText}
        columns={dataColumns}
        chips={chips}
        total={rows.total}
        aggregates={rows.aggregates}
        onKindChange={onKindChange}
        onTextChange={setDraftText}
        onModeChange={(textMode) => commit({ ...state, textMode })}
        onSortChange={(sort) => commit({ ...state, sort })}
        onColumnsChange={onColumnsChange}
        onRemoveChip={onRemoveChip}
        onSaveQuery={() => setCollectionOpen(true)}
        onProject={() => setProjectionOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[260px] shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 xl:block">
          <FilterRail value={state.filters} kind={state.kind} activeCount={activeFilterCount} onChange={(filters) => commit({ ...state, filters })} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3 py-1.5">
            <p className="font-mono-tabular text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              Roster <span className="text-[var(--text-primary)]">{rows.total === null ? '—' : n(rows.total)}</span>
              {rows.loading && <span className="ml-2 text-[var(--text-faint)]">READING WINDOW</span>}
            </p>
            <div className="flex items-center gap-2">
              {message && <span className="max-w-[320px] truncate text-[10px] text-[var(--signal)]">{message}</span>}
              <button type="button" onClick={() => setFilterSheetOpen(true)} className="btn px-2 py-1 text-[10px] xl:hidden">
                <SlidersHorizontal size={11} /> 筛选{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
              </button>
            </div>
          </div>

          <RosterTable
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
            statusDisabled={!learning.store}
          />

          {(selectedRows.length > 0 || receipt) && (
            <BulkBar
              selectedRows={selectedRows}
              receipt={receipt}
              busy={busy}
              message={message}
              db={learning.db}
              version={learning.version}
              onStatus={(status) => void writeStatus(selectedRows, status)}
              onClear={() => setSelected(new Map())}
              onUndoReceipt={() => void undoReceipt()}
              onDismissReceipt={() => setReceipt(null)}
              onMessage={setMessage}
            />
          )}
        </div>
      </div>

      <Modal
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        eyebrow={KIND_LABELS[state.kind]}
        title="筛选条件"
        wide
        footer={
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDraftFilters({ ...EMPTY_FILTERS, extra: state.filters.extra });
              }}
            >
              清空条件
            </button>
            <button
              type="button"
              className="btn btn-primary ml-auto"
              onClick={() => {
                commit({ ...state, filters: draftFilters });
                setFilterSheetOpen(false);
              }}
            >
              应用{previewTotal === null ? '' : `（${n(previewTotal)} 条）`}
            </button>
          </div>
        }
      >
        <div className="min-h-[52vh]">
          <FilterRail value={draftFilters} kind={state.kind} activeCount={countActiveFilters(draftFilters, state.kind)} onChange={setDraftFilters} />
        </div>
      </Modal>

      <CollectionDialog
        open={collectionOpen}
        db={learning.db}
        version={learning.version}
        query={scope}
        onClose={() => setCollectionOpen(false)}
        onDone={(text) => setMessage(text)}
      />

      <ProjectionDialog
        open={projectionOpen}
        client={client}
        scope={scope}
        total={rows.total}
        currentKind={state.kind}
        onClose={() => setProjectionOpen(false)}
        onProject={(kind, refs) => {
          navigate({ workspace: 'explore', query: { kind, filters: [{ type: 'in_refs', refs }] } });
          setProjectionOpen(false);
        }}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {receipt ? (receipt.undone ? `已撤销批次 ${receipt.batchId}` : `已写入 ${receipt.targets} 个目标为${receipt.statusLabel}`) : (message ?? '')}
      </p>
    </div>
  );
}
