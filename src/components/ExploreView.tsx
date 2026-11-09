import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search,
  SlidersHorizontal,
  Download,
  BookmarkPlus,
  CheckSquare,
  Square,
  X,
  RotateCcw,
  Columns,
  AlertCircle,
} from 'lucide-react';
import {
  BncCocaFamily,
  CetOfficialEntry,
  COCA_POS_META,
  CocaLexemeRecord,
  CocaRawPos,
  ExploreEntityViewMode,
  FilterCriteria,
  LEARNING_STATUS_META,
  LearningStatus,
  LexiconWordItem,
  SortOption,
  SourceFilterOption,
  UserWordRecord,
  WordCollection,
} from '../data/types.ts';
import {
  DEFAULT_FILTER_CRITERIA,
  filterAndSortCocaLexemes,
  pruneSelectionToVisibleIds,
  resolveCetEntryHomographLexeme,
} from '../data/searchAndFilter.ts';
import { formatCompactFrequency } from '../utils/frequency.ts';

interface ExploreViewProps {
  filteredWords: LexiconWordItem[];
  totalLexiconCount: number;
  allWords: LexiconWordItem[];
  wordsMap: Map<string, LexiconWordItem>;
  cocaLexemes: CocaLexemeRecord[];
  families: BncCocaFamily[];
  cetEntries: CetOfficialEntry[];
  criteria: FilterCriteria;
  onChangeCriteria: React.Dispatch<React.SetStateAction<FilterCriteria>>;
  sortBy: SortOption;
  onChangeSortBy: (sort: SortOption) => void;
  userRecordsMap: Map<string, UserWordRecord>;
  allAvailableTags: string[];
  staticCollections: WordCollection[];
  selectedStaticCollectionId: string | null;
  onSelectStaticCollectionId: (id: string | null) => void;
  selectedWordId: string | null;
  onSelectWord: (word: LexiconWordItem, openDrawer?: boolean) => void;
  onInspectFamily: (familyId: string, highlightWord?: string) => void;
  onQuickStatusChange: (
    wordId: string,
    wordDisplay: string,
    status: LearningStatus
  ) => Promise<void> | void;
  onPosStatusChange?: (
    wordId: string,
    wordDisplay: string,
    pos: CocaRawPos,
    status: LearningStatus
  ) => Promise<void> | void;
  onBatchSetStatus: (
    wordIds: string[],
    status: LearningStatus,
    label?: string
  ) => Promise<void> | void;
  onBatchAddTag: (wordIds: string[], tag: string) => Promise<void> | void;
  onAddWordsToStaticCollection: (collectionId: string, wordIds: string[]) => Promise<void> | void;
  onCreateStaticCollectionFromSelection?: (name: string, wordIds: string[]) => Promise<void>;
  onSaveDynamicCollection: (name: string, description: string) => Promise<void> | void;
  onExportCurrentFiltered: (format: 'csv' | 'txt', customList?: LexiconWordItem[]) => void;
  compactDensity?: boolean;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
}

const ALL_STATUSES: LearningStatus[] = ['unrated', 'queued', 'learning', 'mastered', 'deferred'];

// Include all 14 official COCA parts of speech
const ALL_COCA_POS: CocaRawPos[] = Object.keys(COCA_POS_META) as CocaRawPos[];

export const ExploreView: React.FC<ExploreViewProps> = ({
  filteredWords,
  totalLexiconCount,
  allWords,
  wordsMap,
  cocaLexemes,
  families,
  cetEntries,
  criteria,
  onChangeCriteria,
  sortBy,
  onChangeSortBy,
  userRecordsMap,
  allAvailableTags,
  staticCollections,
  selectedStaticCollectionId,
  onSelectStaticCollectionId,
  selectedWordId,
  onSelectWord,
  onInspectFamily,
  onQuickStatusChange,
  onPosStatusChange,
  onBatchSetStatus,
  onBatchAddTag,
  onAddWordsToStaticCollection,
  onSaveDynamicCollection,
  onExportCurrentFiltered,
  compactDensity = false,
  initialScrollOffset = 0,
  onScrollOffsetChange,
}) => {
  const [entityMode, setEntityMode] = useState<ExploreEntityViewMode>('forms');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [visibleCols, setVisibleCols] = useState({
    cocaRank: true,
    cocaPos: true,
    bncFamily: true,
    bncFormFreq: true,
    cetLevel: true,
  });

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [batchTagInput, setBatchTagInput] = useState('');
  const [batchError, setBatchError] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');

  const rootRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1024);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const obs = new ResizeObserver(updateWidth);
      obs.observe(el);
      return () => obs.disconnect();
    }
  }, []);

  const isCompactCardLayout = containerWidth < 560;
  const isMediumTableLayout = containerWidth >= 560 && containerWidth < 920;

  // Dynamic source filter labels computed from loaded allWords (never hardcoded stale numbers)
  const sourceFilterOptions = useMemo(() => {
    let allThree = 0;
    let bncCoca = 0;
    let cetCoca = 0;
    let cetBnc = 0;
    let cocaOnly = 0;
    let bncOnly = 0;
    let cetAll = 0;
    let bncAll = 0;

    for (let i = 0; i < allWords.length; i++) {
      const w = allWords[i];
      const inBncAny = w.inBnc || Boolean(w.bncLinkedViaVariant);
      if (w.inCet) cetAll++;
      if (inBncAny) bncAll++;
      if (w.inCet && w.inBnc && w.inCoca) allThree++;
      if (w.inBnc && w.inCoca) bncCoca++;
      if (w.inCet && w.inCoca) cetCoca++;
      if (w.inCet && inBncAny) cetBnc++;
      if (w.inCoca && !w.inBnc && !w.inCet) cocaOnly++;
      if (w.inBnc && !w.inCoca && !w.inCet) bncOnly++;
    }

    const list: { value: SourceFilterOption; label: string }[] = [
      { value: 'all', label: `全部词库 (${totalLexiconCount.toLocaleString()} 词形)` },
      { value: 'all_three_sources', label: `三源交集 CET ∩ BNC ∩ COCA (${allThree.toLocaleString()})` },
      { value: 'both_bnc_coca', label: `BNC ∩ COCA 双语料交集 (${bncCoca.toLocaleString()})` },
      { value: 'both_cet_coca', label: `CET ∩ COCA 考纲当代交集 (${cetCoca.toLocaleString()})` },
      { value: 'both_cet_bnc', label: `CET ∩ BNC 考纲词族交集 (${cetBnc.toLocaleString()})` },
      { value: 'coca_all', label: 'COCA 2020 全部收录 (含变体)' },
      { value: 'coca_only', label: `仅 COCA 2020 独有 (${cocaOnly.toLocaleString()})` },
      { value: 'bnc_only', label: `仅 BNC/COCA 25k 独有 (${bncOnly.toLocaleString()})` },
      { value: 'cet_not_in_coca', label: 'CET 考纲未进 COCA 60k (含英式/派生)' },
      { value: 'cet_only', label: 'CET 考纲未进 BNC 25k' },
      { value: 'cet_all', label: `CET-4 / CET-6 全部考纲词 (${cetAll.toLocaleString()})` },
      { value: 'cet4', label: 'CET-4 四级大纲词' },
      { value: 'cet6', label: 'CET-6 六级全部词' },
      { value: 'cet6_new', label: 'CET-6 六级新增词' },
      { value: 'bnc_all', label: `BNC/COCA 1k–25k 全部词形 (${bncAll.toLocaleString()})` },
    ];
    return list;
  }, [allWords, totalLexiconCount]);

  // Continuous drag-to-select & Shift+Click range selection refs
  const isDraggingSelectRef = useRef(false);
  const dragStartIndexRef = useRef<number | null>(null);
  const dragTargetStateRef = useRef<boolean>(true);
  const baselineSelectionRef = useRef<Set<string>>(new Set());
  const lastClickedIndexRef = useRef<number | null>(null);

  // Prune selectedRowIds whenever filteredWords changes so hidden rows are never modified by batch actions
  useEffect(() => {
    setSelectedRowIds((prev) => pruneSelectionToVisibleIds(prev, filteredWords));
    lastClickedIndexRef.current = null;
  }, [filteredWords]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDraggingSelectRef.current) {
        isDraggingSelectRef.current = false;
        dragStartIndexRef.current = null;
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, []);

  const applyRangeSelection = (
    startIdx: number,
    endIdx: number,
    targetChecked: boolean,
    baseSet: Set<string>
  ) => {
    const lo = Math.max(0, Math.min(startIdx, endIdx));
    const hi = Math.min(filteredWords.length - 1, Math.max(startIdx, endIdx));
    const next = new Set(baseSet);
    for (let i = lo; i <= hi; i++) {
      const item = filteredWords[i];
      if (!item) continue;
      if (targetChecked) next.add(item.id);
      else next.delete(item.id);
    }
    setSelectedRowIds(next);
  };

  const toggleSingleRowSelection = (
    rowIndex: number,
    wordId: string,
    currentlyChecked: boolean,
    shiftKey = false
  ) => {
    if (shiftKey && lastClickedIndexRef.current !== null) {
      applyRangeSelection(lastClickedIndexRef.current, rowIndex, !currentlyChecked, selectedRowIds);
      lastClickedIndexRef.current = rowIndex;
      return;
    }
    const nextTargetState = !currentlyChecked;
    lastClickedIndexRef.current = rowIndex;
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (nextTargetState) next.add(wordId);
      else next.delete(wordId);
      return next;
    });
  };

  const handleCheckboxMouseDown = (
    e: React.MouseEvent,
    rowIndex: number,
    wordId: string,
    currentlyChecked: boolean
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    if (e.shiftKey && lastClickedIndexRef.current !== null) {
      const targetState = !currentlyChecked;
      applyRangeSelection(lastClickedIndexRef.current, rowIndex, targetState, selectedRowIds);
      lastClickedIndexRef.current = rowIndex;
      return;
    }

    const nextTargetState = !currentlyChecked;
    isDraggingSelectRef.current = true;
    dragStartIndexRef.current = rowIndex;
    dragTargetStateRef.current = nextTargetState;
    baselineSelectionRef.current = new Set(selectedRowIds);
    lastClickedIndexRef.current = rowIndex;
    document.body.style.userSelect = 'none';

    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (nextTargetState) next.add(wordId);
      else next.delete(wordId);
      return next;
    });
  };

  const handleRowMouseEnterForDrag = (rowIndex: number) => {
    if (!isDraggingSelectRef.current || dragStartIndexRef.current === null) return;
    applyRangeSelection(
      dragStartIndexRef.current,
      rowIndex,
      dragTargetStateRef.current,
      baselineSelectionRef.current
    );
  };

  const lexemeEntities = useMemo(() => {
    if (entityMode !== 'lexemes') return [];
    return filterAndSortCocaLexemes(cocaLexemes, userRecordsMap, criteria, sortBy);
  }, [entityMode, cocaLexemes, userRecordsMap, criteria, sortBy]);

  const familyEntities = useMemo(() => {
    if (entityMode !== 'families') return [];
    const q = criteria.searchQuery.trim().toLowerCase();
    const bandSet = criteria.bands.length > 0 ? new Set(criteria.bands) : null;
    const result = families.filter((fam) => {
      if (bandSet && !bandSet.has(fam.bandNumber)) return false;
      if (
        criteria.sourceFilter === 'cet_all' ||
        criteria.sourceFilter === 'cet4' ||
        criteria.sourceFilter === 'cet6'
      ) {
        if (fam.cetMemberCount === 0) return false;
      }
      if (criteria.sourceFilter === 'both_bnc_coca' || criteria.sourceFilter === 'coca_all') {
        if ((fam.cocaMatchedMemberCount || 0) === 0) return false;
      }
      if (q) {
        if (fam.normalizedHeadword.includes(q)) return true;
        return fam.members.some((m) => m.normalized.includes(q));
      }
      return true;
    });
    result.sort((a, b) => {
      if (sortBy === 'coca_rank_asc') {
        return (a.headwordCocaRank ?? 999999) - (b.headwordCocaRank ?? 999999);
      }
      if (sortBy === 'band_asc') {
        return a.bandNumber !== b.bandNumber
          ? a.bandNumber - b.bandNumber
          : b.totalFrequency - a.totalFrequency;
      }
      if (sortBy === 'alpha_asc' || sortBy === 'word_asc') {
        return a.normalizedHeadword.localeCompare(b.normalizedHeadword);
      }
      return b.totalFrequency - a.totalFrequency;
    });
    return result;
  }, [entityMode, families, criteria, sortBy]);

  // Pre-compute occurrence index per core headword across cetEntries so homographs get distinct PoS
  const cetEntryEntitiesWithHomographIdx = useMemo(() => {
    if (entityMode !== 'official_entries') return [];
    const q = criteria.searchQuery.trim().toLowerCase();
    const seenCounts = new Map<string, number>();

    const allWithIdx = cetEntries.map((entry) => {
      const firstForm = (entry.members[0]?.expandedForms[0] || '').toLowerCase();
      const prevCount = seenCounts.get(firstForm) || 0;
      seenCounts.set(firstForm, prevCount + 1);
      return { entry, occurrenceIdx: prevCount };
    });

    return allWithIdx.filter(({ entry }) => {
      if (criteria.sourceFilter === 'cet4' && entry.level !== 'CET4') return false;
      if (criteria.sourceFilter === 'cet6_new' && !entry.isCet6) return false;
      if (criteria.homographsOnly && !entry.members.some((m) => m.homographNumber !== null)) {
        return false;
      }
      if (q) {
        return (
          entry.rawLine.toLowerCase().includes(q) ||
          entry.members.some((m) => m.expandedForms.some((w) => w.toLowerCase().includes(q)))
        );
      }
      return true;
    });
  }, [entityMode, cetEntries, criteria]);

  const activeListCount = useMemo(() => {
    switch (entityMode) {
      case 'lexemes':
        return lexemeEntities.length;
      case 'families':
        return familyEntities.length;
      case 'official_entries':
        return cetEntryEntitiesWithHomographIdx.length;
      case 'forms':
      default:
        return filteredWords.length;
    }
  }, [
    entityMode,
    lexemeEntities.length,
    familyEntities.length,
    cetEntryEntitiesWithHomographIdx.length,
    filteredWords.length,
  ]);

  const rowHeight =
    isCompactCardLayout
      ? 60
      : entityMode === 'official_entries'
        ? 52
        : compactDensity
          ? 38
          : 44;

  const rowVirtualizer = useVirtualizer({
    count: activeListCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 14,
    initialOffset: initialScrollOffset,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowHeight, entityMode, rowVirtualizer]);

  // Dynamic CSS Grid Template for `forms` view so hidden columns are genuinely removed from the grid
  const formsGridTemplate = useMemo(() => {
    const tracks: string[] = ['28px', 'minmax(116px, 1.2fr)'];
    if (visibleCols.cocaRank) {
      tracks.push('112px');
    }
    if (!isMediumTableLayout && visibleCols.cocaPos) {
      tracks.push('minmax(146px, 1.35fr)');
    }
    if (visibleCols.cetLevel) {
      tracks.push('68px');
    }
    if (visibleCols.bncFamily) {
      tracks.push('minmax(96px, 1fr)');
    }
    if (!isMediumTableLayout && visibleCols.bncFormFreq) {
      tracks.push('66px');
    }
    tracks.push('66px'); // Status column
    return tracks.join(' ');
  }, [visibleCols, isMediumTableLayout]);

  const toggleCocaPos = (pos: CocaRawPos) => {
    onChangeCriteria((prev) => {
      const current = prev.cocaPosFilter || [];
      const next = current.includes(pos)
        ? current.filter((p) => p !== pos)
        : [...current, pos];
      return { ...prev, cocaPosFilter: next };
    });
  };

  const toggleStatusFilter = (st: LearningStatus) => {
    onChangeCriteria((prev) => {
      const next = prev.statuses.includes(st)
        ? prev.statuses.filter((s) => s !== st)
        : [...prev.statuses, st];
      return { ...prev, statuses: next };
    });
  };

  const setCocaQuickRankMax = (maxRank: number | null) => {
    onChangeCriteria((prev) => ({
      ...prev,
      minCocaRank: maxRank ? 1 : null,
      maxCocaRank: maxRank,
    }));
  };

  const handleExportAnkiTsv = () => {
    const targetWords =
      selectedRowIds.size > 0
        ? filteredWords.filter((w) => selectedRowIds.has(w.id))
        : filteredWords;

    const lines = [
      '#separator:tab',
      '#html:false',
      '#columns:Word\tCOCA_Rank\tCOCA_PoS_Breakdown\tBNC_Band\tBNC_Family\tCET_Level\tStatus\tTags\tNote',
    ];
    for (const w of targetWords) {
      const rec = userRecordsMap.get(w.id);
      const posSummary =
        (w.cocaLexemes || []).length > 0
          ? (w.cocaLexemes || [])
              .map((l) => `${l.pos}:#${l.rank}(${l.frequency})`)
              .join('; ')
          : '';
      const cetLabel =
        w.isCet4 && w.isCet6 ? 'CET-4/6' : w.isCet4 ? 'CET-4' : w.isCet6 ? 'CET-6' : '';
      lines.push(
        [
          w.word,
          w.cocaBestPosRank ?? '',
          posSummary,
          w.band ?? '',
          w.headword ?? '',
          cetLabel,
          rec?.status ?? 'unrated',
          (rec?.tags || []).join(','),
          (rec?.notes || '').replace(/[\r\n\t]+/g, ' '),
        ].join('\t')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/tab-separated-values;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lexical-workbench-anki-${new Date().toISOString().slice(0, 10)}.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters = useMemo(() => {
    return (
      criteria.searchQuery.trim() !== '' ||
      criteria.sourceFilter !== 'all' ||
      criteria.bands.length > 0 ||
      criteria.statuses.length > 0 ||
      (criteria.cocaPosFilter && criteria.cocaPosFilter.length > 0) ||
      criteria.minCocaRank !== null ||
      criteria.maxCocaRank !== null ||
      Boolean(criteria.cocaMultiPosOnly) ||
      criteria.familyFilter !== 'all' ||
      criteria.phrasesOnly ||
      criteria.homographsOnly ||
      selectedStaticCollectionId !== null
    );
  }, [criteria, selectedStaticCollectionId]);

  return (
    <div
      ref={rootRef}
      className="flex flex-col h-full min-h-0 bg-[var(--bg-surface)] overflow-hidden relative"
    >
      {/* Row 1: 4-Entity View Switcher & Dataset Counter */}
      <div className="px-3.5 sm:px-4 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-between gap-2 shrink-0">
        <div
          role="tablist"
          aria-label="切换词汇实体层级视图"
          className="inline-flex items-center p-0.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] gap-0.5 min-w-0"
        >
          {(
            [
              {
                id: 'forms',
                label: '词形',
                badge: filteredWords.length.toLocaleString(),
              },
              {
                id: 'lexemes',
                label: '词元',
                badge:
                  entityMode === 'lexemes'
                    ? lexemeEntities.length.toLocaleString()
                    : cocaLexemes.length.toLocaleString(),
              },
              {
                id: 'families',
                label: '词族',
                badge:
                  entityMode === 'families'
                    ? familyEntities.length.toLocaleString()
                    : families.length.toLocaleString(),
              },
              {
                id: 'official_entries',
                label: '考纲',
                badge:
                  entityMode === 'official_entries'
                    ? cetEntryEntitiesWithHomographIdx.length.toLocaleString()
                    : cetEntries.length.toLocaleString(),
              },
            ] as const
          ).map((mode) => {
            const active = entityMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setEntityMode(mode.id);
                  setSelectedRowIds(new Set());
                  lastClickedIndexRef.current = null;
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] font-semibold shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{mode.label}</span>
                <span className={`hidden sm:inline font-mono-tabular text-[11px] ${active ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'}`}>
                  {mode.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Actions: Save Collection, Export & Dynamic Column Visibility */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary)] inline-flex items-center gap-1 cursor-pointer"
            title="将当前筛选条件保存为动态词集"
          >
            <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">存为词集</span>
          </button>

          <button
            type="button"
            onClick={handleExportAnkiTsv}
            className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
            title="导出包含 COCA 分词性排名、BNC 词族与个人笔记的 Anki TSV 制卡文件"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Anki TSV</span>
          </button>

          <button
            type="button"
            onClick={() => onExportCurrentFiltered('csv')}
            className="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono-tabular text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            title="导出 CSV"
          >
            CSV
          </button>

          {entityMode === 'forms' && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnMenu((v) => !v)}
                className="p-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                title="自定义显示列"
                aria-label="自定义显示列"
              >
                <Columns className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              {showColumnMenu && (
                <div className="absolute right-0 mt-1 w-48 p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl z-30 space-y-1.5 text-xs">
                  <div className="font-semibold text-[var(--text-muted)] text-[10px] uppercase tracking-wider pb-1 border-b border-[var(--border-subtle)]">
                    表格显示列配置
                  </div>
                  {[
                    { key: 'cocaRank', label: 'COCA 排名与频次' },
                    { key: 'cocaPos', label: 'COCA 词性分布' },
                    { key: 'cetLevel', label: 'CET 四六级考纲' },
                    { key: 'bncFamily', label: 'BNC 词族与频段' },
                    { key: 'bncFormFreq', label: 'BNC 词形实测频次' },
                  ].map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 py-0.5 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <input
                        type="checkbox"
                        checked={visibleCols[col.key as keyof typeof visibleCols]}
                        onChange={() =>
                          setVisibleCols((prev) => ({
                            ...prev,
                            [col.key]: !prev[col.key as keyof typeof visibleCols],
                          }))
                        }
                        className="rounded border-[var(--border-strong)]"
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Search, Source Intersection, COCA Quick Tiers, Sort & Advanced Toggle */}
      <div className="px-3.5 sm:px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center gap-2 shrink-0">
        {/* Search Input + Match Mode */}
        <div className="flex items-center flex-1 min-w-[230px] sm:min-w-[265px] max-w-md h-8 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md focus-within:border-[var(--accent-primary)] overflow-hidden">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] ml-2.5 shrink-0" />
          <input
            type="search"
            value={criteria.searchQuery}
            onChange={(e) =>
              onChangeCriteria((prev) => ({ ...prev, searchQuery: e.target.value }))
            }
            placeholder="搜索单词、词头或短语…"
            aria-label="词库检索"
            className="w-full px-2 h-full text-xs bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none min-w-0"
          />
          {criteria.searchQuery && (
            <button
              type="button"
              onClick={() => onChangeCriteria((prev) => ({ ...prev, searchQuery: '' }))}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
              aria-label="清空搜索"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <select
            value={criteria.searchMatchMode || 'auto'}
            onChange={(e) =>
              onChangeCriteria((prev) => ({
                ...prev,
                searchMatchMode: e.target.value as FilterCriteria['searchMatchMode'],
              }))
            }
            aria-label="搜索匹配模式"
            className="px-2 h-full text-[11px] bg-[var(--bg-subtle)] border-l border-[var(--border-subtle)] text-[var(--text-secondary)] focus:outline-none cursor-pointer shrink-0"
          >
            <option value="auto">智能</option>
            <option value="prefix">前缀</option>
            <option value="contains">包含</option>
            <option value="exact">精确</option>
            <option value="fuzzy">容错</option>
          </select>
        </div>

        {/* 3-Source Filter Dropdown */}
        <select
          value={criteria.sourceFilter}
          onChange={(e) =>
            onChangeCriteria((prev) => ({
              ...prev,
              sourceFilter: e.target.value as SourceFilterOption,
            }))
          }
          aria-label="多源范围与交集筛选"
          className="h-8 px-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] max-w-[195px] sm:max-w-[230px] truncate cursor-pointer shrink-0"
        >
          {sourceFilterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* COCA Quick Rank Range Selector */}
        <div className="hidden xl:flex items-center h-8 gap-0.5 bg-[var(--bg-canvas)] px-1 rounded-md border border-[var(--border-subtle)] text-[11px] font-mono-tabular shrink-0">
          <span className="px-1 text-[var(--text-muted)]">COCA:</span>
          {[
            { label: '全量', max: null },
            { label: '1k', max: 1000 },
            { label: '3k', max: 3000 },
            { label: '5k', max: 5000 },
            { label: '10k', max: 10000 },
            { label: '20k', max: 20000 },
            { label: '60k', max: 60000 },
          ].map((tier) => {
            const isSelected =
              criteria.maxCocaRank === tier.max &&
              (tier.max === null || criteria.minCocaRank === 1 || criteria.minCocaRank === null);
            return (
              <button
                key={tier.label}
                type="button"
                onClick={() => setCocaQuickRankMax(tier.max)}
                className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-[var(--accent-primary)] text-white font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tier.label}
              </button>
            );
          })}
        </div>

        {/* Sort Selector */}
        <select
          value={sortBy}
          onChange={(e) => onChangeSortBy(e.target.value as SortOption)}
          aria-label="排序依据"
          className="h-8 px-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-secondary)] focus:outline-none max-w-[165px] truncate cursor-pointer shrink-0"
        >
          <option value="priority_weight_desc">综合价值降序</option>
          <option value="coca_rank_asc">COCA 排名升序</option>
          <option value="coca_freq_desc">COCA 频次降序</option>
          <option value="coca_pos_count_desc">COCA 词性数降序</option>
          <option value="family_freq_desc">BNC 族频次降序</option>
          <option value="form_freq_desc">BNC 词频降序</option>
          <option value="band_asc">BNC 频段 1k→25k</option>
          <option value="alpha_asc">字母顺序 A→Z</option>
          <option value="updated_desc">最近标注时间</option>
        </select>

        {/* Advanced Filter Drawer Toggle */}
        <button
          type="button"
          onClick={() => setShowAdvancedFilters((v) => !v)}
          aria-expanded={showAdvancedFilters}
          className={`h-8 px-2.5 rounded-md border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
            showAdvancedFilters || hasActiveFilters
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>筛选</span>
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              onSelectStaticCollectionId(null);
              onChangeCriteria(DEFAULT_FILTER_CRITERIA);
            }}
            className="h-8 px-2 rounded-md text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            title="重置全部筛选条件"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">重置</span>
          </button>
        )}
      </div>

      {/* Collapsible Multi-Dimensional Filter Panel (Clean Aligned Labeled Grid) */}
      {showAdvancedFilters && (
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2.5 text-xs shrink-0">
          {/* Row 1: COCA Rank Mode & Range + Structural Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-[96px_1fr] gap-2 items-center">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              COCA 排名口径
            </span>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeCriteria((prev) => ({ ...prev, cocaRankMode: 'lemma_pos' }))
                    }
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      criteria.cocaRankMode !== 'derived_headword'
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    词元+词性官方排名 (1–60k)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeCriteria((prev) => ({
                        ...prev,
                        cocaRankMode: 'derived_headword',
                      }))
                    }
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      criteria.cocaRankMode === 'derived_headword'
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    词头合计派生排名 (1–53.9k)
                  </button>
                </div>

                <div className="flex items-center gap-1 font-mono-tabular">
                  <input
                    type="number"
                    min={1}
                    max={60000}
                    value={criteria.minCocaRank ?? ''}
                    onChange={(e) =>
                      onChangeCriteria((prev) => ({
                        ...prev,
                        minCocaRank: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    placeholder="最低排名 1"
                    className="w-24 px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                  />
                  <span className="text-[var(--text-muted)]">–</span>
                  <input
                    type="number"
                    min={1}
                    max={60000}
                    value={criteria.maxCocaRank ?? ''}
                    onChange={(e) =>
                      onChangeCriteria((prev) => ({
                        ...prev,
                        maxCocaRank: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    placeholder="最高 60000"
                    className="w-24 px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={Boolean(criteria.cocaMultiPosOnly)}
                    onChange={(e) =>
                      onChangeCriteria((prev) => ({ ...prev, cocaMultiPosOnly: e.target.checked }))
                    }
                    className="rounded border-[var(--border-strong)]"
                  />
                  <span>仅多词性词头 (≥2 PoS)</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={criteria.familyFilter === 'headword_only'}
                    onChange={(e) =>
                      onChangeCriteria((prev) => ({
                        ...prev,
                        familyFilter: e.target.checked ? 'headword_only' : 'all',
                      }))
                    }
                    className="rounded border-[var(--border-strong)]"
                  />
                  <span>仅 BNC 词族首词</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={criteria.homographsOnly}
                    onChange={(e) =>
                      onChangeCriteria((prev) => ({ ...prev, homographsOnly: e.target.checked }))
                    }
                    className="rounded border-[var(--border-strong)]"
                  />
                  <span>CET 同形异义词</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={criteria.phrasesOnly}
                    onChange={(e) =>
                      onChangeCriteria((prev) => ({ ...prev, phrasesOnly: e.target.checked }))
                    }
                    className="rounded border-[var(--border-strong)]"
                  />
                  <span>多词表达</span>
                </label>
              </div>
            </div>
          </div>

          {/* Row 2: All 14 COCA Part-of-Speech Filter Pills */}
          <div className="grid grid-cols-1 md:grid-cols-[96px_1fr] gap-2 items-start pt-2 border-t border-[var(--border-subtle)]/70">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider pt-0.5">
              COCA 14 词性
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {ALL_COCA_POS.map((pos) => {
                const meta = COCA_POS_META[pos];
                const active = (criteria.cocaPosFilter || []).includes(pos);
                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => toggleCocaPos(pos)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono-tabular border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white font-semibold'
                        : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: BNC Band Presets & Learning Status Filters */}
          <div className="grid grid-cols-1 md:grid-cols-[96px_1fr] gap-2 items-center pt-2 border-t border-[var(--border-subtle)]/70">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              频段与学习状态
            </span>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: '全部频段', bands: [] as number[] },
                  { label: 'BNC 1k–3k', bands: [1, 2, 3] },
                  { label: 'BNC 4k–6k', bands: [4, 5, 6] },
                  { label: 'BNC 7k–10k', bands: [7, 8, 9, 10] },
                  {
                    label: 'BNC 11k–25k',
                    bands: Array.from({ length: 15 }, (_, i) => i + 11),
                  },
                ].map((preset) => {
                  const isSelected =
                    preset.bands.length === criteria.bands.length &&
                    preset.bands.every((b) => criteria.bands.includes(b));
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        onChangeCriteria((prev) => ({ ...prev, bands: preset.bands }))
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-mono-tabular border cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--accent-soft)] border-[var(--accent-primary)] text-[var(--accent-primary)] font-semibold'
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {ALL_STATUSES.map((st) => {
                  const meta = LEARNING_STATUS_META[st];
                  const active = criteria.statuses.includes(st);
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => toggleStatusFilter(st)}
                      className={`px-2 py-0.5 rounded text-[11px] border cursor-pointer ${
                        active
                          ? `${meta.badgeClass} font-semibold`
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {meta.shortLabel}
                    </button>
                  );
                })}

                {staticCollections.length > 0 && (
                  <select
                    value={selectedStaticCollectionId || ''}
                    onChange={(e) => onSelectStaticCollectionId(e.target.value || null)}
                    aria-label="限定词集"
                    className="ml-1 px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px]"
                  >
                    <option value="">不限词集</option>
                    {staticCollections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.wordIds.length})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fast Multi-Selection Preset Strip (Fixed single-row height — never shifts table down) */}
      {entityMode === 'forms' && (
        <div className="px-3.5 sm:px-4 h-9 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 flex items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="font-mono-tabular font-semibold text-[var(--text-secondary)] whitespace-nowrap">
              快速多选:
            </span>
            <button
              type="button"
              onClick={() =>
                setSelectedRowIds(new Set(filteredWords.slice(0, 50).map((w) => w.id)))
              }
              className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)] cursor-pointer whitespace-nowrap"
            >
              选前50
            </button>
            <button
              type="button"
              onClick={() =>
                setSelectedRowIds(new Set(filteredWords.slice(0, 100).map((w) => w.id)))
              }
              className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)] cursor-pointer whitespace-nowrap"
            >
              选前100
            </button>
            <button
              type="button"
              onClick={() => {
                const unmastered = filteredWords
                  .filter((w) => (userRecordsMap.get(w.id)?.status || 'unrated') !== 'mastered')
                  .slice(0, 100)
                  .map((w) => w.id);
                setSelectedRowIds(new Set(unmastered));
              }}
              className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)] cursor-pointer whitespace-nowrap"
            >
              选未掌握(前100)
            </button>
            {selectedRowIds.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const topSlice = filteredWords.slice(0, Math.max(100, selectedRowIds.size));
                    const next = new Set<string>();
                    for (const w of topSlice) {
                      if (!selectedRowIds.has(w.id)) next.add(w.id);
                    }
                    setSelectedRowIds(next);
                  }}
                  className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  反选
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRowIds(new Set())}
                  className="px-2 py-0.5 rounded text-[11px] text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer whitespace-nowrap"
                >
                  清空 ({selectedRowIds.size})
                </button>
              </>
            )}
          </div>
          <span className="hidden md:inline text-[11px] text-[var(--text-muted)] whitespace-nowrap shrink-0">
            按住勾选框上下滑动连续多选 · Shift+点击区间连选 · 空格键切换
          </span>
        </div>
      )}

      {/* Table Header */}
      {entityMode === 'lexemes' ? (
        containerWidth >= 740 ? (
          <div className="grid grid-cols-[64px_minmax(120px,1.3fr)_84px_92px_minmax(100px,1fr)_96px_74px] gap-x-3 items-center px-4 py-2 bg-[var(--bg-subtle)]/70 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] shrink-0">
            <div className="truncate">官方排名</div>
            <div className="truncate">词元</div>
            <div className="truncate">词性</div>
            <div className="text-right truncate">COCA 频次</div>
            <div className="truncate">占词头比</div>
            <div className="truncate">BNC / 考纲</div>
            <div className="text-right truncate">词性状态</div>
          </div>
        ) : (
          <div className="grid grid-cols-[58px_minmax(110px,1.3fr)_76px_80px_70px] gap-x-2.5 items-center px-3.5 py-2 bg-[var(--bg-subtle)]/70 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] shrink-0">
            <div className="truncate">排名</div>
            <div className="truncate">词元</div>
            <div className="truncate">词性</div>
            <div className="text-right truncate">频次</div>
            <div className="text-right truncate">状态</div>
          </div>
        )
      ) : entityMode === 'families' ? (
        containerWidth >= 740 ? (
          <div className="grid grid-cols-[68px_minmax(130px,1.3fr)_88px_92px_minmax(140px,1.5fr)_72px] gap-x-3 items-center px-4 py-2 bg-[var(--bg-subtle)]/70 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] shrink-0">
            <div className="truncate">BNC 频段</div>
            <div className="truncate">词族首词</div>
            <div className="text-right truncate">族总频次</div>
            <div className="truncate">COCA 排名</div>
            <div className="truncate">派生与屈折成员预览</div>
            <div className="text-right truncate">操作</div>
          </div>
        ) : (
          <div className="grid grid-cols-[60px_minmax(120px,1.4fr)_82px_72px_66px] gap-x-2.5 items-center px-3.5 py-2 bg-[var(--bg-subtle)]/70 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] shrink-0">
            <div className="truncate">频段</div>
            <div className="truncate">词族首词</div>
            <div className="text-right truncate">总频次</div>
            <div className="truncate">COCA</div>
            <div className="text-right truncate">操作</div>
          </div>
        )
      ) : entityMode === 'official_entries' ? (
        containerWidth >= 720 ? (
          <div className="grid grid-cols-[68px_minmax(140px,1.25fr)_112px_minmax(170px,1.8fr)_100px] gap-x-3 items-center px-4 py-2 bg-[var(--bg-subtle)]/70 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] shrink-0">
            <div className="truncate">考纲等级</div>
            <div className="truncate">考纲词目 · 对应词性</div>
            <div className="truncate">COCA · BNC</div>
            <div className="truncate">同词目派生/变体与考纲记录</div>
            <div className="text-right truncate">组内掌握 / 状态</div>
          </div>
        ) : (
          <div className="grid grid-cols-[58px_minmax(110px,1.2fr)_minmax(115px,1.4fr)_72px] gap-x-2.5 items-center px-3.5 py-2 bg-[var(--bg-subtle)]/70 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] shrink-0">
            <div className="truncate">等级</div>
            <div className="truncate">考纲词目</div>
            <div className="truncate">同词目派生与记录</div>
            <div className="text-right truncate">状态</div>
          </div>
        )
      ) : !isCompactCardLayout ? (
        <div
          style={{ gridTemplateColumns: formsGridTemplate }}
          className="grid gap-x-3 items-center px-3.5 sm:px-4 py-2 bg-[var(--bg-subtle)]/70 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] shrink-0 select-none"
        >
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => {
                if (selectedRowIds.size > 0) setSelectedRowIds(new Set());
                else setSelectedRowIds(new Set(filteredWords.slice(0, 50).map((w) => w.id)));
              }}
              className="text-[var(--text-muted)] hover:text-[var(--accent-primary)] cursor-pointer"
              title="勾选前 50 项 / 清空选择"
            >
              {selectedRowIds.size > 0 ? (
                <CheckSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <div className="min-w-0 truncate">词形</div>
          {visibleCols.cocaRank && <div className="min-w-0 truncate">COCA 排名 · 频次</div>}
          {!isMediumTableLayout && visibleCols.cocaPos && (
            <div className="min-w-0 truncate">COCA 词性分布</div>
          )}
          {visibleCols.cetLevel && <div className="min-w-0 truncate">考纲</div>}
          {visibleCols.bncFamily && <div className="min-w-0 truncate">BNC 词族</div>}
          {!isMediumTableLayout && visibleCols.bncFormFreq && (
            <div className="min-w-0 text-right truncate">BNC 词频</div>
          )}
          <div className="min-w-0 text-right truncate">状态</div>
        </div>
      ) : (
        <div className="px-3.5 py-1.5 bg-[var(--bg-subtle)]/70 border-b border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] shrink-0">
          <span>词形列表 ({activeListCount.toLocaleString()})</span>
          <span>COCA · BNC · 状态</span>
        </div>
      )}

      {/* Virtualized Body */}
      <div
        ref={parentRef}
        onScroll={(e) => onScrollOffsetChange?.(e.currentTarget.scrollTop)}
        className="lexicon-table-container flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-[var(--bg-surface)] select-none"
      >
        {activeListCount === 0 ? (
          <div className="py-20 px-6 text-center space-y-2">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              当前筛选条件下没有匹配记录
            </p>
            <button
              type="button"
              onClick={() => {
                onSelectStaticCollectionId(null);
                onChangeCriteria(DEFAULT_FILTER_CRITERIA);
              }}
              className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-white cursor-pointer"
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

              // ================= MODE 1: COCA LEXEMES (60,000) =================
              if (entityMode === 'lexemes') {
                const lex = lexemeEntities[rowIndex];
                if (!lex) return null;
                const wordItem = wordsMap.get(lex.normalizedHeadword);
                const userRec = userRecordsMap.get(lex.normalizedHeadword);
                const posSt: LearningStatus =
                  userRec?.posStatuses?.[lex.pos] || userRec?.status || 'unrated';
                const posMeta = COCA_POS_META[lex.pos];
                const sharePct = Math.round(lex.shareInHeadwordPct);

                return (
                  <div
                    key={lex.id}
                    onClick={() => wordItem && onSelectWord(wordItem, true)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`grid ${
                      containerWidth >= 740
                        ? 'grid-cols-[64px_minmax(120px,1.3fr)_84px_92px_minmax(100px,1fr)_96px_74px] gap-x-3 px-4'
                        : 'grid-cols-[58px_minmax(110px,1.3fr)_76px_80px_70px] gap-x-2.5 px-3.5'
                    } items-center border-b border-[var(--border-subtle)]/70 text-xs hover:bg-[var(--bg-hover)] cursor-pointer`}
                  >
                    <div className="min-w-0 truncate font-mono-tabular font-semibold text-blue-600 dark:text-blue-400">
                      #{lex.rank.toLocaleString()}
                    </div>
                    <div className="min-w-0 flex items-baseline gap-1.5 overflow-hidden">
                      <span
                        translate="no"
                        className="font-serif-lexicon font-semibold text-[15px] text-[var(--text-primary)] truncate"
                      >
                        {lex.headword}
                      </span>
                      {wordItem && (wordItem.cocaPosCount || 0) > 1 && (
                        <span className="text-[10px] font-mono-tabular text-[var(--text-muted)] shrink-0">
                          ({wordItem.cocaPosCount}性)
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono-tabular font-semibold inline-block truncate max-w-full ${
                          posMeta?.badgeClass || ''
                        }`}
                      >
                        {posMeta?.shortLabel || lex.pos}
                      </span>
                    </div>
                    <div className="min-w-0 text-right font-mono-tabular font-medium text-[var(--text-primary)] truncate">
                      {lex.frequency.toLocaleString()}
                    </div>
                    {containerWidth >= 740 && (
                      <div className="min-w-0 flex items-center gap-2 font-mono-tabular text-[11px] overflow-hidden">
                        <div className="w-14 h-1.5 bg-[var(--bg-subtle)] rounded-xs overflow-hidden shrink-0">
                          <div
                            className="h-full bg-[var(--accent-primary)]"
                            style={{ width: `${Math.max(3, sharePct)}%` }}
                          />
                        </div>
                        <span className="text-[var(--text-secondary)] truncate">{sharePct}%</span>
                      </div>
                    )}
                    {containerWidth >= 740 && (
                      <div className="min-w-0 flex items-center gap-1 font-mono-tabular text-[11px] overflow-hidden">
                        {wordItem?.band && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[10px] text-[var(--text-secondary)] shrink-0">
                            {wordItem.band}
                          </span>
                        )}
                        {wordItem?.isCet4 && (
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0 bg-teal-500/12 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                            CET-4
                          </span>
                        )}
                        {!wordItem?.isCet4 && wordItem?.isCet6 && (
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0 bg-indigo-500/12 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                            CET-6
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      {wordItem && onPosStatusChange ? (
                        <select
                          aria-label={`${lex.headword} (${lex.pos}) 状态`}
                          value={userRec?.posStatuses?.[lex.pos] || 'unrated'}
                          onChange={(e) =>
                            onPosStatusChange(
                              wordItem.id,
                              wordItem.word,
                              lex.pos,
                              e.target.value as LearningStatus
                            )
                          }
                          className={`appearance-none text-center px-1.5 py-0.5 rounded text-[11px] font-medium border cursor-pointer ${LEARNING_STATUS_META[posSt].badgeClass}`}
                        >
                          {ALL_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {LEARNING_STATUS_META[st].shortLabel}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  </div>
                );
              }

              // ================= MODE 2: BNC FAMILIES (25,002) =================
              if (entityMode === 'families') {
                const fam = familyEntities[rowIndex];
                if (!fam) return null;
                const hwItem = wordsMap.get(fam.normalizedHeadword);
                return (
                  <div
                    key={fam.id}
                    onClick={() => {
                      if (hwItem) onSelectWord(hwItem, true);
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`grid ${
                      containerWidth >= 740
                        ? 'grid-cols-[68px_minmax(130px,1.3fr)_88px_92px_minmax(140px,1.5fr)_72px] gap-x-3 px-4'
                        : 'grid-cols-[60px_minmax(120px,1.4fr)_82px_72px_66px] gap-x-2.5 px-3.5'
                    } items-center border-b border-[var(--border-subtle)]/70 text-xs hover:bg-[var(--bg-hover)] cursor-pointer`}
                  >
                    <div className="min-w-0 overflow-hidden">
                      <span className="px-1.5 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] font-mono-tabular text-[11px] font-semibold text-[var(--text-secondary)]">
                        BNC {fam.band}
                      </span>
                    </div>
                    <div className="min-w-0 flex items-baseline gap-1.5 overflow-hidden">
                      <span
                        translate="no"
                        className="font-serif-lexicon font-bold text-[15px] text-[var(--text-primary)] truncate"
                      >
                        {fam.headword}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] shrink-0">
                        ({fam.members.length}词)
                      </span>
                    </div>
                    <div className="min-w-0 text-right font-mono-tabular font-semibold text-[var(--text-primary)] truncate">
                      {fam.totalFrequency.toLocaleString()}
                    </div>
                    <div className="min-w-0 font-mono-tabular text-[11px] truncate">
                      {fam.headwordCocaRank ? (
                        <span className="text-blue-600 dark:text-blue-400 font-semibold">
                          #{fam.headwordCocaRank.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </div>
                    {containerWidth >= 740 && (
                      <div
                        translate="no"
                        className="min-w-0 text-[11px] text-[var(--text-muted)] truncate"
                      >
                        {fam.members
                          .slice(0, 6)
                          .map((m) => m.word)
                          .join(' · ')}
                      </div>
                    )}
                    <div className="text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onInspectFamily(fam.id, fam.normalizedHeadword)}
                        className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] text-[var(--accent-primary)] hover:border-[var(--accent-primary)] cursor-pointer whitespace-nowrap"
                      >
                        图谱 →
                      </button>
                    </div>
                  </div>
                );
              }

              // ================= MODE 3: CET2016 OFFICIAL ENTRIES (5,377) =================
              if (entityMode === 'official_entries') {
                const wrapped = cetEntryEntitiesWithHomographIdx[rowIndex];
                if (!wrapped) return null;
                const { entry, occurrenceIdx } = wrapped;
                const expandedWords = Array.from(
                  new Set(entry.members.flatMap((m) => m.expandedForms))
                );
                const coreWordStr = expandedWords[0] || '';
                const coreWord = wordsMap.get(coreWordStr.toLowerCase()) || null;
                const siblingWords = expandedWords
                  .slice(1)
                  .map((sw) => ({
                    spelling: sw,
                    item: wordsMap.get(sw.toLowerCase()) || null,
                  }));

                // Resolve distinct PoS & COCA rank for homograph entries (e.g., abstract¹ vs abstract²)
                const resolvedHomograph = resolveCetEntryHomographLexeme(
                  entry,
                  coreWord,
                  occurrenceIdx
                );
                const corePosMeta = resolvedHomograph.pos
                  ? COCA_POS_META[resolvedHomograph.pos]
                  : null;
                const effectiveCocaRank =
                  resolvedHomograph.rank ?? coreWord?.cocaBestPosRank ?? null;

                const coreStatus: LearningStatus =
                  (coreWord && userRecordsMap.get(coreWord.id)?.status) || 'unrated';
                const coreStatusMeta = LEARNING_STATUS_META[coreStatus];
                const masteredInGroup = expandedWords.filter(
                  (ew) => userRecordsMap.get(ew.toLowerCase())?.status === 'mastered'
                ).length;

                return (
                  <div
                    key={`${entry.level}-${entry.lineNumber}`}
                    onClick={() => coreWord && onSelectWord(coreWord, true)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`grid ${
                      containerWidth >= 720
                        ? 'grid-cols-[68px_minmax(140px,1.25fr)_112px_minmax(170px,1.8fr)_100px] gap-x-3 px-4'
                        : 'grid-cols-[58px_minmax(110px,1.2fr)_minmax(115px,1.4fr)_72px] gap-x-2.5 px-3.5'
                    } items-center border-b border-[var(--border-subtle)]/70 text-xs hover:bg-[var(--bg-hover)] cursor-pointer`}
                  >
                    {/* Col 1: Syllabus Level Badge */}
                    <div className="min-w-0 overflow-hidden">
                      <span
                        className={`px-2 py-0.5 rounded-md font-mono-tabular text-[10px] font-semibold ${
                          entry.isCet6
                            ? 'bg-indigo-500/12 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                            : 'bg-teal-500/12 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300'
                        }`}
                      >
                        {entry.isCet6 ? 'CET-6' : 'CET-4'}
                      </span>
                    </div>

                    {/* Col 2: Core Syllabus Headword & Homograph-Specific PoS */}
                    <div className="min-w-0 flex items-center gap-1.5 overflow-hidden">
                      <span
                        translate="no"
                        className="font-serif-lexicon font-bold text-[15px] text-[var(--text-primary)] truncate"
                      >
                        {coreWord?.word || coreWordStr}
                      </span>
                      {resolvedHomograph.homographNum !== null && (
                        <span className="px-1 py-0.2 rounded bg-amber-500/12 text-amber-700 dark:text-amber-300 text-[10px] font-mono-tabular font-semibold shrink-0">
                          同形 #{resolvedHomograph.homographNum}
                        </span>
                      )}
                      {corePosMeta && (
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono-tabular font-semibold shrink-0 ${corePosMeta.badgeClass}`}
                        >
                          {corePosMeta.shortLabel}
                        </span>
                      )}
                    </div>

                    {/* Col 3: Homograph-Specific COCA Rank & BNC Family Band (hidden on <720px) */}
                    {containerWidth >= 720 && (
                      <div className="min-w-0 font-mono-tabular text-[11px] flex items-center gap-1.5 truncate">
                        {effectiveCocaRank ? (
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            #{effectiveCocaRank.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                        {coreWord?.band && (
                          <span className="px-1.5 py-0.2 rounded bg-[var(--bg-subtle)] text-[10px] text-[var(--text-secondary)]">
                            {coreWord.band}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Col 4: Syllabus Sibling Derivatives (Learner-oriented, no raw syllabus line numbers) */}
                    <div className="min-w-0 flex flex-wrap items-center gap-1 max-h-[46px] overflow-y-auto no-scrollbar">
                      {siblingWords.length > 0 ? (
                        siblingWords.map(({ spelling, item }) => {
                          const sPosMeta = item?.cocaPrimaryPos
                            ? COCA_POS_META[item.cocaPrimaryPos]
                            : null;
                          const sMastered =
                            item && userRecordsMap.get(item.id)?.status === 'mastered';
                          return (
                            <button
                              key={spelling}
                              type="button"
                              translate="no"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item) onSelectWord(item, true);
                              }}
                              className="px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] hover:bg-[var(--border-subtle)] text-[11px] inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                            >
                              <span className="font-serif-lexicon font-medium text-[var(--text-primary)]">
                                {spelling}
                              </span>
                              {sPosMeta && (
                                <span
                                  className={`px-1 rounded text-[9px] font-mono-tabular font-semibold ${sPosMeta.badgeClass}`}
                                >
                                  {sPosMeta.abbr}
                                </span>
                              )}
                              {sMastered && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              )}
                            </button>
                          );
                        })
                      ) : coreWord?.headword && coreWord.headword !== coreWord.word ? (
                        <span className="text-[11px] text-[var(--text-muted)] truncate">
                          所属词族: <span translate="no" className="font-serif-lexicon text-[var(--text-secondary)]">{coreWord.headword}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)] truncate">
                          独立考纲词目
                        </span>
                      )}
                    </div>

                    {/* Col 5: Group Mastery Progress & Quick Status */}
                    <div
                      className="flex items-center justify-end gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {containerWidth >= 720 && expandedWords.length > 1 && (
                        <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                          {masteredInGroup}/{expandedWords.length}
                        </span>
                      )}
                      {coreWord && (
                        <select
                          aria-label={`${coreWord.word} 学习状态`}
                          value={coreStatus}
                          onChange={(e) =>
                            onQuickStatusChange(
                              coreWord.id,
                              coreWord.word,
                              e.target.value as LearningStatus
                            )
                          }
                          className={`appearance-none text-center px-1.5 py-0.5 rounded text-[11px] font-medium border cursor-pointer ${coreStatusMeta.badgeClass}`}
                        >
                          {ALL_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {LEARNING_STATUS_META[st].shortLabel}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              }

              // ================= MODE 4: WORD FORMS (94,954) =================
              const word = filteredWords[rowIndex];
              if (!word) return null;
              const userRec = userRecordsMap.get(word.id);
              const status: LearningStatus = userRec?.status || 'unrated';
              const statusMeta = LEARNING_STATUS_META[status];
              const isSelected = word.id === selectedWordId;
              const isChecked = selectedRowIds.has(word.id);

              const displayCocaRank =
                criteria.cocaRankMode === 'derived_headword'
                  ? (word.cocaHeadwordDerivedRank ?? null)
                  : (word.cocaBestPosRank ?? null);

              const bncFreqText = formatCompactFrequency(
                word.formFrequency,
                word.inBnc,
                word.bncLinkedViaVariant
              );

              const topLexemes = (word.cocaLexemes || []).slice(0, 2);
              const primaryPosMeta = word.cocaPrimaryPos
                ? COCA_POS_META[word.cocaPrimaryPos]
                : null;

              if (isCompactCardLayout) {
                return (
                  <div
                    key={word.id}
                    onMouseEnter={() => handleRowMouseEnterForDrag(rowIndex)}
                    onClick={(e) => {
                      if (e.shiftKey && lastClickedIndexRef.current !== null) {
                        applyRangeSelection(
                          lastClickedIndexRef.current,
                          rowIndex,
                          !isChecked,
                          selectedRowIds
                        );
                        lastClickedIndexRef.current = rowIndex;
                        return;
                      }
                      lastClickedIndexRef.current = rowIndex;
                      onSelectWord(word, true);
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`px-3 py-2 border-b border-[var(--border-subtle)]/70 flex items-center justify-between gap-2 cursor-pointer ${
                      isChecked
                        ? 'bg-[var(--accent-soft)]/90'
                        : isSelected
                          ? 'bg-[var(--bg-subtle)]'
                          : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isChecked}
                      aria-label={`选择 ${word.word}`}
                      onMouseDown={(e) =>
                        handleCheckboxMouseDown(e, rowIndex, word.id, isChecked)
                      }
                      onTouchEnd={(e) => {
                        e.stopPropagation();
                        toggleSingleRowSelection(rowIndex, word.id, isChecked, false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          toggleSingleRowSelection(rowIndex, word.id, isChecked, e.shiftKey);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-6 h-full flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          translate="no"
                          className="font-serif-lexicon font-semibold text-[15px] text-[var(--text-primary)] truncate"
                        >
                          {word.word}
                        </span>
                        {displayCocaRank !== null && (
                          <span className="text-[11px] font-mono-tabular text-blue-600 dark:text-blue-400 font-semibold shrink-0">
                            #{displayCocaRank.toLocaleString()}
                          </span>
                        )}
                        {primaryPosMeta && (
                          <span
                            className={`px-1.5 py-0.2 rounded border text-[10px] font-mono-tabular font-semibold shrink-0 ${primaryPosMeta.badgeClass}`}
                          >
                            {primaryPosMeta.abbr}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono-tabular text-[var(--text-muted)] truncate mt-0.5">
                        {[
                          word.band ? `BNC ${word.band}` : null,
                          word.headword ? `族:${word.headword}` : null,
                          word.isCet4 ? 'CET-4' : word.isCet6 ? 'CET-6' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>

                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <select
                        aria-label={`${word.word} 学习状态`}
                        value={status}
                        onChange={(e) =>
                          onQuickStatusChange(
                            word.id,
                            word.word,
                            e.target.value as LearningStatus
                          )
                        }
                        className={`appearance-none text-center px-2 py-0.5 rounded text-xs font-medium border cursor-pointer ${statusMeta.badgeClass}`}
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
                  onMouseEnter={() => handleRowMouseEnterForDrag(rowIndex)}
                  onClick={(e) => {
                    if (e.shiftKey && lastClickedIndexRef.current !== null) {
                      applyRangeSelection(
                        lastClickedIndexRef.current,
                        rowIndex,
                        !isChecked,
                        selectedRowIds
                      );
                      lastClickedIndexRef.current = rowIndex;
                      return;
                    }
                    lastClickedIndexRef.current = rowIndex;
                    onSelectWord(word, true);
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: formsGridTemplate,
                  }}
                  className={`group grid gap-x-3 items-center px-3.5 sm:px-4 border-b border-[var(--border-subtle)]/70 text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-[var(--accent-soft)]/90'
                      : isSelected
                        ? 'bg-[var(--bg-subtle)] ring-1 ring-inset ring-[var(--accent-primary)]/40'
                        : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {/* Col 1: Drag-Paint / Shift-Select / Touch / Keyboard Checkbox */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isChecked}
                    aria-label={`选择 ${word.word}`}
                    onMouseDown={(e) =>
                      handleCheckboxMouseDown(e, rowIndex, word.id, isChecked)
                    }
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      toggleSingleRowSelection(rowIndex, word.id, isChecked, false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        toggleSingleRowSelection(rowIndex, word.id, isChecked, e.shiftKey);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    title="点击勾选 · 按住上下滑动连续多选 · Shift+点击区间连选"
                    className="h-full w-full flex items-center justify-center cursor-pointer"
                  >
                    {isChecked ? (
                      <CheckSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-55 group-hover:opacity-100" />
                    )}
                  </button>

                  {/* Col 2: Word */}
                  <div className="min-w-0 flex items-baseline gap-1.5 overflow-hidden">
                    <span
                      translate="no"
                      className="font-serif-lexicon font-semibold text-[15px] text-[var(--text-primary)] truncate"
                    >
                      {word.word}
                    </span>
                    {word.homographNumbers.length > 0 && (
                      <span className="text-[10px] font-mono-tabular text-amber-700 dark:text-amber-400 shrink-0">
                        {word.homographNumbers.map((n) => 'I'.repeat(n)).join('/')}
                      </span>
                    )}
                    {word.displayVariants.length > 1 && (
                      <span
                        translate="no"
                        className="text-[10px] font-mono-tabular text-[var(--text-muted)] truncate"
                      >
                        [={word.displayVariants.find((v) => v.toLowerCase() !== word.normalized) || word.displayVariants[0]}]
                      </span>
                    )}
                  </div>

                  {/* Col 3: COCA Rank & Total Freq (Omitted when hidden) */}
                  {visibleCols.cocaRank && (
                    <div className="min-w-0 font-mono-tabular text-[11px] whitespace-nowrap truncate overflow-hidden">
                      {word.inCoca && displayCocaRank !== null ? (
                        <div className="flex items-center gap-1 truncate">
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            #{displayCocaRank.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            ({formatCompactFrequency(word.cocaHeadwordTotalFreq ?? null, true)})
                          </span>
                          {isMediumTableLayout && primaryPosMeta && (
                            <span
                              className={`px-1 py-0.2 rounded border text-[9px] font-semibold ${primaryPosMeta.badgeClass}`}
                            >
                              {primaryPosMeta.abbr}
                            </span>
                          )}
                        </div>
                      ) : word.cocaLinkedViaVariant ? (
                        <span className="text-[10px] text-blue-600/80 dark:text-blue-400/80">
                          变体映射
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </div>
                  )}

                  {/* Col 4: COCA PoS Distribution (Omitted when hidden or medium layout) */}
                  {!isMediumTableLayout && visibleCols.cocaPos && (
                    <div
                      className="min-w-0 flex items-center gap-1 overflow-hidden"
                      title={
                        (word.cocaLexemes || [])
                          .map(
                            (l) =>
                              `${COCA_POS_META[l.pos]?.label || l.pos}: #${l.rank} (${Math.round(l.sharePct)}%)`
                          )
                          .join(' | ') || undefined
                      }
                    >
                      {topLexemes.length > 0 ? (
                        <>
                          {topLexemes.map((lex, idx) => {
                            const pMeta = COCA_POS_META[lex.pos];
                            const multiPos = (word.cocaLexemes || []).length > 1;
                            const pct =
                              multiPos && idx === 0
                                ? lex.sharePct >= 99.5
                                  ? 99
                                  : Math.max(1, Math.round(lex.sharePct))
                                : null;
                            return (
                              <span
                                key={lex.lexemeId}
                                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono-tabular font-semibold whitespace-nowrap shrink-0 ${
                                  pMeta?.badgeClass || ''
                                }`}
                              >
                                {idx === 0 ? pMeta?.shortLabel || lex.pos : pMeta?.abbr || lex.pos}
                                {pct !== null ? ` ${pct}%` : ''}
                              </span>
                            );
                          })}
                          {(word.cocaLexemes || []).length > 2 && (
                            <span className="text-[10px] font-mono-tabular text-[var(--text-muted)] shrink-0">
                              +{(word.cocaLexemes || []).length - 2}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] truncate">
                          {!word.isHeadword && word.headword ? `← ${word.headword}` : '—'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Col 5: CET Level (Omitted when hidden) */}
                  {visibleCols.cetLevel && (
                    <div className="min-w-0 font-mono-tabular text-[11px] whitespace-nowrap overflow-hidden">
                      {word.isCet4 && word.isCet6 ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-teal-500/12 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                          CET-4/6
                        </span>
                      ) : word.isCet4 ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-teal-500/12 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                          CET-4
                        </span>
                      ) : word.isCet6 ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/12 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                          CET-6
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </div>
                  )}

                  {/* Col 6: BNC Family & Band (Omitted when hidden) */}
                  {visibleCols.bncFamily && (
                    <div className="min-w-0 flex items-center gap-1 font-mono-tabular text-[11px] overflow-hidden">
                      {word.headword ? (
                        <>
                          {word.band && (
                            <span
                              className={`px-1 py-0.2 rounded text-[10px] font-semibold shrink-0 ${
                                (word.bandNumber || 99) <= 3
                                  ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
                                  : (word.bandNumber || 99) <= 9
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                              }`}
                            >
                              {word.band}
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
                            className="text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:underline truncate cursor-pointer"
                          >
                            {word.headword}
                          </button>
                        </>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </div>
                  )}

                  {/* Col 7: BNC Form Freq (Omitted when hidden) */}
                  {!isMediumTableLayout && visibleCols.bncFormFreq && (
                    <div className="min-w-0 text-right font-mono-tabular text-[11px] whitespace-nowrap truncate text-[var(--text-secondary)]">
                      {bncFreqText}
                    </div>
                  )}

                  {/* Col 8: Status Selector */}
                  <div className="min-w-0 flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <select
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
                      className={`appearance-none text-center px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer transition-colors ${
                        status === 'unrated'
                          ? 'border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]'
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

      {/* Floating Bottom Batch Action Dock (Never shifts table height when appearing) */}
      {entityMode === 'forms' && selectedRowIds.size > 0 && (
        <div
          role="region"
          aria-label="已选词条批量操作栏"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[96%] w-max px-3.5 py-2 rounded-xl bg-[var(--bg-surface)]/95 backdrop-blur-md border border-[var(--accent-primary)]/40 shadow-2xl flex flex-wrap items-center justify-center gap-2 text-xs"
        >
          <span className="px-2 py-0.5 rounded-md bg-[var(--accent-primary)] text-white font-mono-tabular font-semibold whitespace-nowrap">
            已选 {selectedRowIds.size} 词
          </span>

          <div className="flex items-center gap-1">
            {ALL_STATUSES.map((st) => {
              const stMeta = LEARNING_STATUS_META[st];
              return (
                <button
                  key={st}
                  type="button"
                  onClick={async () => {
                    try {
                      setBatchError(null);
                      await onBatchSetStatus(
                        Array.from(selectedRowIds),
                        st,
                        '检索视图底部批量标注'
                      );
                      setSelectedRowIds(new Set());
                    } catch (err) {
                      setBatchError(err instanceof Error ? err.message : '批量更新状态失败');
                    }
                  }}
                  className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer whitespace-nowrap transition-transform active:scale-95 ${stMeta.badgeClass}`}
                >
                  标为{stMeta.shortLabel}
                </button>
              );
            })}
          </div>

          {staticCollections.length > 0 && (
            <select
              aria-label="将已选词加入词集"
              defaultValue=""
              onChange={async (e) => {
                const colId = e.target.value;
                if (!colId) return;
                e.currentTarget.value = '';
                try {
                  setBatchError(null);
                  await onAddWordsToStaticCollection(colId, Array.from(selectedRowIds));
                } catch (err) {
                  setBatchError(err instanceof Error ? err.message : '加入词集失败');
                }
              }}
              className="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-medium text-[var(--text-secondary)] cursor-pointer"
            >
              <option value="" disabled>
                + 加入词集…
              </option>
              {staticCollections.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          )}

          <div className="inline-flex items-center gap-1">
            <input
              type="text"
              value={batchTagInput}
              onChange={(e) => setBatchTagInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && batchTagInput.trim()) {
                  const tagVal = batchTagInput.trim();
                  try {
                    setBatchError(null);
                    await onBatchAddTag(Array.from(selectedRowIds), tagVal);
                    setBatchTagInput('');
                  } catch (err) {
                    setBatchError(err instanceof Error ? err.message : '批量添加标签失败');
                  }
                }
              }}
              placeholder="批量打标签…"
              className="w-24 px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] text-[var(--text-primary)]"
            />
            {batchTagInput.trim() && (
              <button
                type="button"
                onClick={async () => {
                  const tagVal = batchTagInput.trim();
                  try {
                    setBatchError(null);
                    await onBatchAddTag(Array.from(selectedRowIds), tagVal);
                    setBatchTagInput('');
                  } catch (err) {
                    setBatchError(err instanceof Error ? err.message : '批量添加标签失败');
                  }
                }}
                className="px-2 py-1 rounded bg-[var(--accent-primary)] text-white text-[11px] font-semibold cursor-pointer"
              >
                添加
              </button>
            )}
          </div>

          {batchError && (
            <span className="text-[11px] text-rose-600 inline-flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{batchError}</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setSelectedRowIds(new Set())}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
            title="取消选择"
            aria-label="取消选择"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Save Dynamic Collection Modal */}
      {showSaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px] overscroll-contain"
          onClick={() => setShowSaveModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="保存为动态词集"
            className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-xl p-5 space-y-4 overscroll-contain"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                将当前筛选保存为动态规则词集
              </h3>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                aria-label="关闭弹窗"
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  词集名称
                </label>
                <input
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="例如：COCA Top 5000 多词性核心实词"
                  className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  规则备注
                </label>
                <input
                  type="text"
                  value={newCollectionDesc}
                  onChange={(e) => setNewCollectionDesc(e.target.value)}
                  placeholder="选填描述…"
                  className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)]"
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
                onClick={async () => {
                  if (!newCollectionName.trim()) return;
                  await onSaveDynamicCollection(
                    newCollectionName.trim(),
                    newCollectionDesc.trim() || '自定义多源动态规则词集'
                  );
                  setNewCollectionName('');
                  setNewCollectionDesc('');
                  setShowSaveModal(false);
                }}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-white cursor-pointer"
              >
                保存动态词集
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
