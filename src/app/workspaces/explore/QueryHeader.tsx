/**
 * Query header: the workspace's self-description, kind clauses, search, sort, column chooser and
 * active condition chips. It never queries by itself; everything is emitted as route state.
 */
import { useState } from 'react';
import { Columns3, FolderPlus, Layers, X } from 'lucide-react';
import {
  type AggregateValue,
  type EntityKind,
  type MetricId,
  type SortSpec,
} from '../../../v2/index.ts';
import { METRICS } from '../../../v2/index.ts';
import {
  ALLOWED_COLUMNS,
  KIND_LABELS,
  TEXT_MODES,
  TEXT_MODE_LABELS,
  anchorMetricFor,
  columnLabel,
  type ExploreState,
  type FilterChip,
} from './filterState.ts';
import { cx, Modal, PageHeader } from '../../ui/index.tsx';
import { n } from '../../ui/format.ts';

const KIND_SHORT: Record<EntityKind, string> = {
  form: '词形',
  coca_headword: 'COCA 词头',
  coca_lemma_pos: 'COCA 词性',
  bnc_family: 'BNC 词族',
  bnc_member: 'BNC 成员',
  cet_entry: 'CET 词目',
};

const KINDS: EntityKind[] = ['form', 'coca_headword', 'coca_lemma_pos', 'bnc_family', 'bnc_member', 'cet_entry'];

function sortValue(sort: SortSpec): string {
  return sort.by === 'spelling' ? `spelling:${sort.dir}` : `${sort.metric}:${sort.dir}`;
}

function parseSort(value: string): SortSpec {
  const [left, dir] = value.split(':') as [string, 'asc' | 'desc'];
  if (left === 'spelling') return { by: 'spelling', dir };
  return { by: 'metric', metric: left as MetricId, dir };
}

export function QueryHeader({
  state,
  draftText,
  columns,
  chips,
  total,
  aggregates,
  onKindChange,
  onTextChange,
  onModeChange,
  onSortChange,
  onColumnsChange,
  onRemoveChip,
  onSaveQuery,
  onProject,
}: {
  state: ExploreState;
  draftText: string;
  columns: MetricId[];
  chips: FilterChip[];
  total: number | null;
  aggregates: AggregateValue[];
  onKindChange: (kind: EntityKind) => void;
  onTextChange: (text: string) => void;
  onModeChange: (mode: ExploreState['textMode']) => void;
  onSortChange: (sort: SortSpec) => void;
  onColumnsChange: (columns: MetricId[]) => void;
  onRemoveChip: (id: string) => void;
  onSaveQuery: () => void;
  onProject: () => void;
}) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState<MetricId[]>(columns);
  const anchor = anchorMetricFor(state.kind);
  const sortOptions = [
    { value: 'spelling:asc', label: '拼写 ↑' },
    { value: 'spelling:desc', label: '拼写 ↓' },
    ...(anchor ? [{ value: `${anchor}:asc`, label: `${columnLabel(anchor)} ↑` }, { value: `${anchor}:desc`, label: `${columnLabel(anchor)} ↓` }] : []),
    ...columns
      .filter((metric) => metric !== anchor)
      .flatMap((metric) => [
        { value: `${metric}:desc`, label: `${columnLabel(metric)} ↓` },
        { value: `${metric}:asc`, label: `${columnLabel(metric)} ↑` },
      ]),
  ];

  const summary = [
    KIND_LABELS[state.kind],
    total === null ? '检索中' : `${n(total)} 条`,
    chips.filter((chip) => !chip.disabled).length > 0 ? `${chips.filter((chip) => !chip.disabled).length} 个生效条件` : '无条件',
  ].join(' · ');

  return (
    <>
      <PageHeader
        eyebrow="01 / Explore · Form hub"
        title="词汇检索"
        description={summary}
        actions={
          <>
            <button type="button" onClick={onSaveQuery} className="btn" aria-label="保存查询">
              <FolderPlus size={13} /> <span className="hidden sm:inline">保存查询</span>
            </button>
            <button type="button" onClick={onProject} className="btn" aria-label="投影集合">
              <Layers size={13} /> <span className="hidden sm:inline">投影集合</span>
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <div className="no-scrollbar flex items-center gap-5 overflow-x-auto border-b border-[var(--border-subtle)]">
            {KINDS.map((kind) => (
              <button key={kind} type="button" onClick={() => onKindChange(kind)} className={cx('tab', state.kind === kind && 'tab-active')}>
                {KIND_SHORT[kind]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-full flex-1 items-center border border-[var(--border-strong)] bg-[var(--bg-elevated)] focus-within:border-[var(--signal)] sm:min-w-[220px]">
              <input
                value={draftText}
                onChange={(event) => onTextChange(event.target.value)}
                placeholder="搜索拼写…"
                aria-label="搜索词形"
                className="min-w-0 flex-1 bg-transparent px-2.5 py-2 font-display text-[15px] text-[var(--text-primary)] outline-none placeholder:font-sans placeholder:text-[12px] placeholder:text-[var(--text-faint)]"
              />
              {draftText.length > 0 && (
                <button type="button" onClick={() => onTextChange('')} className="px-1.5 text-[var(--text-faint)] hover:text-[var(--text-primary)]" aria-label="清除搜索">
                  <X size={13} />
                </button>
              )}
            </div>
            <select className="select h-[34px] flex-1 sm:flex-none" value={state.textMode} onChange={(event) => onModeChange(event.target.value as ExploreState['textMode'])} aria-label="匹配方式">
              {TEXT_MODES.map((mode) => (
                <option key={mode} value={mode}>{TEXT_MODE_LABELS[mode]}</option>
              ))}
            </select>
            <select className="select h-[34px] min-w-0 flex-1 sm:max-w-[200px] sm:flex-none" value={sortValue(state.sort)} onChange={(event) => onSortChange(parseSort(event.target.value))} aria-label="排序">
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setDraftColumns(columns);
                setColumnsOpen(true);
              }}
              className="btn h-[34px]"
              aria-label="选择指标列"
            >
              <Columns3 size={13} /> <span className="hidden sm:inline">列</span>
            </button>
          </div>

          <div className="no-scrollbar flex min-h-[22px] flex-nowrap items-center gap-1.5 overflow-x-auto">
            {chips.map((chip) => (
              <span key={chip.id} className={cx('chip', chip.disabled && 'opacity-60')} title={chip.reason}>
                {chip.label}
                {chip.removable && (
                  <button type="button" onClick={() => onRemoveChip(chip.id)} className="text-[var(--text-faint)] hover:text-[var(--signal)]" aria-label={`移除条件 ${chip.label}`}>
                    <X size={10} />
                  </button>
                )}
              </span>
            ))}
            {chips.length === 0 && <span className="shrink-0 whitespace-nowrap text-[10px] text-[var(--text-faint)]">未设置筛选；从左侧筛选栏开始，或直接搜索。</span>}
            <span className="ml-auto hidden shrink-0 items-center gap-3 sm:flex">
              {aggregates.filter((aggregate) => aggregate.value !== null).slice(0, 3).map((aggregate) => (
                <span key={`${aggregate.metric}-${aggregate.op}`} className="whitespace-nowrap font-mono-tabular text-[10px] text-[var(--text-muted)]">
                  {aggregate.op === 'sum' ? 'Σ' : '#'} {columnLabel(aggregate.metric)} {n(aggregate.value)}
                </span>
              ))}
            </span>
          </div>
        </div>
      </PageHeader>

      <Modal
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        eyebrow="Roster columns"
        title="选择指标列"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setDraftColumns(columns)}>重置为本页</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onColumnsChange(draftColumns);
                setColumnsOpen(false);
              }}
            >
              应用列
            </button>
          </>
        }
      >
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          只列出该实体类别实际存在（可非空）的指标。首列锚（{anchor ? columnLabel(anchor) : 'CET 等级'}）固定保留。
        </p>
        <ul className="mt-2 divide-y divide-[var(--border-hairline)] border border-[var(--border-subtle)]">
          {ALLOWED_COLUMNS[state.kind].map((metric) => {
            const isAnchor = metric === anchor;
            const checked = isAnchor || draftColumns.includes(metric);
            return (
              <li key={metric} className="flex items-center gap-2 px-2 py-2">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isAnchor}
                  onChange={() =>
                    setDraftColumns((previous) => (previous.includes(metric) ? previous.filter((item) => item !== metric) : [...previous, metric]))
                  }
                />
                <span className="min-w-0 flex-1 truncate text-[12px]">{columnLabel(metric)}</span>
                <span className="font-mono-tabular text-[9px] text-[var(--text-faint)]">{METRICS[metric]?.provenance === 'derived' ? 'CALC' : 'OFFICIAL'}</span>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}

