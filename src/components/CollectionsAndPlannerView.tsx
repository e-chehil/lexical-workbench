import React, { useState, useMemo } from 'react';
import {
  ActivityLogEntry,
  BncCocaFamily,
  COCA_POS_META,
  FilterCriteria,
  LEARNING_STATUS_META,
  LearningStatus,
  LexiconWordItem,
  UserWordRecord,
  WordCollection,
} from '../data/types.ts';
import {
  computeMultiObjectiveStudyCandidates,
  DEFAULT_FILTER_CRITERIA,
  filterAndSortWords,
  MultiObjectiveStrategyId,
  MultiObjectiveWeights,
} from '../data/searchAndFilter.ts';
import { formatCompactFrequency } from '../utils/frequency.ts';
import { BatchAndActivityView } from './BatchAndActivityView.tsx';
import {
  Plus,
  Trash2,
  Download,
  Compass,
  Check,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  XCircle,
  BookMarked,
  ListChecks,
} from 'lucide-react';

interface CollectionsAndPlannerViewProps {
  collections: WordCollection[];
  words: LexiconWordItem[];
  wordsMap: Map<string, LexiconWordItem>;
  familiesMap: Map<string, BncCocaFamily>;
  userRecordsMap: Map<string, UserWordRecord>;
  activityLogs: ActivityLogEntry[];
  onSelectWord: (word: LexiconWordItem) => void;
  onStatusChange: (wordId: string, wordDisplay: string, status: LearningStatus) => void;
  onCreateCollection: (col: Omit<WordCollection, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteCollection: (id: string) => void;
  onApplyDynamicCollectionToExplore: (criteria: FilterCriteria) => void;
  onBatchSetStatus: (wordIds: string[], status: LearningStatus) => void;
  onExportWordList: (
    list: LexiconWordItem[],
    filenamePrefix: string,
    format: 'txt' | 'csv'
  ) => void;
  onExecuteBatchImport: (
    items: {
      wordId: string;
      word: string;
      status?: LearningStatus;
      tagsToAdd?: string[];
      noteToAppend?: string;
    }[],
    options: {
      defaultStatus: LearningStatus;
      commonTags: string[];
      sourceLabel: string;
      customTimestamp?: string;
    }
  ) => Promise<{ batchId: string; updatedCount: number }>;
  onRollbackBatch: (batchId: string) => Promise<number>;
  onUndoSingleLog: (logId: number) => Promise<void>;
  onExportLogsCsv: () => void;
}

const ALL_STATUSES: LearningStatus[] = ['unrated', 'queued', 'learning', 'mastered', 'deferred'];
const PAGE_SIZE = 100;

const STRATEGY_META: Record<
  MultiObjectiveStrategyId,
  { label: string; subtitle: string; defaultWeights: MultiObjectiveWeights }
> = {
  coca_high_freq: {
    label: 'COCA 高频优先',
    subtitle: '优先攻克当代美国英语排名最高、且尚未掌握的词元词头',
    defaultWeights: { cocaWeight: 60, bncWeight: 10, cetWeight: 10, gapWeight: 20 },
  },
  bnc_family_value: {
    label: 'BNC 词族覆盖优先',
    subtitle: '优先学习 1k–5k 高频且派生词成员丰富的大词族首词',
    defaultWeights: { cocaWeight: 15, bncWeight: 55, cetWeight: 15, gapWeight: 15 },
  },
  cet_syllabus: {
    label: 'CET 四六级考纲优先',
    subtitle: '聚焦四级核心与六级新增大纲词，兼顾 COCA 与 BNC 实测词频',
    defaultWeights: { cocaWeight: 20, bncWeight: 15, cetWeight: 50, gapWeight: 15 },
  },
  high_freq_gap: {
    label: '高频知识缺口补齐',
    subtitle: '定位 COCA Top 6000 中仍处于未评/待学状态的个人高频盲区',
    defaultWeights: { cocaWeight: 40, bncWeight: 10, cetWeight: 10, gapWeight: 40 },
  },
  family_completion: {
    label: '熟词族派生词补全',
    subtitle: '针对已掌握首词或部分成员的词族，补齐族内其余高频派生词',
    defaultWeights: { cocaWeight: 20, bncWeight: 40, cetWeight: 20, gapWeight: 20 },
  },
  custom_multi_objective: {
    label: '自定义四维多目标规划',
    subtitle: '自由调节 COCA 词频、BNC 词族、CET 考纲与知识缺口权重并识别帕累托前沿',
    defaultWeights: { cocaWeight: 35, bncWeight: 25, cetWeight: 25, gapWeight: 15 },
  },
};

export const CollectionsAndPlannerView: React.FC<CollectionsAndPlannerViewProps> = ({
  collections,
  words,
  wordsMap,
  familiesMap,
  userRecordsMap,
  activityLogs,
  onSelectWord,
  onStatusChange,
  onCreateCollection,
  onDeleteCollection,
  onApplyDynamicCollectionToExplore,
  onBatchSetStatus,
  onExportWordList,
  onExecuteBatchImport,
  onRollbackBatch,
  onUndoSingleLog,
  onExportLogsCsv,
}) => {
  const [studySubTab, setStudySubTab] = useState<'planner' | 'collections' | 'batch_sync'>(
    'planner'
  );

  // Planner State
  const [strategy, setStrategy] = useState<MultiObjectiveStrategyId>('coca_high_freq');
  const [weights, setWeights] = useState<MultiObjectiveWeights>(
    STRATEGY_META.coca_high_freq.defaultWeights
  );
  const [batchSize, setBatchSize] = useState<number>(50);
  const [batchName, setBatchName] = useState<string>('');
  const [onlyPareto, setOnlyPareto] = useState<boolean>(false);
  const [markUnratedAsQueued, setMarkUnratedAsQueued] = useState<boolean>(false);
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [justCreated, setJustCreated] = useState(false);

  // Collections State
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>(
    collections[0]?.id || 'builtin-coca-top-1k'
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newWordsRaw, setNewWordsRaw] = useState('');

  const handleStrategyChange = (next: MultiObjectiveStrategyId) => {
    setStrategy(next);
    setWeights(STRATEGY_META[next].defaultWeights);
  };

  const rawCandidates = useMemo(() => {
    const computed = computeMultiObjectiveStudyCandidates(words, familiesMap, userRecordsMap, {
      strategy,
      customWeights: weights,
      maxCandidatesPool: Math.max(batchSize * 2, 120),
    });
    return excludedIds.size > 0
      ? computed.filter((c) => !excludedIds.has(c.word.id))
      : computed;
  }, [words, familiesMap, userRecordsMap, strategy, weights, batchSize, excludedIds]);

  const plannerCandidates = useMemo(() => {
    const filtered = onlyPareto
      ? rawCandidates.filter((c) => c.isParetoOptimal || lockedIds.has(c.word.id))
      : rawCandidates;

    // Ensure locked items appear first
    const lockedList = filtered.filter((c) => lockedIds.has(c.word.id));
    const unlockedList = filtered.filter((c) => !lockedIds.has(c.word.id));
    return [...lockedList, ...unlockedList].slice(0, batchSize);
  }, [rawCandidates, onlyPareto, lockedIds, batchSize]);

  const paretoCount = useMemo(
    () => rawCandidates.filter((c) => c.isParetoOptimal).length,
    [rawCandidates]
  );

  const handleSaveBatchAsCollection = () => {
    if (plannerCandidates.length === 0) return;
    const meta = STRATEGY_META[strategy];
    const dateStr = new Date().toISOString().slice(5, 10);
    const finalName =
      batchName.trim() || `${meta.label} (${dateStr} · ${plannerCandidates.length}词)`;
    const ids = plannerCandidates.map((c) => c.word.id);

    onCreateCollection({
      name: finalName,
      description: `${meta.subtitle} [权重 COCA:${weights.cocaWeight}/BNC:${weights.bncWeight}/CET:${weights.cetWeight}/缺口:${weights.gapWeight}]`,
      type: 'study_plan',
      entityType: 'headword',
      wordIds: ids,
      planMetadata: {
        targetCount: ids.length,
        formulaDescription: meta.label,
        strategyMode: strategy,
        weights,
        createdAt: new Date().toISOString(),
      },
    });

    if (markUnratedAsQueued) {
      const unratedOnlyIds = ids.filter(
        (id) => (userRecordsMap.get(id)?.status || 'unrated') === 'unrated'
      );
      if (unratedOnlyIds.length > 0) {
        onBatchSetStatus(unratedOnlyIds, 'queued');
      }
    }

    setBatchName('');
    setJustCreated(true);
    setTimeout(() => {
      setJustCreated(false);
      setStudySubTab('collections');
    }, 1200);
  };

  // Active Collection Data
  const activeCollection = useMemo(() => {
    return collections.find((c) => c.id === selectedCollectionId) || collections[0] || null;
  }, [collections, selectedCollectionId]);

  const activeCollectionWords = useMemo(() => {
    if (!activeCollection) return [];
    if (activeCollection.type === 'dynamic' && activeCollection.filterCriteria) {
      return filterAndSortWords(
        words,
        userRecordsMap,
        activeCollection.filterCriteria,
        activeCollection.sortField || 'priority_weight_desc',
        familiesMap
      );
    }
    return activeCollection.wordIds
      .map((id) => wordsMap.get(id))
      .filter((w): w is LexiconWordItem => Boolean(w));
  }, [activeCollection, words, wordsMap, userRecordsMap, familiesMap]);

  const totalPages = Math.max(1, Math.ceil(activeCollectionWords.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedCollectionWords = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return activeCollectionWords.slice(start, start + PAGE_SIZE);
  }, [activeCollectionWords, safePage]);

  const handleExportAnkiTsv = (list: LexiconWordItem[], namePrefix: string) => {
    const lines = [
      '#separator:tab',
      '#html:false',
      '#columns:Word\tCOCA_Rank\tCOCA_PoS\tBNC_Band\tBNC_Family\tCET_Level\tStatus\tNote',
    ];
    for (const w of list) {
      const rec = userRecordsMap.get(w.id);
      const posStr = (w.cocaLexemes || []).map((l) => `${l.pos}:#${l.rank}`).join('; ');
      const cetStr = w.isCet4 && w.isCet6 ? 'CET-4/6' : w.isCet4 ? 'CET-4' : w.isCet6 ? 'CET-6' : '';
      lines.push(
        [
          w.word,
          w.cocaBestPosRank ?? '',
          posStr,
          w.band ?? '',
          w.headword ?? '',
          cetStr,
          rec?.status ?? 'unrated',
          (rec?.notes || '').replace(/[\r\n\t]+/g, ' '),
        ].join('\t')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/tab-separated-values;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${namePrefix}-anki.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateCustomCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const ids = Array.from(
      new Set(
        newWordsRaw
          .split(/[\n,;\t]+/)
          .map((s) => s.trim().toLowerCase())
          .filter((k) => k && wordsMap.has(k))
      )
    );
    onCreateCollection({
      name: newName.trim(),
      description: newDesc.trim() || '自定义静态词集',
      type: 'static',
      entityType: 'mixed',
      wordIds: ids,
    });
    setShowNewModal(false);
    setNewName('');
    setNewDesc('');
    setNewWordsRaw('');
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-surface)] overflow-hidden">
      {/* Top Sub-Workspace Bar */}
      <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setStudySubTab('planner')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
              studySubTab === 'planner'
                ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] border border-[var(--border-subtle)] font-semibold shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>多目标学习规划器 (Multi-Objective Planner)</span>
          </button>

          <button
            type="button"
            onClick={() => setStudySubTab('collections')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
              studySubTab === 'collections'
                ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] border border-[var(--border-subtle)] font-semibold shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5" />
            <span>词集与学习批次 ({collections.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setStudySubTab('batch_sync')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
              studySubTab === 'batch_sync'
                ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] border border-[var(--border-subtle)] font-semibold shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>批量导入与变更流水 ({activityLogs.length})</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SUB-TAB 1: EXPLAINABLE MULTI-OBJECTIVE STUDY PLANNER                  */}
      {/* ==================================================================== */}
      {studySubTab === 'planner' && (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Left Strategy & 4-Objective Weight Controls */}
          <aside className="w-full lg:w-[350px] xl:w-[380px] border-b lg:border-b-0 lg:border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 overflow-y-auto space-y-4 shrink-0">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                1. 选择规划策略模式 (6 大预设策略)
              </label>
              <select
                value={strategy}
                onChange={(e) => handleStrategyChange(e.target.value as MultiObjectiveStrategyId)}
                aria-label="学习规划策略"
                className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)]"
              >
                {Object.entries(STRATEGY_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-[var(--text-secondary)] leading-relaxed">
                {STRATEGY_META[strategy].subtitle}
              </p>
            </div>

            {/* 4 Transparent Objective Weight Sliders */}
            <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  2. 四维评分透明权重调节
                </span>
                <span className="text-[10px] font-mono-tabular text-[var(--accent-primary)]">
                  0–100 独立可解释分量
                </span>
              </div>

              {[
                {
                  key: 'cocaWeight' as const,
                  label: 'COCA 2020 当代词频价值',
                  color: 'accent-blue-600',
                },
                {
                  key: 'bncWeight' as const,
                  label: 'BNC 词族频段与派生杠杆',
                  color: 'accent-teal-600',
                },
                {
                  key: 'cetWeight' as const,
                  label: 'CET 四六级考纲相关性',
                  color: 'accent-indigo-600',
                },
                {
                  key: 'gapWeight' as const,
                  label: '个人高频知识缺口紧迫度',
                  color: 'accent-amber-600',
                },
              ].map((dim) => (
                <div key={dim.key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">{dim.label}</span>
                    <span className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                      {weights[dim.key]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={weights[dim.key]}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setWeights((prev) => ({ ...prev, [dim.key]: val }));
                    }}
                    className={`w-full h-1.5 rounded-lg cursor-pointer ${dim.color}`}
                  />
                </div>
              ))}
            </div>

            {/* Batch Size, Pareto Filter, Save Controls */}
            <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    目标批次容量
                  </label>
                  <select
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono-tabular"
                  >
                    <option value={30}>30 词 / 批</option>
                    <option value={50}>50 词 / 批</option>
                    <option value={100}>100 词 / 批</option>
                    <option value={200}>200 词 / 批</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    批次名称
                  </label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder="自动按策略与日期命名"
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={onlyPareto}
                    onChange={(e) => setOnlyPareto(e.target.checked)}
                    className="rounded border-[var(--border-strong)]"
                  />
                  <span>仅保留帕累托前沿候选词 (Pareto Frontier)</span>
                </div>
                <span className="font-mono-tabular text-[11px] text-emerald-600 dark:text-emerald-400">
                  {paretoCount} 词
                </span>
              </label>

              <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={markUnratedAsQueued}
                  onChange={(e) => setMarkUnratedAsQueued(e.target.checked)}
                  className="rounded border-[var(--border-strong)]"
                />
                <span>保存时将批次内「未评」词条标为「待学」</span>
              </label>

              {(lockedIds.size > 0 || excludedIds.size > 0) && (
                <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
                  <span>
                    已锁定 {lockedIds.size} 词 · 已排除 {excludedIds.size} 词
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setLockedIds(new Set());
                      setExcludedIds(new Set());
                    }}
                    className="text-rose-600 hover:underline cursor-pointer"
                  >
                    清空干预
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveBatchAsCollection}
                disabled={plannerCandidates.length === 0}
                className="w-full py-2 px-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {justCreated ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>已保存至学习词集</span>
                  </>
                ) : (
                  <>生成并保存学习批次 ({plannerCandidates.length} 词)</>
                )}
              </button>
            </div>
          </aside>

          {/* Right Candidate Preview Table with 4-Dimension Breakdown */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--bg-surface)] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                  候选词多目标评分明细与帕累托前沿检视 ({plannerCandidates.length} 词)
                </h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  点击任意词条可打开右侧研究抽屉；支持单行锁定保留或排除重算
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleExportAnkiTsv(
                    plannerCandidates.map((c) => c.word),
                    `study-plan-${strategy}`
                  )
                }
                className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出 Anki TSV</span>
              </button>
            </div>

            <div className="grid grid-cols-[38px_minmax(125px,1.25fr)_100px_136px_minmax(150px,1.5fr)_68px] items-center px-4 py-2 bg-[var(--bg-subtle)]/60 border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] shrink-0">
              <div>序号</div>
              <div>候选词头与考纲</div>
              <div>COCA · BNC</div>
              <div>四维得分拆解 (0–100)</div>
              <div>可解释推荐依据</div>
              <div className="text-right">总分/干预</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
              {plannerCandidates.map((cand, idx) => {
                const w = cand.word;
                const isLocked = lockedIds.has(w.id);
                return (
                  <div
                    key={w.id}
                    onClick={() => onSelectWord(w)}
                    className={`grid grid-cols-[38px_minmax(125px,1.25fr)_100px_136px_minmax(150px,1.5fr)_68px] items-center px-4 py-2 text-xs hover:bg-[var(--bg-hover)] cursor-pointer transition-colors ${
                      isLocked ? 'bg-[var(--accent-soft)]/50' : ''
                    }`}
                  >
                    <div className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                      {idx + 1}.
                    </div>

                    <div className="min-w-0 pr-2 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          translate="no"
                          className="font-serif-lexicon font-bold text-sm text-[var(--text-primary)] truncate"
                        >
                          {w.word}
                        </span>
                        {cand.isParetoOptimal && (
                          <span
                            title="帕累托前沿最优解：在四维目标上不被任何其他候选词全面支配"
                            className="px-1 py-0.2 rounded bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[9px] font-mono-tabular font-semibold shrink-0"
                          >
                            Pareto
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-mono-tabular text-[var(--text-muted)]">
                        {w.isCet4 && (
                          <span className="text-teal-700 dark:text-teal-400 font-semibold">
                            CET-4
                          </span>
                        )}
                        {w.isCet6 && (
                          <span className="text-indigo-700 dark:text-indigo-400 font-semibold">
                            {w.isCet6Only ? '★CET-6' : 'CET-6'}
                          </span>
                        )}
                        {w.cocaPrimaryPos && (
                          <span>{COCA_POS_META[w.cocaPrimaryPos]?.shortLabel}</span>
                        )}
                      </div>
                    </div>

                    <div className="font-mono-tabular text-[11px] pr-2">
                      {w.cocaBestPosRank ? (
                        <div className="text-blue-600 dark:text-blue-400 font-semibold">
                          COCA #{w.cocaBestPosRank}
                        </div>
                      ) : (
                        <div className="text-[var(--text-muted)]">COCA —</div>
                      )}
                      <div className="text-[10px] text-[var(--text-secondary)]">
                        {w.band ? `BNC ${w.band}` : '无族'}
                      </div>
                    </div>

                    {/* 4-Dimension Mini Bars */}
                    <div
                      className="pr-3 space-y-1 font-mono-tabular text-[9px]"
                      title={`COCA价值: ${cand.dimensions.cocaValue} | BNC词族: ${cand.dimensions.bncFamilyValue} | CET考纲: ${cand.dimensions.examRelevance} | 知识缺口: ${cand.dimensions.knowledgeGapValue}`}
                    >
                      <div className="grid grid-cols-4 gap-1">
                        <div className="bg-blue-500/15 text-blue-700 dark:text-blue-300 px-1 rounded text-center">
                          C:{cand.dimensions.cocaValue}
                        </div>
                        <div className="bg-teal-500/15 text-teal-700 dark:text-teal-300 px-1 rounded text-center">
                          B:{cand.dimensions.bncFamilyValue}
                        </div>
                        <div className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 px-1 rounded text-center">
                          E:{cand.dimensions.examRelevance}
                        </div>
                        <div className="bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1 rounded text-center">
                          G:{cand.dimensions.knowledgeGapValue}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-[var(--text-secondary)] truncate pr-2">
                      {cand.explainableReasons.join(' · ')}
                    </div>

                    <div
                      className="flex items-center justify-end gap-1 font-mono-tabular"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="font-bold text-[var(--text-primary)] mr-1">
                        {cand.compositeScore}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setLockedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(w.id)) next.delete(w.id);
                            else next.add(w.id);
                            return next;
                          })
                        }
                        title={isLocked ? '取消锁定' : '锁定保留在当前批次'}
                        className={`p-1 rounded cursor-pointer ${
                          isLocked
                            ? 'text-[var(--accent-primary)] bg-[var(--accent-soft)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {isLocked ? (
                          <Lock className="w-3.5 h-3.5" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setExcludedIds((prev) => {
                            const next = new Set(prev);
                            next.add(w.id);
                            return next;
                          })
                        }
                        title="从候选池排除此词"
                        className="p-1 rounded text-[var(--text-muted)] hover:text-rose-500 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 2: COLLECTIONS & STUDY PLANS                                  */}
      {/* ==================================================================== */}
      {studySubTab === 'collections' && (
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          <aside className="w-full md:w-[270px] lg:w-[300px] border-b md:border-b-0 md:border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-col shrink-0 min-h-0">
            <div className="px-3.5 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                词集与批次目录 ({collections.length})
              </span>
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                新建词集
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
              {collections.map((col) => {
                const isSelected = activeCollection?.id === col.id;
                const colWords =
                  col.type === 'dynamic' && col.filterCriteria
                    ? filterAndSortWords(
                        words,
                        userRecordsMap,
                        col.filterCriteria,
                        col.sortField || 'priority_weight_desc',
                        familiesMap
                      )
                    : col.wordIds
                        .map((id) => wordsMap.get(id))
                        .filter((w): w is LexiconWordItem => Boolean(w));
                const total = colWords.length;
                let mastered = 0;
                for (const w of colWords) {
                  if (userRecordsMap.get(w.id)?.status === 'mastered') mastered++;
                }
                const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;

                return (
                  <div
                    key={col.id}
                    onClick={() => {
                      setSelectedCollectionId(col.id);
                      setCurrentPage(1);
                    }}
                    className={`p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent-soft)]'
                        : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div
                          className={`text-xs font-semibold truncate ${
                            isSelected
                              ? 'text-[var(--accent-primary)]'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {col.name}
                        </div>
                        <div className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                          {col.type === 'dynamic'
                            ? '动态规则词集'
                            : col.type === 'study_plan'
                              ? '规划批次'
                              : '静态词集'}{' '}
                          · 粒度: {col.entityType || 'headword'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCollection(col.id);
                        }}
                        className="text-[var(--text-muted)] hover:text-rose-500 p-0.5 shrink-0 cursor-pointer"
                        title="删除词集"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-secondary)]">
                      <span>{total.toLocaleString()} 词</span>
                      <span>
                        掌握 {mastered} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1 bg-[var(--bg-subtle)] rounded-xs overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Center Collection Table */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--bg-surface)] overflow-hidden">
            {activeCollection ? (
              <>
                <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 shrink-0 bg-[var(--bg-surface)]">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {activeCollection.name}
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                      {activeCollection.description} · 共{' '}
                      {activeCollectionWords.length.toLocaleString()} 词
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {activeCollection.type === 'dynamic' && activeCollection.filterCriteria && (
                      <button
                        type="button"
                        onClick={() =>
                          onApplyDynamicCollectionToExplore(
                            activeCollection.filterCriteria || DEFAULT_FILTER_CRITERIA
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded text-xs font-medium hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span>在探索视图打开</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        handleExportAnkiTsv(activeCollectionWords, activeCollection.name)
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded text-xs font-medium hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Anki TSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onExportWordList(activeCollectionWords, activeCollection.name, 'csv')
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded text-xs font-medium hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(120px,1.3fr)_105px_64px_minmax(100px,1fr)_82px_76px] items-center px-4 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] shrink-0">
                  <div>词条</div>
                  <div>COCA 排名 · 词性</div>
                  <div>大纲</div>
                  <div>BNC 词族</div>
                  <div className="text-right pr-2">BNC 频次</div>
                  <div className="text-right">状态</div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
                  {pagedCollectionWords.map((entry) => {
                    const status = userRecordsMap.get(entry.id)?.status || 'unrated';
                    const statusMeta = LEARNING_STATUS_META[status];
                    const freqText = formatCompactFrequency(
                      entry.formFrequency,
                      entry.inBnc,
                      entry.bncLinkedViaVariant
                    );

                    return (
                      <div
                        key={entry.id}
                        onClick={() => onSelectWord(entry)}
                        className="grid grid-cols-[minmax(120px,1.3fr)_105px_64px_minmax(100px,1fr)_82px_76px] items-center px-4 py-2 hover:bg-[var(--bg-hover)] cursor-pointer text-xs"
                      >
                        <div className="min-w-0 pr-2 flex items-baseline gap-1.5">
                          <span
                            translate="no"
                            className="font-serif-lexicon font-semibold text-sm text-[var(--text-primary)] truncate"
                          >
                            {entry.word}
                          </span>
                        </div>

                        <div className="font-mono-tabular text-[11px] pr-2">
                          {entry.inCoca ? (
                            <span className="text-blue-600 dark:text-blue-400 font-semibold">
                              #{entry.cocaBestPosRank}{' '}
                              <span className="text-[10px] text-[var(--text-muted)]">
                                ({entry.cocaPrimaryPos})
                              </span>
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </div>

                        <div className="font-mono-tabular text-[11px]">
                          {entry.isCet4 && entry.isCet6
                            ? 'CET-4/6'
                            : entry.isCet4
                              ? 'CET-4'
                              : entry.isCet6
                                ? 'CET-6'
                                : '—'}
                        </div>

                        <div className="font-mono-tabular text-[11px] text-[var(--text-secondary)] truncate pr-2">
                          {entry.band ? `${entry.band} · ${entry.headword}` : '—'}
                        </div>

                        <div className="text-right pr-2 font-mono-tabular text-[11px] text-[var(--text-secondary)]">
                          {freqText}
                        </div>

                        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                          <select
                            aria-label={`${entry.word} 学习状态`}
                            value={status}
                            onChange={(e) =>
                              onStatusChange(
                                entry.id,
                                entry.word,
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
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-between text-xs font-mono-tabular shrink-0">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      第 {safePage} / {totalPages} 页（共{' '}
                      {activeCollectionWords.length.toLocaleString()} 词）
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] disabled:opacity-40 cursor-pointer inline-flex items-center gap-0.5"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>上一页</span>
                      </button>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] disabled:opacity-40 cursor-pointer inline-flex items-center gap-0.5"
                      >
                        <span>下一页</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 3: BATCH SYNC & ACTIVITY LEDGER                               */}
      {/* ==================================================================== */}
      {studySubTab === 'batch_sync' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <BatchAndActivityView
            words={words}
            wordsMap={wordsMap}
            userRecordsMap={userRecordsMap}
            activityLogs={activityLogs}
            onExecuteBatchImport={onExecuteBatchImport}
            onRollbackBatch={onRollbackBatch}
            onUndoSingleLog={onUndoSingleLog}
            onSelectWord={onSelectWord}
            onExportLogsCsv={onExportLogsCsv}
          />
        </div>
      )}

      {/* New Custom Collection Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowNewModal(false)}
        >
          <form
            onSubmit={handleCreateCustomCollection}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-xl overflow-hidden"
          >
            <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">新建自定义静态词集</h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                关闭
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  词集名称
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例如：经济学人阅读生词本"
                  className="w-full px-3 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded"
                />
              </div>
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  词集说明
                </label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="选填描述…"
                  className="w-full px-3 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded"
                />
              </div>
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  初始词表 (每行或逗号分隔一个单词)
                </label>
                <textarea
                  rows={4}
                  value={newWordsRaw}
                  onChange={(e) => setNewWordsRaw(e.target.value)}
                  placeholder="work, ability, climate change..."
                  className="w-full p-2.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded font-mono-tabular"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-3 py-1.5 rounded border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[var(--accent-primary)] text-white text-xs font-semibold cursor-pointer"
              >
                创建词集
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
