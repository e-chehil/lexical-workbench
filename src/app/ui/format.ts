/** Display formatting shared by every workspace. Data semantics stay in the engine. */
import { METRICS, type MetricId, type MetricCell } from '../../v2/index.ts';

export function n(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('en-US');
}

export function rank(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `#${value.toLocaleString('en-US')}`;
}

export function band(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value}k`;
}

export function ratio(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(digits)}%`;
}

export function formatMetricValue(metric: MetricId, value: number | null): string {
  if (value === null) return '—';
  switch (METRICS[metric]?.unit) {
    case 'ratio':
      return ratio(value);
    case 'rank':
      return rank(value);
    case 'band':
      return band(value);
    case 'occurrences':
    case 'count':
      return n(value);
    default:
      return String(value);
  }
}

export function formatCell(cell: MetricCell | undefined): string {
  if (!cell) return '—';
  return formatMetricValue(cell.metric, cell.value);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function truncate(value: string, length = 42): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
