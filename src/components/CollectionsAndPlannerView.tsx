import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  STRATEGY_DEFAULT_WEIGHTS,
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
  RotateCcw,
  AlertCircle,
} from 'lucide-react';

interface CollectionsAndPlannerViewProps {
  collections: WordCollection[];
  words: LexiconWordItem[];
  wordsMap: Map<string, LexiconWordItem>;
  familiesMap: Map<string, BncCocaFamily>;
  userRecordsMap: Map<string, UserWordRecord>;
  activityLogs: ActivityLogEntry[];
  onSelectWord: (word: LexiconWordItem) => void;
  onStatusChange: (wordId: string, wordDisplay: string, status: LearningStatus) => Promise<void> | void;
  onCreateCollection: (
    col: Omit<WordCollection, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<void> | void;
  onDeleteCollection: (id: string) => Promise<void> | void;
  onApplyDynamicCollectionToExplore: (criteria: FilterCriteria) => void;
  onBatchSetStatus: (wordIds: string[], status: LearningStatus) => Promise<void> | void;
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
    defaultWeights: STRATEGY_DEFAULT_WEIGHTS.coca_high_freq,
  },
  bnc_family_value: {
    label: 'BNC 词族覆盖优先',
    subtitle: '优先学习 1k–5k 高频且派生词成员丰富的大词族首词',
    defaultWeights: STRATEGY_DEFAULT_WEIGHTS.bnc_family_value,
  },
  cet_syllabus: {
    label: 'CET 四六级考纲优先',
    subtitle: '聚焦四级大纲与六级新增大纲词，兼顾 COCA 与 BNC 实测词频',
    defaultWeights: STRATEGY_DEFAULT_WEIGHTS.cet_syllabus,
  },
  high_freq_gap: {
    label: '高频知识缺口补齐',
    subtitle: '定位 COCA Top 8000 / BNC 1k–4k 中仍处于未评或待学状态的个人盲区',
    defaultWeights: STRATEGY_DEFAULT_WEIGHTS.high_freq_gap,
  },
  family_completion: {
    label: '熟词族派生词补全',
    subtitle: '针对已掌握首词或部分成员的词族，补齐族内其余高价值派生词',
    defaultWeights: STRATEGY_DEFAULT_WEIGHTS.family_completion,
  },
  custom_multi_objective: {
    label: '自定义四维多目标规划',
    subtitle: '自由调节 COCA 词频、BNC 词族、CET 考纲与知识缺口权重并识别候选池帕累托前沿',
    defaultWeights: STRATEGY_DEFAULT_WEIGHTS.custom_multi_objective,
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
  const [plannerMobilePane, setPlannerMobilePane] = useState<'candidates' | 'config'>('candidates');

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
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Continuous Drag-to-Lock & Shift+Click Range Lock State
  const isDraggingLockRef = useRef(false);
  const dragLockTargetValueRef = useRef(true);
  const lastClickedLockIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const handleGlobalPointerUp = () => {
      isDraggingLockRef.current = false;
    };
    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('touchend', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('touchend', handleGlobalPointerUp);
    };
  }, []);

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

  // Detect whether current weights have been customized away from the selected strategy's default preset
  const isWeightsCustomized = useMemo(() => {
    const def = STRATEGY_META[strategy].defaultWeights;
    return (
      weights.cocaWeight !== def.cocaWeight ||
      weights.bncWeight !== def.bncWeight ||
      weights.cetWeight !== def.cetWeight ||
      weights.gapWeight !== def.gapWeight
    );
  }, [strategy, weights]);

  // Active locked IDs that have not been explicitly excluded
  const effectiveLockedIds = useMemo(() => {
    if (lockedIds.size === 0) return lockedIds;
    const next = new Set<string>();
    for (const id of lockedIds) {
      if (!excludedIds.has(id) && wordsMap.has(id)) {
        next.add(id);
      }
    }
    return next;
  }, [lockedIds, excludedIds, wordsMap]);

  const rawCandidates = useMemo(() => {
    const computed = computeMultiObjectiveStudyCandidates(words, familiesMap, userRecordsMap, {
      strategy,
      customWeights: weights,
      maxCandidatesPool: Math.max(batchSize * 2, 160),
      alwaysIncludeWordIds: effectiveLockedIds,
    });
    return excludedIds.size > 0
      ? computed.filter((c) => !excludedIds.has(c.word.id))
      : computed;
  }, [words, familiesMap, userRecordsMap, strategy, weights, batchSize, excludedIds, effectiveLockedIds]);

  /**
   * CRITICAL UX & STABILITY GUARANTEE:
   * Never hoist `lockedList` above `unlockedList` in the visual array order, because hoisting
   * causes newly locked rows to jump to index 0 while the user is clicking or dragging!
   * Instead:
   * 1. Select all locked items (`effectiveLockedIds`) + top unlocked items up to `batchSize`.
   * 2. Preserve their natural score order from `filtered` so locking/unlocking in-place never reorders rows!
   */
  const plannerCandidates = useMemo(() => {
    const filtered = onlyPareto
      ? rawCandidates.filter((c) => c.isParetoOptimal || effectiveLockedIds.has(c.word.id))
      : rawCandidates;

    const lockedInFiltered = filtered.filter((c) => effectiveLockedIds.has(c.word.id));
    if (lockedInFiltered.length >= batchSize) {
      return lockedInFiltered.slice(0, batchSize);
    }

    const neededUnlocked = Math.max(0, batchSize - lockedInFiltered.length);
    const unlockedChosen = filtered
      .filter((c) => !effectiveLockedIds.has(c.word.id))
      .slice(0, neededUnlocked);

    const chosenIdSet = new Set<string>();
    for (const c of lockedInFiltered) chosenIdSet.add(c.word.id);
    for (const c of unlockedChosen) chosenIdSet.add(c.word.id);

    return filtered.filter((c) => chosenIdSet.has(c.word.id));
  }, [rawCandidates, onlyPareto, effectiveLockedIds, batchSize]);

  const paretoCount = useMemo(
    () => rawCandidates.filter((c) => c.isParetoOptimal).length,
    [rawCandidates]
  );

  const totalWeightSum =
    weights.cocaWeight + weights.bncWeight + weights.cetWeight + weights.gapWeight || 1;

  const applyLockRange = (startIdx: number, endIdx: number, shouldLock: boolean) => {
    const lo = Math.max(0, Math.min(startIdx, endIdx));
    const hi = Math.min(plannerCandidates.length - 1, Math.max(startIdx, endIdx));
    setLockedIds((prev) => {
      const next = new Set(prev);
      for (let i = lo; i <= hi; i++) {
        const id = plannerCandidates[i]?.word.id;
        if (!id) continue;
        if (shouldLock) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const toggleSingleLock = (idx: number, wordId: string, shiftKey = false) => {
    const currentlyLocked = lockedIds.has(wordId);
    const targetVal = !currentlyLocked;

    if (shiftKey && lastClickedLockIndexRef.current !== null) {
      applyLockRange(lastClickedLockIndexRef.current, idx, targetVal);
      lastClickedLockIndexRef.current = idx;
      return;
    }

    lastClickedLockIndexRef.current = idx;
    setLockedIds((prev) => {
      const next = new Set(prev);
      if (targetVal) next.add(wordId);
      else next.delete(wordId);
      return next;
    });
  };

  const handleLockMouseDown = (idx: number, wordId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Ignore non-primary mouse buttons
    if (e.button !== 0) return;
    const currentlyLocked = lockedIds.has(wordId);
    const targetVal = !currentlyLocked;

    if (e.shiftKey && lastClickedLockIndexRef.current !== null) {
      applyLockRange(lastClickedLockIndexRef.current, idx, targetVal);
      lastClickedLockIndexRef.current = idx;
      return;
    }

    isDraggingLockRef.current = true;
    dragLockTargetValueRef.current = targetVal;
    lastClickedLockIndexRef.current = idx;

    setLockedIds((prev) => {
      const next = new Set(prev);
      if (targetVal) next.add(wordId);
      else next.delete(wordId);
      return next;
    });
  };

  const handleLockRowMouseEnter = (idx: number, wordId: string) => {
    if (!isDraggingLockRef.current) return;
    const targetVal = dragLockTargetValueRef.current;
    lastClickedLockIndexRef.current = idx;
    setLockedIds((prev) => {
      const has = prev.has(wordId);
      if (targetVal && has) return prev;
      if (!targetVal && !has) return prev;
      const next = new Set(prev);
      if (targetVal) next.add(wordId);
      else next.delete(wordId);
      return next;
    });
  };

  const handleSaveBatchAsCollection = async () => {
    if (plannerCandidates.length === 0 || isSavingBatch) return;
    setIsSavingBatch(true);
    setSaveError(null);

    try {
      const meta = STRATEGY_META[strategy];
      const dateStr = new Date().toISOString().slice(5, 10);
      const effectiveLabel = isWeightsCustomized ? `${meta.label} (自定义权重)` : meta.label;
      const finalName =
        batchName.trim() || `${effectiveLabel} (${dateStr} · ${plannerCandidates.length}词)`;
      const ids = plannerCandidates.map((c) => c.word.id);
      const lockedInBatchCount = ids.filter((id) => effectiveLockedIds.has(id)).length;

      const filterNotes: string[] = [
        `权重 C:${weights.cocaWeight}/B:${weights.bncWeight}/E:${weights.cetWeight}/G:${weights.gapWeight}`,
      ];
      if (onlyPareto) filterNotes.push('仅候选池帕累托前沿');
      if (lockedInBatchCount > 0) filterNotes.push(`锁定 ${lockedInBatchCount} 词`);
      if (excludedIds.size > 0) filterNotes.push(`排除 ${excludedIds.size} 词`);

      await onCreateCollection({
        name: finalName,
        description: `${meta.subtitle} [${filterNotes.join(' · ')}]`,
        type: 'study_plan',
        entityType: 'headword',
        wordIds: ids,
        planMetadata: {
          targetCount: ids.length,
          formulaDescription: `${effectiveLabel} (${filterNotes.join(', ')})`,
          strategyMode: isWeightsCustomized ? `${strategy}:custom_weights` : strategy,
          weights: { ...weights },
          createdAt: new Date().toISOString(),
        },
      });

      if (markUnratedAsQueued) {
        const unratedOnlyIds = ids.filter(
          (id) => (userRecordsMap.get(id)?.status || 'unrated') === 'unrated'
        );
        if (unratedOnlyIds.length > 0) {
          await onBatchSetStatus(unratedOnlyIds, 'queued');
        }
      }

      setBatchName('');
      setJustCreated(true);
      setTimeout(() => {
        setJustCreated(false);
        setStudySubTab('collections');
      }, 900);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : '保存学习批次失败，您的当前配置与锁定状态已完整保留'
      );
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Memoize resolved words and mastery stats for all collections so sidebar doesn't re-run filterAndSortWords on every render
  const collectionResolvedMap = useMemo(() => {
    const map = new Map<
      string,
      { words: LexiconWordItem[]; total: number; mastered: number; pct: number }
    >();
    for (const col of collections) {
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
      for (let i = 0; i < colWords.length; i++) {
        if (userRecordsMap.get(colWords[i].id)?.status === 'mastered') mastered++;
      }
      const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
      map.set(col.id, { words: colWords, total, mastered, pct });
    }
    return map;
  }, [collections, words, wordsMap, userRecordsMap, familiesMap]);

  // Active Collection Data
  const activeCollection = useMemo(() => {
    return collections.find((c) => c.id === selectedCollectionId) || collections[0] || null;
  }, [collections, selectedCollectionId]);

  const activeCollectionWords = useMemo(() => {
    if (!activeCollection) return [];
    return collectionResolvedMap.get(activeCollection.id)?.words || [];
  }, [activeCollection, collectionResolvedMap]);

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

  const handleCreateCustomCollection = async (e: React.FormEvent) => {
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
    try {
      setSaveError(null);
      await onCreateCollection({
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
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '创建词集失败，请重试');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-surface)] overflow-hidden">
      {/* Top Sub-Workspace Bar */}
      <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setStudySubTab('planner')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              studySubTab === 'planner'
                ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] border border-[var(--border-subtle)] font-semibold shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>多目标学习规划器</span>
          </button>

          <button
            type="button"
            onClick={() => setStudySubTab('collections')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
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
            className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              studySubTab === 'batch_sync'
                ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] border border-[var(--border-subtle)] font-semibold shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>批量导入与流水 ({activityLogs.length})</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SUB-TAB 1: EXPLAINABLE MULTI-OBJECTIVE STUDY PLANNER                  */}
      {/* ==================================================================== */}
      {studySubTab === 'planner' && (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Tablet/Mobile Pane Switcher (<1024px) */}
          <div className="lg:hidden px-4 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2 shrink-0">
            <div className="inline-flex rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPlannerMobilePane('candidates')}
                className={`px-2.5 py-1 rounded cursor-pointer whitespace-nowrap ${
                  plannerMobilePane === 'candidates'
                    ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] font-semibold shadow-2xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                候选词列表 ({plannerCandidates.length})
              </button>
              <button
                type="button"
                onClick={() => setPlannerMobilePane('config')}
                className={`px-2.5 py-1 rounded cursor-pointer whitespace-nowrap ${
                  plannerMobilePane === 'config'
                    ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] font-semibold shadow-2xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                策略与四维权重配置
              </button>
            </div>
            <button
              type="button"
              onClick={handleSaveBatchAsCollection}
              disabled={plannerCandidates.length === 0 || isSavingBatch}
              className="px-2.5 py-1 rounded bg-[var(--accent-primary)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-40"
            >
              {justCreated ? '已保存' : `保存批次 (${plannerCandidates.length})`}
            </button>
          </div>

          {/* Left Strategy & 4-Objective Weight Controls */}
          <aside
            className={`w-full lg:w-[340px] xl:w-[370px] lg:border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)] overflow-y-auto p-3.5 sm:p-4 space-y-3.5 shrink-0 ${
              plannerMobilePane === 'config' ? 'flex-1 lg:flex-none block' : 'hidden lg:block'
            }`}
          >
            <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  1. 选择规划策略模式 (6 大策略池)
                </label>
                {isWeightsCustomized && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                    已微调权重
                  </span>
                )}
              </div>
              <select
                value={strategy}
                onChange={(e) => handleStrategyChange(e.target.value as MultiObjectiveStrategyId)}
                aria-label="学习规划策略"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-semibold text-[var(--text-primary)]"
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
            <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-primary)] block">
                    2. 四维评分透明权重调节
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    实时改变当前策略下所有候选词的综合得分与排序
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setWeights(STRATEGY_META[strategy].defaultWeights)}
                  title="重置为当前策略默认权重"
                  className="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-hover)] text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>重置权重</span>
                </button>
              </div>

              {/* 4-Color Live Proportion Bar */}
              <div className="space-y-1.5">
                <div className="h-2 w-full rounded-full overflow-hidden bg-[var(--bg-subtle)] flex p-0.5 gap-0.5">
                  <div
                    className="h-full bg-blue-600 rounded-l-full transition-[width] duration-150"
                    style={{
                      width: `${Math.round((weights.cocaWeight / totalWeightSum) * 100)}%`,
                    }}
                    title={`COCA 词频占比 ${Math.round((weights.cocaWeight / totalWeightSum) * 100)}%`}
                  />
                  <div
                    className="h-full bg-teal-600 transition-[width] duration-150"
                    style={{
                      width: `${Math.round((weights.bncWeight / totalWeightSum) * 100)}%`,
                    }}
                    title={`BNC 词族占比 ${Math.round((weights.bncWeight / totalWeightSum) * 100)}%`}
                  />
                  <div
                    className="h-full bg-indigo-600 transition-[width] duration-150"
                    style={{
                      width: `${Math.round((weights.cetWeight / totalWeightSum) * 100)}%`,
                    }}
                    title={`CET 考纲占比 ${Math.round((weights.cetWeight / totalWeightSum) * 100)}%`}
                  />
                  <div
                    className="h-full bg-amber-500 rounded-r-full transition-[width] duration-150"
                    style={{
                      width: `${Math.round((weights.gapWeight / totalWeightSum) * 100)}%`,
                    }}
                    title={`知识缺口占比 ${Math.round((weights.gapWeight / totalWeightSum) * 100)}%`}
                  />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[10px] font-mono-tabular text-center">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold truncate">
                    COCA {Math.round((weights.cocaWeight / totalWeightSum) * 100)}%
                  </span>
                  <span className="text-teal-600 dark:text-teal-400 font-semibold truncate">
                    BNC {Math.round((weights.bncWeight / totalWeightSum) * 100)}%
                  </span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-semibold truncate">
                    CET {Math.round((weights.cetWeight / totalWeightSum) * 100)}%
                  </span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold truncate">
                    缺口 {Math.round((weights.gapWeight / totalWeightSum) * 100)}%
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
                {[
                  {
                    key: 'cocaWeight' as const,
                    label: 'COCA 2020 当代词频价值',
                    dotClass: 'bg-blue-600',
                    fillClass: 'bg-blue-600',
                    badgeClass:
                      'bg-blue-500/12 text-blue-700 dark:text-blue-300 border-blue-500/25',
                    hexColor: '#2563eb',
                  },
                  {
                    key: 'bncWeight' as const,
                    label: 'BNC 词族频段与派生杠杆',
                    dotClass: 'bg-teal-600',
                    fillClass: 'bg-teal-600',
                    badgeClass:
                      'bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25',
                    hexColor: '#0d9488',
                  },
                  {
                    key: 'cetWeight' as const,
                    label: 'CET 四六级考纲相关性',
                    dotClass: 'bg-indigo-600',
                    fillClass: 'bg-indigo-600',
                    badgeClass:
                      'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/25',
                    hexColor: '#4f46e5',
                  },
                  {
                    key: 'gapWeight' as const,
                    label: '个人高频知识缺口紧迫度',
                    dotClass: 'bg-amber-500',
                    fillClass: 'bg-amber-500',
                    badgeClass:
                      'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25',
                    hexColor: '#d97706',
                  },
                ].map((dim) => {
                  const val = weights[dim.key];
                  const sharePct = Math.round((val / totalWeightSum) * 100);
                  return (
                    <div key={dim.key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${dim.dotClass}`} />
                          <span className="text-[var(--text-primary)] font-medium truncate">
                            {dim.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 font-mono-tabular">
                          <span className="text-[10px] text-[var(--text-muted)]">
                            占比 {sharePct}%
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[11px] font-bold min-w-[34px] text-center ${dim.badgeClass}`}
                          >
                            {val}
                          </span>
                        </div>
                      </div>

                      <div className="relative h-5 flex items-center">
                        <div className="absolute inset-x-0 h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden pointer-events-none">
                          <div
                            className={`h-full rounded-full transition-[width] duration-100 ${dim.fillClass}`}
                            style={{ width: `${val}%` }}
                          />
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          aria-label={dim.label}
                          value={val}
                          onChange={(e) => {
                            const nextVal = Number(e.target.value);
                            setWeights((prev) => ({ ...prev, [dim.key]: nextVal }));
                          }}
                          style={{ '--slider-color': dim.hexColor } as React.CSSProperties}
                          className="lw-range-slider relative z-10 w-full"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Batch Size, Pareto Filter, Save Controls */}
            <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    目标批次容量
                  </label>
                  <select
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono-tabular"
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
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
              </div>

              <label
                className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none"
                title="在当前策略候选池内，筛选在四维得分上不被池内任何其他词全面超越的非支配解"
              >
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={onlyPareto}
                    onChange={(e) => setOnlyPareto(e.target.checked)}
                    className="rounded border-[var(--border-strong)]"
                  />
                  <span>仅保留当前候选池帕累托前沿 (Pool Pareto)</span>
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

              {(effectiveLockedIds.size > 0 || excludedIds.size > 0) && (
                <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
                  <span>
                    已锁定 {effectiveLockedIds.size} 词 · 已排除 {excludedIds.size} 词
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

              {saveError && (
                <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{saveError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveBatchAsCollection}
                disabled={plannerCandidates.length === 0 || isSavingBatch}
                className="w-full py-2 px-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {justCreated ? (
                  <>
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>已保存至学习词集</span>
                  </>
                ) : isSavingBatch ? (
                  <span>正在保存批次…</span>
                ) : (
                  <>生成并保存学习批次 ({plannerCandidates.length} 词)</>
                )}
              </button>
            </div>
          </aside>

          {/* Right Candidate Preview Table with 4-Dimension Breakdown */}
          <div
            className={`flex-1 flex-col min-w-0 min-h-0 bg-[var(--bg-surface)] overflow-hidden ${
              plannerMobilePane === 'candidates' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                  候选词多目标评分明细与候选池帕累托检视 ({plannerCandidates.length} 词)
                </h2>
                <p className="text-[11px] text-[var(--text-muted)] truncate">
                  点击词条可查看详情；锁定词条不会造成行跳动，且在切换策略或调整权重时强制保留在批次内
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
                className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出 Anki TSV</span>
              </button>
            </div>

            {/* Quick Continuous Lock Toolbar */}
            <div className="px-4 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1">
                  <Lock className="w-3 h-3 text-[var(--accent-primary)]" />
                  <span>快速批量锁定:</span>
                </span>
                <button
                  type="button"
                  onClick={() => applyLockRange(0, 19, true)}
                  className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  锁前 20
                </button>
                <button
                  type="button"
                  onClick={() => applyLockRange(0, 49, true)}
                  className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  锁前 50
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLockedIds((prev) => {
                      const next = new Set(prev);
                      for (const c of plannerCandidates) {
                        if (c.isParetoOptimal) next.add(c.word.id);
                      }
                      return next;
                    });
                  }}
                  className="px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium cursor-pointer"
                >
                  锁帕累托前沿
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLockedIds((prev) => {
                      const next = new Set(prev);
                      for (const c of plannerCandidates) {
                        if (next.has(c.word.id)) next.delete(c.word.id);
                        else next.add(c.word.id);
                      }
                      return next;
                    });
                  }}
                  className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  反选本页锁定
                </button>
                {effectiveLockedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setLockedIds(new Set())}
                    className="px-2 py-0.5 rounded text-rose-600 hover:bg-rose-500/10 font-medium cursor-pointer"
                  >
                    清空锁定 ({effectiveLockedIds.size})
                  </button>
                )}
              </div>
              <span className="text-[10px] text-[var(--text-muted)] hidden sm:inline">
                支持鼠标拖动、触屏点选、键盘空格与 Shift+点击区间锁定（锁定不会改变当前行位置）
              </span>
            </div>

            <div className="flex-1 overflow-auto min-h-0">
              <div className="min-w-[540px] flex flex-col min-h-full">
                <div className="grid grid-cols-[54px_minmax(105px,1.15fr)_88px_minmax(110px,1.25fr)_96px] xl:grid-cols-[56px_minmax(115px,1.15fr)_92px_136px_minmax(120px,1.3fr)_100px] gap-x-2.5 items-center px-4 py-2 bg-[var(--bg-subtle)]/60 border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] sticky top-0 z-10 backdrop-blur-xs">
                  <div>锁定/序号</div>
                  <div>候选词条 · 考纲 · 词性</div>
                  <div>COCA · BNC</div>
                  <div className="hidden xl:block">四维得分拆解 (0–100)</div>
                  <div>可解释推荐依据</div>
                  <div className="text-right">总分 / 干预</div>
                </div>

                <div className="divide-y divide-[var(--border-subtle)] select-none">
                  {plannerCandidates.map((cand, idx) => {
                    const w = cand.word;
                    const isLocked = effectiveLockedIds.has(w.id);
                    const posMeta = w.cocaPrimaryPos ? COCA_POS_META[w.cocaPrimaryPos] : undefined;
                    return (
                      <div
                        key={w.id}
                        onClick={() => onSelectWord(w)}
                        onMouseEnter={() => handleLockRowMouseEnter(idx, w.id)}
                        className={`grid grid-cols-[54px_minmax(105px,1.15fr)_88px_minmax(110px,1.25fr)_96px] xl:grid-cols-[56px_minmax(115px,1.15fr)_92px_136px_minmax(120px,1.3fr)_100px] gap-x-2.5 items-center px-4 py-2 text-xs hover:bg-[var(--bg-hover)] cursor-pointer transition-colors ${
                          isLocked ? 'bg-[var(--accent-soft)]/50' : ''
                        }`}
                      >
                        <div
                          className="flex items-center gap-1.5 font-mono-tabular text-[11px] text-[var(--text-muted)]"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => handleLockMouseDown(idx, w.id, e)}
                          title="点击、按住上下拖动或 Shift+点击区间锁定到当前批次"
                        >
                          <input
                            type="checkbox"
                            checked={isLocked}
                            onChange={() => {}}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault();
                                toggleSingleLock(idx, w.id, e.shiftKey);
                              }
                            }}
                            onTouchEnd={(e) => {
                              e.stopPropagation();
                              toggleSingleLock(idx, w.id, false);
                            }}
                            aria-label={`锁定 ${w.word} 到当前批次`}
                            className="rounded border-[var(--border-strong)] cursor-pointer accent-blue-600"
                          />
                          <span>{idx + 1}.</span>
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
                                title="当前策略候选池帕累托前沿解：在当前候选池四维目标上不被任何其他候选词全面支配"
                                className="px-1 py-0.2 rounded bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[9px] font-mono-tabular font-semibold shrink-0"
                              >
                                Pareto
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono-tabular">
                            {w.isCet4 && (
                              <span className="px-1 py-0.2 rounded bg-teal-500/12 text-teal-700 dark:text-teal-300 font-semibold">
                                CET-4
                              </span>
                            )}
                            {w.isCet6 && (
                              <span className="px-1 py-0.2 rounded bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 font-semibold">
                                CET-6
                              </span>
                            )}
                            {posMeta && (
                              <span
                                className={`px-1 py-0.2 rounded text-[9px] font-semibold ${posMeta.badgeClass}`}
                              >
                                {posMeta.shortLabel.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="font-mono-tabular text-[11px] pr-2 truncate">
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

                        {/* 4-Dimension Mini Bars (xl+) */}
                        <div
                          className="hidden xl:block pr-3 space-y-1 font-mono-tabular text-[9px]"
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

                        {/* Explainable Reasons */}
                        <div className="pr-2 flex flex-wrap gap-1">
                          {cand.explainableReasons.slice(0, 2).map((reason, rIdx) => (
                            <span
                              key={rIdx}
                              className="px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-[10px] truncate max-w-full"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>

                        {/* Score & Pin/Exclude Actions */}
                        <div
                          className="flex items-center justify-end gap-1.5 font-mono-tabular"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-xs font-bold text-[var(--accent-primary)]">
                            {cand.compositeScore.toFixed(1)}
                          </span>
                          <button
                            type="button"
                            onMouseDown={(e) => handleLockMouseDown(idx, w.id, e)}
                            title={
                              isLocked
                                ? '取消锁定'
                                : '锁定保留到当前批次 (支持按住上下滑动连续锁定)'
                            }
                            className={`p-1 rounded cursor-pointer select-none ${
                              isLocked
                                ? 'bg-[var(--accent-primary)] text-white'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
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
                            onClick={() => {
                              setExcludedIds((prev) => new Set(prev).add(w.id));
                              setLockedIds((prev) => {
                                const next = new Set(prev);
                                next.delete(w.id);
                                return next;
                              });
                            }}
                            title="从本次候选中排除此词"
                            className="p-1 rounded text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
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
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 2: COLLECTIONS & STUDY PLANS                                  */}
      {/* ==================================================================== */}
      {studySubTab === 'collections' && (
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Compact Mobile Collection Selector (<768px) */}
          <div className="md:hidden px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-between gap-2 shrink-0">
            <select
              value={activeCollection?.id || ''}
              onChange={(e) => {
                setSelectedCollectionId(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="选择词集"
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] truncate"
            >
              {collections.map((col) => {
                const stats = collectionResolvedMap.get(col.id);
                return (
                  <option key={col.id} value={col.id}>
                    {col.name} ({stats?.total || 0} 词)
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="px-2.5 py-1.5 rounded bg-[var(--accent-primary)] text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建</span>
            </button>
          </div>

          <aside className="hidden md:flex md:w-[260px] lg:w-[290px] border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex-col shrink-0 min-h-0">
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
                const stats = collectionResolvedMap.get(col.id) || {
                  total: 0,
                  mastered: 0,
                  pct: 0,
                };

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
                        aria-label={`删除词集 ${col.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-secondary)]">
                      <span>{stats.total.toLocaleString()} 词</span>
                      <span>
                        掌握 {stats.mastered} ({stats.pct}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1 bg-[var(--bg-subtle)] rounded-xs overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-[width]"
                        style={{ width: `${stats.pct}%` }}
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
                        <span>在检索视图打开</span>
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

                <div className="flex-1 overflow-auto min-h-0">
                  <div className="min-w-[460px] flex flex-col min-h-full">
                    <div className="grid grid-cols-[minmax(110px,1.3fr)_100px_minmax(90px,1fr)_74px] sm:grid-cols-[minmax(120px,1.3fr)_110px_64px_minmax(100px,1fr)_82px_76px] gap-x-2.5 items-center px-4 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] sticky top-0 z-10">
                      <div>词条</div>
                      <div>COCA 排名 · 词性</div>
                      <div className="hidden sm:block">大纲</div>
                      <div>BNC 词族</div>
                      <div className="hidden sm:block text-right pr-2">BNC 频次</div>
                      <div className="text-right">状态</div>
                    </div>

                    <div className="divide-y divide-[var(--border-subtle)]">
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
                            className="grid grid-cols-[minmax(110px,1.3fr)_100px_minmax(90px,1fr)_74px] sm:grid-cols-[minmax(120px,1.3fr)_110px_64px_minmax(100px,1fr)_82px_76px] gap-x-2.5 items-center px-4 py-2 hover:bg-[var(--bg-hover)] cursor-pointer text-xs transition-colors"
                          >
                            <div className="min-w-0 pr-2 flex items-baseline gap-1.5">
                              <span
                                translate="no"
                                className="font-serif-lexicon font-semibold text-sm text-[var(--text-primary)] truncate"
                              >
                                {entry.word}
                              </span>
                            </div>

                            <div className="font-mono-tabular text-[11px] pr-2 flex items-center gap-1 truncate">
                              {entry.inCoca ? (
                                <>
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
                                      {COCA_POS_META[entry.cocaPrimaryPos]?.shortLabel.split(' ')[0] ||
                                        entry.cocaPrimaryPos}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-[var(--text-muted)]">—</span>
                              )}
                            </div>

                            <div className="hidden sm:flex items-center gap-1 font-mono-tabular text-[10px]">
                              {entry.isCet4 && (
                                <span className="px-1 py-0.2 rounded bg-teal-500/12 text-teal-700 dark:text-teal-300 font-semibold">
                                  CET-4
                                </span>
                              )}
                              {entry.isCet6 && (
                                <span className="px-1 py-0.2 rounded bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 font-semibold">
                                  CET-6
                                </span>
                              )}
                              {!entry.isCet4 && !entry.isCet6 && (
                                <span className="text-[var(--text-muted)]">—</span>
                              )}
                            </div>

                            <div className="font-mono-tabular text-[11px] text-[var(--text-secondary)] truncate pr-2">
                              {entry.band ? `${entry.band} · ${entry.headword}` : '—'}
                            </div>

                            <div className="hidden sm:block text-right pr-2 font-mono-tabular text-[11px] text-[var(--text-secondary)]">
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
                  </div>
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
                  placeholder="work, ability, climate change…"
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
