import React, { useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  ActivityLogEntry,
  BncCocaFamily,
  CetOfficialEntry,
  DataDiagnosticsReport,
  FilterCriteria,
  LexiconWordItem,
  UserWordRecord,
} from '../data/types.ts';
import {
  CLOSED_CLASS_STOPWORDS,
  computeLexiconAnalytics,
  DEFAULT_FILTER_CRITERIA,
} from '../data/searchAndFilter.ts';

interface AnalyticsViewProps {
  words: LexiconWordItem[];
  families: BncCocaFamily[];
  cetEntries: CetOfficialEntry[];
  diagnostics: DataDiagnosticsReport;
  userRecordsMap: Map<string, UserWordRecord>;
  activityLogs: ActivityLogEntry[];
  onJumpToExploreWithFilter: (criteria: FilterCriteria) => void;
  onInspectFamily: (familyId: string) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  words,
  families,
  cetEntries,
  userRecordsMap,
  activityLogs,
  onJumpToExploreWithFilter,
  onInspectFamily,
}) => {
  const [bandViewRange, setBandViewRange] = useState<'all' | '1_10' | '11_25'>('all');
  const [mobilePane, setMobilePane] = useState<'summary' | 'bands'>('summary');

  const stats = useMemo(() => {
    const core = computeLexiconAnalytics(words, families, cetEntries, userRecordsMap);

    const tagCounts = new Map<string, number>();
    for (const w of words) {
      const rec = userRecordsMap.get(w.id);
      if (rec?.tags) {
        for (const t of rec.tags) {
          tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
        }
      }
    }

    const topUnmasteredFamilies = families
      .filter(
        (fam) =>
          !CLOSED_CLASS_STOPWORDS.has(fam.normalizedHeadword) &&
          fam.members.length >= 3 &&
          fam.cetMemberCount >= 1
      )
      .map((fam) => {
        const unmasteredMembers = fam.members.filter(
          (m) => (userRecordsMap.get(m.normalized)?.status || 'unrated') !== 'mastered'
        );
        if (unmasteredMembers.length === 0) return null;
        const unmasteredFreq = unmasteredMembers.reduce((acc, m) => acc + m.frequency, 0);
        return {
          family: fam,
          unmasteredCount: unmasteredMembers.length,
          unmasteredFreq,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => b.unmasteredFreq - a.unmasteredFreq)
      .slice(0, 10);

    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    return {
      ...core,
      topUnmasteredFamilies,
      topTags,
    };
  }, [words, families, cetEntries, userRecordsMap]);

  const visibleBandRows = useMemo(() => {
    if (bandViewRange === '1_10') return stats.bandRows.slice(0, 10);
    if (bandViewRange === '11_25') return stats.bandRows.slice(10, 25);
    return stats.bandRows;
  }, [stats.bandRows, bandViewRange]);

  const recent14Days = useMemo(() => {
    const days: { dateStr: string; label: string; count: number }[] = [];
    const now = new Date();
    const countsByDate = new Map<string, number>();

    for (const log of activityLogs) {
      const d = log.timestamp.slice(0, 10);
      countsByDate.set(d, (countsByDate.get(d) || 0) + 1);
    }

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({
        dateStr: iso,
        label: iso.slice(5),
        count: countsByDate.get(iso) || 0,
      });
    }
    return days;
  }, [activityLogs]);

  const maxDailyCount = Math.max(...recent14Days.map((d) => d.count), 1);

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 bg-[var(--bg-surface)] overflow-hidden">
      {/* Mobile Sub-View Switcher (<1024px) */}
      <div className="lg:hidden min-h-[40px] py-1.5 px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setMobilePane('summary')}
          className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
            mobilePane === 'summary'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
              : 'text-[var(--text-muted)]'
          }`}
        >
          核心指标与词族排行
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('bands')}
          className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
            mobilePane === 'bands'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
              : 'text-[var(--text-muted)]'
          }`}
        >
          1k–25k 频段覆盖矩阵
        </button>
      </div>

      {/* Zone 1: Left Summary KPIs, Top Families & Activity Trend (340px-400px) */}
      <aside
        className={`w-full lg:w-[340px] xl:w-[400px] lg:border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex-col shrink-0 flex-1 lg:flex-initial h-full min-h-0 overflow-y-auto divide-y divide-[var(--border-subtle)] ${
          mobilePane === 'summary' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {/* 1. 2x2 Core KPI Matrix */}
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
          <div className="p-3 sm:p-3.5">
            <div className="flex items-center justify-between gap-1 text-[11px] font-medium text-[var(--text-secondary)]">
              <span className="truncate">CET-4 掌握率</span>
              <button
                type="button"
                onClick={() =>
                  onJumpToExploreWithFilter({
                    ...DEFAULT_FILTER_CRITERIA,
                    sourceFilter: 'cet4',
                  })
                }
                className="text-[var(--accent-primary)] hover:underline inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>筛选</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
            <div className="mt-1 text-2xl font-mono-tabular font-bold text-[var(--text-primary)]">
              {stats.cet4FormsTotal > 0
                ? `${Math.round((stats.cet4FormsMastered / stats.cet4FormsTotal) * 100)}%`
                : '0%'}
            </div>
            <div className="mt-1.5 space-y-0.5 text-[11px] font-mono-tabular text-[var(--text-muted)]">
              <div className="flex justify-between gap-1">
                <span>大纲词形</span>
                <span className="text-[var(--text-secondary)]">
                  {stats.cet4FormsMastered}/{stats.cet4FormsTotal}
                </span>
              </div>
              <div className="flex justify-between gap-1" title="词目中至少 1 个词形已掌握">
                <span>词目覆盖(≥1)</span>
                <span className="text-[var(--text-secondary)]">
                  {stats.cet4OfficialPartialCovered}/{stats.cet4OfficialTotal}
                </span>
              </div>
              <div className="flex justify-between gap-1" title="词目下全部词形槽位均已掌握">
                <span>词目完整掌握</span>
                <span className="text-[var(--text-secondary)]">
                  {stats.cet4OfficialFullMastered}/{stats.cet4OfficialTotal}
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 sm:p-3.5">
            <div className="flex items-center justify-between gap-1 text-[11px] font-medium text-[var(--text-secondary)]">
              <span className="truncate">CET-6 掌握率</span>
              <button
                type="button"
                onClick={() =>
                  onJumpToExploreWithFilter({
                    ...DEFAULT_FILTER_CRITERIA,
                    sourceFilter: 'cet6_new',
                  })
                }
                className="text-[var(--accent-primary)] hover:underline inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>筛选</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
            <div className="mt-1 text-2xl font-mono-tabular font-bold text-[var(--text-primary)]">
              {stats.cet6OnlyFormsTotal > 0
                ? `${Math.round((stats.cet6OnlyFormsMastered / stats.cet6OnlyFormsTotal) * 100)}%`
                : '0%'}
            </div>
            <div className="mt-1.5 space-y-0.5 text-[11px] font-mono-tabular text-[var(--text-muted)]">
              <div className="flex justify-between gap-1" title="仅六级新增词形 (不含四六级同形词)">
                <span>六级新增词形</span>
                <span className="text-[var(--text-secondary)]">
                  {stats.cet6OnlyFormsMastered}/{stats.cet6OnlyFormsTotal}
                </span>
              </div>
              <div className="flex justify-between gap-1" title="词目中至少 1 个词形已掌握">
                <span>词目覆盖(≥1)</span>
                <span className="text-[var(--text-secondary)]">
                  {stats.cet6OfficialPartialCovered}/{stats.cet6OfficialTotal}
                </span>
              </div>
              <div className="flex justify-between gap-1" title="词目下全部词形槽位均已掌握">
                <span>词目完整掌握</span>
                <span className="text-[var(--text-secondary)]">
                  {stats.cet6OfficialFullMastered}/{stats.cet6OfficialTotal}
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 sm:p-3.5">
            <div className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
              语料库词频加权覆盖
            </div>
            <div className="mt-1 text-2xl font-mono-tabular font-bold text-emerald-600 dark:text-emerald-400">
              {stats.corpusWeightedPct}%
            </div>
            <div className="mt-1 text-[10px] text-[var(--text-muted)] leading-snug">
              仅计 BNC/COCA 独立实测词频 (不含变体借用)
            </div>
          </div>

          <div className="p-3 sm:p-3.5">
            <div className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
              个人学习状态分布
            </div>
            <div className="mt-1.5 space-y-1 text-[11px] font-mono-tabular">
              <div className="flex justify-between gap-1">
                <span className="text-[var(--text-secondary)]">掌握/在学</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {stats.statusCounts.mastered.toLocaleString()} /{' '}
                  {stats.statusCounts.learning.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between gap-1">
                <span className="text-[var(--text-secondary)]">待学/暂缓</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {stats.statusCounts.queued.toLocaleString()} /{' '}
                  {stats.statusCounts.deferred.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Top 10 High-Value Unmastered Content Families */}
        <div className="p-3.5 sm:p-4 space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Top 10 高价值待攻克实词族
            </h3>
            <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] shrink-0">
              按未学频次排序
            </span>
          </div>

          <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded bg-[var(--bg-surface)]">
            {stats.topUnmasteredFamilies.map(({ family, unmasteredCount, unmasteredFreq }, idx) => (
              <button
                key={family.id}
                type="button"
                onClick={() => onInspectFamily(family.id)}
                className="w-full px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] w-4 shrink-0">
                    {idx + 1}.
                  </span>
                  <span
                    translate="no"
                    className="font-serif-lexicon font-semibold text-[var(--text-primary)] truncate"
                  >
                    {family.headword}
                  </span>
                  <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] shrink-0">
                    {family.band} · 待学 {unmasteredCount}/{family.members.length}
                  </span>
                </div>
                <span className="font-mono-tabular text-[11px] font-medium text-[var(--accent-primary)] shrink-0">
                  {unmasteredFreq.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. 14-Day Activity Bar Chart & Tag Breakdown */}
        <div className="p-3.5 sm:p-4 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              近 14 日词汇标注活跃度
            </h3>
            <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
              累计 {activityLogs.length} 条记录
            </span>
          </div>

          <div className="h-24 pt-4 px-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded flex items-end justify-between gap-1">
            {recent14Days.map((d) => {
              const hPct = d.count > 0 ? Math.max(12, Math.round((d.count / maxDailyCount) * 100)) : 4;
              return (
                <div
                  key={d.dateStr}
                  className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
                  title={`${d.dateStr}: ${d.count} 次操作`}
                >
                  <div
                    className={`w-full rounded-t-xs transition-all ${
                      d.count > 0 ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-subtle)]'
                    }`}
                    style={{ height: `${hPct}%` }}
                  />
                  <span className="text-[9px] font-mono-tabular text-[var(--text-muted)]">
                    {d.label.slice(3)}
                  </span>
                </div>
              );
            })}
          </div>

          {stats.topTags.length > 0 && (
            <div className="pt-2 space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                个人高频标签分布
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stats.topTags.map(([tag, count]) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      onJumpToExploreWithFilter({
                        ...DEFAULT_FILTER_CRITERIA,
                        tags: [tag],
                      })
                    }
                    className="px-2 py-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-[11px] font-mono-tabular text-[var(--text-secondary)] hover:text-[var(--accent-primary)] cursor-pointer"
                  >
                    #{tag} ({count})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Zone 2: Right Full-Height 1k–25k BNC/COCA Band Coverage Matrix */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 h-full bg-[var(--bg-surface)] overflow-hidden ${
          mobilePane === 'bands' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        <div className="px-3.5 sm:px-5 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] whitespace-nowrap">
              BNC/COCA 1k–25k 频段覆盖矩阵
            </h2>
            <span className="hidden xl:inline text-xs text-[var(--text-muted)]">
              点击任意频段可直接跳转至词库检索该频段词条
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {[
              { id: 'all', label: '全部 1k–25k' },
              { id: '1_10', label: '1k–10k' },
              { id: '11_25', label: '11k–25k' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setBandViewRange(tab.id as typeof bandViewRange)}
                className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  bandViewRange === tab.id
                    ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Band Table Header */}
        <div className="grid grid-cols-[52px_66px_78px_1fr_42px] xl:grid-cols-[64px_92px_104px_82px_1fr_60px] items-center px-3.5 sm:px-5 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
          <div>频段</div>
          <div>词族覆盖</div>
          <div>词形掌握</div>
          <div className="hidden xl:block">含四六级词</div>
          <div>掌握与在学进度谱</div>
          <div className="text-right">掌握率</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
          {visibleBandRows.map((row) => {
            const activePct =
              row.wordCount > 0
                ? Math.round((row.learningOrQueuedWords / row.wordCount) * 100)
                : 0;
            return (
              <div
                key={row.bandNum}
                onClick={() =>
                  onJumpToExploreWithFilter({
                    ...DEFAULT_FILTER_CRITERIA,
                    bands: [row.bandNum],
                  })
                }
                className="grid grid-cols-[52px_66px_78px_1fr_42px] xl:grid-cols-[64px_92px_104px_82px_1fr_60px] items-center px-3.5 sm:px-5 py-2.5 text-xs hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
              >
                <div className="font-mono-tabular font-bold text-[var(--text-primary)] whitespace-nowrap">
                  BNC {row.bandLabel}
                </div>

                <div className="font-mono-tabular text-[var(--text-secondary)] whitespace-nowrap">
                  {row.coveredFamilies} / {row.familyCount}
                </div>

                <div className="font-mono-tabular text-[var(--text-secondary)] whitespace-nowrap">
                  {row.masteredWords.toLocaleString()} / {row.wordCount.toLocaleString()}
                </div>

                <div className="hidden xl:block font-mono-tabular text-[var(--text-muted)] whitespace-nowrap">
                  {row.cetWordsInBand > 0 ? `${row.cetWordsInBand} 词` : '—'}
                </div>

                <div className="pr-2 sm:pr-3 flex items-center gap-2">
                  <div className="flex-1 h-2 bg-[var(--bg-subtle)] rounded-xs overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${row.pctMastered}%` }}
                      title={`已掌握 ${row.pctMastered}%`}
                    />
                    <div
                      className="h-full bg-[var(--accent-primary)] transition-all"
                      style={{ width: `${activePct}%` }}
                      title={`学习中/待学 ${activePct}%`}
                    />
                  </div>
                </div>

                <div className="text-right font-mono-tabular font-semibold text-[var(--text-primary)]">
                  {row.pctMastered}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
