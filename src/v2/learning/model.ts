/**
 * Lexical Workbench 2.0 — personal learning model (pure functions, no storage).
 *
 * ADR-006: users learn TARGETS, which are either
 *   - a Form            `f:<formKey>`          (default; "this word as I see it")
 *   - a lemma + PoS     `lp:<formKey>|<pos>`   (opt-in refinement, PoS from COCA)
 * Records are independent; nothing cascades on write. A PoS target without its own record
 * INHERITS the Form record's status for display and statistics (origin = 'inherited').
 * Families and CET entries are never targets: their progress is aggregated from member forms.
 */
import { kindOf, parseRef, refs, type EntityRef, type TargetRef } from '../domain/ids.ts';
import type { CocaPos } from '../domain/types.ts';
import type { LexicalIndex } from '../engine/lexicalIndex.ts';

export type LearningStatus = 'unrated' | 'queued' | 'learning' | 'mastered' | 'deferred';
export const LEARNING_STATUSES: readonly LearningStatus[] = ['unrated', 'queued', 'learning', 'mastered', 'deferred'];

export interface LearningRecord {
  target: TargetRef;
  status: LearningStatus;
  tags: string[];
  note: string;
  /** Number of explicit "studied" touches. */
  studyCount: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  lastStudiedAt: string | null;
}

export type LearningEventType = 'status' | 'study' | 'tags' | 'note' | 'import' | 'revert';

/** Append-only event log entry. `before`/`after` hold only the changed fields. */
export interface LearningEvent {
  id?: number;
  at: string; // ISO
  target: TargetRef;
  type: LearningEventType;
  batchId: string | null;
  before: Partial<Omit<LearningRecord, 'target'>> | null; // null = record did not exist
  after: Partial<Omit<LearningRecord, 'target'>>;
  sourceLabel?: string;
}

export interface LearningStateReader {
  get(target: TargetRef): LearningRecord | undefined;
  all(): Iterable<LearningRecord>;
}

export class InMemoryLearningState implements LearningStateReader {
  private readonly map = new Map<TargetRef, LearningRecord>();
  constructor(records: Iterable<LearningRecord> = []) {
    for (const r of records) this.map.set(r.target, r);
  }
  get(target: TargetRef) {
    return this.map.get(target);
  }
  all() {
    return this.map.values();
  }
  put(record: LearningRecord) {
    this.map.set(record.target, record);
  }
}

export function emptyRecord(target: TargetRef, now: string): LearningRecord {
  return { target, status: 'unrated', tags: [], note: '', studyCount: 0, createdAt: now, updatedAt: now, lastStudiedAt: null };
}

/** Pure status change → [next record, event]. Storage layers persist both atomically. */
export function applyStatusChange(
  prev: LearningRecord | undefined,
  target: TargetRef,
  status: LearningStatus,
  now: string,
  batchId: string | null = null
): { record: LearningRecord; event: LearningEvent } {
  const base = prev ?? emptyRecord(target, now);
  const record: LearningRecord = { ...base, status, updatedAt: now };
  return {
    record,
    event: { at: now, target, type: 'status', batchId, before: prev ? { status: prev.status } : null, after: { status } },
  };
}

/**
 * Default learning target when the user acts on a row of the given entity kind.
 * bnc_family → null (aggregate only; UI must pick member forms explicitly).
 */
export function defaultTargetFor(index: LexicalIndex, ref: EntityRef): TargetRef | null {
  switch (kindOf(ref)) {
    case 'form':
      return ref as TargetRef;
    case 'coca_headword': {
      const h = index.cocaHeadwords.get(ref);
      return h ? (h.formRef as TargetRef) : null;
    }
    case 'coca_lemma_pos': {
      const r = index.cocaRecords.get(ref);
      return r ? refs.lemmaPosTarget(r.headword, r.pos) : null;
    }
    case 'bnc_member': {
      const m = index.bncMembers.get(ref);
      return m ? (m.formRef as TargetRef) : null;
    }
    case 'cet_entry': {
      const head = index.cetEntries.get(ref)?.links[0];
      return head ? (head.formRef as TargetRef) : null;
    }
    case 'bnc_family':
      return null;
  }
}

export type StatusOrigin = 'own' | 'inherited' | 'default';

export interface EffectiveStatus {
  status: LearningStatus;
  origin: StatusOrigin;
  /** Target whose record supplied the status (own or parent form). */
  from: TargetRef | null;
}

export function formTargetOfLemmaPos(target: TargetRef): TargetRef {
  const p = parseRef(target);
  if (p.kind !== 'lemma_pos_target') throw new Error(`not a lemma+PoS target: ${target}`);
  return `f:${p.parts[0]}`;
}

export function resolveEffectiveStatus(reader: LearningStateReader, target: TargetRef): EffectiveStatus {
  const own = reader.get(target);
  if (own) return { status: own.status, origin: 'own', from: target };
  if (target.startsWith('lp:')) {
    const parent = formTargetOfLemmaPos(target);
    const p = reader.get(parent);
    if (p) return { status: p.status, origin: 'inherited', from: parent };
  }
  return { status: 'unrated', origin: 'default', from: null };
}

export interface PosStatusRow {
  pos: CocaPos;
  lemmaPosRef: EntityRef;
  target: TargetRef;
  effective: EffectiveStatus;
}

/** PoS breakdown for a form ("work": noun mastered (own) · verb learning (inherited)). */
export function posBreakdown(index: LexicalIndex, reader: LearningStateReader, formRef: EntityRef): PosStatusRow[] {
  const hwRef = index.forms.get(formRef)?.cocaHeadwordRef;
  if (!hwRef) return [];
  return index.cocaHeadwords.get(hwRef)!.lemmaPosRefs.map((lp) => {
    const rec = index.cocaRecords.get(lp)!;
    const target = refs.lemmaPosTarget(rec.headword, rec.pos);
    return { pos: rec.pos, lemmaPosRef: lp, target, effective: resolveEffectiveStatus(reader, target) };
  });
}

// ---------------------------------------------------------------------------
// Coverage metrics (software-computed; UI must label them as 计算指标)
// ---------------------------------------------------------------------------

export interface CoverageResult {
  /** Stable id of the coverage definition (see CONTRACTS.md §6). */
  definition: 'coverage.coca_lp_weighted' | 'coverage.bnc_member_weighted';
  numerator: number;
  denominator: number;
  /** null when denominator is 0. */
  ratio: number | null;
  unitsInScope: number;
  unitsCounted: number;
}

/**
 * COCA frequency-weighted coverage over lemma+PoS records with official rank ≤ maxRank.
 * Numerator: Σ lp_freq of records whose EFFECTIVE status ∈ countedStatuses.
 * Denominator: Σ lp_freq of all records in scope. Each record counted once (records are
 * disjoint token sets in COCA), so there is no double counting across PoS.
 */
export function computeCocaWeightedCoverage(
  index: LexicalIndex,
  reader: LearningStateReader,
  opts: { maxRank?: number; countedStatuses?: LearningStatus[] } = {}
): CoverageResult {
  const counted = new Set(opts.countedStatuses ?? ['mastered']);
  const maxRank = opts.maxRank ?? Infinity;
  let numerator = 0;
  let denominator = 0;
  let unitsInScope = 0;
  let unitsCounted = 0;
  for (const r of index.cocaRecords.values()) {
    if (r.rank > maxRank) continue;
    unitsInScope++;
    denominator += r.freq;
    const eff = resolveEffectiveStatus(reader, refs.lemmaPosTarget(r.headword, r.pos));
    if (counted.has(eff.status)) {
      numerator += r.freq;
      unitsCounted++;
    }
  }
  return { definition: 'coverage.coca_lp_weighted', numerator, denominator, ratio: denominator ? numerator / denominator : null, unitsInScope, unitsCounted };
}

/**
 * BNC member-frequency-weighted coverage over memberships of families in bands [minBand, maxBand].
 * Status comes from the member's Form target. Family totals are not used.
 */
export function computeBncMemberWeightedCoverage(
  index: LexicalIndex,
  reader: LearningStateReader,
  opts: { minBand?: number; maxBand?: number; familyRef?: EntityRef; countedStatuses?: LearningStatus[] } = {}
): CoverageResult {
  const counted = new Set(opts.countedStatuses ?? ['mastered']);
  let numerator = 0;
  let denominator = 0;
  let unitsInScope = 0;
  let unitsCounted = 0;
  for (const m of index.bncMembers.values()) {
    if (opts.familyRef && m.familyRef !== opts.familyRef) continue;
    const band = index.getObservation('bnc25k.family_band', m.familyRef)!;
    if (band < (opts.minBand ?? 1) || band > (opts.maxBand ?? 25)) continue;
    unitsInScope++;
    denominator += m.frequency;
    if (counted.has(resolveEffectiveStatus(reader, m.formRef as TargetRef).status)) {
      numerator += m.frequency;
      unitsCounted++;
    }
  }
  return { definition: 'coverage.bnc_member_weighted', numerator, denominator, ratio: denominator ? numerator / denominator : null, unitsInScope, unitsCounted };
}
