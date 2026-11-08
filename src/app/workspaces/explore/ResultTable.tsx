/**
 * Virtualised result roster (Shape Brief §5.4).
 *
 * Rows are addressed by result index and rendered only for the viewport; `useRowsWindow` fetches
 * the matching 200-row windows. The table never filters, sorts or rewrites values — it renders the
 * DTO cells it receives, with the source voice visible in every number:
 *   - the first-column anchor carries the kind's identity rank/size in its own ink (official red
 *     for official ranks/levels, pencil grey for computed ones, "—" + note for absence);
 *   - column headers own the source tag and the（计算）marker, so cells stay clean;
 *   - exceptions print as typographic notes (✱ multi-family, micro-tags), never as noise;
 *   - the personal ink (learning status) is the rightmost cell, with an inline quick-set.
 *
 * Keyboard model (from v1): ↑↓ move, Shift+↑↓ extend, Space toggles, Enter opens detail, 1–5 set
 * the learning status of the selection (or focused row when nothing is selected).
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, ChevronDown } from 'lucide-react';
import type { EntityKind, EntityRowDTO, LearningStatus, MetricId, RowBadge } from '../../../v2/index.ts';
import { METRICS } from '../../../v2/index.ts';
import { columnLabel, formatMetricValue, missingHint } from './filterState.ts';

export const ROW_HEIGHT = 46;

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

/** Badges that repeat what the anchor cell already says stay out of the roster row. */
const ROW_BADGES: readonly RowBadge[] = ['multi_pos', 'multi_family', 'cet4', 'cet6', 'case_variant', 'candidate_variant'];

export interface EmptyMessage {
  title: string;
  detail: string[];
  actions: { label: string; onClick: () => void }[];
}

export interface ResultTableProps {
  kind: EntityKind;
  /** The kind's identity metric leading the roster; null means the CET level badge is the anchor. */
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
  /** Inline quick-set from the status cell; applies to this row's target only. */
  onSetRowStatus: (row: EntityRowDTO, status: LearningStatus) => void;
  loading: boolean;
  error: string | null;
  empty: EmptyMessage | null;
}

export function ResultTable({
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
        return;
      default:
        break;
    }

    if (event.key >= '1' && event.key <= '5') {
      event.preventDefault();
      onStatusKey(Number(event.key) - 1);
    }
  };

  // Shared column template: checkbox · anchor · headword(+notes) · data columns · status.
  const gridTemplate = `44px minmax(76px, 0.5fr) minmax(150px, 1.5fr) ${columns
    .map(() => 'minmax(104px, 0.8fr)')
    .join(' ')} 108px`;
  const minWidth = 44 + 76 + 150 + columns.length * 104 + 108;
  const isAggregateKind = kind === 'bnc_family' || kind === 'cet_entry';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <p className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          读取失败：{error}
        </p>
      )}

      <div
        ref={scrollRef}
        role="grid"
        tabIndex={0}
        aria-label="检索结果名录"
        aria-rowcount={count > 0 ? count + 1 : 1}
        onKeyDown={onKeyDown}
        style={{ scrollPaddingTop: 44 }}
        className="lexicon-table-container min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
      >
        <div className="lex-table-inner w-full" style={{ ['--table-min-w' as string]: `${minWidth}px` }}>
          {/* column headers (sticky, inside the scroll box so horizontal alignment always holds) */}
          <div
            role="row"
            aria-rowindex={1}
            className="sticky top-0 z-10 hidden items-stretch border-b border-[var(--border-strong)] bg-[var(--bg-surface)] text-[11px] font-medium leading-tight text-[var(--text-muted)] md:grid"
            style={{ gridTemplateColumns: gridTemplate, minWidth }}
          >
            <span className="flex items-center justify-center py-2">
              <span className="sr-only">选择</span>
            </span>
            <span className="flex min-w-0 items-center truncate border-l border-[var(--border-subtle)] px-2 py-2" title={anchorMetric ? columnLabel(anchorMetric) : 'CET 等级'}>
              {anchorMetric ? columnLabel(anchorMetric) : 'CET 等级'}
            </span>
            <span className="flex items-center border-l border-[var(--border-subtle)] px-2 py-2">词条</span>
            {columns.map((metric) => (
              <span key={metric} className="flex items-center gap-1.5 border-l border-[var(--border-subtle)] px-2 py-2" title={columnLabel(metric)}>
                <span className={`truncate text-[10px] uppercase tracking-wide ${metricSourceTone(metric)}`}>
                  {metricSourceTag(metric)}
                </span>
                <span className="truncate">{columnLabel(metric)}</span>
              </span>
            ))}
            <span className="flex items-center border-l border-[var(--border-subtle)] px-2 py-2">学习状态</span>
          </div>

          {count === 0 && !loading && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">{empty ? empty.title : '没有结果'}</p>
              {empty ? (
                <>
                  <ul className="mx-auto mt-2 max-w-md space-y-1 text-left">
                    {empty.detail.map((line) => (
                      <li key={line} className="text-xs text-[var(--text-secondary)]">
                        {line}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {empty.actions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={action.onClick}
                        className="rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-hover)]"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">放宽条件，或换一个来源再看。</p>
              )}
            </div>
          )}
          {count === 0 && loading && <p className="px-4 py-10 text-center text-xs text-[var(--text-muted)]">正在检索…</p>}

          <div role="rowgroup" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {items.map((item) => {
              const row = rowAt(item.index);
              const isSelected = row ? selected.has(row.ref) : false;
              const isFocused = item.index === focusedIndex;
              return (
                <div
                  key={item.key}
                  role="row"
                  aria-rowindex={item.index + 2}
                  aria-selected={isSelected}
                  className={`absolute left-0 top-0 w-full border-b border-[var(--border-subtle)] ${
                    isFocused ? 'bg-[var(--accent-soft)]' : isSelected ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-hover)]'
                  }`}
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                >
                  {row ? (
                    <>
                      {/* desktop roster row */}
                      <div
                        className="hidden h-full items-stretch md:grid"
                        style={{ gridTemplateColumns: gridTemplate, minWidth }}
                      >
                        <StatusCheckCell
                          row={row}
                          selected={isSelected}
                          onFocusIndex={onFocusIndex}
                          index={item.index}
                          onToggleRow={onToggleRow}
                        />
                        <div role="gridcell" className="flex items-center justify-end border-l border-[var(--border-subtle)] px-2 font-mono-tabular text-[13px]">
                          <AnchorValue kind={kind} anchorMetric={anchorMetric} row={row} />
                        </div>
                        <div role="gridcell" className="flex min-w-0 flex-col justify-center border-l border-[var(--border-subtle)] px-2">
                          <WordCell row={row} onOpenRow={onOpenRow} onFocusIndex={onFocusIndex} index={item.index} />
                        </div>
                        {columns.map((metric) => (
                          <div
                            key={metric}
                            role="gridcell"
                            className={`flex items-center justify-end border-l border-[var(--border-subtle)] px-2 font-mono-tabular text-[13px] ${metricInkTone(metric)}`}
                            title={ cellForTitle(metric, row) }
                          >
                            {formatMetricValue(metric, metricValueOf(metric, row))}
                          </div>
                        ))}
                        <div role="gridcell" className="flex items-stretch border-l border-[var(--border-subtle)]">
                          <StatusCell row={row} disabled={isAggregateKind} onSet={(status) => onSetRowStatus(row, status)} />
                        </div>
                      </div>

                      {/* mobile two-line card */}
                      <div className="flex h-full items-center gap-1 px-1.5 md:hidden">
                        <StatusCheckCell
                          row={row}
                          selected={isSelected}
                          onFocusIndex={onFocusIndex}
                          index={item.index}
                          onToggleRow={onToggleRow}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            onFocusIndex(item.index);
                            onOpenRow(row);
                          }}
                          className="min-w-0 flex-1 py-1.5 text-left"
                        >
                          <span className="flex items-baseline gap-1.5">
                            <span className="font-mono-tabular text-[12px] text-[var(--text-muted)]">
                              <AnchorValue kind={kind} anchorMetric={anchorMetric} row={row} compact />
                            </span>
                            <span className="min-w-0 truncate font-serif-lexicon text-[15px] font-semibold text-[var(--text-primary)]">
                              {row.label}
                            </span>
                            <NotesCell row={row} />
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-[11px]">
                            {columns.slice(0, 2).map((metric) => (
                              <span key={metric} className={`font-mono-tabular ${metricInkTone(metric)}`}>
                                {formatMetricValue(metric, metricValueOf(metric, row))}
                              </span>
                            ))}
                            {columns.length > 2 && <span className="text-[10px] text-[var(--text-muted)]">+{columns.length - 2}</span>}
                            <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] leading-none ${statusTone(row.status)}`}>
                              {statusText(row.status)}
                            </span>
                          </span>
                        </button>
                      </div>
                    </>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

function metricValueOf(metric: MetricId, row: EntityRowDTO): number | null {
  return row.metrics.find((cell) => cell.metric === metric)?.value ?? null;
}

function cellForTitle(metric: MetricId, row: EntityRowDTO): string {
  const value = metricValueOf(metric, row);
  return value === null ? missingHint(metric) : columnLabel(metric);
}

/** The anchor number in its own voice; absence is a dash plus a written note, never a bare zero. */
function AnchorValue({
  kind,
  anchorMetric,
  row,
  compact = false,
}: {
  kind: EntityKind;
  anchorMetric: MetricId | null;
  row: EntityRowDTO;
  compact?: boolean;
}) {
  if (kind === 'cet_entry') {
    const levels = row.badges.filter((badge) => badge === 'cet4' || badge === 'cet6');
    if (levels.length === 0) return <span title="未关联 CET 等级">—</span>;
    return (
      <span
        className={`rounded-sm px-1 py-px text-[11px] font-medium ${officialInk()}`}
        title={`${levels.join(' · ')}（CET 大纲级别）`}
      >
        {levels
          .map((level) => level.replace('cet', 'CET'))
          .sort()
          .join('·')}
      </span>
    );
  }
  if (!anchorMetric) return <span>—</span>;
  const value = metricValueOf(anchorMetric, row);
  const missingNote = `${METRICS[anchorMetric]?.source ?? ''} 未收录`;
  const official = METRICS[anchorMetric]?.provenance === 'official';
  return (
    <span className="truncate" title={value === null ? missingNote : columnLabel(anchorMetric)}>
      {value === null ? (
        <span className="inline-flex items-baseline gap-0.5">
          <span>—</span>
          <span className={`text-[9px] leading-none ${official ? 'text-[var(--official)]' : 'text-[var(--text-muted)]'}`} aria-label={missingNote}>
            ᶠ
          </span>
        </span>
      ) : (
        <span className={official ? officialInk() : undefined}>{compact ? compactNumber(value, anchorMetric) : formatMetricValue(anchorMetric, value)}</span>
      )}
    </span>
  );
}

function officialInk(): string {
  return 'text-[var(--official)]';
}

/** Compact label for the mobile anchor: ranks keep #, band prints as 1k, freq as plain number. */
function compactNumber(value: number | null, anchorMetric: MetricId): string {
  const unit = METRICS[anchorMetric]?.unit;
  if (value === null) return '—';
  if (unit === 'rank') return `#${value.toLocaleString('en-US')}`;
  if (unit === 'band') return `${value}k`;
  return value.toLocaleString('en-US');
}

/** Headword in the serif voice with typographic exception notes inline. */
function WordCell({
  row,
  onOpenRow,
  onFocusIndex,
  index,
}: {
  row: EntityRowDTO;
  onOpenRow: (row: EntityRowDTO) => void;
  onFocusIndex: (index: number) => void;
  index: number;
}) {
  const badges = row.badges.filter((badge) => ROW_BADGES.includes(badge));
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => {
          onFocusIndex(index);
          onOpenRow(row);
        }}
        title={row.ref}
        className="min-w-0 truncate border-b border-transparent text-left font-serif-lexicon text-[15px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-hover)]"
      >
        {row.label}
      </button>
      {row.badges.includes('multi_family') && (
        <span
          className="shrink-0 font-serif-lexicon text-[14px] leading-none text-[var(--official)]"
          title="多词族归属：该词形属于多个 BNC 词族，行内显示的提升值取 max（见详情）"
          aria-label="多词族归属"
        >
          ✱
        </span>
      )}
      {badges
        .filter((badge) => badge !== 'multi_family')
        .slice(0, 3)
        .map((badge) => (
          <span
            key={badge}
            className="shrink-0 rounded-sm border border-[var(--border-subtle)] px-1 py-px text-[9px] leading-none text-[var(--text-muted)]"
          >
            {BADGE_LABELS[badge]}
          </span>
        ))}
      {badges.length > 4 && <span className="text-[10px] text-[var(--text-muted)]">+{badges.length - 4}</span>}
    </div>
  );
}

/** Mobile inline notes (same truth as the desktop notes, folded into the second line). */
function NotesCell({ row }: { row: EntityRowDTO }) {
  const badges = row.badges.filter((badge) => ROW_BADGES.includes(badge));
  return (
    <>
      {row.badges.includes('multi_family') && (
        <span className="font-serif-lexicon text-[13px] leading-none text-[var(--official)]" title="多词族归属" aria-label="多词族归属">
          ✱
        </span>
      )}
      {badges
        .filter((badge) => badge !== 'multi_family')
        .slice(0, 2)
        .map((badge) => (
          <span
            key={badge}
            className="rounded-sm border border-[var(--border-subtle)] px-1 py-px text-[9px] leading-none text-[var(--text-muted)]"
          >
            {BADGE_LABELS[badge]}
          </span>
        ))}
    </>
  );
}

const STATUS_TONES: Record<LearningStatus, string> = {
  unrated: 'bg-[var(--st-unrated-soft)] text-[var(--st-unrated)]',
  queued: 'bg-[var(--st-queued-soft)] text-[var(--st-queued)]',
  learning: 'bg-[var(--st-learning-soft)] text-[var(--st-learning)]',
  mastered: 'bg-[var(--st-mastered-soft)] text-[var(--st-mastered)]',
  deferred: 'bg-[var(--st-deferred-soft)] text-[var(--st-deferred)]',
};

const STATUS_TEXT: Record<LearningStatus, string> = {
  unrated: '未评',
  queued: '待学',
  learning: '在学',
  mastered: '掌握',
  deferred: '暂缓',
};

function statusTone(status: EntityRowDTO['status']): string {
  if (!status) return 'bg-[var(--bg-elevated)] text-[var(--text-muted)]';
  return STATUS_TONES[status.status];
}

function statusText(status: EntityRowDTO['status']): string {
  if (!status) return '未评';
  return status.origin === 'inherited' ? `${STATUS_TEXT[status.status]}（继承）` : STATUS_TEXT[status.status];
}

interface StatusCellProps {
  row: EntityRowDTO;
  disabled: boolean;
  onSet: (status: LearningStatus) => void;
}

/**
 * The personal ink: shows the effective status with a text label (colour is never the only cue)
 * and opens a compact quick-set on click. keyboard 1–5 keeps working through the table above.
 */
function StatusCell({ row, disabled, onSet }: StatusCellProps) {
  const [open, setOpen] = useState(false);
  if (disabled) {
    return (
      <span className="flex w-full items-center px-2 text-[10px] italic text-[var(--text-muted)]" title="聚合实体没有独立学习目标：请在其成员词形上标记">
        聚合
      </span>
    );
  }
  const current = row.status?.status ?? 'unrated';
  return (
    <span className="relative flex w-full items-center px-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`修改学习状态，当前 ${statusText(row.status)}`}
        className={`flex w-full items-center justify-between gap-1 rounded px-1.5 py-1 text-[11px] leading-none ${statusTone(row.status)}`}
      >
        {statusText(row.status)}
        <ChevronDown size={11} className="opacity-70" aria-hidden />
      </button>
      {open && (
        <ul
          role="menu"
          aria-label="设置学习状态"
          className="absolute left-1 right-1 top-full z-30 mt-1 overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1 shadow-[0_10px_28px_rgba(15,20,30,0.18)]"
        >
          {(Object.keys(STATUS_TEXT) as LearningStatus[]).map((status, index) => (
            <li key={status} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSet(status);
                }}
                className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)] ${
                  status === current ? 'font-medium' : ''
                } ${STATUS_TONES[status]}`}
              >
                {STATUS_TEXT[status]}
                <span className="text-[9px] text-[var(--text-muted)]">{index + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

interface CheckCellProps {
  row: EntityRowDTO;
  selected: boolean;
  onFocusIndex: (index: number) => void;
  index: number;
  onToggleRow: (row: EntityRowDTO, index: number, extend: boolean) => void;
}

/** Selection control with a 44px touch target (the 16px checkbox inside is the visual only). */
function StatusCheckCell({ row, selected, onFocusIndex, index, onToggleRow }: CheckCellProps) {
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
        className="flex h-9 w-9 items-center justify-center md:h-8 md:w-8"
      >
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-sm border ${
            selected
              ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white'
              : 'border-[var(--border-strong)] hover:border-[var(--accent-primary)]'
          }`}
        >
          {selected && <Check size={11} aria-hidden />}
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric voice helpers (labels come from the registry; the voice repeats its provenance)
// ---------------------------------------------------------------------------

function metricSourceTag(metric: MetricId): string {
  const source = METRICS[metric]?.source;
  if (source === 'coca2020') return 'COCA';
  if (source === 'bnc25k') return 'BNC';
  if (source === 'cet2016') return 'CET';
  return '';
}

function metricSourceTone(metric: MetricId): string {
  return METRICS[metric]?.provenance === 'official' ? 'text-[var(--official)]' : 'text-[var(--text-muted)]';
}

/** Official ink reads darker; computed values read as pencil — with（计算）still in the header. */
function metricInkTone(metric: MetricId): string {
  return METRICS[metric]?.provenance === 'official' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]';
}
