/**
 * Query bar (PRODUCT_SPEC §3.1 desktop): kind switcher, text search with mode, sort and the
 * column chooser. Everything it emits is state, never a query: the workspace owns the mapping.
 */
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Columns3, Search, X } from 'lucide-react';
import type { EntityKind, MetricId, SortSpec } from '../../../v2/index.ts';
import {
  ALLOWED_COLUMNS,
  EXPLORE_KINDS,
  KIND_LABELS,
  TEXT_MODES,
  TEXT_MODE_LABELS,
  columnLabel,
  sortLabel,
  type ExploreState,
} from './filterState.ts';

export interface QueryBarProps {
  state: ExploreState;
  draftText: string;
  columns: MetricId[];
  total: number | null;
  onKindChange: (kind: EntityKind) => void;
  onTextChange: (text: string) => void;
  onModeChange: (mode: ExploreState['textMode']) => void;
  onSortChange: (sort: SortSpec) => void;
  onColumnsChange: (columns: MetricId[]) => void;
}

export function QueryBar({
  state,
  draftText,
  columns,
  total,
  onKindChange,
  onTextChange,
  onModeChange,
  onSortChange,
  onColumnsChange,
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
      {/* kind tabs (desktop) / chips (mobile) */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pt-2">
        {EXPLORE_KINDS.map((kind) => {
          const active = kind === state.kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onKindChange(kind)}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 rounded-t-lg px-3 py-1.5 text-xs ${
                active
                  ? 'border-b-2 border-[var(--accent-primary)] font-medium text-[var(--accent-hover)]'
                  : 'border-b-2 border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {KIND_LABELS[kind]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5">
          <Search size={14} className="text-[var(--text-muted)]" />
          <input
            value={draftText}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={`在 ${KIND_LABELS[state.kind]} 中搜索拼写…`}
            aria-label="在当前类别中搜索"
            className="w-full bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          {draftText.length > 0 && (
            <button type="button" onClick={() => onTextChange('')} aria-label="清空搜索" className="text-[var(--text-muted)]">
              <X size={13} />
            </button>
          )}
        </div>

        <select
          value={state.textMode}
          onChange={(event) => onModeChange(event.target.value as ExploreState['textMode'])}
          aria-label="匹配方式"
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-secondary)]"
        >
          {TEXT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {TEXT_MODE_LABELS[mode]}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <select
            value={currentSortKey}
            onChange={(event) => {
              const option = sortOptions.find((item) => item.key === event.target.value);
              if (option) onSortChange({ ...option.sort, dir: state.sort.dir });
            }}
            aria-label="排序字段"
            className="max-w-[190px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-secondary)]"
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
            className="rounded-lg border border-[var(--border-subtle)] p-1.5 text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
          >
            {state.sort.dir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setColumnsOpen((open) => !open)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
            aria-expanded={columnsOpen}
          >
            <Columns3 size={14} />
            列
            <span className="text-[var(--text-muted)]">{columns.length}</span>
          </button>
          {columnsOpen && (
            <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 shadow-xl">
              <p className="px-1 pb-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                {KIND_LABELS[state.kind]} 可用指标
              </p>
              <ul className="max-h-72 overflow-y-auto">
                {allowed.map((metric) => {
                  const checked = columns.includes(metric);
                  return (
                    <li key={metric}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
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
              <p className="px-1 pt-1 text-[10px] text-[var(--text-muted)]">
                只提供该类别能取到值的指标（提升规则为 null 的指标不出现）。
              </p>
            </div>
          )}
        </div>

        <span className="ml-auto text-xs text-[var(--text-muted)]">
          {total === null ? '统计中…' : `${total.toLocaleString('en-US')} 条`}
        </span>
      </div>
    </div>
  );
}
