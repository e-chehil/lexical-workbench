/**
 * Desktop left rail (≥ 1024 px). Workspace switching writes the route, so the URL always
 * identifies the current workspace.
 */
import type { WorkspaceId } from '../routing/codec.ts';
import { WORKSPACE_META, WORKSPACE_ORDER } from './workspaceMeta.ts';

export interface WorkspaceRailProps {
  active: WorkspaceId;
  onSelect: (workspace: WorkspaceId) => void;
  engineStatus: 'loading' | 'ready' | 'error';
}

export function WorkspaceRail({ active, onSelect, engineStatus }: WorkspaceRailProps) {
  return (
    <nav className="hidden w-56 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] lg:flex" aria-label="工作区导航">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-primary)] text-sm font-semibold text-white">LW</span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-[var(--text-primary)]">Lexical Workbench</span>
          <span className="block text-[11px] text-[var(--text-muted)]">2.0 · 三源词汇工作台</span>
        </span>
      </div>

      <ul className="flex-1 space-y-0.5 px-2 py-2">
        {WORKSPACE_ORDER.map((id) => {
          const meta = WORKSPACE_META[id];
          const Icon = meta.icon;
          const isActive = id === active;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent-hover)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
                title={meta.description}
              >
                <Icon size={16} className="shrink-0" />
                <span className="flex-1 truncate">
                  {meta.name}
                  <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">{meta.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-[var(--border-subtle)] px-4 py-3 text-[11px] text-[var(--text-muted)]">
        引擎：{engineStatus === 'ready' ? '已就绪' : engineStatus === 'loading' ? '构建中…' : '不可用'}
      </div>
    </nav>
  );
}
