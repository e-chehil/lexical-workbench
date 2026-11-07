import React, { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Plus,
  ArrowUpRight,
  ChevronRight,
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
  onSaveTagsAndNotes: (wordId: string, wordDisplay: string, tags: string[], notes: string) => void;
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

  useEffect(() => {
    if (word) {
      setTags(userRecord?.tags || []);
      setNotes(userRecord?.notes || '');
      setNewTagInput('');
      setNotesDirty(false);
    }
  }, [word?.id, userRecord]);

  if (!word) return null;

  const currentStatus: LearningStatus = userRecord?.status || 'unrated';
  const enabledDicts = dictionaries.filter((d) => d.enabled);

  const handleCopyWord = () => {
    navigator.clipboard?.writeText(word.word).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleAddTag = (tagToAdd: string) => {
    const clean = tagToAdd.trim().replace(/^#/, '');
    if (!clean) return;
    if (!tags.includes(clean)) {
      const next = [...tags, clean];
      setTags(next);
      onSaveTagsAndNotes(word.id, word.word, next, notes);
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const next = tags.filter((t) => t !== tagToRemove);
    setTags(next);
    onSaveTagsAndNotes(word.id, word.word, next, notes);
  };

  const handleSaveNotes = () => {
    if (!notesDirty) return;
    onSaveTagsAndNotes(word.id, word.word, tags, notes);
    setNotesDirty(false);
  };

  const familyPct =
    word.formFrequency !== null &&
    word.familyFrequency !== null &&
    word.familyFrequency > 0
      ? ((word.formFrequency / word.familyFrequency) * 100).toFixed(1)
      : null;

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

  const inspectorBody = (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-surface)] text-[var(--text-primary)]">
      {/* Top Entry Header */}
      <div className="px-5 pt-4 pb-3.5 border-b border-[var(--border-subtle)] space-y-3 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2
                translate="no"
                className="text-3xl font-serif-lexicon font-semibold tracking-tight text-[var(--text-primary)] break-words"
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

            {/* Unboxed Metadata Line (Zero Static Pill Clutter) */}
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
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0 focus-ring"
            aria-label="关闭详情面板"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* 5-Segment Status Selector (Clean Segmented Control, Zero Decorative Dots) */}
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
                onClick={() => onStatusChange(word.id, word.word, st)}
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
      </div>

      {/* Authoritative Dictionary Bar (Hairline Grid instead of Floating Pills) */}
      {enabledDicts.length > 0 && (
        <div className="grid grid-cols-3 divide-x divide-y divide-[var(--border-subtle)] border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] shrink-0">
          {enabledDicts.slice(0, 6).map((dict) => (
            <a
              key={dict.id}
              href={buildDictionaryUrl(dict.urlTemplate, word.word)}
              target="_blank"
              rel="noopener noreferrer"
              className="py-1.5 px-2 flex items-center justify-center gap-1 font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-surface)] transition-colors whitespace-nowrap truncate focus-ring"
              title={`在 ${dict.name} 查询 ${word.word}`}
            >
              <span className="truncate">{dict.shortName}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" aria-hidden="true" />
            </a>
          ))}
        </div>
      )}

      {/* Scrollable Sheet Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] overscroll-contain">
        {/* 2-Column Corpus Metrics Split */}
        <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)]">
          <div className="px-5 py-3">
            <div className="text-[11px] text-[var(--text-muted)]">词形频次</div>
            <div className="text-xl font-mono-tabular font-semibold text-[var(--text-primary)] mt-0.5 flex items-baseline gap-1.5">
              <span>
                {word.formFrequency !== null ? word.formFrequency.toLocaleString() : '—'}
              </span>
              {familyPct !== null && (
                <span className="text-xs font-normal text-[var(--text-muted)]">
                  ({familyPct}%)
                </span>
              )}
            </div>
          </div>

          <div className="px-5 py-3">
            <div className="text-[11px] text-[var(--text-muted)]">词族总频次</div>
            <div className="text-xl font-mono-tabular font-semibold text-[var(--text-primary)] mt-0.5 flex items-baseline gap-1.5">
              <span>
                {word.familyFrequency !== null ? word.familyFrequency.toLocaleString() : '—'}
              </span>
              {word.headword && (
                <button
                  type="button"
                  translate="no"
                  onClick={() => word.familyId && onInspectFamily(word.familyId, word.id)}
                  className="text-xs font-normal text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  {word.headword} ↗
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Concise CET Syllabus Chain (Only if in CET, preserving official raw notation without ★) */}
        {word.cetRefs.length > 0 && (
          <div className="px-5 py-3 space-y-1.5 bg-[var(--bg-canvas)]/60">
            {word.cetRefs.map((ref) => {
              const cleanTarget = ref.rawMember.replace(/^★/, '');
              const chainTokens = ref.rawLine
                .split('\t')
                .map((s) => s.trim().replace(/^★/, ''))
                .filter(Boolean);
              return (
                <div
                  key={`${ref.entryId}_${ref.rawMember}`}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <div className="font-mono-tabular text-[var(--text-primary)] truncate">
                    {chainTokens.map((sib, idx) => (
                      <React.Fragment key={`${sib}_${idx}`}>
                        {idx > 0 && <span className="text-[var(--text-muted)] mx-1.5">→</span>}
                        <span
                          translate="no"
                          className={
                            sib === cleanTarget
                              ? 'font-semibold text-[var(--accent-primary)] underline underline-offset-4'
                              : 'text-[var(--text-secondary)]'
                          }
                        >
                          {sib}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                  <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] shrink-0">
                    {ref.level === 'CET6' ? 'CET-6' : 'CET-4'} #{ref.lineNumber}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Word Family Members Spectrum */}
        {family && (
          <div className="py-3">
            <div className="px-5 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-[var(--text-primary)]">
                  词族成员频次谱
                </span>
                <span className="font-mono-tabular text-[var(--text-muted)]">
                  · 已掌握 {masteredFamilyMembersCount}/{family.members.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onInspectFamily(family.id, word.id)}
                className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer inline-flex items-center gap-0.5 focus-ring rounded"
              >
                <span>词族矩阵</span>
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="divide-y divide-[var(--border-subtle)]/60 border-t border-[var(--border-subtle)]">
              {family.members.map((mem) => {
                const memRec = allUserRecordsMap.get(mem.normalized);
                const memStatus: LearningStatus = memRec?.status || 'unrated';
                const memMeta = LEARNING_STATUS_META[memStatus];
                const isCurrent = mem.normalized === word.id;
                const barWidth =
                  family.totalFrequency > 0
                    ? Math.max(2, Math.round((mem.frequency / family.totalFrequency) * 100))
                    : 0;

                return (
                  <div
                    key={`${mem.normalized}_${mem.isHeadword}`}
                    className={`px-5 py-1.5 grid grid-cols-[minmax(110px,1.4fr)_64px_64px_46px] items-center gap-2 text-xs transition-colors ${
                      isCurrent
                        ? 'bg-[var(--accent-soft)] font-semibold'
                        : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        type="button"
                        translate="no"
                        onClick={() => onSelectWordById(mem.normalized)}
                        className="font-mono-tabular text-[var(--text-primary)] hover:text-[var(--accent-primary)] truncate text-left cursor-pointer focus-ring rounded"
                      >
                        {mem.word}
                      </button>
                      {mem.isHeadword && (
                        <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                          词头
                        </span>
                      )}
                    </div>

                    <div className="h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent-primary)]"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <span className="font-mono-tabular text-[11px] text-[var(--text-secondary)] text-right">
                      {mem.frequency.toLocaleString()}
                    </span>

                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onStatusChange(
                            mem.normalized,
                            mem.word,
                            memStatus === 'mastered' ? 'unrated' : 'mastered'
                          )
                        }
                        className={`text-[11px] font-medium cursor-pointer focus-ring rounded px-1 py-0.5 ${
                          memStatus === 'mastered'
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            : memStatus === 'learning'
                              ? 'text-blue-700 dark:text-blue-400'
                              : memStatus === 'queued'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                        title="点击切换已掌握"
                      >
                        {memMeta.shortLabel}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Personal Tags, Notes & Collections */}
        <div className="px-5 py-4 space-y-3.5">
          {/* Tags */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 font-mono-tabular text-[var(--accent-primary)] font-medium"
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
                className="inline-flex items-center flex-1 min-w-[130px]"
              >
                <input
                  type="text"
                  name="word-new-tag"
                  aria-label="添加个人标签"
                  autoComplete="off"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="+ 添加标签 (回车)…"
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
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="inspector-word-notes"
                className="text-xs font-medium text-[var(--text-secondary)]"
              >
                助记笔记与真题搭配
              </label>
              {notesDirty && (
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="text-xs font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  保存修改
                </button>
              )}
            </div>
            <textarea
              id="inspector-word-notes"
              name="word-notes"
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesDirty(true);
              }}
              onBlur={handleSaveNotes}
              placeholder="记录真题例句、搭配或易混辨析…"
              className="w-full p-2.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus-ring resize-y"
            />
          </div>

          {/* Static Collections Quick Toggle */}
          {staticCollections.length > 0 && (
            <div className="pt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--text-muted)]">归入词集:</span>
              {staticCollections.map((col) => {
                const inCol = col.wordIds.includes(word.id);
                return (
                  <button
                    key={col.id}
                    type="button"
                    aria-pressed={inCol}
                    onClick={() => onAddWordToCollection(col.id, word.id)}
                    className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors cursor-pointer inline-flex items-center gap-1 focus-ring ${
                      inCol
                        ? 'bg-[var(--accent-soft)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                        : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {inCol ? (
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

          {/* Optional Modification History Disclosure */}
          {wordLogs.length > 0 && (
            <details className="group pt-1 text-xs">
              <summary className="cursor-pointer list-none inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] select-none">
                <ChevronRight
                  className="w-3.5 h-3.5 transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                <span>变更历史 ({wordLogs.length})</span>
              </summary>
              <div className="mt-2 space-y-1 pl-3 border-l border-[var(--border-subtle)]">
                {wordLogs.slice(0, 6).map((log) => (
                  <div
                    key={log.id}
                    className="text-[11px] flex items-center justify-between text-[var(--text-secondary)]"
                  >
                    <span>
                      {log.actionType === 'status_change' || log.actionType === 'batch_import'
                        ? `${LEARNING_STATUS_META[log.previousStatus || 'unrated'].shortLabel} → ${
                            LEARNING_STATUS_META[log.newStatus || 'unrated'].shortLabel
                          }`
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

  return (
    <>
      {/* Desktop Docked Inspector (lg+ in ExploreView, or Overlay when overlayOnDesktop is true) */}
      {overlayOnDesktop ? (
        <div
          className="hidden lg:grid fixed inset-0 z-40 grid-cols-12 bg-black/25 backdrop-blur-[1px]"
          onClick={onClose}
        >
          <aside
            aria-label="词条详情"
            onClick={(e) => e.stopPropagation()}
            className="col-start-9 xl:col-start-10 col-end-13 border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl grid grid-rows-[minmax(0,1fr)] h-full min-h-0 select-text"
          >
            {inspectorBody}
          </aside>
        </div>
      ) : (
        <aside
          aria-label="词条详情"
          className="hidden lg:grid lg:w-[340px] xl:w-[390px] shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] grid-rows-[minmax(0,1fr)] h-full min-h-0 select-text z-20"
        >
          {inspectorBody}
        </aside>
      )}

      {/* Tablet Slide-Over Sheet (768px - 1023px) */}
      <div
        className="hidden md:grid lg:hidden fixed inset-0 z-40 grid-cols-12 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      >
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={`${word.word} 词条详情`}
          onClick={(e) => e.stopPropagation()}
          className="col-start-7 col-end-13 border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl grid grid-rows-[minmax(0,1fr)] h-full min-h-0 select-text"
        >
          {inspectorBody}
        </aside>
      </div>

      {/* Mobile Modal Bottom Sheet (< 768px) */}
      <div
        className="md:hidden fixed inset-0 z-40 grid grid-rows-[1fr_auto] bg-black/45 backdrop-blur-[1px]"
        onClick={onClose}
      >
        <div />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${word.word} 词条详情`}
          className="w-full max-h-[86dvh] rounded-t-2xl overflow-hidden bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] shadow-2xl grid grid-rows-[auto_minmax(0,1fr)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pt-2 pb-1 flex justify-center bg-[var(--bg-surface)]">
            <div className="w-10 h-1 rounded-full bg-[var(--border-strong)]" />
          </div>
          <div className="overflow-y-auto min-h-0">{inspectorBody}</div>
        </div>
      </div>
    </>
  );
};
