/**
 * One number with its identity. Derived metrics keep the literal （计算） suffix and a pencil
 * voice; missing values render as a dash with the source's “未收录” note, never as zero.
 */
import { METRICS, type MetricCell as MetricCellDTO, type MetricId } from '../../v2/index.ts';
import { formatMetricValue } from '../ui/format.ts';
import { cx } from '../ui/index.tsx';

export interface MetricCellProps {
  cell?: MetricCellDTO;
  metric?: MetricId;
  value?: number | null;
  label?: boolean;
  className?: string;
}

export function MetricCell({ cell, metric: metricOverride, value: valueOverride, label: showLabel = false, className }: MetricCellProps) {
  const metric = cell?.metric ?? metricOverride;
  if (!metric) return null;
  const definition = METRICS[metric];
  const value = valueOverride !== undefined ? valueOverride : cell?.value ?? null;
  const derived = (cell?.provenance ?? definition?.provenance) === 'derived';
  const missing = value === null;
  const title = missing
    ? `${definition?.source ?? ''} 未收录：${definition?.missing ?? 'not listed'}`
    : `${definition?.definition ?? ''}\n来源：${definition?.source ?? ''} · ${derived ? '计算指标' : '官方指标'}`;

  return (
    <span className={cx('inline-flex min-w-0 flex-col gap-0.5', className)} title={title}>
      {showLabel && <span className="eyebrow leading-tight">{cell?.label ?? definition?.label}</span>}
      <span
        className={cx(
          'font-mono-tabular text-[12px] leading-tight tabular-nums',
          missing && 'text-[var(--text-faint)]',
          derived && !missing && 'voice-computed'
        )}
      >
        {missing ? '—' : formatMetricValue(metric, value)}
        {missing && <span className="ml-0.5 text-[9px] align-super" aria-label="未收录">ᶠ</span>}
      </span>
    </span>
  );
}
