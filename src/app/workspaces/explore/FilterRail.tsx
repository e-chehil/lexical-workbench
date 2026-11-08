/**
 * Inline filter rail (desktop ≥1280). The same component is rendered in the mobile sheet with a
 * draft state; ranges a kind cannot satisfy stay visible but disabled with a written reason.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { CocaPos, EntityKind, LearningStatus } from '../../../v2/index.ts';
import { SOURCE_IDS } from '../../../v2/index.ts';
import {
  CET_LEVELS,
  COCA_POS,
  EMPTY_FILTERS,
  SOURCE_LABELS,
  SPELLING_CLASSES,
  SPELLING_CLASS_LABELS,
  STATUS_KEYS,
  STATUS_LABELS,
  setRange,
  toggleSource,
  toggleValue,
  type ExploreFilters,
  type RangeFilter,
} from './filterState.ts';
import { cx } from '../../ui/index.tsx';

export function FilterRail({
  value,
  onChange,
  kind,
  activeCount,
}: {
  value: ExploreFilters;
  onChange: (next: ExploreFilters) => void;
  kind: EntityKind;
  activeCount: number;
}) {
  const patch = (partial: Partial<ExploreFilters>): void => onChange({ ...value, ...partial });
  const lpOff = kind !== 'coca_lemma_pos';
  const hwOff = kind === 'bnc_family';
  const statusOff = kind === 'bnc_family' || kind === 'cet_entry';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2.5">
        <p className="eyebrow">Filters {activeCount > 0 ? `· ${activeCount}` : ''}</p>
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FILTERS, extra: value.extra })}
          className="font-mono-tabular text-[10px] text-[var(--text-muted)] underline-offset-2 hover:text-[var(--signal)] hover:underline"
        >
          CLEAR
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {value.extra.length > 0 && (
          <p className="mt-2 border-l-2 border-[var(--signal)] bg-[var(--signal-soft)] px-2 py-1.5 text-[10px] leading-relaxed text-[var(--signal-hover)]">
            链接带来的固定集合（{value.extra.length} 项）正在生效；这里不编辑它，可在查询头移除。
          </p>
        )}

        <Section title="数据源">
          {SOURCE_IDS.map((source) => (
            <div key={source} className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-[11px] text-[var(--text-secondary)]">{SOURCE_LABELS[source]}</span>
              <span className="flex gap-1">
                <Toggle active={value.sourcesPresent.includes(source)} label="有" onClick={() => onChange(toggleSource(value, source, 'present'))} />
                <Toggle active={value.sourcesAbsent.includes(source)} label="无" onClick={() => onChange(toggleSource(value, source, 'absent'))} />
              </span>
            </div>
          ))}
        </Section>

        <Section title="学习状态">
          <div className={statusOff ? 'opacity-55' : undefined}>
          <div className="flex flex-wrap gap-1">
            {STATUS_KEYS.map((status) => (
              <Toggle
                key={status}
                active={value.status.includes(status)}
                label={STATUS_LABELS[status]}
                onClick={() => patch({ status: toggleValue<LearningStatus>(value.status, status) })}
                disabled={statusOff}
              />
            ))}
          </div>
          <div className="mt-2 space-y-1">
            <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <input type="radio" disabled={statusOff} checked={value.statusResolution === 'effective'} onChange={() => patch({ statusResolution: 'effective' })} />
              有效状态（含继承）
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <input type="radio" disabled={statusOff} checked={value.statusResolution === 'own'} onChange={() => patch({ statusResolution: 'own' })} />
              仅显式记录
            </label>
          </div>
          {statusOff && <p className="mt-1 text-[9px] leading-snug text-[var(--text-muted)]">词族与 CET 词目是聚合单位，没有独立学习目标；请在成员词形上标记。</p>}
          </div>
        </Section>

        <Section title="COCA 词性">
          <div className="flex flex-wrap gap-1">
            {COCA_POS.map((pos) => (
              <Toggle key={pos} active={value.pos.includes(pos)} label={pos} onClick={() => patch({ pos: toggleValue<CocaPos>(value.pos, pos) })} />
            ))}
          </div>
        </Section>

        <Section title="排名与频段">
          <div className="space-y-2">
            <RangeRow
              label="官方排名"
              range={value.lpRank}
              onChange={(range) => patch({ lpRank: range })}
              placeholderMin="1"
              placeholderMax="1000"
              disabled={lpOff}
              disabledReason={lpOff ? '官方排名只存在于「COCA 词性条目」' : undefined}
            />
            <RangeRow
              label="词头排名"
              range={value.hwRank}
              onChange={(range) => patch({ hwRank: range })}
              placeholderMin="1"
              placeholderMax="5000"
              disabled={hwOff}
              disabledReason={hwOff ? '词头排名不会提升到 BNC 词族' : undefined}
            />
            <RangeRow label="BNC 频段" range={value.band} onChange={(range) => patch({ band: range })} placeholderMin="1" placeholderMax="25" />
          </div>
        </Section>

        <Section title="CET 等级">
          <div className="flex gap-1">
            {CET_LEVELS.map((level) => (
              <Toggle key={level} active={value.cetLevels.includes(level)} label={level} onClick={() => patch({ cetLevels: toggleValue(value.cetLevels, level) })} />
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
          <TriRow label="多词性" value={value.multiPos} onChange={(multiPos) => patch({ multiPos })} />
          <TriRow label="多词族归属" value={value.multiFamily} onChange={(multiFamily) => patch({ multiFamily })} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="border-b border-[var(--border-hairline)] py-1.5 last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between py-1 text-[11px] font-medium text-[var(--text-secondary)]">
        {title}
        <span className="font-mono-tabular text-[9px] text-[var(--text-faint)]">＋</span>
      </summary>
      <div className="pb-1 pt-0.5">{children}</div>
    </details>
  );
}

function Toggle({ active, label, onClick, disabled = false }: { active: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-pressed={active} className={cx('chip !px-1.5 !py-0.5 text-[10px]', active && 'chip-active', disabled && 'cursor-not-allowed opacity-50')}>
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
    <div className={disabled ? 'opacity-55' : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-[var(--text-secondary)]">{label}</span>
        <div className="flex items-center gap-1">
          <RangeInput value={range.min} placeholder={placeholderMin} disabled={disabled} onCommit={(raw) => onChange(setRange(range, 'min', raw))} />
          <span className="text-[var(--text-faint)]">–</span>
          <RangeInput value={range.max} placeholder={placeholderMax} disabled={disabled} onCommit={(raw) => onChange(setRange(range, 'max', raw))} />
        </div>
      </div>
      {disabledReason && <p className="mt-0.5 text-right text-[9px] leading-snug text-[var(--text-muted)]">{disabledReason}</p>}
    </div>
  );
}

function RangeInput({ value, placeholder, disabled, onCommit }: { value: number | undefined; placeholder: string; disabled?: boolean; onCommit: (raw: string) => void }) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
  return (
    <input
      inputMode="numeric"
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onCommit(draft);
        }
      }}
      className="w-[54px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1 py-0.5 text-right font-mono-tabular text-[10px] outline-none focus:border-[var(--signal)]"
    />
  );
}

function TriRow({ label, value, onChange }: { label: string; value: boolean | null; onChange: (value: boolean | null) => void }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[10px] text-[var(--text-secondary)]">{label}</span>
      <span className="flex gap-1">
        {[
          { value: true, label: '是' },
          { value: false, label: '否' },
          { value: null, label: '不限' },
        ].map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={cx('chip !px-1.5 !py-0.5 text-[10px]', value === option.value && 'chip-active')}
          >
            {option.label}
          </button>
        ))}
      </span>
    </div>
  );
}
