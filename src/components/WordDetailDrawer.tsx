import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ExternalLink,
  Layers,
  Tag,
  Plus,
  BookOpen,
  History,
  CheckCircle2,
  Bookmark,
  BarChart3,
  Network,
  Volume2,
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
import {
  buildDictionaryUrl,
} from '../data/searchAndFilter.ts';

function formatCompactFrequency(
  freq: number | null | undefined,
  inBnc: boolean,
  bncLinkedViaVariant?: boolean
): string {
  if (freq !== null && freq !== undefined) {
    return freq.toLocaleString();
  }
  if (bncLinkedViaVariant) return '变体映射';
  return inBnc ? '0' : '未收录';
}

interface WordDetailDrawerProps {
  word: LexiconWordItem | null;
  onClose: () => void;
  wordsMap: Map<string, LexiconWordItem>;
  familiesMap: Map<string, BncCocaFamily>;
  userRecord: UserWordRecord | undefined;
  allUserRecordsMap: Map<string, UserWordRecord>;
  collections: WordCollection[];
  dictionaries: DictionaryTemplate[];
  wordLogs: ActivityLogEntry[];
  onStatusChange: (wordId: string, wordDisplay: string, status: LearningStatus) => Promise<void>;
  onPosStatusChange?: (
    wordId: string,
    wordDisplay: string,
    pos: CocaRawPos,
    status: LearningStatus
  ) => Promise<void>;
  onTagsChange: (wordId: string, wordDisplay: string, tags: string[]) => Promise<void>;
  onNoteChange: (wordId: string, wordDisplay: string, note: string) => Promise<void>;
  onTouchStudyRecord: (wordId: string, wordDisplay: string) => Promise<void>;
  onToggleWordInCollection: (collectionId: string, wordId: string) => Promise<void>;
  onSelectWord: (word: LexiconWordItem) => void;
  onInspectFamily: (familyId: string, highlightWord?: string) => void;
}

const ALL_STATUSES: LearningStatus[] = ['unrated', 'queued', 'learning', 'mastered', 'deferred'];

const POS_BAR_COLORS: Record<string, string> = {
  noun: 'bg-blue-500',
  verb: 'bg-emerald-500',
  adjective: 'bg-amber-500',
  adverb: 'bg-purple-500',
  preposition: 'bg-indigo-500',
  pronoun: 'bg-teal-500',
  conjunction: 'bg-orange-500',
  determiner: 'bg-sky-500',
  article: 'bg-violet-500',
  number: 'bg-cyan-500',
  interjection: 'bg-rose-500',
  negation: 'bg-red-500',
  '+infinitive': 'bg-lime-500',
  existential: 'bg-fuchsia-500',
};

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
  const [noteText, setNoteText] = useState<string>('');
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [isNoteDirty, setIsNoteDirty] = useState<boolean>(false);
  const [showAllFamilyMembers, setShowAllFamilyMembers] = useState<boolean>(false);

  useEffect(() => {
    setNoteText(userRecord?.notes || '');
    setIsNoteDirty(false);
    setShowAllFamilyMembers(false);
  }, [word?.id, userRecord?.notes]);

  const family = useMemo(() => {
    if (!word?.familyId) return null;
    return familiesMap.get(word.familyId) || null;
  }, [word, familiesMap]);

  const familyMasteryStats = useMemo(() => {
    if (!family) return null;
    let mastered = 0;
    let learningOrQueued = 0;
    for (const m of family.members) {
      const rec = allUserRecordsMap.get(m.normalized);
      if (rec?.status === 'mastered') mastered++;
      else if (rec?.status === 'learning' || rec?.status === 'queued') learningOrQueued++;
    }
    return {
      total: family.members.length,
      mastered,
      learningOrQueued,
      pct: family.members.length > 0 ? Math.round((mastered / family.members.length) * 100) : 0,
    };
  }, [family, allUserRecordsMap]);

  const staticCollections = useMemo(
    () => collections.filter((c) => c.type === 'static' || c.type === 'study_plan'),
    [collections]
  );

  if (!word) return null;

  const currentStatus: LearningStatus = userRecord?.status || 'unrated';
  const currentTags = userRecord?.tags || [];
  const enabledDictionaries = dictionaries.filter((d) => d.enabled);
  const cocaLexemes = word.cocaLexemes || [];

  const speakWord = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.92;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTagInput.trim();
    if (!clean) return;
    if (!currentTags.includes(clean)) {
      await onTagsChange(word.id, word.word, [...currentTags, clean]);
    }
    setNewTagInput('');
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    await onTagsChange(
      word.id,
      word.word,
      currentTags.filter((t) => t !== tagToRemove)
    );
  };

  const handleSaveNote = async () => {
    if (!isNoteDirty) return;
    await onNoteChange(word.id, word.word, noteText);
    setIsNoteDirty(false);
  };

  return (
    <aside
      aria-label="词条综合详情面板"
      className="fixed xl:static top-12 bottom-12 md:bottom-0 right-0 z-40 xl:z-auto w-full sm:w-[410px] xl:w-[430px] shrink-0 h-[calc(100dvh-6rem)] md:h-[calc(100dvh-3rem)] xl:h-full bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] shadow-2xl xl:shadow-none flex flex-col overflow-hidden"
    >
      {/* 1. Sticky Header: Headword + Badges + Status Segmented Pill Bar */}
      <div className="px-4 pt-3.5 pb-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                translate="no"
                className="font-serif-lexicon text-2xl font-bold tracking-tight text-[var(--text-primary)] break-all"
              >
                {word.word}
              </h2>
              <button
                type="button"
                onClick={() => speakWord(word.word)}
                className="p-1.5 rounded-md bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
                title="朗读美式发音"
                aria-label={`朗读 ${word.word} 发音`}
              >
                <Volume2 className="w-4 h-4" />
              </button>
              {word.homographNumbers.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/12 text-amber-700 dark:text-amber-300 font-mono-tabular text-[11px] font-semibold">
                  同形异义 {word.homographNumbers.map((n) => `(${n})`).join(' ')}
                </span>
              )}
              {word.displayVariants.length > 1 && (
                <span
                  translate="no"
                  className="text-xs font-mono-tabular text-[var(--text-muted)]"
                >
                  变体: {word.displayVariants.filter((v) => v !== word.word).join(' / ')}
                </span>
              )}
            </div>

            {/* Compact Semantic Badges */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] font-mono-tabular">
              {word.isCet4 && (
                <span className="px-2 py-0.5 rounded-md font-semibold bg-teal-500/12 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                  CET-4 核心
                </span>
              )}
              {word.isCet6 && (
                <span className="px-2 py-0.5 rounded-md font-semibold bg-indigo-500/12 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                  CET-6 核心
                </span>
              )}
              {word.inCoca && word.cocaBestPosRank && (
                <span className="px-2 py-0.5 rounded-md font-semibold bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  COCA #{word.cocaBestPosRank.toLocaleString()}
                </span>
              )}
              {word.band && (
                <span className="px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                  BNC {word.band} {word.isHeadword ? '· 族首词' : `· 属 ${word.headword}`}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer shrink-0"
            title="关闭详情面板 (Esc)"
            aria-label="关闭详情面板"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Segmented Learning Status Pill Bar + Study Touch Action */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 grid grid-cols-5 p-0.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] gap-0.5">
            {ALL_STATUSES.map((st) => {
              const meta = LEARNING_STATUS_META[st];
              const active = currentStatus === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => onStatusChange(word.id, word.word, st)}
                  className={`py-1 px-1 rounded-md text-[11px] inline-flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] font-semibold shadow-2xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotClass}`} />
                  <span>{meta.shortLabel}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onTouchStudyRecord(word.id, word.word)}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="记录一次复习打卡"
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>打卡 ({userRecord?.studyCount || 0})</span>
          </button>
        </div>
      </div>

      {/* 2. Scrollable Stream Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-[var(--border-subtle)] text-xs">
        {/* Aligned 3-Column Corpus Metrics + 3x2 Flush Dictionary Matrix */}
        <div>
          {/* 3-Column Corpus Metric Strip */}
          <div className="grid grid-cols-3 bg-[var(--border-subtle)] gap-px border-b border-[var(--border-subtle)]">
            <div className="p-3 bg-[var(--bg-canvas)]">
              <div className="text-[10px] font-semibold text-[var(--text-muted)]">COCA 最优排名</div>
              <div className="font-mono-tabular font-bold text-sm text-blue-600 dark:text-blue-400 mt-0.5">
                {word.inCoca && word.cocaBestPosRank
                  ? `#${word.cocaBestPosRank.toLocaleString()}`
                  : word.cocaLinkedViaVariant
                    ? `→ ${word.cocaCanonicalVariant}`
                    : '未收录'}
              </div>
              <div className="text-[10px] font-mono-tabular text-[var(--text-muted)] mt-0.5 truncate">
                {word.inCoca
                  ? `总频 ${(word.cocaHeadwordTotalFreq || 0).toLocaleString()}`
                  : '无直接词元'}
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-canvas)]">
              <div className="text-[10px] font-semibold text-[var(--text-muted)]">BNC 词形实测</div>
              <div className="font-mono-tabular font-bold text-sm text-[var(--text-primary)] mt-0.5">
                {formatCompactFrequency(word.formFrequency, word.inBnc, word.bncLinkedViaVariant)}
              </div>
              <div className="text-[10px] font-mono-tabular text-[var(--text-muted)] mt-0.5 truncate">
                {word.band ? `Nation ${word.band} 频段` : 'BNC 未收录'}
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-canvas)]">
              <div className="text-[10px] font-semibold text-[var(--text-muted)]">BNC 词族总频</div>
              <div className="font-mono-tabular font-bold text-sm text-[var(--text-primary)] mt-0.5">
                {word.familyFrequency !== null ? word.familyFrequency.toLocaleString() : '—'}
              </div>
              <div className="text-[10px] font-mono-tabular text-[var(--text-muted)] mt-0.5 truncate">
                {word.headword ? `词头 ${word.headword} (${word.familyMemberCount || 1}词)` : '无所属词族'}
              </div>
            </div>
          </div>

          {/* 3x2 Six-Dictionary Flush Grid Matrix (Zero outer/inner spacing) */}
          {enabledDictionaries.length > 0 && (
            <div
              role="group"
              aria-label="权威词典直达矩阵"
              className="grid grid-cols-3 bg-[var(--border-subtle)] gap-px"
            >
              {enabledDictionaries.map((dict) => {
                const url = buildDictionaryUrl(dict.urlTemplate, word.word);
                return (
                  <a
                    key={dict.id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] hover:text-[var(--accent-primary)] flex items-center justify-between gap-1.5 transition-colors group"
                    title={`${dict.name} — ${dict.description}`}
                  >
                    <span className="font-semibold text-xs truncate">{dict.name}</span>
                    <ExternalLink
                      className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] shrink-0"
                      aria-hidden="true"
                    />
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Block B: COCA 2020 Multi-PoS Distribution & Per-PoS Status */}
        <section className="px-4 py-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
              <span>COCA 词性分布 ({cocaLexemes.length})</span>
            </h3>
            {word.inCoca && word.cocaHeadwordDerivedRank && (
              <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                词头总排 #{word.cocaHeadwordDerivedRank.toLocaleString()}
              </span>
            )}
          </div>

          {cocaLexemes.length > 0 ? (
            <div className="space-y-2.5">
              {/* Proportional Stacked Bar */}
              {cocaLexemes.length > 1 && (
                <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-[var(--bg-subtle)]">
                  {cocaLexemes.map((lex) => (
                    <div
                      key={lex.lexemeId}
                      style={{ width: `${Math.max(4, lex.sharePct)}%` }}
                      className={`${POS_BAR_COLORS[lex.pos] || 'bg-slate-500'} h-full`}
                      title={`${lex.posZh}: #${lex.rank} (${lex.sharePct.toFixed(1)}%)`}
                    />
                  ))}
                </div>
              )}

              {/* Edge-to-Edge Hairline Rows for Each PoS Lexeme */}
              <div className="divide-y divide-[var(--border-subtle)] border-t border-b border-[var(--border-subtle)] -mx-4">
                {cocaLexemes.map((lex) => {
                  const posMeta = COCA_POS_META[lex.pos];
                  const posStatus: LearningStatus =
                    userRecord?.posStatuses?.[lex.pos] || userRecord?.status || 'unrated';
                  const posStatusMeta = LEARNING_STATUS_META[posStatus];

                  return (
                    <div
                      key={lex.lexemeId}
                      className="px-4 py-2 bg-[var(--bg-surface)] flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-mono-tabular font-semibold shrink-0 ${
                            posMeta?.badgeClass || ''
                          }`}
                        >
                          {posMeta?.shortLabel || lex.pos}
                        </span>
                        <span className="font-mono-tabular font-bold text-blue-600 dark:text-blue-400">
                          #{lex.rank.toLocaleString()}
                        </span>
                        <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] truncate">
                          {lex.frequency.toLocaleString()} 次 ({Math.round(lex.sharePct)}%)
                        </span>
                      </div>

                      {onPosStatusChange && (
                        <select
                          aria-label={`${word.word} 作为 ${posMeta?.shortZh || lex.pos} 的掌握状态`}
                          value={userRecord?.posStatuses?.[lex.pos] || 'unrated'}
                          onChange={(e) =>
                            onPosStatusChange(
                              word.id,
                              word.word,
                              lex.pos,
                              e.target.value as LearningStatus
                            )
                          }
                          className={`appearance-none text-center px-2 py-0.5 rounded-md text-[10px] font-semibold border cursor-pointer shrink-0 ${posStatusMeta.badgeClass}`}
                        >
                          {ALL_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {LEARNING_STATUS_META[st].shortLabel}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : word.cocaLinkedViaVariant && word.cocaCanonicalVariant ? (
            <div className="py-1 flex items-center justify-between gap-2 text-[var(--text-secondary)]">
              <span>
                当前拼写为英美或考纲并列变体，COCA 词元记录归入{' '}
                <strong translate="no" className="font-serif-lexicon text-[var(--text-primary)]">
                  {word.cocaCanonicalVariant}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  const target = wordsMap.get(word.cocaCanonicalVariant!.toLowerCase());
                  if (target) onSelectWord(target);
                }}
                className="px-2 py-1 rounded-md bg-[var(--accent-primary)] text-white text-[11px] font-semibold shrink-0 cursor-pointer"
              >
                查看主词头 →
              </button>
            </div>
          ) : (
            <p className="text-[var(--text-muted)] leading-relaxed">
              该词形未独立进入 COCA Top 60,000 词元表（通常为派生屈折词形，请参考下方 BNC 词族首词）。
            </p>
          )}
        </section>

        {/* Block C: BNC/COCA Word Family Structure */}
        {family && familyMasteryStats && (
          <section className="px-4 py-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                <span>
                  BNC 词族网络 ·{' '}
                  <strong translate="no" className="font-serif-lexicon text-[var(--accent-primary)]">
                    {family.headword}
                  </strong>{' '}
                  ({family.band})
                </span>
              </h3>
              <button
                type="button"
                onClick={() => onInspectFamily(family.id, word.id)}
                className="text-[11px] font-semibold text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Network className="w-3 h-3" />
                <span>词族全景 →</span>
              </button>
            </div>

            {/* Family Mastery Progress Bar */}
            <div className="flex items-center gap-2 text-[11px]">
              <div className="flex-1 h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full"
                  style={{ width: `${familyMasteryStats.pct}%` }}
                />
              </div>
              <span className="font-mono-tabular text-[var(--text-secondary)] shrink-0">
                已掌握 {familyMasteryStats.mastered}/{familyMasteryStats.total} ({familyMasteryStats.pct}%)
              </span>
            </div>

            {/* Family Members */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {(showAllFamilyMembers ? family.members : family.members.slice(0, 14)).map((m) => {
                const isCurrent = m.normalized === word.id;
                const mItem = wordsMap.get(m.normalized);
                const mRec = allUserRecordsMap.get(m.normalized);
                const isMastered = mRec?.status === 'mastered';

                return (
                  <button
                    key={m.normalized}
                    type="button"
                    translate="no"
                    onClick={() => mItem && onSelectWord(mItem)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono-tabular inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-[var(--accent-primary)] text-white font-semibold'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)]'
                    }`}
                  >
                    <span className="font-serif-lexicon">{m.word}</span>
                    <span className={`text-[10px] ${isCurrent ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>
                      {m.frequency.toLocaleString()}
                    </span>
                    {isMastered && !isCurrent && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    )}
                  </button>
                );
              })}
              {family.members.length > 14 && (
                <button
                  type="button"
                  onClick={() => setShowAllFamilyMembers((v) => !v)}
                  className="px-2 py-1 rounded-md text-[11px] text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] font-semibold cursor-pointer"
                >
                  {showAllFamilyMembers ? '收起' : `+展开全部 ${family.members.length} 词`}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Block D: CET2016 Syllabus Context & Sibling Forms (Clean learner view without line numbers or raw source dumps) */}
        {word.inCet && word.cetRefs.length > 0 && (
          <section className="px-4 py-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-teal-500" />
                <span>大学英语考纲同组词与派生</span>
              </h3>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                word.isCet6 && !word.isCet4
                  ? 'bg-indigo-500/12 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                  : 'bg-teal-500/12 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300'
              }`}>
                {word.isCet4 && word.isCet6 ? 'CET-4 / CET-6' : word.isCet6 ? 'CET-6 六级' : 'CET-4 四级'}
              </span>
            </div>

            <div className="space-y-2">
              {word.cetRefs.map((ref, idx) => (
                <div
                  key={`${ref.entryId}-${idx}`}
                  className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[var(--text-secondary)]">
                      {ref.level === 'CET6' ? '六级考纲词群' : '四级考纲词群'}
                      {ref.homographNumber !== null ? ` · 同形词义 (${ref.homographNumber})` : ''}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {ref.role === 'headword' ? '核心主词' : '同组派生/变体'}
                    </span>
                  </div>

                  {ref.peerForms.length > 1 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ref.peerForms.map((pf) => {
                        const peerWord = wordsMap.get(pf.toLowerCase());
                        const isSelf = pf.toLowerCase() === word.id;
                        return (
                          <button
                            key={pf}
                            type="button"
                            translate="no"
                            onClick={() => peerWord && onSelectWord(peerWord)}
                            className={`px-2.5 py-0.5 rounded-md font-serif-lexicon text-xs transition-colors cursor-pointer ${
                              isSelf
                                ? 'bg-[var(--accent-primary)] text-white font-semibold'
                                : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]'
                            }`}
                          >
                            {pf}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[var(--text-muted)]">
                      该词目在考纲中作为独立词条收录，无并列派生词。
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Block E: Personal Tags, Collections & Notes */}
        <section className="px-4 py-3.5 space-y-3">
          <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <Bookmark className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>个人标签、词集与学习笔记</span>
          </h3>

          {/* Tags */}
          <div className="flex flex-wrap items-center gap-1.5">
            {currentTags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[11px] font-medium inline-flex items-center gap-1"
              >
                <Tag className="w-2.5 h-2.5" />
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-rose-500 cursor-pointer"
                  aria-label={`移除标签 ${tag}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}

            <form onSubmit={handleAddTag} className="inline-flex items-center gap-1">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="+ 新标签…"
                aria-label="添加新标签"
                className="w-24 px-2 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] text-[var(--text-primary)]"
              />
              {newTagInput.trim() && (
                <button
                  type="submit"
                  className="p-1 rounded-md bg-[var(--accent-primary)] text-white cursor-pointer"
                  aria-label="确认添加标签"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </form>
          </div>

          {/* Static Collections Membership */}
          {staticCollections.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[var(--text-muted)] mr-0.5">所属词集:</span>
              {staticCollections.map((col) => {
                const inCol = col.wordIds.includes(word.id);
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => onToggleWordInCollection(col.id, word.id)}
                    className={`px-2 py-0.5 rounded-md text-[11px] transition-colors cursor-pointer ${
                      inCol
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {inCol ? '✓ ' : '+ '}
                    {col.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Study Notes */}
          <div className="space-y-1.5">
            <textarea
              rows={3}
              value={noteText}
              onChange={(e) => {
                setNoteText(e.target.value);
                setIsNoteDirty(true);
              }}
              onBlur={handleSaveNote}
              placeholder="记录易混辨析、典型搭配、真题例句或记忆线索（失焦自动保存）…"
              aria-label="个人学习笔记"
              className="w-full p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] resize-y"
            />
            {isNoteDirty && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="px-2.5 py-1 rounded-md bg-[var(--accent-primary)] text-white text-[11px] font-semibold cursor-pointer"
                >
                  保存笔记
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Block F: Recent Activity History */}
        {wordLogs.length > 0 && (
          <section className="px-4 py-3.5 space-y-2">
            <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span>变更轨迹 ({wordLogs.length})</span>
            </h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {wordLogs.slice(0, 8).map((log) => (
                <div
                  key={log.id}
                  className="text-[11px] flex items-center justify-between text-[var(--text-muted)] py-0.5"
                >
                  <span className="truncate">
                    {log.actionType === 'status_change'
                      ? `状态: ${log.previousStatus || '未评'} → ${log.newStatus}`
                      : log.actionType === 'pos_status_change'
                        ? `[${log.targetPos}] 状态 → ${log.newStatus}`
                        : log.sourceLabel || log.actionType}
                  </span>
                  <span className="font-mono-tabular shrink-0 ml-2">
                    {new Date(log.timestamp).toLocaleDateString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
};
