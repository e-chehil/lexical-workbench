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
  LEARNING_STATUS_META,
  LexiconWordItem,
  UserWordRecord,
} from '../data/types.ts';
import { searchLexicon } from '../data/searchAndFilter.ts';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  words: LexiconWordItem[];
  userRecordsMap: Map<string, UserWordRecord>;
  onSelectWord: (word: LexiconWordItem) => void;
  onInspectFamily: (familyId: string, highlightWord?: string) => void;
  initialQuery?: string;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  words,
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
        'abilities',
        'appropriate',
        'owing to',
        'advisor',
        'color',
        'baby boom',
        'accountancy',
        'abbreviation',
      ];
      const byId = new Map(words.map((w) => [w.id, w]));
      return sampleIds
        .map((id) => byId.get(id))
        .filter((w): w is LexiconWordItem => Boolean(w))
        .map((w) => ({
          word: w,
          matchRank: 'exact' as const,
          matchedContext: w.headword ? `词族 ${w.headword}` : '短语词条',
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
        {/* Top Command Input Bar */}
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
            placeholder="输入单词、变形 (abilities)、短语 (owing to) 或原表简写 (colo(u)r)…"
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

        {/* Results List */}
        <div className="overflow-y-auto overscroll-contain divide-y divide-[var(--border-subtle)] flex-1">
          {!query.trim() && (
            <div className="px-4 py-1.5 bg-[var(--bg-canvas)] text-[11px] text-[var(--text-muted)] flex items-center justify-between">
              <span>常用检索示例（支持屈折变形反查词族、同形词辨析与短语）</span>
              <span className="font-mono-tabular">76,330 词形 · 25,002 词族</span>
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
                  : '该词条未收录于 BNC/COCA 25k 或 CET2016 大纲词表。'}
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          translate="no"
                          className="font-serif-lexicon font-semibold text-base text-[var(--text-primary)]"
                        >
                          {w.word}
                        </span>
                        {w.homographNumbers.length > 0 && (
                          <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">
                            #{w.homographNumbers.join(',#')}
                          </span>
                        )}
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
                            {w.band}
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
                        {w.cetRefs.length > 0 && (
                          <span className="truncate">
                            · 考纲: {w.cetRefs.map((r) => r.rawMember.replace(/★/g, '')).join(' / ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right font-mono-tabular text-xs shrink-0">
                      <div className="text-[var(--text-primary)] font-medium">
                        {w.formFrequency !== null ? w.formFrequency.toLocaleString() : '未收录'}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        族 {w.familyFrequency !== null ? w.familyFrequency.toLocaleString() : '—'}
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
                      title={`在词族视图中定位 “${w.headword}”`}
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

        {/* Minimal Footer Hints */}
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
