import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Undo2,
  Download,
  Check,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  ActivityLogEntry,
  LEARNING_STATUS_META,
  LearningStatus,
  LexiconWordItem,
  UserWordRecord,
} from '../data/types.ts';
import { parseBatchInputText } from '../data/searchAndFilter.ts';

interface BatchAndActivityViewProps {
  words: LexiconWordItem[];
  wordsMap: Map<string, LexiconWordItem>;
  userRecordsMap: Map<string, UserWordRecord>;
  activityLogs: ActivityLogEntry[];
  onExecuteBatchImport: (
    items: {
      wordId: string;
      word: string;
      status?: LearningStatus;
      tagsToAdd?: string[];
      noteToAppend?: string;
    }[],
    options: {
      defaultStatus: LearningStatus;
      commonTags: string[];
      sourceLabel: string;
      customTimestamp?: string;
    }
  ) => Promise<{ batchId: string; updatedCount: number }>;
  onRollbackBatch: (batchId: string) => Promise<number>;
  onUndoSingleLog: (logId: number) => Promise<void>;
  onSelectWord: (word: LexiconWordItem) => void;
  onExportLogsCsv: () => void;
}

const SAMPLE_BATCH_TEXT = `able\t已掌握\t核心词,高频\t基础四级词
abilities
owing to\t学习中\t短语搭配\t注意后接名词或动名词
baby boom\t待学\t阅读高频
appropriate\t学习中\t同形异义词\t区分形容词与动词用法
advisor\t已掌握\t英美变体
colour
accountancy\t待学\t派生词`;

const ALL_STATUSES: LearningStatus[] = ['queued', 'learning', 'mastered', 'deferred', 'unrated'];

export const BatchAndActivityView: React.FC<BatchAndActivityViewProps> = ({
  words,
  wordsMap,
  userRecordsMap,
  activityLogs,
  onExecuteBatchImport,
  onRollbackBatch,
  onUndoSingleLog,
  onSelectWord,
  onExportLogsCsv,
}) => {
  const [rightTab, setRightTab] = useState<'preview' | 'logs'>('preview');
  const [mobilePane, setMobilePane] = useState<'input' | 'preview' | 'logs'>('input');
  const [rawInput, setRawInput] = useState<string>(SAMPLE_BATCH_TEXT);
  const [defaultStatus, setDefaultStatus] = useState<LearningStatus>('mastered');
  const [commonTagsStr, setCommonTagsStr] = useState<string>('');
  const [sourceLabel, setSourceLabel] = useState<string>('外部词表同步');
  const [customDate, setCustomDate] = useState<string>('');
  const [selectedCandidateMap, setSelectedCandidateMap] = useState<Record<number, string>>({});
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [lastBatchResult, setLastBatchResult] = useState<{
    batchId: string;
    updatedCount: number;
  } | null>(null);

  const [logSearch, setLogSearch] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState<string>('all');

  const parsedRows = useMemo(() => {
    return parseBatchInputText(rawInput, wordsMap, words);
  }, [rawInput, wordsMap, words]);

  const summary = useMemo(() => {
    let exact = 0;
    let variant = 0;
    let homograph = 0;
    let unmatched = 0;
    let readyCount = 0;

    parsedRows.forEach((row, idx) => {
      if (row.matchStatus === 'matched_exact') exact++;
      else if (row.matchStatus === 'matched_variant') variant++;
      else if (row.matchStatus === 'ambiguous_homograph') homograph++;
      else unmatched++;

      const targetId = selectedCandidateMap[idx] || row.matchedWord?.id;
      if (!excludedRows.has(idx) && !row.isDuplicateInBatch && targetId) {
        readyCount++;
      }
    });

    return { exact, variant, homograph, unmatched, readyCount };
  }, [parsedRows, selectedCandidateMap, excludedRows]);

  const handleToggleExclude = (idx: number) => {
    setExcludedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCommitBatch = async () => {
    const itemsToUpdate: {
      wordId: string;
      word: string;
      status?: LearningStatus;
      tagsToAdd?: string[];
      noteToAppend?: string;
    }[] = [];

    parsedRows.forEach((row, idx) => {
      if (excludedRows.has(idx) || row.isDuplicateInBatch) return;
      const targetId = selectedCandidateMap[idx] || row.matchedWord?.id;
      if (!targetId) return;
      const w = wordsMap.get(targetId);
      if (!w) return;

      itemsToUpdate.push({
        wordId: w.id,
        word: w.word,
        status: row.parsedStatus,
        tagsToAdd: row.parsedTags,
        noteToAppend: row.parsedNote,
      });
    });

    if (itemsToUpdate.length === 0) return;

    const commonTags = commonTagsStr
      .split(/[,，;；]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await onExecuteBatchImport(itemsToUpdate, {
      defaultStatus,
      commonTags,
      sourceLabel: sourceLabel.trim() || '批量导入',
      customTimestamp: customDate ? new Date(customDate).toISOString() : undefined,
    });

    setLastBatchResult(res);
  };

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return activityLogs.filter((log) => {
      if (logTypeFilter !== 'all' && log.actionType !== logTypeFilter) return false;
      if (q) {
        return (
          log.word.toLowerCase().includes(q) ||
          (log.sourceLabel || '').toLowerCase().includes(q) ||
          (log.newTags || []).some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [activityLogs, logSearch, logTypeFilter]);

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 bg-[var(--bg-surface)] overflow-hidden">
      {/* Mobile Sub-View Switcher (<1024px) */}
      <div className="lg:hidden min-h-[40px] py-1.5 px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setMobilePane('input')}
          className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
            mobilePane === 'input'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
              : 'text-[var(--text-muted)]'
          }`}
        >
          批量输入 ({summary.readyCount} 就绪)
        </button>
        <button
          type="button"
          onClick={() => {
            setMobilePane('preview');
            setRightTab('preview');
          }}
          className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
            mobilePane === 'preview'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
              : 'text-[var(--text-muted)]'
          }`}
        >
          匹配消歧 ({parsedRows.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setMobilePane('logs');
            setRightTab('logs');
          }}
          className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
            mobilePane === 'logs'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
              : 'text-[var(--text-muted)]'
          }`}
        >
          变更历史 ({activityLogs.length})
        </button>
      </div>

      {/* Zone 1: Left Batch Input & Rules Pane (330px-390px) */}
      <aside
        className={`w-full lg:w-[330px] xl:w-[390px] lg:border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex-col shrink-0 flex-1 lg:flex-initial h-full min-h-0 overflow-y-auto ${
          mobilePane === 'input' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        <div className="p-3.5 sm:p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
              批量词表同步与导入
            </h2>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
              支持单列词表或 Tab 分隔（词条 / 状态 / 标签 / 笔记）
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setRawInput(SAMPLE_BATCH_TEXT);
                setExcludedRows(new Set());
                setRightTab('preview');
              }}
              className="px-2 py-1 rounded text-[11px] font-medium bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              填入示例
            </button>
            <button
              type="button"
              onClick={() => {
                setRawInput('');
                setExcludedRows(new Set());
              }}
              className="px-2 py-1 rounded text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              清空
            </button>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 flex-1 flex flex-col gap-3 min-h-0">
          <textarea
            aria-label="批量输入词表"
            value={rawInput}
            onChange={(e) => {
              setRawInput(e.target.value);
              setRightTab('preview');
            }}
            rows={9}
            placeholder={`每行一个单词或词组，例如：\nable\t已掌握\t核心词\t基础四级词\nowing to\t学习中\nbaby boom`}
            className="w-full flex-1 min-h-[150px] p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] resize-y leading-relaxed"
          />

          {/* Default Rules Grid */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1">
                默认赋予状态
              </label>
              <select
                value={defaultStatus}
                onChange={(e) => setDefaultStatus(e.target.value as LearningStatus)}
                className="w-full px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                {ALL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {LEARNING_STATUS_META[st].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1">
                来源标记
              </label>
              <input
                type="text"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder="如 Anki 同步"
                className="w-full px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1">
                统一附加标签
              </label>
              <input
                type="text"
                value={commonTagsStr}
                onChange={(e) => setCommonTagsStr(e.target.value)}
                placeholder="如 真题2025, 阅读"
                className="w-full px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1">
                记录日期 (选填)
              </label>
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleCommitBatch}
            disabled={summary.readyCount === 0}
            className="w-full py-2.5 px-4 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white rounded text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>写入词库 ({summary.readyCount} 词就绪)</span>
          </button>

          {lastBatchResult && (
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
              <span>已成功更新 {lastBatchResult.updatedCount} 条记录</span>
              <button
                type="button"
                onClick={async () => {
                  await onRollbackBatch(lastBatchResult.batchId);
                  setLastBatchResult(null);
                }}
                className="inline-flex items-center gap-1 font-semibold underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Undo2 className="w-3 h-3" />
                撤销此批次
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Zone 2: Right Structured Disambiguation Table & Activity Ledger */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 h-full bg-[var(--bg-surface)] overflow-hidden ${
          mobilePane !== 'input' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {/* Top Switcher Bar (Wraps cleanly without collision) */}
        <div className="min-h-[44px] py-2 px-4 sm:px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="hidden lg:flex items-center gap-4">
            <button
              type="button"
              onClick={() => setRightTab('preview')}
              className={`py-1 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                rightTab === 'preview'
                  ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>匹配与消歧预览</span>
              <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                ({parsedRows.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRightTab('logs')}
              className={`py-1 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                rightTab === 'logs'
                  ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>学习变更历史</span>
              <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                ({activityLogs.length})
              </span>
            </button>
          </div>

          {rightTab === 'preview' ? (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-mono-tabular text-[var(--text-secondary)]">
              <span className="whitespace-nowrap">精确匹配 {summary.exact}</span>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="whitespace-nowrap">变体映射 {summary.variant}</span>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="whitespace-nowrap">同形多义 {summary.homograph}</span>
              {summary.unmatched > 0 && (
                <>
                  <span className="text-[var(--text-muted)]">·</span>
                  <span className="text-amber-600 dark:text-amber-400 whitespace-nowrap">
                    未收录 {summary.unmatched}
                  </span>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="筛选变更词条或来源..."
                  className="w-full sm:w-44 pl-7 pr-2.5 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  value={logTypeFilter}
                  onChange={(e) => setLogTypeFilter(e.target.value)}
                  aria-label="变更类型过滤"
                  className="px-2 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-secondary)] focus:outline-none"
                >
                  <option value="all">全部操作</option>
                  <option value="status_change">状态变更</option>
                  <option value="batch_import">批量同步</option>
                  <option value="tags_change">标签更新</option>
                  <option value="note_change">笔记更新</option>
                </select>
                <button
                  type="button"
                  onClick={onExportLogsCsv}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>导出 CSV</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tab Content */}
        {rightTab === 'preview' ? (
          <>
            {/* 5-Column Preview Table Header */}
            <div className="grid grid-cols-[28px_minmax(80px,1fr)_minmax(110px,1.3fr)_76px_74px] sm:grid-cols-[32px_minmax(96px,1fr)_minmax(130px,1.4fr)_92px_94px] items-center px-4 sm:px-5 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
              <div>纳入</div>
              <div>输入原词</div>
              <div>匹配词条与消歧</div>
              <div>匹配诊断</div>
              <div className="text-right">目标状态</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
              {parsedRows.length === 0 ? (
                <div className="p-12 text-center text-xs text-[var(--text-muted)]">
                  在左侧粘贴词表即可实时预览词库匹配与同形异义词消歧结果
                </div>
              ) : (
                parsedRows.map((row, idx) => {
                  const isExcluded = excludedRows.has(idx) || row.isDuplicateInBatch;
                  const targetWord =
                    (selectedCandidateMap[idx]
                      ? wordsMap.get(selectedCandidateMap[idx])
                      : row.matchedWord) || null;
                  const currentStatus = targetWord
                    ? userRecordsMap.get(targetWord.id)?.status || 'unrated'
                    : 'unrated';
                  const finalStatus = row.parsedStatus || defaultStatus;

                  return (
                    <div
                      key={idx}
                      className={`grid grid-cols-[28px_minmax(80px,1fr)_minmax(110px,1.3fr)_76px_74px] sm:grid-cols-[32px_minmax(96px,1fr)_minmax(130px,1.4fr)_92px_94px] items-center px-4 sm:px-5 py-2.5 text-xs transition-colors ${
                        isExcluded ? 'opacity-45 bg-[var(--bg-canvas)]' : 'hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <div>
                        <input
                          type="checkbox"
                          checked={!isExcluded && Boolean(targetWord)}
                          disabled={!targetWord || row.isDuplicateInBatch}
                          onChange={() => handleToggleExclude(idx)}
                          aria-label={`纳入 ${row.cleanedTerm}`}
                          className="rounded border-[var(--border-strong)]"
                        />
                      </div>

                      <div className="font-mono-tabular text-[var(--text-primary)] truncate pr-2">
                        {row.cleanedTerm}
                      </div>

                      <div className="min-w-0 pr-2">
                        {targetWord ? (
                          <div className="flex flex-wrap items-baseline gap-1.5 min-w-0">
                            <button
                              type="button"
                              translate="no"
                              onClick={() => onSelectWord(targetWord)}
                              className="font-serif-lexicon font-semibold text-sm text-[var(--text-primary)] hover:text-[var(--accent-primary)] truncate cursor-pointer"
                            >
                              {targetWord.word}
                            </button>
                            <span className="hidden xl:inline text-[11px] font-mono-tabular text-[var(--text-muted)] truncate">
                              {targetWord.band || 'CET'}
                              {targetWord.isCet4
                                ? ' · CET-4'
                                : targetWord.isCet6
                                  ? ' · CET-6'
                                  : ''}
                            </span>
                            {row.candidateWords.length > 1 && (
                              <select
                                value={targetWord.id}
                                onChange={(e) =>
                                  setSelectedCandidateMap((prev) => ({
                                    ...prev,
                                    [idx]: e.target.value,
                                  }))
                                }
                                className="px-1.5 py-0.5 text-[11px] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded max-w-[110px]"
                              >
                                {row.candidateWords.map((cand) => (
                                  <option key={cand.id} value={cand.id}>
                                    {cand.word}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)]">词库未收录</span>
                        )}
                      </div>

                      <div className="text-[11px] whitespace-nowrap">
                        {row.isDuplicateInBatch ? (
                          <span className="text-[var(--text-muted)]">重复</span>
                        ) : row.matchStatus === 'matched_exact' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">精确匹配</span>
                          </span>
                        ) : row.matchStatus === 'matched_variant' ? (
                          <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400">
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">变体映射</span>
                          </span>
                        ) : row.matchStatus === 'ambiguous_homograph' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">同形多义</span>
                          </span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400">未匹配</span>
                        )}
                      </div>

                      <div className="text-right font-mono-tabular text-[11px] whitespace-nowrap">
                        {targetWord ? (
                          <span className="text-[var(--text-secondary)]">
                            {LEARNING_STATUS_META[currentStatus].shortLabel} →{' '}
                            <strong className="text-[var(--text-primary)]">
                              {LEARNING_STATUS_META[finalStatus].shortLabel}
                            </strong>
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <>
            {/* Activity Ledger Table Header */}
            <div className="grid grid-cols-[84px_1fr_92px_56px] sm:grid-cols-[108px_minmax(100px,1.2fr)_120px_minmax(100px,1fr)_68px] items-center px-4 sm:px-5 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
              <div>时间</div>
              <div>词条</div>
              <div>变更内容</div>
              <div className="hidden sm:block">来源批次</div>
              <div className="text-right">操作</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
              {filteredLogs.length === 0 ? (
                <div className="p-12 text-center text-xs text-[var(--text-muted)]">
                  暂无学习变更记录
                </div>
              ) : (
                filteredLogs.slice(0, 250).map((log) => {
                  const wordObj = wordsMap.get(log.wordId);
                  return (
                    <div
                      key={log.id}
                      className="grid grid-cols-[84px_1fr_92px_56px] sm:grid-cols-[108px_minmax(100px,1.2fr)_120px_minmax(100px,1fr)_68px] items-center px-4 sm:px-5 py-2.5 text-xs hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <div className="font-mono-tabular text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>

                      <div className="min-w-0 pr-2">
                        <button
                          type="button"
                          translate="no"
                          onClick={() => {
                            if (wordObj) onSelectWord(wordObj);
                          }}
                          className="font-serif-lexicon font-semibold text-sm text-[var(--text-primary)] hover:text-[var(--accent-primary)] cursor-pointer truncate"
                        >
                          {log.word}
                        </button>
                      </div>

                      <div className="text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                        {log.actionType === 'status_change' || log.actionType === 'batch_import' ? (
                          <span>
                            {LEARNING_STATUS_META[log.previousStatus || 'unrated'].shortLabel} →{' '}
                            <strong className="text-[var(--text-primary)]">
                              {LEARNING_STATUS_META[log.newStatus || 'unrated'].shortLabel}
                            </strong>
                          </span>
                        ) : log.actionType === 'tags_change' ? (
                          <span>标签更新</span>
                        ) : (
                          <span>笔记更新</span>
                        )}
                      </div>

                      <div className="hidden sm:block text-[11px] text-[var(--text-muted)] truncate pr-2">
                        {log.sourceLabel || '手动标注'}
                      </div>

                      <div className="text-right">
                        {log.id !== undefined && (
                          <button
                            type="button"
                            onClick={() => onUndoSingleLog(log.id!)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Undo2 className="w-3 h-3" />
                            撤销
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
