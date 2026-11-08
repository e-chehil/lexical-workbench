/**
 * Command palette: `Ctrl/⌘K` / `/` → full-screen search (PRODUCT_SPEC §2).
 *
 * Selecting a hit is pure routing: it opens the entity in Explore (`workspace + ref`), which is
 * the same route the Detail panel uses, so the result stays linkable and back/forward works.
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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 px-4 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <Search size={16} className="text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索拼写、COCA 词头、BNC 词族、CET 条目…"
            className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            aria-label="全局搜索"
          />
          {search.status === 'loading' && <span className="text-[11px] text-[var(--text-muted)]">检索中…</span>}
          <button type="button" onClick={onClose} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" aria-label="关闭搜索">
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {status !== 'ready' && <p className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">索引仍在构建，稍候再试。</p>}
          {status === 'ready' && term.trim().length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">输入至少一个字符开始搜索（前缀匹配）。</p>
          )}
          {status === 'ready' && term.trim().length > 0 && search.status === 'ready' && flat.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">没有匹配 “{term.trim()}” 的实体。</p>
          )}
          {search.status === 'error' && (
            <p className="px-3 py-6 text-center text-sm text-rose-600">搜索失败：{search.error ?? '未知错误'}</p>
          )}

          {groups.map((group) => (
            <section key={group.kind} className="mb-1">
              <header className="flex items-baseline justify-between px-3 py-1.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                <span>{SEARCH_KIND_LABELS[group.kind]}</span>
                <span>{search.counts[group.kind] ?? group.hits.length}</span>
              </header>
              <ul>
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
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                          active ? 'bg-[var(--accent-soft)] text-[var(--accent-hover)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        <span className="truncate">{hit.label}</span>
                        <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">{hit.ref}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <footer className="flex items-center gap-4 border-t border-[var(--border-subtle)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
          <span>↑↓ 选择</span>
          <span>↵ 打开</span>
          <span>Esc 关闭</span>
        </footer>
      </div>
    </div>
  );
}
