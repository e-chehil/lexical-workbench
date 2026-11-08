/**
 * Personal-ink status control. The current state always carries a written label; the menu exposes
 * the five states and their number keys. Aggregate entities are refused with an explanation.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { EffectiveStatus, LearningStatus } from '../../v2/index.ts';
import { STATUS_KEYS, STATUS_LABELS, cx, statusToneClass } from '../ui/index.tsx';

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
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const current = status?.status ?? 'unrated';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] italic text-[var(--text-muted)]" title={disabledReason}>
        聚合
      </span>
    );
  }

  const inherited = status?.origin === 'inherited';
  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
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
      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-[136px] border border-[var(--border-strong)] bg-[var(--bg-elevated)] py-1 shadow-[0_12px_30px_rgba(16,22,19,0.18)]"
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
        </ul>
      )}
    </span>
  );
}
