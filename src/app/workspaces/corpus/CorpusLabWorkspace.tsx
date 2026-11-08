/**
 * Corpus Lab — the quantitative view of the three sources.
 *
 * Ranking (records / headwords), distribution (PoS and rank bands), the derived-rank × BNC-band
 * cross table, and the three-source set view. Every table and chart value comes from an engine
 * response; the UI only formats it.
 */
import { useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  COCA_POS_VALUES,
  type AlignmentReport,
  type EntityRef,
  type LexQuery,
} from '../../../v2/index.ts';
import { useEngine } from '../../providers/EngineProvider.tsx';
import { useLearning } from '../../providers/LearningProvider.tsx';
import { useRoute } from '../../providers/RouteProvider.tsx';
import { useCollections } from '../../collections/useCollections.ts';
import { useAsync } from '../../detail/useAsync.ts';
import { ErrorPanel, LoadingPanel, PageHeader, Panel, SectionLabel, Tabs, cx } from '../../ui/index.tsx';
import { n, ratio } from '../../ui/format.ts';

type CorpusTab = 'ranking' | 'distribution' | 'cross' | 'sets';

const POS_LABELS: Record<string, string> = {
  noun: '名词', verb: '动词', adjective: '形容词', adverb: '副词', number: '数词', interjection: '感叹词',
  preposition: '介词', pronoun: '代词', conjunction: '连词', determiner: '限定词', article: '冠词',
  '+infinitive': '不定式', negation: '否定词', existential: '存在词',
};

const RANK_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '1–1,000', min: 1, max: 1000 },
  { label: '1,001–2,000', min: 1001, max: 2000 },
  { label: '2,001–5,000', min: 2001, max: 5000 },
  { label: '5,001–10,000', min: 5001, max: 10000 },
  { label: '10,001–20,000', min: 10001, max: 20000 },
  { label: '20,001–30,000', min: 20001, max: 30000 },
  { label: '30,001–40,000', min: 30001, max: 40000 },
  { label: '40,001–50,000', min: 40001, max: 50000 },
  { label: '50,001–60,000', min: 50001, max: 60000 },
];

export function CorpusLabWorkspace() {
  const { client, status } = useEngine();
  const { navigate } = useRoute();
  const learning = useLearning();
  const [tab, setTab] = useState<CorpusTab>('ranking');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="02 / Corpus Lab · COCA 2020"
        title="语料实验室"
        description="官方排名、词性分布、派生词头排名 × BNC 频段、三源集合。每个数字都保留自己的单位与来源。"
      />
      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="语料实验室视图"
        options={[
          { id: 'ranking', label: '排行', hint: 'RANK' },
          { id: 'distribution', label: '分布', hint: 'DIST' },
          { id: 'cross', label: '交叉', hint: 'CROSS' },
          { id: 'sets', label: '集合', hint: 'SETS' },
        ]}
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {tab === 'ranking' && <RankingTab client={client} status={status} onOpen={(ref) => navigate({ workspace: 'corpus', ref })} onExplore={(query) => navigate({ workspace: 'explore', query })} />}
        {tab === 'distribution' && <DistributionTab client={client} status={status} onExplore={(query) => navigate({ workspace: 'explore', query })} />}
        {tab === 'cross' && <CrossTab client={client} status={status} onExplore={(query) => navigate({ workspace: 'explore', query })} />}
        {tab === 'sets' && <SetsTab client={client} status={status} db={learning.db} version={learning.version} onExplore={(query) => navigate({ workspace: 'explore', query })} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

function RankingTab({
  client,
  status,
  onOpen,
  onExplore,
}: {
  client: ReturnType<typeof useEngine>['client'];
  status: string;
  onOpen: (ref: EntityRef) => void;
  onExplore: (query: LexQuery) => void;
}) {
  const [unit, setUnit] = useState<'record' | 'headword'>('record');
  const query = useMemo<LexQuery>(
    () =>
      unit === 'record'
        ? { kind: 'coca_lemma_pos', sort: [{ by: 'metric', metric: 'coca2020.lp_rank', dir: 'asc' }], page: { offset: 0, limit: 120 } }
        : { kind: 'coca_headword', sort: [{ by: 'metric', metric: 'coca2020.hw_rank', dir: 'asc' }], page: { offset: 0, limit: 120 } },
    [unit]
  );
  const columns = unit === 'record'
    ? (['coca2020.lp_rank', 'coca2020.lp_freq', 'coca2020.lp_share_of_headword'] as const)
    : (['coca2020.hw_rank', 'coca2020.hw_freq_sum', 'coca2020.hw_best_lp_rank', 'coca2020.hw_pos_count'] as const);
  const data = useAsync(
    () => (status === 'ready' ? client.rows({ query, columns: [...columns] }) : Promise.resolve(null)),
    JSON.stringify(query),
    [client, status, unit]
  );

  return (
    <div className="space-y-3 p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <SectionLabel>官方排行</SectionLabel>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            {unit === 'record' ? '按官方 COCA 词性记录排名（1–60,000，排名唯一）。' : '按派生词头综合排名（计算）：词头合计频次降序，并列时用最佳官方排名破同。'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-[var(--border-subtle)]">
            <button type="button" onClick={() => setUnit('record')} className={cx('px-2.5 py-1 text-[11px]', unit === 'record' ? 'bg-[var(--bg-ink)] text-[var(--bg-surface)]' : 'text-[var(--text-muted)]')}>
              按词性条目
            </button>
            <button type="button" onClick={() => setUnit('headword')} className={cx('px-2.5 py-1 text-[11px]', unit === 'headword' ? 'bg-[var(--bg-ink)] text-[var(--bg-surface)]' : 'text-[var(--text-muted)]')}>
              按词头（计算）
            </button>
          </div>
          <button type="button" className="btn" onClick={() => onExplore(query)}>
            在 Explore 查看 <ArrowUpRight size={12} />
          </button>
        </div>
      </div>

      <Panel>
        {data.loading && !data.data && <LoadingPanel />}
        {data.error && <div className="p-3"><ErrorPanel message={data.error} /></div>}
        {data.data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="roster-head eyebrow">
                  <th className="px-3 py-2 font-normal">#</th>
                  <th className="px-3 py-2 font-normal">{unit === 'record' ? '词头 · 词性' : '词头'}</th>
                  {columns.map((metric) => <th key={metric} className="px-3 py-2 text-right font-normal">{metricLabel(metric)}</th>)}
                  <th className="px-3 py-2 text-right font-normal">打开</th>
                </tr>
              </thead>
              <tbody>
                {data.data.rows.map((row, index) => (
                  <tr key={row.ref} className="roster-row hover:bg-[var(--bg-hover)]">
                    <td className="px-3 py-1.5 font-mono-tabular text-[10px] text-[var(--text-faint)]">{index + 1}</td>
                    <td className="px-3 py-1.5">
                      <button type="button" onClick={() => onOpen(row.ref)} className="max-w-[260px] truncate text-left font-display text-[15px] font-semibold hover:text-[var(--signal)]">
                        {row.label}
                      </button>
                    </td>
                    {columns.map((metric) => {
                      const cell = row.metrics.find((entry) => entry.metric === metric);
                      return (
                        <td key={metric} className={cx('px-3 py-1.5 text-right font-mono-tabular text-[11px]', cell?.provenance === 'derived' ? 'voice-computed' : 'text-[var(--text-secondary)]')}>
                          {cell ? formatValue(metric, cell.value) : '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right">
                      <button type="button" onClick={() => onOpen(row.ref)} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--signal)]">详情</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="text-[10px] text-[var(--text-muted)]">默认显示前 120 条；完整结果通过 Explore 查询。</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribution
// ---------------------------------------------------------------------------

function DistributionTab({
  client,
  status,
  onExplore,
}: {
  client: ReturnType<typeof useEngine>['client'];
  status: string;
  onExplore: (query: LexQuery) => void;
}) {
  const data = useAsync(async () => {
    if (status !== 'ready') return null;
    const [posRows, buckets] = await Promise.all([
      Promise.all(
        COCA_POS_VALUES.map((pos) =>
          client.query({
            kind: 'coca_lemma_pos',
            filters: [{ type: 'coca_pos', pos: [pos] }],
            page: { offset: 0, limit: 0 },
            aggregates: [{ metric: 'coca2020.lp_freq', op: 'sum' }],
          })
        )
      ),
      Promise.all(
        RANK_BUCKETS.map((bucket) =>
          client.query({
            kind: 'coca_lemma_pos',
            filters: [{ type: 'metric_range', metric: 'coca2020.lp_rank', min: bucket.min, max: bucket.max }],
            page: { offset: 0, limit: 0 },
            aggregates: [{ metric: 'coca2020.lp_freq', op: 'sum' }],
          })
        )
      ),
    ]);
    const pos = COCA_POS_VALUES.map((label, index) => ({
      label,
      records: posRows[index].total,
      freq: posRows[index].aggregates[0]?.value ?? 0,
    }));
    const bands = RANK_BUCKETS.map((bucket, index) => ({
      ...bucket,
      records: buckets[index].total,
      freq: buckets[index].aggregates[0]?.value ?? 0,
    }));
    return { pos, bands };
  }, 'distribution', [client, status]);

  const top = useAsync(
    () => (status === 'ready' ? client.rows({ query: { kind: 'coca_lemma_pos', sort: [{ by: 'metric', metric: 'coca2020.lp_rank', dir: 'asc' }], page: { offset: 0, limit: 300 } }, columns: ['coca2020.lp_rank', 'coca2020.lp_freq'] }) : Promise.resolve(null)),
    'curve',
    [client, status]
  );

  const totals = useMemo(() => {
    if (!data.data) return null;
    return {
      records: data.data.pos.reduce((sum, row) => sum + row.records, 0),
      freq: data.data.pos.reduce((sum, row) => sum + row.freq, 0),
    };
  }, [data.data]);

  return (
    <div className="space-y-3 p-4 lg:p-5">
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel className="p-3">
          <SectionLabel right="14 个官方词性">词性分布</SectionLabel>
          {data.loading && !data.data && <LoadingPanel />}
          {data.data && totals && (
            <div className="mt-2 space-y-2">
              {data.data.pos.map((row) => {
                const share = totals.records > 0 ? row.records / totals.records : 0;
                return (
                  <button key={row.label} type="button" onClick={() => onExplore({ kind: 'coca_lemma_pos', filters: [{ type: 'coca_pos', pos: [row.label] }] })} className="block w-full text-left">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-[12px]">{POS_LABELS[row.label] ?? row.label}</span>
                      <span className="font-mono-tabular text-[10px] text-[var(--text-muted)]">{n(row.records)} · {ratio(share)}</span>
                    </span>
                    <span className="mt-0.5 block h-1.5 bg-[var(--bg-inset)]">
                      <span className="block h-full bg-[var(--signal)]" style={{ width: `${Math.max(0, share * 100)}%` }} />
                    </span>
                  </button>
                );
              })}
              <p className="pt-1 text-[10px] text-[var(--text-muted)]">占比按记录数（不是频次加权）计算；点击一行在 Explore 打开该词性记录。</p>
            </div>
          )}
        </Panel>

        <Panel className="p-3">
          <SectionLabel right={top.data ? `前 ${n(top.data.rows.length)} 条` : undefined}>排名 × 频次曲线（对数）</SectionLabel>
          {top.data && top.data.rows.length > 1 ? <RankFrequencyChart rows={top.data.rows} /> : <LoadingPanel />}
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">横轴 log10(官方排名)，纵轴 log10(官方频次)。只绘制已取得的前 300 条记录。</p>
        </Panel>
      </div>

      <Panel>
        <div className="flex items-center justify-between px-3 pt-3">
          <SectionLabel>官方排名频段</SectionLabel>
          {totals && <span className="font-mono-tabular text-[10px] text-[var(--text-muted)]">{n(totals.records)} 条 · {n(totals.freq)} 次</span>}
        </div>
        {data.data && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="roster-head eyebrow">
                  <th className="px-3 py-2 font-normal">官方排名</th>
                  <th className="px-3 py-2 text-right font-normal">记录</th>
                  <th className="px-3 py-2 text-right font-normal">频次合计</th>
                  <th className="px-3 py-2 text-right font-normal">记录占比</th>
                </tr>
              </thead>
              <tbody>
                {data.data.bands.map((row) => (
                  <tr key={row.label} className="roster-row">
                    <td className="px-3 py-1.5 font-mono-tabular text-[11px]">{row.label}</td>
                    <td className="px-3 py-1.5 text-right font-mono-tabular text-[11px]">{n(row.records)}</td>
                    <td className="px-3 py-1.5 text-right font-mono-tabular text-[11px]">{n(row.freq)}</td>
                    <td className="px-3 py-1.5 text-right font-mono-tabular text-[11px]">{totals ? ratio(totals.records > 0 ? row.records / totals.records : 0) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function RankFrequencyChart({ rows }: { rows: { metrics: { metric: string; value: number | null }[] }[] }) {
  const points = rows
    .map((row) => ({
      rank: row.metrics.find((cell) => cell.metric === 'coca2020.lp_rank')?.value ?? null,
      freq: row.metrics.find((cell) => cell.metric === 'coca2020.lp_freq')?.value ?? null,
    }))
    .filter((point): point is { rank: number; freq: number } => point.rank !== null && point.freq !== null && point.freq > 0);
  if (points.length < 2) return null;
  const xs = points.map((point) => Math.log10(point.rank));
  const ys = points.map((point) => Math.log10(point.freq));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = 640;
  const height = 220;
  const pad = 24;
  const sx = (value: number) => pad + ((value - minX) / Math.max(1e-9, maxX - minX)) * (width - pad * 2);
  const sy = (value: number) => height - pad - ((value - minY) / Math.max(1e-9, maxY - minY)) * (height - pad * 2);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${sx(Math.log10(point.rank)).toFixed(1)},${sy(Math.log10(point.freq)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-auto w-full" role="img" aria-label="排名与频次对数曲线">
      <g stroke="var(--border-hairline)" strokeWidth="1">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <line key={tick} x1={pad} x2={width - pad} y1={pad + tick * (height - pad * 2)} y2={pad + tick * (height - pad * 2)} />
        ))}
      </g>
      <path d={path} fill="none" stroke="var(--signal)" strokeWidth="1.6" />
      <text x={pad} y={height - 6} className="fill-[var(--text-faint)] font-mono-tabular text-[9px]">rank {points[0].rank}</text>
      <text x={width - pad} y={height - 6} textAnchor="end" className="fill-[var(--text-faint)] font-mono-tabular text-[9px]">rank {points[points.length - 1].rank}</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Cross analysis
// ---------------------------------------------------------------------------

function CrossTab({
  client,
  status,
  onExplore,
}: {
  client: ReturnType<typeof useEngine>['client'];
  status: string;
  onExplore: (query: LexQuery) => void;
}) {
  const data = useAsync(() => (status === 'ready' ? client.alignment() : Promise.resolve(null)), 'alignment', [client, status]);
  const bands = ['none', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25'];

  const openCell = (bucket: string, band: string): void => {
    const [min, max] = bucket.split('-').map(Number);
    const filters: LexQuery['filters'] = [{ type: 'metric_range', metric: 'coca2020.hw_rank', min, max }];
    if (band !== 'none') filters.push({ type: 'metric_range', metric: 'bnc25k.family_band', min: Number(band), max: Number(band) });
    else filters.push({ type: 'metric_present', metric: 'bnc25k.family_band', present: false });
    onExplore({ kind: 'form', filters });
  };

  return (
    <div className="space-y-3 p-4 lg:p-5">
      <div>
        <SectionLabel right="派生词头排名 × BNC 频段">交叉表</SectionLabel>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
          行是用词头合计频次得到的派生排名（计算），列是该拼写所属 BNC 词族的频段。低排名 COCA 词头可以落在 1k 词族中，因为词族频段反映整个词族，而不是单个派生词。
        </p>
      </div>
      {data.loading && <LoadingPanel />}
      {data.error && <ErrorPanel message={data.error} />}
      {data.data && <HeatTable report={data.data} bands={bands} onOpen={openCell} />}
    </div>
  );
}

function HeatTable({ report, bands, onOpen }: { report: AlignmentReport; bands: string[]; onOpen: (bucket: string, band: string) => void }) {
  const rows = report.crosstabHwRankByBncBand;
  const max = Math.max(...rows.flatMap((row) => bands.map((band) => row.byBand[band] ?? 0)), 1);
  return (
    <div className="overflow-x-auto border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <table className="w-full min-w-[780px] border-collapse text-left">
        <thead>
          <tr className="roster-head eyebrow">
            <th className="sticky left-0 bg-[var(--bg-surface)] px-2 py-2 font-normal">词头排名</th>
            <th className="px-2 py-2 text-right font-normal">合计</th>
            {bands.map((band) => <th key={band} className="px-2 py-2 text-center font-normal">{band === 'none' ? '无' : `${band}k`}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.bucket} className="border-t border-[var(--border-hairline)]">
              <td className="sticky left-0 bg-[var(--bg-surface)] px-2 py-1 font-mono-tabular text-[10px]">{row.bucket}</td>
              <td className="px-2 py-1 text-right font-mono-tabular text-[10px] text-[var(--text-secondary)]">{n(row.total)}</td>
              {bands.map((band) => {
                const value = row.byBand[band] ?? 0;
                const intensity = Math.sqrt(value / max);
                return (
                  <td key={band} className="p-0.5 text-center">
                    <button
                      type="button"
                      onClick={() => value > 0 && onOpen(row.bucket, band)}
                      className={cx('h-7 w-full font-mono-tabular text-[10px]', value > 0 ? 'hover:outline hover:outline-[var(--signal)]' : 'text-[var(--text-faint)]')}
                      style={{ background: value > 0 ? `rgba(217,72,15,${0.06 + intensity * 0.55})` : undefined, color: intensity > 0.55 ? '#fff8f3' : 'var(--text-secondary)' }}
                      title={value > 0 ? `${value} 个词头；点击在 Explore 打开` : '0'}
                    >
                      {value > 0 ? n(value) : '·'}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sets
// ---------------------------------------------------------------------------

function VennRegionQuery(region: keyof AlignmentReport['venn']): LexQuery {
  const base: LexQuery = { kind: 'form' };
  const filters: NonNullable<LexQuery['filters']> = [];
  const sources = [
    ['coca2020', region.includes('coca')],
    ['bnc25k', region.includes('bnc')],
    ['cet2016', region.includes('cet')],
  ] as const;
  for (const [source, present] of sources) filters.push({ type: 'source_presence', source, present });
  return { ...base, filters };
}

function SetsTab({
  client,
  status,
  db,
  version,
  onExplore,
}: {
  client: ReturnType<typeof useEngine>['client'];
  status: string;
  db: ReturnType<typeof useLearning>['db'];
  version: number;
  onExplore: (query: LexQuery) => void;
}) {
  const data = useAsync(() => (status === 'ready' ? client.alignment() : Promise.resolve(null)), 'alignment-sets', [client, status]);
  const collections = useCollections(db, version);
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const [comparison, setComparison] = useState<Awaited<ReturnType<typeof client.compare>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCompare = async (): Promise<void> => {
    const a = collections.items.find((item) => item.id === aId);
    const b = collections.items.find((item) => item.id === bId);
    if (!a || !b) return;
    setError(null);
    try {
      const refsOf = (targets: readonly string[]): EntityRef[] => targets.map((target) => (target.startsWith('f:') ? target : `f:${target.slice(3).split('|')[0]}`));
      const aRefs = a.kind === 'static' ? refsOf(a.targets) : (await client.query({ ...a.query, page: { offset: 0, limit: 5000 } })).refs;
      const bRefs = b.kind === 'static' ? refsOf(b.targets) : (await client.query({ ...b.query, page: { offset: 0, limit: 5000 } })).refs;
      setComparison(await client.compare(aRefs, bRefs, 'form'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="space-y-3 p-4 lg:p-5">
      <Panel className="p-3">
        <SectionLabel right="单位：词形 Form">三源重合</SectionLabel>
        {data.loading && <LoadingPanel />}
        {data.error && <ErrorPanel message={data.error} />}
        {data.data && (
          <div className="mt-2 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <Venn report={data.data} onExplore={onExplore} />
            <div className="space-y-1">
              {(
                [
                  ['coca_bnc_cet', '三源都有'],
                  ['coca_bnc', 'COCA ∩ BNC'],
                  ['coca_cet', 'COCA ∩ CET'],
                  ['bnc_cet', 'BNC ∩ CET'],
                  ['coca_only', '仅 COCA'],
                  ['bnc_only', '仅 BNC'],
                  ['cet_only', '仅 CET'],
                ] as const
              ).map(([region, label]) => (
                <button
                  key={region}
                  type="button"
                  onClick={() => onExplore(VennRegionQuery(region))}
                  className="flex w-full items-baseline justify-between border-b border-[var(--border-hairline)] px-1 py-1.5 text-left hover:bg-[var(--bg-hover)]"
                >
                  <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
                  <span className="font-mono-tabular text-[12px]">{n(data.data!.venn[region])}</span>
                </button>
              ))}
              <p className="pt-1 text-[10px] text-[var(--text-muted)]">集合运算只在词形上做；大小写折叠是匹配规则，不是词义合并。</p>
            </div>
          </div>
        )}
      </Panel>

      <Panel className="p-3">
        <SectionLabel right="全部投影到词形">集合比较</SectionLabel>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className="select min-w-[160px]" value={aId} onChange={(event) => setAId(event.target.value)} aria-label="集合 A">
            <option value="">选择集合 A</option>
            {collections.items.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.kind === 'static' ? item.targets.length : '动态'}）</option>)}
          </select>
          <span className="text-[10px] text-[var(--text-muted)]">vs</span>
          <select className="select min-w-[160px]" value={bId} onChange={(event) => setBId(event.target.value)} aria-label="集合 B">
            <option value="">选择集合 B</option>
            {collections.items.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.kind === 'static' ? item.targets.length : '动态'}）</option>)}
          </select>
          <button type="button" className="btn btn-primary" disabled={!aId || !bId || aId === bId} onClick={() => void runCompare()}>
            比较
          </button>
          {collections.items.length === 0 && <span className="text-[10px] text-[var(--text-muted)]">先在 Explore 或 Study 保存一个词集。</span>}
        </div>
        {error && <div className="mt-2"><ErrorPanel message={error} /></div>}
        {comparison && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <CompareCard label="仅 A" count={comparison.onlyA.length} onOpen={() => onExplore({ kind: 'form', filters: [{ type: 'in_refs', refs: comparison.onlyA }] })} />
            <CompareCard label="交集" count={comparison.both.length} onOpen={() => onExplore({ kind: 'form', filters: [{ type: 'in_refs', refs: comparison.both }] })} />
            <CompareCard label="仅 B" count={comparison.onlyB.length} onOpen={() => onExplore({ kind: 'form', filters: [{ type: 'in_refs', refs: comparison.onlyB }] })} />
          </div>
        )}
      </Panel>
    </div>
  );
}

function CompareCard({ label, count, onOpen }: { label: string; count: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-left hover:border-[var(--signal)]">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-2xl">{n(count)}</p>
      <p className="mt-1 text-[10px] text-[var(--text-muted)]">在 Explore 打开 <ArrowUpRight size={9} className="inline" /></p>
    </button>
  );
}

function Venn({ report, onExplore }: { report: AlignmentReport; onExplore: (query: LexQuery) => void }) {
  const region = (key: keyof AlignmentReport['venn']) => report.venn[key];
  return (
    <div className="relative mx-auto w-full max-w-[430px]">
      <svg viewBox="0 0 420 260" className="w-full" role="img" aria-label="三源词形集合维恩图">
        <circle cx="170" cy="105" r="78" fill="var(--signal)" fillOpacity="0.10" stroke="var(--signal)" strokeOpacity="0.5" />
        <circle cx="250" cy="105" r="78" fill="var(--seal)" fillOpacity="0.10" stroke="var(--seal)" strokeOpacity="0.5" />
        <circle cx="210" cy="170" r="78" fill="var(--stamp)" fillOpacity="0.09" stroke="var(--stamp)" strokeOpacity="0.5" />
        <text x="110" y="62" textAnchor="middle" className="fill-[var(--text-muted)] font-mono-tabular text-[9px]">COCA</text>
        <text x="310" y="62" textAnchor="middle" className="fill-[var(--text-muted)] font-mono-tabular text-[9px]">BNC</text>
        <text x="210" y="238" textAnchor="middle" className="fill-[var(--text-muted)] font-mono-tabular text-[9px]">CET</text>
        <text x="156" y="120" textAnchor="middle" className="fill-[var(--text-secondary)] font-mono-tabular text-[10px]">{n(region('coca_only'))}</text>
        <text x="264" y="120" textAnchor="middle" className="fill-[var(--text-secondary)] font-mono-tabular text-[10px]">{n(region('bnc_only'))}</text>
        <text x="210" y="198" textAnchor="middle" className="fill-[var(--text-secondary)] font-mono-tabular text-[10px]">{n(region('cet_only'))}</text>
        <text x="210" y="98" textAnchor="middle" className="fill-[var(--text-primary)] font-mono-tabular text-[11px]">{n(region('coca_bnc_cet'))}</text>
        <text x="196" y="142" textAnchor="middle" className="fill-[var(--text-muted)] font-mono-tabular text-[9px]">{n(region('coca_bnc'))}</text>
        <text x="252" y="165" textAnchor="middle" className="fill-[var(--text-muted)] font-mono-tabular text-[9px]">{n(region('bnc_cet'))}</text>
        <text x="164" y="168" textAnchor="middle" className="fill-[var(--text-muted)] font-mono-tabular text-[9px]">{n(region('coca_cet'))}</text>
      </svg>
      <div className="flex justify-center gap-2">
        <button type="button" className="btn px-2 py-1 text-[10px]" onClick={() => onExplore({ kind: 'form', filters: [{ type: 'source_presence', source: 'coca2020', present: true }] })}>COCA 集合</button>
        <button type="button" className="btn px-2 py-1 text-[10px]" onClick={() => onExplore({ kind: 'form', filters: [{ type: 'source_presence', source: 'bnc25k', present: true }] })}>BNC 集合</button>
        <button type="button" className="btn px-2 py-1 text-[10px]" onClick={() => onExplore({ kind: 'form', filters: [{ type: 'source_presence', source: 'cet2016', present: true }] })}>CET 集合</button>
      </div>
    </div>
  );
}

function metricLabel(metric: string): string {
  switch (metric) {
    case 'coca2020.lp_rank': return '官方排名';
    case 'coca2020.lp_freq': return '频次';
    case 'coca2020.lp_share_of_headword': return '词性占比';
    case 'coca2020.hw_rank': return '词头排名';
    case 'coca2020.hw_freq_sum': return '合计频次';
    case 'coca2020.hw_best_lp_rank': return '最佳排名';
    case 'coca2020.hw_pos_count': return '词性数';
    default: return metric;
  }
}

function formatValue(metric: string, value: number | null): string {
  if (value === null) return '—';
  if (metric.endsWith('rank')) return `#${value.toLocaleString('en-US')}`;
  if (metric.endsWith('share_of_headword')) return `${(value * 100).toFixed(1)}%`;
  return value.toLocaleString('en-US');
}
