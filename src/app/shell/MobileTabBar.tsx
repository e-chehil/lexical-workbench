/**
 * Mobile bottom bar (< 768 px): Explore · Study · Insights · More (PRODUCT_SPEC §2), where More
 * reveals Corpus Lab, Family Atlas and Data Studio.
 */
import { useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import type { WorkspaceId } from '../routing/codec.ts';
import { MOBILE_MORE, MOBILE_PRIMARY, WORKSPACE_META } from './workspaceMeta.ts';

export interface MobileTabBarProps {
  active: WorkspaceId;
  onSelect: (workspace: WorkspaceId) => void;
}

export function MobileTabBar({ active, onSelect }: MobileTabBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MOBILE_MORE.includes(active);

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-slate-950/40 lg:hidden" onMouseDown={() => setMoreOpen(false)}>
          <div
            className="w-full rounded-t-2xl border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 pb-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">更多工作区</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="rounded p-1 text-[var(--text-muted)]" aria-label="关闭">
                <X size={14} />
              </button>
            </div>
            <ul className="space-y-1">
              {MOBILE_MORE.map((id) => {
                const meta = WORKSPACE_META[id];
                const Icon = meta.icon;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(id);
                        setMoreOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    >
                      <Icon size={16} />
                      <span className="flex-1">
                        {meta.name}
                        <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">{meta.label}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="移动端工作区导航"
      >
        {MOBILE_PRIMARY.map((id) => {
          const meta = WORKSPACE_META[id];
          const Icon = meta.icon;
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] ${
                isActive ? 'text-[var(--accent-hover)]' : 'text-[var(--text-muted)]'
              }`}
            >
              <Icon size={18} />
              {meta.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-current={moreActive ? 'page' : undefined}
          className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] ${
            moreActive ? 'text-[var(--accent-hover)]' : 'text-[var(--text-muted)]'
          }`}
        >
          <MoreHorizontal size={18} />
          更多
        </button>
      </nav>
    </>
  );
}
