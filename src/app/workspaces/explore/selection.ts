/**
 * Selection helpers (PRODUCT_SPEC §3.1: row checkboxes, Shift-range, bulk status).
 *
 * Selection is a set of entity refs, but every *action* works on learning targets. The mapping
 * mirrors `defaultTargetFor` for the kinds whose DTO already carries a single Form:
 *   form → itself, coca_headword / bnc_member → its Form, coca_lemma_pos → its `lp:` target.
 * Families and CET entries are aggregates (ADR-006): a family needs an explicit member choice and
 * an entry can link several spellings, so they are reported as skipped instead of guessing.
 */
import {
  kindOf,
  parseRef,
  refs,
  type EntityRef,
  type TargetRef,
  type EntityRowDTO,
} from '../../../v2/index.ts';

export interface TargetMapping {
  targets: TargetRef[];
  /** Selected entities that have no single learning target (aggregates). */
  skipped: EntityRef[];
}

type RowIdentity = Pick<EntityRowDTO, 'ref' | 'kind' | 'formRef'>;

export function targetForRow(row: RowIdentity): TargetRef | null {
  switch (row.kind) {
    case 'form':
      return row.ref as TargetRef;
    case 'coca_headword':
    case 'bnc_member':
      return (row.formRef as TargetRef | null) ?? null;
    case 'coca_lemma_pos': {
      if (!row.formRef) return null;
      const parts = parseRef(row.ref).parts;
      const pos = parts[1];
      if (!pos) return null;
      return refs.lemmaPosTarget(row.formRef.slice(2), pos);
    }
    case 'bnc_family':
    case 'cet_entry':
      return null;
  }
}

/** Distinct targets in row order; `skipped` keeps the aggregates the caller must explain. */
export function targetsForRows(rows: readonly RowIdentity[]): TargetMapping {
  const targets: TargetRef[] = [];
  const skipped: EntityRef[] = [];
  for (const row of rows) {
    const target = targetForRow(row);
    if (target === null) skipped.push(row.ref);
    else if (!targets.includes(target)) targets.push(target);
  }
  return { targets, skipped };
}

/** Ref range between two row indices, used by Shift-click and Shift+arrow inside loaded windows. */
export function refsBetween(rows: readonly EntityRef[], from: number, to: number): EntityRef[] {
  if (rows.length === 0) return [];
  const start = Math.max(0, Math.min(from, to));
  const end = Math.min(rows.length - 1, Math.max(from, to));
  if (end < start) return [];
  return rows.slice(start, end + 1);
}

export function selectionSummary(selected: ReadonlySet<EntityRef>): string {
  if (selected.size === 0) return '未选择';
  return `已选 ${selected.size} 项`;
}

/** True when every selected ref is a kind that can carry a learning target on its own. */
export function selectionHasOnlyTargets(rows: readonly RowIdentity[]): boolean {
  return rows.every((row) => targetForRow(row) !== null);
}

/** Short kind label used by the bulk bar to explain skipped rows. */
export function kindCounts(rows: readonly RowIdentity[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  return counts;
}

/** The ref's kind, safe for refs that came from the store/URL rather than from a row. */
export function safeKindOf(ref: EntityRef): string {
  try {
    return kindOf(ref);
  } catch {
    return 'unknown';
  }
}
