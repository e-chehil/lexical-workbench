import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  X,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  COCA_POS_META,
  LEARNING_STATUS_META,
  LexiconWordItem,
  UserWordRecord,
} from '../data/types.ts';
import { searchLexicon } from '../data/searchAndFilter.ts';
import { formatCompactFrequency } from '../utils/frequency.ts';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  words: LexiconWordItem[];
  familiesCount?: number;
  cocaLexemesCount?: number;
  userRecordsMap: Map<string, UserWordRecord>;
  onSelectWord: (word: LexiconWordItem) => void;
  onInspectFamily: (familyId: string, highlightWord?: string) => void;
  initialQuery?: string;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  words,
  familiesCount,
  cocaLexemesCount,
  userRecordsMap,
  onSelectWord,
  onInspectFamily,
  initialQuery = '',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [enableFuzzy, setEnableFuzzy] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setSelectedIndex(0);
      if (window.innerWidth >= 768) {
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 16);
      }
    }
  }, [isOpen, initialQuery]);

  const results = useMemo(() => {
    if (!query.trim()) {
      const sampleIds = [
        'work',
        'like',
        'climate change',
        'ability',
        'abilities',
        'run',
        'running',
        'color',
        'colour',
        'appropriate',
      ];
      const byId = new Map(words.map((w) => [w.id, w]));
      return sampleIds
        .map((id) => byId.get(id))
        .filter((w): w is LexiconWordItem => Boolean(w))
        .map((w) => ({
          word: w,
          matchRank: 'exact' as const,
          matchedContext: w.inCoca
            ? `COCA #${w.cocaBestPosRank} (${w.cocaPosCount || 1}性)`
            : w.headword
              ? `BNC 词族 ${w.headword}`
              : '短语词条',
        }));
    }
    return searchLexicon(words, query, { enableFuzzy, limit: 50 });
  }, [words, query, enableFuzzy]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, enableFuzzy]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          results.length > 0 ? (prev - 1 + results.length) % results.length : 0
        );
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        const chosen = results[selectedIndex].word;
        if (e.shiftKey && chosen.familyId) {
          onInspectFamily(chosen.familyId, chosen.id);
          onClose();
        } else {
          onSelectWord(chosen);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onSelectWord, onInspectFamily, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 sm:pt-20 px-3 sm:px-6 bg-black/55 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="全局词库快速检索"
    >
      <div
        className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border-subtle)]">
          <Search className="w-4 h-4 text-[var(--accent-primary)] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            name="global-lexicon-search"
            aria-label="全局检索单词、变形词或短语"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入单词 (work/like)、屈折形 (abilities)、复合词 (climate change) 或英美变体…"
            className="w-full min-w-0 bg-transparent text-sm sm:text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setEnableFuzzy((v) => !v)}
            aria-pressed={enableFuzzy}
            className={`px-2 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1 focus-ring ${
              enableFuzzy
                ? 'bg-[var(--accent-soft)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
            }`}
            title="开启或关闭拼写容错搜索（编辑距离 ≤ 1）"
          >
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            <span>容错</span>
          </button>
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer focus-ring"
              aria-label="清空搜索词"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto overscroll-contain divide-y divide-[var(--border-subtle)] flex-1">
          {!query.trim() && (
            <div className="px-4 py-1.5 bg-[var(--bg-canvas)] text-[11px] text-[var(--text-muted)] flex items-center justify-between gap-2">
              <span className="truncate">三源研究示例词（支持一词多性、屈折变形反查、英美变体与复合词）</span>
              <span className="font-mono-tabular whitespace-nowrap shrink-0">
                {words.length.toLocaleString()} 词形 · {(cocaLexemesCount ?? 60000).toLocaleString()} COCA词元 · {(familiesCount ?? 25002).toLocaleString()} 词族
              </span>
            </div>
          )}

          {results.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                未找到与 “{query}” 匹配的词条
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {!enableFuzzy
                  ? '可尝试开启右上角「容错」检索相近拼写。'
                  : '该词条未收录于 COCA 2020、BNC/COCA 25k 或 CET2016 大纲词表。'}
              </p>
            </div>
          ) : (
            results.map((item, idx) => {
              const w = item.word;
              const userRec = userRecordsMap.get(w.id);
              const status = userRec?.status || 'unrated';
              const statusMeta = LEARNING_STATUS_META[status];
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={w.id}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                    isSelected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectWord(w);
                      onClose();
                    }}
                    className="min-w-0 flex-1 text-left flex items-center justify-between gap-3 cursor-pointer focus-ring rounded"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          translate="no"
                          className="font-serif-lexicon font-semibold text-base text-[var(--text-primary)]"
                        >
                          {w.word}
                        </span>
                        {w.inCoca && (
                          <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold">
                            COCA #{w.cocaBestPosRank}
                          </span>
                        )}
                        {(w.cocaLexemes || []).slice(0, 3).map((lex) => (
                          <span
                            key={lex.lexemeId}
                            className={`text-[10px] font-mono-tabular px-1.5 py-0.5 rounded ${COCA_POS_META[lex.pos]?.badgeClass || ''}`}
                          >
                            {COCA_POS_META[lex.pos]?.shortLabel || lex.pos}
                          </span>
                        ))}
                        {w.isCet4 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-300">
                            CET-4
                          </span>
                        )}
                        {w.isCet6 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                            CET-6
                          </span>
                        )}
                        {w.band && (
                          <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                            BNC {w.band}
                          </span>
                        )}
                        {status !== 'unrated' && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusMeta.badgeClass}`}>
                            {statusMeta.shortLabel}
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-muted)] truncate">
                        <span>{item.matchedContext}</span>
                        {w.headword && (
                          <span>· 词族: {w.headword}</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right font-mono-tabular text-xs shrink-0">
                      <div className="text-[var(--text-primary)] font-medium">
                        {w.cocaHeadwordTotalFreq !== null && w.cocaHeadwordTotalFreq !== undefined
                          ? `COCA ${formatCompactFrequency(w.cocaHeadwordTotalFreq, true)}`
                          : w.formFrequency !== null
                            ? `BNC ${formatCompactFrequency(w.formFrequency, w.inBnc)}`
                            : '变体/未单列'}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {w.familyFrequency !== null
                          ? `BNC族 ${formatCompactFrequency(w.familyFrequency, true)}`
                          : '无BNC族'}
                      </div>
                    </div>
                  </button>

                  {w.familyId && (
                    <button
                      type="button"
                      onClick={() => {
                        onInspectFamily(w.familyId!, w.id);
                        onClose();
                      }}
                      className="px-2 py-1 rounded-md text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] text-[var(--accent-primary)] inline-flex items-center gap-1 cursor-pointer shrink-0 focus-ring"
                      title={`在词族图谱中定位 “${w.headword}”`}
                    >
                      <Layers className="w-3 h-3" aria-hidden="true" />
                      <span>词族</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 bg-[var(--bg-canvas)] border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <ArrowUp className="w-3 h-3" aria-hidden="true" />
              <ArrowDown className="w-3 h-3" aria-hidden="true" />
              选择
            </span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" aria-hidden="true" />
              查看词条
            </span>
            <span className="hidden sm:inline">Shift + Enter 直达词族</span>
          </div>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
};
