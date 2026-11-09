import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BncCocaFamily,
  COCA_POS_META,
  DictionaryTemplate,
  LEARNING_STATUS_META,
  LearningStatus,
  LexiconWordItem,
  UserWordRecord,
} from '../data/types.ts';
import {
  buildDictionaryUrl,
  selectFamilyCetWordIdsForQueue,
} from '../data/searchAndFilter.ts';
import { getIntraFamilyShareDetail } from '../utils/frequency.ts';
import {
  Search,
  ExternalLink,
  X,
  ArrowLeft,
  ChevronRight,
  GitBranch,
  List,
} from 'lucide-react';

interface WordFamilyViewProps {
  families: BncCocaFamily[];
  wordsMap: Map<string, LexiconWordItem>;
  userRecordsMap: Map<string, UserWordRecord>;
  dictionaries: DictionaryTemplate[];
  selectedFamilyId: string | null;
  highlightedWordId: string | null;
  onSelectFamily: (familyId: string) => void;
  onSelectWord: (word: LexiconWordItem) => void;
  onStatusChange: (wordId: string, wordDisplay: string, status: LearningStatus) => void;
  onBatchSetStatus: (wordIds: string[], status: LearningStatus) => void;
}

type FamilySortBy =
  | 'frequency_desc'
  | 'coca_rank_asc'
  | 'band_asc'
  | 'members_desc'
  | 'cet_desc'
  | 'alpha_asc';

type MemberFilter = 'all' | 'coca' | 'cet' | 'unmastered' | 'mastered';
type MemberSort = 'bnc_freq_desc' | 'coca_freq_desc' | 'status_asc' | 'alpha_asc';

const ALL_STATUSES: LearningStatus[] = ['unrated', 'queued', 'learning', 'mastered', 'deferred'];

export const WordFamilyView: React.FC<WordFamilyViewProps> = ({
  families,
  wordsMap,
  userRecordsMap,
  dictionaries,
  selectedFamilyId,
  highlightedWordId,
  onSelectFamily,
  onSelectWord,
  onStatusChange,
  onBatchSetStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBand, setSelectedBand] = useState<number | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<FamilySortBy>('frequency_desc');
  const [viewMode, setViewMode] = useState<'table' | 'graph'>('table');
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('all');
  const [memberSort, setMemberSort] = useState<MemberSort>('bnc_freq_desc');
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [overwriteCetStatus, setOverwriteCetStatus] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const centerPaneRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [centerWidth, setCenterWidth] = useState(760);

  const filteredFamilies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result = families.filter((fam) => {
      if (selectedBand !== 'ALL' && fam.bandNumber !== selectedBand) return false;
      if (q) {
        if (fam.normalizedHeadword.includes(q)) return true;
        return fam.members.some((m) => m.normalized.includes(q));
      }
      return true;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case 'frequency_desc':
          return b.totalFrequency - a.totalFrequency;
        case 'coca_rank_asc':
          return (a.headwordCocaRank ?? 999999) - (b.headwordCocaRank ?? 999999);
        case 'band_asc':
          return a.bandNumber !== b.bandNumber
            ? a.bandNumber - b.bandNumber
            : b.totalFrequency - a.totalFrequency;
        case 'members_desc':
          return b.members.length - a.members.length;
        case 'cet_desc':
          return b.cetMemberCount !== a.cetMemberCount
            ? b.cetMemberCount - a.cetMemberCount
            : b.totalFrequency - a.totalFrequency;
        case 'alpha_asc':
          return a.normalizedHeadword.localeCompare(b.normalizedHeadword);
        default:
          return 0;
      }
    });

    return result;
  }, [families, searchQuery, selectedBand, sortBy]);

  const activeFamily = useMemo(() => {
    if (selectedFamilyId) {
      const found = families.find((f) => f.id === selectedFamilyId);
      if (found) return found;
    }
    return filteredFamilies[0] || families[0] || null;
  }, [families, selectedFamilyId, filteredFamilies]);

  useEffect(() => {
    const el = centerPaneRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCenterWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeFamily?.id, mobileShowDetail]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [searchQuery, selectedBand, sortBy]);

  const ITEM_HEIGHT = 66;
  const totalHeight = filteredFamilies.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 6);
  const endIndex = Math.min(filteredFamilies.length, startIndex + 26);
  const visibleFamilies = filteredFamilies.slice(startIndex, endIndex);

  const activeMembers = useMemo(() => {
    if (!activeFamily) return [];
    const list = activeFamily.members.filter((m) => {
      const entry = wordsMap.get(m.normalized);
      const status = userRecordsMap.get(m.normalized)?.status || 'unrated';
      if (memberFilter === 'coca') return Boolean(entry?.inCoca);
      if (memberFilter === 'cet') return Boolean(entry?.isCet4 || entry?.isCet6);
      if (memberFilter === 'unmastered') return status !== 'mastered';
      if (memberFilter === 'mastered') return status === 'mastered';
      return true;
    });

    const statusOrder: Record<LearningStatus, number> = {
      learning: 1,
      queued: 2,
      unrated: 3,
      deferred: 4,
      mastered: 5,
    };

    list.sort((a, b) => {
      if (memberSort === 'bnc_freq_desc') {
        if (a.isHeadword !== b.isHeadword) return a.isHeadword ? -1 : 1;
        return b.frequency - a.frequency;
      }
      if (memberSort === 'coca_freq_desc') {
        const wA = wordsMap.get(a.normalized);
        const wB = wordsMap.get(b.normalized);
        const cA = wA?.cocaHeadwordTotalFreq ?? -1;
        const cB = wB?.cocaHeadwordTotalFreq ?? -1;
        if (cB !== cA) return cB - cA;
        return b.frequency - a.frequency;
      }
      if (memberSort === 'status_asc') {
        const stA = userRecordsMap.get(a.normalized)?.status || 'unrated';
        const stB = userRecordsMap.get(b.normalized)?.status || 'unrated';
        if (statusOrder[stA] !== statusOrder[stB]) return statusOrder[stA] - statusOrder[stB];
        return b.frequency - a.frequency;
      }
      return a.word.localeCompare(b.word);
    });
    return list;
  }, [activeFamily, wordsMap, userRecordsMap, memberFilter, memberSort]);

  const familyStats = useMemo(() => {
    if (!activeFamily) {
      return {
        mastered: 0,
        learning: 0,
        queued: 0,
        masteredFreq: 0,
        freqPct: 0,
        top3Pct: 0,
        cocaMembers: 0,
        cetRefs: [] as { lineNumber: number; level: string; rawLine: string }[],
      };
    }
    let mastered = 0;
    let learning = 0;
    let queued = 0;
    let masteredFreq = 0;
    let cocaMembers = 0;
    const cetRefMap = new Map<string, { lineNumber: number; level: string; rawLine: string }>();

    for (const m of activeFamily.members) {
      const st = userRecordsMap.get(m.normalized)?.status || 'unrated';
      if (st === 'mastered') {
        mastered++;
        masteredFreq += m.frequency;
      } else if (st === 'learning') {
        learning++;
      } else if (st === 'queued') {
        queued++;
      }
      const entry = wordsMap.get(m.normalized);
      if (entry?.inCoca) cocaMembers++;
      if (entry?.cetRefs) {
        for (const ref of entry.cetRefs) {
          const key = `${ref.level}-${ref.lineNumber}`;
          if (!cetRefMap.has(key)) {
            cetRefMap.set(key, {
              lineNumber: ref.lineNumber,
              level: ref.level,
              rawLine: ref.rawLine,
            });
          }
        }
      }
    }

    const sortedByFreq = [...activeFamily.members].sort((a, b) => b.frequency - a.frequency);
    const top3Sum = sortedByFreq.slice(0, 3).reduce((acc, m) => acc + m.frequency, 0);
    const top3Pct =
      activeFamily.totalFrequency > 0
        ? Math.min(100, Math.round((top3Sum / activeFamily.totalFrequency) * 100))
        : 0;
    const freqPct =
      activeFamily.totalFrequency > 0
        ? Math.min(100, Math.round((masteredFreq / activeFamily.totalFrequency) * 100))
        : 0;

    return {
      mastered,
      learning,
      queued,
      masteredFreq,
      freqPct,
      top3Pct,
      cocaMembers,
      cetRefs: Array.from(cetRefMap.values()),
    };
  }, [activeFamily, userRecordsMap, wordsMap]);

  const defaultDict = useMemo(
    () => dictionaries.find((d) => d.enabled) || dictionaries[0],
    [dictionaries]
  );

  const headwordItem = activeFamily
    ? wordsMap.get(activeFamily.normalizedHeadword) || null
    : null;

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 bg-[var(--bg-surface)] overflow-hidden">
      {/* Zone 1: Left Family Directory */}
      <div
        className={`w-full md:w-[250px] lg:w-[280px] xl:w-[310px] border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-col shrink-0 h-full min-h-0 ${
          mobileShowDetail ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-2.5 sm:p-3 border-b border-[var(--border-subtle)] space-y-2 shrink-0 bg-[var(--bg-surface)]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="检索词族首词或派生词..."
              className="w-full pl-8 pr-7 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 cursor-pointer"
                aria-label="清除搜索"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={selectedBand}
              onChange={(e) =>
                setSelectedBand(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
              }
              aria-label="选择频段"
              className="w-full px-2 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-[11px] font-medium text-[var(--text-secondary)] truncate"
            >
              <option value="ALL">全部频段 ({families.length})</option>
              {Array.from({ length: 25 }, (_, i) => i + 1).map((b) => (
                <option key={b} value={b}>
                  BNC {b}k 频段
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as FamilySortBy)}
              aria-label="排序方式"
              className="w-full px-2 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-[11px] font-medium text-[var(--text-secondary)] truncate"
            >
              <option value="frequency_desc">BNC 族总频次降序</option>
              <option value="coca_rank_asc">COCA 首词排名升序</option>
              <option value="band_asc">频段 1k→25k</option>
              <option value="members_desc">派生词数量</option>
              <option value="cet_desc">四六级词数</option>
              <option value="alpha_asc">首字母 A→Z</option>
            </select>
          </div>
        </div>

        <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
          <span className="truncate">词族目录 ({filteredFamilies.length.toLocaleString()})</span>
          <span className="shrink-0">BNC 族总频次</span>
        </div>

        <div
          ref={listRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          className="flex-1 overflow-y-auto relative min-h-0"
        >
          {filteredFamilies.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">未找到匹配的词族</div>
          ) : (
            <div style={{ height: totalHeight, position: 'relative' }}>
              {visibleFamilies.map((fam, idx) => {
                const actualIndex = startIndex + idx;
                const isSelected = activeFamily?.id === fam.id;
                const derivedPreview = fam.members
                  .filter((m) => !m.isHeadword)
                  .slice(0, 4)
                  .map((m) => m.word)
                  .join(' · ');

                return (
                  <button
                    key={fam.id}
                    type="button"
                    onClick={() => {
                      onSelectFamily(fam.id);
                      setMobileShowDetail(true);
                    }}
                    style={{
                      position: 'absolute',
                      top: actualIndex * ITEM_HEIGHT,
                      left: 0,
                      right: 0,
                      height: ITEM_HEIGHT,
                    }}
                    className={`w-full px-3 py-2 border-b border-[var(--border-subtle)] flex flex-col justify-center text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--accent-soft)]'
                        : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-1.5 w-full">
                      <div className="flex items-baseline gap-1.5 min-w-0">
                        <span
                          translate="no"
                          className={`font-serif-lexicon font-semibold text-[15px] truncate ${
                            isSelected
                              ? 'text-[var(--accent-primary)]'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {fam.headword}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] shrink-0">
                          {fam.band} · {fam.members.length}词
                          {fam.headwordCocaRank ? ` · C#${fam.headwordCocaRank}` : ''}
                        </span>
                      </div>
                      <span className="text-xs font-mono-tabular font-medium text-[var(--text-secondary)] shrink-0">
                        {fam.totalFrequency.toLocaleString()}
                      </span>
                    </div>
                    <div
                      translate="no"
                      className="text-[11px] text-[var(--text-muted)] truncate mt-0.5"
                    >
                      {derivedPreview || '仅词族首词，无曲折或派生词形'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Zone 2: Center Member Spectrum & Relation Graph */}
      {activeFamily ? (
        <div
          ref={centerPaneRef}
          className={`flex-1 flex flex-col min-w-0 h-full min-h-0 bg-[var(--bg-surface)] overflow-hidden ${
            mobileShowDetail ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* Family Header */}
          <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
            <div className="md:hidden mb-2">
              <button
                type="button"
                onClick={() => setMobileShowDetail(false)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                返回词族目录 ({filteredFamilies.length.toLocaleString()})
              </button>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-mono-tabular uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1">
                  BNC {activeFamily.band} 词族 · {activeFamily.members.length} 词形 · COCA 收录{' '}
                  {familyStats.cocaMembers} 词 · 四六级 {activeFamily.cetMemberCount} 词 · 已掌握{' '}
                  {familyStats.mastered}/{activeFamily.members.length}
                </div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h2
                    translate="no"
                    onClick={() => {
                      if (headwordItem) onSelectWord(headwordItem);
                    }}
                    className="text-2xl sm:text-3xl font-serif-lexicon font-bold text-[var(--text-primary)] tracking-tight cursor-pointer hover:text-[var(--accent-primary)] transition-colors"
                  >
                    {activeFamily.headword}
                  </h2>
                  <span className="text-xs font-mono-tabular text-[var(--text-secondary)]">
                    BNC 族总频次{' '}
                    <strong className="text-[var(--text-primary)] font-semibold">
                      {activeFamily.totalFrequency.toLocaleString()}
                    </strong>
                  </span>
                  {headwordItem?.inCoca && (
                    <span className="text-xs font-mono-tabular text-blue-600 dark:text-blue-400 font-semibold">
                      COCA 首词 #{headwordItem.cocaBestPosRank?.toLocaleString()} (合计频次{' '}
                      {headwordItem.cocaHeadwordTotalFreq?.toLocaleString()})
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* View Mode Toggle: Table vs Relation Graph */}
                <div className="inline-flex rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`px-2.5 py-1 rounded inline-flex items-center gap-1 cursor-pointer ${
                      viewMode === 'table'
                        ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] font-semibold shadow-2xs'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>成员频谱表</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('graph')}
                    className={`px-2.5 py-1 rounded inline-flex items-center gap-1 cursor-pointer ${
                      viewMode === 'graph'
                        ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] font-semibold shadow-2xs'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>关系图谱</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onBatchSetStatus(
                      activeFamily.members.map((m) => m.normalized),
                      'mastered'
                    )
                  }
                  className="px-2.5 py-1.5 bg-[var(--text-primary)] text-[var(--bg-surface)] rounded text-xs font-medium hover:opacity-90 cursor-pointer"
                >
                  全族标为掌握
                </button>
                {(() => {
                  const unratedCetIds = selectFamilyCetWordIdsForQueue(
                    activeFamily,
                    wordsMap,
                    userRecordsMap,
                    false
                  );
                  const allCetIds = selectFamilyCetWordIdsForQueue(
                    activeFamily,
                    wordsMap,
                    userRecordsMap,
                    true
                  );
                  const targetCetIds = overwriteCetStatus ? allCetIds : unratedCetIds;
                  const hasRatedCetMembers = allCetIds.length > unratedCetIds.length;

                  return (
                    <div className="inline-flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={targetCetIds.length === 0}
                        onClick={() => {
                          if (targetCetIds.length > 0) {
                            onBatchSetStatus(targetCetIds, 'queued');
                          }
                        }}
                        className="px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded text-xs font-medium hover:text-[var(--text-primary)] disabled:opacity-45 cursor-pointer"
                      >
                        大纲词标为待学 ({targetCetIds.length})
                      </button>
                      {hasRatedCetMembers && (
                        <label className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={overwriteCetStatus}
                            onChange={(e) => setOverwriteCetStatus(e.target.checked)}
                            className="rounded border-[var(--border-subtle)]"
                          />
                          <span>含已标注</span>
                        </label>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {viewMode === 'graph' ? (
            /* ================= RELATION GRAPH MODE ================= */
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-[var(--bg-canvas)]">
              <div className="p-4 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-[var(--text-primary)]">
                      {activeFamily.headword} 多源词汇关系网络图谱
                    </h3>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      实线节点表示原始语料显式记录（COCA 词元词性 / BNC 词族成员）；蓝色角标指示该派生词形在 COCA 2020 中同时拥有独立词头地位
                    </p>
                  </div>
                </div>

                {/* Interactive SVG Radial / Layered Relation Graph */}
                <div className="border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-canvas)] p-3 overflow-hidden">
                  <svg viewBox="0 0 720 340" className="w-full h-64 sm:h-72">
                    {/* Center Node: Family Headword */}
                    <g
                      onClick={() => headwordItem && onSelectWord(headwordItem)}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={360}
                        cy={170}
                        r={42}
                        fill="var(--accent-primary)"
                        opacity={0.14}
                        stroke="var(--accent-primary)"
                        strokeWidth={2}
                      />
                      <text
                        x={360}
                        y={166}
                        textAnchor="middle"
                        className="fill-[var(--text-primary)] font-serif-lexicon font-bold text-sm"
                      >
                        {activeFamily.headword}
                      </text>
                      <text
                        x={360}
                        y={184}
                        textAnchor="middle"
                        className="fill-[var(--text-secondary)] font-mono-tabular text-[10px]"
                      >
                        BNC {activeFamily.band}
                      </text>
                    </g>

                    {/* Left Branch: COCA PoS Lexemes of Headword */}
                    {(headwordItem?.cocaLexemes || []).map((lex, i, arr) => {
                      const y =
                        arr.length === 1
                          ? 170
                          : 55 + (i / Math.max(1, arr.length - 1)) * 230;
                      const x = 125;
                      return (
                        <g
                          key={lex.lexemeId}
                          onClick={() => headwordItem && onSelectWord(headwordItem)}
                          className="cursor-pointer"
                        >
                          <line
                            x1={318}
                            y1={170}
                            x2={x + 65}
                            y2={y}
                            stroke="var(--accent-primary)"
                            strokeWidth={1.5}
                          />
                          <rect
                            x={x - 65}
                            y={y - 16}
                            width={130}
                            height={32}
                            rx={6}
                            fill="var(--bg-surface)"
                            stroke="var(--border-strong)"
                          />
                          <text
                            x={x}
                            y={y - 2}
                            textAnchor="middle"
                            className="fill-[var(--text-primary)] font-mono-tabular font-semibold text-[10px]"
                          >
                            COCA {lex.pos} #{lex.rank}
                          </text>
                          <text
                            x={x}
                            y={y + 10}
                            textAnchor="middle"
                            className="fill-[var(--text-muted)] font-mono-tabular text-[9px]"
                          >
                            Freq {lex.frequency.toLocaleString()} ({Math.round(lex.sharePct)}%)
                          </text>
                        </g>
                      );
                    })}

                    {/* Right Branch: Top BNC Derived & Inflected Members */}
                    {activeFamily.members
                      .filter((m) => !m.isHeadword)
                      .slice(0, 8)
                      .map((m, i, arr) => {
                        const y =
                          arr.length === 1
                            ? 170
                            : 35 + (i / Math.max(1, arr.length - 1)) * 270;
                        const x = 590;
                        const mItem = wordsMap.get(m.normalized);
                        const hasOwnCoca = Boolean(mItem?.inCoca);
                        return (
                          <g
                            key={m.normalized}
                            onClick={() => mItem && onSelectWord(mItem)}
                            className="cursor-pointer"
                          >
                            <line
                              x1={402}
                              y1={170}
                              x2={x - 70}
                              y2={y}
                              stroke={hasOwnCoca ? '#2563eb' : 'var(--border-strong)'}
                              strokeWidth={1.5}
                              strokeDasharray={hasOwnCoca ? undefined : '4 3'}
                            />
                            <rect
                              x={x - 70}
                              y={y - 15}
                              width={140}
                              height={30}
                              rx={6}
                              fill="var(--bg-surface)"
                              stroke={hasOwnCoca ? '#2563eb' : 'var(--border-subtle)'}
                            />
                            <text
                              x={x}
                              y={y - 2}
                              textAnchor="middle"
                              className="fill-[var(--text-primary)] font-serif-lexicon font-semibold text-[11px]"
                            >
                              {m.word}
                            </text>
                            <text
                              x={x}
                              y={y + 10}
                              textAnchor="middle"
                              className="fill-[var(--text-muted)] font-mono-tabular text-[9px]"
                            >
                              BNC {m.frequency.toLocaleString()}
                              {hasOwnCoca ? ` · COCA #${mItem?.cocaBestPosRank}` : ' (屈折/派生)'}
                            </text>
                          </g>
                        );
                      })}
                  </svg>
                </div>

                {/* Member Classification Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-2">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      同时收录于 COCA 2020 的独立词元成员 ({familyStats.cocaMembers})
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      这些派生词或转化词在 COCA 中具有独立的词性频次记录（非简单屈折附庸）：
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {activeFamily.members
                        .filter((m) => wordsMap.get(m.normalized)?.inCoca)
                        .map((m) => {
                          const wObj = wordsMap.get(m.normalized)!;
                          return (
                            <button
                              key={m.normalized}
                              type="button"
                              translate="no"
                              onClick={() => onSelectWord(wObj)}
                              className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-blue-500/30 text-xs font-serif-lexicon inline-flex items-center gap-1 cursor-pointer hover:border-blue-500"
                            >
                              <span className="font-semibold text-[var(--text-primary)]">
                                {m.word}
                              </span>
                              <span className="text-[10px] font-mono-tabular text-blue-600 dark:text-blue-400">
                                #{wObj.cocaBestPosRank} (
                                {(wObj.cocaLexemes || []).map((l) => l.pos).join('/')})
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  <div className="p-3 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-2">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      仅在 BNC 词族中单列的屈折与低频派生词形 (
                      {activeFamily.members.length - familyStats.cocaMembers})
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      COCA 将规则屈折（复数、过去式、第三人称单数）归入词元统计，BNC 则保留其独立词形频次：
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {activeFamily.members
                        .filter((m) => !wordsMap.get(m.normalized)?.inCoca)
                        .map((m) => {
                          const wObj = wordsMap.get(m.normalized);
                          return (
                            <button
                              key={m.normalized}
                              type="button"
                              translate="no"
                              onClick={() => wObj && onSelectWord(wObj)}
                              className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-serif-lexicon inline-flex items-center gap-1 cursor-pointer hover:border-[var(--accent-primary)]"
                            >
                              <span className="text-[var(--text-primary)]">{m.word}</span>
                              <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                                BNC {m.frequency.toLocaleString()}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ================= TABLE SPECTRUM MODE ================= */
            <>
              {/* Member Filter & Sort Strip */}
              <div className="min-h-[40px] py-1.5 px-4 sm:px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1 flex-wrap">
                  {[
                    { id: 'all', label: `全部 (${activeFamily.members.length})` },
                    { id: 'coca', label: `COCA 词元 (${familyStats.cocaMembers})` },
                    { id: 'cet', label: `四六级 (${activeFamily.cetMemberCount})` },
                    {
                      id: 'unmastered',
                      label: `未掌握 (${activeFamily.members.length - familyStats.mastered})`,
                    },
                    { id: 'mastered', label: `已掌握 (${familyStats.mastered})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMemberFilter(tab.id as MemberFilter)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        memberFilter === tab.id
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs border border-[var(--border-subtle)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <select
                  value={memberSort}
                  onChange={(e) => setMemberSort(e.target.value as MemberSort)}
                  aria-label="成员排序方式"
                  className="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)]"
                >
                  <option value="bnc_freq_desc">按 BNC 词形频次降序</option>
                  <option value="coca_freq_desc">按 COCA 词元频次降序</option>
                  <option value="status_asc">按学习状态排序</option>
                  <option value="alpha_asc">按字母 A→Z</option>
                </select>
              </div>

              {/* Column Headers */}
              {centerWidth >= 580 ? (
                <div className="grid grid-cols-[minmax(125px,1.25fr)_110px_58px_minmax(100px,1fr)_82px_94px] items-center px-4 sm:px-5 h-8 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
                  <div>词形与角色</div>
                  <div>COCA 词元与词性</div>
                  <div>大纲</div>
                  <div>BNC 族内占比</div>
                  <div className="text-right pr-2">BNC 频次</div>
                  <div className="text-right">状态与词典</div>
                </div>
              ) : (
                <div className="flex items-center justify-between px-3.5 h-8 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
                  <span>词形 · COCA · 族内占比</span>
                  <span>BNC 频次 · 状态</span>
                </div>
              )}

              {/* Member Rows */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-[var(--border-subtle)] min-h-0">
                {activeMembers.map((member) => {
                  const entry = wordsMap.get(member.normalized);
                  const status = userRecordsMap.get(member.normalized)?.status || 'unrated';
                  const statusMeta = LEARNING_STATUS_META[status];
                  const shareDetail = getIntraFamilyShareDetail(
                    member.frequency,
                    activeFamily.totalFrequency
                  );
                  const isHighlighted = highlightedWordId === member.normalized;

                  if (centerWidth < 580) {
                    return (
                      <div
                        key={member.normalized}
                        onClick={() => entry && onSelectWord(entry)}
                        className={`px-3.5 py-2.5 cursor-pointer transition-colors space-y-1.5 ${
                          isHighlighted ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="min-w-0 flex items-baseline gap-1.5">
                            <span
                              translate="no"
                              className={`text-sm truncate ${
                                member.isHeadword
                                  ? 'font-serif-lexicon font-bold text-[var(--text-primary)]'
                                  : 'font-medium text-[var(--text-secondary)]'
                              }`}
                            >
                              {member.word}
                            </span>
                            {entry?.inCoca && (
                              <span className="text-[10px] font-mono-tabular text-blue-600 dark:text-blue-400 font-semibold shrink-0">
                                COCA #{entry.cocaBestPosRank}
                              </span>
                            )}
                          </div>
                          <div
                            className="flex items-center gap-1.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="font-mono-tabular text-xs text-[var(--text-secondary)]">
                              {member.frequency.toLocaleString()}
                            </span>
                            <select
                              aria-label={`${member.word} 学习状态`}
                              value={status}
                              onChange={(e) =>
                                onStatusChange(
                                  member.normalized,
                                  member.word,
                                  e.target.value as LearningStatus
                                )
                              }
                              className={`appearance-none text-center px-1.5 py-0.5 rounded text-[11px] font-medium border cursor-pointer ${statusMeta.badgeClass}`}
                            >
                              {ALL_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {LEARNING_STATUS_META[st].shortLabel}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={member.normalized}
                      onClick={() => entry && onSelectWord(entry)}
                      className={`grid grid-cols-[minmax(125px,1.25fr)_110px_58px_minmax(100px,1fr)_82px_94px] items-center px-4 sm:px-5 py-2.5 cursor-pointer transition-colors ${
                        isHighlighted
                          ? 'bg-[var(--accent-soft)]'
                          : 'hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <div className="min-w-0 pr-2 flex items-baseline gap-1.5">
                        <span
                          translate="no"
                          className={`text-sm truncate ${
                            member.isHeadword
                              ? 'font-serif-lexicon font-bold text-[var(--text-primary)]'
                              : 'font-medium text-[var(--text-secondary)]'
                          }`}
                        >
                          {member.word}
                        </span>
                        <span className="text-[10px] font-mono-tabular text-[var(--text-muted)] shrink-0">
                          {member.isHeadword ? '首词' : '成员'}
                        </span>
                      </div>

                      {/* COCA Rank & Primary PoS */}
                      <div className="font-mono-tabular text-[11px] pr-2 truncate">
                        {entry?.inCoca ? (
                          <div className="flex items-center gap-1">
                            <span className="text-blue-600 dark:text-blue-400 font-semibold">
                              #{entry.cocaBestPosRank}
                            </span>
                            {entry.cocaPrimaryPos && (
                              <span
                                className={`px-1 py-0.2 rounded text-[9px] font-semibold ${
                                  COCA_POS_META[entry.cocaPrimaryPos]?.badgeClass ||
                                  'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                                }`}
                              >
                                {COCA_POS_META[entry.cocaPrimaryPos]?.shortLabel.split(' ')[0]}
                                {(entry.cocaPosCount || 0) > 1 ? `+${(entry.cocaPosCount || 1) - 1}` : ''}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">屈折/未单列</span>
                        )}
                      </div>

                      {/* CET */}
                      <div className="text-[10px] font-mono-tabular whitespace-nowrap">
                        {entry?.isCet4 && (
                          <span className="px-1 py-0.2 rounded bg-teal-500/12 text-teal-700 dark:text-teal-300 font-semibold">
                            CET-4
                          </span>
                        )}
                        {!entry?.isCet4 && entry?.isCet6 && (
                          <span className="px-1 py-0.2 rounded bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 font-semibold">
                            CET-6
                          </span>
                        )}
                        {!entry?.isCet4 && !entry?.isCet6 && (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </div>

                      {/* Intra-family proportion bar */}
                      <div className="flex items-center gap-2 pr-3">
                        <div className="flex-1 h-1.5 bg-[var(--bg-subtle)] rounded-xs overflow-hidden">
                          <div
                            className={`h-full bg-[var(--accent-primary)] transition-all ${
                              shareDetail.isUltraLowNonZero ? 'min-w-[2px]' : ''
                            }`}
                            style={{
                              width: `${shareDetail.exactPct !== null ? shareDetail.exactPct : 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] w-8 text-right">
                          {shareDetail.label}
                        </span>
                      </div>

                      {/* BNC Frequency */}
                      <div className="text-right pr-2 font-mono-tabular text-xs text-[var(--text-secondary)] whitespace-nowrap">
                        {member.frequency.toLocaleString()}
                      </div>

                      {/* Interactive Status & Dictionary Link */}
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          aria-label={`${member.word} 学习状态`}
                          value={status}
                          onChange={(e) =>
                            onStatusChange(
                              member.normalized,
                              member.word,
                              e.target.value as LearningStatus
                            )
                          }
                          className={`appearance-none text-center px-1.5 py-0.5 rounded text-[11px] font-medium border cursor-pointer transition-colors ${statusMeta.badgeClass}`}
                        >
                          {ALL_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {LEARNING_STATUS_META[st].shortLabel}
                            </option>
                          ))}
                        </select>
                        {defaultDict && (
                          <a
                            href={buildDictionaryUrl(defaultDict.urlTemplate, member.word)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`在 ${defaultDict.name} 中查询 ${member.word}`}
                            className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-primary)] rounded transition-colors shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)]">
          请从左侧选择一个词族
        </div>
      )}

      {/* Zone 3: Right Family Structure & Syllabus Panel (2xl+ 290px) */}
      {activeFamily && (
        <aside className="hidden 2xl:flex 2xl:w-[290px] border-l border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex-col shrink-0 h-full overflow-y-auto divide-y divide-[var(--border-subtle)]">
          <div className="p-4 space-y-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              词族掌握与多源覆盖
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
                <div className="text-[11px] text-[var(--text-secondary)]">词形掌握进度</div>
                <div className="text-lg font-mono-tabular font-bold text-[var(--text-primary)] mt-0.5">
                  {familyStats.mastered}{' '}
                  <span className="text-xs font-normal text-[var(--text-muted)]">
                    / {activeFamily.members.length}
                  </span>
                </div>
              </div>
              <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
                <div className="text-[11px] text-[var(--text-secondary)]">BNC 词频加权覆盖</div>
                <div className="text-lg font-mono-tabular font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {familyStats.freqPct}%
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                族内高频核心词形
              </h3>
              <span className="text-[11px] font-mono-tabular text-[var(--text-secondary)]">
                Top 3 占 {familyStats.top3Pct}%
              </span>
            </div>
            <div className="space-y-1.5">
              {[...activeFamily.members]
                .sort((a, b) => b.frequency - a.frequency)
                .slice(0, 5)
                .map((m) => {
                  const pct =
                    activeFamily.totalFrequency > 0
                      ? Math.round((m.frequency / activeFamily.totalFrequency) * 100)
                      : 0;
                  return (
                    <button
                      key={m.normalized}
                      type="button"
                      onClick={() => {
                        const entry = wordsMap.get(m.normalized);
                        if (entry) onSelectWord(entry);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs hover:border-[var(--border-strong)] transition-colors cursor-pointer"
                    >
                      <span
                        translate="no"
                        className="font-serif-lexicon font-medium text-[var(--text-primary)] truncate"
                      >
                        {m.word}
                      </span>
                      <span className="font-mono-tabular text-[11px] text-[var(--text-secondary)]">
                        {m.frequency.toLocaleString()} ({pct}%)
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="p-4 space-y-2.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              四六级考纲同组词与派生簇 ({familyStats.cetRefs.length})
            </h3>
            {familyStats.cetRefs.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                该词族下暂无收录于大学英语四六级大纲的词形。
              </p>
            ) : (
              <div className="space-y-2">
                {familyStats.cetRefs.map((ref, i) => {
                  const rawWords = ref.rawLine
                    .split('\t')
                    .map((s) =>
                      s
                        .trim()
                        .replace(/^★/, '')
                        .replace(/[¹²³⁴⁵]/g, '')
                        .trim()
                    )
                    .filter(Boolean);
                  const mainWord = rawWords[0] || '';
                  const siblingWords = rawWords.slice(1);
                  return (
                    <div
                      key={i}
                      className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          translate="no"
                          onClick={() => {
                            const w = wordsMap.get(mainWord.toLowerCase());
                            if (w) onSelectWord(w);
                          }}
                          className="font-serif-lexicon font-bold text-xs text-[var(--text-primary)] hover:text-[var(--accent-primary)] cursor-pointer"
                        >
                          {mainWord}
                        </button>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-semibold ${
                            ref.level === 'CET6'
                              ? 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300'
                              : 'bg-teal-500/12 text-teal-700 dark:text-teal-300'
                          }`}
                        >
                          {ref.level === 'CET6' ? 'CET-6 六级核心' : 'CET-4 四级核心'}
                        </span>
                      </div>
                      {siblingWords.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-[var(--border-subtle)]">
                          <span className="text-[10px] text-[var(--text-muted)] mr-0.5">
                            同组派生:
                          </span>
                          {siblingWords.map((token, idx) => (
                            <button
                              key={idx}
                              type="button"
                              translate="no"
                              onClick={() => {
                                const w = wordsMap.get(token.toLowerCase());
                                if (w) onSelectWord(w);
                              }}
                              className="px-1.5 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-[11px] font-serif-lexicon font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary)] cursor-pointer"
                            >
                              {token}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};
