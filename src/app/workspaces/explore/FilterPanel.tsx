/**
 * Filter panel (PRODUCT_SPEC §3.1): collapsible facets over sources, COCA rank/band ranges, PoS,
 * CET level, learning status, spelling classes and the multi-* flags.
 *
 * The panel is controlled and stateless: it edits a copy of `ExploreFilters` and hands it back, so
 * the desktop aside can apply immediately while the mobile sheet can hold a draft until "apply".
 */
import type { ReactNode } from 'react';
import type { CocaPos, EntityKind, LearningStatus } from '../../../v2/index.ts';
import { SOURCE_IDS } from '../../../v2/index.ts';
import {
  CET_LEVELS,
  COCA_POS,
  EMPTY_FILTERS,
  SOURCE_LABELS,
  SPELLING_CLASSES,
  SPELLING_CLASS_LABELS,
  STATUS_LABELS,
  STATUS_KEYS,
  setRange,
  toggleSource,
  toggleValue,
  type ExploreFilters,
  type RangeFilter,
} from './filterState.ts';

export interface FilterPanelProps {
  value: ExploreFilters;
  onChange: (next: ExploreFilters) => void;
  /** Number of active facets, shown next to the panel title. */
  activeCount: number;
  /** Current kind: ranges it cannot satisfy are shown disabled with a written reason. */
  kind: EntityKind;
}

export function FilterPanel({ value, onChange, activeCount, kind }: FilterPanelProps) {
  const patch = (partial: Partial<ExploreFilters>): void => onChange({ ...value, ...partial });
  const lpOff = kind !== 'coca_lemma_pos';
  const hwOff = kind === 'bnc_family';

  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          筛选{activeCount > 0 ? ` · ${activeCount} 项` : ''}
        </span>
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FILTERS, extra: value.extra })}
          className="text-[11px] text-[var(--text-muted)] underline-offset-2 hover:text-[var(--accent-hover)] hover:underline"
        >
          清除
        </button>
      </div>

      {value.extra.length > 0 && (
        <p className="mx-1 rounded-lg bg-[var(--accent-soft)] px-2 py-1.5 text-[11px] text-[var(--accent-hover)]">
          来自链接的固定集合筛选（{value.extra.length} 项）已应用，无法在此面板编辑。
        </p>
      )}

      <Section title="数据源">
        <div className="space-y-1.5">
          {SOURCE_IDS.map((source) => (
            <div key={source} className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">{SOURCE_LABELS[source]}</span>
              <div className="flex gap-1">
                <Toggle
                  active={value.sourcesPresent.includes(source)}
                  label="有"
                  onClick={() => onChange(toggleSource(value, source, 'present'))}
                />
                <Toggle
                  active={value.sourcesAbsent.includes(source)}
                  label="无"
                  onClick={() => onChange(toggleSource(value, source, 'absent'))}
                  tone="muted"
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="COCA 词性">
        <div className="flex flex-wrap gap-1">
          {COCA_POS.map((pos) => (
            <Toggle
              key={pos}
              active={value.pos.includes(pos)}
              label={pos}
              onClick={() => patch({ pos: toggleValue<CocaPos>(value.pos, pos) })}
            />
          ))}
        </div>
      </Section>

      <Section title="频次与频段">
        <div className="space-y-2">
          <RangeRow
            label="COCA 官方排名"
            range={value.lpRank}
            onChange={(range) => patch({ lpRank: range })}
            placeholderMin="1"
            placeholderMax="1000"
            disabled={lpOff}
            disabledReason={lpOff ? '官方排名仅存在于「COCA 词性条目」，此处保留但不生效' : undefined}
          />
          <RangeRow
            label="COCA 词头排名（计算）"
            range={value.hwRank}
            onChange={(range) => patch({ hwRank: range })}
            placeholderMin="1"
            placeholderMax="5000"
            disabled={hwOff}
            disabledReason={hwOff ? '词头排名不会提升到 BNC 词族，此处保留但不生效' : undefined}
          />
          <RangeRow label="BNC 词族频段" range={value.band} onChange={(range) => patch({ band: range })} placeholderMin="1" placeholderMax="25" />
        </div>
      </Section>

      <Section title="CET 等级">
        <div className="flex gap-1">
          {CET_LEVELS.map((level) => (
            <Toggle
              key={level}
              active={value.cetLevels.includes(level)}
              label={level}
              onClick={() => patch({ cetLevels: toggleValue(value.cetLevels, level) })}
            />
          ))}
        </div>
      </Section>

      <Section title="学习状态">
        <div className="flex flex-wrap gap-1">
          {STATUS_KEYS.map((status) => (
            <Toggle
              key={status}
              active={value.status.includes(status)}
              label={STATUS_LABELS[status]}
              onClick={() => patch({ status: toggleValue<LearningStatus>(value.status, status) })}
            />
          ))}
        </div>
        <div className="mt-2 flex gap-3 text-[11px] text-[var(--text-muted)]">
          {(['effective', 'own'] as const).map((resolution) => (
            <label key={resolution} className="flex cursor-pointer items-center gap-1">
              <input
                type="radio"
                name="learning-resolution"
                checked={value.statusResolution === resolution}
                onChange={() => patch({ statusResolution: resolution })}
                className="accent-[var(--accent-primary)]"
              />
              {resolution === 'effective' ? '有效状态（含继承）' : '仅显式记录'}
            </label>
          ))}
        </div>
      </Section>

      <Section title="拼写类别">
        <div className="flex flex-wrap gap-1">
          {SPELLING_CLASSES.map((cls) => (
            <Toggle
              key={cls}
              active={value.spellingClasses.includes(cls)}
              label={SPELLING_CLASS_LABELS[cls]}
              onClick={() => patch({ spellingClasses: toggleValue(value.spellingClasses, cls) })}
            />
          ))}
        </div>
      </Section>

      <Section title="结构标记">
        <div className="space-y-1.5">
          <TriRow label="多词性（COCA 记录 > 1）" value={value.multiPos} onChange={(multiPos) => patch({ multiPos })} />
          <TriRow label="多词族归属（BNC 词族 > 1）" value={value.multiFamily} onChange={(multiFamily) => patch({ multiFamily })} />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg px-1" open>
      <summary className="flex cursor-pointer list-none items-center justify-between rounded px-1 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
        {title}
        <span className="text-[var(--text-muted)] transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="px-1 pb-2 pt-1">{children}</div>
    </details>
  );
}

function Toggle({ active, label, onClick, tone }: { active: boolean; label: string; onClick: () => void; tone?: 'muted' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
        active
          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-hover)]'
          : tone === 'muted'
            ? 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
            : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
      }`}
    >
      {label}
    </button>
  );
}

function RangeRow({
  label,
  range,
  onChange,
  placeholderMin,
  placeholderMax,
  disabled = false,
  disabledReason,
}: {
  label: string;
  range: RangeFilter;
  onChange: (range: RangeFilter) => void;
  placeholderMin: string;
  placeholderMax: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div className={disabled ? 'opacity-60' : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <div className="flex items-center gap-1">
          <NumberInput
            value={range.min}
            placeholder={placeholderMin}
            ariaLabel={`${label} 最小值`}
            onCommit={(raw) => onChange(setRange(range, 'min', raw))}
            disabled={disabled}
          />
          <span className="text-[var(--text-muted)]">–</span>
          <NumberInput
            value={range.max}
            placeholder={placeholderMax}
            ariaLabel={`${label} 最大值`}
            onCommit={(raw) => onChange(setRange(range, 'max', raw))}
            disabled={disabled}
          />
        </div>
      </div>
      {disabledReason && <p className="mt-0.5 text-right text-[10px] leading-snug text-[var(--text-muted)]">{disabledReason}</p>}
    </div>
  );
}

function NumberInput({
  value,
  placeholder,
  ariaLabel,
  onCommit,
  disabled = false,
}: {
  value: number | undefined;
  placeholder: string;
  ariaLabel: string;
  onCommit: (raw: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(event) => onCommit(event.target.value)}
      className="w-16 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-1 text-[11px] text-[var(--text-secondary)] disabled:cursor-not-allowed"
    />
  );
}

function TriRow({ label, value, onChange }: { label: string; value: boolean | null; onChange: (next: boolean | null) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <div className="flex gap-1">
        <Toggle active={value === null} label="任意" onClick={() => onChange(null)} tone="muted" />
        <Toggle active={value === true} label="是" onClick={() => onChange(true)} />
        <Toggle active={value === false} label="否" onClick={() => onChange(false)} />
      </div>
    </div>
  );
}
