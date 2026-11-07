import React, { useState, useMemo } from 'react';
import {
  LexiconWordItem,
  BncCocaFamily,
  UserWordRecord,
  WordCollection,
  LearningStatus,
  LEARNING_STATUS_META,
  FilterCriteria,
} from '../data/types.ts';
import {
  DEFAULT_FILTER_CRITERIA,
  computeStudyPriorityScore,
  filterAndSortWords,
} from '../data/searchAndFilter.ts';
import {
  Plus,
  Trash2,
  Download,
  Compass,
  Check,
  Sparkles,
} from 'lucide-react';

interface CollectionsAndPlannerViewProps {
  collections: WordCollection[];
  words: LexiconWordItem[];
  wordsMap: Map<string, LexiconWordItem>;
  familiesMap: Map<string, BncCocaFamily>;
  userRecordsMap: Map<string, UserWordRecord>;
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
}

type PresetStrategy =
  | 'cet4_core_1k_3k'
  | 'cet4_remaining'
  | 'cet6_core_2k_5k'
  | 'high_value_family_roots'
  | 'family_completion';

const ALL_STATUSES: LearningStatus[] = ['unrated', 'queued', 'learning', 'mastered', 'deferred'];

const CLOSED_CLASS_STOPWORDS = new Set([
  'the', 'be', 'being', 'been', 'am', 'is', 'are', 'was', 'were', 'of', 'and', 'to', 'a', 'an',
  'in', 'that', 'it', 'its', 'itself', 'for', 'i', 'me', 'my', 'mine', 'myself', 'on', 'you',
  'your', 'yours', 'yourself', 'with', 'as', 'he', 'him', 'his', 'himself', 'at', 'by', 'this',
  'these', 'those', 'have', 'has', 'had', 'having', 'from', 'or', 'one', 'not', 'but', 'what',
  'all', 'we', 'us', 'our', 'ours', 'when', 'can', 'could', 'there', 'she', 'her', 'hers',
  'which', 'their', 'theirs', 'they', 'them', 'will', 'would', 'who', 'whom', 'whose', 'do',
  'does', 'did', 'done', 'doing', 'no', 'yes', 'so', 'if', 'up', 'out', 'about', 'into', 'than',
  'then', 'now', 'only', 'other', 'some', 'such', 'more', 'most', 'very', 'also', 'any', 'each',
]);

export const CollectionsAndPlannerView: React.FC<CollectionsAndPlannerViewProps> = ({
  collections,
  words,
  wordsMap,
  familiesMap,
  userRecordsMap,
  onSelectWord,
  onStatusChange,
  onCreateCollection,
  onDeleteCollection,
  onApplyDynamicCollectionToExplore,
  onBatchSetStatus,
  onExportWordList,
}) => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>(
    collections[0]?.id || 'builtin-cet4-core'
  );
  const [mobilePane, setMobilePane] = useState<'list' | 'planner'>('list');
  const [strategy, setStrategy] = useState<PresetStrategy>('cet4_core_1k_3k');
  const [batchSize, setBatchSize] = useState<number>(50);
  const [batchName, setBatchName] = useState<string>('');
  const [justCreated, setJustCreated] = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newWordsRaw, setNewWordsRaw] = useState('');

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

  const plannerCandidates = useMemo(() => {
    const masteredFamilies = new Set<string>();
    for (const [wordId, rec] of userRecordsMap.entries()) {
      if (rec.status === 'mastered') {
        const entry = wordsMap.get(wordId);
        if (entry?.familyId) masteredFamilies.add(entry.familyId);
      }
    }

    const candidates = words.filter((w) => {
      if (CLOSED_CLASS_STOPWORDS.has(w.normalized) || w.normalized.length <= 2) return false;
      const status = userRecordsMap.get(w.id)?.status || 'unrated';
      if (status === 'mastered' || status === 'deferred') return false;

      switch (strategy) {
        case 'cet4_core_1k_3k':
          return w.isCet4 && w.bandNumber !== null && w.bandNumber >= 1 && w.bandNumber <= 3;
        case 'cet4_remaining':
          return w.isCet4;
        case 'cet6_core_2k_5k':
          return w.isCet6 && w.bandNumber !== null && w.bandNumber >= 2 && w.bandNumber <= 5;
        case 'high_value_family_roots':
          return (
            w.isHeadword &&
            w.bandNumber !== null &&
            w.bandNumber <= 4 &&
            (w.familyMemberCount || 1) >= 5
          );
        case 'family_completion':
          return (
            !w.isHeadword &&
            w.familyId !== null &&
            masteredFamilies.has(w.familyId) &&
            (w.isCet4 || w.isCet6 || (w.formFrequency || 0) >= 500)
          );
        default:
          return true;
      }
    });

    const scored = candidates.map((entry) => {
      const rec = userRecordsMap.get(entry.id);
      const { score, reason } = computeStudyPriorityScore(
        entry,
        rec,
        entry.familyId && masteredFamilies.has(entry.familyId) ? 0.5 : 0
      );
      return { entry, score, reason };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.entry.familyFrequency || 0) - (a.entry.familyFrequency || 0);
    });
    return scored.slice(0, batchSize);
  }, [words, wordsMap, userRecordsMap, strategy, batchSize]);

  const handleSaveBatchAsCollection = () => {
    if (plannerCandidates.length === 0) return;
    const strategyNames: Record<PresetStrategy, string> = {
      cet4_core_1k_3k: 'CET-4 核心词批次',
      cet4_remaining: 'CET-4 查漏补缺批次',
      cet6_core_2k_5k: 'CET-6 核心进阶批次',
      high_value_family_roots: '高价值大词族首词批次',
      family_completion: '熟词族派生词补全批次',
    };
    const dateStr = new Date().toISOString().slice(5, 10);
    const finalName =
      batchName.trim() || `${strategyNames[strategy]} (${dateStr} · ${plannerCandidates.length}词)`;
    const ids = plannerCandidates.map((c) => c.entry.id);
    onCreateCollection({
      name: finalName,
      description: `由智能规划器生成，共 ${ids.length} 词`,
      type: 'study_plan',
      wordIds: ids,
      planMetadata: {
        targetCount: ids.length,
        formulaDescription: strategyNames[strategy],
        createdAt: new Date().toISOString(),
      },
    });
    onBatchSetStatus(ids, 'queued');
    setBatchName('');
    setJustCreated(true);
    setTimeout(() => setJustCreated(false), 2000);
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
      wordIds: ids,
    });
    setShowNewModal(false);
    setNewName('');
    setNewDesc('');
    setNewWordsRaw('');
  };

  const maxFreqInCollection = useMemo(() => {
    if (activeCollectionWords.length === 0) return 10000;
    return Math.max(...activeCollectionWords.map((w) => w.formFrequency || 0), 100);
  }, [activeCollectionWords]);

  return (
    <div className="flex flex-col xl:flex-row h-full min-h-0 bg-[var(--bg-surface)] overflow-hidden">
      {/* Sub-View Switcher (<1280px) so medium screens (768px-1279px) never squeeze 3 columns simultaneously */}
      <div className="xl:hidden min-h-[42px] py-1.5 px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setMobilePane('list')}
            className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
              mobilePane === 'list'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            词集列表 ({collections.length})
          </button>
          <button
            type="button"
            onClick={() => setMobilePane('planner')}
            className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
              mobilePane === 'planner'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            下一批规划器
          </button>
        </div>

        {mobilePane === 'list' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={activeCollection?.id || ''}
              onChange={(e) => setSelectedCollectionId(e.target.value)}
              aria-label="选择词集"
              className="max-w-[200px] sm:max-w-[260px] px-2.5 py-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs font-medium text-[var(--text-primary)] truncate"
            >
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.type === 'dynamic' ? `动态 · ${c.name}` : c.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--accent-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              新建词集
            </button>

            {activeCollection && (
              <button
                type="button"
                onClick={() => onDeleteCollection(activeCollection.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-rose-500 whitespace-nowrap shrink-0 cursor-pointer"
                title="删除当前词集"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">删除</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Zone 1: Left Collections Directory (Wide Desktop >=1280px) */}
      <aside className="hidden xl:flex xl:w-[260px] border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex-col shrink-0 h-full min-h-0">
        <div className="px-3.5 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
            词集与学习批次 ({collections.length})
          </span>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                    col.sortField || 'form_freq_desc',
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
                onClick={() => setSelectedCollectionId(col.id)}
                className={`p-3 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[var(--accent-soft)]'
                    : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`text-xs font-semibold leading-snug ${
                      isSelected
                        ? 'text-[var(--accent-primary)]'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {col.type === 'dynamic' ? `动态 · ${col.name}` : col.name}
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
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-secondary)]">
                  <span>{total.toLocaleString()} 词</span>
                  <span>
                    已掌握 {mastered} ({pct}%)
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

      {/* Zone 2: Center Collection Word Table */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 h-full bg-[var(--bg-surface)] overflow-hidden ${
          mobilePane === 'list' ? 'flex' : 'hidden xl:flex'
        }`}
      >
        {activeCollection ? (
          <>
            <div className="px-4 sm:px-5 py-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2.5 shrink-0 bg-[var(--bg-surface)]">
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)] truncate">
                  {activeCollection.name}
                </h2>
                <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                  {activeCollection.description} · 共 {activeCollectionWords.length.toLocaleString()} 词
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
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded text-xs font-medium hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    在词库中筛选
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onExportWordList(activeCollectionWords, activeCollection.name, 'txt')
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded text-xs font-medium hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  导出 TXT
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onExportWordList(activeCollectionWords, activeCollection.name, 'csv')
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded text-xs font-medium hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  导出 CSV
                </button>
              </div>
            </div>

            {/* Table Column Header */}
            <div className="grid grid-cols-[minmax(105px,1.4fr)_58px_100px_76px] md:grid-cols-[minmax(125px,1.4fr)_64px_minmax(95px,1fr)_126px_80px] items-center px-4 sm:px-5 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
              <div>词条</div>
              <div>大纲</div>
              <div className="hidden md:block">词族与频段</div>
              <div className="text-right pr-2">词形 / 词族频次</div>
              <div className="text-right">状态</div>
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
              {activeCollectionWords.slice(0, 300).map((entry) => {
                const status = userRecordsMap.get(entry.id)?.status || 'unrated';
                const statusMeta = LEARNING_STATUS_META[status];
                const barWidth = Math.min(
                  100,
                  Math.max(
                    4,
                    Math.round(
                      (Math.log10((entry.formFrequency || 0) + 1) /
                        Math.log10(maxFreqInCollection + 1)) *
                        100
                    )
                  )
                );

                return (
                  <div
                    key={entry.id}
                    onClick={() => onSelectWord(entry)}
                    className="grid grid-cols-[minmax(105px,1.4fr)_58px_100px_76px] md:grid-cols-[minmax(125px,1.4fr)_64px_minmax(95px,1fr)_126px_80px] items-center px-4 sm:px-5 py-2 hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                  >
                    <div className="min-w-0 pr-2 flex items-baseline gap-1.5">
                      <span
                        translate="no"
                        className="font-serif-lexicon font-semibold text-sm text-[var(--text-primary)] truncate"
                      >
                        {entry.word}
                      </span>
                      {!entry.isHeadword && entry.headword && (
                        <span translate="no" className="text-[11px] text-[var(--text-muted)] truncate">
                          ← {entry.headword}
                        </span>
                      )}
                    </div>

                    <div className="text-xs font-mono-tabular whitespace-nowrap">
                      {entry.isCet4 && (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          CET-4
                        </span>
                      )}
                      {entry.isCet6 && (
                        <span className="text-indigo-700 dark:text-indigo-400 font-semibold">
                          CET-6
                        </span>
                      )}
                      {!entry.isCet4 && !entry.isCet6 && (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </div>

                    <div className="hidden md:flex items-center gap-1.5 text-xs font-mono-tabular text-[var(--text-secondary)] truncate pr-2">
                      {entry.band ? (
                        <>
                          <span className="font-semibold text-[var(--text-primary)]">
                            {entry.band}
                          </span>
                          <span className="text-[var(--text-muted)]">·</span>
                          <span translate="no" className="font-serif-lexicon truncate">
                            {entry.headword}
                          </span>
                        </>
                      ) : (
                        <span className="text-[var(--text-muted)]">大纲外词</span>
                      )}
                    </div>

                    <div className="text-right pr-2 font-mono-tabular">
                      <div className="flex items-baseline justify-end gap-1 text-xs whitespace-nowrap">
                        <span className="font-medium text-[var(--text-primary)]">
                          {(entry.formFrequency || 0).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          /{(entry.familyFrequency || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="hidden md:block h-1 w-20 ml-auto mt-1 bg-[var(--bg-subtle)] rounded-xs overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent-primary)] opacity-75"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
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
                        className={`appearance-none text-center px-1.5 py-0.5 rounded text-[11px] font-medium border cursor-pointer transition-colors ${statusMeta.badgeClass}`}
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
          </>
        ) : null}
      </div>

      {/* Zone 3: Right Next-Batch Planner Studio (xl+ 360px, or full width when planner tab selected on <1280px) */}
      <aside
        className={`w-full xl:w-[360px] xl:border-l border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex-col shrink-0 flex-1 xl:flex-initial h-full min-h-0 overflow-hidden ${
          mobilePane === 'planner' ? 'flex' : 'hidden xl:flex'
        }`}
      >
        <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--text-primary)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              下一批学习规划器
            </h3>
            <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">多维加权排序</span>
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1">
                选词策略 (已自动过滤基础虚词)
              </label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as PresetStrategy)}
                className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="cet4_core_1k_3k">CET-4 高频核心实词 (1k–3k 未掌握)</option>
                <option value="cet6_core_2k_5k">CET-6 核心学术进阶 (2k–5k 未掌握)</option>
                <option value="high_value_family_roots">高派生大词族首词 (1k–4k · 成员≥5)</option>
                <option value="family_completion">已掌握词族的未学派生词补全</option>
                <option value="cet4_remaining">CET-4 全量查漏补缺</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1">
                  批次词数
                </label>
                <select
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs font-mono-tabular text-[var(--text-primary)] focus:outline-none"
                >
                  <option value={30}>30 词 / 批</option>
                  <option value={50}>50 词 / 批</option>
                  <option value={100}>100 词 / 批</option>
                  <option value={200}>200 词 / 批</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1">
                  批次名称 (选填)
                </label>
                <input
                  type="text"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="自动按日期命名..."
                  className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveBatchAsCollection}
              disabled={plannerCandidates.length === 0}
              className="w-full py-2 px-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {justCreated ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  已生成词集并标为待学
                </>
              ) : (
                <>生成学习批次 ({plannerCandidates.length} 词)</>
              )}
            </button>
          </div>
        </div>

        {/* Candidate Preview List */}
        <div className="px-4 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
          <span>候选实词优先级预览 (Top {Math.min(plannerCandidates.length, 30)})</span>
          <span>综合权重分</span>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
          {plannerCandidates.slice(0, 30).map(({ entry, score }, idx) => (
            <div
              key={entry.id}
              onClick={() => onSelectWord(entry)}
              className="px-4 py-2 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] cursor-pointer flex items-center justify-between gap-2 transition-colors"
            >
              <div className="min-w-0 flex items-baseline gap-2">
                <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] w-5">
                  {idx + 1}.
                </span>
                <span
                  translate="no"
                  className="font-serif-lexicon font-semibold text-xs text-[var(--text-primary)] truncate"
                >
                  {entry.word}
                </span>
                <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] shrink-0">
                  {entry.band || '—'}
                  {entry.isCet4 ? ' · CET4' : entry.isCet6 ? ' · CET6' : ''}
                </span>
              </div>
              <span className="text-xs font-mono-tabular font-semibold text-[var(--accent-primary)] shrink-0">
                {score}
              </span>
            </div>
          ))}
        </div>
      </aside>

      {/* New Custom Collection Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowNewModal(false)}
        >
          <form
            onSubmit={handleCreateCustomCollection}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md shadow-xl overflow-hidden"
          >
            <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">新建自定义词集</h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                关闭
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  词集名称
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例如：经济学人真题高频词"
                  className="w-full px-3 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  备注说明 (选填)
                </label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="来源或学习目标..."
                  className="w-full px-3 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  初始词表 (每行或逗号分隔，自动匹配词库)
                </label>
                <textarea
                  rows={5}
                  value={newWordsRaw}
                  onChange={(e) => setNewWordsRaw(e.target.value)}
                  placeholder="govern, ability, sustainable..."
                  className="w-full px-3 py-2 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-3 py-1.5 rounded text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[var(--accent-primary)] text-white rounded text-xs font-semibold cursor-pointer"
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
