/**
 * Top bar: current workspace, global search trigger and the sync indicators.
 *
 * The search button is a real button, not an input: the palette owns focus and keyboard handling.
 */
import { Search } from 'lucide-react';
import type { WorkspaceMeta } from './workspaceMeta.ts';

export interface TopBarProps {
  meta: WorkspaceMeta;
  onOpenSearch: () => void;
  engineStatus: 'loading' | 'ready' | 'error';
  learningStatus: 'loading' | 'ready' | 'error';
}

export function TopBar({ meta, onOpenSearch, engineStatus, learningStatus }: TopBarProps) {
  return (
    <header className="flex items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">
          {meta.name}
          <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">{meta.label}</span>
        </h1>
        <p className="truncate text-[11px] text-[var(--text-muted)]">{meta.description}</p>
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--border-strong)]"
      >
        <Search size={14} />
        <span className="hidden sm:inline">搜索</span>
        <kbd className="hidden rounded border border-[var(--border-subtle)] px-1 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </button>

      <span
        className={`hidden rounded-full px-2 py-0.5 text-[10px] sm:inline ${
          engineStatus === 'ready'
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
            : engineStatus === 'loading'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
        }`}
        title="索引引擎状态"
      >
        索引 {engineStatus === 'ready' ? '就绪' : engineStatus === 'loading' ? '构建中' : '失败'}
      </span>
      <span
        className={`hidden rounded-full px-2 py-0.5 text-[10px] sm:inline ${
          learningStatus === 'ready'
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
            : learningStatus === 'loading'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
        }`}
        title="本地学习数据状态"
      >
        学习 {learningStatus === 'ready' ? '已连接' : learningStatus === 'loading' ? '读取中' : '不可用'}
      </span>
    </header>
  );
}
