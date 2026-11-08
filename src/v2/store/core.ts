/**
 * Lexical Workbench 2.0 — pure learning-store core.
 *
 * Patch application and batch undo as pure functions; the persistence layer only writes what
 * these return. Semantics (ARCHITECTURE §7, CONTRACTS §8):
 *   - one event per changed field group, in the order `status`, `tags`, `note`, `study`;
 *   - `before` holds only the changed fields, or `null` when the record did not exist yet;
 *   - a patch that changes nothing writes nothing (no event, no timestamp churn);
 *   - records never cascade: patching `lp:work|noun` never touches `f:work`;
 *   - undo replays a batch newest-first, so the oldest `before` wins, and deletes records the
 *     batch created.
 *
 * No Dexie, no DOM: this module runs in Node tests and in the browser alike.
 */
import type { TargetRef } from '../domain/ids.ts';
import { parseRef } from '../domain/ids.ts';
import {
  applyStatusChange,
  emptyRecord,
  type LearningEvent,
  type LearningRecord,
} from '../learning/model.ts';
import type { TargetPatch } from '../contracts.ts';

/** Record fields a patch or an event may change (everything except the target identity). */
export type LearningFields = Partial<Omit<LearningRecord, 'target'>>;

export interface ApplyPatchResult {
  /** Next record state; the input record itself when nothing changed. */
  record: LearningRecord;
  /** One event per changed field group, in the order status, tags, note, study. */
  events: LearningEvent[];
}

/**
 * Applies one user patch to one target. `prev === undefined` means the record does not exist yet,
 * which is why every emitted event then carries `before: null` (undo deletes it again).
 */
export function applyPatch(
  prev: LearningRecord | undefined,
  target: TargetRef,
  patch: TargetPatch,
  now: string,
  batchId: string | null = null
): ApplyPatchResult {
  const base = prev ?? emptyRecord(target, now);
  const record: LearningRecord = { ...base, tags: [...base.tags] };
  const events: LearningEvent[] = [];

  if (patch.status !== undefined && patch.status !== base.status) {
    // Reuse the learning model so status events keep one shape everywhere.
    const change = applyStatusChange(prev, target, patch.status, now, batchId);
    record.status = change.record.status;
    events.push(change.event);
  }

  if (patch.tags !== undefined && !sameStrings(patch.tags, base.tags)) {
    record.tags = [...patch.tags];
    events.push({
      at: now,
      target,
      type: 'tags',
      batchId,
      before: prev ? { tags: [...prev.tags] } : null,
      after: { tags: [...record.tags] },
    });
  }

  if (patch.note !== undefined && patch.note !== base.note) {
    record.note = patch.note;
    events.push({
      at: now,
      target,
      type: 'note',
      batchId,
      before: prev ? { note: prev.note } : null,
      after: { note: patch.note },
    });
  }

  if (patch.studied === true) {
    record.studyCount = base.studyCount + 1;
    record.lastStudiedAt = now;
    events.push({
      at: now,
      target,
      type: 'study',
      batchId,
      before: prev ? { studyCount: prev.studyCount, lastStudiedAt: prev.lastStudiedAt } : null,
      after: { studyCount: record.studyCount, lastStudiedAt: now },
    });
  }

  if (events.length === 0) return { record: base, events };
  record.updatedAt = now;
  return { record, events };
}

export interface UndoPlan {
  /** Records to write, in the order their targets first appeared in the event list. */
  records: LearningRecord[];
  /** Targets whose record must be deleted (the batch created them). */
  deleteTargets: TargetRef[];
  /** `revert` events describing what the undo changed, one per affected target. */
  events: LearningEvent[];
  /** Targets whose state the undo changed (written or deleted). */
  targets: TargetRef[];
  /**
   * Targets that appeared in the batch but whose current record is already gone, so there is
   * nothing faithful to restore onto. Reported instead of inventing a record.
   */
  skipped: TargetRef[];
}

/**
 * Reverts one batch's events (any order; they are sorted newest-first here).
 *
 * For each target the accumulated `before` values of older events overwrite newer ones, which
 * reproduces the state before the batch. A `before: null` event means the batch created the
 * record, so the record is deleted. Undo itself appends `revert` events, which makes the undo
 * visible in the history and undoable in turn.
 */
export function undoEvents(
  events: readonly LearningEvent[],
  current: (target: TargetRef) => LearningRecord | undefined,
  now: string,
  batchId: string | null = null
): UndoPlan {
  const ordered = [...events].sort(compareEventsNewestFirst);
  const initial = new Map<TargetRef, LearningRecord | undefined>();
  const next = new Map<TargetRef, LearningRecord | null>();
  const createdByBatch = new Set<TargetRef>();
  const order: TargetRef[] = [];

  for (const event of ordered) {
    if (event.type === 'revert') continue; // an undo batch is reverted by its own events only
    if (!next.has(event.target)) {
      const existing = current(event.target);
      initial.set(event.target, existing);
      next.set(event.target, existing ?? null);
      order.push(event.target);
    }
    const acc = next.get(event.target) ?? null;
    if (event.before === null) {
      createdByBatch.add(event.target);
      next.set(event.target, null);
      continue;
    }
    if (acc === null) continue; // record gone; handled per target below
    next.set(event.target, { ...acc, ...event.before, updatedAt: now });
  }

  const plan: UndoPlan = { records: [], deleteTargets: [], events: [], targets: [], skipped: [] };
  for (const target of order) {
    const before0 = initial.get(target);
    const restored = next.get(target) ?? null;

    if (restored === null) {
      if (!before0) {
        // Created by this batch and already gone → nothing to do; otherwise the record was
        // removed elsewhere and cannot be restored without inventing its history.
        if (!createdByBatch.has(target)) plan.skipped.push(target);
        continue;
      }
      plan.deleteTargets.push(target);
      plan.targets.push(target);
      plan.events.push({
        at: now,
        target,
        type: 'revert',
        batchId,
        before: fullFields(before0),
        after: {},
      });
      continue;
    }

    if (!before0) {
      plan.skipped.push(target);
      continue;
    }

    const diff = diffFields(before0, restored);
    if (!diff) continue; // already in the target state; nothing to write
    plan.records.push(restored);
    plan.targets.push(target);
    plan.events.push({ at: now, target, type: 'revert', batchId, before: diff.before, after: diff.after });
  }
  return plan;
}

/** One batch id per user action; unique across sessions and cheap to recognise in logs. */
export function nextBatchId(now: string): string {
  const stamp = now.replace(/[^0-9]/g, '').slice(0, 17);
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
  const suffix = uuid ? uuid.slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `batch-${stamp}-${suffix}`;
}

/** Distinct targets in first-appearance order (one user action must not patch a target twice). */
export function dedupeTargets(targets: readonly TargetRef[]): TargetRef[] {
  return [...new Set(targets)];
}

/**
 * Runtime guard for values that came from JSON (imports) or from persisted arrays: a learning
 * target is `f:<formKey>` or `lp:<formKey>|<pos>` with both parts present.
 */
export function isTargetRef(value: unknown): value is TargetRef {
  if (typeof value !== 'string') return false;
  try {
    const parsed = parseRef(value);
    if (parsed.kind === 'form') return parsed.key.length > 0;
    if (parsed.kind !== 'lemma_pos_target') return false;
    return parsed.parts.length === 2 && parsed.parts[0].length > 0 && parsed.parts[1].length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

/** Newest event first: later `at` wins, ties broken by the auto-increment id. */
export function compareEventsNewestFirst(a: LearningEvent, b: LearningEvent): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  return (b.id ?? 0) - (a.id ?? 0);
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function fullFields(record: LearningRecord): LearningFields {
  return {
    status: record.status,
    tags: [...record.tags],
    note: record.note,
    studyCount: record.studyCount,
    lastStudiedAt: record.lastStudiedAt,
  };
}

/** Changed field groups between two record states; `null` when they are equal. */
function diffFields(prev: LearningRecord, next: LearningRecord): { before: LearningFields; after: LearningFields } | null {
  const before: LearningFields = {};
  const after: LearningFields = {};

  if (prev.status !== next.status) {
    before.status = prev.status;
    after.status = next.status;
  }
  if (!sameStrings(prev.tags, next.tags)) {
    before.tags = [...prev.tags];
    after.tags = [...next.tags];
  }
  if (prev.note !== next.note) {
    before.note = prev.note;
    after.note = next.note;
  }
  if (prev.studyCount !== next.studyCount || prev.lastStudiedAt !== next.lastStudiedAt) {
    before.studyCount = prev.studyCount;
    before.lastStudiedAt = prev.lastStudiedAt;
    after.studyCount = next.studyCount;
    after.lastStudiedAt = next.lastStudiedAt;
  }

  return Object.keys(before).length === 0 ? null : { before, after };
}
