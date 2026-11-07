import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search,
  SlidersHorizontal,
  X,
  CheckSquare,
  Square,
  Download,
  RotateCcw,
  ListChecks,
  MoreHorizontal,
} from 'lucide-react';
import {
  FilterCriteria,
  LEARNING_STATUS_META,
  LearningStatus,
  LexiconWordItem,
  SortField,
  UserWordRecord,
  WordCollection,
} from '../data/types.ts';
import { DEFAULT_FILTER_CRITERIA } from '../data/searchAndFilter.ts';
import {
  formatCompactFrequency,
  formatFamilyRoleAndShare,
  getIntraFamilySharePct,
} from '../utils/frequency.ts';

interface ExploreViewProps {
  filteredWords: LexiconWordItem[];
  totalWordsCount: number;
  criteria: FilterCriteria;
  onChangeCriteria: (next: FilterCriteria) => void;
  sortField: SortField;
  onChangeSortField: (next: SortField) => void;
  userRecordsMap: Map<string, UserWordRecord>;
  allKnownTags: string[];
  collections: WordCollection[];
  activeStaticCollectionId: string | null;
  onSelectStaticCollectionId: (id: string | null) => void;
  selectedWordId: string | null;
  onSelectWord: (word: LexiconWordItem, openDrawer?: boolean) => void;
  onInspectFamily: (familyId: string, highlightWordId?: string) => void;
  onQuickStatusChange: (wordId: string, wordDisplay: string, status: LearningStatus) => void;
  onBatchSetStatus: (wordIds: string[], status: LearningStatus) => void;
  onBatchAddTag: (wordIds: string[], tag: string) => void;
  onSaveDynamicCollection: (name: string, description: string) => void;
  onExportCurrentWords?: (format: 'txt' | 'csv') => void;
  compactDensity?: boolean;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
}

const SOURCE_SCOPES: { id: FilterCriteria['sourceFilter']; label: string; shortLabel: string }[] = [
  { id: 'all', label: '全部词库', shortLabel: '全部' },
  { id: 'cet_all', label: '四六级全集', shortLabel: '四六级' },
  { id: 'cet4', label: 'CET-4 大纲', shortLabel: 'CET-4' },
  { id: 'cet6', label: 'CET-6 大纲 (含共词)', shortLabel: 'CET-6全' },
  { id: 'cet6_new', label: 'CET-6 新增 (★独有)', shortLabel: 'CET-6★' },
  { id: 'both_cet_bnc', label: '大纲 ∩ BNC', shortLabel: '大纲∩BNC' },
  { id: 'cet_only', label: '仅大纲词', shortLabel: '仅大纲' },
  { id: 'bnc_all', label: 'BNC 25k', shortLabel: 'BNC 25k' },
];

const BAND_RANGES: { label: string; min: number | null; max: number | null }[] = [
  { label: '全频段', min: null, max: null },
  { label: '1k–3k', min: 1, max: 3 },
  { label: '4k–6k', min: 4, max: 6 },
  { label: '7k–10k', min: 7, max: 10 },
  { label: '11k–15k', min: 11, max: 15 },
  { label: '16k–25k', min: 16, max: 25 },
];

const ALL_STATUSES: LearningStatus[] = ['unrated', 'queued', 'learning', 'mastered', 'deferred'];

export const ExploreView: React.FC<ExploreViewProps> = ({
  filteredWords,
  totalWordsCount,
  criteria,
  onChangeCriteria,
  sortField,
  onChangeSortField,
  userRecordsMap,
  collections,
  activeStaticCollectionId,
  onSelectStaticCollectionId,
  selectedWordId,
  onSelectWord,
  onInspectFamily,
  onQuickStatusChange,
  onBatchSetStatus,
  onBatchAddTag,
  onSaveDynamicCollection,
  onExportCurrentWords,
  compactDensity = true,
  initialScrollOffset = 0,
  onScrollOffsetChange,
}) => {
  const [showAdvancedDrawer, setShowAdvancedDrawer] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [batchTagInput, setBatchTagInput] = useState('');
  const [showBatchMoreMenu, setShowBatchMoreMenu] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  // Measure actual table container width via ResizeObserver so columns adapt to available space
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, []);

  const isCompactCardLayout = containerWidth < 560;
  const isWideTableLayout = containerWidth >= 760;

  // Anchor index for Shift+Click & Shift+Arrow range selection
  const lastAnchorIndexRef = useRef<number | null>(null);

  // Drag-to-select state (paint selection across checkbox column)
  const dragSelectStateRef = useRef<{
    active: boolean;
    mode: 'add' | 'remove';
  }>({ active: false, mode: 'add' });

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragSelectStateRef.current.active) {
        dragSelectStateRef.current.active = false;
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const rowHeight = isCompactCardLayout ? 56 : compactDensity ? 40 : 48;

  const rowVirtualizer = useVirtualizer({
    count: filteredWords.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 18,
    initialOffset: initialScrollOffset,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowHeight, rowVirtualizer]);

  // Restore initialScrollOffset on mount
  const didRestoreScrollRef = useRef(false);
  useEffect(() => {
    if (!didRestoreScrollRef.current && initialScrollOffset > 0 && parentRef.current) {
      parentRef.current.scrollTop = initialScrollOffset;
      didRestoreScrollRef.current = true;
    }
  }, [initialScrollOffset]);

  const statusCounts = useMemo(() => {
    const counts: Record<LearningStatus, number> = {
      unrated: 0,
      queued: 0,
      learning: 0,
      mastered: 0,
      deferred: 0,
    };
    for (const rec of userRecordsMap.values()) {
      if (counts[rec.status] !== undefined) counts[rec.status]++;
    }
    counts.unrated = Math.max(
      0,
      totalWordsCount - (counts.queued + counts.learning + counts.mastered + counts.deferred)
    );
    return counts;
  }, [userRecordsMap, totalWordsCount]);

  const toggleStatusFilter = (st: LearningStatus) => {
    const exists = criteria.statuses.includes(st);
    const next = exists
      ? criteria.statuses.filter((s) => s !== st)
      : [...criteria.statuses, st];
    onChangeCriteria({ ...criteria, statuses: next });
  };

  // Range selection helper between two indices in filteredWords
  const applyRangeSelection = useCallback(
    (fromIndex: number, toIndex: number, targetChecked: boolean) => {
      if (filteredWords.length === 0) return;
      const start = Math.max(0, Math.min(fromIndex, toIndex));
      const end = Math.min(filteredWords.length - 1, Math.max(fromIndex, toIndex));
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          const id = filteredWords[i].id;
          if (targetChecked) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [filteredWords]
  );

  // Handle checkbox or select-mode row interaction (supports Click, Shift+Click range, and Drag start)
  const handleSelectAtRow = useCallback(
    (index: number, shiftKey: boolean, forceMode?: 'add' | 'remove') => {
      const word = filteredWords[index];
      if (!word) return;
      const currentlyChecked = selectedRowIds.has(word.id);
      const nextChecked =
        forceMode === 'add' ? true : forceMode === 'remove' ? false : !currentlyChecked;

      if (shiftKey && lastAnchorIndexRef.current !== null) {
        applyRangeSelection(lastAnchorIndexRef.current, index, nextChecked);
      } else {
        setSelectedRowIds((prev) => {
          const next = new Set(prev);
          if (nextChecked) next.add(word.id);
          else next.delete(word.id);
          return next;
        });
      }
      lastAnchorIndexRef.current = index;
    },
    [filteredWords, selectedRowIds, applyRangeSelection]
  );

  const handleSelectTopN = (n: number) => {
    const next = new Set<string>();
    const limit = Math.min(n, filteredWords.length);
    for (let i = 0; i < limit; i++) {
      next.add(filteredWords[i].id);
    }
    setSelectedRowIds(next);
    if (limit > 0) lastAnchorIndexRef.current = limit - 1;
  };

  const handleInvertTopN = (n: number) => {
    const limit = Math.min(n, filteredWords.length);
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < limit; i++) {
        const id = filteredWords[i].id;
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedRowIds(new Set());
    lastAnchorIndexRef.current = null;
  };

  // Dedicated Keyboard Navigation & Selection Handler for ExploreView
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable;

      if (isEditable || showSaveModal) return;

      if (e.key === 'Escape') {
        if (selectedRowIds.size > 0 || isSelectMode) {
          e.preventDefault();
          setSelectedRowIds(new Set());
          setIsSelectMode(false);
          setShowBatchMoreMenu(false);
        }
        return;
      }

      if (filteredWords.length === 0) return;

      const currentIdx = filteredWords.findIndex((w) => w.id === selectedWordId);

      // ArrowDown / ArrowUp: move active row + scroll virtual list + optional Shift range select
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (target && tag === 'button') {
          target.blur();
        }
        const nextIdx =
          e.key === 'ArrowDown'
            ? currentIdx < 0
              ? 0
              : Math.min(filteredWords.length - 1, currentIdx + 1)
            : currentIdx <= 0
              ? 0
              : currentIdx - 1;

        const nextWord = filteredWords[nextIdx];
        if (!nextWord) return;

        onSelectWord(nextWord, false);
        rowVirtualizer.scrollToIndex(nextIdx, { align: 'auto' });

        if (e.shiftKey) {
          const anchor = lastAnchorIndexRef.current ?? (currentIdx >= 0 ? currentIdx : nextIdx);
          applyRangeSelection(anchor, nextIdx, true);
        } else {
          lastAnchorIndexRef.current = nextIdx;
        }
        return;
      }

      // Space or 'x': toggle selection of the active cursor row
      if (e.key === ' ' || e.key.toLowerCase() === 'x') {
        if (currentIdx >= 0) {
          e.preventDefault();
          const activeWord = filteredWords[currentIdx];
          setSelectedRowIds((prev) => {
            const next = new Set(prev);
            if (next.has(activeWord.id)) next.delete(activeWord.id);
            else next.add(activeWord.id);
            return next;
          });
          lastAnchorIndexRef.current = currentIdx;
        }
        return;
      }

      // Enter: explicitly open/focus the dictionary detail sheet for the active row
      if (e.key === 'Enter') {
        if (currentIdx >= 0) {
          e.preventDefault();
          onSelectWord(filteredWords[currentIdx], true);
        }
        return;
      }

      // 1-5 shortcuts: if multiple rows are selected, apply batch status; otherwise update active row
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        const statusByNum: Record<string, LearningStatus> = {
          '1': 'unrated',
          '2': 'queued',
          '3': 'learning',
          '4': 'mastered',
          '5': 'deferred',
        };
        const nextSt = statusByNum[e.key];
        if (!nextSt) return;
        e.preventDefault();
        if (selectedRowIds.size > 0) {
          onBatchSetStatus(Array.from(selectedRowIds), nextSt);
        } else if (currentIdx >= 0) {
          const activeWord = filteredWords[currentIdx];
          onQuickStatusChange(activeWord.id, activeWord.word, nextSt);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    filteredWords,
    selectedWordId,
    selectedRowIds,
    isSelectMode,
    showSaveModal,
    rowVirtualizer,
    onSelectWord,
    onBatchSetStatus,
    onQuickStatusChange,
    applyRangeSelection,
  ]);

  const hasNonDefaultFilters =
    Boolean(activeStaticCollectionId) ||
    criteria.searchQuery.trim() !== '' ||
    criteria.sourceFilter !== 'all' ||
    criteria.statuses.length > 0 ||
    criteria.bands.length > 0 ||
    criteria.minBand !== null ||
    criteria.maxBand !== null ||
    criteria.minFormFreq !== null ||
    criteria.maxFormFreq !== null ||
    criteria.minFamilyFreq !== null ||
    criteria.maxFamilyFreq !== null ||
    criteria.familyFilter !== 'all' ||
    criteria.tags.length > 0 ||
    criteria.phrasesOnly ||
    criteria.homographsOnly ||
    !criteria.includeZeroFreq;

  const handleCollectionSelect = (val: string) => {
    if (!val) {
      onSelectStaticCollectionId(null);
      return;
    }
    const col = collections.find((c) => c.id === val);
    if (!col) return;
    if (col.type === 'dynamic' && col.filterCriteria) {
      onSelectStaticCollectionId(null);
      onChangeCriteria(col.filterCriteria);
      if (col.sortField) onChangeSortField(col.sortField);
    } else {
      onSelectStaticCollectionId(col.id);
    }
  };

  const showBatchToolbar = selectedRowIds.size > 0 || isSelectMode;

  const desktopGridClass = isWideTableLayout
    ? 'grid grid-cols-[34px_minmax(130px,1.4fr)_68px_minmax(105px,1.1fr)_minmax(115px,1fr)_96px_76px]'
    : 'grid grid-cols-[32px_minmax(110px,1.4fr)_64px_minmax(96px,1.1fr)_88px_74px]';

  return (
    <div
      className={`grid ${
        showAdvancedDrawer
          ? 'grid-rows-[auto_auto_auto_auto_minmax(0,1fr)]'
          : 'grid-rows-[auto_auto_auto_minmax(0,1fr)]'
      } h-full min-h-0 min-w-0 bg-[var(--bg-surface)]`}
    >
      {/* TIER 1: 12-Column Search, Scope & Sort Grid Bar */}
      <div className="px-3 sm:px-4 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] grid grid-cols-12 items-center gap-2">
        {/* Cols 1-5: Search Input */}
        <div className="col-span-12 sm:col-span-5 relative min-w-0">
          <Search
            className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            name="lexicon-filter-query"
            aria-label="检索单词、短语、词族或考纲原文"
            autoComplete="off"
            spellCheck={false}
            value={criteria.searchQuery}
            onChange={(e) =>
              onChangeCriteria({ ...criteria, searchQuery: e.target.value })
            }
            placeholder="搜索单词、词族或考纲原貌…"
            className="w-full h-8 pl-8 pr-6 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus-ring"
          />
          {criteria.searchQuery && (
            <button
              type="button"
              onClick={() => onChangeCriteria({ ...criteria, searchQuery: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              aria-label="清空搜索词"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Cols 6-8: Corpus Scope Selector */}
        <div className="col-span-5 sm:col-span-3 min-w-0">
          <select
            name="source-scope-compact"
            aria-label="大纲与词库范围"
            value={activeStaticCollectionId ? '' : criteria.sourceFilter}
            onChange={(e) => {
              onSelectStaticCollectionId(null);
              onChangeCriteria({
                ...criteria,
                sourceFilter: e.target.value as FilterCriteria['sourceFilter'],
              });
            }}
            className="w-full h-8 px-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] cursor-pointer focus-ring truncate"
          >
            {SOURCE_SCOPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Cols 9-12: Sort + Filter Drawer + Export */}
        <div className="col-span-7 sm:col-span-4 flex items-center justify-end gap-1.5 text-xs min-w-0">
          <select
            name="sort-field"
            aria-label="排序方式"
            value={sortField}
            onChange={(e) => onChangeSortField(e.target.value as SortField)}
            className="h-8 px-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] cursor-pointer focus-ring min-w-0 truncate"
          >
            <option value="priority_weight_desc">推荐学习序 ↓</option>
            <option value="form_freq_desc">词形频次 ↓</option>
            <option value="family_freq_desc">词族总频次 ↓</option>
            <option value="band_asc">频段 1k→25k</option>
            <option value="word_asc">字母 A→Z</option>
            <option value="updated_desc">最近标注 ↓</option>
          </select>

          <button
            type="button"
            aria-expanded={showAdvancedDrawer}
            onClick={() => setShowAdvancedDrawer((v) => !v)}
            className={`h-8 px-2 sm:px-2.5 rounded-md font-medium border inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-ring ${
              showAdvancedDrawer || criteria.familyFilter !== 'all' || Boolean(activeStaticCollectionId)
                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">筛选器</span>
          </button>

          {onExportCurrentWords && (
            <div className="relative hidden sm:block shrink-0">
              <button
                type="button"
                onClick={() => setShowExportMenu((v) => !v)}
                className="h-8 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap focus-ring"
              >
                <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>导出</span>
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-1 w-36 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-lg py-1 z-30 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      onExportCurrentWords('txt');
                      setShowExportMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    导出 TXT 词表
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onExportCurrentWords('csv');
                      setShowExportMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    导出 CSV 详情
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowExportMenu(false);
                      setShowSaveModal(true);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] text-[var(--accent-primary)] border-t border-[var(--border-subtle)] cursor-pointer"
                  >
                    存为动态词集…
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* TIER 2: Quick Facet Bar OR Single-Line Mobile-Friendly Batch Selection Bar */}
      {showBatchToolbar ? (
        <div
          role="region"
          aria-label="批量选择与操作栏"
          className="px-3 sm:px-4 py-1.5 bg-[var(--accent-soft)] border-b border-[var(--accent-primary)]/30 flex items-center justify-between gap-1.5 text-xs shrink-0 relative"
        >
          {/* Left: Selected Count + Desktop Range Buttons */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="px-2 py-0.5 rounded bg-[var(--accent-primary)] text-white font-semibold font-mono-tabular whitespace-nowrap shrink-0">
              已选 {selectedRowIds.size}
            </span>

            <div className="hidden lg:flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleSelectTopN(50)}
                className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] font-medium cursor-pointer whitespace-nowrap"
              >
                选前 50
              </button>
              <button
                type="button"
                onClick={() => handleSelectTopN(200)}
                className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] font-medium cursor-pointer whitespace-nowrap"
              >
                选前 200
              </button>
              <button
                type="button"
                onClick={() => handleSelectTopN(Math.min(filteredWords.length, 2000))}
                className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] font-medium cursor-pointer whitespace-nowrap"
              >
                全选 ({Math.min(filteredWords.length, 2000)})
              </button>
              <button
                type="button"
                onClick={() => handleInvertTopN(100)}
                className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium cursor-pointer whitespace-nowrap"
              >
                反选
              </button>
              {selectedRowIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-1.5 py-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline cursor-pointer whitespace-nowrap"
                >
                  清空
                </button>
              )}
            </div>
          </div>

          {/* Right: Core Status Buttons + "More" Menu on Mobile/Tablet */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {(['queued', 'learning', 'mastered'] as LearningStatus[]).map((st) => (
              <button
                key={st}
                type="button"
                disabled={selectedRowIds.size === 0}
                onClick={() => onBatchSetStatus(Array.from(selectedRowIds), st)}
                className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] disabled:opacity-40 font-medium cursor-pointer whitespace-nowrap"
              >
                {LEARNING_STATUS_META[st].shortLabel}
              </button>
            ))}

            {/* Desktop extra status & tag input */}
            <div className="hidden xl:flex items-center gap-1.5">
              {(['deferred', 'unrated'] as LearningStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  disabled={selectedRowIds.size === 0}
                  onClick={() => onBatchSetStatus(Array.from(selectedRowIds), st)}
                  className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] disabled:opacity-40 font-medium cursor-pointer whitespace-nowrap"
                >
                  {LEARNING_STATUS_META[st].shortLabel}
                </button>
              ))}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!batchTagInput.trim() || selectedRowIds.size === 0) return;
                  onBatchAddTag(Array.from(selectedRowIds), batchTagInput.trim());
                  setBatchTagInput('');
                }}
                className="inline-flex items-center gap-1"
              >
                <input
                  type="text"
                  name="batch-tag-input"
                  aria-label="批量添加标签"
                  autoComplete="off"
                  value={batchTagInput}
                  onChange={(e) => setBatchTagInput(e.target.value)}
                  placeholder="+ 批量标签 (回车)"
                  className="h-6 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-xs w-28 focus-ring"
                />
              </form>
            </div>

            {/* Compact "More" Popover for <xl */}
            <div className="relative xl:hidden">
              <button
                type="button"
                onClick={() => setShowBatchMoreMenu((v) => !v)}
                className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                aria-label="更多批量操作"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
                <span>更多</span>
              </button>

              {showBatchMoreMenu && (
                <div className="absolute right-0 top-full mt-1 w-56 p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-xl z-40 space-y-2.5 text-xs">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectTopN(50);
                        setShowBatchMoreMenu(false);
                      }}
                      className="px-2 py-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] cursor-pointer"
                    >
                      选前 50
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectTopN(200);
                        setShowBatchMoreMenu(false);
                      }}
                      className="px-2 py-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] cursor-pointer"
                    >
                      选前 200
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleInvertTopN(100);
                        setShowBatchMoreMenu(false);
                      }}
                      className="px-2 py-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] cursor-pointer"
                    >
                      反选
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleClearSelection();
                        setShowBatchMoreMenu(false);
                      }}
                      className="px-2 py-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-rose-600 cursor-pointer"
                    >
                      清空已选
                    </button>
                  </div>

                  <div className="flex gap-1 pt-1 border-t border-[var(--border-subtle)]">
                    {(['deferred', 'unrated'] as LearningStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        disabled={selectedRowIds.size === 0}
                        onClick={() => {
                          onBatchSetStatus(Array.from(selectedRowIds), st);
                          setShowBatchMoreMenu(false);
                        }}
                        className="flex-1 py-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] disabled:opacity-40 font-medium cursor-pointer"
                      >
                        标为{LEARNING_STATUS_META[st].shortLabel}
                      </button>
                    ))}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!batchTagInput.trim() || selectedRowIds.size === 0) return;
                      onBatchAddTag(Array.from(selectedRowIds), batchTagInput.trim());
                      setBatchTagInput('');
                      setShowBatchMoreMenu(false);
                    }}
                    className="flex gap-1 pt-1 border-t border-[var(--border-subtle)]"
                  >
                    <input
                      type="text"
                      value={batchTagInput}
                      onChange={(e) => setBatchTagInput(e.target.value)}
                      placeholder="输入标签名 (仅加标签)…"
                      className="flex-1 px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                    />
                    <button
                      type="submit"
                      disabled={selectedRowIds.size === 0 || !batchTagInput.trim()}
                      className="px-2 py-1 rounded bg-[var(--accent-primary)] text-white disabled:opacity-40 font-medium cursor-pointer whitespace-nowrap"
                    >
                      添加
                    </button>
                  </form>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setIsSelectMode(false);
                setShowBatchMoreMenu(false);
                handleClearSelection();
              }}
              className="px-1.5 py-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium cursor-pointer whitespace-nowrap"
            >
              退出
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 sm:px-4 py-1.5 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs shrink-0 overflow-x-auto no-scrollbar">
          {/* Left Facets: Band Ranges + Status Filters + Reset */}
          <div className="flex items-center gap-1.5 min-w-0 shrink-0">
            <div className="inline-flex items-center gap-0.5">
              {BAND_RANGES.map((preset) => {
                const active =
                  criteria.minBand === preset.min &&
                  criteria.maxBand === preset.max &&
                  criteria.bands.length === 0;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      onChangeCriteria({
                        ...criteria,
                        bands: [],
                        minBand: preset.min,
                        maxBand: preset.max,
                      })
                    }
                    className={`px-1.5 sm:px-2 py-0.5 rounded font-mono-tabular text-[11px] transition-colors cursor-pointer whitespace-nowrap focus-ring ${
                      active
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <span className="text-[var(--border-strong)]">|</span>

            <div className="inline-flex items-center gap-0.5">
              {ALL_STATUSES.map((st) => {
                const meta = LEARNING_STATUS_META[st];
                const active = criteria.statuses.includes(st);
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => toggleStatusFilter(st)}
                    className={`px-1.5 sm:px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1 focus-ring ${
                      active
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span>{meta.shortLabel}</span>
                    <span className="hidden xl:inline font-mono-tabular text-[10px] opacity-75">
                      {statusCounts[st]}
                    </span>
                  </button>
                );
              })}
            </div>

            {hasNonDefaultFilters && (
              <button
                type="button"
                onClick={() => {
                  onSelectStaticCollectionId(null);
                  onChangeCriteria(DEFAULT_FILTER_CRITERIA);
                }}
                className="px-2 py-0.5 rounded text-[11px] text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap focus-ring"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span>重置</span>
              </button>
            )}
          </div>

          {/* Right: Total Filtered Count + Batch Selection Mode Entry */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <span className="hidden md:inline text-[11px] font-mono-tabular text-[var(--text-muted)] whitespace-nowrap">
              共 {filteredWords.length.toLocaleString()} 词
            </span>
            <button
              type="button"
              onClick={() => handleSelectTopN(50)}
              className="hidden lg:inline-flex px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] cursor-pointer whitespace-nowrap focus-ring"
            >
              选前 50
            </button>
            <button
              type="button"
              aria-pressed={isSelectMode}
              onClick={() => setIsSelectMode((v) => !v)}
              className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap focus-ring"
              title="开启后点击整行即可勾选词条，支持 Shift+点击连选"
            >
              <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
              <span>批量选择</span>
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Precision Filter Drawer */}
      {showAdvancedDrawer && (
        <div className="px-4 py-3 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] flex flex-wrap items-center gap-3 sm:gap-4 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-secondary)] shrink-0">词形角色:</span>
            <select
              name="family-role-quick"
              aria-label="词族角色过滤"
              value={criteria.familyFilter}
              onChange={(e) =>
                onChangeCriteria({
                  ...criteria,
                  familyFilter: e.target.value as FilterCriteria['familyFilter'],
                })
              }
              className="h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] cursor-pointer focus-ring"
            >
              <option value="all">全部词形角色</option>
              <option value="headword_only">仅词族代表词 (词头)</option>
              <option value="derived_only">仅派生与变形词</option>
              <option value="has_cet_peers">同族含四六级词</option>
              <option value="high_freq_unmastered_member">1k–5k 未掌握成员</option>
              <option value="high_family_low_form">高频词族低频派生词</option>
            </select>
          </div>

          {collections.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-secondary)] shrink-0">所属词集:</span>
              <select
                name="collection-quick-select"
                aria-label="按词集过滤"
                value={activeStaticCollectionId || ''}
                onChange={(e) => handleCollectionSelect(e.target.value)}
                className="h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] cursor-pointer focus-ring max-w-[180px] truncate"
              >
                <option value="">全部词集 / 批次…</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[var(--text-secondary)] shrink-0">精确频段 (1–25k):</span>
            <input
              type="number"
              name="min-band"
              aria-label="最小频段"
              min={1}
              max={25}
              placeholder="1"
              value={criteria.minBand ?? ''}
              onChange={(e) =>
                onChangeCriteria({
                  ...criteria,
                  minBand: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
              className="w-14 h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] font-mono-tabular"
            />
            <span>–</span>
            <input
              type="number"
              name="max-band"
              aria-label="最大频段"
              min={1}
              max={25}
              placeholder="25"
              value={criteria.maxBand ?? ''}
              onChange={(e) =>
                onChangeCriteria({
                  ...criteria,
                  maxBand: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
              className="w-14 h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] font-mono-tabular"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[var(--text-secondary)] shrink-0">最低词形频次:</span>
            <input
              type="number"
              name="min-form-freq"
              aria-label="最低词形频次"
              min={0}
              placeholder="0"
              value={criteria.minFormFreq ?? ''}
              onChange={(e) =>
                onChangeCriteria({
                  ...criteria,
                  minFormFreq: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
              className="w-24 h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] font-mono-tabular"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[var(--text-secondary)]">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={criteria.phrasesOnly}
                onChange={(e) =>
                  onChangeCriteria({ ...criteria, phrasesOnly: e.target.checked })
                }
              />
              <span>仅多词短语</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={criteria.homographsOnly}
                onChange={(e) =>
                  onChangeCriteria({ ...criteria, homographsOnly: e.target.checked })
                }
              />
              <span>仅同形异义词</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={criteria.includeZeroFreq}
                onChange={(e) =>
                  onChangeCriteria({ ...criteria, includeZeroFreq: e.target.checked })
                }
              />
              <span>含 0 频词</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={criteria.includeUnrankedFreq}
                onChange={(e) =>
                  onChangeCriteria({ ...criteria, includeUnrankedFreq: e.target.checked })
                }
              />
              <span>含无独立频次词</span>
            </label>
          </div>
        </div>
      )}

      {/* Container-Responsive Table Header */}
      {!isCompactCardLayout ? (
        <div
          className={`${desktopGridClass} items-center px-3 sm:px-4 py-2 bg-[var(--bg-subtle)]/70 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] shrink-0 select-none`}
        >
          <div className="flex items-center">
            <div
              role="checkbox"
              aria-checked={selectedRowIds.size > 0}
              aria-label="勾选前50项或取消全选"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                if (selectedRowIds.size > 0) handleClearSelection();
                else handleSelectTopN(50);
              }}
              className="p-1 -ml-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer flex items-center"
              title="点击选前 50 项 / 清空选择"
            >
              {selectedRowIds.size > 0 ? (
                <CheckSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" aria-hidden="true" />
              ) : (
                <Square className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
              )}
            </div>
          </div>
          <div>词条 (含考纲原貌)</div>
          <div>大纲</div>
          <div>词族与频段</div>
          {isWideTableLayout && <div>同族占比 / 标签</div>}
          <div className="text-right pr-2">词形频次</div>
          <div className="text-right">状态</div>
        </div>
      ) : (
        <div className="px-3.5 py-1.5 bg-[var(--bg-subtle)]/70 border-b border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] shrink-0">
          <span>词条与词族 ({filteredWords.length.toLocaleString()})</span>
          <span>学习状态</span>
        </div>
      )}

      {/* Virtualized Corpus Rows */}
      <div
        ref={parentRef}
        onScroll={(e) => onScrollOffsetChange?.(e.currentTarget.scrollTop)}
        className="lexicon-table-container flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-[var(--bg-surface)] select-none"
      >
        {filteredWords.length === 0 ? (
          <div className="py-24 px-6 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              当前筛选范围内没有匹配词条
            </p>
            <button
              type="button"
              onClick={() => {
                onSelectStaticCollectionId(null);
                onChangeCriteria(DEFAULT_FILTER_CRITERIA);
              }}
              className="mt-3 px-3.5 py-1.5 rounded-md text-xs font-medium bg-[var(--accent-primary)] text-white cursor-pointer focus-ring"
            >
              重置全部筛选
            </button>
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowIndex = virtualRow.index;
              const word = filteredWords[rowIndex];
              const userRec = userRecordsMap.get(word.id);
              const status: LearningStatus = userRec?.status || 'unrated';
              const statusMeta = LEARNING_STATUS_META[status];
              const isSelected = word.id === selectedWordId;
              const isChecked = selectedRowIds.has(word.id);

              // Check if CET2016 rawMember has special variant notation (e.g. sober/-re, colo(u)r)
              const specialCetRaw = word.cetRefs
                .map((r) => r.rawMember.replace(/^★/, '').replace(/[¹²³⁴⁵]/g, ''))
                .find((raw) => raw.toLowerCase() !== word.word.toLowerCase());

              const freqText = formatCompactFrequency(
                word.formFrequency,
                word.inBnc,
                word.bncLinkedViaVariant
              );
              const sharePct = getIntraFamilySharePct(
                word.formFrequency,
                word.familyFrequency,
                word.inBnc,
                word.bncLinkedViaVariant
              );
              const roleSummary = formatFamilyRoleAndShare(
                word.isHeadword,
                word.familyMemberCount,
                word.formFrequency,
                word.familyFrequency,
                word.inBnc,
                word.bncLinkedViaVariant
              );

              if (isCompactCardLayout) {
                return (
                  <div
                    key={word.id}
                    onClick={(e) => {
                      if (isSelectMode || e.shiftKey) {
                        handleSelectAtRow(rowIndex, e.shiftKey);
                      } else {
                        lastAnchorIndexRef.current = rowIndex;
                        onSelectWord(word, true);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`px-3.5 py-2 border-b border-[var(--border-subtle)]/70 flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-[var(--accent-soft)]'
                        : isSelected
                          ? 'bg-[var(--bg-subtle)]'
                          : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {isSelectMode && (
                      <div className="shrink-0">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-[var(--accent-primary)]" />
                        ) : (
                          <Square className="w-4 h-4 text-[var(--text-muted)]" />
                        )}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5 min-w-0">
                        <span
                          translate="no"
                          className="font-serif-lexicon font-semibold text-[15px] text-[var(--text-primary)] truncate"
                        >
                          {word.word}
                        </span>
                        {word.homographNumbers.length > 0 && (
                          <span className="text-[10px] font-mono-tabular text-amber-700 dark:text-amber-400 shrink-0">
                            #{word.homographNumbers.join(',')}
                          </span>
                        )}
                        {specialCetRaw && (
                          <span
                            translate="no"
                            className="text-[11px] font-mono-tabular text-[var(--accent-primary)] shrink-0 truncate max-w-[90px]"
                          >
                            [{specialCetRaw}]
                          </span>
                        )}
                        <span className="text-[11px] font-mono-tabular text-[var(--text-secondary)] truncate">
                          {[
                            word.isCet4 && word.isCet6
                              ? 'CET-4/6'
                              : word.isCet4
                                ? 'CET-4'
                                : word.isCet6
                                  ? 'CET-6'
                                  : null,
                            word.band,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono-tabular text-[var(--text-muted)] truncate flex items-center gap-1.5">
                        {word.headword && (
                          <span translate="no" className="truncate">
                            族: {word.headword}
                          </span>
                        )}
                        <span>·</span>
                        <span>频次 {freqText}</span>
                        {sharePct !== null && <span>(占族 {sharePct}%)</span>}
                      </div>
                    </div>

                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      <select
                        name={`status-${word.id}`}
                        aria-label={`${word.word} 状态`}
                        value={status}
                        onChange={(e) =>
                          onQuickStatusChange(
                            word.id,
                            word.word,
                            e.target.value as LearningStatus
                          )
                        }
                        className={`appearance-none text-center px-2 py-1 rounded text-xs font-medium border cursor-pointer focus-ring ${statusMeta.badgeClass}`}
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
              }

              return (
                <div
                  key={word.id}
                  onMouseEnter={() => {
                    if (dragSelectStateRef.current.active) {
                      handleSelectAtRow(rowIndex, false, dragSelectStateRef.current.mode);
                    }
                  }}
                  onClick={(e) => {
                    if (isSelectMode || e.shiftKey) {
                      handleSelectAtRow(rowIndex, e.shiftKey);
                      onSelectWord(word, false);
                    } else {
                      lastAnchorIndexRef.current = rowIndex;
                      onSelectWord(word, true);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={`group ${desktopGridClass} items-center px-3 sm:px-4 border-b border-[var(--border-subtle)]/70 text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-[var(--accent-soft)]/90'
                      : isSelected
                        ? 'bg-[var(--bg-subtle)] ring-1 ring-inset ring-[var(--accent-primary)]/40'
                        : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {/* Col 1: Focus-Safe Checkbox Cell */}
                  <div
                    role="checkbox"
                    aria-checked={isChecked}
                    aria-label={`选择 ${word.word}`}
                    tabIndex={-1}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const nextMode: 'add' | 'remove' = isChecked ? 'remove' : 'add';
                      dragSelectStateRef.current = {
                        active: !e.shiftKey,
                        mode: nextMode,
                      };
                      handleSelectAtRow(rowIndex, e.shiftKey, e.shiftKey ? undefined : nextMode);
                      onSelectWord(word, false);
                    }}
                    className="h-full flex items-center pr-1.5 cursor-pointer"
                    title="点击勾选 · Shift+点击区间连选 · 按住上下拖动滑选"
                  >
                    <span
                      className={`flex items-center rounded transition-opacity ${
                        isChecked || selectedRowIds.size > 0 || isSelectMode
                          ? 'opacity-100'
                          : 'opacity-40 group-hover:opacity-100'
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" aria-hidden="true" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                      )}
                    </span>
                  </div>

                  {/* Col 2: Word + Official CET2016 Raw Variant Notation */}
                  <div className="min-w-0 pr-2 flex items-baseline gap-1.5">
                    <span
                      translate="no"
                      className="font-serif-lexicon font-semibold text-[15px] text-[var(--text-primary)] truncate"
                    >
                      {word.word}
                    </span>
                    {word.homographNumbers.length > 0 && (
                      <span className="text-[10px] font-mono-tabular text-amber-700 dark:text-amber-400 shrink-0">
                        #{word.homographNumbers.join(',')}
                      </span>
                    )}
                    {specialCetRaw && (
                      <span
                        translate="no"
                        className="text-[11px] font-mono-tabular text-[var(--text-muted)] truncate"
                        title={`考纲原貌: ${specialCetRaw}`}
                      >
                        [{specialCetRaw}]
                      </span>
                    )}
                  </div>

                  {/* Col 3: Clean Syllabus Level */}
                  <div className="font-mono-tabular text-[11px] whitespace-nowrap">
                    {word.isCet4 && word.isCet6 ? (
                      <span className="text-teal-700 dark:text-teal-400 font-medium">
                        CET-4/6
                      </span>
                    ) : word.isCet4 ? (
                      <span className="text-teal-700 dark:text-teal-400 font-medium">
                        CET-4
                      </span>
                    ) : word.isCet6 ? (
                      <span className="text-indigo-700 dark:text-indigo-400 font-medium">
                        CET-6
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </div>

                  {/* Col 4: Family & Band (`1k · able`) */}
                  <div className="min-w-0 pr-2 flex items-center gap-1 font-mono-tabular text-[11px]">
                    {word.headword ? (
                      <>
                        {word.band && (
                          <span className="text-[var(--text-muted)] shrink-0">
                            {word.band} ·
                          </span>
                        )}
                        <button
                          type="button"
                          translate="no"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (word.familyId) onInspectFamily(word.familyId, word.id);
                          }}
                          className="text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:underline truncate cursor-pointer rounded"
                          title={`查看 ${word.headword} 词族 (${word.familyMemberCount || 1} 词 · 总频次 ${(word.familyFrequency || 0).toLocaleString()})`}
                        >
                          {word.headword}
                        </button>
                      </>
                    ) : (
                      <span className="text-[var(--text-muted)]">大纲独立词</span>
                    )}
                  </div>

                  {/* Col 5 (Wide Table >=760px): Intra-Family Role & Share / Tags */}
                  {isWideTableLayout && (
                    <div className="flex items-center gap-1.5 min-w-0 pr-2 font-mono-tabular text-[11px] text-[var(--text-muted)]">
                      <span className="truncate">{roleSummary}</span>
                      {userRec?.tags && userRec.tags.length > 0 && (
                        <span className="text-[var(--accent-primary)] truncate shrink-0">
                          #{userRec.tags[0]}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Col 6: Clean Single-Value Form Frequency (No Cluttered Dual Number or Log Bar) */}
                  <div
                    className="pr-2 text-right font-mono-tabular text-[11px] whitespace-nowrap"
                    title={
                      word.formFrequency !== null
                        ? `词形实测频次: ${word.formFrequency.toLocaleString()}${
                            word.familyFrequency !== null
                              ? ` · 词族总频次: ${word.familyFrequency.toLocaleString()} (占族 ${sharePct ?? 0}%)`
                              : ''
                          }`
                        : word.bncLinkedViaVariant
                          ? `该词形在 BNC/COCA 中无独立频次记录；关联词族总频次: ${(word.familyFrequency || 0).toLocaleString()}`
                          : 'BNC/COCA 25k 未收录'
                    }
                  >
                    <span
                      className={
                        word.formFrequency === 0 || word.formFrequency === null
                          ? 'text-[var(--text-muted)]'
                          : 'font-semibold text-[var(--text-primary)]'
                      }
                    >
                      {freqText}
                    </span>
                  </div>

                  {/* Col 7: Clean Status Selector */}
                  <div
                    className="flex justify-end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <select
                      name={`status-${word.id}`}
                      aria-label={`${word.word} 学习状态`}
                      value={status}
                      onChange={(e) => {
                        onQuickStatusChange(
                          word.id,
                          word.word,
                          e.target.value as LearningStatus
                        );
                        e.currentTarget.blur();
                      }}
                      className={`appearance-none text-center px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer transition-colors focus-ring ${
                        status === 'unrated'
                          ? 'border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-secondary)]'
                          : statusMeta.badgeClass
                      }`}
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
        )}
      </div>

      {/* Save Dynamic Collection Modal */}
      {showSaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]"
          onClick={() => setShowSaveModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="保存为动态词集"
            className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                将当前筛选保存为动态词集
              </h3>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                aria-label="关闭弹窗"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label
                  htmlFor="dynamic-col-name"
                  className="block font-medium text-[var(--text-secondary)] mb-1"
                >
                  词集名称
                </label>
                <input
                  id="dynamic-col-name"
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="例如：CET-6 3k-6k 待攻克核心词"
                  className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus-ring"
                />
              </div>
              <div>
                <label
                  htmlFor="dynamic-col-desc"
                  className="block font-medium text-[var(--text-secondary)] mb-1"
                >
                  规则备注
                </label>
                <input
                  id="dynamic-col-desc"
                  type="text"
                  value={newCollectionDesc}
                  onChange={(e) => setNewCollectionDesc(e.target.value)}
                  placeholder="选填描述…"
                  className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus-ring"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-3 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)] cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newCollectionName.trim()) return;
                  onSaveDynamicCollection(
                    newCollectionName.trim(),
                    newCollectionDesc.trim() || '自定义动态筛选词集'
                  );
                  setNewCollectionName('');
                  setNewCollectionDesc('');
                  setShowSaveModal(false);
                }}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-white cursor-pointer"
              >
                保存词集
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
