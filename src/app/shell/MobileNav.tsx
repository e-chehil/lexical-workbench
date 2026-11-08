/**
 * Mobile navigation: four bottom slots plus a sheet for the remaining workspaces.
 */
import { useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import type { WorkspaceId } from '../routing/codec.ts';
import { MOBILE_MORE, MOBILE_PRIMARY, WORKSPACE_META } from './workspaceMeta.ts';

export interface MobileNavProps {
  active: WorkspaceId;
  onSelect: (workspace: WorkspaceId) => void;
}

export function MobileNav({ active, onSelect }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const moreActive = MOBILE_MORE.includes(active);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-[#101613]/45 lg:hidden" onMouseDown={() => setOpen(false)}>
          <div className="rise-in w-full border-t border-[var(--border-strong)] bg-[var(--bg-elevated)] p-3 pb-6" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="eyebrow">More workspaces</span>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost px-1 py-1" aria-label="关闭">
                <X size={14} />
              </button>
            </div>
            {MOBILE_MORE.map((id) => {
              const meta = WORKSPACE_META[id];
              const Icon = meta.icon;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onSelect(id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 border-b border-[var(--border-hairline)] px-1 py-3 text-left last:border-0"
                >
                  <Icon size={16} className="text-[var(--text-muted)]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-[var(--text-primary)]">{meta.label}</span>
                    <span className="block text-[10px] text-[var(--text-muted)]">{meta.description}</span>
                  </span>
                  <span className="font-mono-tabular text-[10px] text-[var(--text-faint)]">{meta.index}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="移动端工作区导航"
      >
        {MOBILE_PRIMARY.map((id) => {
          const meta = WORKSPACE_META[id];
          const Icon = meta.icon;
          const current = id === active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={current ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] ${current ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
            >
              <Icon size={17} aria-hidden />
              {meta.label}
              <span className={`h-0.5 w-5 ${current ? 'bg-[var(--signal)]' : 'bg-transparent'}`} aria-hidden />
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-current={moreActive ? 'page' : undefined}
          className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] ${moreActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
        >
          <MoreHorizontal size={17} aria-hidden />
          更多
          <span className={`h-0.5 w-5 ${moreActive ? 'bg-[var(--signal)]' : 'bg-transparent'}`} aria-hidden />
        </button>
      </nav>
    </>
  );
}
