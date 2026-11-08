/**
 * Desktop navigation rail. Dark chrome, lime live marker, numbered workspace clauses.
 */
import { Command, Database, Dot } from 'lucide-react';
import type { WorkspaceId } from '../routing/codec.ts';
import { WORKSPACE_META, WORKSPACE_ORDER } from './workspaceMeta.ts';

export interface SidebarProps {
  active: WorkspaceId;
  engineStatus: 'loading' | 'ready' | 'error';
  learningStatus: 'loading' | 'ready' | 'error';
  readySummary: string | null;
  onSelect: (workspace: WorkspaceId) => void;
  onOpenSearch: () => void;
}

const DOT: Record<'loading' | 'ready' | 'error', string> = {
  loading: 'bg-amber-400',
  ready: 'bg-[var(--lime)]',
  error: 'bg-[var(--signal)]',
};

const ENGINE_TEXT: Record<'loading' | 'ready' | 'error', string> = {
  loading: '索引构建中',
  ready: '索引就绪',
  error: '索引失败',
};

const LEARNING_TEXT: Record<'loading' | 'ready' | 'error', string> = {
  loading: '学习库读取中',
  ready: '学习库已连接',
  error: '学习库不可用',
};

export function Sidebar({ active, engineStatus, learningStatus, readySummary, onSelect, onOpenSearch }: SidebarProps) {
  return (
    <aside className="hidden w-[var(--rail-width)] shrink-0 flex-col bg-[var(--rail)] text-[var(--rail-text)] lg:flex">
      <div className="border-b border-[var(--rail-line)] px-4 pb-4 pt-5">
        <p className="font-display text-[26px] font-semibold leading-none tracking-tight">
          Lexical<span className="text-[var(--lime)]">.</span>
        </p>
        <p className="eyebrow-on-rail mt-2">Workbench / Observatory</p>
        <p className="mt-1 font-mono-tabular text-[10px] tracking-[0.18em] text-[var(--rail-muted)]">EDITION 2.0 · LOCAL FIRST</p>
      </div>

      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <span className="eyebrow-on-rail">Workspaces</span>
        <span className="eyebrow-on-rail">06</span>
      </div>

      <nav aria-label="工作区导航" className="flex flex-col py-1">
        {WORKSPACE_ORDER.map((id) => {
          const meta = WORKSPACE_META[id];
          const Icon = meta.icon;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={id === active ? 'page' : undefined}
              className="rail-link text-left"
              title={meta.description}
            >
              <Icon size={15} className="opacity-80" aria-hidden />
              <span className="min-w-0">
                <span className="block text-[13px] leading-tight">{meta.label}</span>
                <span className="mt-0.5 block font-mono-tabular text-[9px] uppercase tracking-[0.14em] opacity-55">{meta.name}</span>
              </span>
              <span className="font-mono-tabular text-[9px] opacity-45">{meta.index}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[var(--rail-line)] px-4 py-4">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex w-full items-center justify-between border border-[var(--rail-line)] px-2.5 py-2 text-left text-[11px] text-[var(--rail-muted)] transition-colors hover:border-[var(--lime)]/50 hover:text-[var(--rail-text)]"
        >
          <span className="inline-flex items-center gap-1.5">
            <Command size={12} aria-hidden />
            全局搜索
          </span>
          <kbd className="rounded border border-[var(--rail-line)] px-1 font-mono-tabular text-[9px]">/</kbd>
        </button>

        <dl className="mt-4 space-y-2 text-[10px] text-[var(--rail-muted)]">
          <div className="flex items-center justify-between gap-2" title={readySummary ?? undefined}>
            <dt className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[engineStatus]}`} aria-hidden />
              {ENGINE_TEXT[engineStatus]}
            </dt>
            <dd className="font-mono-tabular text-[9px] opacity-60">{engineStatus === 'ready' ? '3 SOURCES' : '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[learningStatus]}`} aria-hidden />
              {LEARNING_TEXT[learningStatus]}
            </dt>
            <dd className="font-mono-tabular text-[9px] opacity-60">
              <Database size={10} aria-hidden />
            </dd>
          </div>
        </dl>

        <p className="mt-4 flex items-start gap-1 border-t border-[var(--rail-line)] pt-3 font-mono-tabular text-[9px] leading-relaxed text-[var(--rail-muted)]/70">
          <Dot size={10} className="mt-0.5 shrink-0" aria-hidden />
          数据留在本机。三个来源共用一个词形枢纽，词族与考纲从不互相借值。
        </p>
      </div>
    </aside>
  );
}
