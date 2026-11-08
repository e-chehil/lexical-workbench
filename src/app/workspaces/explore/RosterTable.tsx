/**
 * Virtualised observation roster.
 *
 * Rows are a projection of the query result: the table never filters, sorts or formats a
 * frequency itself. The first anchor column carries the kind's identity rank/size, the word cell
 * carries source-printed exceptions, and the rightmost cell is the personal learning status.
 */
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check } from 'lucide-react';
import { METRICS, type EntityKind, type EntityRowDTO, type LearningStatus, type MetricId, type RowBadge } from '../../../v2/index.ts';
import { StatusControl } from '../../components/StatusControl.tsx';
import { columnLabel, formatMetricValue } from './filterState.ts';
import { cx } from '../../ui/index.tsx';
import { band, n, rank } from '../../ui/format.ts';

export const ROW_HEIGHT = 42;

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

const ROW_BADGES: readonly RowBadge[] = ['multi_pos', 'cet4', 'cet6', 'case_variant', 'candidate_variant', 'not_in_coca', 'not_in_bnc'];

export interface EmptyMessage {
  title: string;
  detail: string[];
  actions: { label: string; onClick: () => void }[];
}

export interface RosterTableProps {
  kind: EntityKind;
  anchorMetric: MetricId | null;
  columns: MetricId[];
  total: number | null;
  rowAt: (index: number) => EntityRowDTO | undefined;
  ensureRange: (start: number, end: number) => void;
  selected: ReadonlyMap<string, EntityRowDTO>;
  focusedIndex: number;
  onFocusIndex: (index: number) => void;
  onToggleRow: (row: EntityRowDTO, index: number, extend: boolean) => void;
  onOpenRow: (row: EntityRowDTO) => void;
  onStatusKey: (statusIndex: number) => void;
  onSetRowStatus: (row: EntityRowDTO, status: LearningStatus) => void;
  loading: boolean;
  error: string | null;
  empty: EmptyMessage | null;
  statusDisabled?: boolean;
}

export function RosterTable({
  kind,
  anchorMetric,
  columns,
  total,
  rowAt,
  ensureRange,
  selected,
  focusedIndex,
  onFocusIndex,
  onToggleRow,
  onOpenRow,
  onStatusKey,
  onSetRowStatus,
  loading,
  error,
  empty,
  statusDisabled = false,
}: RosterTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = total ?? 0;

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const firstIndex = items.length > 0 ? items[0].index : -1;
  const lastIndex = items.length > 0 ? items[items.length - 1].index : -1;

  useEffect(() => {
    if (firstIndex >= 0) ensureRange(firstIndex, lastIndex);
  }, [firstIndex, lastIndex, ensureRange]);

  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < count) virtualizer.scrollToIndex(focusedIndex, { align: 'auto' });
  }, [focusedIndex, count, virtualizer]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    // Only the grid itself owns roster navigation; keys from a checkbox, open button or status
    // menu must not also toggle/select the focused row.
    if (event.target !== event.currentTarget || count === 0) return;
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
      default:
        break;
    }
    if (event.key >= '1' && event.key <= '5') {
      event.preventDefault();
      onStatusKey(Number(event.key) - 1);
    }
  };

  const gridTemplate = `34px 62px minmax(150px, 1.6fr) ${columns.map(() => 'minmax(98px, 0.8fr)').join(' ')} 92px`;
  const minWidth = 34 + 62 + 150 + columns.length * 98 + 92;
  const aggregateKind = kind === 'bnc_family' || kind === 'cet_entry';

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--border-subtle)]">
      {error && (
        <p className="border-b border-[var(--signal)]/30 bg-[var(--signal-soft)] px-4 py-2 text-[11px] text-[var(--signal-hover)]">读取失败：{error}</p>
      )}
      <div
        ref={scrollRef}
        role="grid"
        tabIndex={0}
        aria-label="检索结果名录"
        aria-rowcount={count > 0 ? count + 1 : 1}
        onKeyDown={onKeyDown}
        className="lexicon-table-container scroll-thin min-h-0 flex-1 overflow-auto outline-none"
      >
        <div className="lex-table-inner w-full" style={{ ['--table-min-w' as string]: `${minWidth}px` }}>
          <div
            role="row"
            className="roster-head sticky top-0 z-10 hidden items-stretch text-[10px] md:grid"
            style={{ gridTemplateColumns: gridTemplate, minWidth }}
          >
            <span className="flex items-center justify-center px-1 py-2"><span className="sr-only">选择</span></span>
            <span className="flex items-center justify-end border-l border-[var(--border-hairline)] px-2 py-2" title={anchorMetric ? columnLabel(anchorMetric) : 'CET 等级'}>
              {anchorMetric ? shortHeader(anchorMetric) : 'CET'}
            </span>
            <span className="flex items-center border-l border-[var(--border-hairline)] px-2 py-2">词条</span>
            {columns.map((metric) => (
              <span key={metric} className="flex min-w-0 items-center justify-end gap-1 border-l border-[var(--border-hairline)] px-2 py-2 text-right">
                <span className="truncate">{columnLabel(metric)}</span>
                {METRICS[metric]?.provenance === 'derived' && <span className="text-[var(--pencil)]" aria-hidden>◇</span>}
              </span>
            ))}
            <span className="flex items-center justify-end border-l border-[var(--border-hairline)] px-2 py-2">学习</span>
          </div>

          {count === 0 && !loading && (
            <div className="px-6 py-12 text-center">
              <p className="font-display text-lg font-semibold text-[var(--text-primary)]">{empty ? empty.title : '没有结果'}</p>
              {empty ? (
                <>
                  <ul className="mx-auto mt-2 max-w-md space-y-1 text-left">
                    {empty.detail.map((line) => (
                      <li key={line} className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{line}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {empty.actions.map((action) => (
                      <button key={action.label} type="button" onClick={action.onClick} className="btn">{action.label}</button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">放宽条件，或换一个来源再看。</p>
              )}
            </div>
          )}
          {count === 0 && loading && <p className="px-4 py-10 text-center text-[11px] text-[var(--text-muted)]">正在检索…</p>}

          <div role="rowgroup" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {items.map((item) => {
              const row = rowAt(item.index);
              const selectedRow = row ? selected.has(row.ref) : false;
              const focused = item.index === focusedIndex;
              return (
                <div
                  key={item.key}
                  role="row"
                  aria-rowindex={item.index + 2}
                  aria-selected={selectedRow}
                  data-selected={selectedRow ? 'true' : 'false'}
                  data-focused={focused ? 'true' : 'false'}
                  className="roster-row absolute left-0 top-0 w-full"
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                >
                  {row ? (
                    <>
                      <div className="hidden h-full items-stretch md:grid" style={{ gridTemplateColumns: gridTemplate, minWidth }}>
                        <CheckCell row={row} selected={selectedRow} index={item.index} onFocusIndex={onFocusIndex} onToggleRow={onToggleRow} />
                        <div role="gridcell" className="flex items-center justify-end border-l border-[var(--border-hairline)] px-2">
                          <AnchorValue kind={kind} anchorMetric={anchorMetric} row={row} />
                        </div>
                        <div role="gridcell" className="flex min-w-0 flex-col justify-center border-l border-[var(--border-hairline)] px-2">
                          <WordCell row={row} index={item.index} onOpenRow={onOpenRow} onFocusIndex={onFocusIndex} />
                        </div>
                        {columns.map((metric) => {
                          const cell = row.metrics.find((entry) => entry.metric === metric);
                          const missing = !cell || cell.value === null;
                          return (
                            <div
                              key={metric}
                              role="gridcell"
                              className={cx('flex items-center justify-end border-l border-[var(--border-hairline)] px-2 text-right font-mono-tabular text-[11px]', missing ? 'text-[var(--text-faint)]' : cell?.provenance === 'derived' ? 'voice-computed' : 'text-[var(--text-secondary)]')}
                              title={missing ? `${METRICS[metric]?.source ?? ''} 未收录` : columnLabel(metric)}
                            >
                              {cell ? formatMetricValue(metric, cell.value) : '—'}
                            </div>
                          );
                        })}
                        <div role="gridcell" className="flex items-center justify-end border-l border-[var(--border-hairline)] px-1.5">
                          <StatusControl status={row.status} compact disabled={aggregateKind || statusDisabled} disabledReason={statusDisabled ? '本地学习库不可用' : undefined} onSet={(status) => onSetRowStatus(row, status)} />
                        </div>
                      </div>

                      <div className="flex h-full items-center gap-1.5 px-2 md:hidden">
                        <CheckCell row={row} selected={selectedRow} index={item.index} onFocusIndex={onFocusIndex} onToggleRow={onToggleRow} />
                        <button
                          type="button"
                          onClick={() => {
                            onFocusIndex(item.index);
                            onOpenRow(row);
                          }}
                          className="min-w-0 flex-1 py-1 text-left"
                          aria-label={`打开 ${row.label}`}
                        >
                          <span className="flex items-baseline gap-1.5">
                            <span className="font-mono-tabular text-[10px] text-[var(--text-muted)]">
                              <AnchorValue kind={kind} anchorMetric={anchorMetric} row={row} compact />
                            </span>
                            <span className="min-w-0 truncate font-display text-[15px] font-semibold text-[var(--text-primary)]">{row.label}</span>
                            <Badges row={row} compact />
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-[10px]">
                            {columns.slice(0, 2).map((metric) => {
                              const cell = row.metrics.find((entry) => entry.metric === metric);
                              return (
                                <span key={metric} className="font-mono-tabular text-[var(--text-secondary)]">
                                  {cell ? formatMetricValue(metric, cell.value) : '—'}
                                </span>
                              );
                            })}
                          </span>
                        </button>
                        <span className="shrink-0">
                          <StatusControl status={row.status} compact disabled={aggregateKind || statusDisabled} disabledReason={statusDisabled ? '本地学习库不可用' : undefined} onSet={(status) => onSetRowStatus(row, status)} />
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center gap-3 px-3">
                      <span className="h-3 w-3 rounded-sm bg-[var(--bg-inset)]" />
                      <span className="h-2.5 w-36 animate-pulse rounded-sm bg-[var(--bg-inset)]" />
                      <span className="ml-auto font-mono-tabular text-[9px] text-[var(--text-faint)]">LOADING</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function shortHeader(metric: MetricId): string {
  switch (metric) {
    case 'coca2020.hw_rank':
      return '词头排名';
    case 'coca2020.lp_rank':
      return '官方排名';
    case 'bnc25k.family_band':
      return '频段';
    case 'bnc25k.member_freq':
      return '成员频次';
    default:
      return columnLabel(metric);
  }
}

function metricValue(row: EntityRowDTO, metric: MetricId | null): number | null {
  if (!metric) return null;
  return row.metrics.find((cell) => cell.metric === metric)?.value ?? null;
}

function AnchorValue({ kind, anchorMetric, row, compact = false }: { kind: EntityKind; anchorMetric: MetricId | null; row: EntityRowDTO; compact?: boolean }) {
  if (kind === 'cet_entry') {
    const levels = row.badges.filter((badge) => badge === 'cet4' || badge === 'cet6');
    if (levels.length === 0) return <span className="text-[var(--text-faint)]">—</span>;
    return (
      <span className="inline-flex gap-1 font-mono-tabular text-[9px] text-[var(--stamp)]">
        {levels.map((level) => (
          <span key={level}>{level.toUpperCase()}</span>
        ))}
      </span>
    );
  }
  if (!anchorMetric) return <span>—</span>;
  const value = metricValue(row, anchorMetric);
  const unit = METRICS[anchorMetric]?.unit;
  const official = METRICS[anchorMetric]?.provenance === 'official';
  if (value === null) {
    return (
      <span className="text-[var(--text-faint)]" title={`${METRICS[anchorMetric]?.source ?? ''} 未收录`}>
        —<span className="ml-0.5 text-[8px] align-super">ᶠ</span>
      </span>
    );
  }
  const text = compact ? (unit === 'rank' ? rank(value) : unit === 'band' ? band(value) : n(value)) : formatMetricValue(anchorMetric, value);
  return <span className={cx('truncate font-mono-tabular text-[11px]', official ? 'text-[var(--stamp)]' : 'voice-computed')}>{text}</span>;
}

function WordCell({ row, index, onOpenRow, onFocusIndex }: { row: EntityRowDTO; index: number; onOpenRow: (row: EntityRowDTO) => void; onFocusIndex: (index: number) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => {
          onFocusIndex(index);
          onOpenRow(row);
        }}
        title={row.ref}
        className="min-w-0 truncate border-b border-transparent text-left font-display text-[15px] font-semibold leading-tight text-[var(--text-primary)] hover:border-[var(--signal)] hover:text-[var(--signal)]"
      >
        {row.label}
      </button>
      <Badges row={row} />
    </div>
  );
}

function Badges({ row, compact = false }: { row: EntityRowDTO; compact?: boolean }) {
  const badges = row.badges.filter((badge) => ROW_BADGES.includes(badge));
  const multiFamily = row.badges.includes('multi_family');
  return (
    <span className="flex shrink-0 items-center gap-1">
      {multiFamily && (
        <span className="font-display text-[13px] leading-none text-[var(--stamp)]" title="多词族归属：详情页逐族列出，行内不借用单个值" aria-label="多词族归属">
          ✱
        </span>
      )}
      {badges.slice(0, compact ? 1 : 2).map((badge) => (
        <span key={badge} className="border border-[var(--border-subtle)] px-1 py-px font-mono-tabular text-[8px] leading-none text-[var(--text-muted)]">
          {BADGE_LABELS[badge]}
        </span>
      ))}
      {badges.length > (compact ? 1 : 2) && (
        <span className="font-mono-tabular text-[8px] text-[var(--text-faint)]">+{badges.length - (compact ? 1 : 2)}</span>
      )}
    </span>
  );
}

function CheckCell({
  row,
  selected,
  index,
  onFocusIndex,
  onToggleRow,
}: {
  row: EntityRowDTO;
  selected: boolean;
  index: number;
  onFocusIndex: (index: number) => void;
  onToggleRow: (row: EntityRowDTO, index: number, extend: boolean) => void;
}) {
  return (
    <div role="gridcell" className="flex items-center justify-center">
      <button
        type="button"
        aria-label={selected ? `取消选择 ${row.label}` : `选择 ${row.label}`}
        aria-pressed={selected}
        onClick={(event) => {
          event.stopPropagation();
          onFocusIndex(index);
          onToggleRow(row, index, event.shiftKey);
        }}
        className="flex h-8 w-8 items-center justify-center"
      >
        <span className={cx('flex h-3.5 w-3.5 items-center justify-center border', selected ? 'border-[var(--signal)] bg-[var(--signal)] text-white' : 'border-[var(--border-strong)] bg-transparent')}>
          {selected && <Check size={10} aria-hidden />}
        </span>
      </button>
    </div>
  );
}
