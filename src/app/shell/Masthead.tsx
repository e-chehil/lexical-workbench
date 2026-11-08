/**
 * Masthead (Shape Brief §2.1): the 52px top bar that replaces the 224px fixed rail — workspace
 * items read as clauses, the global search and the engine/learning indicators live on the right,
 * and the roster below reclaims the full width. `workspaceMeta` stays the single source for
 * labels, order and the mobile bottom bar.
 */
import { Search } from 'lucide-react';
import type { WorkspaceId } from '../routing/codec.ts';
import { WORKSPACE_META, WORKSPACE_ORDER } from './workspaceMeta.ts';

const ENGINE_TEXT: Record<'loading' | 'ready' | 'error', string> = {
  loading: '索引构建中',
  ready: '索引就绪',
  error: '索引失败',
};

const LEARNING_TEXT: Record<'loading' | 'ready' | 'error', string> = {
  loading: '学习数据读取中',
  ready: '学习数据已连接',
  error: '学习数据不可用（浏览仍可用）',
};

const STATUS_DOT: Record<'loading' | 'ready' | 'error', string> = {
  loading: 'bg-[var(--st-learning)]',
  ready: 'bg-[var(--st-mastered)]',
  error: 'bg-[var(--official)]',
};

export interface MastheadProps {
  active: WorkspaceId;
  engineStatus: 'loading' | 'ready' | 'error';
  learningStatus: 'loading' | 'ready' | 'error';
  readySummary: string | null;
  onSelect: (workspace: WorkspaceId) => void;
  onOpenSearch: () => void;
}

export function Masthead({ active, engineStatus, learningStatus, readySummary, onSelect, onOpenSearch }: MastheadProps) {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3">
      <span className="flex shrink-0 items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent-primary)] font-serif-lexicon text-[13px] font-semibold text-white">
          LW
        </span>
        <span className="hidden text-sm font-semibold text-[var(--text-primary)] min-[420px]:inline">
          Lexical Workbench
          <span className="ml-1.5 text-[10px] font-normal text-[var(--text-muted)]">2.0</span>
        </span>
      </span>

      <nav aria-label="工作区导航" className="no-scrollbar hidden min-w-0 items-center gap-0.5 overflow-x-auto lg:flex">
        {WORKSPACE_ORDER.map((id) => {
          const meta = WORKSPACE_META[id];
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={isActive ? 'page' : undefined}
              title={meta.description}
              className={`shrink-0 border-b-2 px-2.5 py-1.5 text-xs transition-colors ${
                isActive
                  ? 'border-[var(--accent-primary)] font-medium text-[var(--accent-hover)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {meta.label}
              <span className="ml-1 text-[9px] uppercase tracking-wide opacity-60">{meta.name}</span>
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span title={readySummary ?? undefined} className="hidden items-center gap-1.5 text-[10px] text-[var(--text-muted)] xl:flex">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[engineStatus]}`} aria-hidden />
          {ENGINE_TEXT[engineStatus]}
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--st-mastered)] opacity-0" aria-hidden />
        </span>
        <span
          title={`${ENGINE_TEXT[engineStatus]} · ${LEARNING_TEXT[learningStatus]}`}
          className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[engineStatus]}`} aria-hidden />
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[learningStatus]}`} aria-hidden />
          <span className="sr-only">{`${ENGINE_TEXT[engineStatus]}，${LEARNING_TEXT[learningStatus]}`}</span>
        </span>
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]"
        >
          <Search size={14} aria-hidden />
          <span className="hidden sm:inline">搜索</span>
          <kbd className="hidden rounded border border-[var(--border-subtle)] px-1 font-mono-tabular text-[10px] sm:inline">/</kbd>
        </button>
      </div>
    </header>
  );
}
