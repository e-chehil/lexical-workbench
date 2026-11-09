import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  Compass,
  Layers,
  BookmarkCheck,
  BarChart3,
  Database,
  Sun,
  Moon,
  FlaskConical,
} from 'lucide-react';
import {
  ActivityLogEntry,
  CocaRawPos,
  DictionaryTemplate,
  FilterCriteria,
  LearningStatus,
  LexiconDatabaseBundle,
  LexiconWordItem,
  NavigationTab,
  SortOption,
  UserWordRecord,
  WordCollection,
} from './data/types.ts';
import {
  buildLexiconDatabase,
  validateCustomDatasetContent,
} from './data/parser.ts';
import {
  DEFAULT_DICTIONARIES,
  DEFAULT_FILTER_CRITERIA,
  filterAndSortWords,
} from './data/searchAndFilter.ts';
import {
  batchUpdateWords,
  createOrUpdateCollection,
  CustomDatasetRecord,
  db,
  deleteCollection,
  ensureDefaultCollections,
  exportFullBackupPayload,
  getAllCustomDatasets,
  getAllUserWordRecords,
  getRecentActivityLogs,
  importFullBackupPayload,
  resetCustomDatasets,
  rollbackBatchLogs,
  saveCustomDataset,
  touchWordStudyRecord,
  undoSingleActivityLog,
  updateWordNote,
  updateWordPosStatus,
  updateWordStatus,
  updateWordTags,
} from './db/database.ts';
import { ExploreView } from './components/ExploreView.tsx';
import { CorpusLabView } from './components/CorpusLabView.tsx';
import { WordFamilyView } from './components/WordFamilyView.tsx';
import { CollectionsAndPlannerView } from './components/CollectionsAndPlannerView.tsx';
import { AnalyticsView } from './components/AnalyticsView.tsx';
import { SettingsAndDiagnosticsView } from './components/SettingsAndDiagnosticsView.tsx';
import { WordDetailDrawer } from './components/WordDetailDrawer.tsx';
import { GlobalSearchModal } from './components/GlobalSearchModal.tsx';

const DICT_STORAGE_KEY = 'lexical_workbench_dictionaries_v2';
const THEME_STORAGE_KEY = 'lexical_workbench_theme_v2';
const DENSITY_STORAGE_KEY = 'lexical_workbench_compact_density_v2';

export function App() {
  const [lexicon, setLexicon] = useState<LexiconDatabaseBundle | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasCustomDataset, setHasCustomDataset] = useState<boolean>(false);

  const [userRecordsMap, setUserRecordsMap] = useState<Map<string, UserWordRecord>>(new Map());
  const [collections, setCollections] = useState<WordCollection[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);

  const [activeTab, setActiveTab] = useState<NavigationTab>('explore');
  const [criteria, setCriteria] = useState<FilterCriteria>(DEFAULT_FILTER_CRITERIA);
  const [sortBy, setSortBy] = useState<SortOption>('coca_rank_asc');
  const [selectedStaticCollectionId, setSelectedStaticCollectionId] = useState<string | null>(
    null
  );

  const [selectedWordId, setSelectedWordId] = useState<string | null>('work');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1280;
    }
    return true;
  });
  const prevIsWideRef = useRef<boolean>(
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : true
  );
  const userManuallyClosedDrawerOnWideRef = useRef<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      const isWide = window.innerWidth >= 1280;
      if (prevIsWideRef.current && !isWide) {
        setIsDrawerOpen(false);
      } else if (!prevIsWideRef.current && isWide && !userManuallyClosedDrawerOnWideRef.current) {
        setIsDrawerOpen(true);
      }
      prevIsWideRef.current = isWide;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>('work');
  const [familyHighlightWordId, setFamilyHighlightWordId] = useState<string | null>(null);
  const [isCommandModalOpen, setIsCommandModalOpen] = useState<boolean>(false);

  const exploreScrollOffsetRef = useRef<number>(0);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  const [compactDensity, setCompactDensity] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const [dictionaries, setDictionaries] = useState<DictionaryTemplate[]>(() => {
    try {
      const raw = localStorage.getItem(DICT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const britannicaDef = DEFAULT_DICTIONARIES.find((d) => d.id === 'britannica');
          return parsed.map((d: DictionaryTemplate) =>
            d.id === 'youdao' && britannicaDef ? britannicaDef : d
          );
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_DICTIONARIES;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    const themeColor = darkMode ? '#090D16' : '#F8FAFC';
    document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
      el.setAttribute('content', themeColor);
    });
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, String(compactDensity));
    } catch {
      // ignore
    }
  }, [compactDensity]);

  const handleSaveDictionaries = useCallback((next: DictionaryTemplate[]) => {
    setDictionaries(next);
    try {
      localStorage.setItem(DICT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const refreshUserStoreData = useCallback(async () => {
    await ensureDefaultCollections();
    const [recordsList, cols, logs] = await Promise.all([
      getAllUserWordRecords(),
      db.collections.toArray(),
      getRecentActivityLogs(1500),
    ]);
    setUserRecordsMap(new Map(recordsList.map((r) => [r.wordId, r])));
    setCollections(cols);
    setActivityLogs(logs);
  }, []);

  const fetchTextWithFallback = async (primaryUrl: string, fallbackUrl: string) => {
    const res1 = await fetch(primaryUrl);
    if (res1.ok) {
      const text = await res1.text();
      if (!text.trim().startsWith('<!doctype html')) return text;
    }
    const res2 = await fetch(fallbackUrl);
    if (res2.ok) {
      return await res2.text();
    }
    throw new Error(`无法加载语料文件: ${primaryUrl}`);
  };

  const loadLexiconData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const customSets: CustomDatasetRecord[] = await getAllCustomDatasets();
      const customCet = customSets.find((d) => d.id === 'cet2016');
      const customBnc = customSets.find((d) => d.id === 'bnc_coca');
      const customCoca = customSets.find((d) => d.id === 'coca2020');
      setHasCustomDataset(Boolean(customCet || customBnc || customCoca));

      let cetText = customCet?.content || '';
      let bncText = customBnc?.content || '';
      let cocaText = customCoca?.content || '';

      const baseUrl = import.meta.env.BASE_URL || '/';

      const tasks: Promise<void>[] = [];
      if (!cetText) {
        tasks.push(
          fetchTextWithFallback(
            `${baseUrl}data/CET2016.txt`,
            `${baseUrl}assets/aistudio/CET2016_c8581113.txt`
          ).then((t) => {
            cetText = t;
          })
        );
      }
      if (!bncText) {
        tasks.push(
          fetchTextWithFallback(
            `${baseUrl}data/BNC_COCA_lists.txt`,
            `${baseUrl}assets/aistudio/BNC_COCA_lists_9ec2b6a0.txt`
          ).then((t) => {
            bncText = t;
          })
        );
      }
      if (!cocaText) {
        tasks.push(
          fetchTextWithFallback(
            `${baseUrl}data/coca_freq.json`,
            `${baseUrl}assets/aistudio/coca_freq_5e7c1609.json`
          ).then((t) => {
            cocaText = t;
          })
        );
      }

      if (tasks.length > 0) {
        await Promise.all(tasks);
      }

      const built = buildLexiconDatabase(cetText, bncText, cocaText);
      setLexicon(built);
      await refreshUserStoreData();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '解析多源词库时发生未知错误');
    } finally {
      setIsLoading(false);
    }
  }, [refreshUserStoreData]);

  useEffect(() => {
    loadLexiconData();
  }, [loadLexiconData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandModalOpen((prev) => !prev);
      } else if (e.key === 'Escape' && window.innerWidth < 1280) {
        setIsDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleWorkspaceChange = useCallback((nextTab: NavigationTab) => {
    setActiveTab(nextTab);
    if (
      nextTab === 'insights' ||
      nextTab === 'data_studio' ||
      nextTab === 'families' ||
      nextTab === 'study'
    ) {
      // Macro analytics, dataset management, 3-column family studio, and 2-column study planner
      // work best at full width; the single-word inspector opens on demand when a specific word is clicked.
      setIsDrawerOpen(false);
    } else if (nextTab === 'explore' && typeof window !== 'undefined' && window.innerWidth >= 1280) {
      setIsDrawerOpen(true);
    }
  }, []);

  const staticCollections = useMemo(
    () => collections.filter((c) => c.type === 'static' || c.type === 'study_plan'),
    [collections]
  );

  const allAvailableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const rec of userRecordsMap.values()) {
      for (const t of rec.tags || []) {
        tagSet.add(t);
      }
    }
    return Array.from(tagSet).sort();
  }, [userRecordsMap]);

  const wordsMap = useMemo(() => {
    if (!lexicon) return new Map<string, LexiconWordItem>();
    return new Map(lexicon.words.map((w) => [w.id, w]));
  }, [lexicon]);

  const familiesMap = useMemo(() => {
    if (!lexicon) return new Map();
    return new Map(lexicon.families.map((f) => [f.id, f]));
  }, [lexicon]);

  const variantToWordsMap = useMemo(() => {
    const m = new Map<string, LexiconWordItem[]>();
    if (!lexicon) return m;
    for (const w of lexicon.words) {
      for (const v of w.displayVariants) {
        const k = v.toLowerCase();
        const arr = m.get(k);
        if (arr) arr.push(w);
        else m.set(k, [w]);
      }
    }
    return m;
  }, [lexicon]);

  const filteredWords = useMemo(() => {
    if (!lexicon) return [];
    let staticSet: Set<string> | undefined;
    if (selectedStaticCollectionId) {
      const col = collections.find((c) => c.id === selectedStaticCollectionId);
      if (col) staticSet = new Set(col.wordIds);
    }
    const baseWords = staticSet
      ? lexicon.words.filter((w) => staticSet!.has(w.id))
      : lexicon.words;
    return filterAndSortWords(
      baseWords,
      userRecordsMap,
      criteria,
      sortBy,
      familiesMap
    );
  }, [
    lexicon,
    userRecordsMap,
    criteria,
    sortBy,
    selectedStaticCollectionId,
    collections,
    familiesMap,
  ]);

  const selectedWord = useMemo(() => {
    if (!selectedWordId) return null;
    return wordsMap.get(selectedWordId) || null;
  }, [wordsMap, selectedWordId]);

  const selectedWordLogs = useMemo(() => {
    if (!selectedWordId) return [];
    return activityLogs.filter((l) => l.wordId === selectedWordId);
  }, [activityLogs, selectedWordId]);

  // Handlers
  const handleStatusChange = useCallback(
    async (wordId: string, wordDisplay: string, status: LearningStatus) => {
      await updateWordStatus(wordId, wordDisplay, status, '手动标注');
      await refreshUserStoreData();
    },
    [refreshUserStoreData]
  );

  const handlePosStatusChange = useCallback(
    async (wordId: string, wordDisplay: string, pos: CocaRawPos, status: LearningStatus) => {
      await updateWordPosStatus(wordId, wordDisplay, pos, status, '分词性标注');
      await refreshUserStoreData();
    },
    [refreshUserStoreData]
  );

  const handleTagsChange = useCallback(
    async (wordId: string, wordDisplay: string, tags: string[]) => {
      await updateWordTags(wordId, wordDisplay, tags);
      await refreshUserStoreData();
    },
    [refreshUserStoreData]
  );

  const handleNoteChange = useCallback(
    async (wordId: string, wordDisplay: string, note: string) => {
      await updateWordNote(wordId, wordDisplay, note);
      await refreshUserStoreData();
    },
    [refreshUserStoreData]
  );

  const handleTouchStudyRecord = useCallback(
    async (wordId: string, wordDisplay: string) => {
      await touchWordStudyRecord(wordId, wordDisplay);
      await refreshUserStoreData();
    },
    [refreshUserStoreData]
  );

  const handleBatchSetStatus = useCallback(
    async (wordIds: string[], status: LearningStatus, label = '批量更改状态') => {
      if (!lexicon || wordIds.length === 0) return;
      const items = wordIds
        .map((id) => {
          const w = wordsMap.get(id);
          return w ? { wordId: w.id, word: w.word, status } : null;
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      await batchUpdateWords(items, {
        defaultStatus: status,
        commonTags: [],
        sourceLabel: label,
      });
      await refreshUserStoreData();
    },
    [lexicon, wordsMap, refreshUserStoreData]
  );

  const handleBatchAddTag = useCallback(
    async (wordIds: string[], tag: string) => {
      if (!lexicon || wordIds.length === 0 || !tag.trim()) return;
      const items = wordIds
        .map((id) => {
          const w = wordsMap.get(id);
          return w ? { wordId: w.id, word: w.word } : null;
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      await batchUpdateWords(items, {
        defaultStatus: 'unrated',
        commonTags: [tag.trim()],
        preserveExistingStatus: true,
        sourceLabel: `批量添加标签 #${tag.trim()}`,
      });
      await refreshUserStoreData();
    },
    [lexicon, wordsMap, refreshUserStoreData]
  );

  const handleToggleWordInCollection = useCallback(
    async (collectionId: string, wordId: string) => {
      const col = collections.find((c) => c.id === collectionId);
      if (!col) return;
      const hasWord = col.wordIds.includes(wordId);
      const nextWordIds = hasWord
        ? col.wordIds.filter((id) => id !== wordId)
        : [...col.wordIds, wordId];
      await createOrUpdateCollection({
        ...col,
        wordIds: nextWordIds,
      });
      await refreshUserStoreData();
    },
    [collections, refreshUserStoreData]
  );

  const handleAddWordsToStaticCollection = useCallback(
    async (collectionId: string, wordIds: string[]) => {
      const col = collections.find((c) => c.id === collectionId);
      if (!col) return;
      const merged = Array.from(new Set([...col.wordIds, ...wordIds]));
      await createOrUpdateCollection({
        ...col,
        wordIds: merged,
      });
      await refreshUserStoreData();
    },
    [collections, refreshUserStoreData]
  );

  const handleCreateStaticCollectionFromSelection = useCallback(
    async (name: string, wordIds: string[]) => {
      await createOrUpdateCollection({
        name,
        description: `从探索视图选区创建 (${wordIds.length} 词)`,
        type: 'static',
        entityType: 'mixed',
        wordIds: Array.from(new Set(wordIds)),
      });
      await refreshUserStoreData();
    },
    [refreshUserStoreData]
  );

  const handleSaveDynamicCollection = useCallback(
    async (name: string, description: string) => {
      await createOrUpdateCollection({
        name,
        description,
        type: 'dynamic',
        entityType: 'headword',
        wordIds: [],
        filterCriteria: criteria,
        sortField: sortBy,
      });
      await refreshUserStoreData();
    },
    [criteria, sortBy, refreshUserStoreData]
  );

  const handleInspectFamily = useCallback((familyId: string, highlightWord?: string) => {
    setSelectedFamilyId(familyId);
    setFamilyHighlightWordId(highlightWord || null);
    setActiveTab('families');
  }, []);

  const handleSelectWord = useCallback((word: LexiconWordItem, openDrawer = true) => {
    setSelectedWordId(word.id);
    if (openDrawer) setIsDrawerOpen(true);
  }, []);

  const handleSelectWordByString = useCallback(
    (wordStr: string) => {
      const key = wordStr.trim().toLowerCase();
      const found = wordsMap.get(key) || variantToWordsMap.get(key)?.[0];
      if (found) {
        setSelectedWordId(found.id);
        setIsDrawerOpen(true);
      }
    },
    [wordsMap, variantToWordsMap]
  );

  const handleExportWordList = useCallback(
    (list: LexiconWordItem[], filenamePrefix: string, format: 'txt' | 'csv') => {
      const dateStr = new Date().toISOString().slice(0, 10);
      if (format === 'txt') {
        const content = list.map((w) => w.word).join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filenamePrefix}-${dateStr}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const header = [
          '词条(Word)',
          '规范化ID',
          'COCA最佳排名',
          'COCA主词性',
          'COCA词头合计频次',
          'CET4',
          'CET6',
          'BNC频段',
          'BNC词族首词',
          'BNC词形频次',
          'BNC词族总频次',
          '个人状态',
          '标签',
          '笔记',
        ];
        const rows = list.map((w) => {
          const rec = userRecordsMap.get(w.id);
          return [
            `"${w.word.replace(/"/g, '""')}"`,
            `"${w.id.replace(/"/g, '""')}"`,
            w.cocaBestPosRank ?? '',
            w.cocaPrimaryPos ?? '',
            w.cocaHeadwordTotalFreq ?? '',
            w.isCet4 ? 'Y' : 'N',
            w.isCet6 ? 'Y' : 'N',
            w.band || '',
            `"${(w.headword || '').replace(/"/g, '""')}"`,
            w.formFrequency !== null ? w.formFrequency : '',
            w.familyFrequency !== null ? w.familyFrequency : '',
            rec?.status || 'unrated',
            `"${(rec?.tags || []).join(';').replace(/"/g, '""')}"`,
            `"${(rec?.notes || '').replace(/"/g, '""')}"`,
          ].join(',');
        });
        const csv = '\uFEFF' + [header.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filenamePrefix}-${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    },
    [userRecordsMap]
  );

  const handleExportLogsCsv = useCallback(() => {
    const header = ['ID', '时间', '词条', '动作类型', '词性', '原状态', '新状态', '来源标记'];
    const rows = activityLogs.map((l) =>
      [
        l.id || '',
        l.timestamp,
        `"${l.word.replace(/"/g, '""')}"`,
        l.actionType,
        l.targetPos || '',
        l.previousStatus || '',
        l.newStatus || '',
        `"${(l.sourceLabel || '').replace(/"/g, '""')}"`,
      ].join(',')
    );
    const csv = '\uFEFF' + [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lexical-activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activityLogs]);

  const handleExportBackupJson = useCallback(async () => {
    const payload = await exportFullBackupPayload();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lexical-workbench-v2-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 rounded-full border-2 border-[var(--accent-primary)] border-t-transparent animate-spin mb-4" />
        <h1 className="font-serif-lexicon text-xl font-bold text-[var(--text-primary)]">
          正在构建 Lexical Workbench 2.0 多源语料知识库…
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-1.5 max-w-md">
          正在实时对齐 COCA 2020 (60,000 词元+词性记录)、Nation BNC/COCA 2.0 (25,002 词族 / 76,125 词形) 与 CET2016 (5,377 条官方考纲词目)
        </p>
      </div>
    );
  }

  if (loadError || !lexicon) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md p-6 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
          <h2 className="text-base font-bold text-rose-600">词库加载失败</h2>
          <p className="text-xs text-[var(--text-secondary)]">{loadError}</p>
          <button
            type="button"
            onClick={loadLexiconData}
            className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-white cursor-pointer"
          >
            重试加载
          </button>
        </div>
      </div>
    );
  }

  const navItems: {
    id: NavigationTab;
    label: string;
    shortLabel: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    { id: 'explore', label: '检索', shortLabel: '检索', icon: Compass },
    { id: 'corpus_lab', label: '语料', shortLabel: '语料', icon: FlaskConical },
    { id: 'families', label: '词族', shortLabel: '词族', icon: Layers },
    { id: 'study', label: '学习', shortLabel: '学习', icon: BookmarkCheck },
    { id: 'insights', label: '洞察', shortLabel: '洞察', icon: BarChart3 },
    { id: 'data_studio', label: '数据', shortLabel: '数据', icon: Database },
  ];

  return (
    <div className="h-[100dvh] flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] overflow-hidden">
      <a
        href="#main-workspace"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded focus:bg-[var(--accent-primary)] focus:text-white focus:text-xs focus:font-semibold"
      >
        跳转到主工作区
      </a>

      {/* 3-Zone Architectural Top Header Bar */}
      <header className="h-12 px-3.5 sm:px-5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-4 shrink-0 z-20">
        {/* Zone 1: Single-line Brand Wordmark */}
        <div className="flex items-center gap-2 shrink-0 select-none">
          <span
            translate="no"
            className="w-6 h-6 rounded-md bg-[var(--accent-primary)] text-white font-serif-lexicon font-bold text-xs inline-flex items-center justify-center shadow-2xs"
          >
            LW
          </span>
          <span
            translate="no"
            className="font-serif-lexicon font-bold text-base tracking-tight text-[var(--text-primary)] whitespace-nowrap"
          >
            Lexical Workbench
          </span>
        </div>

        {/* Zone 2: Desktop 6-Workspace Segmented Pill Navigation */}
        <nav
          aria-label="主工作区导航"
          className="hidden md:inline-flex items-center p-1 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] gap-0.5 shrink-0"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleWorkspaceChange(item.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-ring ${
                  isActive
                    ? 'bg-[var(--bg-surface)] dark:bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Global Command Search & Theme Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsCommandModalOpen(true)}
            className="px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-ring"
            title="全局词库快速检索 (Ctrl+K / ⌘K)"
          >
            <Search className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">全局检索</span>
            <kbd
              translate="no"
              className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono-tabular bg-[var(--bg-subtle)] rounded border border-[var(--border-subtle)] text-[var(--text-muted)]"
            >
              ⌘&nbsp;K
            </kbd>
          </button>

          {selectedWord && activeTab !== 'insights' && (
            <button
              type="button"
              onClick={() =>
                setIsDrawerOpen((o) => {
                  const next = !o;
                  if (typeof window !== 'undefined' && window.innerWidth >= 1280) {
                    userManuallyClosedDrawerOnWideRef.current = !next;
                  }
                  return next;
                })
              }
              className={`px-2.5 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-ring ${
                isDrawerOpen
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title={isDrawerOpen ? '收起右侧词条详情面板 (Esc)' : `展开词条详情 (${selectedWord.word})`}
            >
              <span>详情</span>
              <span
                translate="no"
                className="hidden sm:inline font-serif-lexicon font-bold max-w-[84px] truncate"
              >
                · {selectedWord.word}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            className="p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0 cursor-pointer focus-ring"
            title={darkMode ? '切换至浅色模式' : '切换至深色模式'}
            aria-label={darkMode ? '切换至浅色模式' : '切换至深色模式'}
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {/* Main Split Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden pb-12 md:pb-0 relative">
        <main id="main-workspace" className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {activeTab === 'explore' && (
            <ExploreView
              filteredWords={filteredWords}
              totalLexiconCount={lexicon.words.length}
              allWords={lexicon.words}
              wordsMap={wordsMap}
              cocaLexemes={lexicon.cocaLexemes || []}
              families={lexicon.families}
              cetEntries={lexicon.cetEntries}
              criteria={criteria}
              onChangeCriteria={setCriteria}
              sortBy={sortBy}
              onChangeSortBy={setSortBy}
              userRecordsMap={userRecordsMap}
              allAvailableTags={allAvailableTags}
              staticCollections={staticCollections}
              selectedStaticCollectionId={selectedStaticCollectionId}
              onSelectStaticCollectionId={setSelectedStaticCollectionId}
              selectedWordId={selectedWordId}
              onSelectWord={handleSelectWord}
              onInspectFamily={handleInspectFamily}
              onQuickStatusChange={handleStatusChange}
              onPosStatusChange={handlePosStatusChange}
              onBatchSetStatus={handleBatchSetStatus}
              onBatchAddTag={handleBatchAddTag}
              onAddWordsToStaticCollection={handleAddWordsToStaticCollection}
              onCreateStaticCollectionFromSelection={handleCreateStaticCollectionFromSelection}
              onSaveDynamicCollection={handleSaveDynamicCollection}
              onExportCurrentFiltered={(format, customList) =>
                handleExportWordList(
                  customList || filteredWords,
                  customList ? 'lexical-selected-export' : 'lexical-filtered-export',
                  format
                )
              }
              compactDensity={compactDensity}
              initialScrollOffset={exploreScrollOffsetRef.current}
              onScrollOffsetChange={(offset) => {
                exploreScrollOffsetRef.current = offset;
              }}
            />
          )}

          {activeTab === 'corpus_lab' && (
            <CorpusLabView
              words={lexicon.words}
              wordsMap={wordsMap}
              cocaLexemes={lexicon.cocaLexemes || []}
              diagnostics={lexicon.diagnostics}
              vennSummary={
                lexicon.diagnostics.venn || {
                  totalDistinctForms: lexicon.words.length,
                  cetDistinctForms: 8014,
                  bncDistinctForms: 76125,
                  cocaDistinctHeadwords: 53951,
                  cocaTotalLexemes: 60000,
                  allThreeCount: 7716,
                  cetAndBncOnlyCount: 92,
                  cetAndCocaOnlyCount: 184,
                  bncAndCocaOnlyCount: 27428,
                  cetOnlyExactCount: 22,
                  bncOnlyExactCount: 40889,
                  cocaOnlyExactCount: 18623,
                  bncAndCocaIntersection: 35144,
                  cetAndCocaIntersection: 7900,
                  cetAndBncIntersection: 7808,
                  bncHeadwordsInCocaCount: 18774,
                  cetVariantLinkedToCocaCount: 73,
                  cetTrulyMissingFromCocaCount: 41,
                }
              }
              families={lexicon.families}
              userRecordsMap={userRecordsMap}
              collections={collections}
              onSelectWord={(w) => handleSelectWord(w, true)}
              onJumpToExploreWithFilter={(nextCriteria) => {
                setSelectedStaticCollectionId(null);
                setCriteria(nextCriteria);
                setActiveTab('explore');
              }}
              onCreateCollection={async (col) => {
                await createOrUpdateCollection(col);
                await refreshUserStoreData();
              }}
              onExportWordList={handleExportWordList}
            />
          )}

          {activeTab === 'families' && (
            <WordFamilyView
              families={lexicon.families}
              wordsMap={wordsMap}
              userRecordsMap={userRecordsMap}
              dictionaries={dictionaries}
              selectedFamilyId={selectedFamilyId}
              highlightedWordId={familyHighlightWordId}
              onSelectFamily={(id) => {
                setSelectedFamilyId(id);
                setFamilyHighlightWordId(null);
              }}
              onSelectWord={(w) => handleSelectWord(w, true)}
              onStatusChange={handleStatusChange}
              onBatchSetStatus={handleBatchSetStatus}
            />
          )}

          {(activeTab === 'study' || activeTab === 'collections' || activeTab === 'activity') && (
            <CollectionsAndPlannerView
              collections={collections}
              words={lexicon.words}
              wordsMap={wordsMap}
              familiesMap={familiesMap}
              userRecordsMap={userRecordsMap}
              activityLogs={activityLogs}
              onSelectWord={(w) => handleSelectWord(w, true)}
              onStatusChange={handleStatusChange}
              onCreateCollection={async (col) => {
                await createOrUpdateCollection(col);
                await refreshUserStoreData();
              }}
              onDeleteCollection={async (id) => {
                await deleteCollection(id);
                await refreshUserStoreData();
              }}
              onApplyDynamicCollectionToExplore={(filterCriteria) => {
                setSelectedStaticCollectionId(null);
                setCriteria(filterCriteria);
                setActiveTab('explore');
              }}
              onBatchSetStatus={handleBatchSetStatus}
              onExportWordList={handleExportWordList}
              onExecuteBatchImport={async (items, options) => {
                const res = await batchUpdateWords(items, options);
                await refreshUserStoreData();
                return res;
              }}
              onRollbackBatch={async (batchId) => {
                const count = await rollbackBatchLogs(batchId);
                await refreshUserStoreData();
                return count;
              }}
              onUndoSingleLog={async (logId) => {
                await undoSingleActivityLog(logId);
                await refreshUserStoreData();
              }}
              onExportLogsCsv={handleExportLogsCsv}
            />
          )}

          {(activeTab === 'insights' || activeTab === 'analytics') && (
            <AnalyticsView
              words={lexicon.words}
              cocaLexemes={lexicon.cocaLexemes || []}
              families={lexicon.families}
              cetEntries={lexicon.cetEntries}
              diagnostics={lexicon.diagnostics}
              userRecordsMap={userRecordsMap}
              activityLogs={activityLogs}
              onJumpToExploreWithFilter={(nextCriteria) => {
                setSelectedStaticCollectionId(null);
                setCriteria(nextCriteria);
                setActiveTab('explore');
              }}
              onInspectFamily={(famId) => handleInspectFamily(famId)}
            />
          )}

          {(activeTab === 'data_studio' || activeTab === 'settings') && (
            <SettingsAndDiagnosticsView
              diagnostics={lexicon.diagnostics}
              dictionaries={dictionaries}
              onChangeDictionaries={handleSaveDictionaries}
              onResetDictionaries={() => handleSaveDictionaries(DEFAULT_DICTIONARIES)}
              onExportBackupJson={handleExportBackupJson}
              onImportBackupJson={async (jsonText, mode) => {
                const result = await importFullBackupPayload(jsonText, mode);
                if (result.importedCustomDatasets && result.importedCustomDatasets > 0) {
                  await loadLexiconData();
                } else {
                  await refreshUserStoreData();
                }
                return result;
              }}
              onUploadCustomDataset={async (type, fileName, content) => {
                validateCustomDatasetContent(type, content);
                const customSets = await getAllCustomDatasets();
                const currentCet = customSets.find((d) => d.id === 'cet2016')?.content;
                const currentBnc = customSets.find((d) => d.id === 'bnc_coca')?.content;
                const currentCoca = customSets.find((d) => d.id === 'coca2020')?.content;

                const baseUrl = import.meta.env.BASE_URL || '/';
                const nextCet =
                  type === 'cet2016'
                    ? content
                    : currentCet ||
                      (await fetchTextWithFallback(
                        `${baseUrl}data/CET2016.txt`,
                        `${baseUrl}assets/aistudio/CET2016_c8581113.txt`
                      ));
                const nextBnc =
                  type === 'bnc_coca'
                    ? content
                    : currentBnc ||
                      (await fetchTextWithFallback(
                        `${baseUrl}data/BNC_COCA_lists.txt`,
                        `${baseUrl}assets/aistudio/BNC_COCA_lists_9ec2b6a0.txt`
                      ));
                const nextCoca =
                  type === 'coca2020'
                    ? content
                    : currentCoca ||
                      (await fetchTextWithFallback(
                        `${baseUrl}data/coca_freq.json`,
                        `${baseUrl}assets/aistudio/coca_freq_5e7c1609.json`
                      ));

                const nextLexicon = buildLexiconDatabase(nextCet, nextBnc, nextCoca);
                await saveCustomDataset(type, fileName, content);
                setHasCustomDataset(true);
                setLexicon(nextLexicon);
                await refreshUserStoreData();

                return {
                  wordsCount: nextLexicon.words.length,
                  familiesCount: nextLexicon.families.length,
                  cetLinesCount: nextLexicon.cetEntries.length,
                  cocaRecordsCount: (nextLexicon.cocaLexemes || []).length,
                };
              }}
              onResetCustomDatasets={async () => {
                await resetCustomDatasets();
                await loadLexiconData();
              }}
              hasCustomDataset={hasCustomDataset}
              onSelectWordByString={handleSelectWordByString}
              wordsMap={wordsMap}
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode((d) => !d)}
              compactDensity={compactDensity}
              onToggleCompactDensity={() => setCompactDensity((c) => !c)}
            />
          )}
        </main>

        {/* Right Persistent Research Inspector Sheet:
            - At >=1280px (xl): docks side-by-side without blocking main view
            - At 640px–1279px (sm..lg): non-modal floating right sheet (neither reflows/shrinks the main table NOR dims/blocks the left workspace!)
            - At <640px (mobile): full-width sheet */}
        {isDrawerOpen && selectedWord && activeTab !== 'insights' && (
          <>
            <div
              onClick={() => {
                setIsDrawerOpen(false);
                if (typeof window !== 'undefined' && window.innerWidth >= 1280) {
                  userManuallyClosedDrawerOnWideRef.current = true;
                }
              }}
              className="sm:hidden fixed inset-0 top-12 bottom-12 bg-slate-950/30 z-30"
              aria-hidden="true"
            />
            <WordDetailDrawer
              word={selectedWord}
              onClose={() => {
                setIsDrawerOpen(false);
                if (typeof window !== 'undefined' && window.innerWidth >= 1280) {
                  userManuallyClosedDrawerOnWideRef.current = true;
                }
              }}
              wordsMap={wordsMap}
              familiesMap={familiesMap}
              userRecord={userRecordsMap.get(selectedWord.id)}
              allUserRecordsMap={userRecordsMap}
              collections={collections}
              dictionaries={dictionaries}
              wordLogs={selectedWordLogs}
              onStatusChange={handleStatusChange}
              onPosStatusChange={handlePosStatusChange}
              onTagsChange={handleTagsChange}
              onNoteChange={handleNoteChange}
              onTouchStudyRecord={handleTouchStudyRecord}
              onToggleWordInCollection={handleToggleWordInCollection}
              onSelectWord={(w) => handleSelectWord(w, true)}
              onInspectFamily={handleInspectFamily}
            />
          </>
        )}
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="移动端底部导航"
        className="md:hidden fixed bottom-0 inset-x-0 h-12 bg-[var(--border-subtle)] border-t border-[var(--border-subtle)] grid grid-cols-6 gap-px z-30 pb-[env(safe-area-inset-bottom)]"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => handleWorkspaceChange(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] font-semibold'
                  : 'bg-[var(--bg-canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span className="truncate max-w-full px-0.5">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Global Command Search Modal */}
      <GlobalSearchModal
        isOpen={isCommandModalOpen}
        onClose={() => setIsCommandModalOpen(false)}
        words={lexicon.words}
        familiesCount={lexicon.families.length}
        cocaLexemesCount={(lexicon.cocaLexemes || []).length}
        userRecordsMap={userRecordsMap}
        onSelectWord={(w) => handleSelectWord(w, true)}
        onInspectFamily={handleInspectFamily}
      />
    </div>
  );
}

export default App;
