import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Layers,
  GitCompare,
  Sparkles,
  ArrowUpRight,
  BookmarkPlus,
  Download,
  Search,
  Filter,
} from 'lucide-react';
import {
  BncCocaFamily,
  COCA_POS_META,
  CocaLexemeRecord,
  CocaRawPos,
  DataDiagnosticsReport,
  FilterCriteria,
  LexiconWordItem,
  ThreeSourceVennSummary,
  UserWordRecord,
  WordCollection,
} from '../data/types.ts';
import {
  compareCorpusWordSets,
  CORPUS_COMPARISON_PRESETS,
  CorpusComparisonPresetId,
  DEFAULT_FILTER_CRITERIA,
  resolvePresetWordSet,
} from '../data/searchAndFilter.ts';

interface CorpusLabViewProps {
  words: LexiconWordItem[];
  wordsMap: Map<string, LexiconWordItem>;
  cocaLexemes: CocaLexemeRecord[];
  diagnostics: DataDiagnosticsReport;
  vennSummary: ThreeSourceVennSummary;
  families: BncCocaFamily[];
  userRecordsMap: Map<string, UserWordRecord>;
  collections: WordCollection[];
  onSelectWord: (word: LexiconWordItem) => void;
  onJumpToExploreWithFilter: (criteria: FilterCriteria) => void;
  onCreateCollection: (col: Omit<WordCollection, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onExportWordList: (
    list: LexiconWordItem[],
    filenamePrefix: string,
    format: 'txt' | 'csv'
  ) => void;
}

type LabTab =
  | 'coca_ranking'
  | 'freq_distribution'
  | 'pos_analytics'
  | 'cross_corpus'
  | 'set_comparator';

const RANK_TIERS = [
  { id: 'all', label: '全部 1–60,000', min: 1, max: 60000 },
  { id: '1k', label: 'Top 1,000', min: 1, max: 1000 },
  { id: '3k', label: '1,001–3,000', min: 1001, max: 3000 },
  { id: '5k', label: '3,001–5,000', min: 3001, max: 5000 },
  { id: '10k', label: '5,001–10,000', min: 5001, max: 10000 },
  { id: '20k', label: '10,001–20,000', min: 10001, max: 20000 },
  { id: '30k', label: '20,001–30,000', min: 20001, max: 30000 },
  { id: '60k', label: '30,001–60,000', min: 30001, max: 60000 },
];

const PRESET_SET_OPTIONS = [
  { id: 'cet4', label: 'CET-4 四级考纲词集' },
  { id: 'cet6_new', label: 'CET-6 六级新增考纲词集' },
  { id: 'cet_all', label: 'CET-4/6 全部考纲词形 (8,014)' },
  { id: 'coca_top_1k', label: 'COCA Top 1,000 词元词头' },
  { id: 'coca_top_3k', label: 'COCA Top 3,000 词元词头' },
  { id: 'coca_top_5k', label: 'COCA Top 5,000 词元词头' },
  { id: 'coca_top_10k', label: 'COCA Top 10,000 词元词头' },
  { id: 'bnc_1k_2k', label: 'BNC/COCA 1k–2k 基础词族' },
  { id: 'bnc_1k_3k', label: 'BNC/COCA 1k–3k 核心词族' },
  { id: 'bnc_1k_5k', label: 'BNC/COCA 1k–5k 进阶词族' },
  { id: 'user_mastered', label: '个人已掌握词汇 (Mastered)' },
  { id: 'user_learning_queued', label: '个人在学与待学队列' },
];

export const CorpusLabView: React.FC<CorpusLabViewProps> = ({
  words,
  wordsMap,
  cocaLexemes,
  diagnostics,
  vennSummary,
  userRecordsMap,
  collections,
  onSelectWord,
  onJumpToExploreWithFilter,
  onCreateCollection,
  onExportWordList,
}) => {
  const cocaStats = useMemo(() => {
    const totalLexemeRecords = diagnostics.cocaLexemeRecordCount || cocaLexemes.length || 60000;
    const distinctHeadwords = diagnostics.cocaHeadwordCount || 53951;
    const totalFrequency = diagnostics.cocaTotalTokenFrequency || 892945569;
    const multiPosHeadwords = diagnostics.cocaMultiPosHeadwordCount || 5627;
    const hyphenatedHeadwords = diagnostics.cocaHyphenatedHeadwordCount || 9811;
    const distObj = diagnostics.cocaPosDistribution || {};
    const posDistribution = Object.entries(distObj)
      .map(([pos, info]) => ({
        pos: pos as CocaRawPos,
        count: info.count,
        totalFrequency: info.totalFreq,
        shareOfRecordsPct: Number(((info.count / totalLexemeRecords) * 100).toFixed(2)),
        shareOfFreqPct: Number(((info.totalFreq / totalFrequency) * 100).toFixed(2)),
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalLexemeRecords,
      distinctHeadwords,
      totalFrequency,
      multiPosHeadwords,
      hyphenatedHeadwords,
      posDistribution,
    };
  }, [diagnostics, cocaLexemes]);
  const [activeTab, setActiveTab] = useState<LabTab>('coca_ranking');

  // Sub-tab 1: COCA Ranking Explorer state
  const [rankingMode, setRankingMode] = useState<'lemma_pos' | 'derived_headword'>('lemma_pos');
  const [selectedTierId, setSelectedTierId] = useState<string>('all');
  const [selectedPos, setSelectedPos] = useState<CocaRawPos | 'ALL'>('ALL');
  const [rankSearch, setRankSearch] = useState<string>('');
  const [rankPage, setRankPage] = useState<number>(1);

  // Sub-tab 2: Frequency Distribution state
  const [curveScale, setCurveScale] = useState<'log_log' | 'cumulative'>('cumulative');

  // Sub-tab 3: Multi-PoS Analytics state
  const [minPosCount, setMinPosCount] = useState<number>(2);
  const [posSortBy, setPosSortBy] = useState<'entropy_desc' | 'pos_count_desc' | 'freq_desc'>(
    'pos_count_desc'
  );
  const [posQuery, setPosQuery] = useState<string>('');

  // Sub-tab 4: Cross-Corpus Matrix state
  const [selectedMatrixCell, setSelectedMatrixCell] = useState<{
    bncLabel: string;
    cocaLabel: string;
    bncBands: number[];
    cocaMin: number | null;
    cocaMax: number | null;
    onlyNoCoca?: boolean;
  } | null>(null);

  // Sub-tab 5: Set Comparator state
  const [setAId, setSetAId] = useState<string>('cet4');
  const [setBId, setSetBId] = useState<string>('coca_top_5k');
  const [diffBucket, setDiffBucket] = useState<'intersection' | 'onlyA' | 'onlyB'>('onlyA');
  const [savedToast, setSavedToast] = useState<string | null>(null);

  // ================= 1. COCA RANKING EXPLORER DATA =================
  const activeTier = useMemo(
    () => RANK_TIERS.find((t) => t.id === selectedTierId) || RANK_TIERS[0],
    [selectedTierId]
  );

  const filteredRankingLexemes = useMemo(() => {
    if (rankingMode !== 'lemma_pos') return [];
    const q = rankSearch.trim().toLowerCase();
    return cocaLexemes.filter((lex) => {
      if (lex.rank < activeTier.min || lex.rank > activeTier.max) return false;
      if (selectedPos !== 'ALL' && lex.pos !== selectedPos) return false;
      if (q && !lex.normalizedHeadword.includes(q)) return false;
      return true;
    });
  }, [rankingMode, cocaLexemes, activeTier, selectedPos, rankSearch]);

  const filteredRankingHeadwords = useMemo(() => {
    if (rankingMode !== 'derived_headword') return [];
    const q = rankSearch.trim().toLowerCase();
    return words
      .filter((w) => {
        if (!w.inCoca || w.cocaHeadwordDerivedRank === null || w.cocaHeadwordDerivedRank === undefined) return false;
        if (w.cocaHeadwordDerivedRank < activeTier.min || w.cocaHeadwordDerivedRank > activeTier.max)
          return false;
        if (selectedPos !== 'ALL' && !(w.cocaLexemes || []).some((l) => l.pos === selectedPos))
          return false;
        if (q && !w.normalized.includes(q)) return false;
        return true;
      })
      .sort((a, b) => (a.cocaHeadwordDerivedRank ?? 999999) - (b.cocaHeadwordDerivedRank ?? 999999));
  }, [rankingMode, words, activeTier, selectedPos, rankSearch]);

  const PAGE_SIZE = 80;
  const totalRankItems =
    rankingMode === 'lemma_pos'
      ? filteredRankingLexemes.length
      : filteredRankingHeadwords.length;
  const totalRankPages = Math.max(1, Math.ceil(totalRankItems / PAGE_SIZE));
  const safeRankPage = Math.min(rankPage, totalRankPages);

  // ================= 2. FREQUENCY DISTRIBUTION DATA =================
  const tierDistributionStats = useMemo(() => {
    const brackets = [
      { label: 'Top 1,000', min: 1, max: 1000 },
      { label: '1,001–3,000', min: 1001, max: 3000 },
      { label: '3,001–5,000', min: 3001, max: 5000 },
      { label: '5,001–10,000', min: 5001, max: 10000 },
      { label: '10,001–20,000', min: 10001, max: 20000 },
      { label: '20,001–30,000', min: 20001, max: 30000 },
      { label: '30,001–60,000', min: 30001, max: 60000 },
    ];
    const totalFreq = cocaStats.totalFrequency || 892945569;
    let runningFreq = 0;

    return brackets.map((b) => {
      let tierFreq = 0;
      let nounCnt = 0;
      let verbCnt = 0;
      let adjCnt = 0;
      let advCnt = 0;
      let closedCnt = 0;

      for (let i = b.min - 1; i < Math.min(b.max, cocaLexemes.length); i++) {
        const lex = cocaLexemes[i];
        if (!lex) continue;
        tierFreq += lex.frequency;
        if (lex.pos === 'noun') nounCnt++;
        else if (lex.pos === 'verb') verbCnt++;
        else if (lex.pos === 'adjective') adjCnt++;
        else if (lex.pos === 'adverb') advCnt++;
        else closedCnt++;
      }

      runningFreq += tierFreq;
      const count = b.max - b.min + 1;
      return {
        ...b,
        count,
        tierFreq,
        sharePct: Number(((tierFreq / totalFreq) * 100).toFixed(2)),
        cumulativePct: Number(((runningFreq / totalFreq) * 100).toFixed(2)),
        nounPct: Math.round((nounCnt / count) * 100),
        verbPct: Math.round((verbCnt / count) * 100),
        adjPct: Math.round((adjCnt / count) * 100),
        advPct: Math.round((advCnt / count) * 100),
        closedPct: Math.round((closedCnt / count) * 100),
      };
    });
  }, [cocaLexemes, cocaStats.totalFrequency]);

  // ================= 3. PART-OF-SPEECH & MULTI-POS ENTROPY DATA =================
  const multiPosHeadwords = useMemo(() => {
    const q = posQuery.trim().toLowerCase();
    const list = words.filter((w) => {
      if (!w.inCoca || (w.cocaPosCount || 0) < minPosCount) return false;
      if (q && !w.normalized.includes(q)) return false;
      return true;
    });

    list.sort((a, b) => {
      if (posSortBy === 'pos_count_desc') {
        if ((b.cocaPosCount || 0) !== (a.cocaPosCount || 0))
          return (b.cocaPosCount || 0) - (a.cocaPosCount || 0);
        return (b.cocaHeadwordTotalFreq || 0) - (a.cocaHeadwordTotalFreq || 0);
      }
      if (posSortBy === 'entropy_desc') {
        if ((b.cocaPosEntropy || 0) !== (a.cocaPosEntropy || 0)) {
          return (b.cocaPosEntropy || 0) - (a.cocaPosEntropy || 0);
        }
        return (b.cocaHeadwordTotalFreq || 0) - (a.cocaHeadwordTotalFreq || 0);
      }
      return (b.cocaHeadwordTotalFreq || 0) - (a.cocaHeadwordTotalFreq || 0);
    });
    return list;
  }, [words, minPosCount, posSortBy, posQuery]);

  // ================= 4. BNC × COCA CROSS-TABULATION HEATMAP =================
  const crossMatrix = useMemo(() => {
    const bncRows = [
      { label: 'BNC 1k', bands: [1] },
      { label: 'BNC 2k', bands: [2] },
      { label: 'BNC 3k', bands: [3] },
      { label: 'BNC 4k–5k', bands: [4, 5] },
      { label: 'BNC 6k–10k', bands: [6, 7, 8, 9, 10] },
      { label: 'BNC 11k–15k', bands: [11, 12, 13, 14, 15] },
      {
        label: 'BNC 16k–25k',
        bands: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
      },
    ];
    const cocaCols = [
      { label: 'COCA 1–1k', min: 1, max: 1000, onlyNoCoca: false },
      { label: '1k–3k', min: 1001, max: 3000, onlyNoCoca: false },
      { label: '3k–5k', min: 3001, max: 5000, onlyNoCoca: false },
      { label: '5k–10k', min: 5001, max: 10000, onlyNoCoca: false },
      { label: '10k–20k', min: 10001, max: 20000, onlyNoCoca: false },
      { label: '20k–60k', min: 20001, max: 60000, onlyNoCoca: false },
      { label: '未单列(屈折/英式)', min: null, max: null, onlyNoCoca: true },
    ];

    const headwordsOnly = words.filter((w) => w.isHeadword && w.bandNumber !== null);

    return bncRows.map((r) => {
      const bandSet = new Set(r.bands);
      const rowWords = headwordsOnly.filter((w) => w.bandNumber && bandSet.has(w.bandNumber));
      const cells = cocaCols.map((c) => {
        let count = 0;
        for (const w of rowWords) {
          if (c.onlyNoCoca) {
            if (!w.inCoca) count++;
          } else if (
            w.inCoca &&
            w.cocaBestPosRank !== null &&
            w.cocaBestPosRank !== undefined &&
            c.min !== null &&
            c.max !== null &&
            w.cocaBestPosRank >= c.min &&
            w.cocaBestPosRank <= c.max
          ) {
            count++;
          }
        }
        return {
          bncLabel: r.label,
          cocaLabel: c.label,
          bncBands: r.bands,
          cocaMin: c.min,
          cocaMax: c.max,
          onlyNoCoca: c.onlyNoCoca,
          count,
          pctOfRow: rowWords.length > 0 ? Math.round((count / rowWords.length) * 100) : 0,
        };
      });
      return {
        bncLabel: r.label,
        totalHeadwords: rowWords.length,
        cells,
      };
    });
  }, [words]);

  const selectedCellWords = useMemo(() => {
    if (!selectedMatrixCell) return [];
    const bandSet = new Set(selectedMatrixCell.bncBands);
    return words
      .filter((w) => {
        if (!w.isHeadword || !w.bandNumber || !bandSet.has(w.bandNumber)) return false;
        if (selectedMatrixCell.onlyNoCoca) return !w.inCoca;
        if (!w.inCoca || w.cocaBestPosRank === null || w.cocaBestPosRank === undefined) return false;
        return (
          w.cocaBestPosRank >= (selectedMatrixCell.cocaMin || 1) &&
          w.cocaBestPosRank <= (selectedMatrixCell.cocaMax || 60000)
        );
      })
      .slice(0, 120);
  }, [words, selectedMatrixCell]);

  // ================= 5. SET COMPARATOR DATA =================
  const resolveSetById = (id: string) => {
    const customCol = collections.find((c) => c.id === id);
    if (customCol) {
      return {
        label: customCol.name,
        items: customCol.wordIds
          .map((wid) => wordsMap.get(wid))
          .filter((w): w is LexiconWordItem => Boolean(w)),
      };
    }
    const presetMeta =
      PRESET_SET_OPTIONS.find((p) => p.id === id) ||
      CORPUS_COMPARISON_PRESETS.find((p) => p.id === id);

    // Map UI preset IDs to CorpusComparisonPresetId or custom filter
    if (id === 'user_mastered') {
      return {
        label: presetMeta?.label || id,
        items: words.filter((w) => userRecordsMap.get(w.id)?.status === 'mastered'),
      };
    }
    if (id === 'user_learning_queued') {
      return {
        label: presetMeta?.label || id,
        items: words.filter((w) => {
          const st = userRecordsMap.get(w.id)?.status;
          return st === 'learning' || st === 'queued';
        }),
      };
    }
    if (id === 'cet_all') {
      return {
        label: presetMeta?.label || id,
        items: words.filter((w) => w.inCet),
      };
    }
    if (id === 'bnc_1k_2k') {
      return {
        label: presetMeta?.label || id,
        items: words.filter((w) => w.inBnc && w.isHeadword && (w.bandNumber === 1 || w.bandNumber === 2)),
      };
    }
    const mappedPresetId: CorpusComparisonPresetId =
      id === 'cet4'
        ? 'cet4_all'
        : id === 'coca_top_1k'
          ? 'coca_top1k'
          : id === 'coca_top_3k'
            ? 'coca_top3k'
            : id === 'coca_top_5k'
              ? 'coca_top5k'
              : id === 'coca_top_10k'
                ? 'coca_top10k'
                : (id as CorpusComparisonPresetId);

    return {
      label: presetMeta?.label || id,
      items: resolvePresetWordSet(mappedPresetId, words, 'headwords_only'),
    };
  };

  const setComparisonResult = useMemo(() => {
    const setA = resolveSetById(setAId);
    const setB = resolveSetById(setBId);
    const cmp = compareCorpusWordSets(setA.items, setB.items);
    return {
      ...cmp,
      labelA: setA.label,
      labelB: setB.label,
      jaccardSimilarity: cmp.jaccardSimilarityPct / 100,
      onlyACount: cmp.onlyInAWords.length,
      onlyBCount: cmp.onlyInBWords.length,
      intersectionCount: cmp.intersectionWords.length,
    };
  }, [setAId, setBId, words, userRecordsMap, collections, wordsMap]);

  const activeDiffWords = useMemo(() => {
    if (diffBucket === 'intersection') return setComparisonResult.intersectionWords;
    if (diffBucket === 'onlyA') return setComparisonResult.onlyInAWords;
    return setComparisonResult.onlyInBWords;
  }, [diffBucket, setComparisonResult]);

  const activeDiffWordIds = useMemo(
    () => activeDiffWords.map((w) => w.id),
    [activeDiffWords]
  );

  const handleSaveWordIdsAsCollection = (name: string, desc: string, wordIds: string[]) => {
    if (wordIds.length === 0) return;
    onCreateCollection({
      name,
      description: desc,
      type: 'static',
      entityType: 'headword',
      wordIds,
    });
    setSavedToast(`已保存词集「${name}」（${wordIds.length.toLocaleString()} 词）`);
    setTimeout(() => setSavedToast(null), 2800);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-surface)] overflow-hidden">
      {/* Top Sub-Navigation Bar */}
      <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'coca_ranking', label: 'COCA 排名 (60k)', icon: BarChart3 },
            { id: 'freq_distribution', label: '词频幂律与梯队', icon: Sparkles },
            { id: 'pos_analytics', label: '一词多性与熵 (5,627)', icon: Layers },
            { id: 'cross_corpus', label: '三源交集与矩阵', icon: Filter },
            { id: 'set_comparator', label: '双集合对比 (A vs B)', icon: GitCompare },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as LabTab)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] border border-[var(--border-subtle)] font-semibold shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {savedToast && (
          <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-medium shrink-0">
            {savedToast}
          </span>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* ==================================================================== */}
        {/* SUB-TAB 1: COCA RANKING EXPLORER                                      */}
        {/* ==================================================================== */}
        {activeTab === 'coca_ranking' && (
          <div className="p-4 sm:p-5 space-y-4 max-w-7xl mx-auto">
            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex flex-wrap lg:flex-nowrap items-center justify-between gap-2">
              <div className="inline-flex rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setRankingMode('lemma_pos');
                    setRankPage(1);
                  }}
                  className={`px-2.5 py-1 rounded whitespace-nowrap cursor-pointer ${
                    rankingMode === 'lemma_pos'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  词元+词性 (60k)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRankingMode('derived_headword');
                    setRankPage(1);
                  }}
                  className={`px-2.5 py-1 rounded whitespace-nowrap cursor-pointer ${
                    rankingMode === 'derived_headword'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  词头合计 (54k)
                </button>
              </div>

              <select
                value={selectedTierId}
                onChange={(e) => {
                  setSelectedTierId(e.target.value);
                  setRankPage(1);
                }}
                aria-label="选择 COCA 排名区间"
                className="px-2 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono-tabular shrink-0 cursor-pointer"
              >
                {RANK_TIERS.map((t) => (
                  <option key={t.id} value={t.id}>
                    排名 {t.label}
                  </option>
                ))}
              </select>

              <select
                value={selectedPos}
                onChange={(e) => {
                  setSelectedPos(e.target.value as CocaRawPos | 'ALL');
                  setRankPage(1);
                }}
                aria-label="选择 COCA 词性"
                className="px-2 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono-tabular shrink-0 cursor-pointer"
              >
                <option value="ALL">全部 14 种词性</option>
                {cocaStats.posDistribution.map((p) => (
                  <option key={p.pos} value={p.pos}>
                    {COCA_POS_META[p.pos]?.shortLabel || p.pos} ({p.count.toLocaleString()})
                  </option>
                ))}
              </select>

              <div className="relative flex-1 min-w-[130px]">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={rankSearch}
                  onChange={(e) => {
                    setRankSearch(e.target.value);
                    setRankPage(1);
                  }}
                  placeholder="搜索或过滤词头…"
                  className="w-full pl-8 pr-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  onJumpToExploreWithFilter({
                    ...DEFAULT_FILTER_CRITERIA,
                    sourceFilter: 'coca_all',
                    cocaRankMode: rankingMode,
                    minCocaRank: activeTier.min,
                    maxCocaRank: activeTier.max,
                    cocaPosFilter: selectedPos === 'ALL' ? [] : [selectedPos],
                  })
                }
                className="px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--accent-primary)] hover:border-[var(--accent-primary)] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>在检索中打开</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Ranking Table */}
            <div className="border border-[var(--border-subtle)] rounded-md overflow-hidden bg-[var(--bg-surface)]">
              <div className="grid grid-cols-[62px_minmax(110px,1.4fr)_76px_88px] sm:grid-cols-[72px_minmax(130px,1.4fr)_86px_104px_minmax(120px,1.2fr)_90px] gap-x-2.5 items-center px-4 py-2 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
                <div>{rankingMode === 'lemma_pos' ? '官方排名' : '派生排名'}</div>
                <div>词头 (Headword)</div>
                <div>{rankingMode === 'lemma_pos' ? '当前词性' : '主词性'}</div>
                <div className="text-right sm:pr-3">COCA 频次</div>
                <div className="hidden sm:block">词头内占比 / 信息熵</div>
                <div className="hidden sm:block text-right">BNC / CET</div>
              </div>

              <div className="divide-y divide-[var(--border-subtle)]">
                {rankingMode === 'lemma_pos'
                  ? filteredRankingLexemes
                      .slice((safeRankPage - 1) * PAGE_SIZE, safeRankPage * PAGE_SIZE)
                      .map((lex) => {
                        const w = wordsMap.get(lex.normalizedHeadword);
                        const meta = COCA_POS_META[lex.pos];
                        const sharePct = Math.round(lex.shareInHeadwordPct);
                        return (
                          <div
                            key={lex.id}
                            onClick={() => w && onSelectWord(w)}
                            className="grid grid-cols-[62px_minmax(110px,1.4fr)_76px_88px] sm:grid-cols-[72px_minmax(130px,1.4fr)_86px_104px_minmax(120px,1.2fr)_90px] gap-x-2.5 items-center px-4 py-2 text-xs hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                          >
                            <div className="font-mono-tabular font-semibold text-blue-600 dark:text-blue-400">
                              #{lex.rank.toLocaleString()}
                            </div>
                            <div
                              translate="no"
                              className="font-serif-lexicon font-semibold text-sm text-[var(--text-primary)] truncate pr-2"
                            >
                              {lex.headword}
                            </div>
                            <div className="truncate">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-semibold ${meta?.badgeClass || ''}`}
                              >
                                {meta?.shortLabel || lex.pos}
                              </span>
                            </div>
                            <div className="text-right sm:pr-3 font-mono-tabular text-[var(--text-primary)]">
                              {lex.frequency.toLocaleString()}
                            </div>
                            <div className="hidden sm:flex items-center gap-2 font-mono-tabular text-[11px]">
                              <div className="w-16 h-1.5 bg-[var(--bg-subtle)] rounded-xs overflow-hidden">
                                <div
                                  className="h-full bg-[var(--accent-primary)]"
                                  style={{ width: `${Math.max(3, sharePct)}%` }}
                                />
                              </div>
                              <span className="text-[var(--text-secondary)]">
                                {sharePct}% ({w?.cocaPosCount || 1}性)
                              </span>
                            </div>
                            <div className="hidden sm:block text-right font-mono-tabular text-[11px] text-[var(--text-muted)]">
                              {[w?.band, w?.isCet4 ? 'CET-4' : w?.isCet6 ? 'CET-6' : null]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </div>
                          </div>
                        );
                      })
                  : filteredRankingHeadwords
                      .slice((safeRankPage - 1) * PAGE_SIZE, safeRankPage * PAGE_SIZE)
                      .map((w) => {
                        const meta = w.cocaPrimaryPos ? COCA_POS_META[w.cocaPrimaryPos] : null;
                        return (
                          <div
                            key={w.id}
                            onClick={() => onSelectWord(w)}
                            className="grid grid-cols-[62px_minmax(110px,1.4fr)_76px_88px] sm:grid-cols-[72px_minmax(130px,1.4fr)_86px_104px_minmax(120px,1.2fr)_90px] gap-x-2.5 items-center px-4 py-2 text-xs hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                          >
                            <div className="font-mono-tabular font-semibold text-blue-600 dark:text-blue-400">
                              #{w.cocaHeadwordDerivedRank?.toLocaleString()}
                            </div>
                            <div
                              translate="no"
                              className="font-serif-lexicon font-semibold text-sm text-[var(--text-primary)] truncate pr-2"
                            >
                              {w.word}
                            </div>
                            <div className="flex items-center gap-1 font-mono-tabular truncate">
                              {meta && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${meta.badgeClass}`}
                                >
                                  {meta.shortLabel}
                                </span>
                              )}
                              {(w.cocaPosCount || 0) > 1 && (
                                <span className="text-[10px] text-[var(--text-muted)]">
                                  ×{w.cocaPosCount}
                                </span>
                              )}
                            </div>
                            <div className="text-right sm:pr-3 font-mono-tabular font-semibold text-[var(--text-primary)]">
                              {w.cocaHeadwordTotalFreq?.toLocaleString()}
                            </div>
                            <div className="hidden sm:block font-mono-tabular text-[11px] text-[var(--text-secondary)]">
                              最佳 #{w.cocaBestPosRank?.toLocaleString()} · H=
                              {w.cocaPosEntropy?.toFixed(2)}
                            </div>
                            <div className="hidden sm:block text-right font-mono-tabular text-[11px] text-[var(--text-muted)]">
                              {[w.band, w.isCet4 ? 'CET-4' : w.isCet6 ? 'CET-6' : null]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </div>
                          </div>
                        );
                      })}
              </div>

              {/* Pagination Footer */}
              <div className="px-4 py-2 bg-[var(--bg-canvas)] border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono-tabular text-[var(--text-secondary)]">
                <span>
                  共 {totalRankItems.toLocaleString()} 条记录 · 第 {safeRankPage} /{' '}
                  {totalRankPages} 页
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safeRankPage <= 1}
                    onClick={() => setRankPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] disabled:opacity-40 cursor-pointer"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    disabled={safeRankPage >= totalRankPages}
                    onClick={() => setRankPage((p) => Math.min(totalRankPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] disabled:opacity-40 cursor-pointer"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* SUB-TAB 2: FREQUENCY DISTRIBUTION & ZIPF EXPLORER                    */}
        {/* ==================================================================== */}
        {activeTab === 'freq_distribution' && (
          <div className="p-4 sm:p-5 space-y-5 max-w-7xl mx-auto">
            {/* Top Summary KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono-tabular">
              <div className="p-3.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                <div className="text-[11px] text-[var(--text-muted)]">COCA 2020 词元+词性记录</div>
                <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">
                  {cocaStats.totalLexemeRecords.toLocaleString()}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  对应 {cocaStats.distinctHeadwords.toLocaleString()} 个独立词头
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                <div className="text-[11px] text-[var(--text-muted)]">语料库总词频 (Tokens)</div>
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  {cocaStats.totalFrequency.toLocaleString()}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  Top 1,000 贡献 {tierDistributionStats[0]?.sharePct}% 总频次
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                <div className="text-[11px] text-[var(--text-muted)]">Top 5,000 累计词频覆盖</div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {tierDistributionStats[2]?.cumulativePct}%
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  典型齐夫定律 (Zipf&apos;s Law) 头部效应
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                <div className="text-[11px] text-[var(--text-muted)]">多词性词头 / 带连字符词</div>
                <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">
                  {cocaStats.multiPosHeadwords.toLocaleString()} /{' '}
                  {cocaStats.hyphenatedHeadwords.toLocaleString()}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  覆盖 14 类完整语法词性
                </div>
              </div>
            </div>

            {/* Interactive SVG Zipf / Cumulative Coverage Curve + Tier Table */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left 5 cols: SVG Chart */}
              <div className="lg:col-span-5 p-4 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-[var(--text-primary)]">
                      {curveScale === 'cumulative'
                        ? 'COCA 排名梯队累计语料覆盖率曲线'
                        : 'COCA 排名-频次双对数 (Log-Log) 齐夫曲线'}
                    </h3>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      基于 60,000 条真实记录实测计算 (总频次 8.93 亿)
                    </p>
                  </div>
                  <div className="inline-flex rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setCurveScale('cumulative')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        curveScale === 'cumulative'
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      累计覆盖率
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurveScale('log_log')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        curveScale === 'log_log'
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      双对数幂律
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                  <svg viewBox="0 0 360 190" className="w-full h-44 overflow-visible">
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
                      <line
                        key={i}
                        x1={36}
                        x2={344}
                        y1={20 + t * 140}
                        y2={20 + t * 140}
                        stroke="currentColor"
                        className="text-[var(--border-subtle)]"
                        strokeDasharray="3 3"
                      />
                    ))}
                    {curveScale === 'cumulative' ? (
                      <>
                        <polyline
                          fill="none"
                          stroke="var(--accent-primary)"
                          strokeWidth="2.5"
                          points={tierDistributionStats
                            .map((tier, idx) => {
                              const x = 36 + ((idx + 1) / tierDistributionStats.length) * 308;
                              const y = 160 - (tier.cumulativePct / 100) * 140;
                              return `${x},${y}`;
                            })
                            .join(' ')}
                        />
                        {tierDistributionStats.map((tier, idx) => {
                          const x = 36 + ((idx + 1) / tierDistributionStats.length) * 308;
                          const y = 160 - (tier.cumulativePct / 100) * 140;
                          return (
                            <g key={tier.label}>
                              <circle cx={x} cy={y} r={4} fill="var(--accent-primary)" />
                              <text
                                x={x}
                                y={y - 7}
                                textAnchor="middle"
                                className="fill-[var(--text-primary)] text-[9px] font-mono-tabular"
                              >
                                {tier.cumulativePct}%
                              </text>
                              <text
                                x={x}
                                y={176}
                                textAnchor="middle"
                                className="fill-[var(--text-muted)] text-[8px] font-mono-tabular"
                              >
                                {tier.max / 1000}k
                              </text>
                            </g>
                          );
                        })}
                      </>
                    ) : (
                      <>
                        {/* Sampled Log10(Rank) vs Log10(Freq) points */}
                        <polyline
                          fill="none"
                          stroke="var(--accent-primary)"
                          strokeWidth="2.2"
                          points={[1, 10, 50, 100, 500, 1000, 3000, 5000, 10000, 25000, 60000]
                            .map((r) => {
                              const rec = cocaLexemes[r - 1];
                              const freq = rec ? Math.max(1, rec.frequency) : 1;
                              const logR = Math.log10(r) / Math.log10(60000);
                              const logF = Math.log10(freq) / Math.log10(50033612);
                              const x = 36 + logR * 308;
                              const y = 160 - logF * 140;
                              return `${x},${y}`;
                            })
                            .join(' ')}
                        />
                        {[1, 100, 1000, 10000, 60000].map((r) => {
                          const rec = cocaLexemes[r - 1];
                          const freq = rec ? Math.max(1, rec.frequency) : 1;
                          const logR = Math.log10(r) / Math.log10(60000);
                          const logF = Math.log10(freq) / Math.log10(50033612);
                          const x = 36 + logR * 308;
                          const y = 160 - logF * 140;
                          return (
                            <g key={r}>
                              <circle cx={x} cy={y} r={3.5} fill="var(--accent-primary)" />
                              <text
                                x={x}
                                y={176}
                                textAnchor="middle"
                                className="fill-[var(--text-muted)] text-[8px] font-mono-tabular"
                              >
                                #{r >= 1000 ? `${r / 1000}k` : r}
                              </text>
                            </g>
                          );
                        })}
                      </>
                    )}
                  </svg>
                </div>

                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  观察结论：前 1,000 条词元占总频次的{' '}
                  <strong>{tierDistributionStats[0]?.sharePct}%</strong>（包含大量高频功能词与核心动词）；前 5,000 条累计覆盖{' '}
                  <strong>{tierDistributionStats[2]?.cumulativePct}%</strong>；10k–60k 则以学术名词与精细形容词为主。
                </p>
              </div>

              {/* Right 7 cols: Interactive Rank Tier Breakdown Table */}
              <div className="lg:col-span-7 border border-[var(--border-subtle)] rounded-lg overflow-hidden bg-[var(--bg-surface)] flex flex-col">
                <div className="px-4 py-2.5 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    COCA 排名梯队频次贡献与词性结构矩阵 (点击任意梯队可检索)
                  </span>
                </div>
                <div className="grid grid-cols-[96px_80px_72px_1fr_54px] items-center px-3.5 py-2 bg-[var(--bg-subtle)]/50 border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  <div>排名梯队</div>
                  <div className="text-right pr-2">区间贡献</div>
                  <div className="text-right pr-2">累计覆盖</div>
                  <div>词性构成 (名/动/形/副/虚词)</div>
                  <div className="text-right">探索</div>
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {tierDistributionStats.map((row) => (
                    <div
                      key={row.label}
                      onClick={() =>
                        onJumpToExploreWithFilter({
                          ...DEFAULT_FILTER_CRITERIA,
                          sourceFilter: 'coca_all',
                          minCocaRank: row.min,
                          maxCocaRank: row.max,
                        })
                      }
                      className="grid grid-cols-[96px_80px_72px_1fr_54px] items-center px-3.5 py-2.5 text-xs hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <div className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                        {row.label}
                      </div>
                      <div className="text-right pr-2 font-mono-tabular text-[var(--text-secondary)]">
                        {row.sharePct}%
                      </div>
                      <div className="text-right pr-2 font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-400">
                        {row.cumulativePct}%
                      </div>
                      <div className="pr-2 space-y-1">
                        <div className="h-2 rounded-xs overflow-hidden flex bg-[var(--bg-subtle)]">
                          <div
                            style={{ width: `${row.nounPct}%` }}
                            className="bg-blue-500"
                            title={`名词 ${row.nounPct}%`}
                          />
                          <div
                            style={{ width: `${row.verbPct}%` }}
                            className="bg-rose-500"
                            title={`动词 ${row.verbPct}%`}
                          />
                          <div
                            style={{ width: `${row.adjPct}%` }}
                            className="bg-amber-500"
                            title={`形容词 ${row.adjPct}%`}
                          />
                          <div
                            style={{ width: `${row.advPct}%` }}
                            className="bg-emerald-500"
                            title={`副词 ${row.advPct}%`}
                          />
                          <div
                            style={{ width: `${row.closedPct}%` }}
                            className="bg-purple-500"
                            title={`功能词/其他 ${row.closedPct}%`}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-mono-tabular text-[var(--text-muted)]">
                          <span>n.{row.nounPct}%</span>
                          <span>v.{row.verbPct}%</span>
                          <span>adj.{row.adjPct}%</span>
                          <span>adv.{row.advPct}%</span>
                        </div>
                      </div>
                      <div className="text-right text-[var(--accent-primary)]">
                        <ArrowUpRight className="w-3.5 h-3.5 inline" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 14-PoS Complete Census Table */}
            <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden bg-[var(--bg-surface)]">
              <div className="px-4 py-2.5 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)]">
                <h3 className="text-xs font-bold text-[var(--text-primary)]">
                  COCA 2020 全部 14 种语法词性普查统计表
                </h3>
              </div>
              <div className="grid grid-cols-[120px_90px_90px_120px_1fr_72px] items-center px-4 py-2 bg-[var(--bg-subtle)]/50 border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <div>词性 (PoS)</div>
                <div className="text-right">词元记录数</div>
                <div className="text-right">词条占比</div>
                <div className="text-right pr-3">语料总频次</div>
                <div>占 8.93 亿总词频比例</div>
                <div className="text-right">筛选</div>
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {cocaStats.posDistribution.map((row) => {
                  const meta = COCA_POS_META[row.pos];
                  return (
                    <div
                      key={row.pos}
                      onClick={() =>
                        onJumpToExploreWithFilter({
                          ...DEFAULT_FILTER_CRITERIA,
                          sourceFilter: 'coca_all',
                          cocaPosFilter: [row.pos],
                        })
                      }
                      className="grid grid-cols-[120px_90px_90px_120px_1fr_72px] items-center px-4 py-2 text-xs font-mono-tabular hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <div>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${meta?.badgeClass || ''}`}
                        >
                          {meta?.label || row.pos}
                        </span>
                      </div>
                      <div className="text-right font-semibold text-[var(--text-primary)]">
                        {row.count.toLocaleString()}
                      </div>
                      <div className="text-right text-[var(--text-secondary)]">
                        {row.shareOfRecordsPct}%
                      </div>
                      <div className="text-right pr-3 text-[var(--text-secondary)]">
                        {row.totalFrequency.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-2 pr-4">
                        <div className="flex-1 h-1.5 bg-[var(--bg-subtle)] rounded-xs overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent-primary)]"
                            style={{ width: `${Math.max(2, row.shareOfFreqPct)}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-[11px] text-[var(--text-primary)]">
                          {row.shareOfFreqPct}%
                        </span>
                      </div>
                      <div className="text-right text-[var(--accent-primary)] text-[11px]">
                        浏览 →
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* SUB-TAB 3: PART-OF-SPEECH & MULTI-POS ENTROPY ANALYTICS              */}
        {/* ==================================================================== */}
        {activeTab === 'pos_analytics' && (
          <div className="p-4 sm:p-5 space-y-4 max-w-7xl mx-auto">
            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 text-xs">
              <div className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 shrink-0">
                <span className="px-2 text-[11px] font-semibold text-[var(--text-muted)] whitespace-nowrap">
                  词性数:
                </span>
                {[2, 3, 4, 5].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setMinPosCount(cnt)}
                    className={`px-2 py-1 rounded font-mono-tabular whitespace-nowrap cursor-pointer ${
                      minPosCount === cnt
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    ≥{cnt}性
                  </button>
                ))}
              </div>

              <select
                value={posSortBy}
                onChange={(e) => setPosSortBy(e.target.value as typeof posSortBy)}
                aria-label="多词性排序方式"
                className="px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs shrink-0 cursor-pointer"
              >
                <option value="pos_count_desc">按词性种类数降序 (如 like 7性)</option>
                <option value="entropy_desc">按香农信息熵 H 降序 (多词性最均衡)</option>
                <option value="freq_desc">按词头合计频次降序 (如 work / right)</option>
              </select>

              <div className="relative flex-1 min-w-[140px]">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={posQuery}
                  onChange={(e) => setPosQuery(e.target.value)}
                  placeholder="检索多词性词 (如 like, work, run)…"
                  className="w-full pl-8 pr-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div className="font-mono-tabular text-[11px] text-[var(--text-muted)] whitespace-nowrap shrink-0">
                共 {multiPosHeadwords.length.toLocaleString()} 词头
              </div>
            </div>

            <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden bg-[var(--bg-surface)]">
              <div className="grid grid-cols-[minmax(110px,1.1fr)_64px_92px_84px_minmax(220px,2.4fr)] items-center px-4 py-2 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
                <div>词头 (Headword)</div>
                <div>词性数</div>
                <div className="text-right pr-2">合计频次</div>
                <div>信息熵 H</div>
                <div>分词性官方排名与频次占比谱 (点击查看详情)</div>
              </div>

              <div className="divide-y divide-[var(--border-subtle)]">
                {multiPosHeadwords.slice(0, 100).map((w) => (
                  <div
                    key={w.id}
                    onClick={() => onSelectWord(w)}
                    className="grid grid-cols-[minmax(110px,1.1fr)_64px_92px_84px_minmax(220px,2.4fr)] items-center px-4 py-2.5 text-xs hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <div className="flex items-baseline gap-1.5 min-w-0 pr-2">
                      <span
                        translate="no"
                        className="font-serif-lexicon font-bold text-sm text-[var(--text-primary)] truncate"
                      >
                        {w.word}
                      </span>
                      <span className="text-[10px] font-mono-tabular text-blue-600 dark:text-blue-400">
                        #{w.cocaHeadwordDerivedRank}
                      </span>
                    </div>
                    <div className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                      {w.cocaPosCount} 性
                    </div>
                    <div className="text-right pr-2 font-mono-tabular text-[var(--text-secondary)]">
                      {w.cocaHeadwordTotalFreq?.toLocaleString()}
                    </div>
                    <div className="font-mono-tabular text-[11px] text-[var(--text-secondary)]">
                      {w.cocaPosEntropy?.toFixed(2)} bits
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(w.cocaLexemes || []).map((lex) => {
                        const meta = COCA_POS_META[lex.pos];
                        const pct = Math.round(lex.sharePct);
                        return (
                          <span
                            key={lex.lexemeId}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular inline-flex items-center gap-1 ${meta?.badgeClass || ''}`}
                          >
                            <strong>{meta?.shortLabel || lex.pos}</strong>
                            <span>#{lex.rank}</span>
                            <span className="opacity-75">({pct}%)</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* SUB-TAB 4: THREE-SOURCE VENN & BNC × COCA CROSS-CORPUS MATRIX         */}
        {/* ==================================================================== */}
        {activeTab === 'cross_corpus' && (
          <div className="p-4 sm:p-5 space-y-5 max-w-7xl mx-auto">
            {/* 7-Region Venn Summary Cards */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  三源词表全量交集与差集分布 (Union = {vennSummary.totalDistinctForms.toLocaleString()}{' '}
                  个规范化词形)
                </h3>
                <span className="text-[11px] text-[var(--text-muted)]">
                  点击任意区块可直接在探索视图检索对应词条
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 font-mono-tabular">
                {[
                  {
                    label: 'CET ∩ BNC ∩ COCA',
                    sub: '三源核心交集',
                    count: vennSummary.allThreeCount,
                    filter: 'all_three_sources' as const,
                    highlight: true,
                  },
                  {
                    label: '(BNC ∩ COCA) \\ CET',
                    sub: '超纲双语料共有',
                    count: vennSummary.bncAndCocaOnlyCount,
                    filter: 'both_bnc_coca' as const,
                  },
                  {
                    label: '(CET ∩ COCA) \\ BNC',
                    sub: '考纲+COCA (无BNC)',
                    count: vennSummary.cetAndCocaOnlyCount,
                    filter: 'both_cet_coca' as const,
                  },
                  {
                    label: '(CET ∩ BNC) \\ COCA',
                    sub: '考纲+BNC (无COCA)',
                    count: vennSummary.cetAndBncOnlyCount,
                    filter: 'both_cet_bnc' as const,
                  },
                  {
                    label: 'COCA 2020 独有',
                    sub: '当代美语新增/复合',
                    count: vennSummary.cocaOnlyExactCount,
                    filter: 'coca_only' as const,
                  },
                  {
                    label: 'BNC 25k 独有',
                    sub: '屈折变形/派生词形',
                    count: vennSummary.bncOnlyExactCount,
                    filter: 'bnc_only' as const,
                  },
                  {
                    label: 'CET2016 独有',
                    sub: '英式变体/短语词条',
                    count: vennSummary.cetOnlyExactCount,
                    filter: 'cet_only' as const,
                  },
                ].map((card) => (
                  <button
                    key={card.label}
                    type="button"
                    onClick={() =>
                      onJumpToExploreWithFilter({
                        ...DEFAULT_FILTER_CRITERIA,
                        sourceFilter: card.filter,
                      })
                    }
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      card.highlight
                        ? 'bg-[var(--accent-soft)] border-[var(--accent-primary)]/40 text-[var(--accent-primary)]'
                        : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] hover:border-[var(--accent-primary)]'
                    }`}
                  >
                    <div className="text-[10px] font-semibold text-[var(--text-secondary)] truncate">
                      {card.label}
                    </div>
                    <div className="text-base font-bold text-[var(--text-primary)] mt-1">
                      {card.count.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                      {card.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* BNC 1k-25k × COCA Rank Tier Cross-Tabulation Matrix */}
            <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden bg-[var(--bg-surface)]">
              <div className="px-4 py-3 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    BNC/COCA 2.0 词族首词频段 (1k–25k) × COCA 2020 最佳词性排名交叉矩阵
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    点击矩阵任意单元格即可在下方面板检视该交叉区间的具体词头（如 BNC 高频但在 COCA 排名靠后的英式或语域差异词）
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono-tabular border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg-subtle)]/60 border-b border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] uppercase">
                      <th className="py-2 px-3 text-left">BNC 词族频段</th>
                      <th className="py-2 px-2 text-right">词族首词数</th>
                      <th className="py-2 px-2 text-right">COCA 1–1k</th>
                      <th className="py-2 px-2 text-right">1k–3k</th>
                      <th className="py-2 px-2 text-right">3k–5k</th>
                      <th className="py-2 px-2 text-right">5k–10k</th>
                      <th className="py-2 px-2 text-right">10k–20k</th>
                      <th className="py-2 px-2 text-right">20k–60k</th>
                      <th className="py-2 px-3 text-right">未进 COCA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {crossMatrix.map((row) => (
                      <tr key={row.bncLabel} className="hover:bg-[var(--bg-hover)]/50">
                        <td className="py-2 px-3 font-semibold text-[var(--text-primary)]">
                          {row.bncLabel}
                        </td>
                        <td className="py-2 px-2 text-right text-[var(--text-secondary)]">
                          {row.totalHeadwords.toLocaleString()}
                        </td>
                        {row.cells.map((cell) => {
                          const isSelected =
                            selectedMatrixCell?.bncLabel === cell.bncLabel &&
                            selectedMatrixCell?.cocaLabel === cell.cocaLabel;
                          return (
                            <td key={cell.cocaLabel} className="p-1 text-right">
                              <button
                                type="button"
                                onClick={() => setSelectedMatrixCell(cell)}
                                className={`w-full py-1.5 px-2 rounded text-right transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-[var(--accent-primary)] text-white font-bold'
                                    : cell.pctOfRow >= 25
                                      ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-500/25'
                                      : cell.pctOfRow >= 10
                                        ? 'bg-blue-500/8 text-[var(--text-primary)] hover:bg-blue-500/15'
                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                                }`}
                              >
                                <div>{cell.count.toLocaleString()}</div>
                                <div className="text-[9px] opacity-75">{cell.pctOfRow}%</div>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Selected Cell Drilldown Preview */}
              {selectedMatrixCell && (
                <div className="p-4 bg-[var(--bg-canvas)] border-t border-[var(--border-subtle)] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      交叉检视：{selectedMatrixCell.bncLabel} × {selectedMatrixCell.cocaLabel}（展示前{' '}
                      {selectedCellWords.length} 个词族首词）
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onJumpToExploreWithFilter({
                          ...DEFAULT_FILTER_CRITERIA,
                          familyFilter: 'headword_only',
                          bands: selectedMatrixCell.bncBands,
                          sourceFilter: selectedMatrixCell.onlyNoCoca
                            ? 'bnc_only'
                            : 'both_bnc_coca',
                          minCocaRank: selectedMatrixCell.cocaMin,
                          maxCocaRank: selectedMatrixCell.cocaMax,
                        })
                      }
                      className="text-xs font-medium text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>在探索视图查看完整列表</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCellWords.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        translate="no"
                        onClick={() => onSelectWord(w)}
                        className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-xs font-serif-lexicon inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span className="font-semibold text-[var(--text-primary)]">{w.word}</span>
                        {w.cocaBestPosRank && (
                          <span className="text-[10px] font-mono-tabular text-blue-600 dark:text-blue-400">
                            C#{w.cocaBestPosRank}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* SUB-TAB 5: CORPUS COMPARISON WORKBENCH (SET A VS SET B)              */}
        {/* ==================================================================== */}
        {activeTab === 'set_comparator' && (
          <div className="p-4 sm:p-5 space-y-4 max-w-7xl mx-auto">
            {/* Set Selectors */}
            <div className="p-4 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  集合 A (基准词集)
                </label>
                <select
                  value={setAId}
                  onChange={(e) => setSetAId(e.target.value)}
                  aria-label="选择集合 A"
                  className="w-full px-3 py-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)]"
                >
                  <optgroup label="预设语料与考纲集合">
                    {PRESET_SET_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="个人词集">
                    {collections
                      .filter((c) => c.type !== 'dynamic')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          词集: {c.name} ({c.wordIds.length})
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              <div className="md:col-span-2 text-center font-mono-tabular text-xs font-bold text-[var(--text-muted)] py-2">
                VS (Jaccard {(setComparisonResult.jaccardSimilarity * 100).toFixed(1)}%)
              </div>

              <div className="md:col-span-5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  集合 B (参照词集)
                </label>
                <select
                  value={setBId}
                  onChange={(e) => setSetBId(e.target.value)}
                  aria-label="选择集合 B"
                  className="w-full px-3 py-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)]"
                >
                  <optgroup label="预设语料与考纲集合">
                    {PRESET_SET_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="个人词集">
                    {collections
                      .filter((c) => c.type !== 'dynamic')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          词集: {c.name} ({c.wordIds.length})
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {/* 3 Set Result Buckets */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono-tabular">
              {[
                {
                  id: 'onlyA' as const,
                  title: `差集 A \\ B（仅在 A 中）`,
                  sub: `${setComparisonResult.labelA} 独有`,
                  count: setComparisonResult.onlyACount,
                },
                {
                  id: 'intersection' as const,
                  title: `交集 A ∩ B（两集合共有）`,
                  sub: `重合度 Jaccard ${(setComparisonResult.jaccardSimilarity * 100).toFixed(1)}%`,
                  count: setComparisonResult.intersectionCount,
                },
                {
                  id: 'onlyB' as const,
                  title: `差集 B \\ A（仅在 B 中）`,
                  sub: `${setComparisonResult.labelB} 独有`,
                  count: setComparisonResult.onlyBCount,
                },
              ].map((b) => {
                const active = diffBucket === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setDiffBucket(b.id)}
                    className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--accent-soft)] border-[var(--accent-primary)]'
                        : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] hover:border-[var(--accent-primary)]'
                    }`}
                  >
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      {b.title}
                    </div>
                    <div className="text-xl font-bold text-[var(--accent-primary)] mt-1">
                      {b.count.toLocaleString()} 词
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      {b.sub}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Bucket Word List & 1-Click Actions */}
            <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden bg-[var(--bg-surface)]">
              <div className="px-4 py-2.5 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  当前结果集明细（共 {activeDiffWordIds.length.toLocaleString()} 词，展示前 150 词）
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleSaveWordIdsAsCollection(
                        `对比结果: ${diffBucket === 'intersection' ? 'A∩B' : diffBucket === 'onlyA' ? 'A\\B' : 'B\\A'} (${new Date().toISOString().slice(5, 10)})`,
                        `${setComparisonResult.labelA} vs ${setComparisonResult.labelB}`,
                        activeDiffWordIds
                      )
                    }
                    className="px-2.5 py-1 rounded bg-[var(--accent-primary)] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>保存为静态词集 ({activeDiffWordIds.length.toLocaleString()})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const allItems = activeDiffWordIds
                        .map((id) => wordsMap.get(id))
                        .filter((w): w is LexiconWordItem => Boolean(w));
                      onExportWordList(allItems, `corpus-diff-${diffBucket}`, 'csv');
                    }}
                    className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>导出 CSV</span>
                  </button>
                </div>
              </div>

              <div className="p-4 flex flex-wrap gap-1.5 max-h-96 overflow-y-auto">
                {activeDiffWords.slice(0, 150).map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    translate="no"
                    onClick={() => onSelectWord(w)}
                    className="px-2.5 py-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-xs font-serif-lexicon inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="font-semibold text-[var(--text-primary)]">{w.word}</span>
                    {w.cocaBestPosRank && (
                      <span className="text-[10px] font-mono-tabular text-blue-600 dark:text-blue-400">
                        COCA #{w.cocaBestPosRank}
                      </span>
                    )}
                    {w.band && (
                      <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                        {w.band}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
