import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Plus,
  ArrowUpRight,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  ActivityLogEntry,
  BncCocaFamily,
  DictionaryTemplate,
  LEARNING_STATUS_META,
  LearningStatus,
  LexiconWordItem,
  UserWordRecord,
  WordCollection,
} from '../data/types.ts';
import { buildDictionaryUrl } from '../data/searchAndFilter.ts';
import { getIntraFamilyShareDetail } from '../utils/frequency.ts';

interface WordDetailDrawerProps {
  word: LexiconWordItem | null;
  family: BncCocaFamily | null;
  userRecord: UserWordRecord | undefined;
  allUserRecordsMap: Map<string, UserWordRecord>;
  allKnownTags: string[];
  wordLogs: ActivityLogEntry[];
  dictionaries: DictionaryTemplate[];
  staticCollections: WordCollection[];
  onClose: () => void;
  onStatusChange: (wordId: string, wordDisplay: string, status: LearningStatus) => void;
  onStudyTouch?: (wordId: string, wordDisplay: string) => void;
  onSaveTagsAndNotes: (
    wordId: string,
    wordDisplay: string,
    tags: string[],
    notes: string
  ) => Promise<void> | void;
  onSelectWordById: (wordId: string) => void;
  onInspectFamily: (familyId: string, highlightWordId?: string) => void;
  onAddWordToCollection: (collectionId: string, wordId: string) => void;
  overlayOnDesktop?: boolean;
}

const ALL_STATUSES: { id: LearningStatus; keyHint: string }[] = [
  { id: 'unrated', keyHint: '1' },
  { id: 'queued', keyHint: '2' },
  { id: 'learning', keyHint: '3' },
  { id: 'mastered', keyHint: '4' },
  { id: 'deferred', keyHint: '5' },
];

export const WordDetailDrawer: React.FC<WordDetailDrawerProps> = ({
  word,
  family,
  userRecord,
  allUserRecordsMap,
  allKnownTags,
  wordLogs,
  dictionaries,
  staticCollections,
  onClose,
  onStatusChange,
  onStudyTouch,
  onSaveTagsAndNotes,
  onSelectWordById,
  onInspectFamily,
  onAddWordToCollection,
  overlayOnDesktop = false,
}) => {
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [notes, setNotes] = useState('');
  const [copied, setCopied] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const drawerRef = useRef<HTMLElement | null>(null);
  const [drawerWidth, setDrawerWidth] = useState<number>(360);

  // Measure actual drawer container width so layout adapts to 360px panel regardless of viewport breakpoint
  useEffect(() => {
    const el = drawerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDrawerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track previous word & dirty state so switching words auto-saves dirty notes
  // and retains unsaved drafts if a save fails!
  const prevWordRef = useRef<{ id: string; word: string } | null>(null);
  const pendingSavedNotesRef = useRef<string | null>(null);
  const inFlightSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const unsavedDraftsByWordRef = useRef<
    Map<string, { tags: string[]; notes: string; error: string | null }>
  >(new Map());
  const latestNotesRef = useRef<{ tags: string[]; notes: string; dirty: boolean }>({
    tags: [],
    notes: '',
    dirty: false,
  });

  const performSaveForWord = async (
    targetWordId: string,
    targetWordDisplay: string,
    tagsToSave: string[],
    notesToSave: string,
    isCurrentActiveWord: boolean
  ): Promise<boolean> => {
    if (isCurrentActiveWord) {
      setIsSavingNotes(true);
      setSaveError(null);
      pendingSavedNotesRef.current = notesToSave;
    }
    try {
      await Promise.resolve(
        onSaveTagsAndNotes(targetWordId, targetWordDisplay, tagsToSave, notesToSave)
      );
      unsavedDraftsByWordRef.current.delete(targetWordId);
      if (isCurrentActiveWord && prevWordRef.current?.id === targetWordId) {
        // Only clear dirty flag if user hasn't typed newer characters while save was in flight
        if (latestNotesRef.current.notes === notesToSave) {
          latestNotesRef.current.dirty = false;
          setNotesDirty(false);
        }
        setSaveError(null);
      }
      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '保存笔记失败，请重试';
      unsavedDraftsByWordRef.current.set(targetWordId, {
        tags: tagsToSave,
        notes: notesToSave,
        error: errMsg,
      });
      if (isCurrentActiveWord && prevWordRef.current?.id === targetWordId) {
        pendingSavedNotesRef.current = null;
        latestNotesRef.current.dirty = true;
        setNotesDirty(true);
        setSaveError(errMsg);
      }
      return false;
    } finally {
      if (isCurrentActiveWord) {
        setIsSavingNotes(false);
      }
    }
  };

  // When switching to a different word, flush any unsaved notes for the previous word first
  useEffect(() => {
    if (!word) return;
    if (prevWordRef.current && prevWordRef.current.id !== word.id) {
      if (latestNotesRef.current.dirty) {
        const prevId = prevWordRef.current.id;
        const prevWordText = prevWordRef.current.word;
        const prevTags = latestNotesRef.current.tags;
        const prevNotes = latestNotesRef.current.notes;
        inFlightSavePromiseRef.current = performSaveForWord(
          prevId,
          prevWordText,
          prevTags,
          prevNotes,
          false
        );
      }
      pendingSavedNotesRef.current = null;
      const savedDraft = unsavedDraftsByWordRef.current.get(word.id);
      const initTags = savedDraft ? savedDraft.tags : userRecord?.tags || [];
      const initNotes = savedDraft ? savedDraft.notes : userRecord?.notes || '';
      const initDirty = Boolean(savedDraft);
      latestNotesRef.current = { tags: initTags, notes: initNotes, dirty: initDirty };
      setTags(initTags);
      setNotes(initNotes);
      setNewTagInput('');
      setNotesDirty(initDirty);
      setSaveError(savedDraft?.error || null);
    } else if (!prevWordRef.current) {
      pendingSavedNotesRef.current = null;
      const savedDraft = unsavedDraftsByWordRef.current.get(word.id);
      const initTags = savedDraft ? savedDraft.tags : userRecord?.tags || [];
      const initNotes = savedDraft ? savedDraft.notes : userRecord?.notes || '';
      const initDirty = Boolean(savedDraft);
      latestNotesRef.current = { tags: initTags, notes: initNotes, dirty: initDirty };
      setTags(initTags);
      setNotes(initNotes);
      setNewTagInput('');
      setNotesDirty(initDirty);
      setSaveError(savedDraft?.error || null);
    }
    prevWordRef.current = { id: word.id, word: word.word };
  }, [word?.id]);

  // When userRecord updates for the SAME word, sync tags, and only sync notes if not dirty and not awaiting save
  useEffect(() => {
    if (!word) return;
    const savedDraft = unsavedDraftsByWordRef.current.get(word.id);
    if (savedDraft) {
      return;
    }
    const nextTags = userRecord?.tags || [];
    setTags(nextTags);
    latestNotesRef.current.tags = nextTags;
    const incomingNotes = userRecord?.notes || '';
    if (pendingSavedNotesRef.current !== null) {
      if (incomingNotes === pendingSavedNotesRef.current) {
        pendingSavedNotesRef.current = null;
      } else {
        return;
      }
    }
    if (!latestNotesRef.current.dirty) {
      latestNotesRef.current.notes = incomingNotes;
      setNotes(incomingNotes);
    }
  }, [userRecord, word?.id]);

  if (!word) return null;

  const currentStatus: LearningStatus = userRecord?.status || 'unrated';
  const enabledDicts = dictionaries.filter((d) => d.enabled);

  const flushDirtyNotesIfNeeded = async (): Promise<boolean> => {
    if (latestNotesRef.current.dirty) {
      const notesToSave = latestNotesRef.current.notes;
      const tagsToSave = latestNotesRef.current.tags;
      const p = performSaveForWord(word.id, word.word, tagsToSave, notesToSave, true);
      inFlightSavePromiseRef.current = p;
      return await p;
    } else if (inFlightSavePromiseRef.current) {
      return await inFlightSavePromiseRef.current;
    }
    return true;
  };

  const handleCopyWord = () => {
    navigator.clipboard?.writeText(word.word).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleAddTag = async (tagToAdd: string) => {
    const clean = tagToAdd.trim().replace(/^#/, '');
    if (!clean) return;
    setNewTagInput('');
    if (!tags.includes(clean)) {
      const prevTags = tags;
      const next = [...tags, clean];
      setTags(next);
      latestNotesRef.current.tags = next;
      const p = performSaveForWord(
        word.id,
        word.word,
        next,
        latestNotesRef.current.notes,
        true
      );
      inFlightSavePromiseRef.current = p;
      const ok = await p;
      if (!ok) {
        setTags(prevTags);
        latestNotesRef.current.tags = prevTags;
      }
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const prevTags = tags;
    const next = tags.filter((t) => t !== tagToRemove);
    setTags(next);
    latestNotesRef.current.tags = next;
    const p = performSaveForWord(
      word.id,
      word.word,
      next,
      latestNotesRef.current.notes,
      true
    );
    inFlightSavePromiseRef.current = p;
    const ok = await p;
    if (!ok) {
      setTags(prevTags);
      latestNotesRef.current.tags = prevTags;
    }
  };

  const handleSaveNotes = async () => {
    if (!latestNotesRef.current.dirty) return;
    const notesToSave = latestNotesRef.current.notes;
    const tagsToSave = latestNotesRef.current.tags;
    const p = performSaveForWord(word.id, word.word, tagsToSave, notesToSave, true);
    inFlightSavePromiseRef.current = p;
    await p;
  };

  const wordShareDetail = getIntraFamilyShareDetail(word.formFrequency, word.familyFrequency);

  const masteredFamilyMembersCount = family
    ? family.members.filter((m) => allUserRecordsMap.get(m.normalized)?.status === 'mastered')
        .length
    : 0;

  // Build clean unboxed metadata segments
  const metaParts: string[] = [];
  if (word.band) metaParts.push(`BNC ${word.band}`);
  if (word.isCet4) metaParts.push('CET-4 大纲');
  if (word.isCet6) metaParts.push('CET-6 大纲');
  if (word.isPhrase) metaParts.push('多词短语');
  if (family) metaParts.push(`词族成员 ${family.members.length}`);

  const studyCount = userRecord?.studyCount || 0;
  const lastStudiedStr = userRecord?.lastStudiedAt
    ? new Date(userRecord.lastStudiedAt).toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
      })
    : null;

  const isCompactDrawer = drawerWidth < 430;

  const inspectorBody = (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-surface)] text-[var(--text-primary)]">
      {/* Top Entry Header + Primary Learning Decision Controls */}
      <div className="px-4 sm:px-5 pt-3.5 pb-3 border-b border-[var(--border-subtle)] space-y-2.5 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2
                translate="no"
                className="text-2xl sm:text-3xl font-serif-lexicon font-semibold tracking-tight text-[var(--text-primary)] break-words"
              >
                {word.word}
              </h2>
              {word.homographNumbers.length > 0 && (
                <span className="text-xs font-mono-tabular text-amber-700 dark:text-amber-400">
                  #{word.homographNumbers.join(',')}
                </span>
              )}
              <button
                type="button"
                onClick={handleCopyWord}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer focus-ring"
                title="复制词条"
                aria-label="复制词条"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Unboxed Metadata Line */}
            {metaParts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs font-mono-tabular text-[var(--text-secondary)]">
                {metaParts.map((part, idx) => (
                  <React.Fragment key={part}>
                    {idx > 0 && <span className="text-[var(--text-muted)]">·</span>}
                    <span
                      className={
                        part.includes('CET-4')
                          ? 'text-teal-700 dark:text-teal-400 font-medium'
                          : part.includes('CET-6')
                            ? 'text-indigo-700 dark:text-indigo-400 font-medium'
                            : part.startsWith('BNC')
                              ? 'text-[var(--accent-primary)] font-medium'
                              : ''
                      }
                    >
                      {part}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={async () => {
              if (!(await flushDirtyNotesIfNeeded())) return;
              onClose();
            }}
            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0 focus-ring"
            aria-label="关闭详情面板"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* 5-Segment Status Selector */}
        <div
          role="group"
          aria-label="学习状态切换"
          className="grid grid-cols-5 gap-1 p-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]"
        >
          {ALL_STATUSES.map(({ id: st, keyHint }) => {
            const meta = LEARNING_STATUS_META[st];
            const active = currentStatus === st;
            return (
              <button
                key={st}
                type="button"
                aria-pressed={active}
                onClick={async () => {
                  if (!(await flushDirtyNotesIfNeeded())) return;
                  onStatusChange(word.id, word.word, st);
                }}
                title={`快捷键 ${keyHint}: 设为${meta.label}`}
                className={`py-1.5 px-1 rounded-md text-xs transition-colors cursor-pointer flex items-center justify-center whitespace-nowrap shrink-0 focus-ring ${
                  active
                    ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] shadow-2xs font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
                }`}
              >
                <span>{meta.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Study Touch Bar ("记录本次学习") */}
        <div className="flex items-center justify-between gap-2 text-xs pt-0.5">
          <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
            {studyCount > 0
              ? `已复习 ${studyCount} 次${lastStudiedStr ? ` · 最近 ${lastStudiedStr}` : ''}`
              : '尚未记录复习打卡'}
          </span>
          {onStudyTouch && (
            <button
              type="button"
              onClick={async () => {
                if (!(await flushDirtyNotesIfNeeded())) return;
                onStudyTouch(word.id, word.word);
              }}
              className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors focus-ring shrink-0"
            >
              <CheckCircle2 className="w-3 h-3 text-[var(--accent-primary)]" />
              <span>记录本次学习</span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Sheet Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] overscroll-contain">
        {/* SECTION 1: Personal Learning Decisions (Tags, Notes & Collections) */}
        <div className="px-4 sm:px-5 py-3.5 space-y-3">
          {/* Tags */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--accent-soft)] font-mono-tabular text-[var(--accent-primary)] font-medium"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-[var(--text-muted)] hover:text-red-500 cursor-pointer focus-ring rounded"
                    aria-label={`移除标签 ${tag}`}
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                </span>
              ))}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddTag(newTagInput);
                }}
                className="inline-flex items-center flex-1 min-w-[120px]"
              >
                <input
                  type="text"
                  name="word-new-tag"
                  aria-label="添加个人标签"
                  autoComplete="off"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="+ 添加个人标签 (回车)…"
                  list="drawer-known-tags"
                  className="w-full px-2.5 py-1 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus-ring"
                />
                <datalist id="drawer-known-tags">
                  {allKnownTags.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </form>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="inspector-word-notes"
                className="text-xs font-medium text-[var(--text-secondary)]"
              >
                助记笔记与真题搭配
              </label>
              <div className="flex items-center gap-2">
                {notesDirty && (
                  <button
                    type="button"
                    disabled={isSavingNotes}
                    onClick={handleSaveNotes}
                    className="text-xs font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {isSavingNotes ? '保存中…' : saveError ? '重试保存' : '保存笔记'}
                  </button>
                )}
              </div>
            </div>
            <textarea
              id="inspector-word-notes"
              name="word-notes"
              rows={2}
              value={notes}
              onChange={(e) => {
                const val = e.target.value;
                latestNotesRef.current.notes = val;
                latestNotesRef.current.dirty = true;
                setNotes(val);
                setNotesDirty(true);
                if (saveError) setSaveError(null);
              }}
              onBlur={handleSaveNotes}
              placeholder="记录真题例句、搭配或易混辨析…"
              className={`w-full p-2 text-xs rounded-md border bg-[var(--bg-canvas)] text-[var(--text-primary)] focus-ring resize-y ${
                saveError ? 'border-rose-500/60' : 'border-[var(--border-subtle)]'
              }`}
            />
            {saveError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-700 dark:text-rose-300"
              >
                <span className="inline-flex items-center gap-1 min-w-0 truncate">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span className="truncate">{saveError}（未保存草稿已保留）</span>
                </span>
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="font-semibold underline shrink-0 cursor-pointer"
                >
                  重试
                </button>
              </div>
            )}
          </div>

          {/* Static Collections Quick Toggle */}
          {staticCollections.length > 0 && (
            <div className="pt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] text-[var(--text-muted)] mr-0.5">归入词集:</span>
              {staticCollections.map((col) => {
                const isMember = col.wordIds.includes(word.id);
                return (
                  <button
                    key={col.id}
                    type="button"
                    aria-pressed={isMember}
                    onClick={() => onAddWordToCollection(col.id, word.id)}
                    className={`px-2 py-0.5 rounded border transition-colors cursor-pointer inline-flex items-center gap-1 focus-ring ${
                      isMember
                        ? 'bg-[var(--accent-soft)] border-[var(--accent-primary)] text-[var(--accent-primary)] font-semibold'
                        : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {isMember ? (
                      <Check className="w-3 h-3" aria-hidden="true" />
                    ) : (
                      <Plus className="w-3 h-3" aria-hidden="true" />
                    )}
                    <span>{col.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Authoritative External Dictionaries */}
          <div className="pt-1 space-y-1.5">
            <div className="text-[11px] font-medium text-[var(--text-muted)]">权威外链查词</div>
            <div className="grid grid-cols-2 gap-1.5">
              {enabledDicts.map((dict) => {
                const url = buildDictionaryUrl(dict.urlTemplate, word.word);
                return (
                  <a
                    key={dict.id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-hover)] hover:border-[var(--accent-primary)] transition-colors flex items-center justify-between text-xs font-medium text-[var(--text-primary)] focus-ring"
                  >
                    <span className="truncate">{dict.shortName}</span>
                    <ExternalLink
                      className="w-3 h-3 text-[var(--text-muted)] shrink-0"
                      aria-hidden="true"
                    />
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        {/* SECTION 2: BNC/COCA Family & Intra-Family Member Spectrum */}
        <div className="px-4 sm:px-5 py-3.5 space-y-3">
          {/* Compact Secondary Frequency Strip (Exact Data at Bottom Layer) */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs font-mono-tabular">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] text-[var(--text-muted)]">词形实测频次:</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {word.formFrequency !== null
                  ? word.formFrequency.toLocaleString()
                  : word.bncLinkedViaVariant
                    ? '无独立频次 (变体关联)'
                    : '未收录'}
              </span>
              {word.formFrequency === 0 && (
                <span className="text-[10px] text-amber-700 dark:text-amber-300">(显式零频)</span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] text-[var(--text-muted)]">词族总频次:</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {word.familyFrequency !== null ? word.familyFrequency.toLocaleString() : '—'}
              </span>
              {wordShareDetail.exactPct !== null && (
                <span className="text-[11px] text-[var(--accent-primary)]">
                  (占族 {wordShareDetail.label})
                </span>
              )}
            </div>
          </div>

          {/* Multi-Family Membership Notice (e.g., grannies in both grandfather 1k and granny 6k) */}
          {word.bncMemberships && word.bncMemberships.length > 1 && (
            <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-xs space-y-1.5">
              <div className="font-semibold text-amber-800 dark:text-amber-300">
                跨词族多重归属（共现于 {word.bncMemberships.length} 个 BNC/COCA 词族）
              </div>
              <div className="flex flex-wrap gap-1.5">
                {word.bncMemberships.map((m) => (
                  <button
                    key={m.familyId}
                    type="button"
                    onClick={() => onInspectFamily(m.familyId, word.id)}
                    className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] font-mono-tabular text-[11px] text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span className="font-semibold text-[var(--accent-primary)]">{m.band}</span>
                    <span translate="no" className="font-serif-lexicon font-semibold">
                      {m.headword}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      (该族内频次 {m.frequency.toLocaleString()})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* BNC/COCA Family Member Spectrum — Container-Width Adaptive Layout */}
          {family && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-[var(--text-secondary)] min-w-0 truncate">
                  词族{' '}
                  <strong translate="no" className="font-serif-lexicon text-[var(--text-primary)]">
                    {family.headword}
                  </strong>{' '}
                  成员分布 ({masteredFamilyMembersCount}/{family.members.length} 已掌握)
                </div>
                <button
                  type="button"
                  onClick={() => onInspectFamily(family.id, word.id)}
                  className="text-xs font-medium text-[var(--accent-primary)] hover:underline inline-flex items-center gap-0.5 cursor-pointer shrink-0 focus-ring rounded"
                >
                  <span>词族全景</span>
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] overflow-hidden">
                {family.members.map((member) => {
                  const shareDetail = getIntraFamilyShareDetail(
                    member.frequency,
                    family.totalFrequency
                  );
                  const isCurrent = member.normalized === word.id;
                  const memberRec = allUserRecordsMap.get(member.normalized);
                  const memberStatus = memberRec?.status || 'unrated';
                  const memberStatusMeta = LEARNING_STATUS_META[memberStatus];

                  return (
                    <button
                      key={member.normalized}
                      type="button"
                      onClick={() => onSelectWordById(member.normalized)}
                      className={`w-full px-3 py-2 text-left transition-colors cursor-pointer block space-y-1 ${
                        isCurrent
                          ? 'bg-[var(--accent-soft)] font-semibold'
                          : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {/* Row 1: Member word + role tags on left; exact frequency + share % + independent status badge on right */}
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span
                            translate="no"
                            className="font-serif-lexicon text-xs text-[var(--text-primary)] truncate"
                          >
                            {member.word}
                          </span>
                          {member.isHeadword && (
                            <span className="text-[10px] font-mono-tabular px-1 py-0.2 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] shrink-0">
                              {isCompactDrawer ? '首' : '首词'}
                            </span>
                          )}
                          {member.frequency === 0 && (
                            <span className="text-[10px] font-mono-tabular text-amber-700 dark:text-amber-300 shrink-0">
                              0频
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 font-mono-tabular text-[11px]">
                          <span
                            className="text-[var(--text-secondary)]"
                            title="该词形在语料库中的实测频次"
                          >
                            {member.frequency.toLocaleString()}
                          </span>
                          <span
                            className="text-[var(--text-muted)] w-8 text-right"
                            title="族内词形频次占比"
                          >
                            {shareDetail.label}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-sans font-medium shrink-0 ${
                              memberStatus !== 'unrated'
                                ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                                : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {memberStatusMeta.shortLabel}
                          </span>
                        </div>
                      </div>

                      {/* Row 2: Faithful Intra-Family Share Bar (0% for zero freq, 2px hairline for <1% non-zero, true % otherwise) */}
                      <div className="h-1 w-full bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-[var(--accent-primary)] rounded-full ${
                            shareDetail.isUltraLowNonZero ? 'min-w-[2px]' : ''
                          }`}
                          style={{
                            width: `${shareDetail.exactPct !== null ? shareDetail.exactPct : 0}%`,
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Related Phrase Core Word Fallback */}
          {!family && word.relatedPhraseCoreWord && (
            <div className="flex items-center justify-between text-xs py-1">
              <span className="text-[var(--text-secondary)]">
                短语核心词:{' '}
                <strong translate="no" className="font-serif-lexicon text-[var(--text-primary)]">
                  {word.relatedPhraseCoreWord}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => onSelectWordById(word.relatedPhraseCoreWord!)}
                className="text-[var(--accent-primary)] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
              >
                <span>查看核心词族</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {/* SECTION 3: CET2016 Official Syllabus Provenance & Change History */}
        <div className="px-4 sm:px-5 py-3.5 space-y-3">
          {word.inCet && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-[var(--text-secondary)]">
                CET2016 官方大纲溯源
              </div>
              {word.cetRefs.map((ref, idx) => (
                <div
                  key={`${ref.entryId}-${idx}`}
                  className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between text-[var(--text-muted)] font-mono-tabular text-[11px]">
                    <span>
                      {ref.level} · 行 #{ref.lineNumber}
                    </span>
                    <span>
                      {ref.role === 'headword'
                        ? '主词条'
                        : ref.role === 'derivative'
                          ? '同词目派生'
                          : '拼写变体'}
                    </span>
                  </div>
                  <div
                    translate="no"
                    className="font-mono-tabular text-[var(--text-primary)] break-all"
                  >
                    {ref.rawLine.replace(/\t/g, '  ⇥  ')}
                  </div>
                  {ref.peerForms.length > 1 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {ref.peerForms.map((peer) => {
                        const isSelf = peer.toLowerCase() === word.id;
                        return (
                          <button
                            key={peer}
                            type="button"
                            translate="no"
                            onClick={() => {
                              if (!isSelf) onSelectWordById(peer.toLowerCase());
                            }}
                            className={`px-1.5 py-0.5 rounded font-serif-lexicon text-xs border transition-colors ${
                              isSelf
                                ? 'bg-[var(--accent-soft)] border-[var(--accent-primary)] text-[var(--accent-primary)] font-semibold cursor-default'
                                : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] cursor-pointer'
                            }`}
                          >
                            {peer}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Compact Collapsible Change History */}
          {wordLogs.length > 0 && (
            <details className="group text-xs">
              <summary className="cursor-pointer font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-between py-1 list-none">
                <span>最近状态变更记录 ({wordLogs.length})</span>
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-2 space-y-1.5 pl-2 border-l border-[var(--border-subtle)]">
                {wordLogs.slice(0, 8).map((log) => (
                  <div
                    key={log.id}
                    className="text-[11px] flex items-center justify-between text-[var(--text-secondary)]"
                  >
                    <span>
                      {log.actionType === 'status_change' || log.actionType === 'batch_import'
                        ? `${LEARNING_STATUS_META[log.previousStatus || 'unrated'].shortLabel} → ${
                            LEARNING_STATUS_META[log.newStatus || 'unrated'].shortLabel
                          }`
                        : log.actionType === 'study_touch'
                          ? '复习打卡记录'
                          : log.actionType === 'tags_change'
                            ? '更新标签'
                            : '更新笔记'}
                    </span>
                    <span className="font-mono-tabular text-[var(--text-muted)]">
                      {new Date(log.timestamp).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );

  // Single-instance responsive rendering (prevents duplicate IDs and state desync across viewports)
  if (!overlayOnDesktop) {
    return (
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] flex flex-col justify-end md:flex-row md:justify-end xl:static xl:inset-auto xl:z-20 xl:bg-transparent xl:backdrop-blur-none xl:block xl:w-[360px] 2xl:w-[390px] xl:shrink-0 xl:h-full"
        onClick={async () => {
          if (!(await flushDirtyNotesIfNeeded())) return;
          onClose();
        }}
      >
        <aside
          ref={drawerRef}
          aria-label="词条详情"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-h-[86dvh] md:max-h-none md:h-full md:w-[380px] xl:w-full rounded-t-2xl md:rounded-none overflow-hidden border-t md:border-t-0 md:border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl xl:shadow-none grid grid-rows-[auto_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] select-text"
        >
          <div className="pt-2 pb-1 flex justify-center bg-[var(--bg-surface)] md:hidden">
            <div className="w-10 h-1 rounded-full bg-[var(--border-strong)]" />
          </div>
          {inspectorBody}
        </aside>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] flex flex-col justify-end md:flex-row md:justify-end"
      onClick={async () => {
        if (!(await flushDirtyNotesIfNeeded())) return;
        onClose();
      }}
    >
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="词条详情"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[86dvh] md:max-h-none md:h-full md:w-[380px] xl:w-[400px] rounded-t-2xl md:rounded-none overflow-hidden border-t md:border-t-0 md:border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl grid grid-rows-[auto_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] select-text"
      >
        <div className="pt-2 pb-1 flex justify-center bg-[var(--bg-surface)] md:hidden">
          <div className="w-10 h-1 rounded-full bg-[var(--border-strong)]" />
        </div>
        {inspectorBody}
      </aside>
    </div>
  );
};
