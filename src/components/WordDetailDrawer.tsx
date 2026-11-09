import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Volume2,
  ExternalLink,
  Tag,
  Plus,
  Layers,
  CheckCircle2,
  History,
  FolderPlus,
  BookMarked,
  BarChart3,
  GitBranch,
  GraduationCap,
  BookOpen,
  Maximize2,
  Minimize2,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  ActivityLogEntry,
  BncCocaFamily,
  COCA_POS_META,
  CocaRawPos,
  DictionaryTemplate,
  LEARNING_STATUS_META,
  LearningStatus,
  LexiconWordItem,
  UserWordRecord,
  WordCollection,
} from '../data/types.ts';
import { buildDictionaryUrl } from '../data/searchAndFilter.ts';
import { getIntraFamilyShareDetail } from '../utils/frequency.ts';
import {
  buildWordCorpusObservations,
  buildWordLexicalRelations,
} from '../data/cocaParser.ts';

interface WordDetailDrawerProps {
  word: LexiconWordItem | null;
  onClose: () => void;
  wordsMap: Map<string, LexiconWordItem>;
  familiesMap: Map<string, BncCocaFamily>;
  userRecord?: UserWordRecord;
  allUserRecordsMap: Map<string, UserWordRecord>;
  collections: WordCollection[];
  dictionaries: DictionaryTemplate[];
  wordLogs: ActivityLogEntry[];
  onStatusChange: (wordId: string, wordDisplay: string, status: LearningStatus) => void;
  onPosStatusChange?: (
    wordId: string,
    wordDisplay: string,
    pos: CocaRawPos,
    status: LearningStatus
  ) => void;
  onTagsChange: (wordId: string, wordDisplay: string, tags: string[]) => void;
  onNoteChange: (wordId: string, wordDisplay: string, note: string) => void;
  onTouchStudyRecord: (wordId: string, wordDisplay: string) => void;
  onToggleWordInCollection: (collectionId: string, wordId: string) => void;
  onSelectWord: (word: LexiconWordItem) => void;
  onInspectFamily: (familyId: string, highlightWord?: string) => void;
}

const ALL_STATUSES: LearningStatus[] = ['unrated', 'queued', 'learning', 'mastered', 'deferred'];

type InspectorTab = 'overview' | 'frequency' | 'relations' | 'learning' | 'dictionaries';

export const WordDetailDrawer: React.FC<WordDetailDrawerProps> = ({
  word,
  onClose,
  wordsMap,
  familiesMap,
  userRecord,
  allUserRecordsMap,
  collections,
  dictionaries,
  wordLogs,
  onStatusChange,
  onPosStatusChange,
  onTagsChange,
  onNoteChange,
  onTouchStudyRecord,
  onToggleWordInCollection,
  onSelectWord,
  onInspectFamily,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview');
  const [drawerWidth, setDrawerWidth] = useState<number>(430);
  const [isExpandedWidth, setIsExpandedWidth] = useState<boolean>(false);
  const isResizingRef = useRef<boolean>(false);

  const [newTagInput, setNewTagInput] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [isNoteDirty, setIsNoteDirty] = useState(false);
  const [touchSavedFlash, setTouchSavedFlash] = useState(false);

  useEffect(() => {
    setNoteDraft(userRecord?.notes || '');
    setIsNoteDirty(false);
    setNewTagInput('');
  }, [word?.id, userRecord?.notes]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const nextW = Math.min(680, Math.max(350, window.innerWidth - e.clientX));
      setDrawerWidth(nextW);
    };
    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const family = useMemo(() => {
    if (!word?.familyId) return null;
    return familiesMap.get(word.familyId) || null;
  }, [word, familiesMap]);

  const enabledDictionaries = useMemo(
    () => dictionaries.filter((d) => d.enabled),
    [dictionaries]
  );

  const staticCollections = useMemo(
    () => collections.filter((c) => c.type === 'static' || c.type === 'study_plan'),
    [collections]
  );

  const corpusObservations = useMemo(() => {
    if (!word) return [];
    return buildWordCorpusObservations(word);
  }, [word]);

  const lexicalRelations = useMemo(() => {
    if (!word) return [];
    return buildWordLexicalRelations(word, family, wordsMap);
  }, [word, family, wordsMap]);

  if (!word) return null;

  const currentStatus: LearningStatus = userRecord?.status || 'unrated';
  const currentTags = userRecord?.tags || [];
  const currentPosStatuses = userRecord?.posStatuses || {};

  const handleSpeak = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word.word);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTagInput.trim().replace(/^#/, '');
    if (!trimmed) return;
    if (!currentTags.includes(trimmed)) {
      onTagsChange(word.id, word.word, [...currentTags, trimmed]);
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onTagsChange(
      word.id,
      word.word,
      currentTags.filter((t) => t !== tagToRemove)
    );
  };

  const handleSaveNote = () => {
    if (isNoteDirty) {
      onNoteChange(word.id, word.word, noteDraft);
      setIsNoteDirty(false);
    }
  };

  const shareDetail = getIntraFamilyShareDetail(
    word.formFrequency,
    word.familyFrequency,
    word.inBnc,
    word.bncLinkedViaVariant
  );

  // Check if a BNC headword has COCA data when this word is an inflected/derived form not in COCA
  const headwordItem =
    !word.isHeadword && word.headword ? wordsMap.get(word.headword.toLowerCase()) || null : null;

  const variantCocaTargets = word.displayVariants
    .filter((v) => v.toLowerCase() !== word.normalized)
    .map((v) => wordsMap.get(v.toLowerCase()))
    .filter((w): w is LexiconWordItem => Boolean(w && w.inCoca));

  const effectiveWidth = isExpandedWidth ? 580 : drawerWidth;

  return (
    <aside
      style={{ '--inspector-width': `${effectiveWidth}px` } as React.CSSProperties}
      className="fixed right-0 bottom-12 md:bottom-0 top-12 xl:relative xl:inset-auto z-40 w-full sm:w-[396px] xl:w-[var(--inspector-width)] xl:max-w-[40vw] border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col xl:h-full shrink-0 shadow-2xl xl:shadow-none overflow-hidden select-text"
      aria-label={`词条研究详情: ${word.word}`}
    >
      {/* Desktop Left Drag-to-Resize Handle */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setIsExpandedWidth(false);
          isResizingRef.current = true;
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
        }}
        title="左右拖动调整研究检视面板宽度"
        className="hidden xl:block absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[var(--accent-primary)]/40 transition-colors z-20"
      />

      {/* Top Sticky Word Header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                translate="no"
                className="font-serif-lexicon text-2xl font-bold tracking-tight text-[var(--text-primary)] break-all"
              >
                {word.word}
              </h2>
              <button
                type="button"
                onClick={handleSpeak}
                className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors cursor-pointer focus-ring"
                title="朗读发音 (美音 TTS)"
                aria-label={`朗读 ${word.word}`}
              >
                <Volume2 className="w-4 h-4" aria-hidden="true" />
              </button>
              {word.hasCapitalVariant && (
                <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  大小写保留 ({word.word})
                </span>
              )}
              {word.isPhrase && (
                <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  多词表达
                </span>
              )}
            </div>

            {/* Source & Key Rank Sub-line */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-mono-tabular">
              {word.inCoca ? (
                <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold">
                  COCA #{word.cocaBestPosRank?.toLocaleString()} ({word.cocaPrimaryPos}) · 合计 #
                  {word.cocaHeadwordDerivedRank?.toLocaleString()}
                </span>
              ) : word.cocaLinkedViaVariant ? (
                <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300">
                  COCA 变体映射
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                  COCA 未直接单列
                </span>
              )}

              {word.band && (
                <span className="px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                  BNC {word.band}
                  {word.headword ? ` · ${word.headword}` : ''}
                </span>
              )}

              {word.isCet4 && (
                <span className="px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-300 font-semibold">
                  CET-4
                </span>
              )}
              {word.isCet6 && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold">
                  CET-6
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsExpandedWidth((v) => !v)}
              className="hidden xl:inline-flex p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              title={isExpandedWidth ? '恢复标准检视宽度' : '展开宽屏检视面板'}
              aria-label="切换面板宽度"
            >
              {isExpandedWidth ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer focus-ring"
              aria-label="关闭详情面板"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Quick Overall Status Bar */}
        <div className="mt-2.5 flex items-center justify-between gap-1.5">
          <div className="grid grid-cols-5 gap-1 flex-1">
            {ALL_STATUSES.map((st) => {
              const meta = LEARNING_STATUS_META[st];
              const isSelected = currentStatus === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => onStatusChange(word.id, word.word, st)}
                  aria-pressed={isSelected}
                  className={`py-1 px-1 rounded text-[11px] font-medium border transition-all cursor-pointer text-center focus-ring ${
                    isSelected
                      ? `${meta.badgeClass} font-semibold shadow-2xs`
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {meta.shortLabel}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              onTouchStudyRecord(word.id, word.word);
              setTouchSavedFlash(true);
              setTimeout(() => setTouchSavedFlash(false), 1600);
            }}
            className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0 ${
              touchSavedFlash
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold'
                : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'
            }`}
            title="记录一次今日复习打卡"
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>{touchSavedFlash ? '已记' : '打卡'}</span>
          </button>
        </div>

        {/* Always-Visible Authoritative Dictionary Quick-Jump Bar */}
        {enabledDictionaries.length > 0 && (
          <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]/70 flex items-center gap-1 flex-wrap">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] shrink-0 mr-0.5">
              权威词典:
            </span>
            {enabledDictionaries.map((dict) => (
              <a
                key={dict.id}
                href={buildDictionaryUrl(dict.urlTemplate, word.word)}
                target="_blank"
                rel="noopener noreferrer"
                title={`${dict.name} — ${dict.description}`}
                className="px-1.5 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--accent-soft)] hover:border-[var(--accent-primary)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary)] inline-flex items-center gap-0.5 whitespace-nowrap transition-colors"
              >
                <span>{dict.shortName || dict.name}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-75" />
              </a>
            ))}
          </div>
        )}

        {/* 5-Tab Research Navigation (Full-Width 5-Col Grid, Zero Clipping) */}
        <div className="mt-2.5 -mx-4 px-4 border-t border-[var(--border-subtle)] pt-2 grid grid-cols-5 gap-1">
          {[
            { id: 'overview', label: '概览', icon: BookOpen },
            {
              id: 'frequency',
              label: `语料(${(word.cocaLexemes || []).length || 'BNC'})`,
              icon: BarChart3,
            },
            {
              id: 'relations',
              label: `关系(${lexicalRelations.length})`,
              icon: GitBranch,
            },
            {
              id: 'learning',
              label: '学习笔记',
              icon: GraduationCap,
            },
            {
              id: 'dictionaries',
              label: `词典(${enabledDictionaries.length})`,
              icon: ExternalLink,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as InspectorTab)}
                className={`py-1 px-1 rounded text-[11px] font-medium inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]">
        {/* ================= TAB 1: OVERVIEW ================= */}
        {activeTab === 'overview' && (
          <>
            {/* 1. Core Multi-Source Identity Summary */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  多源语料核心证据卡
                </span>
                <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                  ID: {word.normalized}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {/* COCA 2020 Card */}
                <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between gap-1 text-[11px] text-[var(--text-muted)]">
                    <span className="truncate">COCA 2020 词元</span>
                    {word.inCoca && (
                      <span className="font-mono-tabular text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap shrink-0">
                        {word.cocaPosCount} 种词性
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono-tabular text-base font-bold text-[var(--text-primary)]">
                    {word.cocaHeadwordTotalFreq !== null && word.cocaHeadwordTotalFreq !== undefined ? (
                      <>
                        {word.cocaHeadwordTotalFreq.toLocaleString()}
                        <span className="ml-1.5 text-xs font-normal text-[var(--text-secondary)] whitespace-nowrap">
                          (合计 #{word.cocaHeadwordDerivedRank?.toLocaleString()})
                        </span>
                      </>
                    ) : word.cocaLinkedViaVariant ? (
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        见英美变体 ({variantCocaTargets.map((t) => t.word).join('/') || word.cocaCanonicalVariant})
                      </span>
                    ) : headwordItem?.inCoca ? (
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        屈折/派生自 {headwordItem.word} (#{headwordItem.cocaBestPosRank})
                      </span>
                    ) : (
                      <span className="text-xs font-normal text-[var(--text-muted)]">
                        未进 COCA 60k 词元表
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] font-mono-tabular text-[var(--text-secondary)] truncate">
                    {word.inCoca ? (
                      <>
                        最高 #{word.cocaBestPosRank?.toLocaleString()} ({word.cocaPrimaryPos} · 占{' '}
                        {Math.round(word.cocaDominantPosSharePct || 0)}%)
                      </>
                    ) : (
                      'COCA 仅统计词元+词性'
                    )}
                  </div>
                </div>

                {/* BNC/COCA 2.0 Family & Form Card */}
                <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between gap-1 text-[11px] text-[var(--text-muted)]">
                    <span className="truncate">BNC 词形与词族</span>
                    {word.band && (
                      <span className="font-mono-tabular font-semibold text-[var(--text-secondary)] whitespace-nowrap shrink-0">
                        {word.band} 频段
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono-tabular text-base font-bold text-[var(--text-primary)]">
                    {word.formFrequency !== null ? (
                      <>
                        {word.formFrequency.toLocaleString()}
                        <span className="ml-1.5 text-xs font-normal text-[var(--text-secondary)]">
                          ({shareDetail.label} 占族)
                        </span>
                      </>
                    ) : word.bncLinkedViaVariant ? (
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        变体关联 · 词形无独立频次
                      </span>
                    ) : (
                      <span className="text-xs font-normal text-[var(--text-muted)]">
                        BNC 25k 未收录
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] font-mono-tabular text-[var(--text-secondary)] truncate">
                    {word.familyFrequency !== null ? (
                      <>
                        族总频次 {word.familyFrequency.toLocaleString()} ({word.familyMemberCount}{' '}
                        词形)
                      </>
                    ) : (
                      '无 BNC 词族归属'
                    )}
                  </div>
                </div>
              </div>

              {/* Concise Per-PoS Preview Pills (if in COCA) */}
              {(word.cocaLexemes || []).length > 0 && (
                <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                      COCA 2020 分词性频次分布 (共 {(word.cocaLexemes || []).length} 条词元记录)
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('frequency')}
                      className="text-[11px] text-[var(--accent-primary)] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>完整证据</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {(word.cocaLexemes || []).map((lex) => {
                      const posMeta = COCA_POS_META[lex.pos];
                      const sharePct = Math.round(lex.sharePct);
                      const posSt = currentPosStatuses[lex.pos] || 'unrated';
                      return (
                        <div
                          key={lex.lexemeId}
                          className="flex items-center justify-between gap-2 text-xs font-mono-tabular"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${posMeta?.badgeClass || ''}`}
                            >
                              {posMeta?.shortLabel || lex.pos}
                            </span>
                            <span className="text-[var(--text-primary)] font-semibold">
                              #{lex.rank.toLocaleString()}
                            </span>
                            <span className="text-[var(--text-muted)]">
                              ({lex.frequency.toLocaleString()})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-16 h-1.5 bg-[var(--bg-subtle)] rounded-xs overflow-hidden">
                              <div
                                className="h-full bg-[var(--accent-primary)]"
                                style={{ width: `${Math.max(3, sharePct)}%` }}
                              />
                            </div>
                            <span className="w-8 text-right text-[11px] text-[var(--text-secondary)]">
                              {sharePct}%
                            </span>
                            {onPosStatusChange && (
                              <select
                                aria-label={`${word.word} (${lex.pos}) 掌握状态`}
                                value={posSt}
                                onChange={(e) =>
                                  onPosStatusChange(
                                    word.id,
                                    word.word,
                                    lex.pos,
                                    e.target.value as LearningStatus
                                  )
                                }
                                className={`appearance-none text-center px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer ${LEARNING_STATUS_META[posSt].badgeClass}`}
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
                    })}
                  </div>
                </div>
              )}

              {/* Variants & Orthography Box */}
              {word.displayVariants.length > 1 && (
                <div className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--text-secondary)]">英美拼写 / 词目并列变体:</span>
                  <div className="flex flex-wrap gap-1">
                    {word.displayVariants
                      .filter((v) => v.toLowerCase() !== word.normalized)
                      .map((v) => {
                        const target = wordsMap.get(v.toLowerCase());
                        return (
                          <button
                            key={v}
                            type="button"
                            translate="no"
                            onClick={() => target && onSelectWord(target)}
                            className="px-2 py-0.5 rounded font-serif-lexicon font-semibold bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--accent-primary)] hover:border-[var(--accent-primary)] cursor-pointer"
                          >
                            {v}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* 2. CET2016 Learner-Centric Syllabus Group & Derivatives */}
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  四六级考纲归属与同组派生词
                </span>
                {word.homographNumbers.length > 0 && (
                  <span className="text-[11px] font-mono-tabular px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    同形词义项 {word.homographNumbers.map((n) => `I`.repeat(n)).join(' / ')}
                  </span>
                )}
              </div>

              {word.cetRefs.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  该词为超纲词汇（未在四、六级考试大纲词表中单列）。
                </p>
              ) : (
                <div className="space-y-2">
                  {word.cetRefs.map((ref, idx) => {
                    const peerItems = (ref.peerForms || [])
                      .filter((p) => p.toLowerCase() !== word.normalized)
                      .map((p) => wordsMap.get(p.toLowerCase()) || null)
                      .filter((w): w is LexiconWordItem => Boolean(w));
                    const repWord =
                      ref.representativeHeadword.toLowerCase() !== word.normalized
                        ? wordsMap.get(ref.representativeHeadword.toLowerCase()) || null
                        : null;

                    return (
                      <div
                        key={`${ref.entryId}-${idx}`}
                        className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-mono-tabular font-semibold border ${
                                ref.level === 'CET6'
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/70'
                                  : 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/70'
                              }`}
                            >
                              {ref.level === 'CET6' ? 'CET-6 六级核心' : 'CET-4 四级核心'}
                            </span>
                            <span className="text-[11px] text-[var(--text-secondary)]">
                              {ref.role === 'headword' ? '考纲基准主词' : '考纲同组派生词'}
                            </span>
                          </div>
                          {repWord && (
                            <button
                              type="button"
                              translate="no"
                              onClick={() => onSelectWord(repWord)}
                              className="text-[11px] font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                            >
                              归属主词: {repWord.word} →
                            </button>
                          )}
                        </div>

                        {peerItems.length > 0 ? (
                          <div className="space-y-1.5 pt-1 border-t border-[var(--border-subtle)]/70">
                            <div className="text-[11px] text-[var(--text-muted)]">
                              同考纲词目关联词 / 派生词 ({peerItems.length}):
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {peerItems.map((peer) => {
                                const peerPosMeta = peer.cocaPrimaryPos
                                  ? COCA_POS_META[peer.cocaPrimaryPos]
                                  : null;
                                const peerSt =
                                  allUserRecordsMap.get(peer.id)?.status || 'unrated';
                                return (
                                  <button
                                    key={peer.id}
                                    type="button"
                                    translate="no"
                                    onClick={() => onSelectWord(peer)}
                                    className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                                  >
                                    <span className="font-serif-lexicon font-semibold text-xs text-[var(--text-primary)]">
                                      {peer.word}
                                    </span>
                                    {peerPosMeta && (
                                      <span
                                        className={`px-1 py-0.2 rounded text-[9px] font-mono-tabular font-semibold border ${peerPosMeta.badgeClass}`}
                                      >
                                        {peerPosMeta.abbr}
                                      </span>
                                    )}
                                    {peer.cocaBestPosRank && (
                                      <span className="text-[10px] font-mono-tabular text-blue-600 dark:text-blue-400">
                                        #{peer.cocaBestPosRank}
                                      </span>
                                    )}
                                    {peerSt === 'mastered' && (
                                      <span
                                        className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                                        title="已掌握"
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-[var(--text-muted)]">
                            独立考纲词目（无考纲并列派生词）
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Quick Family Context */}
            {family && (
              <div className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    所属 BNC/COCA 词族 ({family.band} · {family.members.length} 词)
                  </span>
                  <button
                    type="button"
                    onClick={() => onInspectFamily(family.id, word.id)}
                    className="text-xs font-medium text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>在词族图谱中打开</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {family.members.slice(0, 14).map((m) => {
                    const isSelf = m.normalized === word.id;
                    const memberItem = wordsMap.get(m.normalized);
                    const memberSt = allUserRecordsMap.get(m.normalized)?.status || 'unrated';
                    return (
                      <button
                        key={m.normalized}
                        type="button"
                        translate="no"
                        onClick={() => memberItem && onSelectWord(memberItem)}
                        className={`px-2 py-1 rounded text-xs font-serif-lexicon border transition-colors inline-flex items-center gap-1 cursor-pointer ${
                          isSelf
                            ? 'bg-[var(--accent-soft)] border-[var(--accent-primary)] text-[var(--accent-primary)] font-bold'
                            : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]'
                        }`}
                      >
                        <span>{m.word}</span>
                        {memberItem?.inCoca && (
                          <span className="text-[9px] font-mono-tabular text-blue-600 dark:text-blue-400">
                            C#{memberItem.cocaBestPosRank}
                          </span>
                        )}
                        {memberSt === 'mastered' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        )}
                      </button>
                    );
                  })}
                  {family.members.length > 14 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('relations')}
                      className="px-2 py-1 rounded text-[11px] font-mono-tabular text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      +{family.members.length - 14} 更多成员…
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 4. Quick Tags & Notes Preview */}
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  个人知识标签与助记笔记
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('learning')}
                  className="text-[11px] text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  管理词性状态与词集 →
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {currentTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-medium"
                  >
                    #{t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="hover:opacity-75 cursor-pointer"
                      aria-label={`移除标签 ${t}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <form onSubmit={handleAddTag} className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="+ 添加标签..."
                    className="w-24 px-2 py-0.5 text-xs rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  {newTagInput.trim() && (
                    <button
                      type="submit"
                      className="p-0.5 rounded bg-[var(--accent-primary)] text-white cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </form>
              </div>
              <textarea
                rows={2}
                value={noteDraft}
                onChange={(e) => {
                  setNoteDraft(e.target.value);
                  setIsNoteDirty(true);
                }}
                onBlur={handleSaveNote}
                placeholder="记录语境搭配、词义辨析或真题出处（失焦自动保存）…"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] resize-y"
              />
            </div>
          </>
        )}

        {/* ================= TAB 2: FREQUENCY EVIDENCE ================= */}
        {activeTab === 'frequency' && (
          <>
            {/* Section A: COCA 2020 Detailed Evidence */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  COCA 2020 词元与词性频率分布
                </h3>
                {word.inCoca && (
                  <span className="text-[11px] font-mono-tabular text-[var(--text-secondary)]">
                    信息熵 H = {word.cocaPosEntropy?.toFixed(2)} bits
                  </span>
                )}
              </div>

              {word.inCoca ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono-tabular">
                    <div className="p-2.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">词头合计频次</div>
                      <div className="mt-0.5 text-sm font-bold text-[var(--text-primary)]">
                        {word.cocaHeadwordTotalFreq?.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)]">
                        派生排名 #{word.cocaHeadwordDerivedRank?.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-2.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">最佳词性官方排名</div>
                      <div className="mt-0.5 text-sm font-bold text-blue-600 dark:text-blue-400">
                        #{word.cocaBestPosRank?.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)]">
                        主词性: {word.cocaPrimaryPos}
                      </div>
                    </div>
                    <div className="p-2.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">主词性集中度</div>
                      <div className="mt-0.5 text-sm font-bold text-[var(--text-primary)]">
                        {Math.round(word.cocaDominantPosSharePct || 0)}%
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)]">
                        共 {word.cocaPosCount} 种词性
                      </div>
                    </div>
                  </div>

                  {/* Per-PoS Table */}
                  <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[84px_72px_84px_1fr_64px] items-center px-3 py-1.5 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      <div>词性 (PoS)</div>
                      <div>官方排名</div>
                      <div className="text-right pr-2">COCA 频次</div>
                      <div>词头内占比</div>
                      <div className="text-right">前百分比</div>
                    </div>
                    <div className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)]">
                      {(word.cocaLexemes || []).map((lex) => {
                        const meta = COCA_POS_META[lex.pos];
                        const sharePct = Math.round(lex.sharePct);
                        const pctTop = ((lex.rank / 60000) * 100).toFixed(1);
                        return (
                          <div
                            key={lex.lexemeId}
                            className="grid grid-cols-[84px_72px_84px_1fr_64px] items-center px-3 py-2 text-xs font-mono-tabular"
                          >
                            <div>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${meta?.badgeClass || ''}`}
                              >
                                {meta?.label || lex.pos}
                              </span>
                            </div>
                            <div className="font-semibold text-[var(--text-primary)]">
                              #{lex.rank.toLocaleString()}
                            </div>
                            <div className="text-right pr-2 text-[var(--text-secondary)]">
                              {lex.frequency.toLocaleString()}
                            </div>
                            <div className="flex items-center gap-1.5 pr-2">
                              <div className="flex-1 h-1.5 bg-[var(--bg-subtle)] rounded-xs overflow-hidden">
                                <div
                                  className="h-full bg-[var(--accent-primary)]"
                                  style={{ width: `${Math.max(2, sharePct)}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-[var(--text-muted)] w-8 text-right">
                                {sharePct}%
                              </span>
                            </div>
                            <div className="text-right text-[11px] text-[var(--text-muted)]">
                              Top {pctTop}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] space-y-2">
                  <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                    <span>该表记在 COCA 2020 (Top 60,000 词元表) 中无直接词头记录</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    COCA 2020 按词元+词性（Lemma + PoS）统计，不单独拆分屈折变形（如复数、过去式）或英式拼写变体。系统严格遵循语料事实，绝不凭空伪造该词形的 COCA 频次。
                  </p>
                  {headwordItem && headwordItem.inCoca && (
                    <div className="pt-1 flex items-center justify-between border-t border-[var(--border-subtle)]">
                      <span>其所属 BNC 词族首词在 COCA 中有明确记录：</span>
                      <button
                        type="button"
                        onClick={() => onSelectWord(headwordItem)}
                        className="px-2 py-1 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] font-mono-tabular font-semibold cursor-pointer"
                      >
                        查看 {headwordItem.word} (COCA #{headwordItem.cocaBestPosRank}) →
                      </button>
                    </div>
                  )}
                  {variantCocaTargets.length > 0 && (
                    <div className="pt-1 flex items-center justify-between border-t border-[var(--border-subtle)]">
                      <span>其并列拼写变体在 COCA 中有明确记录：</span>
                      <div className="flex gap-1">
                        {variantCocaTargets.map((vt) => (
                          <button
                            key={vt.id}
                            type="button"
                            onClick={() => onSelectWord(vt)}
                            className="px-2 py-1 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] font-mono-tabular font-semibold cursor-pointer"
                          >
                            {vt.word} (COCA #{vt.cocaBestPosRank})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section B: BNC/COCA 2.0 Word Form & Family Evidence */}
            <div className="p-4 space-y-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                Nation BNC/COCA 2.0 词形与词族统计
              </h3>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono-tabular">
                <div className="p-2.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                  <div className="text-[10px] text-[var(--text-muted)]">BNC 词形实测频次</div>
                  <div className="mt-0.5 text-sm font-bold text-[var(--text-primary)]">
                    {word.formFrequency !== null
                      ? word.formFrequency.toLocaleString()
                      : word.bncLinkedViaVariant
                        ? '无独立频次'
                        : '未收录'}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    {word.formFrequency === 0 && word.inBnc
                      ? '语料库显式 0 频次'
                      : `占全族 ${shareDetail.label}`}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                  <div className="text-[10px] text-[var(--text-muted)]">BNC 词族总频次</div>
                  <div className="mt-0.5 text-sm font-bold text-[var(--text-primary)]">
                    {word.familyFrequency !== null
                      ? word.familyFrequency.toLocaleString()
                      : '—'}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    {word.band ? `${word.band} 频段` : '无频段'}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                  <div className="text-[10px] text-[var(--text-muted)]">全库词形频次排名</div>
                  <div className="mt-0.5 text-sm font-bold text-[var(--text-primary)]">
                    {word.cocaBestPosRank !== null && word.cocaBestPosRank !== undefined
                      ? `#${word.cocaBestPosRank.toLocaleString()}`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    共 {word.familyMemberCount ?? 0} 个同族成员
                  </div>
                </div>
              </div>
            </div>

            {/* Section C: Independent Multi-Source CorpusObservation Ledger */}
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  独立语料统计观测流水 (CorpusObservation · {corpusObservations.length})
                </h3>
                <span className="text-[10px] text-[var(--text-muted)]">跨源频次绝不混加</span>
              </div>
              <div className="space-y-2">
                {corpusObservations.map((obs) => (
                  <div
                    key={obs.id}
                    className="p-2.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-mono-tabular">
                      <span className="font-semibold text-[var(--text-primary)]">
                        [{obs.datasetSource}] {obs.unitLabel}
                      </span>
                      <span className="text-[var(--accent-primary)] font-semibold">
                        {typeof obs.value === 'number' ? obs.value.toLocaleString() : obs.value}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                      {obs.formulaOrNote}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ================= TAB 3: LEXICAL RELATIONS ================= */}
        {activeTab === 'relations' && (
          <>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  可追溯词汇关系网络 (LexicalRelation · {lexicalRelations.length})
                </h3>
                <span className="text-[10px] text-[var(--text-muted)]">
                  严格区分原始证据与形态参考
                </span>
              </div>

              {lexicalRelations.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  该词条暂无跨词条家族、变体或同形异义关联记录。
                </p>
              ) : (
                <div className="space-y-2">
                  {lexicalRelations.map((rel) => {
                    const targetWord =
                      wordsMap.get(rel.targetId.toLowerCase()) ||
                      wordsMap.get(rel.targetLabel.split(' ')[0].toLowerCase());
                    return (
                      <div
                        key={rel.id}
                        className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-semibold ${
                                rel.isExplicit
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                              }`}
                            >
                              {rel.isExplicit ? '显式证据' : '形态参考'}
                            </span>
                            <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                              [{rel.datasetSource}]
                            </span>
                          </div>
                          {targetWord && targetWord.id !== word.id && (
                            <button
                              type="button"
                              translate="no"
                              onClick={() => onSelectWord(targetWord)}
                              className="text-xs font-serif-lexicon font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
                            >
                              跳转 {targetWord.word} →
                            </button>
                          )}
                        </div>
                        <div
                          translate="no"
                          className="font-serif-lexicon font-semibold text-sm text-[var(--text-primary)]"
                        >
                          {word.word} → {rel.targetLabel}
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                          {rel.explanation}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Full BNC Family Spectrum inside Relations Tab */}
            {family && (
              <div className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    BNC/COCA 词族全成员频谱 ({family.headword} · {family.members.length} 词)
                  </h3>
                  <button
                    type="button"
                    onClick={() => onInspectFamily(family.id, word.id)}
                    className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                  >
                    在词族图谱中展开 →
                  </button>
                </div>
                <div className="border border-[var(--border-subtle)] rounded-lg divide-y divide-[var(--border-subtle)] max-h-72 overflow-y-auto bg-[var(--bg-canvas)]">
                  {[...family.members]
                    .sort((a, b) => {
                      if (a.isHeadword !== b.isHeadword) return a.isHeadword ? -1 : 1;
                      return b.frequency - a.frequency;
                    })
                    .map((m) => {
                      const mItem = wordsMap.get(m.normalized);
                      const isSelf = m.normalized === word.id;
                      const mShare = getIntraFamilyShareDetail(
                        m.frequency,
                        family.totalFrequency,
                        true,
                        false
                      );
                      return (
                        <button
                          key={m.normalized}
                          type="button"
                          onClick={() => mItem && onSelectWord(mItem)}
                          className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-xs text-left transition-colors cursor-pointer ${
                            isSelf
                              ? 'bg-[var(--accent-soft)] font-semibold'
                              : 'hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          <div className="flex items-baseline gap-1.5 min-w-0">
                            <span
                              translate="no"
                              className="font-serif-lexicon text-[var(--text-primary)] truncate"
                            >
                              {m.word}
                            </span>
                            <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                              {m.isHeadword ? '族首' : '成员'}
                            </span>
                            {mItem?.inCoca && (
                              <span className="text-[10px] font-mono-tabular text-blue-600 dark:text-blue-400">
                                COCA #{mItem.cocaBestPosRank}
                              </span>
                            )}
                          </div>
                          <div className="font-mono-tabular text-[11px] text-[var(--text-secondary)] shrink-0">
                            BNC {m.frequency.toLocaleString()} ({mShare.label})
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ================= TAB 4: LEARNING & PER-POS MASTERY ================= */}
        {activeTab === 'learning' && (
          <>
            {/* 1. Per-PoS Independent Learning Status Matrix */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    COCA 分词性独立掌握度矩阵
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    分词性状态与词头整体状态相互独立，不自动跨粒度虚增推断
                  </p>
                </div>
                {(word.cocaLexemes || []).length > 0 && onPosStatusChange && (
                  <button
                    type="button"
                    onClick={() => {
                      for (const lex of word.cocaLexemes || []) {
                        onPosStatusChange(word.id, word.word, lex.pos, currentStatus);
                      }
                    }}
                    className="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                    title="显式将当前词头整体状态同步给该词下属所有 COCA 词性"
                  >
                    同步为整体状态
                  </button>
                )}
              </div>

              {(word.cocaLexemes || []).length === 0 ? (
                <div className="p-3 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                  该词形无直接 COCA 词元+词性记录，仅维护词形/词头级学习状态。
                </div>
              ) : (
                <div className="space-y-2">
                  {(word.cocaLexemes || []).map((lex) => {
                    const posMeta = COCA_POS_META[lex.pos];
                    const posSt: LearningStatus = currentPosStatuses[lex.pos] || 'unrated';
                    return (
                      <div
                        key={lex.lexemeId}
                        className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs font-mono-tabular">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${posMeta?.badgeClass || ''}`}
                            >
                              {posMeta?.label || lex.pos}
                            </span>
                            <span translate="no" className="font-serif-lexicon font-bold">
                              {word.word}
                            </span>
                            <span className="text-[var(--text-muted)]">
                              Rank #{lex.rank.toLocaleString()} · Freq{' '}
                              {lex.frequency.toLocaleString()}
                            </span>
                          </div>
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            占词头 {Math.round(lex.sharePct)}%
                          </span>
                        </div>
                        {onPosStatusChange && (
                          <div className="grid grid-cols-5 gap-1">
                            {ALL_STATUSES.map((st) => {
                              const stMeta = LEARNING_STATUS_META[st];
                              const active = posSt === st;
                              return (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() =>
                                    onPosStatusChange(word.id, word.word, lex.pos, st)
                                  }
                                  className={`py-1 px-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                                    active
                                      ? `${stMeta.badgeClass} font-semibold`
                                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                                  }`}
                                >
                                  {stMeta.shortLabel}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Tags & Notes Full Editor */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>自定义标签与深度学习笔记</span>
                </span>
                {isNoteDirty && (
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    className="text-xs font-semibold text-[var(--accent-primary)] cursor-pointer"
                  >
                    保存笔记
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {currentTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-medium"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:opacity-75 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              <form onSubmit={handleAddTag} className="flex gap-1.5">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="输入标签名回车添加 (如 考研高频、多义熟词)…"
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                <button
                  type="submit"
                  disabled={!newTagInput.trim()}
                  className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                >
                  添加
                </button>
              </form>

              <textarea
                rows={4}
                value={noteDraft}
                onChange={(e) => {
                  setNoteDraft(e.target.value);
                  setIsNoteDirty(true);
                }}
                onBlur={handleSaveNote}
                placeholder="支持多行个人词典笔记、例句摘录与跨词性用法对比…"
                className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] resize-y leading-relaxed"
              />
            </div>

            {/* 3. Static Collections Membership */}
            <div className="p-4 space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] flex items-center gap-1.5">
                <FolderPlus className="w-3.5 h-3.5" />
                <span>加入静态词集或学习批次</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {staticCollections.map((col) => {
                  const isInCol = col.wordIds.includes(word.id);
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => onToggleWordInCollection(col.id, word.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                        isInCol
                          ? 'bg-[var(--accent-soft)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                          : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <BookMarked className="w-3 h-3" />
                      <span>{col.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Activity History */}
            {wordLogs.length > 0 && (
              <div className="p-4 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  <span>该词最近变更流水 ({wordLogs.length})</span>
                </div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {wordLogs.slice(0, 12).map((log) => (
                    <div
                      key={log.id}
                      className="text-[11px] flex items-center justify-between gap-2 py-1 px-2 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)]"
                    >
                      <span className="text-[var(--text-secondary)] truncate">
                        {log.actionType === 'pos_status_change' && log.targetPos ? (
                          <>
                            [{log.targetPos}] 设为{' '}
                            <strong>
                              {LEARNING_STATUS_META[log.newStatus || 'unrated'].label}
                            </strong>
                          </>
                        ) : log.actionType === 'status_change' ||
                          log.actionType === 'batch_import' ? (
                          <>
                            整体状态设为{' '}
                            <strong>
                              {LEARNING_STATUS_META[log.newStatus || 'unrated'].label}
                            </strong>
                          </>
                        ) : log.actionType === 'study_touch' ? (
                          '完成复习打卡'
                        ) : (
                          '更新标签/笔记'
                        )}
                      </span>
                      <span className="font-mono-tabular text-[10px] text-[var(--text-muted)] shrink-0">
                        {new Date(log.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ================= TAB 5: AUTHORITATIVE DICTIONARIES ================= */}
        {activeTab === 'dictionaries' && (
          <div className="p-4 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              权威词典与语料检索外链 ({enabledDictionaries.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {enabledDictionaries.map((dict) => (
                <a
                  key={dict.id}
                  href={buildDictionaryUrl(dict.urlTemplate, word.word)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-hover)] hover:border-[var(--accent-primary)] transition-colors flex items-center justify-between gap-2 group"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)]">
                      {dict.name}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      {dict.description}
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
