/**
 * Personal-ink status control. The current state always carries a written label; the menu exposes
 * the five states and their number keys. Aggregate entities are refused with an explanation.
 *
 * The menu is portalled to the body with fixed coordinates: roster rows are transformed (virtual
 * scrolling), so an absolutely positioned menu inside a row would be painted under the next rows
 * and clicks would land on the wrong word.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import type { EffectiveStatus, LearningStatus } from '../../v2/index.ts';
import { STATUS_KEYS, STATUS_LABELS, cx, statusToneClass } from '../ui/index.tsx';

const MENU_WIDTH = 136;
const MENU_HEIGHT = 176;

export function StatusControl({
  status,
  onSet,
  disabled = false,
  disabledReason,
  compact = false,
}: {
  status: EffectiveStatus | null | undefined;
  onSet: (status: LearningStatus) => void;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const current = status?.status ?? 'unrated';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onViewportChange = (): void => setOpen(false);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open]);

  if (disabled) {
    const label = status === null || status === undefined ? '聚合' : '不可用';
    return (
      <span className="inline-flex items-center gap-1 text-[10px] italic text-[var(--text-muted)]" title={disabledReason}>
        {label}
      </span>
    );
  }

  const inherited = status?.origin === 'inherited';
  const toggle = (): void => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const top = rect.bottom + 4 + MENU_HEIGHT > window.innerHeight ? Math.max(8, rect.top - MENU_HEIGHT - 4) : rect.bottom + 4;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setPosition({ top, left });
    setOpen(true);
  };

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`学习状态，当前 ${STATUS_LABELS[current]}${inherited ? '（继承）' : ''}`}
        title={inherited ? `继承自 ${status?.from ?? '词形'}` : '设置学习状态（1–5）'}
        className={cx(
          'inline-flex items-center gap-1 rounded-[2px] px-1.5 py-1 text-[10px] leading-none transition-opacity hover:opacity-80',
          statusToneClass(current),
          compact && 'px-1 py-0.5'
        )}
      >
        {STATUS_LABELS[current]}
        {inherited && <span className="opacity-70">继承</span>}
        <ChevronDown size={9} aria-hidden className="opacity-60" />
      </button>
      {open &&
        position &&
        typeof document !== 'undefined' &&
        createPortal(
          <ul
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: position.top, left: position.left, width: MENU_WIDTH, zIndex: 1000 }}
            className="border border-[var(--border-strong)] bg-[var(--bg-elevated)] py-1 shadow-[0_12px_30px_rgba(16,22,19,0.18)]"
          >
            {STATUS_KEYS.map((state, index) => (
              <li key={state} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onSet(state);
                  }}
                  className={cx(
                    'flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)]',
                    state === current && 'font-medium'
                  )}
                >
                  <span className={cx('inline-flex items-center rounded-[2px] px-1.5 py-0.5', statusToneClass(state))}>{STATUS_LABELS[state]}</span>
                  <span className="font-mono-tabular text-[9px] text-[var(--text-faint)]">{index + 1}</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </span>
  );
}
