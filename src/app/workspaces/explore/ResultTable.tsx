/**
 * Virtualised result table (PRODUCT_SPEC §3.1).
 *
 * Rows are addressed by result index and rendered only for the viewport, while `useRowsWindow`
 * fetches the matching 200-row windows. The table never filters, sorts or rewrites values: it shows
 * the DTO cells it receives, so what the reader sees is exactly what the engine returned.
 *
 * Keyboard model (from v1): ↑↓ move, Shift+↑↓ extend, Space toggles, Enter opens the Detail panel,
 * 1–5 set the learning status of the selection (or of the focused row when nothing is selected).
 */
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check } from 'lucide-react';
import type { EntityRowDTO, MetricId, RowBadge } from '../../../v2/index.ts';
import { columnLabel, formatMetricValue, missingHint } from './filterState.ts';

export const ROW_HEIGHT = 44;

const BADGE_LABELS: Record<RowBadge, string> = {
  multi_pos: '多词性',
  multi_family: '多词族',
  cet4: 'CET4',
  cet6: 'CET6',
  case_variant: '大小写',
  candidate_variant: '候选变体',
  not_in_coca: '无 COCA',
  not_in_bnc: '无 BNC',
};

export interface ResultTableProps {
  total: number | null;
  columns: MetricId[];
  rowAt: (index: number) => EntityRowDTO | undefined;
  ensureRange: (start: number, end: number) => void;
  selected: ReadonlyMap<string, EntityRowDTO>;
  focusedIndex: number;
  onFocusIndex: (index: number) => void;
  onToggleRow: (row: EntityRowDTO, index: number, extend: boolean) => void;
  onOpenRow: (row: EntityRowDTO) => void;
  onStatusKey: (statusIndex: number) => void;
  loading: boolean;
  error: string | null;
  empty: boolean;
}

export function ResultTable({
  total,
  columns,
  rowAt,
  ensureRange,
  selected,
  focusedIndex,
  onFocusIndex,
  onToggleRow,
  onOpenRow,
  onStatusKey,
  loading,
  error,
  empty,
}: ResultTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = total ?? 0;

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const items = virtualizer.getVirtualItems();
  const firstIndex = items.length > 0 ? items[0].index : -1;
  const lastIndex = items.length > 0 ? items[items.length - 1].index : -1;

  useEffect(() => {
    if (firstIndex >= 0) ensureRange(firstIndex, lastIndex);
  }, [firstIndex, lastIndex, ensureRange]);

  // Keep the focused row visible when the keyboard moves it.
  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < count) virtualizer.scrollToIndex(focusedIndex, { align: 'auto' });
  }, [focusedIndex, count, virtualizer]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (count === 0) return;
    const focus = (next: number): void => onFocusIndex(Math.max(0, Math.min(count - 1, next)));

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focus(focusedIndex + 1);
        if (event.shiftKey) {
          const row = rowAt(focusedIndex + 1);
          if (row) onToggleRow(row, focusedIndex + 1, true);
        }
        return;
      case 'ArrowUp':
        event.preventDefault();
        focus(focusedIndex - 1);
        if (event.shiftKey) {
          const row = rowAt(focusedIndex - 1);
          if (row) onToggleRow(row, focusedIndex - 1, true);
        }
        return;
      case ' ':
      case 'Spacebar': {
        event.preventDefault();
        const row = rowAt(focusedIndex);
        if (row) onToggleRow(row, focusedIndex, false);
        return;
      }
      case 'Enter': {
        event.preventDefault();
        const row = rowAt(focusedIndex);
        if (row) onOpenRow(row);
        return;
      }
      case 'Escape':
        return; // the shell closes the detail panel
      default:
        break;
    }

    if (event.key >= '1' && event.key <= '5') {
      event.preventDefault();
      onStatusKey(Number(event.key) - 1);
    }
  };

  const gridTemplate = `36px minmax(140px, 1.4fr) minmax(80px, 0.8fr) 96px ${columns.map(() => 'minmax(88px, 0.7fr)').join(' ')}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <p className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          读取失败：{error}
        </p>
      )}

      <div className="hidden border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)] md:grid" style={{ gridTemplateColumns: gridTemplate }}>
        <span />
        <span>词条</span>
        <span>标记</span>
        <span>状态</span>
        {columns.map((metric) => (
          <span key={metric} className="truncate" title={columnLabel(metric)}>
            {columnLabel(metric)}
          </span>
        ))}
      </div>

      <div
        ref={scrollRef}
        role="grid"
        tabIndex={0}
        aria-label="检索结果"
        aria-rowcount={count}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
      >
        {count === 0 && !loading && (
          <p className="px-4 py-10 text-center text-xs text-[var(--text-muted)]">
            {empty ? '当前筛选没有匹配结果，放宽条件或清除筛选后再试。' : '没有结果。'}
          </p>
        )}
        {count === 0 && loading && <p className="px-4 py-10 text-center text-xs text-[var(--text-muted)]">正在检索…</p>}

        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {items.map((item) => {
            const row = rowAt(item.index);
            const isSelected = row ? selected.has(row.ref) : false;
            const isFocused = item.index === focusedIndex;
            return (
              <div
                key={item.key}
                aria-rowindex={item.index + 1}
                aria-selected={isSelected}
                className={`absolute left-0 top-0 w-full border-b border-[var(--border-subtle)] ${
                  isFocused ? 'bg-[var(--accent-soft)]' : isSelected ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-hover)]'
                }`}
                style={{ height: item.size, transform: `translateY(${item.start}px)` }}
              >
                {row ? (
                  <div className="flex h-full items-center gap-3 px-3 md:grid" style={{ gridTemplateColumns: gridTemplate }}>
                    <button
                      type="button"
                      aria-label={isSelected ? `取消选择 ${row.label}` : `选择 ${row.label}`}
                      aria-pressed={isSelected}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleRow(row, item.index, event.shiftKey);
                        onFocusIndex(item.index);
                      }}
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        isSelected ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white' : 'border-[var(--border-strong)]'
                      }`}
                    >
                      {isSelected && <Check size={11} />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onFocusIndex(item.index);
                        onOpenRow(row);
                      }}
                      className="min-w-0 flex-1 text-left md:flex-none"
                      title={row.ref}
                    >
                      <span className="block truncate text-xs text-[var(--text-primary)]">{row.label}</span>
                      <span className="block truncate text-[10px] text-[var(--text-muted)]">
                        {row.sources.join(' · ')}
                      </span>
                    </button>

                    <div className="hidden min-w-0 flex-wrap gap-1 md:flex">
                      {row.badges.slice(0, 3).map((badge) => (
                        <span key={badge} className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 text-[10px] text-[var(--text-secondary)]">
                          {BADGE_LABELS[badge]}
                        </span>
                      ))}
                      {row.badges.length > 3 && (
                        <span className="text-[10px] text-[var(--text-muted)]">+{row.badges.length - 3}</span>
                      )}
                    </div>

                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] md:justify-self-start ${statusTone(row)}`}>
                      {row.status ? statusLabel(row.status) : '—'}
                    </span>

                    <div className="flex min-w-0 items-center gap-3 md:contents">
                      {columns.map((metric, index) => {
                        const cell = row.metrics.find((item) => item.metric === metric);
                        const value = cell?.value ?? null;
                        return (
                          <span
                            key={metric}
                            className={`shrink-0 text-[11px] tabular-nums text-[var(--text-secondary)] ${index > 1 ? 'hidden md:block' : ''}`}
                            title={value === null ? missingHint(metric) : columnLabel(metric)}
                          >
                            <span className="mr-1 text-[10px] text-[var(--text-muted)] md:hidden">{shortLabel(metric)}</span>
                            {formatMetricValue(metric, value)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center gap-3 px-3">
                    <span className="h-4 w-4 rounded bg-[var(--bg-subtle)]" />
                    <span className="h-3 w-40 animate-pulse rounded bg-[var(--bg-subtle)]" />
                    <span className="ml-auto text-[10px] text-[var(--text-muted)]">载入中…</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function shortLabel(metric: MetricId): string {
  const map: Partial<Record<MetricId, string>> = {
    'coca2020.hw_rank': 'COCA 排名',
    'coca2020.hw_freq_sum': 'COCA频',
    'coca2020.lp_rank': 'COCA 排名',
    'coca2020.lp_freq': 'COCA频',
    'bnc25k.member_freq': 'BNC频',
    'bnc25k.family_band': '段',
    'bnc25k.family_total': '族总',
    'coca2020.lp_share_of_headword': '占比',
    'bnc25k.member_share_of_family': '族占比',
    'coca2020.hw_best_lp_rank': '最佳排名',
    'coca2020.hw_pos_count': '词性数',
  };
  return map[metric] ?? '';
}

function statusLabel(status: NonNullable<EntityRowDTO['status']>): string {
  const base: Record<string, string> = {
    unrated: '未评',
    queued: '待学',
    learning: '在学',
    mastered: '掌握',
    deferred: '暂缓',
  };
  return status.origin === 'inherited' ? `${base[status.status]}(继承)` : base[status.status];
}

function statusTone(row: EntityRowDTO): string {
  if (!row.status) return 'bg-[var(--bg-elevated)] text-[var(--text-muted)]';
  switch (row.status.status) {
    case 'mastered':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
    case 'learning':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
    case 'queued':
      return 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300';
    case 'deferred':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300';
    default:
      return 'bg-[var(--bg-elevated)] text-[var(--text-muted)]';
  }
}
