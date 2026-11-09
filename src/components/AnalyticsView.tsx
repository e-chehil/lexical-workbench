import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Info } from 'lucide-react';
import {
  ActivityLogEntry,
  BncCocaFamily,
  CetOfficialEntry,
  CocaLexemeRecord,
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
  cocaLexemes: CocaLexemeRecord[];
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
  cocaLexemes,
  families,
  cetEntries,
  userRecordsMap,
  activityLogs,
  onJumpToExploreWithFilter,
  onInspectFamily,
}) => {
  const [rightMatrixTab, setRightMatrixTab] = useState<'coca_tiers' | 'bnc_bands'>('coca_tiers');
  const [cocaCoverageMode, setCocaCoverageMode] = useState<'headword' | 'explicit_pos'>('headword');
  const [bandViewRange, setBandViewRange] = useState<'all' | '1_10' | '11_25'>('all');
  const [mobileInsightsPane, setMobileInsightsPane] = useState<'overview' | 'matrix'>('overview');

  const stats = useMemo(() => {
    const core = computeLexiconAnalytics(
      words,
      families,
      cetEntries,
      userRecordsMap,
      cocaLexemes
    );

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
      .slice(0, 8);

    return {
      ...core,
      topUnmasteredFamilies,
    };
  }, [words, cocaLexemes, families, cetEntries, userRecordsMap]);

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
      {/* Tablet/Mobile Pane Switcher (<1024px) to prevent vertical stacking */}
      <div className="lg:hidden px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-between gap-2 shrink-0">
        <div className="inline-flex rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMobileInsightsPane('overview')}
            className={`px-3 py-1 rounded cursor-pointer whitespace-nowrap ${
              mobileInsightsPane === 'overview'
                ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            五层掌握度与加权覆盖
          </button>
          <button
            type="button"
            onClick={() => setMobileInsightsPane('matrix')}
            className={`px-3 py-1 rounded cursor-pointer whitespace-nowrap ${
              mobileInsightsPane === 'matrix'
                ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            COCA 梯队与 BNC 频段矩阵
          </button>
        </div>
      </div>

      {/* Left Pane: 5-Layer Mastery Cards + 3 Frequency-Weighted Coverage Metrics + Activity */}
      <aside
        className={`w-full lg:w-[390px] xl:w-[430px] lg:border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex-col shrink-0 flex-1 lg:flex-none lg:h-full min-h-0 overflow-y-auto divide-y divide-[var(--border-subtle)] ${
          mobileInsightsPane === 'overview' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {/* Section 1: 5-Layer Multi-Granularity Mastery Breakdown */}
        <div className="p-4 space-y-3 bg-[var(--bg-surface)]">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              五层语言学粒度掌握度核算
            </h2>
            <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
              独立核算 · 零跨层虚增
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 font-mono-tabular text-xs">
            {/* Layer 1: Headword Mastery */}
            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
              <div className="text-[11px] font-sans font-medium text-[var(--text-secondary)]">
                1. COCA 词头级掌握 (Headwords)
              </div>
              <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                {stats.cocaHeadwordsMastered.toLocaleString()}{' '}
                <span className="text-xs font-normal text-[var(--text-muted)]">
                  / {stats.cocaHeadwordsTotal.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                学习中/待学: {stats.cocaHeadwordsLearningOrQueued.toLocaleString()}
              </div>
            </div>

            {/* Layer 2: Form Mastery */}
            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
              <div className="text-[11px] font-sans font-medium text-[var(--text-secondary)]">
                2. 词形级掌握 (94,954 Forms)
              </div>
              <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                {stats.statusCounts.mastered.toLocaleString()}{' '}
                <span className="text-xs font-normal text-[var(--text-muted)]">
                  / {words.length.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                在学 {stats.statusCounts.learning} · 待学 {stats.statusCounts.queued}
              </div>
            </div>

            {/* Layer 3: COCA Explicit Lemma+PoS Mastery */}
            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
              <div className="text-[11px] font-sans font-medium text-[var(--text-secondary)]">
                3. COCA 词元+词性显式掌握
              </div>
              <div className="mt-1 text-lg font-bold text-blue-600 dark:text-blue-400">
                {stats.cocaLexemesExplicitMastered.toLocaleString()}{' '}
                <span className="text-xs font-normal text-[var(--text-muted)]">
                  / {stats.cocaLexemesTotal.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                显式在学/待学: {stats.cocaLexemesExplicitLearningOrQueued.toLocaleString()}
              </div>
            </div>

            {/* Layer 4: BNC 25k Family Mastery */}
            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
              <div className="text-[11px] font-sans font-medium text-[var(--text-secondary)]">
                4. BNC 词族掌握 (25,002 族)
              </div>
              <div className="mt-1 text-lg font-bold text-teal-600 dark:text-teal-400">
                {stats.bncFamiliesPartialMastered.toLocaleString()}{' '}
                <span className="text-xs font-normal text-[var(--text-muted)]">部分覆盖</span>
              </div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                全族完整掌握: {stats.bncFamiliesFullMastered.toLocaleString()} 族
              </div>
            </div>
          </div>

          {/* Layer 5: CET Official Syllabus Entries */}
          <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] font-mono-tabular text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-sans text-[11px] font-semibold text-[var(--text-secondary)]">
                5. CET2016 官方考纲词目与词形掌握
              </span>
              <button
                type="button"
                onClick={() =>
                  onJumpToExploreWithFilter({
                    ...DEFAULT_FILTER_CRITERIA,
                    sourceFilter: 'cet_all',
                  })
                }
                className="text-[11px] text-[var(--accent-primary)] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
              >
                <span>筛选考纲</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">CET-4 四级大纲</div>
                <div className="font-bold text-[var(--text-primary)]">
                  词形 {stats.cet4FormsMastered}/{stats.cet4FormsTotal}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)]">
                  词目覆盖 {stats.cet4OfficialPartialCovered}/{stats.cet4OfficialTotal} (完整{' '}
                  {stats.cet4OfficialFullMastered})
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">CET-6 六级新增</div>
                <div className="font-bold text-[var(--text-primary)]">
                  词形 {stats.cet6OnlyFormsMastered}/{stats.cet6OnlyFormsTotal}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)]">
                  词目覆盖 {stats.cet6OfficialPartialCovered}/{stats.cet6OfficialTotal} (完整{' '}
                  {stats.cet6OfficialFullMastered})
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Three Independent Frequency-Weighted Coverage Metrics */}
        <div className="p-4 space-y-2.5 bg-[var(--bg-surface)]">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              三项独立语料频次加权覆盖率
            </h3>
            <span className="text-[10px] text-[var(--text-muted)]">分母与统计口径完全隔离</span>
          </div>

          <div className="space-y-2">
            {/* Metric 1: COCA Headword Proxy Weighted */}
            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  A. COCA 2020 词头合计频次加权覆盖 (代理指标)
                </span>
                <span className="font-mono-tabular text-base font-bold text-blue-600 dark:text-blue-400">
                  {stats.cocaProxyWeightedPct}%
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                分母：COCA 53,951 个词头合计频次（892,945,569）。说明：当词头整体标为「已掌握」时计入其合计频次，属于词头级代理估计（学习者未必掌握该词所有次要词性）。
              </p>
            </div>

            {/* Metric 2: COCA Explicit PoS Weighted */}
            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  B. COCA 2020 词元+词性显式加权覆盖 (严格口径)
                </span>
                <span className="font-mono-tabular text-base font-bold text-indigo-600 dark:text-indigo-400">
                  {stats.cocaExplicitWeightedPct}%
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                分母：COCA 60,000 条词元+词性频次（892,945,569）。仅统计用户在详情面板显式标注某词性为「已掌握」的记录，绝不通过词头状态自动虚增。
              </p>
            </div>

            {/* Metric 3: BNC Word Form Weighted */}
            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  C. BNC/COCA 2.0 独立词形实测频次加权覆盖
                </span>
                <span className="font-mono-tabular text-base font-bold text-emerald-600 dark:text-emerald-400">
                  {stats.corpusWeightedPct}%
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                分母：BNC 25k 词族表全部 76,125 个去重词形的独立实测频次总和（不含变体借用）。
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Top Unmastered Content Families & 14-Day Activity */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              高价值待攻克实词族 & 近 14 日标注趋势
            </h3>
            <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
              累计 {activityLogs.length} 条流水
            </span>
          </div>

          <div className="h-20 pt-3 px-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded flex items-end justify-between gap-1">
            {recent14Days.map((d) => {
              const hPct =
                d.count > 0 ? Math.max(12, Math.round((d.count / maxDailyCount) * 100)) : 4;
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
                  <span className="text-[8px] font-mono-tabular text-[var(--text-muted)]">
                    {d.label.slice(3)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded bg-[var(--bg-surface)]">
            {stats.topUnmasteredFamilies.map(({ family, unmasteredCount, unmasteredFreq }, idx) => (
              <button
                key={family.id}
                type="button"
                onClick={() => onInspectFamily(family.id)}
                className="w-full px-3 py-1.5 flex items-center justify-between gap-2 text-xs hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] w-4">
                    {idx + 1}.
                  </span>
                  <span
                    translate="no"
                    className="font-serif-lexicon font-semibold text-[var(--text-primary)] truncate"
                  >
                    {family.headword}
                  </span>
                  <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                    {family.band} · 待学 {unmasteredCount}/{family.members.length}
                  </span>
                </div>
                <span className="font-mono-tabular text-[11px] text-[var(--accent-primary)]">
                  BNC {unmasteredFreq.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Right Pane: Switchable COCA Rank Interval Coverage & BNC 1k-25k Band Matrix */}
      <div
        className={`flex-1 flex-col min-w-0 min-h-0 h-full bg-[var(--bg-surface)] overflow-hidden ${
          mobileInsightsPane === 'matrix' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setRightMatrixTab('coca_tiers')}
              className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                rightMatrixTab === 'coca_tiers'
                  ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] border border-[var(--border-subtle)] font-semibold shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              COCA 排名梯队矩阵 (1k–60k)
            </button>
            <button
              type="button"
              onClick={() => setRightMatrixTab('bnc_bands')}
              className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                rightMatrixTab === 'bnc_bands'
                  ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] border border-[var(--border-subtle)] font-semibold shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              BNC 1k–25k 词族四态矩阵
            </button>
          </div>

          {rightMatrixTab === 'coca_tiers' ? (
            <div className="inline-flex rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setCocaCoverageMode('headword')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  cocaCoverageMode === 'headword'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                去重词头口径 (53,951)
              </button>
              <button
                type="button"
                onClick={() => setCocaCoverageMode('explicit_pos')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  cocaCoverageMode === 'explicit_pos'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                词元+词性记录口径 (60,000)
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {[
                { id: 'all', label: '全部 1k–25k' },
                { id: '1_10', label: '1k–10k' },
                { id: '11_25', label: '11k–25k' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBandViewRange(tab.id as typeof bandViewRange)}
                  className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${
                    bandViewRange === tab.id
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {rightMatrixTab === 'coca_tiers' ? (
          /* ================= COCA RANK INTERVAL COVERAGE MATRIX ================= */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="px-4 py-2 bg-blue-500/5 border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5 shrink-0">
              <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                {cocaCoverageMode === 'headword'
                  ? '当前按「去重词头口径」统计每个 COCA 派生排名区间内各词头的整体掌握率；点击任意区间可直接跳转探索视图。'
                  : '当前按「词元+词性记录口径」统计每个官方排名区间（60,000 条）的掌握分布与频次加权覆盖率。'}
              </span>
            </div>

            <div className="grid grid-cols-[125px_90px_1fr_60px] sm:grid-cols-[172px_104px_82px_1fr_68px] items-center px-4 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] shrink-0">
              <div>COCA 排名区间</div>
              <div>已掌握 / 总数</div>
              <div className="hidden sm:block">在学与待学</div>
              <div>区间掌握与在学进度条</div>
              <div className="text-right">掌握率</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
              {(cocaCoverageMode === 'headword'
                ? stats.cocaHeadwordTierRows
                : stats.cocaLexemeTierRows
              ).map((row) => {
                const total = row.totalCount;
                const mastered = row.masteredCount;
                const active = row.learningCount + row.queuedCount;
                const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
                const activePct = total > 0 ? Math.round((active / total) * 100) : 0;

                return (
                  <div
                    key={row.tierId}
                    onClick={() =>
                      onJumpToExploreWithFilter({
                        ...DEFAULT_FILTER_CRITERIA,
                        sourceFilter: 'coca_all',
                        cocaRankMode:
                          cocaCoverageMode === 'headword' ? 'derived_headword' : 'lemma_pos',
                        minCocaRank: row.minRank,
                        maxCocaRank: row.maxRank,
                      })
                    }
                    className="grid grid-cols-[125px_90px_1fr_60px] sm:grid-cols-[172px_104px_82px_1fr_68px] items-center px-4 py-3 text-xs font-mono-tabular hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                  >
                    <div className="font-bold text-[var(--text-primary)] truncate pr-2">
                      {row.tierLabel}
                    </div>
                    <div className="text-[var(--text-secondary)]">
                      {mastered.toLocaleString()} / {total.toLocaleString()}
                    </div>
                    <div className="hidden sm:block text-[var(--text-muted)]">
                      {active.toLocaleString()}
                    </div>
                    <div className="pr-3 sm:pr-4 flex items-center gap-2">
                      <div className="flex-1 h-2.5 bg-[var(--bg-subtle)] rounded-xs overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${activePct}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right font-bold text-[var(--text-primary)]">
                      {pct}%
                      <span className="block text-[10px] font-normal text-[var(--text-muted)]">
                        权 {row.freqCoveragePct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ================= BNC 1k-25k 4-STATE BAND MATRIX ================= */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="grid grid-cols-[58px_115px_1fr_52px] sm:grid-cols-[62px_135px_96px_76px_1fr_56px] items-center px-4 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] shrink-0">
              <div>频段</div>
              <div>词族四态 (完/部/触/未)</div>
              <div className="hidden sm:block">词形掌握</div>
              <div className="hidden sm:block">COCA/考纲</div>
              <div>掌握与在学进度谱</div>
              <div className="text-right">掌握率</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
              {visibleBandRows.map((row) => {
                const activePct =
                  row.wordCount > 0
                    ? Math.round((row.learningOrQueuedWords / row.wordCount) * 100)
                    : 0;
                const untouchedFamilies = Math.max(0, row.familyCount - row.touchedFamilies);
                return (
                  <div
                    key={row.bandNum}
                    onClick={() =>
                      onJumpToExploreWithFilter({
                        ...DEFAULT_FILTER_CRITERIA,
                        bands: [row.bandNum],
                      })
                    }
                    className="grid grid-cols-[58px_115px_1fr_52px] sm:grid-cols-[62px_135px_96px_76px_1fr_56px] items-center px-4 py-2.5 text-xs font-mono-tabular hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                  >
                    <div className="font-bold text-[var(--text-primary)]">
                      BNC {row.bandLabel}
                    </div>

                    <div
                      className="text-[11px] text-[var(--text-secondary)] truncate pr-2"
                      title={`完整掌握: ${row.fullMasteredFamilies} | 部分掌握: ${row.partialMasteredFamilies} | 已接触(在学/待学): ${row.touchedFamilies} | 未接触: ${untouchedFamilies}`}
                    >
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {row.fullMasteredFamilies}
                      </span>
                      /<span>{row.partialMasteredFamilies}</span>/
                      <span className="text-blue-600 dark:text-blue-400">
                        {row.touchedFamilies}
                      </span>
                      /<span className="text-[var(--text-muted)]">{untouchedFamilies}</span>
                    </div>

                    <div className="hidden sm:block text-[var(--text-secondary)]">
                      {row.masteredWords.toLocaleString()} / {row.wordCount.toLocaleString()}
                    </div>

                    <div className="hidden sm:block text-[11px] text-[var(--text-muted)]">
                      C:{row.cocaWordsInBand} · E:{row.cetWordsInBand}
                    </div>

                    <div className="pr-3 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-[var(--bg-subtle)] rounded-xs overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${row.pctMastered}%` }}
                        />
                        <div
                          className="h-full bg-[var(--accent-primary)] transition-all"
                          style={{ width: `${activePct}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-right font-semibold text-[var(--text-primary)]">
                      {row.pctMastered}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
