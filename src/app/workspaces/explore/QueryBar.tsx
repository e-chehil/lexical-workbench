/**
 * Query bar (Shape Brief §4.1): the query describes itself — kind tabs, text search with mode,
 * the active conditions as removable chips (inapplicable ones disabled with a written reason),
 * sort, column chooser and the result total. Everything it emits is state, never a query: the
 * workspace owns the mapping to `LexQuery`.
 */
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Columns3, Lock, Search, SlidersHorizontal, X } from 'lucide-react';
import type { EntityKind, EntityRef, MetricId, SortSpec } from '../../../v2/index.ts';
import {
  ALLOWED_COLUMNS,
  EXPLORE_KINDS,
  KIND_LABELS,
  TEXT_MODES,
  TEXT_MODE_LABELS,
  columnLabel,
  sortLabel,
  type ExploreState,
  type FilterChip,
} from './filterState.ts';

export interface QueryBarProps {
  state: ExploreState;
  draftText: string;
  columns: MetricId[];
  chips: FilterChip[];
  total: number | null;
  onKindChange: (kind: EntityKind) => void;
  onTextChange: (text: string) => void;
  onModeChange: (mode: ExploreState['textMode']) => void;
  onSortChange: (sort: SortSpec) => void;
  onColumnsChange: (columns: MetricId[]) => void;
  onRemoveChip: (id: string) => void;
  onOpenFilters: () => void;
}

export function QueryBar({
  state,
  draftText,
  columns,
  chips,
  total,
  onKindChange,
  onTextChange,
  onModeChange,
  onSortChange,
  onColumnsChange,
  onRemoveChip,
  onOpenFilters,
}: QueryBarProps) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const allowed = ALLOWED_COLUMNS[state.kind];

  const sortOptions = useMemo(() => {
    const options: { key: string; label: string; sort: SortSpec }[] = [
      { key: 'spelling', label: '拼写', sort: { by: 'spelling', dir: 'asc' } },
    ];
    for (const metric of allowed) options.push({ key: metric, label: columnLabel(metric), sort: { by: 'metric', metric, dir: 'asc' } });
    return options;
  }, [allowed]);

  const currentSortKey = state.sort.by === 'spelling' ? 'spelling' : state.sort.metric;
  const toggleDirection = (): void => {
    onSortChange({ ...state.sort, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' });
  };

  return (
    <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      {/* kind tabs */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pt-1.5">
        {EXPLORE_KINDS.map((kind) => {
          const active = kind === state.kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onKindChange(kind)}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 border-b-2 px-2.5 py-1.5 text-xs transition-colors ${
                active
                  ? 'border-[var(--accent-primary)] font-medium text-[var(--accent-hover)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {KIND_LABELS[kind]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 focus-within:border-[var(--accent-primary)] focus-within:bg-[var(--bg-surface)]">
          <Search size={14} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
          <input
            value={draftText}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={`在 ${KIND_LABELS[state.kind]} 中搜索拼写…`}
            aria-label="在当前类别中搜索"
            className="w-full bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          {draftText.length > 0 && (
            <button type="button" onClick={() => onTextChange('')} aria-label="清空搜索" className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              <X size={13} />
            </button>
          )}
          <select
            value={state.textMode}
            onChange={(event) => onModeChange(event.target.value as ExploreState['textMode'])}
            aria-label="匹配方式"
            className="shrink-0 rounded bg-transparent pr-0.5 text-[11px] text-[var(--text-muted)] outline-none"
          >
            {TEXT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {TEXT_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>

        <span className="mx-1 hidden h-5 w-px bg-[var(--border-subtle)] sm:block" aria-hidden />

        {/* Active scope, stated in one line: removable chips; inert ones disabled with a reason. */}
        <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" aria-label="当前生效条件">
          {chips.map((chip) =>
            chip.disabled ? (
              <li key={chip.id}>
                <span
                  title={chip.reason}
                  aria-label={`${chip.label}：${chip.reason}`}
                  className="inline-flex items-center gap-1 rounded border border-dashed border-[var(--border-strong)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]"
                >
                  <Lock size={10} aria-hidden />
                  {chip.label}
                  <button
                    type="button"
                    onClick={() => onRemoveChip(chip.id)}
                    aria-label={`移除条件：${chip.label}`}
                    className="rounded-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    <X size={11} />
                  </button>
                </span>
              </li>
            ) : (
              <li key={chip.id}>
                <span className="inline-flex items-center gap-1 rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                  {chip.label}
                  <button
                    type="button"
                    onClick={() => onRemoveChip(chip.id)}
                    aria-label={`移除条件：${chip.label}`}
                    className="rounded-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    <X size={11} />
                  </button>
                </span>
              </li>
            )
          )}
          <li>
            <button
              type="button"
              onClick={onOpenFilters}
              aria-haspopup="dialog"
              className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-hover)]"
            >
              <SlidersHorizontal size={11} aria-hidden />
              筛选
            </button>
          </li>
        </ul>

        <div className="flex items-center gap-1">
          <select
            value={currentSortKey}
            onChange={(event) => {
              const option = sortOptions.find((item) => item.key === event.target.value);
              if (option) onSortChange({ ...option.sort, dir: state.sort.dir });
            }}
            aria-label="排序字段"
            className="max-w-[170px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-1 text-[11px] text-[var(--text-secondary)]"
          >
            {sortOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleDirection}
            aria-label={`排序方向：${state.sort.dir === 'asc' ? '升序' : '降序'}`}
            title={sortLabel(state.sort)}
            className="rounded-md border border-[var(--border-subtle)] p-1 text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
          >
            {state.sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setColumnsOpen((open) => !open)}
            className="flex items-center gap-1 rounded-md border border-[var(--border-subtle)] px-1.5 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
            aria-expanded={columnsOpen}
          >
            <Columns3 size={13} />
            列
          </button>
          {columnsOpen && (
            <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 shadow-[0_10px_28px_rgba(15,20,30,0.14)]">
              <p className="px-1 pb-1 text-[10px] text-[var(--text-muted)]">{KIND_LABELS[state.kind]} 可以取值的指标</p>
              <ul className="max-h-72 overflow-y-auto">
                {allowed.map((metric) => {
                  const checked = columns.includes(metric);
                  return (
                    <li key={metric}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            onColumnsChange(checked ? columns.filter((item) => item !== metric) : [...columns, metric])
                          }
                          className="accent-[var(--accent-primary)]"
                        />
                        {columnLabel(metric)}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="px-1 pt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
                只提供该类别能取到值的指标；派生指标标注（计算）。首列身份列始终保留。
              </p>
            </div>
          )}
        </div>

        <span className="ml-auto shrink-0 text-xs text-[var(--text-muted)]" aria-live="polite">
          {total === null ? '统计中…' : `${total.toLocaleString('en-US')} 条`}
        </span>
      </div>
    </div>
  );
}
