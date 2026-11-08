/**
 * Canvas top bar: current location, global search trigger, and the two live indicators.
 */
import { Menu, Search } from 'lucide-react';
import type { WorkspaceId } from '../routing/codec.ts';
import { WORKSPACE_META } from './workspaceMeta.ts';

export interface AppTopBarProps {
  workspace: WorkspaceId;
  engineStatus: 'loading' | 'ready' | 'error';
  learningStatus: 'loading' | 'ready' | 'error';
  onOpenSearch: () => void;
  onOpenMobileNav: () => void;
}

const DOT: Record<'loading' | 'ready' | 'error', string> = {
  loading: 'bg-amber-500',
  ready: 'bg-[var(--seal)]',
  error: 'bg-[var(--signal)]',
};

const STATUS_TEXT: Record<'loading' | 'ready' | 'error', string> = {
  loading: '构建中',
  ready: '就绪',
  error: '失败',
};

export function AppTopBar({ workspace, engineStatus, learningStatus, onOpenSearch, onOpenMobileNav }: AppTopBarProps) {
  const meta = WORKSPACE_META[workspace];
  return (
    <header className="flex h-[var(--topbar-height)] shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 lg:px-5">
      <button type="button" onClick={onOpenMobileNav} className="btn btn-ghost px-1.5 py-1 lg:hidden" aria-label="打开工作区菜单">
        <Menu size={17} />
      </button>

      <div className="min-w-0 flex-1">
        <p className="eyebrow truncate">
          Observatory <span className="mx-1 opacity-40">/</span> {meta.index} {meta.name}
        </p>
        <p className="truncate font-display text-[13px] font-semibold leading-tight text-[var(--text-primary)] lg:hidden">{meta.label}</p>
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="全局搜索"
        className="group flex min-w-0 items-center gap-2 border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] sm:w-[260px] lg:w-[320px]"
      >
        <Search size={14} aria-hidden />
        <span className="hidden flex-1 text-left sm:inline">搜索词形、词族、考纲条目…</span>
        <span className="ml-auto hidden items-center gap-1 sm:flex">
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </button>

      <div className="hidden items-center gap-3 text-[10px] text-[var(--text-muted)] md:flex">
        <span className="inline-flex items-center gap-1.5" title="索引引擎状态">
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[engineStatus]}`} aria-hidden />
          索引 {STATUS_TEXT[engineStatus]}
        </span>
        <span className="h-3 w-px bg-[var(--border-subtle)]" aria-hidden />
        <span className="inline-flex items-center gap-1.5" title="本地学习数据状态">
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[learningStatus]}`} aria-hidden />
          学习库 {STATUS_TEXT[learningStatus]}
        </span>
      </div>
    </header>
  );
}
