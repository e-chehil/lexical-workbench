/**
 * Study workspace: collections, a target queue, the explainable planner and CSV/JSON export.
 *
 * Static collections store explicit targets; dynamic collections store a query and are re-evaluated
 * on every read. A plan is a preview until the user explicitly saves it as a collection.
 */
import { useEffect, useState } from 'react';
import { Download, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import {
  metricDisplayLabel,
  type Collection,
  type EntityRef,
  type EntityRowDTO,
  type LearningStatus,
  type MetricCell,
  type MetricId,
  type PlanItem,
  type PlanRequest,
  type StrategyId,
  type TargetRef,
  type TargetRowDTO,
} from '../../../v2/index.ts';
import { useEngine } from '../../providers/EngineProvider.tsx';
import { useLearning } from '../../providers/LearningProvider.tsx';
import { CollectionDialog } from '../../collections/CollectionDialog.tsx';
import { useCollections } from '../../collections/useCollections.ts';
import { useRoute } from '../../providers/RouteProvider.tsx';
import { useAsync } from '../../detail/useAsync.ts';
import { StatusControl } from '../../components/StatusControl.tsx';
import { buildCsv } from '../../../v2/util/csv.ts';
import { EmptyState, ErrorPanel, LoadingPanel, Note, PageHeader, Spinner, cx } from '../../ui/index.tsx';
import { dateTime, n } from '../../ui/format.ts';
import { targetsForRows } from '../explore/selection.ts';

const STRATEGIES: { id: StrategyId; label: string; detail: string }[] = [
  { id: 'coca_high_freq', label: 'COCA 高频缺口', detail: '按官方词性排名，排除已掌握/暂缓。' },
  { id: 'bnc_family_completion', label: '补全词族', detail: '已有成员掌握的词族，按频段与成员频次补剩余成员。' },
  { id: 'cet_syllabus', label: 'CET 大纲顺序', detail: 'CET4 先于 CET6，主词条先于派生词。' },
  { id: 'custom_mix', label: '混合计划', detail: '三个策略加权轮转，目标去重。' },
];

const SCOPES: { id: string; label: string; scope?: PlanRequest['scope'] }[] = [
  { id: 'none', label: '全库（无范围）' },
  { id: 'coca5000', label: 'COCA 官方排名 ≤ 5000', scope: { kind: 'coca_lemma_pos', filters: [{ type: 'metric_range', metric: 'coca2020.lp_rank', max: 5000 }] } },
  { id: 'cet4', label: 'CET4 词目', scope: { kind: 'cet_entry', filters: [{ type: 'cet_level', levels: ['CET4'] }] } },
  { id: 'band1to3', label: 'BNC 频段 1k–3k', scope: { kind: 'bnc_family', filters: [{ type: 'metric_range', metric: 'bnc25k.family_band', min: 1, max: 3 }] } },
];

const QUEUE_COLUMNS = ['coca2020.hw_rank', 'coca2020.lp_rank', 'bnc25k.member_freq', 'bnc25k.family_band'] as const;

interface ExportMetric {
  metric: MetricId;
  label: string;
  value: number | null;
}

interface ExportRecord {
  target: TargetRef;
  label: string;
  status: string;
  tags: string[];
  note: string;
  studyCount: number;
  lastStudiedAt: string | null;
  metrics: ExportMetric[];
}

function exportMetrics(cells: readonly MetricCell[]): ExportMetric[] {
  return QUEUE_COLUMNS.map((metric) => ({
    metric,
    label: metricDisplayLabel(metric),
    value: cells.find((cell) => cell.metric === metric)?.value ?? null,
  }));
}

function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFileName(name: string): string {
  return name.replace(/[\/:*?"<>|]/g, '_').trim() || 'study-queue';
}

export function StudyWorkspace() {
  const { client, status } = useEngine();
  const learning = useLearning();
  const { navigate } = useRoute();
  const collections = useCollections(learning.db, learning.version);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [strategy, setStrategy] = useState<StrategyId>('coca_high_freq');
  const [size, setSize] = useState(20);
  const [scopeId, setScopeId] = useState('none');
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planTargets, setPlanTargets] = useState<TargetRef[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId && collections.items.some((item) => item.id === selectedId)) return;
    setSelectedId(collections.items[0]?.id ?? null);
  }, [collections.items, selectedId]);

  const selected = collections.items.find((item) => item.id === selectedId) ?? null;
  const scope = SCOPES.find((item) => item.id === scopeId)?.scope;

  const queue = useAsync(async () => {
    if (!selected || status !== 'ready') return null;
    if (selected.kind === 'static') {
      return { kind: 'static' as const, targets: await client.resolveTargets(selected.targets, [...QUEUE_COLUMNS]) };
    }
    const page = await client.rows({ query: { ...selected.query, page: { offset: 0, limit: 300 } }, columns: [...QUEUE_COLUMNS] });
    return { kind: 'dynamic' as const, rows: page.rows, total: page.total };
  }, selected ? `${selected.id}:${selected.updatedAt}` : 'none', [client, status, selected?.id, selected?.updatedAt, learning.syncedVersion]);

  const planLabels = useAsync(
    () => (plan && plan.length > 0 ? client.resolveTargets(plan.map((item) => item.target)) : Promise.resolve([])),
    plan ? plan.map((item) => item.target).join('|') : 'none',
    [client, plan]
  );

  const runPlan = async (): Promise<void> => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const items = await client.plan({ strategy, size, scope, excludeStatuses: ['mastered', 'deferred'] });
      setPlan(items);
      setPlanTargets(items.map((item) => item.target));
    } catch (cause) {
      setPlanError(cause instanceof Error ? cause.message : String(cause));
      setPlan(null);
    } finally {
      setPlanLoading(false);
    }
  };

  const writeStatus = async (target: TargetRef, learningStatus: LearningStatus): Promise<void> => {
    if (!learning.store) return;
    try {
      await learning.store.apply([target], { status: learningStatus }, { sourceLabel: 'Study queue' });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const study = async (target: TargetRef): Promise<void> => {
    if (!learning.store) return;
    try {
      await learning.store.apply([target], { studied: true }, { sourceLabel: 'Study queue' });
      setMessage('已记录一次学习');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const loadExportRecords = async (): Promise<{ records: ExportRecord[]; skipped: number }> => {
    if (!selected || !queue.data) return { records: [], skipped: 0 };
    const records: ExportRecord[] = [];
    let skipped = 0;

    if (queue.data.kind === 'static') {
      for (const row of queue.data.targets) {
        records.push({
          target: row.target,
          label: row.label,
          status: row.status.status,
          tags: [...row.tags],
          note: row.note,
          studyCount: row.studyCount,
          lastStudiedAt: row.lastStudiedAt,
          metrics: exportMetrics(row.metrics),
        });
      }
    } else {
      if (selected.kind !== 'dynamic') return { records: [], skipped: 0 };
      // The visible queue is capped at 300 rows for interaction. Export must not silently
      // export that window: ask the engine for the full dynamic result.
      const fullQuery = { ...selected.query };
      delete fullQuery.page;
      delete fullQuery.aggregates;
      const full = await client.rows({ query: fullQuery, columns: [...QUEUE_COLUMNS] });
      for (const row of full.rows) {
        const target = targetsForRows([row]).targets[0];
        if (!target) {
          skipped++;
          continue;
        }
        records.push({
          target,
          label: row.label,
          status: row.status?.status ?? 'unrated',
          tags: [],
          note: '',
          studyCount: 0,
          lastStudiedAt: null,
          metrics: exportMetrics(row.metrics),
        });
      }
    }
    return { records, skipped };
  };

  const exportCollection = async (): Promise<void> => {
    if (!selected || !queue.data) return;
    setExporting(true);
    setMessage(null);
    try {
      const { records, skipped } = await loadExportRecords();
      if (records.length === 0) {
        setMessage('没有可导出的学习目标（聚合行不会写入 CSV）');
        return;
      }
      const header = [
        'target',
        'label',
        'status',
        'tags',
        'note',
        'studyCount',
        'lastStudiedAt',
        ...QUEUE_COLUMNS.map((metric) => metricDisplayLabel(metric)),
      ];
      const rows = records.map((record) => [
        record.target,
        record.label,
        record.status,
        record.tags.join('; '),
        record.note,
        record.studyCount,
        record.lastStudiedAt,
        ...record.metrics.map((metric) => metric.value),
      ]);
      downloadText(`${safeFileName(selected.name)}.csv`, buildCsv(header, rows), 'text/csv;charset=utf-8');
      setMessage(`已导出 ${records.length} 行 CSV${skipped > 0 ? `（跳过 ${skipped} 个无单一目标的聚合行）` : ''}`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setExporting(false);
    }
  };

  const exportJson = async (): Promise<void> => {
    if (!selected || !queue.data) return;
    setExporting(true);
    setMessage(null);
    try {
      const { records, skipped } = await loadExportRecords();
      if (records.length === 0) {
        setMessage('没有可导出的学习目标（聚合行不会写入 JSON）');
        return;
      }
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        collection: { name: selected.name, kind: selected.kind },
        columns: QUEUE_COLUMNS.map((metric) => ({ metric, label: metricDisplayLabel(metric) })),
        records,
      };
      downloadText(`${safeFileName(selected.name)}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
      setMessage(`已导出 ${records.length} 条 JSON${skipped > 0 ? `（跳过 ${skipped} 个无单一目标的聚合行）` : ''}`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setExporting(false);
    }
  };

  const addPlanToSelected = async (): Promise<void> => {
    if (!selected || selected.kind !== 'static' || planTargets.length === 0) return;
    setBusy(true);
    try {
      await collections.addTargets(selected.id, planTargets);
      setMessage(`已加入 ${planTargets.length} 个目标到「${selected.name}」`);
      setPlanTargets([]);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const deleteCollection = async (collection: Collection): Promise<void> => {
    if (!window.confirm(`删除词集「${collection.name}」？学习记录不会被删除。`)) return;
    try {
      await collections.remove(collection.id);
      setSelectedId(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="04 / Study · Targets & plans"
        title="学习工作台"
        description="词集保存你要学的目标；规划器从数据中提出下一批候选，每条都附带来源理由。写入学习库后立即同步到所有查询。"
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCreateOpen(true)}><Plus size={13} /> 新建词集</button>
            <button type="button" className="btn" onClick={() => void exportCollection()} disabled={!queue.data || exporting}><Download size={13} /> {exporting ? '导出中…' : '导出 CSV'}</button>
            <button type="button" className="btn" onClick={() => void exportJson()} disabled={!queue.data || exporting}><Download size={13} /> 导出 JSON</button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
        <aside className="flex w-full shrink-0 flex-col border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] xl:w-[260px] xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2.5">
            <p className="eyebrow">Collections · {collections.items.length}</p>
            <button type="button" className="btn btn-ghost px-1 py-0.5" onClick={() => setCreateOpen(true)} aria-label="新建词集"><Plus size={13} /></button>
          </div>
          <div className="scroll-thin max-h-[220px] min-h-0 flex-1 overflow-y-auto xl:max-h-none">
            {collections.items.map((collection) => (
              <div key={collection.id} className={cx('flex items-center gap-1 border-b border-[var(--border-hairline)] px-2 py-1.5', selectedId === collection.id && 'bg-[var(--signal-soft)]')}>
                <button type="button" onClick={() => setSelectedId(collection.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[12px] text-[var(--text-primary)]">{collection.name}</span>
                  <span className="font-mono-tabular text-[9px] text-[var(--text-muted)]">
                    {collection.kind === 'static' ? `${collection.targets.length} 个目标` : `动态 · ${collection.query.kind}`}
                  </span>
                </button>
                <button type="button" onClick={() => void deleteCollection(collection)} className="p-1 text-[var(--text-faint)] hover:text-[var(--signal)]" aria-label={`删除 ${collection.name}`}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {collections.items.length === 0 && <p className="px-3 py-6 text-[11px] leading-relaxed text-[var(--text-muted)]">还没有词集。用规划器生成一批，或从 Explore 批量加入。</p>}
          </div>
          <div className="border-t border-[var(--border-subtle)] p-2">
            <Note>静态词集保存目标；动态词集保存查询。学习状态变化不会改写词集本身。</Note>
          </div>
        </aside>

        <section className="flex min-h-[280px] min-w-0 flex-1 flex-col xl:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-2">
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold">{selected?.name ?? '未选择词集'}</p>
              <p className="text-[10px] text-[var(--text-muted)]">
                {selected
                  ? selected.kind === 'static'
                    ? `静态 · ${selected.targets.length} 个目标 · 更新 ${dateTime(selected.updatedAt)}`
                    : `动态 · ${JSON.stringify(selected.query).slice(0, 90)}`
                  : '从左侧选择，或生成一个计划'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {message && <span className="max-w-[260px] truncate text-[10px] text-[var(--signal)]">{message}</span>}
              {selected && selected.kind === 'static' && planTargets.length > 0 && (
                <button type="button" className="btn" disabled={busy} onClick={() => void addPlanToSelected()}>把计划加入此词集</button>
              )}
            </div>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {!selected && <EmptyState title="还没有打开的词集" detail="用右侧规划器生成候选，或先在 Explore 选择目标加入词集。" />}
            {selected && queue.loading && !queue.data && <LoadingPanel label="读取学习目标…" />}
            {selected && queue.error && <div className="p-4"><ErrorPanel message={queue.error} /></div>}
            {queue.data?.kind === 'static' && <StaticQueue key={selected?.id ?? 'static'} rows={queue.data.targets} onOpen={(ref) => navigate({ workspace: 'study', ref })} onStatus={(target, status) => void writeStatus(target, status)} onStudy={(target) => void study(target)} disabled={!learning.store} />}
            {queue.data?.kind === 'dynamic' && <DynamicQueue rows={queue.data.rows} total={queue.data.total} onOpen={(ref) => navigate({ workspace: 'study', ref })} onStatus={(target, status) => void writeStatus(target, status)} disabled={!learning.store} />}
          </div>
        </section>

        <aside className="flex max-h-[55vh] w-full shrink-0 flex-col border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] xl:max-h-none xl:w-[330px] xl:border-l xl:border-t-0">
          <div className="border-b border-[var(--border-subtle)] px-3 py-2.5">
            <p className="eyebrow">Planner · preview only</p>
            <p className="mt-1 font-display text-[17px] font-semibold">下一批学什么</p>
          </div>
          <div className="space-y-3 p-3">
            <label className="block">
              <span className="eyebrow">策略</span>
              <select className="select mt-1 w-full" value={strategy} onChange={(event) => setStrategy(event.target.value as StrategyId)}>
                {STRATEGIES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <span className="mt-1 block text-[10px] leading-relaxed text-[var(--text-muted)]">{STRATEGIES.find((option) => option.id === strategy)?.detail}</span>
            </label>
            <label className="block">
              <span className="eyebrow">范围</span>
              <select className="select mt-1 w-full" value={scopeId} onChange={(event) => setScopeId(event.target.value)}>
                {SCOPES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="eyebrow">数量</span>
              <input className="input mt-1 font-mono-tabular" inputMode="numeric" value={size} onChange={(event) => setSize(Math.max(1, Math.min(200, Number(event.target.value) || 1)))} />
            </label>
            <button type="button" className="btn btn-primary w-full" disabled={planLoading || status !== 'ready'} onClick={() => void runPlan()}>
              {planLoading ? <Spinner label="规划中…" /> : <><Sparkles size={13} /> 生成预览</>}
            </button>
            <Note>默认排除已掌握与暂缓。每条候选至少有一个来源理由；预览不会写入任何数据。</Note>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto border-t border-[var(--border-subtle)]">
            {planError && <div className="p-3"><ErrorPanel message={planError} /></div>}
            {plan && plan.length === 0 && <p className="p-3 text-[11px] text-[var(--text-muted)]">该策略在范围内没有候选。</p>}
            {plan && plan.length > 0 && (
              <>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
                  <span className="font-mono-tabular text-[10px] text-[var(--text-muted)]">{plan.length} 条候选</span>
                  <button type="button" className="btn btn-ink px-2 py-1 text-[10px]" onClick={() => { setPlanTargets(plan.map((item) => item.target)); setSaveOpen(true); }}>保存为新词集</button>
                </div>
                <ul>
                  {plan.map((item, index) => (
                    <li key={item.target} className="border-b border-[var(--border-hairline)] px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono-tabular text-[9px] text-[var(--text-faint)]">{String(index + 1).padStart(2, '0')}</span>
                        <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold">{planLabels.data?.find((row) => row.target === item.target)?.label ?? item.target}</span>
                        <span className="font-mono-tabular text-[9px] text-[var(--text-faint)]">{item.reasons[0]?.code}</span>
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {item.reasons.slice(0, 3).map((reason) => <li key={`${reason.code}-${reason.text}`} className="text-[10px] leading-relaxed text-[var(--text-muted)]">{reason.text}</li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>
      </div>

      <CollectionDialog open={createOpen} db={learning.db} version={learning.version} targets={[]} onClose={() => setCreateOpen(false)} onDone={(text) => { setMessage(text); void collections.refresh(); }} />
      <CollectionDialog open={saveOpen} db={learning.db} version={learning.version} targets={planTargets} onClose={() => setSaveOpen(false)} onDone={(text) => { setMessage(text); setPlanTargets([]); void collections.refresh(); }} />
    </div>
  );
}

function StaticQueue({ rows, onOpen, onStatus, onStudy, disabled }: { rows: TargetRowDTO[]; onOpen: (ref: EntityRef) => void; onStatus: (target: TargetRef, status: LearningStatus) => void; onStudy: (target: TargetRef) => void; disabled: boolean }) {
  const [visible, setVisible] = useState(300);
  if (rows.length === 0) return <EmptyState title="这个静态词集还没有成员" detail="从 Explore 选择目标加入，或把规划器预览保存为词集。" />;
  const shown = rows.slice(0, visible);
  return (
    <div>
      {rows.length > visible && (
        <p className="border-b border-[var(--border-subtle)] px-3 py-1.5 font-mono-tabular text-[10px] text-[var(--text-muted)]">
          显示前 {visible} / {rows.length} 条
        </p>
      )}
      <ul>
        {shown.map((row) => (
        <li key={row.target} className="roster-row flex items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 truncate font-display text-[15px] font-semibold">{row.label}</span>
              <span className="font-mono-tabular text-[9px] text-[var(--text-faint)]">{row.kind}</span>
              {row.entityRef === null && <span className="chip !px-1 !py-0 text-[9px] text-[var(--signal)]">孤立目标</span>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
              {row.metrics
                .filter((cell) => cell.value !== null && (row.kind === 'form' ? cell.metric !== 'coca2020.lp_rank' : cell.metric !== 'coca2020.hw_rank'))
                .map((cell) => <span key={cell.metric} className="font-mono-tabular">{cell.label} {n(cell.value)}</span>)}
              {row.tags.length > 0 && <span>#{row.tags.join(' #')}</span>}
              {row.studyCount > 0 && <span>学习 {row.studyCount} 次 · {dateTime(row.lastStudiedAt)}</span>}
            </div>
          </div>
          <button type="button" className="btn px-2 py-1 text-[10px]" disabled={disabled} onClick={() => onStudy(row.target)}><Play size={10} /> 学习</button>
          <StatusControl status={row.status} compact disabled={disabled} disabledReason="本地学习库不可用" onSet={(status) => onStatus(row.target, status)} />
          {row.entityRef && <button type="button" className="btn btn-ghost px-1.5 py-1 text-[10px]" onClick={() => onOpen(row.entityRef!)}>详情</button>}
        </li>
      ))}
      </ul>
      {rows.length > visible && (
        <button type="button" className="btn m-3" onClick={() => setVisible((count) => Math.min(rows.length, count + 300))}>
          载入更多（剩余 {rows.length - visible} 条）
        </button>
      )}
    </div>
  );
}

function DynamicQueue({ rows, total, onOpen, onStatus, disabled }: { rows: EntityRowDTO[]; total: number; onOpen: (ref: EntityRef) => void; onStatus: (target: TargetRef, status: LearningStatus) => void; disabled: boolean }) {
  if (rows.length === 0) return <EmptyState title="动态词集当前没有匹配" detail="查询条件可能过窄，或学习状态变化让集合缩小。" />;
  return (
    <div>
      <p className="border-b border-[var(--border-subtle)] px-3 py-1.5 font-mono-tabular text-[10px] text-[var(--text-muted)]">{n(total)} 条匹配 · 显示前 {rows.length} 条</p>
      <ul>
        {rows.map((row) => {
          const target = targetsForRows([row]).targets[0];
          return (
            <li key={row.ref} className="roster-row flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 truncate font-display text-[15px] font-semibold">{row.label}</span>
                  <span className="font-mono-tabular text-[9px] text-[var(--text-faint)]">{row.kind}</span>
                </div>
                <div className="mt-0.5 flex gap-2 text-[10px] text-[var(--text-muted)]">
                  {row.metrics
                .filter((cell) => cell.value !== null && (row.kind === 'form' ? cell.metric !== 'coca2020.lp_rank' : cell.metric !== 'coca2020.hw_rank'))
                .map((cell) => <span key={cell.metric} className="font-mono-tabular">{cell.label} {n(cell.value)}</span>)}
                </div>
              </div>
              {target ? <StatusControl status={row.status} compact disabled={disabled} disabledReason="本地学习库不可用" onSet={(status) => onStatus(target, status)} /> : <span className="text-[10px] italic text-[var(--text-muted)]">聚合</span>}
              <button type="button" className="btn btn-ghost px-1.5 py-1 text-[10px]" onClick={() => onOpen(row.ref)}>详情</button>
            </li>
          );
        })}
      </ul>
      <p className="px-3 py-2 text-[10px] text-[var(--text-muted)]">动态集合的成员由查询实时决定；要固定当前结果，请保存为静态词集。</p>
    </div>
  );
}
