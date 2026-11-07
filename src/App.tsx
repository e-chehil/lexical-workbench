/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Layers,
  Bookmark,
  FileSpreadsheet,
  BarChart3,
  Settings,
  Search,
  Sun,
  Moon,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import {
  ActivityLogEntry,
  BncCocaFamily,
  DictionaryTemplate,
  FilterCriteria,
  LearningStatus,
  LexiconDatabaseBundle,
  LexiconWordItem,
  SortField,
  UserWordRecord,
  WordCollection,
} from './data/types.ts';
import { buildLexiconDatabase } from './data/parser.ts';
import {
  DEFAULT_DICTIONARIES,
  DEFAULT_FILTER_CRITERIA,
  filterAndSortWords,
} from './data/searchAndFilter.ts';
import {
  batchApplyWordUpdates,
  db,
  ensureDefaultCollections,
  exportFullBackupJson,
  importBackupJson,
  rollbackBatchById,
  undoSingleActivityLog,
  updateWordStatus,
  updateWordTagsAndNotes,
} from './db/database.ts';
import { GlobalSearchModal } from './components/GlobalSearchModal.tsx';
import { WordDetailDrawer } from './components/WordDetailDrawer.tsx';
import { ExploreView } from './components/ExploreView.tsx';
import { WordFamilyView } from './components/WordFamilyView.tsx';
import { CollectionsAndPlannerView } from './components/CollectionsAndPlannerView.tsx';
import { BatchAndActivityView } from './components/BatchAndActivityView.tsx';
import { AnalyticsView } from './components/AnalyticsView.tsx';
import { SettingsAndDiagnosticsView } from './components/SettingsAndDiagnosticsView.tsx';

type NavViewId =
  | 'explore'
  | 'families'
  | 'collections'
  | 'activity'
  | 'analytics'
  | 'settings';

const NAV_ITEMS: {
  id: NavViewId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  mobileBottomNav?: boolean;
}[] = [
  { id: 'explore', label: '词条索引', shortLabel: '词库', icon: BookOpen, mobileBottomNav: true },
  { id: 'families', label: '词族矩阵', shortLabel: '词族', icon: Layers, mobileBottomNav: true },
  { id: 'collections', label: '词集规划', shortLabel: '词集', icon: Bookmark, mobileBottomNav: true },
  { id: 'activity', label: '批量同步', shortLabel: '同步', icon: FileSpreadsheet, mobileBottomNav: true },
  { id: 'analytics', label: '统计分析', shortLabel: '统计', icon: BarChart3, mobileBottomNav: true },
  { id: 'settings', label: '数据设置', shortLabel: '设置', icon: Settings, mobileBottomNav: false },
];

const VALID_VIEWS = new Set<NavViewId>([
  'explore',
  'families',
  'collections',
  'activity',
  'analytics',
  'settings',
]);

function safeGetStorage(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore SecurityError when storage is blocked in third-party iframe
  }
}

function safeGetSearchParam(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
}

function triggerTextFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [activeView, setActiveView] = useState<NavViewId>(() => {
    const v = safeGetSearchParam('view') as NavViewId | null;
    return v && VALID_VIEWS.has(v) ? v : 'explore';
  });

  const [bundle, setBundle] = useState<LexiconDatabaseBundle | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [hasCustomDataset, setHasCustomDataset] = useState(false);

  // User data from IndexedDB
  const [userWords, setUserWords] = useState<UserWordRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [collections, setCollections] = useState<WordCollection[]>([]);

  // UI preferences (stored in localStorage with safe fallback)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return safeGetStorage('lexical_wb_dark') === 'true';
  });
  const [compactDensity, setCompactDensity] = useState<boolean>(() => {
    const saved = safeGetStorage('lexical_wb_compact');
    return saved ? saved === 'true' : true;
  });
  const [dictionaries, setDictionaries] = useState<DictionaryTemplate[]>(() => {
    try {
      const saved = safeGetStorage('lexical_wb_dicts');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_DICTIONARIES;
  });

  // Workspace state
  const [criteria, setCriteria] = useState<FilterCriteria>(() => {
    const q = safeGetSearchParam('q') || '';
    return { ...DEFAULT_FILTER_CRITERIA, searchQuery: q };
  });
  const [activeStaticCollectionId, setActiveStaticCollectionId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('form_freq_desc');
  const [selectedWordId, setSelectedWordId] = useState<string | null>(() => {
    return safeGetSearchParam('word') || 'able';
  });
  const [showDetailDrawer, setShowDetailDrawer] = useState<boolean>(() => {
    const initialView = safeGetSearchParam('view') as NavViewId | null;
    if (initialView && initialView !== 'explore') return false;
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
  });
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [highlightedFamilyWordId, setHighlightedFamilyWordId] = useState<string | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);

  const handleSwitchView = useCallback((nextView: NavViewId) => {
    setActiveView(nextView);
    if (nextView === 'explore') {
      if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
        setShowDetailDrawer(true);
      }
    } else {
      setShowDetailDrawer(false);
    }
  }, []);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    safeSetStorage('lexical_wb_dark', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    safeSetStorage('lexical_wb_compact', String(compactDensity));
  }, [compactDensity]);

  // Sync URL query parameters without polluting history stack
  useEffect(() => {
    try {
      if (
        typeof window === 'undefined' ||
        !window.location.protocol.startsWith('http') ||
        window.location.origin === 'null'
      ) {
        return;
      }
      const params = new URLSearchParams(window.location.search);
      if (activeView !== 'explore') params.set('view', activeView);
      else params.delete('view');

      if (criteria.searchQuery.trim()) params.set('q', criteria.searchQuery.trim());
      else params.delete('q');

      if (selectedWordId && selectedWordId !== 'able') params.set('word', selectedWordId);
      else params.delete('word');

      const qs = params.toString();
      const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (nextUrl !== currentUrl) {
        window.history.replaceState(null, '', nextUrl);
      }
    } catch {
      // Ignore SecurityError in restricted iframes
    }
  }, [activeView, criteria.searchQuery, selectedWordId]);

  useEffect(() => {
    let wasDesktop = window.innerWidth >= 1024;
    const handleResize = () => {
      const isDesktop = window.innerWidth >= 1024;
      if (wasDesktop && !isDesktop) {
        setShowDetailDrawer(false);
      } else if (!wasDesktop && isDesktop && activeView === 'explore') {
        setShowDetailDrawer(true);
      }
      wasDesktop = isDesktop;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeView]);

  const handleSaveDictionaries = (next: DictionaryTemplate[]) => {
    setDictionaries(next);
    safeSetStorage('lexical_wb_dicts', JSON.stringify(next));
  };

  // Load IndexedDB state
  const refreshUserDbState = useCallback(async () => {
    try {
      await ensureDefaultCollections();
      const [uWords, logs, cols] = await Promise.all([
        db.userWords.toArray(),
        db.activityLogs.orderBy('id').reverse().toArray(),
        db.collections.toArray(),
      ]);
      setUserWords(uWords);
      setActivityLogs(logs);
      setCollections(cols);
    } catch {
      // Ignore storage security errors in restricted private/iframe contexts
    }
  }, []);

  // Load Lexicon Data (supports both root '/' in AI Studio and '/lexical-workbench/' on GitHub Pages)
  const loadLexiconData = useCallback(async () => {
    try {
      setLoadingError(null);
      let customCet: { content: string } | undefined;
      let customBnc: { content: string } | undefined;
      try {
        customCet = await db.customDatasets.get('cet2016');
        customBnc = await db.customDatasets.get('bnc_coca');
      } catch {
        // Ignore IndexedDB error if blocked in private iframe
      }
      setHasCustomDataset(Boolean(customCet || customBnc));

      let cetText = customCet?.content || '';
      let bncText = customBnc?.content || '';

      const base = import.meta.env.BASE_URL || '/';
      const normalizedBase = base.endsWith('/') ? base : `${base}/`;
      const resolvePublicUrl = (relPath: string) =>
        `${normalizedBase}${relPath.replace(/^\/+/, '')}`;

      if (!cetText) {
        let res = await fetch(resolvePublicUrl('data/CET2016.txt')).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch(resolvePublicUrl('assets/aistudio/CET2016_c8581113.txt')).catch(
            () => null
          );
        }
        if (!res || !res.ok) throw new Error('无法读取 CET2016.txt 词表文件');
        cetText = await res.text();
      }

      if (!bncText) {
        let res = await fetch(resolvePublicUrl('data/BNC_COCA_lists.txt')).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch(resolvePublicUrl('assets/aistudio/BNC_COCA_lists_9ec2b6a0.txt')).catch(
            () => null
          );
        }
        if (!res || !res.ok) throw new Error('无法读取 BNC_COCA_lists.txt 词表文件');
        bncText = await res.text();
      }

      const built = buildLexiconDatabase(cetText, bncText);
      setBundle(built);
      if (built.families.length > 0 && !selectedFamilyId) {
        const ableFam =
          built.families.find((f) => f.normalizedHeadword === 'able') || built.families[0];
        setSelectedFamilyId(ableFam.id);
      }
    } catch (err) {
      setLoadingError(err instanceof Error ? err.message : '加载词库数据失败');
    }
  }, [selectedFamilyId]);

  useEffect(() => {
    loadLexiconData();
    refreshUserDbState();
  }, [loadLexiconData, refreshUserDbState]);

  // Fast Lookup Maps
  const wordsMap = useMemo(() => {
    if (!bundle) return new Map<string, LexiconWordItem>();
    return new Map(bundle.words.map((w) => [w.id, w]));
  }, [bundle]);

  const familiesMap = useMemo(() => {
    if (!bundle) return new Map<string, BncCocaFamily>();
    return new Map(bundle.families.map((f) => [f.id, f]));
  }, [bundle]);

  const userRecordsMap = useMemo(() => {
    return new Map(userWords.map((u) => [u.wordId, u]));
  }, [userWords]);

  const allKnownTags = useMemo(() => {
    const set = new Set<string>();
    for (const u of userWords) {
      for (const t of u.tags || []) set.add(t);
    }
    return Array.from(set).sort();
  }, [userWords]);

  const filteredWords = useMemo(() => {
    if (!bundle) return [];
    let baseWords = bundle.words;
    if (activeStaticCollectionId) {
      const col = collections.find((c) => c.id === activeStaticCollectionId);
      if (col && col.type !== 'dynamic') {
        const idSet = new Set(col.wordIds);
        baseWords = baseWords.filter((w) => idSet.has(w.id));
      }
    }
    return filterAndSortWords(
      baseWords,
      userRecordsMap,
      criteria,
      sortField,
      familiesMap
    );
  }, [bundle, activeStaticCollectionId, collections, userRecordsMap, criteria, sortField, familiesMap]);

  const selectedWord = useMemo(() => {
    if (!selectedWordId) return null;
    return wordsMap.get(selectedWordId) || null;
  }, [wordsMap, selectedWordId]);

  const selectedWordFamily = useMemo(() => {
    if (!selectedWord?.familyId) return null;
    return familiesMap.get(selectedWord.familyId) || null;
  }, [selectedWord, familiesMap]);

  const selectedWordLogs = useMemo(() => {
    if (!selectedWordId) return [];
    return activityLogs.filter((l) => l.wordId === selectedWordId);
  }, [activityLogs, selectedWordId]);

  const handleStatusChange = useCallback(
    async (wordId: string, wordDisplay: string, status: LearningStatus) => {
      await updateWordStatus(wordId, wordDisplay, status);
      await refreshUserDbState();
    },
    [refreshUserDbState]
  );

  // Global keyboard shortcuts: Ctrl+K / '/', and 1-5 status shortcuts for non-explore views
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchModalOpen(true);
        return;
      }

      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        (e.target as HTMLElement | null)?.isContentEditable;

      if (isEditable || isSearchModalOpen) return;

      if (e.key === '/') {
        e.preventDefault();
        setIsSearchModalOpen(true);
        return;
      }

      if (activeView !== 'explore' && selectedWord && ['1', '2', '3', '4', '5'].includes(e.key)) {
        const statusByNum: Record<string, LearningStatus> = {
          '1': 'unrated',
          '2': 'queued',
          '3': 'learning',
          '4': 'mastered',
          '5': 'deferred',
        };
        const nextSt = statusByNum[e.key];
        if (nextSt) {
          e.preventDefault();
          handleStatusChange(selectedWord.id, selectedWord.word, nextSt);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isSearchModalOpen, selectedWord, activeView, handleStatusChange]);

  const handleSelectWord = (word: LexiconWordItem, openDrawer = true) => {
    setSelectedWordId(word.id);
    if (openDrawer) {
      setShowDetailDrawer(true);
    }
  };

  const handleSelectWordById = (wordId: string) => {
    const w = wordsMap.get(wordId.toLowerCase());
    if (w) {
      setSelectedWordId(w.id);
      setShowDetailDrawer(true);
    }
  };

  const handleInspectFamily = (familyId: string, highlightWordId?: string) => {
    setSelectedFamilyId(familyId);
    setHighlightedFamilyWordId(highlightWordId || null);
    if (highlightWordId && wordsMap.has(highlightWordId)) {
      setSelectedWordId(highlightWordId);
    }
    setActiveView('families');
    setShowDetailDrawer(false);
  };

  const handleSaveTagsAndNotes = async (
    wordId: string,
    wordDisplay: string,
    tags: string[],
    notes: string
  ) => {
    await updateWordTagsAndNotes(wordId, wordDisplay, tags, notes);
    await refreshUserDbState();
  };

  const handleBatchSetStatus = async (wordIds: string[], status: LearningStatus) => {
    const items = wordIds
      .map((id) => wordsMap.get(id))
      .filter((w): w is LexiconWordItem => Boolean(w))
      .map((w) => ({ wordId: w.id, word: w.word, status }));
    if (items.length === 0) return;
    await batchApplyWordUpdates(items, {
      defaultStatus: status,
      sourceLabel: `批量设置状态 (${items.length}词)`,
    });
    await refreshUserDbState();
  };

  const handleBatchAddTag = async (wordIds: string[], tag: string) => {
    const items = wordIds
      .map((id) => wordsMap.get(id))
      .filter((w): w is LexiconWordItem => Boolean(w))
      .map((w) => ({ wordId: w.id, word: w.word, tagsToAdd: [tag] }));
    if (items.length === 0) return;
    await batchApplyWordUpdates(items, {
      sourceLabel: `批量添加标签 #${tag}`,
    });
    await refreshUserDbState();
  };

  const handleCreateCollection = async (
    col: Omit<WordCollection, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    const now = new Date().toISOString();
    const newCol: WordCollection = {
      ...col,
      id: `col_${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    };
    await db.collections.put(newCol);
    await refreshUserDbState();
  };

  const handleDeleteCollection = async (id: string) => {
    if (activeStaticCollectionId === id) {
      setActiveStaticCollectionId(null);
    }
    await db.collections.delete(id);
    await refreshUserDbState();
  };

  const handleAddWordToStaticCollection = async (collectionId: string, wordId: string) => {
    const col = await db.collections.get(collectionId);
    if (!col) return;
    const exists = col.wordIds.includes(wordId);
    const nextIds = exists
      ? col.wordIds.filter((id) => id !== wordId)
      : [...col.wordIds, wordId];
    await db.collections.put({
      ...col,
      wordIds: nextIds,
      updatedAt: new Date().toISOString(),
    });
    await refreshUserDbState();
  };

  const handleExportWordList = (
    list: LexiconWordItem[],
    filenamePrefix: string,
    format: 'txt' | 'csv'
  ) => {
    const dateStr = new Date().toISOString().slice(0, 10);
    if (format === 'txt') {
      const content = list.map((w) => w.word).join('\n');
      triggerTextFileDownload(
        `${filenamePrefix}_${dateStr}.txt`,
        content,
        'text/plain;charset=utf-8'
      );
    } else {
      const header =
        'Word,CET_Levels,BNC_Band,Headword,Form_Frequency,Family_Frequency,Learning_Status,Tags,Notes\n';
      const rows = list.map((w) => {
        const rec = userRecordsMap.get(w.id);
        const status = rec?.status || 'unrated';
        const tags = (rec?.tags || []).join(';');
        const notes = (rec?.notes || '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
        return `"${w.word}","${w.cetLevels.join('/')}","${w.band || ''}","${w.headword || ''}",${
          w.formFrequency !== null ? w.formFrequency : ''
        },${w.familyFrequency !== null ? w.familyFrequency : ''},"${status}","${tags}","${notes}"`;
      });
      triggerTextFileDownload(
        `${filenamePrefix}_${dateStr}.csv`,
        '\uFEFF' + header + rows.join('\n'),
        'text/csv;charset=utf-8'
      );
    }
  };

  const handleExportLogsCsv = () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const header = 'Timestamp,Word,ActionType,PreviousStatus,NewStatus,Tags,SourceLabel\n';
    const rows = activityLogs.map((l) => {
      return `"${l.timestamp}","${l.word}","${l.actionType}","${l.previousStatus || ''}","${
        l.newStatus || ''
      }","${(l.newTags || []).join(';')}","${l.sourceLabel || ''}"`;
    });
    triggerTextFileDownload(
      `LexicalWorkbench_ActivityLogs_${dateStr}.csv`,
      '\uFEFF' + header + rows.join('\n'),
      'text/csv;charset=utf-8'
    );
  };

  if (loadingError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg-canvas)]">
        <div className="max-w-md w-full bg-[var(--bg-surface)] border border-red-500/30 rounded-md p-6 text-center space-y-3">
          <h1 className="text-base font-semibold text-red-600 dark:text-red-400">
            词库初始化失败
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">{loadingError}</p>
          <button
            type="button"
            onClick={loadLexiconData}
            className="focus-ring px-4 py-2 rounded text-xs font-semibold bg-[var(--accent-primary)] text-white cursor-pointer"
          >
            重试加载
          </button>
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-canvas)]">
        <div
          translate="no"
          className="font-serif-lexicon font-bold text-xl tracking-tight text-[var(--text-primary)] mb-2"
        >
          Lexical Workbench
        </div>
        <div className="text-xs font-mono-tabular text-[var(--text-muted)]">
          正在载入 BNC/COCA 25k 与 CET2016 词库索引…
        </div>
      </div>
    );
  }

  const staticCollections = collections.filter((c) => c.type === 'static');
  const mobileNavItems = NAV_ITEMS.filter((item) => item.mobileBottomNav);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Skip to Main Content Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded focus:bg-[var(--accent-primary)] focus:text-white focus:text-xs focus:font-semibold"
      >
        跳转到主内容
      </a>

      {/* 3-Zone Top Bar Contract (Brand | Underlined Nav | Quick Search & Theme) */}
      <header className="h-12 px-3 sm:px-4 lg:px-5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 lg:gap-6 shrink-0 z-20">
        {/* Zone 1: Editorial Wordmark */}
        <button
          type="button"
          onClick={() => handleSwitchView('explore')}
          className="flex items-baseline gap-2.5 shrink-0 cursor-pointer focus-ring rounded"
        >
          <span
            translate="no"
            className="font-serif-lexicon font-bold text-[16px] sm:text-[17px] tracking-tight text-[var(--text-primary)] whitespace-nowrap"
          >
            Lexical Workbench
          </span>
          <span className="hidden 2xl:inline text-[11px] font-mono-tabular text-[var(--text-muted)] whitespace-nowrap">
            BNC 25k · CET 2016
          </span>
        </button>

        {/* Zone 2: Clean Underlined Navigation Links (Zero Pill Clutter, Single-Line) */}
        <nav
          aria-label="主导航"
          className="hidden md:flex items-center gap-3 lg:gap-5 h-full select-none overflow-x-auto no-scrollbar"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSwitchView(item.id)}
                className={`h-full px-1 border-b-2 text-xs transition-colors cursor-pointer inline-flex items-center whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] font-semibold'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
                }`}
              >
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Global Command Search (⌘K) + Theme + Inspector Sheet Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsSearchModalOpen(true)}
            className="focus-ring h-8 px-2.5 lg:px-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--accent-primary)] transition-colors flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer whitespace-nowrap shrink-0"
            title="全局词库检索 (⌘K)"
          >
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">检索词库…</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono-tabular rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchView('settings')}
            className={`focus-ring md:hidden p-1.5 rounded border transition-colors cursor-pointer ${
              activeView === 'settings'
                ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
            }`}
            title="数据设置"
            aria-label="数据设置"
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            className="focus-ring p-1.5 rounded border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            title={darkMode ? '切换浅色模式' : '切换深色模式'}
            aria-label="切换色彩主题"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowDetailDrawer((v) => !v)}
            className={`focus-ring p-1.5 rounded border transition-colors cursor-pointer ${
              showDetailDrawer
                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title={showDetailDrawer ? '收起词典面板' : '展开词典面板'}
            aria-label="切换词条详情面板"
          >
            {showDetailDrawer ? (
              <PanelRightClose className="w-4 h-4" aria-hidden="true" />
            ) : (
              <PanelRightOpen className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {/* Main Full-Height Architectural Grid Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <main
          id="main-content"
          className="flex-1 min-w-0 h-full overflow-hidden flex flex-col"
        >
          {activeView === 'explore' && (
            <ExploreView
              filteredWords={filteredWords}
              totalWordsCount={bundle.words.length}
              criteria={criteria}
              onChangeCriteria={setCriteria}
              sortField={sortField}
              onChangeSortField={setSortField}
              userRecordsMap={userRecordsMap}
              allKnownTags={allKnownTags}
              collections={collections}
              activeStaticCollectionId={activeStaticCollectionId}
              onSelectStaticCollectionId={setActiveStaticCollectionId}
              selectedWordId={selectedWordId}
              onSelectWord={handleSelectWord}
              onInspectFamily={handleInspectFamily}
              onQuickStatusChange={handleStatusChange}
              onBatchSetStatus={handleBatchSetStatus}
              onBatchAddTag={handleBatchAddTag}
              onSaveDynamicCollection={(name, description) =>
                handleCreateCollection({
                  name,
                  description,
                  type: 'dynamic',
                  wordIds: [],
                  filterCriteria: criteria,
                  sortField,
                })
              }
              onExportCurrentWords={(format) =>
                handleExportWordList(filteredWords, 'LexicalWorkbench_Filtered', format)
              }
              compactDensity={compactDensity}
            />
          )}

          {activeView === 'families' && (
            <WordFamilyView
              families={bundle.families}
              wordsMap={wordsMap}
              userRecordsMap={userRecordsMap}
              dictionaries={dictionaries}
              selectedFamilyId={selectedFamilyId}
              highlightedWordId={highlightedFamilyWordId}
              onSelectFamily={(famId) => {
                setSelectedFamilyId(famId);
                setHighlightedFamilyWordId(null);
              }}
              onSelectWord={handleSelectWord}
              onStatusChange={handleStatusChange}
              onBatchSetStatus={handleBatchSetStatus}
            />
          )}

          {activeView === 'collections' && (
            <CollectionsAndPlannerView
              collections={collections}
              words={bundle.words}
              wordsMap={wordsMap}
              familiesMap={familiesMap}
              userRecordsMap={userRecordsMap}
              onSelectWord={handleSelectWord}
              onStatusChange={handleStatusChange}
              onCreateCollection={handleCreateCollection}
              onDeleteCollection={handleDeleteCollection}
              onApplyDynamicCollectionToExplore={(crit) => {
                setActiveStaticCollectionId(null);
                setCriteria(crit);
                handleSwitchView('explore');
              }}
              onBatchSetStatus={handleBatchSetStatus}
              onExportWordList={handleExportWordList}
            />
          )}

          {activeView === 'activity' && (
            <BatchAndActivityView
              words={bundle.words}
              wordsMap={wordsMap}
              userRecordsMap={userRecordsMap}
              activityLogs={activityLogs}
              onExecuteBatchImport={async (items, options) => {
                const res = await batchApplyWordUpdates(items, options);
                await refreshUserDbState();
                return res;
              }}
              onRollbackBatch={async (batchId) => {
                const count = await rollbackBatchById(batchId);
                await refreshUserDbState();
                return count;
              }}
              onUndoSingleLog={async (logId) => {
                await undoSingleActivityLog(logId);
                await refreshUserDbState();
              }}
              onSelectWord={handleSelectWord}
              onExportLogsCsv={handleExportLogsCsv}
            />
          )}

          {activeView === 'analytics' && (
            <AnalyticsView
              words={bundle.words}
              families={bundle.families}
              cetEntries={bundle.cetEntries}
              diagnostics={bundle.diagnostics}
              userRecordsMap={userRecordsMap}
              activityLogs={activityLogs}
              onJumpToExploreWithFilter={(crit) => {
                setActiveStaticCollectionId(null);
                setCriteria(crit);
                handleSwitchView('explore');
              }}
              onInspectFamily={(famId) => handleInspectFamily(famId)}
            />
          )}

          {activeView === 'settings' && (
            <SettingsAndDiagnosticsView
              diagnostics={bundle.diagnostics}
              dictionaries={dictionaries}
              onChangeDictionaries={handleSaveDictionaries}
              onResetDictionaries={() => handleSaveDictionaries(DEFAULT_DICTIONARIES)}
              onExportBackupJson={async () => {
                const json = await exportFullBackupJson(dictionaries);
                const dateStr = new Date().toISOString().slice(0, 10);
                triggerTextFileDownload(
                  `LexicalWorkbench_Backup_${dateStr}.json`,
                  json,
                  'application/json;charset=utf-8'
                );
              }}
              onImportBackupJson={async (jsonText, mode) => {
                const res = await importBackupJson(jsonText, mode);
                if (res.dictionaries) handleSaveDictionaries(res.dictionaries);
                await refreshUserDbState();
                return res;
              }}
              onUploadCustomDataset={async (type, fileName, content) => {
                await db.customDatasets.put({
                  id: type,
                  fileName,
                  content,
                  updatedAt: new Date().toISOString(),
                });
                await loadLexiconData();
              }}
              onResetCustomDatasets={async () => {
                await db.customDatasets.clear();
                await loadLexiconData();
              }}
              hasCustomDataset={hasCustomDataset}
              onSelectWordByString={handleSelectWordById}
              wordsMap={wordsMap}
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode((d) => !d)}
              compactDensity={compactDensity}
              onToggleCompactDensity={() => setCompactDensity((c) => !c)}
            />
          )}
        </main>

        {/* Right Word Detail Sheet (Docked in Explore, Slide-Over Overlay in other views) */}
        {showDetailDrawer && (
          <WordDetailDrawer
            word={selectedWord}
            family={selectedWordFamily}
            userRecord={selectedWord ? userRecordsMap.get(selectedWord.id) : undefined}
            allUserRecordsMap={userRecordsMap}
            allKnownTags={allKnownTags}
            wordLogs={selectedWordLogs}
            dictionaries={dictionaries}
            staticCollections={staticCollections}
            onClose={() => setShowDetailDrawer(false)}
            onStatusChange={handleStatusChange}
            onSaveTagsAndNotes={handleSaveTagsAndNotes}
            onSelectWordById={handleSelectWordById}
            onInspectFamily={handleInspectFamily}
            onAddWordToCollection={handleAddWordToStaticCollection}
            overlayOnDesktop={activeView !== 'explore'}
          />
        )}
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="移动端底部导航"
        className="md:hidden h-14 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] grid grid-cols-5 shrink-0 z-30"
      >
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSwitchView(item.id)}
              className={`focus-ring flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
                active
                  ? 'text-[var(--accent-primary)] font-semibold'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Global Search Modal (Ctrl+K / /) */}
      <GlobalSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        words={bundle.words}
        userRecordsMap={userRecordsMap}
        onSelectWord={handleSelectWord}
        onInspectFamily={handleInspectFamily}
      />
    </div>
  );
}
