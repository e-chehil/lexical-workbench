/**
 * Shared UI primitives for the Observatory shell.
 *
 * These are deliberately flat: hairline rules, mono eyebrows and one signal colour. Workspaces
 * compose them instead of introducing a second visual language.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import type { EffectiveStatus, LearningStatus } from '../../v2/index.ts';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-[var(--border-subtle)] px-4 pb-3 pt-4 lg:px-6 lg:pb-4 lg:pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-1 font-display text-[24px] font-semibold leading-none tracking-tight text-[var(--text-primary)] lg:text-[30px]">
            {title}
          </h1>
          {description && <p className="mt-2 hidden max-w-2xl text-[12px] leading-relaxed text-[var(--text-muted)] sm:block">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </header>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <p className="eyebrow">{children}</p>
      {right && <span className="font-mono-tabular text-[10px] text-[var(--text-faint)]">{right}</span>}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('panel', className)}>{children}</section>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
      <Loader2 size={14} className="animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function LoadingPanel({ label = '正在计算…' }: { label?: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

export function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 border border-[var(--signal)]/30 bg-[var(--signal-soft)] px-3 py-2 text-[12px] leading-relaxed text-[var(--signal-hover)]">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
      <span className="break-words">{message}</span>
    </div>
  );
}

export function EmptyState({ title, detail, actions }: { title: string; detail?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="font-display text-lg font-semibold text-[var(--text-primary)]">{title}</p>
      {detail && <p className="max-w-md text-[12px] leading-relaxed text-[var(--text-muted)]">{detail}</p>}
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

export const STATUS_LABELS: Record<LearningStatus, string> = {
  unrated: '未评',
  queued: '待学',
  learning: '在学',
  mastered: '掌握',
  deferred: '暂缓',
};

export const STATUS_KEYS: readonly LearningStatus[] = ['unrated', 'queued', 'learning', 'mastered', 'deferred'];

export function statusToneClass(status: LearningStatus | null | undefined): string {
  return `st-${status ?? 'unrated'}`;
}

export function StatusBadge({ status, compact = false }: { status: EffectiveStatus | null | undefined; compact?: boolean }) {
  const current = status?.status ?? 'unrated';
  const inherited = status?.origin === 'inherited';
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-[2px] px-1.5 py-0.5 text-[10px] leading-4',
        statusToneClass(current),
        compact && 'px-1'
      )}
      title={inherited ? `继承自 ${status?.from ?? '词形'}` : undefined}
    >
      {STATUS_LABELS[current]}
      {inherited && <span className="ml-1 opacity-70">继承</span>}
    </span>
  );
}

export function Meter({ value, total, tone = 'signal' }: { value: number; total: number; tone?: 'signal' | 'seal' | 'ink' }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  const color = tone === 'seal' ? 'var(--seal)' : tone === 'ink' ? 'var(--text-primary)' : 'var(--signal)';
  return (
    <span className="block h-1 w-full overflow-hidden rounded-full bg-[var(--bg-inset)]" aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'signal' | 'seal' | 'ink';
}) {
  return (
    <div className="min-w-0 border-l border-[var(--border-subtle)] pl-3 first:border-l-0 first:pl-0">
      <p className="eyebrow truncate">{label}</p>
      <p
        className="mt-1 truncate font-display text-[22px] leading-none tracking-tight"
        style={{ color: tone === 'signal' ? 'var(--signal)' : tone === 'seal' ? 'var(--seal)' : 'var(--text-primary)' }}
      >
        {value}
      </p>
      {sub && <p className="mt-1 truncate text-[10px] leading-tight text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}

export function Modal({
  open,
  title,
  eyebrow,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusables = (): HTMLElement[] =>
      panel
        ? [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
            (element) => element.offsetParent !== null
          )
        : [];
    const initial =
      panel?.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])') ?? focusables()[0] ?? panel;
    initial?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-[#101613]/50 px-4 pt-[8vh]" onMouseDown={() => onCloseRef.current()}>
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`rise-in w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} border border-[var(--border-strong)] bg-[var(--bg-elevated)]`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-4 py-3">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 className="font-display text-xl font-semibold leading-tight">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost px-1.5 py-1" aria-label="关闭">
            <X size={15} />
          </button>
        </header>
        <div className="scroll-thin max-h-[62vh] overflow-y-auto px-4 py-3">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

/** Small inline note with a coloured left rule; used for caveats and data semantics. */
export function Note({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'signal' | 'seal' }) {
  const color = tone === 'signal' ? 'var(--signal)' : tone === 'seal' ? 'var(--seal)' : 'var(--border-strong)';
  return (
    <p className="border-l-2 pl-2.5 text-[11px] leading-relaxed text-[var(--text-muted)]" style={{ borderColor: color }}>
      {children}
    </p>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { id: T; label: ReactNode; hint?: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="no-scrollbar flex items-center gap-5 overflow-x-auto border-b border-[var(--border-subtle)] px-4 lg:px-6">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={cx('tab', value === option.id && 'tab-active')}
        >
          {option.label}
          {option.hint && <span className="font-mono-tabular text-[10px] text-[var(--text-faint)]">{option.hint}</span>}
        </button>
      ))}
    </div>
  );
}
