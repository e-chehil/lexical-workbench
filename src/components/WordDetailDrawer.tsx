import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { formatCompactFrequency } from '../utils/frequency.ts';
import {
  X,
  Volume2,
  ExternalLink,
  Layers,
  Tag,
  Plus,
  CheckCircle2,
  FileText,
  Sparkles,
  BookOpen,
  GitBranch,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';

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
  onStatusChange: (wordId: string, wordDisplay: string, status: LearningStatus) => Promise<void> | void;
  onPosStatusChange?: (
    wordId: string,
    wordDisplay: string,
    pos: CocaRawPos,
    status: LearningStatus
  ) => Promise<void> | void;
  onTagsChange: (wordId: string, wordDisplay: string, tags: string[]) => Promise<void> | void;
  onNoteChange: (wordId: string, wordDisplay: string, note: string) => Promise<void> | void;
  onTouchStudyRecord: (wordId: string, wordDisplay: string) => Promise<void> | void;
  onToggleWordInCollection: (collectionId: string, wordId: string) => Promise<void> | void;
  onSelectWord: (word: LexiconWordItem) => void;
  onInspectFamily: (familyId: string, highlightWord?: string) => void;
}

const ALL_STATUSES: LearningStatus[] = ['unrated', 'queued', 'learning', 'mastered', 'deferred'];

export const WordDetailDrawer: React.FC<WordDetailDrawerProps> = ({
  word,
  onClose,
  wordsMap,
  familiesMap,
  userRecord,
  allUserRecordsMap,
  collections,
  dictionaries,
  onStatusChange,
  onPosStatusChange,
  onTagsChange,
  onNoteChange,
  onTouchStudyRecord,
  onToggleWordInCollection,
  onSelectWord,
  onInspectFamily,
}) => {
  const [newTagInput, setNewTagInput] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [isNoteDirty, setIsNoteDirty] = useState(false);
  const [noteSavedToast, setNoteSavedToast] = useState(false);
  const [checkInToast, setCheckInToast] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Track latest unsaved note draft so switching words, closing drawer, or unmounting flushes automatically
  const unsavedDraftRef = useRef<{
    wordId: string;
    wordDisplay: string;
    noteDraft: string;
    isDirty: boolean;
  } | null>(null);

  const onNoteChangeRef = useRef(onNoteChange);
  useEffect(() => {
    onNoteChangeRef.current = onNoteChange;
  }, [onNoteChange]);

  useEffect(() => {
    if (word) {
      unsavedDraftRef.current = {
        wordId: word.id,
        wordDisplay: word.word,
        noteDraft,
        isDirty: isNoteDirty,
      };
    }
  }, [word, noteDraft, isNoteDirty]);

  const flushUnsavedDraftIfNeeded = useCallback(async () => {
    const draft = unsavedDraftRef.current;
    if (draft && draft.isDirty) {
      unsavedDraftRef.current = { ...draft, isDirty: false };
      try {
        await onNoteChangeRef.current(draft.wordId, draft.wordDisplay, draft.noteDraft);
      } catch {
        // Keep silent on background flush; explicit save surfaces error in UI
      }
    }
  }, []);

  // When switching to a different word, flush previous word's unsaved note first, then initialize new word
  const prevWordIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevWordIdRef.current && prevWordIdRef.current !== word?.id) {
      void flushUnsavedDraftIfNeeded();
    }
    prevWordIdRef.current = word?.id || null;
    setNoteDraft(userRecord?.notes || '');
    setIsNoteDirty(false);
    setNewTagInput('');
    setActionError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.id]);

  // Keep noteDraft in sync with external DB updates if user isn't actively editing a dirty draft
  useEffect(() => {
    if (!isNoteDirty) {
      setNoteDraft(userRecord?.notes || '');
    }
  }, [userRecord?.notes, isNoteDirty]);

  // Flush unsaved draft on unmount
  useEffect(() => {
    return () => {
      void flushUnsavedDraftIfNeeded();
    };
  }, [flushUnsavedDraftIfNeeded]);

  const handleCloseDrawer = useCallback(async () => {
    await flushUnsavedDraftIfNeeded();
    onClose();
  }, [flushUnsavedDraftIfNeeded, onClose]);

  const family = useMemo(() => {
    if (!word || !word.familyId) return null;
    return familiesMap.get(word.familyId) || null;
  }, [word, familiesMap]);

  if (!word) return null;

  const currentStatus: LearningStatus = userRecord?.status || 'unrated';
  const currentTags = userRecord?.tags || [];
  const studyCount = userRecord?.studyCount || 0;
  const lastStudiedAt = userRecord?.lastStudiedAt || null;
  const enabledDicts = dictionaries.filter((d) => d.enabled);
  const staticCollections = collections.filter(
    (c) => c.type === 'static' || c.type === 'study_plan'
  );

  const handleSpeak = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(word.word);
      utter.lang = 'en-US';
      utter.rate = 0.95;
      window.speechSynthesis.speak(utter);
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newTagInput.trim().replace(/^#/, '');
    if (!cleaned) return;
    if (!currentTags.includes(cleaned)) {
      try {
        setActionError(null);
        await onTagsChange(word.id, word.word, [...currentTags, cleaned]);
        setNewTagInput('');
      } catch (err) {
        setActionError(err instanceof Error ? err.message : '保存标签失败，请重试');
      }
    } else {
      setNewTagInput('');
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    try {
      setActionError(null);
      await onTagsChange(
        word.id,
        word.word,
        currentTags.filter((t) => t !== tagToRemove)
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '移除标签失败，请重试');
    }
  };

  const handleSaveNote = async () => {
    if (!isNoteDirty) return;
    try {
      setActionError(null);
      await onNoteChange(word.id, word.word, noteDraft);
      setIsNoteDirty(false);
      if (unsavedDraftRef.current && unsavedDraftRef.current.wordId === word.id) {
        unsavedDraftRef.current.isDirty = false;
      }
      setNoteSavedToast(true);
      setTimeout(() => setNoteSavedToast(false), 1800);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '笔记保存失败，草稿已保留');
    }
  };

  const handleCheckIn = async () => {
    try {
      setActionError(null);
      await onTouchStudyRecord(word.id, word.word);
      setCheckInToast(true);
      setTimeout(() => setCheckInToast(false), 1500);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '打卡记录失败，请重试');
    }
  };

  const cocaLexemes = word.cocaLexemes || [];

  return (
    <aside
      aria-label="词条综合详情面板"
      className="fixed sm:absolute xl:static inset-x-0 top-12 bottom-12 md:bottom-0 sm:inset-x-auto sm:top-0 sm:right-0 z-40 xl:z-auto w-full sm:w-[400px] lg:w-[420px] xl:w-[410px] 2xl:w-[440px] border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl xl:shadow-none flex flex-col h-[calc(100dvh-6rem)] sm:h-full shrink-0 overflow-hidden"
    >
      {/* ==================================================================== */}
      {/* 1. COMPACT WORD HEADER + DIRECT DICTIONARY QUICK-JUMP BAR            */}
      {/* ==================================================================== */}
      <div className="px-4 pt-3.5 pb-3 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                translate="no"
                className="font-serif-lexicon text-2xl font-bold text-[var(--text-primary)] tracking-tight break-all"
              >
                {word.word}
              </h2>
              {word.homographNumbers.length > 0 && (
                <span className="text-[11px] font-mono-tabular px-1.5 py-0.5 rounded bg-amber-500/12 text-amber-700 dark:text-amber-300 font-semibold">
                  同形词 {word.homographNumbers.map((n) => `#${n}`).join(', ')}
                </span>
              )}
              <button
                type="button"
                onClick={handleSpeak}
                className="p-1.5 rounded-md bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
                title="朗读美式发音"
                aria-label="朗读发音"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            {/* Key Multi-Source Rank & Syllabus Summary Line */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px] font-mono-tabular">
              {word.inCoca && (
                <span className="px-1.5 py-0.5 rounded bg-blue-500/12 text-blue-700 dark:text-blue-300 font-semibold">
                  COCA #{word.cocaBestPosRank ?? word.cocaHeadwordDerivedRank}
                  {word.cocaPrimaryPos ? ` · ${word.cocaPrimaryPos}` : ''}
                </span>
              )}
              {word.band && (
                <span className="px-1.5 py-0.5 rounded bg-teal-500/12 text-teal-700 dark:text-teal-300 font-semibold">
                  BNC {word.band} {word.isHeadword ? '族首词' : `→ ${word.headword}`}
                </span>
              )}
              {word.isCet4 && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-semibold">
                  CET-4 四级大纲
                </span>
              )}
              {word.isCet6 && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 font-semibold">
                  {word.isCet6Only ? 'CET-6 六级新增' : 'CET-6 六级大纲'}
                </span>
              )}
              {word.displayVariants.length > 1 && (
                <span className="text-[var(--text-muted)]">
                  变体: {word.displayVariants.filter((v) => v !== word.word).join(' / ')}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseDrawer}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer shrink-0"
            title="关闭详情面板 (自动保存草稿)"
            aria-label="关闭词条详情"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Direct External Dictionary Buttons (No prefix label, clean grid) */}
        {enabledDicts.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)]/80 grid grid-cols-3 gap-1.5">
            {enabledDicts.map((dict) => (
              <a
                key={dict.id}
                href={buildDictionaryUrl(dict.urlTemplate, word.word)}
                target="_blank"
                rel="noopener noreferrer"
                title={`${dict.name}: ${dict.description || ''}`}
                className="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] text-[11px] font-medium text-[var(--text-secondary)] inline-flex items-center justify-between gap-1 transition-colors truncate"
              >
                <span className="truncate">{dict.shortName || dict.name}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-65 shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 2. LEARNING STATUS & STUDY CHECK-IN BAR (WITH CHECK-IN COUNTER)      */}
      {/* ==================================================================== */}
      <div className="px-4 py-2.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-1.5">
          <div className="grid grid-cols-5 gap-1 flex-1">
            {ALL_STATUSES.map((st) => {
              const meta = LEARNING_STATUS_META[st];
              const active = currentStatus === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={async () => {
                    try {
                      setActionError(null);
                      await onStatusChange(word.id, word.word, st);
                    } catch (err) {
                      setActionError(err instanceof Error ? err.message : '状态更新失败');
                    }
                  }}
                  className={`py-1 px-1 rounded text-[11px] font-medium border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    active
                      ? `${meta.badgeClass} font-semibold shadow-2xs`
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                  <span>{meta.shortLabel}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleCheckIn}
            title="记录一次今日复习打卡"
            className={`px-2.5 py-1 rounded border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
              checkInToast
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-emerald-600'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>{checkInToast ? '已打卡!' : `打卡 (${studyCount})`}</span>
          </button>
        </div>

        {/* Study Progress Counter & Timestamp Summary */}
        <div className="flex items-center justify-between text-[10px] font-mono-tabular text-[var(--text-muted)]">
          <span>
            累计复习打卡: <strong className="text-[var(--text-secondary)]">{studyCount} 次</strong>
          </span>
          <span>
            {lastStudiedAt
              ? `最近学习: ${lastStudiedAt.slice(0, 16).replace('T', ' ')}`
              : '尚无打卡记录'}
          </span>
        </div>

        {actionError && (
          <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 3. SINGLE SCROLLABLE BODY (NO TABS — ALL EVIDENCE & NOTES IN ONE FLOW)*/}
      {/* ==================================================================== */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* SECTION A: PERSONAL NOTES, TAGS & COLLECTION ASSIGNMENT */}
        <section className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-3">
          {/* Study Note Editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>个人学习笔记与例句摘录</span>
              </span>
              <div className="flex items-center gap-2">
                {noteSavedToast && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    已保存
                  </span>
                )}
                {isNoteDirty && (
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    className="px-2 py-0.5 rounded bg-[var(--accent-primary)] text-white text-[10px] font-semibold cursor-pointer"
                  >
                    保存笔记
                  </button>
                )}
              </div>
            </div>
            <textarea
              rows={2}
              value={noteDraft}
              onChange={(e) => {
                setNoteDraft(e.target.value);
                setIsNoteDirty(true);
              }}
              onBlur={handleSaveNote}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                  e.preventDefault();
                  void handleSaveNote();
                }
              }}
              placeholder="记录助记词根、真题搭配或易混辨析（失焦、切换词条或关闭面板时自动保存）…"
              className="w-full p-2 text-xs rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] resize-y leading-relaxed"
            />
          </div>

          {/* Personal Tags */}
          <div className="pt-2 border-t border-[var(--border-subtle)]/70 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1 mr-1">
                <Tag className="w-3 h-3 text-[var(--accent-primary)]" />
                <span>标签:</span>
              </span>
              {currentTags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[11px] font-medium"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(t)}
                    className="hover:text-rose-500 cursor-pointer"
                    aria-label={`移除标签 ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <form onSubmit={handleAddTag} className="inline-flex items-center gap-1">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="+ 添加标签"
                  className="w-24 px-2 py-0.5 text-[11px] rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:w-32 transition-all"
                />
                {newTagInput.trim() && (
                  <button
                    type="submit"
                    className="px-1.5 py-0.5 rounded bg-[var(--accent-primary)] text-white text-[10px] font-medium cursor-pointer"
                  >
                    添加
                  </button>
                )}
              </form>
            </div>

            {/* Quick Collection Membership */}
            {staticCollections.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <span className="text-[10px] text-[var(--text-muted)] mr-1">加入词集:</span>
                {staticCollections.map((col) => {
                  const inCol = col.wordIds.includes(word.id);
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => onToggleWordInCollection(col.id, word.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                        inCol
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span>{inCol ? '✓' : '+'}</span>
                      <span className="truncate max-w-[120px]">{col.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* SECTION B: COCA 2020 PER-POS BREAKDOWN & BNC CORPUS EVIDENCE */}
        <section className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>多源语料频次与 COCA 分词性掌握度</span>
            </span>
            {word.inCoca && (
              <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                词头总频次 {(word.cocaHeadwordTotalFreq || 0).toLocaleString()}
              </span>
            )}
          </div>

          {/* Compact Summary Strip */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="text-[10px] text-[var(--text-muted)]">COCA 最佳词性排名</div>
              <div className="text-sm font-bold font-mono-tabular text-blue-600 dark:text-blue-400 mt-0.5">
                {word.cocaBestPosRank ? `#${word.cocaBestPosRank.toLocaleString()}` : '未进60k'}
              </div>
              <div className="text-[10px] font-mono-tabular text-[var(--text-secondary)]">
                {word.cocaHeadwordDerivedRank
                  ? `词头综合 #${word.cocaHeadwordDerivedRank.toLocaleString()}`
                  : '无记录'}
              </div>
            </div>

            <div className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="text-[10px] text-[var(--text-muted)]">BNC 词族频段</div>
              <div className="text-sm font-bold font-mono-tabular text-teal-600 dark:text-teal-400 mt-0.5">
                {word.band ? word.band : '未收录'}
              </div>
              <div className="text-[10px] font-mono-tabular text-[var(--text-secondary)]">
                族总频 {word.familyFrequency !== null ? word.familyFrequency.toLocaleString() : '—'}
              </div>
            </div>

            <div className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="text-[10px] text-[var(--text-muted)]">BNC 当前词形频次</div>
              <div className="text-sm font-bold font-mono-tabular text-[var(--text-primary)] mt-0.5">
                {formatCompactFrequency(
                  word.formFrequency,
                  word.inBnc,
                  word.bncLinkedViaVariant
                )}
              </div>
              <div className="text-[10px] font-mono-tabular text-[var(--text-secondary)]">
                {word.isHeadword ? '词族首词' : word.headword ? `属 ${word.headword} 族` : '独立词形'}
              </div>
            </div>
          </div>

          {/* COCA Per-PoS Distribution & Independent Status Selector */}
          {cocaLexemes.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                <span>COCA 2020 分词性频次占比 ({cocaLexemes.length} 个词性记录)</span>
                <span>按词性独立标记掌握度</span>
              </div>
              {cocaLexemes.map((lex) => {
                const posMeta = COCA_POS_META[lex.pos];
                const sharePct = Math.round(lex.sharePct);
                const posStatus: LearningStatus =
                  userRecord?.posStatuses?.[lex.pos] || currentStatus;
                const stMeta = LEARNING_STATUS_META[posStatus];

                return (
                  <div
                    key={lex.lexemeId}
                    className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-semibold ${
                            posMeta?.badgeClass ||
                            'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                          }`}
                        >
                          {posMeta?.shortLabel || lex.pos}
                        </span>
                        <span className="font-mono-tabular font-bold text-blue-600 dark:text-blue-400">
                          #{lex.rank.toLocaleString()}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                          频次 {lex.frequency.toLocaleString()} ({sharePct}%)
                        </span>
                      </div>

                      {onPosStatusChange && (
                        <select
                          aria-label={`${word.word} (${lex.pos}) 词性掌握状态`}
                          value={posStatus}
                          onChange={(e) =>
                            onPosStatusChange(
                              word.id,
                              word.word,
                              lex.pos,
                              e.target.value as LearningStatus
                            )
                          }
                          className={`appearance-none text-center px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer shrink-0 ${stMeta.badgeClass}`}
                        >
                          {ALL_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {LEARNING_STATUS_META[st].shortLabel}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="h-1 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 dark:bg-blue-400 rounded-full"
                        style={{ width: `${Math.max(4, sharePct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[11px] text-[var(--text-muted)] py-1">
              当前词形未作为独立词元出现在 COCA 2020 Top 60,000 词表中
              {word.headword && word.headword.toLowerCase() !== word.id ? (
                <>
                  （可查看其所属词族首词{' '}
                  <button
                    type="button"
                    onClick={() => {
                      const hw = wordsMap.get(word.headword!.toLowerCase());
                      if (hw) onSelectWord(hw);
                    }}
                    className="text-[var(--accent-primary)] font-semibold hover:underline cursor-pointer"
                  >
                    {word.headword}
                  </button>{' '}
                  的 COCA 词频记录）
                </>
              ) : null}
              。
            </div>
          )}
        </section>

        {/* SECTION C: CET2016 SYLLABUS STATUS & SOURCE TRACEABILITY */}
        <section className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>CET2016 四六级考纲收录与同词目拓展</span>
            </span>
            <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
              {word.inCet
                ? word.isCet4 && word.isCet6
                  ? 'CET-4 / CET-6 双大纲收录'
                  : word.isCet4
                    ? 'CET-4 四级大纲收录'
                    : 'CET-6 六级新增收录'
                : '未在 CET2016 大纲单列'}
            </span>
          </div>

          {word.cetRefs.length > 0 ? (
            <div className="space-y-2">
              {word.cetRefs.map((ref, idx) => {
                const roleLabel =
                  ref.role === 'headword'
                    ? '考纲词目代表词'
                    : ref.role === 'variant'
                      ? '拼写或括号变体成员'
                      : '同词目并列/派生收录';

                return (
                  <div
                    key={`${ref.lineNumber}-${idx}`}
                    className="p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        {ref.level === 'CET4' ? (
                          <span className="px-1.5 py-0.5 rounded bg-teal-500/12 text-teal-700 dark:text-teal-300 text-[10px] font-semibold">
                            CET-4 四级大纲
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                            CET-6 六级新增
                          </span>
                        )}
                        <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                          {roleLabel}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                        考纲行号 #{ref.lineNumber}
                      </span>
                    </div>

                    {ref.peerForms.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-[var(--text-muted)]">
                          同一考纲词目下关联收录的词形 ({ref.peerForms.length}):
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {ref.peerForms.map((sib: string) => {
                            const sibEntry = wordsMap.get(sib.toLowerCase());
                            return (
                              <button
                                key={sib}
                                type="button"
                                onClick={() => sibEntry && onSelectWord(sibEntry)}
                                className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--accent-primary)] text-xs font-serif-lexicon font-semibold text-[var(--text-primary)] cursor-pointer"
                              >
                                {sib}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Collapsible Official Syllabus Raw Line Traceability */}
                    <details className="text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]/60">
                      <summary className="cursor-pointer select-none hover:text-[var(--text-secondary)]">
                        查看 CET2016 官方原始词目记录 (#{ref.lineNumber})
                      </summary>
                      <div
                        translate="no"
                        className="mt-1 px-2 py-1 rounded bg-[var(--bg-canvas)] font-mono-tabular text-[11px] text-[var(--text-secondary)] break-all"
                      >
                        {ref.rawLine}
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              该词条未在《全国大学英语四、六级考试大纲 (2016)》词表中单独列出（可能属于考纲词的规则屈折/派生形式，或属于学术/语料库拓展词汇）。
            </div>
          )}
        </section>

        {/* SECTION D: BNC/COCA WORD FAMILY & LEXICAL RELATIONS */}
        {family && (
          <section className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Layers className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
                  BNC 词族成员 ({family.headword} · {family.band} · {family.members.length} 词)
                </span>
              </div>
              <button
                type="button"
                onClick={() => onInspectFamily(family.id, word.id)}
                className="text-[11px] font-semibold text-[var(--accent-primary)] hover:underline inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
              >
                <span>在词族图谱打开</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {family.members.map((m) => {
                const isSelf = m.normalized === word.id;
                const st = allUserRecordsMap.get(m.normalized)?.status || 'unrated';
                const stMeta = LEARNING_STATUS_META[st];
                const memberWord = wordsMap.get(m.normalized);

                return (
                  <button
                    key={m.normalized}
                    type="button"
                    onClick={() => memberWord && onSelectWord(memberWord)}
                    className={`px-2 py-1 rounded border text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isSelf
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] font-bold'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${stMeta.dotClass}`} />
                    <span translate="no" className="font-serif-lexicon">
                      {m.word}
                    </span>
                    <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                      {m.frequency.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
};
