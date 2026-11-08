/** A ref rendered as a labelled chip. Clicking opens that entity in the detail panel. */
import { ArrowUpRight } from 'lucide-react';
import type { EntityKind, EntityRef } from '../../v2/index.ts';

const KIND_TAG: Record<EntityKind, string> = {
  form: 'FORM',
  coca_headword: 'COCA·HW',
  coca_lemma_pos: 'COCA·LP',
  bnc_family: 'BNC·FAM',
  bnc_member: 'BNC·MEM',
  cet_entry: 'CET',
};

export function EntityChip({
  entityRef,
  label,
  kind,
  onOpen,
  suffix,
}: {
  entityRef: EntityRef;
  label: string;
  kind: EntityKind;
  onOpen?: (ref: EntityRef) => void;
  suffix?: string;
}) {
  const content = (
    <>
      <span className="font-mono-tabular text-[8px] uppercase tracking-[0.14em] text-[var(--text-faint)]">{KIND_TAG[kind]}</span>
      <span className="max-w-[190px] truncate font-display text-[13px] leading-5">{label}</span>
      {suffix && <span className="font-mono-tabular text-[9px] text-[var(--text-muted)]">{suffix}</span>}
      {onOpen && <ArrowUpRight size={10} className="opacity-45" aria-hidden />}
    </>
  );

  if (!onOpen) {
    return <span className="inline-flex items-center gap-1.5 border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-1">{content}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(entityRef)}
      className="inline-flex items-center gap-1.5 border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-1 text-left transition-colors hover:border-[var(--signal)] hover:bg-[var(--signal-soft)]"
    >
      {content}
    </button>
  );
}
