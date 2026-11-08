/**
 * Filter drawer (Shape Brief §2.2/§3): on ≥1024 viewports a 320px overlay panel that does not push
 * the roster; below that a full-screen sheet with a sticky Apply so the confirm button is reachable
 * without scrolling (Critique P2: the old sheet buried Apply below the fold).
 *
 * The drawer only hosts presentation; state wiring stays in the workspace (desktop applies
 * immediately, the sheet edits a draft and commits on Apply).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface FilterDrawerProps {
  open: boolean;
  kindLabel: string;
  activeCount: number;
  /** Overlay paths (Esc/×/click-away) close with commit; the mobile sheet closes without commit
   *  (its sticky Apply is the explicit commit). The boolean says whether to commit the draft. */
  onRequestClose: (commitDraft: boolean) => void;
  /** Sheet-mode footer (Apply/清除); the overlay applies on close and needs no footer. */
  footer?: ReactNode;
  children: ReactNode;
}

export function FilterDrawer({ open, kindLabel, activeCount, onRequestClose, footer, children }: FilterDrawerProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        // The overlay commits on Escape; a mobile sheet does not (its Apply is explicit).
        onRequestClose(window.matchMedia('(min-width: 1024px)').matches);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      openerRef.current?.focus?.();
    };
  }, [open, onRequestClose]);

  if (!open) return null;

  return (
    <>
      {/* ≥1024: slide-over panel next to the roster, table layout untouched */}
      <aside
        role="dialog"
        aria-modal="false"
        aria-label="筛选面板"
        className="absolute bottom-0 left-0 top-0 z-30 hidden w-[320px] flex-col overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-1 shadow-[8px_0_24px_rgba(15,20,30,0.10)] lg:flex"
      >
        <header className="flex items-center justify-between px-3 pb-1 pt-3">
          <h2 ref={headingRef} tabIndex={-1} className="outline-none text-xs font-medium text-[var(--text-primary)]">
            筛选 · {kindLabel}
            {activeCount > 0 ? ` · ${activeCount} 项生效` : ''}
          </h2>
          <button
            type="button"
            onClick={() => onRequestClose(true)}
            aria-label="关闭筛选（应用当前草稿）"
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
          >
            <X size={14} />
          </button>
        </header>
        <div className="min-h-0 flex-1 px-2 pb-4">{children}</div>
      </aside>

      {/* transparent click-away for the overlay (the roster stays interactive after close) */}
      <div className="absolute inset-0 z-20 hidden lg:block" onMouseDown={() => onRequestClose(true)} aria-hidden />

      {/* <1024: full-screen sheet with a sticky footer */}
      <div className="fixed inset-0 z-40 flex flex-col bg-[var(--bg-canvas)] lg:hidden">
        <header className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
          <h2 ref={headingRef} tabIndex={-1} className="outline-none text-sm font-medium text-[var(--text-primary)]">
            筛选 · {kindLabel}
            {activeCount > 0 ? ` · ${activeCount} 项生效` : ''}
          </h2>
          <button
            type="button"
            onClick={() => onRequestClose(false)}
            aria-label="关闭筛选（放弃草稿）"
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">{children}</div>
        {footer && (
          <div className="sticky bottom-0 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
