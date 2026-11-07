import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BncCocaFamily,
  LexiconWordItem,
  UserWordRecord,
  LearningStatus,
  LEARNING_STATUS_META,
  DictionaryTemplate,
} from '../data/types.ts';
import { buildDictionaryUrl } from '../data/searchAndFilter.ts';
import {
  Search,
  ExternalLink,
  X,
  ArrowLeft,
  ArrowUpDown,
  ChevronRight,
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

type FamilySortBy = 'frequency_desc' | 'band_asc' | 'members_desc' | 'alpha_asc' | 'cet_desc';
type MemberFilter = 'all' | 'cet' | 'unmastered' | 'mastered';

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
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('all');
  const [memberSort, setMemberSort] = useState<'freq_desc' | 'alpha_asc'>('freq_desc');
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

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
    if (listRef.current) {
      listRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [searchQuery, selectedBand, sortBy]);

  const ITEM_HEIGHT = 64;
  const totalHeight = filteredFamilies.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 6);
  const endIndex = Math.min(filteredFamilies.length, startIndex + 26);
  const visibleFamilies = filteredFamilies.slice(startIndex, endIndex);

  const activeMembers = useMemo(() => {
    if (!activeFamily) return [];
    const list = activeFamily.members.filter((m) => {
      const entry = wordsMap.get(m.normalized);
      const status = userRecordsMap.get(m.normalized)?.status || 'unrated';
      if (memberFilter === 'cet') return entry?.isCet4 || entry?.isCet6;
      if (memberFilter === 'unmastered') return status !== 'mastered';
      if (memberFilter === 'mastered') return status === 'mastered';
      return true;
    });

    list.sort((a, b) => {
      if (memberSort === 'freq_desc') {
        if (a.isHeadword !== b.isHeadword) return a.isHeadword ? -1 : 1;
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
        cetRefs: [] as { lineNumber: number; level: string; rawLine: string }[],
      };
    }
    let mastered = 0;
    let learning = 0;
    let queued = 0;
    let masteredFreq = 0;
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
      cetRefs: Array.from(cetRefMap.values()),
    };
  }, [activeFamily, userRecordsMap, wordsMap]);

  const defaultDict = useMemo(
    () => dictionaries.find((d) => d.enabled) || dictionaries[0],
    [dictionaries]
  );

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 bg-[var(--bg-surface)] overflow-hidden">
      {/* Zone 1: Left Family Directory (250px-310px) */}
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
              className="w-full pl-8 pr-7 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
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
              className="w-full px-2 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-[11px] font-medium text-[var(--text-secondary)] focus:outline-none truncate"
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
              className="w-full px-2 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-[11px] font-medium text-[var(--text-secondary)] focus:outline-none truncate"
            >
              <option value="frequency_desc">族总频次降序</option>
              <option value="band_asc">频段 1k→25k</option>
              <option value="members_desc">派生词数量</option>
              <option value="cet_desc">四六级词数</option>
              <option value="alpha_asc">首字母 A→Z</option>
            </select>
          </div>
        </div>

        {/* Column Header */}
        <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
          <span className="truncate">词族目录 ({filteredFamilies.length.toLocaleString()})</span>
          <span className="shrink-0">族总频次</span>
        </div>

        {/* Virtualized Family List */}
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
                          {fam.cetMemberCount > 0 ? ` · CET×${fam.cetMemberCount}` : ''}
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

      {/* Zone 2: Center Member Frequency Spectrum */}
      {activeFamily ? (
        <div
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
                  BNC/COCA {activeFamily.band} 词族 · 共 {activeFamily.members.length} 词形 · 四六级{' '}
                  {activeFamily.cetMemberCount} 词 · 已掌握 {familyStats.mastered}/
                  {activeFamily.members.length}
                </div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h2
                    translate="no"
                    onClick={() => {
                      const hw = wordsMap.get(activeFamily.normalizedHeadword);
                      if (hw) onSelectWord(hw);
                    }}
                    className="text-2xl sm:text-3xl font-serif-lexicon font-bold text-[var(--text-primary)] tracking-tight cursor-pointer hover:text-[var(--accent-primary)] transition-colors"
                  >
                    {activeFamily.headword}
                  </h2>
                  <span className="text-xs font-mono-tabular text-[var(--text-secondary)] whitespace-nowrap">
                    词族总频次{' '}
                    <strong className="text-[var(--text-primary)] font-semibold">
                      {activeFamily.totalFrequency.toLocaleString()}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onBatchSetStatus(
                      activeFamily.members.map((m) => m.normalized),
                      'mastered'
                    )
                  }
                  className="px-2.5 py-1.5 bg-[var(--text-primary)] text-[var(--bg-surface)] rounded text-xs font-medium hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
                >
                  全族标为掌握
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cetKeys = activeFamily.members
                      .filter((m) => {
                        const e = wordsMap.get(m.normalized);
                        return e?.isCet4 || e?.isCet6;
                      })
                      .map((m) => m.normalized);
                    if (cetKeys.length > 0) {
                      onBatchSetStatus(cetKeys, 'queued');
                    }
                  }}
                  className="px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded text-xs font-medium hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  大纲词标为待学
                </button>
              </div>
            </div>
          </div>

          {/* Member Filter & Sort Strip */}
          <div className="min-h-[40px] py-1.5 px-4 sm:px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { id: 'all', label: `全部 (${activeFamily.members.length})` },
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

            <button
              type="button"
              onClick={() =>
                setMemberSort((s) => (s === 'freq_desc' ? 'alpha_asc' : 'freq_desc'))
              }
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowUpDown className="w-3 h-3" />
              {memberSort === 'freq_desc' ? '按频次降序' : '按字母排序'}
            </button>
          </div>

          {/* Column Headers */}
          <div className="grid grid-cols-[minmax(100px,1.4fr)_56px_74px_86px] lg:grid-cols-[minmax(125px,1.4fr)_64px_minmax(90px,1fr)_84px_92px] items-center px-4 sm:px-5 h-8 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
            <div>词形与角色</div>
            <div>大纲</div>
            <div className="hidden lg:block">族内频次占比</div>
            <div className="text-right pr-2">独立频次</div>
            <div className="text-right">状态与词典</div>
          </div>

          {/* Member Rows + Medium/Narrow Inline Syllabus & Mastery Deck */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
            {activeMembers.map((member) => {
              const entry = wordsMap.get(member.normalized);
              const status = userRecordsMap.get(member.normalized)?.status || 'unrated';
              const statusMeta = LEARNING_STATUS_META[status];
              const pct =
                activeFamily.totalFrequency > 0
                  ? Math.round((member.frequency / activeFamily.totalFrequency) * 100)
                  : 0;
              const isHighlighted = highlightedWordId === member.normalized;

              return (
                <div
                  key={member.normalized}
                  onClick={() => {
                    if (entry) onSelectWord(entry);
                  }}
                  className={`grid grid-cols-[minmax(100px,1.4fr)_56px_74px_86px] lg:grid-cols-[minmax(125px,1.4fr)_64px_minmax(90px,1fr)_84px_92px] items-center px-4 sm:px-5 py-2.5 cursor-pointer transition-colors ${
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
                      {member.isHeadword ? '首词' : '派生'}
                    </span>
                  </div>

                  {/* Unboxed CET */}
                  <div className="text-xs font-mono-tabular whitespace-nowrap">
                    {entry?.isCet4 && (
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        CET-4
                      </span>
                    )}
                    {entry?.isCet6 && (
                      <span className="text-indigo-700 dark:text-indigo-400 font-semibold">
                        CET-6
                      </span>
                    )}
                    {!entry?.isCet4 && !entry?.isCet6 && (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </div>

                  {/* Intra-family proportion bar (lg+) */}
                  <div className="hidden lg:flex items-center gap-2 pr-3">
                    <div className="flex-1 h-1.5 bg-[var(--bg-subtle)] rounded-xs overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent-primary)] transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] w-8 text-right">
                      {pct}%
                    </span>
                  </div>

                  {/* Frequency */}
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
                        href={buildDictionaryUrl(member.word, defaultDict.urlTemplate)}
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

            {/* Inline Syllabus & Mastery Summary on <1280px (xl:hidden) so nothing is hidden on medium/narrow viewports */}
            <div className="xl:hidden p-4 sm:p-5 bg-[var(--bg-canvas)] space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                    <span>词形掌握与频次加权覆盖</span>
                    <span className="font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-400">
                      {familyStats.freqPct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 bg-[var(--bg-subtle)] rounded-xs overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${familyStats.freqPct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    <span>
                      词形 {familyStats.mastered}/{activeFamily.members.length}
                    </span>
                    <span>
                      频次 {familyStats.masteredFreq.toLocaleString()}/
                      {activeFamily.totalFrequency.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                    <span>CET-4 / CET-6 官方大纲溯源</span>
                    <span className="font-mono-tabular text-[var(--text-muted)]">
                      {familyStats.cetRefs.length} 条记录
                    </span>
                  </div>
                  {familyStats.cetRefs.length === 0 ? (
                    <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                      该词族下暂无收录于 2016 版四六级大纲的词形。
                    </div>
                  ) : (
                    <div className="mt-1.5 space-y-1">
                      {familyStats.cetRefs.map((ref, i) => {
                        const rawWords = ref.rawLine
                          .split('\t')
                          .map((s) => s.trim().replace(/^★/, ''))
                          .filter(Boolean);
                        return (
                          <div
                            key={i}
                            className="flex flex-wrap items-center gap-1 text-xs font-serif-lexicon"
                          >
                            <span className="text-[10px] font-mono-tabular text-[var(--text-muted)] mr-1">
                              [{ref.level === 'CET6' ? 'CET-6' : 'CET-4'} #{ref.lineNumber}]
                            </span>
                            {rawWords.map((token, idx) => {
                              const clean = token
                                .replace(/^★/, '')
                                .replace(/[¹²³⁴⁵]/g, '')
                                .trim();
                              return (
                                <React.Fragment key={idx}>
                                  {idx > 0 && (
                                    <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
                                  )}
                                  <button
                                    type="button"
                                    translate="no"
                                    onClick={() => {
                                      const w = wordsMap.get(clean.toLowerCase());
                                      if (w) onSelectWord(w);
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-[var(--bg-canvas)] hover:text-[var(--accent-primary)] font-medium text-[var(--text-primary)] cursor-pointer"
                                  >
                                    {token}
                                  </button>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)]">
          请从左侧选择一个词族
        </div>
      )}

      {/* Zone 3: Right Family Structure & Syllabus Panel (xl+ 310px) */}
      {activeFamily && (
        <aside className="hidden xl:flex xl:w-[310px] border-l border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex-col shrink-0 h-full overflow-y-auto divide-y divide-[var(--border-subtle)]">
          {/* 1. Family Mastery & Coverage */}
          <div className="p-4 space-y-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              词族掌握与频次覆盖
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
                <div className="text-[11px] text-[var(--text-secondary)]">词频加权覆盖率</div>
                <div className="text-lg font-mono-tabular font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {familyStats.freqPct}%
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <span>已掌握词形占全族频次比</span>
                <span className="font-mono-tabular">
                  {familyStats.masteredFreq.toLocaleString()} /{' '}
                  {activeFamily.totalFrequency.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 bg-[var(--bg-subtle)] rounded-xs overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${familyStats.freqPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* 2. Intra-Family Frequency Concentration */}
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                族内核心词形集中度
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

          {/* 3. CET2016 Official Syllabus Lines */}
          <div className="p-4 space-y-2.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              CET-4 / CET-6 官方大纲溯源 ({familyStats.cetRefs.length})
            </h3>
            {familyStats.cetRefs.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                该词族下暂无收录于 2016 版大学英语四六级大纲的词形。
              </p>
            ) : (
              <div className="space-y-2">
                {familyStats.cetRefs.map((ref, i) => {
                  const rawWords = ref.rawLine
                    .split('\t')
                    .map((s) => s.trim().replace(/^★/, ''))
                    .filter(Boolean);
                  return (
                    <div
                      key={i}
                      className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)]">
                        <span>大纲行号 #{ref.lineNumber}</span>
                        <span className="font-semibold text-[var(--text-secondary)]">
                          {ref.level === 'CET6' ? 'CET-6' : 'CET-4'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 text-xs font-serif-lexicon">
                        {rawWords.map((token, idx) => {
                          const clean = token
                            .replace(/^★/, '')
                            .replace(/[¹²³⁴⁵]/g, '')
                            .trim();
                          return (
                            <React.Fragment key={idx}>
                              {idx > 0 && (
                                <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
                              )}
                              <button
                                type="button"
                                translate="no"
                                onClick={() => {
                                  const w = wordsMap.get(clean.toLowerCase());
                                  if (w) onSelectWord(w);
                                }}
                                className="px-1.5 py-0.5 rounded bg-[var(--bg-canvas)] hover:text-[var(--accent-primary)] font-medium text-[var(--text-primary)] transition-colors cursor-pointer"
                              >
                                {token}
                              </button>
                            </React.Fragment>
                          );
                        })}
                      </div>
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
