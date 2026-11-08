/**
 * Insights workspace: learning-state report with drill-down queries and an event timeline.
 * Every panel cell is a navigation surface; the unit is always stated next to the number.
 */
import { useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  statusQueryFor,
  type EntityKind,
  type InsightBucket,
  type InsightsReport,
  type LearningEvent,
  type LearningStatus,
  type LexQuery,
} from '../../../v2/index.ts';
import { useEngine } from '../../providers/EngineProvider.tsx';
import { useLearning } from '../../providers/LearningProvider.tsx';
import { useRoute } from '../../providers/RouteProvider.tsx';
import { useAsync } from '../../detail/useAsync.ts';
import { ErrorPanel, LoadingPanel, Meter, PageHeader, Panel, SectionLabel, Stat } from '../../ui/index.tsx';
import { dateTime, n, ratio, shortDate } from '../../ui/format.ts';
import { STATUS_LABELS } from '../explore/filterState.ts';

const STATUS_ORDER: LearningStatus[] = ['unrated', 'queued', 'learning', 'mastered', 'deferred'];

export function InsightsWorkspace() {
  const { client, status } = useEngine();
  const { navigate } = useRoute();
  const learning = useLearning();
  const report = useAsync(() => (status === 'ready' ? client.insights() : Promise.resolve(null)), 'insights', [client, status, learning.syncedVersion]);
  const events = useAsync(() => learning.recentEvents(), 'events', [learning.version, learning.status]);

  const open = (query: LexQuery): void => navigate({ workspace: 'explore', query });

  if (report.loading && !report.data) return <div className="flex h-full flex-col"><PageHeader eyebrow="05 / Insights" title="学习洞察" /><LoadingPanel label="汇总学习状态…" /></div>;
  if (report.error) return <div className="p-4"><ErrorPanel message={report.error} /></div>;
  if (!report.data) return <div className="p-4"><LoadingPanel /></div>;

  const data = report.data;
  const masteredForms = data.status.forms.byStatus.mastered;
  const masteredRecords = data.status.cocaRecords.byStatus.mastered;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="05 / Insights · Learning state"
        title="学习洞察"
        description="按单位分开统计：词形、COCA 词头、COCA 词性记录、BNC 词族与 CET 词目。每个数字都能回到它来自的集合。"
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-4 lg:p-5">
          <div className="grid grid-cols-2 gap-3 border-b border-[var(--border-subtle)] pb-3 sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="词形 Form" value={n(data.units.forms)} sub="统一拼写枢纽" />
            <Stat label="已掌握词形" value={n(masteredForms)} tone="seal" sub={ratio(data.units.forms ? masteredForms / data.units.forms : null)} />
            <Stat label="COCA 词头" value={n(data.units.cocaHeadwords)} sub="来源词头" />
            <Stat label="COCA 记录" value={n(data.units.cocaRecords)} tone="seal" sub={`${n(masteredRecords)} 已掌握`} />
            <Stat label="BNC 词族" value={n(data.units.bncFamilies)} sub="官方分组" />
            <Stat label="BNC 成员槽" value={n(data.units.bncMembers)} sub="member slots" />
            <Stat label="CET 词目" value={n(data.units.cetEntries)} sub={`${n(data.units.cetLinks)} 条拼写链接`} />
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <Panel className="p-3">
              <SectionLabel right="点击状态 → Explore">学习状态 × 单位</SectionLabel>
              <div className="mt-2 space-y-3">
                <StatusBlock title="词形 Form" kind="form" data={data.status.forms} onOpen={open} />
                <StatusBlock title="COCA 词头" kind="coca_headword" data={data.status.cocaHeadwords} onOpen={open} />
                <StatusBlock title="COCA 词性记录" kind="coca_lemma_pos" data={data.status.cocaRecords} onOpen={open} />
              </div>
            </Panel>

            <Panel className="p-3">
              <SectionLabel>词族与考纲覆盖</SectionLabel>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <CoverageCard label="词族 · 全部成员掌握" value={data.status.bncFamilies.masteredAll} total={data.status.bncFamilies.total} onOpen={() => open({ kind: 'bnc_family' })} note="聚合单位：词族" />
                <CoverageCard label="词族 · 至少一个成员" value={data.status.bncFamilies.masteredAny} total={data.status.bncFamilies.total} onOpen={() => open({ kind: 'bnc_family' })} note="任一成员已掌握" />
                <CoverageCard label="CET · 全部拼写掌握" value={data.status.cetEntries.full} total={data.status.cetEntries.total} onOpen={() => open({ kind: 'cet_entry' })} note="整条词目" />
                <CoverageCard label="CET · 部分拼写掌握" value={data.status.cetEntries.partial} total={data.status.cetEntries.total} onOpen={() => open({ kind: 'cet_entry' })} note="非全部" />
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
                词族和 CET 词目不是学习目标：它们的覆盖由成员词形聚合而来。点击这里只能打开全集，具体成员在词族页/词目页查看。
              </p>
            </Panel>
          </div>

          <Panel className="p-3">
            <SectionLabel right="官方排名分段 · 记录">COCA 排名推进</SectionLabel>
            <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
              {data.cocaRankBuckets.map((bucket) => <BucketBar key={bucket.id} bucket={bucket} onOpen={() => open(bucket.query)} />)}
            </div>
          </Panel>

          <Panel className="p-3">
            <SectionLabel right="去重成员词形 · 每频段一次">BNC 频段推进</SectionLabel>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 xl:grid-cols-5">
              {data.bncBands.map((band) => (
                <button key={band.id} type="button" onClick={() => open(band.query)} className="border-b border-[var(--border-hairline)] py-1.5 text-left hover:bg-[var(--bg-hover)]">
                  <span className="flex items-baseline justify-between">
                    <span className="font-mono-tabular text-[10px] text-[var(--stamp)]">{band.label}</span>
                    <span className="font-mono-tabular text-[9px] text-[var(--text-muted)]">{n(band.value)}/{n(band.total)}</span>
                  </span>
                  <span className="mt-1 block"><Meter value={band.value} total={band.total ?? 0} tone="seal" /></span>
                </button>
              ))}
            </div>
          </Panel>

          <div className="grid gap-3 xl:grid-cols-2">
            <Panel className="p-3">
              <SectionLabel right="频次加权">COCA 覆盖率</SectionLabel>
              <div className="mt-2 space-y-2">
                {data.coverage.coca.map((cell) => <CoverageBar key={cell.id} bucket={cell} onOpen={() => open(cell.query)} />)}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">分母是指定排名范围内所有已列出词性记录的频次之和；分子是其中有效状态为“掌握”的记录频次。</p>
            </Panel>

            <Panel className="p-3">
              <SectionLabel right="成员频次加权">BNC 覆盖率</SectionLabel>
              <div className="mt-2 space-y-2">
                {data.coverage.bnc.map((cell) => <CoverageBar key={cell.id} bucket={cell} onOpen={() => open(cell.query)} />)}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">不使用词族总频次；每个成员槽按它自己打印的频次计权。</p>
            </Panel>
          </div>

          <Panel className="p-3">
            <SectionLabel right={`${events.data?.length ?? 0} 条最近事件`}>事件时间线</SectionLabel>
            {events.data && events.data.length > 0 ? <EventTimeline events={events.data} /> : <p className="mt-2 text-[11px] text-[var(--text-muted)]">还没有学习事件。设置状态或记录学习后会出现在这里。</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function StatusBlock({
  title,
  kind,
  data,
  onOpen,
}: {
  title: string;
  kind: EntityKind;
  data: InsightsReport['status']['forms'];
  onOpen: (query: LexQuery) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[13px] font-semibold">{title}</span>
        <span className="font-mono-tabular text-[9px] text-[var(--text-faint)]">{n(data.total)}</span>
      </div>
      <div className="mt-1 flex h-2 w-full overflow-hidden bg-[var(--bg-inset)]">
        {STATUS_ORDER.map((status) => {
          const width = data.total > 0 ? (data.byStatus[status] / data.total) * 100 : 0;
          return <span key={status} className={`h-full st-${status}`} style={{ width: `${width}%` }} title={`${STATUS_LABELS[status]} ${n(data.byStatus[status])}`} />;
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {STATUS_ORDER.map((status) => (
          <button key={status} type="button" onClick={() => onOpen(statusQueryFor(kind, status))} className="font-mono-tabular text-[9px] text-[var(--text-muted)] hover:text-[var(--signal)]">
            {STATUS_LABELS[status]} <span className="text-[var(--text-secondary)]">{n(data.byStatus[status])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CoverageCard({ label, value, total, note, onOpen }: { label: string; value: number; total: number; note: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 text-left hover:border-[var(--signal)]">
      <p className="eyebrow leading-tight">{label}</p>
      <p className="mt-1 font-display text-xl">{n(value)}<span className="ml-1 font-mono-tabular text-[10px] text-[var(--text-muted)]">/ {n(total)}</span></p>
      <p className="mt-0.5 text-[9px] text-[var(--text-muted)]">{note}</p>
      <p className="mt-1 text-[9px] text-[var(--signal)]">打开集合 <ArrowUpRight size={9} className="inline" /></p>
    </button>
  );
}

function BucketBar({ bucket, onOpen }: { bucket: InsightBucket; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="text-left hover:bg-[var(--bg-hover)]">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-mono-tabular text-[10px] text-[var(--text-secondary)]">{bucket.label}</span>
        <span className="font-mono-tabular text-[9px] text-[var(--text-muted)]">{n(bucket.value)}/{n(bucket.total)} · {ratio(bucket.ratio)}</span>
      </span>
      <span className="mt-1 block"><Meter value={bucket.value} total={bucket.total ?? 0} /></span>
    </button>
  );
}

function CoverageBar({ bucket, onOpen }: { bucket: InsightBucket; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="block w-full border-b border-[var(--border-hairline)] py-1.5 text-left last:border-0 hover:bg-[var(--bg-hover)]">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-[var(--text-secondary)]">{bucket.label}</span>
        <span className="font-mono-tabular text-[11px] text-[var(--seal)]">{ratio(bucket.ratio)}</span>
      </span>
      <span className="mt-1 block"><Meter value={bucket.value} total={bucket.total ?? 0} tone="seal" /></span>
      <span className="mt-0.5 flex justify-between font-mono-tabular text-[9px] text-[var(--text-faint)]">
        <span>{n(bucket.value)} / {n(bucket.total)}</span>
        <span>{bucket.note}</span>
      </span>
    </button>
  );
}

function EventTimeline({ events }: { events: LearningEvent[] }) {
  const days = useMemo(() => {
    const map = new Map<string, { status: number; study: number; other: number; last: string }>();
    for (const event of events) {
      const day = event.at.slice(0, 10);
      let entry = map.get(day);
      if (!entry) {
        entry = { status: 0, study: 0, other: 0, last: event.at };
        map.set(day, entry);
      }
      if (event.type === 'status') entry.status++;
      else if (event.type === 'study') entry.study++;
      else entry.other++;
      if (event.at > entry.last) entry.last = event.at;
    }
    return [...map.entries()].slice(0, 14);
  }, [events]);

  const max = Math.max(...days.map(([, entry]) => entry.status + entry.study + entry.other), 1);
  return (
    <div className="mt-2 space-y-1.5">
      {days.map(([day, entry]) => (
        <div key={day} className="grid grid-cols-[74px_1fr_auto] items-center gap-2">
          <span className="font-mono-tabular text-[10px] text-[var(--text-muted)]">{shortDate(`${day}T00:00:00.000Z`)}</span>
          <span className="flex h-3 overflow-hidden bg-[var(--bg-inset)]">
            <span className="h-full bg-[var(--seal)]" style={{ width: `${(entry.status / max) * 100}%` }} title={`状态 ${entry.status}`} />
            <span className="h-full bg-[var(--signal)]" style={{ width: `${(entry.study / max) * 100}%` }} title={`学习 ${entry.study}`} />
            <span className="h-full bg-[var(--text-faint)]" style={{ width: `${(entry.other / max) * 100}%` }} title={`其他 ${entry.other}`} />
          </span>
          <span className="font-mono-tabular text-[9px] text-[var(--text-muted)]">{entry.status} 状态 · {entry.study} 学习 · {dateTime(entry.last)}</span>
        </div>
      ))}
      <p className="pt-1 text-[10px] text-[var(--text-muted)]">最近 14 个有事件的日期；状态、学习打卡与其他写入分开计数。</p>
    </div>
  );
}
