/**
 * Global command palette (`Ctrl/⌘K`, `/`). Results are grouped by entity kind and open the
 * corresponding entity in Explore, so every hit is a linkable route.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import { useEngine } from '../providers/EngineProvider.tsx';
import { useRoute } from '../providers/RouteProvider.tsx';
import { SEARCH_KIND_LABELS, groupHits, useSearch, type SearchHit } from './useSearch.ts';

export interface SearchPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function SearchPalette({ open, onClose }: SearchPaletteProps) {
  const { client, status } = useEngine();
  const { navigate } = useRoute();
  const [term, setTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const search = useSearch(client, status, term);

  const groups = useMemo(() => groupHits(search.hits), [search.hits]);
  const flat = useMemo(() => groups.flatMap((group) => group.hits), [groups]);

  useEffect(() => {
    if (!open) {
      setTerm('');
      setActiveIndex(0);
      return;
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => (index >= flat.length ? 0 : index));
  }, [flat.length]);

  if (!open) return null;

  const select = (hit: SearchHit | undefined): void => {
    if (!hit) return;
    navigate({ workspace: 'explore', ref: hit.ref });
    onClose();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (flat.length === 0 ? 0 : (index + 1) % flat.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (flat.length === 0 ? 0 : (index - 1 + flat.length) % flat.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      select(flat[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  let runningIndex = -1;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[#101613]/55 px-4 pt-[7vh]" onMouseDown={onClose}>
      <div
        className="rise-in w-full max-w-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-[0_24px_80px_rgba(16,22,19,0.28)]"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border-strong)] px-4 py-3">
          <Search size={16} className="text-[var(--signal)]" aria-hidden />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="输入拼写、词头、词族或考纲条目…"
            className="w-full bg-transparent text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
            aria-label="全局搜索"
          />
          {search.status === 'loading' && <span className="font-mono-tabular text-[10px] text-[var(--text-muted)]">SEARCHING</span>}
          <button type="button" onClick={onClose} className="btn btn-ghost px-1 py-1" aria-label="关闭搜索">
            <X size={14} />
          </button>
        </div>

        <div className="scroll-thin max-h-[58vh] overflow-y-auto">
          {status !== 'ready' && <p className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)]">索引仍在构建，稍候再试。</p>}
          {status === 'ready' && term.trim().length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="eyebrow">Search protocol</p>
              <p className="mt-2 text-[12px] text-[var(--text-muted)]">前缀匹配四个类别：词形 / COCA 词头 / BNC 词族 / CET 词目。</p>
            </div>
          )}
          {status === 'ready' && term.trim().length > 0 && search.status === 'ready' && flat.length === 0 && (
            <p className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)]">没有匹配 “{term.trim()}” 的实体。</p>
          )}
          {search.status === 'error' && <p className="px-4 py-8 text-center text-[12px] text-[var(--signal)]">搜索失败：{search.error ?? '未知错误'}</p>}

          {groups.map((group) => (
            <section key={group.kind} className="border-b border-[var(--border-hairline)] last:border-0">
              <header className="flex items-baseline justify-between px-4 pb-1 pt-3">
                <span className="eyebrow">{SEARCH_KIND_LABELS[group.kind]}</span>
                <span className="font-mono-tabular text-[10px] text-[var(--text-faint)]">{search.counts[group.kind] ?? group.hits.length}</span>
              </header>
              <ul className="pb-1">
                {group.hits.map((hit) => {
                  runningIndex += 1;
                  const index = runningIndex;
                  const active = index === activeIndex;
                  return (
                    <li key={hit.ref}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => select(hit)}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left ${
                          active ? 'bg-[var(--signal-soft)] text-[var(--signal-hover)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        <span className="min-w-0 truncate font-display text-[15px]">{hit.label}</span>
                        <span className="shrink-0 font-mono-tabular text-[9px] text-[var(--text-faint)]">{hit.ref}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <footer className="flex items-center gap-4 border-t border-[var(--border-subtle)] px-4 py-2 text-[10px] text-[var(--text-muted)]">
          <span className="font-mono-tabular">↑↓</span> 选择
          <span className="font-mono-tabular">↵</span> 打开
          <span className="font-mono-tabular">esc</span> 关闭
          <span className="ml-auto font-mono-tabular text-[9px] text-[var(--text-faint)]">FORM HUB · NO FOLDING</span>
        </footer>
      </div>
    </div>
  );
}
