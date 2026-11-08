/**
 * Data Studio: source integrity, diagnostics, cross-source alignment, custom source replacement,
 * the orphan-target audit and user-data backup/restore.
 *
 * Source replacement is validated by the worker before it is committed; a rejected file leaves the
 * previous index in service. A successful replacement is persisted in `customSources` and applied
 * again on the next visit.
 */
import { useEffect, useMemo, useState } from 'react';
import { Database, Download, RefreshCw, Upload } from 'lucide-react';
import {
  SOURCE_INFO,
  SOURCE_IDS,
  type AlignmentReport,
  type EntityRef,
  type InsightsReport,
  type SourceDiagnostic,
  type SourceId,
} from '../../../v2/index.ts';
import { useEngine } from '../../providers/EngineProvider.tsx';
import { useLearning } from '../../providers/LearningProvider.tsx';
import { useRoute } from '../../providers/RouteProvider.tsx';
import { useAsync } from '../../detail/useAsync.ts';
import { useCollections } from '../../collections/useCollections.ts';
import { exportBackup, importBackup, parseBackup, serializeBackup } from '../../../v2/store/backup.ts';
import { ErrorPanel, LoadingPanel, Note, PageHeader, Panel, SectionLabel, Stat, cx } from '../../ui/index.tsx';
import { n } from '../../ui/format.ts';

const NOMINAL: Record<SourceId, { records: string; secondary: string }> = {
  coca2020: { records: '60,000 条记录上限', secondary: '词头 + 词性' },
  bnc25k: { records: '76,126 个成员槽', secondary: '25,002 个词族' },
  cet2016: { records: '5,377 个词目', secondary: '8,107 条拼写链接' },
};

const SECTIONS = ['来源与诊断', '三源对齐', '自定义数据源', '用户数据'] as const;
type Section = (typeof SECTIONS)[number];

export function DataStudioWorkspace() {
  const { client, status, ready, retry } = useEngine();
  const learning = useLearning();
  const collections = useCollections(learning.db, learning.version);
  const { navigate } = useRoute();
  const [section, setSection] = useState<Section>('来源与诊断');
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [customSource, setCustomSource] = useState<SourceId>('coca2020');
  const [codeFilter, setCodeFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const report = useAsync(() => (status === 'ready' ? client.insights() : Promise.resolve(null)), 'data-insights', [client, status, refreshing]);
  const alignment = useAsync(() => (status === 'ready' ? client.alignment() : Promise.resolve(null)), 'data-alignment', [client, status, refreshing]);
  const orphans = useAsync(async () => {
    if (status !== 'ready' || learning.records.length === 0) return [];
    const rows = await client.resolveTargets(learning.records.map((record) => record.target));
    return rows.filter((row) => row.entityRef === null);
  }, 'orphans', [client, status, learning.syncedVersion, refreshing]);

  const diagnostics = ready?.diagnostics ?? [];
  const filteredDiagnostics = useMemo(() => {
    const needle = codeFilter.trim().toLowerCase();
    return diagnostics.filter((diagnostic) => !needle || diagnostic.code.toLowerCase().includes(needle) || diagnostic.source.includes(needle));
  }, [diagnostics, codeFilter]);

  const applyCustomSource = async (sourceId: SourceId, file: File): Promise<void> => {
    if (!learning.db) {
      setMessage('本地数据库不可用，无法保存自定义源');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const text = await file.text();
      const result = await client.setCustomSource(sourceId, text);
      await learning.db.customSources.put({ sourceId, content: text, updatedAt: new Date().toISOString() });
      setRefreshing((value) => !value);
      setMessage(`已替换 ${sourceId} 并重建索引（${Math.round(result.buildMs)} ms）。旧数据仍保存在来源文件中。`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const exportUserData = async (): Promise<void> => {
    if (!learning.db) return;
    const payload = await exportBackup(learning.db);
    const blob = new Blob([serializeBackup(payload)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lexical-workbench-backup-${payload.exportedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`已导出 ${payload.records.length} 条记录、${payload.events.length} 条事件、${payload.collections.length} 个词集`);
  };

  const importUserData = async (file: File): Promise<void> => {
    if (!learning.db) return;
    if (!window.confirm('导入会替换本机全部学习记录、事件和词集。确定继续？')) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = parseBackup(await file.text());
      const counts = await importBackup(learning.db, payload);
      await learning.store?.load();
      setMessage(`已导入：${counts.records} 条记录、${counts.events} 条事件、${counts.collections} 个词集。`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="06 / Data Studio · Sources & user data"
        title="数据中心"
        description="来源文件、解析诊断、对齐报告、自定义源替换与本地数据备份。所有数字都能追溯到具体来源。"
        actions={
          <>
            <button type="button" className="btn" onClick={() => setRefreshing((value) => !value)}><RefreshCw size={13} /> 刷新报告</button>
            <button type="button" className="btn" onClick={retry} title="用当前来源文件重新构建 Worker 索引"><Database size={13} /> 重建索引</button>
          </>
        }
      />

      <div className="no-scrollbar flex gap-5 overflow-x-auto border-b border-[var(--border-subtle)] px-4 lg:px-6">
        {SECTIONS.map((item) => (
          <button key={item} type="button" onClick={() => setSection(item)} className={cx('tab', section === item && 'tab-active')}>{item}</button>
        ))}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-4 lg:p-5">
          {message && <p className="border-l-2 border-[var(--seal)] bg-[var(--seal)]/5 px-3 py-2 text-[11px] leading-relaxed text-[var(--seal)]">{message}</p>}

          {section === '来源与诊断' && (
            <>
              <div className="grid gap-3 lg:grid-cols-3">
                {SOURCE_IDS.map((sourceId) => (
                  <SourceCard
                    key={sourceId}
                    sourceId={sourceId}
                    units={report.data?.units ?? null}
                    diagnostics={diagnostics.filter((diagnostic) => diagnostic.source === sourceId)}
                    loading={report.loading}
                  />
                ))}
              </div>

              <Panel className="p-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <SectionLabel right={`${filteredDiagnostics.length} / ${diagnostics.length}`}>解析诊断</SectionLabel>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">诊断是来源事实的完整记录；错误条目被跳过，不会用估算值修补。</p>
                  </div>
                  <input className="input max-w-[220px]" value={codeFilter} onChange={(event) => setCodeFilter(event.target.value)} placeholder="按 code 过滤…" aria-label="诊断过滤" />
                </div>
                <DiagnosticTable diagnostics={filteredDiagnostics} />
              </Panel>
            </>
          )}

          {section === '三源对齐' && (
            <>
              {alignment.loading && !alignment.data && <LoadingPanel label="计算对齐报告…" />}
              {alignment.error && <ErrorPanel message={alignment.error} />}
              {alignment.data && <AlignmentPanel report={alignment.data} onOpen={(query) => navigate({ workspace: 'explore', query })} onOpenRef={(ref) => navigate({ workspace: 'data', ref })} />}
            </>
          )}

          {section === '自定义数据源' && (
            <>
              <Panel className="p-3">
                <SectionLabel right="先校验，再替换">替换来源文件</SectionLabel>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="min-w-[180px]">
                    <span className="eyebrow">来源</span>
                    <select className="select mt-1 w-full" value={customSource} onChange={(event) => setCustomSource(event.target.value as SourceId)}>
                      {SOURCE_IDS.map((sourceId) => <option key={sourceId} value={sourceId}>{SOURCE_INFO[sourceId].title}</option>)}
                    </select>
                  </label>
                  <label className="btn cursor-pointer">
                    <Upload size={13} /> 选择文件并替换
                    <input
                      type="file"
                      accept={customSource === 'coca2020' ? '.json,application/json' : '.txt,text/plain'}
                      className="hidden"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (file) void applyCustomSource(customSource, file);
                      }}
                    />
                  </label>
                  {busy && <span className="text-[11px] text-[var(--text-muted)]">正在校验并重建…</span>}
                </div>
                <Note>
                  适配器会先解析文件，只有在零错误地构建出新索引后才提交替换。失败时当前索引继续服务；替换文本会保存到本机，下次访问时重新应用。
                </Note>
              </Panel>

              <Panel className="p-3">
                <SectionLabel>已保存的自定义源</SectionLabel>
                <CustomSourceList db={learning.db} version={learning.version} refreshKey={refreshing ? 1 : 0} />
              </Panel>

              <Panel className="p-3">
                <SectionLabel right={`${orphans.data?.length ?? 0} 个`}>孤立学习目标</SectionLabel>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">来源替换后，曾经存在的拼写可能不再出现在索引中。记录会保留，并在词集里显示为孤立目标。</p>
                {orphans.loading && <LoadingPanel />}
                {orphans.data && orphans.data.length === 0 && <p className="mt-2 text-[11px] text-[var(--seal)]">没有孤立目标。</p>}
                {orphans.data && orphans.data.length > 0 && (
                  <ul className="mt-2 divide-y divide-[var(--border-hairline)] border border-[var(--border-subtle)]">
                    {orphans.data.slice(0, 100).map((row) => (
                      <li key={row.target} className="flex items-center gap-2 px-2 py-1.5">
                        <span className="min-w-0 flex-1 truncate font-display text-[14px]">{row.label}</span>
                        <span className="font-mono-tabular text-[9px] text-[var(--text-faint)]">{row.target}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{row.studyCount} 次学习</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}

          {section === '用户数据' && (
            <div className="grid gap-3 xl:grid-cols-2">
              <Panel className="p-3">
                <SectionLabel right="JSON · version 2">导出学习数据</SectionLabel>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">包含学习记录、事件日志和词集；不包含来源文件本身。</p>
                <button type="button" className="btn btn-primary mt-2" disabled={!learning.db} onClick={() => void exportUserData()}>
                  <Download size={13} /> 导出 JSON 备份
                </button>
              </Panel>

              <Panel className="p-3">
                <SectionLabel right="替换模式">导入学习数据</SectionLabel>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">导入会清空并替换本机全部学习记录、事件和词集；来源文件不受影响。</p>
                <label className={cx('btn mt-2 cursor-pointer', busy && 'opacity-50')}>
                  <Upload size={13} /> 选择备份 JSON
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    disabled={busy || !learning.db}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void importUserData(file);
                    }}
                  />
                </label>
              </Panel>

              <Panel className="p-3 xl:col-span-2">
                <SectionLabel>当前本机状态</SectionLabel>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="学习记录" value={n(learning.records.length)} sub={learning.status} />
                  <Stat label="词集" value={n(collections.items.length)} sub="由 Study 维护" />
                  <Stat label="索引来源" value={String(ready?.sources.length ?? 0)} sub={`构建 ${ready ? Math.round(ready.buildMs) : '—'} ms`} />
                  <Stat label="诊断" value={n(diagnostics.length)} sub={`${diagnostics.filter((d) => d.severity === 'error').length} 个错误`} />
                </div>
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceCard({ sourceId, units, diagnostics, loading }: { sourceId: SourceId; units: InsightsReport['units'] | null; diagnostics: SourceDiagnostic[]; loading: boolean }) {
  const info = SOURCE_INFO[sourceId];
  const count = units
    ? sourceId === 'coca2020'
      ? units.cocaHeadwords
      : sourceId === 'bnc25k'
        ? units.bncFamilies
        : units.cetEntries
    : null;
  const secondary = units
    ? sourceId === 'coca2020'
      ? `${n(units.cocaRecords)} 条词性记录`
      : sourceId === 'bnc25k'
        ? `${n(units.bncMembers)} 个成员槽`
        : `${n(units.cetLinks)} 条拼写链接`
    : '—';
  return (
    <Panel className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow">{sourceId}</p>
          <p className="mt-1 font-display text-[16px] font-semibold leading-tight">{info.title}</p>
        </div>
        <span className="chip shrink-0">{info.edition}</span>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">{info.unit}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border-hairline)] pt-2">
        <Stat label="有效单位" value={loading ? '…' : n(count)} sub={secondary} />
        <Stat label="诊断" value={n(diagnostics.length)} sub={`${diagnostics.filter((d) => d.severity === 'error').length} 错误`} tone={diagnostics.some((d) => d.severity === 'error') ? 'signal' : undefined} />
      </div>
      <p className="mt-2 font-mono-tabular text-[9px] text-[var(--text-faint)]">{NOMINAL[sourceId].records} · 文件 {info.file}</p>
    </Panel>
  );
}

function DiagnosticTable({ diagnostics }: { diagnostics: SourceDiagnostic[] }) {
  if (diagnostics.length === 0) return <p className="mt-2 text-[11px] text-[var(--seal)]">没有诊断记录。</p>;
  return (
    <div className="scroll-thin mt-2 max-h-[320px] overflow-auto border border-[var(--border-subtle)]">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead><tr className="roster-head eyebrow"><th className="px-2 py-1.5 font-normal">来源</th><th className="px-2 py-1.5 font-normal">级别</th><th className="px-2 py-1.5 font-normal">code</th><th className="px-2 py-1.5 font-normal">说明</th><th className="px-2 py-1.5 font-normal">对象</th></tr></thead>
        <tbody>
          {diagnostics.slice(0, 300).map((diagnostic, index) => (
            <tr key={`${diagnostic.code}-${index}`} className="border-t border-[var(--border-hairline)]">
              <td className="px-2 py-1 font-mono-tabular text-[9px] text-[var(--text-muted)]">{diagnostic.source}</td>
              <td className="px-2 py-1"><span className={cx('font-mono-tabular text-[9px]', diagnostic.severity === 'error' ? 'text-[var(--signal)]' : diagnostic.severity === 'warning' ? 'text-[var(--st-learning)]' : 'text-[var(--text-muted)]')}>{diagnostic.severity}</span></td>
              <td className="px-2 py-1 font-mono-tabular text-[9px]">{diagnostic.code}</td>
              <td className="px-2 py-1 text-[10px] text-[var(--text-secondary)]">{diagnostic.message}</td>
              <td className="max-w-[180px] truncate px-2 py-1 font-mono-tabular text-[9px] text-[var(--text-faint)]">{diagnostic.subject ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlignmentPanel({ report, onOpen, onOpenRef }: { report: AlignmentReport; onOpen: (query: import('../../../v2/index.ts').LexQuery) => void; onOpenRef: (ref: EntityRef) => void }) {
  const regions = [
    ['coca_bnc_cet', '三源都有'], ['coca_bnc', 'COCA ∩ BNC'], ['coca_cet', 'COCA ∩ CET'], ['bnc_cet', 'BNC ∩ CET'],
    ['coca_only', '仅 COCA'], ['bnc_only', '仅 BNC'], ['cet_only', '仅 CET'],
  ] as const;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel className="p-3">
          <SectionLabel right={`${n(report.formCount)} 个词形`}>集合分区</SectionLabel>
          <div className="mt-2 space-y-1">
            {regions.map(([region, label]) => (
              <button key={region} type="button" onClick={() => onOpen(regionQuery(region))} className="flex w-full items-baseline justify-between border-b border-[var(--border-hairline)] px-1 py-1.5 text-left hover:bg-[var(--bg-hover)]">
                <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
                <span className="font-mono-tabular text-[12px]">{n(report.venn[region])}</span>
              </button>
            ))}
          </div>
          <Note>集合以词形为单位，大小写折叠只用于匹配；不把不同词形合并为一个词义。</Note>
        </Panel>

        <Panel className="p-3">
          <SectionLabel>拼写例外</SectionLabel>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat label="大小写折叠匹配" value={n(report.caseFoldedMatches.length)} sub="印刷形式 ≠ 词形键" />
            <Stat label="候选变体对" value={n(report.candidates.diacriticPairs.length + report.candidates.hyphenPairs)} sub="变音符 / 连字符" />
            <Stat label="COCA 未入 BNC" value={n(report.coca.headwordsWithoutBncForm)} sub="词头级" />
            <Stat label="CET 仅存词形" value={n(report.venn.cet_only)} sub="不在 COCA/BNC" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {report.caseFoldedMatches.slice(0, 12).map((match) => (
              <button key={match.form} type="button" onClick={() => onOpenRef(`f:${match.form}`)} className="chip !px-1 !py-0 text-[9px] hover:border-[var(--signal)]">
                {match.printed.join('/')}
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel className="p-3">
          <SectionLabel right={`${report.candidates.diacriticPairs.length} 对`}>变音符候选</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-1">
            {report.candidates.diacriticPairs.slice(0, 40).map((pair) => (
              <span key={`${pair.a}-${pair.b}`} className="chip !px-1.5 !py-0.5 font-mono-tabular text-[9px]">{pair.a} / {pair.b}</span>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-[var(--text-muted)]">候选关系不参与统计，也不自动合并。</p>
        </Panel>
        <Panel className="p-3">
          <SectionLabel right={`${report.candidates.hyphenPairs} 对`}>连字符候选</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-1">
            {report.candidates.hyphenPairSamples.slice(0, 20).map((pair) => (
              <span key={`${pair.hyphenated}-${pair.joined}`} className="chip !px-1.5 !py-0.5 font-mono-tabular text-[9px]">{pair.hyphenated} / {pair.joined}</span>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="p-3">
        <SectionLabel>COCA 未匹配拼写类别</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(report.coca.unmatchedBySpellingClass).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
            <span key={label} className="chip !px-2 !py-1 text-[10px]">{label} <span className="font-mono-tabular">{n(count)}</span></span>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function CustomSourceList({ db, version, refreshKey }: { db: ReturnType<typeof useLearning>['db']; version: number; refreshKey: number }) {
  const [rows, setRows] = useState<{ sourceId: SourceId; updatedAt: string; content: string }[]>([]);
  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    void db.customSources.toArray().then((items) => {
      if (!cancelled) setRows(items.map((item) => ({ sourceId: item.sourceId, updatedAt: item.updatedAt, content: item.content })));
    });
    return () => { cancelled = true; };
  }, [db, version, refreshKey]);
  if (rows.length === 0) return <p className="mt-2 text-[11px] text-[var(--text-muted)]">没有自定义源，正在使用随应用发布的三个文件。</p>;
  return (
    <ul className="mt-2 divide-y divide-[var(--border-hairline)] border border-[var(--border-subtle)]">
      {rows.map((row) => (
        <li key={row.sourceId} className="flex items-center gap-2 px-2 py-1.5">
          <span className="font-mono-tabular text-[10px] text-[var(--text-secondary)]">{row.sourceId}</span>
          <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-muted)]">{row.content.slice(0, 80)}</span>
          <span className="font-mono-tabular text-[9px] text-[var(--text-faint)]">{row.updatedAt.slice(0, 10)}</span>
        </li>
      ))}
    </ul>
  );
}

function regionQuery(region: keyof AlignmentReport['venn']): import('../../../v2/index.ts').LexQuery {
  const filters: NonNullable<import('../../../v2/index.ts').LexQuery['filters']> = [];
  const sources = [
    ['coca2020', region.includes('coca')],
    ['bnc25k', region.includes('bnc')],
    ['cet2016', region.includes('cet')],
  ] as const;
  for (const [source, present] of sources) filters.push({ type: 'source_presence', source, present });
  return { kind: 'form', filters };
}
