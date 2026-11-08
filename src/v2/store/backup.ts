/**
 * Lexical Workbench 2.0 — user-data backup (ARCHITECTURE §8.2, PRODUCT_SPEC §3.6).
 *
 * A backup is one JSON document with `version: 2` holding records, events and collections.
 * Restore supports **replace mode only**: the v2 database is not migrated from any other shape,
 * and a partial merge would hide idempotency bugs. Import is validated before anything is
 * deleted, and the replacement runs in ONE transaction over all three tables.
 *
 * After a successful import the caller must refresh the store cache with `store.load()`.
 */
import type { EntityKind } from '../domain/ids.ts';
import { ENTITY_KINDS } from '../domain/ids.ts';
import type { LexQuery } from '../engine/query.ts';
import { LEARNING_STATUSES, type LearningEvent, type LearningRecord } from '../learning/model.ts';
import type { Collection } from '../contracts.ts';
import { isTargetRef } from './core.ts';
import type { LexicalWorkbenchDB } from './dexieStore.ts';

export const BACKUP_VERSION = 2;

export interface BackupPayloadV2 {
  version: 2;
  records: LearningRecord[];
  events: LearningEvent[];
  collections: Collection[];
  exportedAt: string;
}

export type BackupErrorCode =
  | 'invalid_json'
  | 'unsupported_version'
  | 'invalid_record'
  | 'invalid_event'
  | 'invalid_collection'
  | 'duplicate_record';

export class BackupError extends Error {
  constructor(
    public readonly code: BackupErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

const EVENT_TYPES: readonly LearningEvent['type'][] = ['status', 'study', 'tags', 'note', 'import', 'revert'];

export interface BackupCounts {
  records: number;
  events: number;
  collections: number;
}

/** Full export of the user database (keeps event ids so the history stays addressable). */
export async function exportBackup(db: LexicalWorkbenchDB, now: string = new Date().toISOString()): Promise<BackupPayloadV2> {
  const [records, events, collections] = await Promise.all([
    db.learningRecords.toArray(),
    db.learningEvents.toArray(),
    db.collections.toArray(),
  ]);
  events.sort((a, b) => (a.at === b.at ? (a.id ?? 0) - (b.id ?? 0) : a.at < b.at ? -1 : 1));
  return { version: BACKUP_VERSION, records, events, collections, exportedAt: now };
}

export function serializeBackup(payload: BackupPayloadV2): string {
  return JSON.stringify(payload, null, 2);
}

/** Parses and fully validates a backup document; never repairs values it does not understand. */
export function parseBackup(text: string): BackupPayloadV2 {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('invalid_json', 'backup file is not valid JSON');
  }
  return validatePayload(raw);
}

/** Validates an already-parsed document (used by import and by tests). */
export function validatePayload(raw: unknown): BackupPayloadV2 {
  if (!isObject(raw)) throw new BackupError('invalid_json', 'backup root must be an object');
  if (raw.version !== BACKUP_VERSION) {
    throw new BackupError(
      'unsupported_version',
      `backup version ${String(raw.version)} is not supported (expected ${BACKUP_VERSION})`
    );
  }
  const exportedAt = typeof raw.exportedAt === 'string' ? raw.exportedAt : fail('invalid_json', 'exportedAt must be a string');
  if (!Array.isArray(raw.records)) fail('invalid_record', 'records must be an array');
  if (!Array.isArray(raw.events)) fail('invalid_event', 'events must be an array');
  if (!Array.isArray(raw.collections)) fail('invalid_collection', 'collections must be an array');

  const seen = new Set<string>();
  const records = raw.records.map((value, index) => {
    const record = validateRecord(value, index);
    if (seen.has(record.target)) fail('duplicate_record', `records[${index}] duplicates target ${record.target}`);
    seen.add(record.target);
    return record;
  });

  return {
    version: BACKUP_VERSION,
    records,
    events: raw.events.map(validateEvent),
    collections: raw.collections.map(validateCollection),
    exportedAt,
  };
}

/**
 * Replaces the stored user data with the payload. The payload is validated first, so an invalid
 * document leaves the database untouched.
 */
export async function importBackup(
  db: LexicalWorkbenchDB,
  payload: unknown,
  _opts: { mode?: 'replace' } = {}
): Promise<BackupCounts> {
  const valid = validatePayload(payload);
  const counts: BackupCounts = {
    records: valid.records.length,
    events: valid.events.length,
    collections: valid.collections.length,
  };

  await db.transaction('rw', db.learningRecords, db.learningEvents, db.collections, async () => {
    await Promise.all([db.learningRecords.clear(), db.learningEvents.clear(), db.collections.clear()]);
    if (valid.records.length > 0) await db.learningRecords.bulkPut(valid.records);
    if (valid.events.length > 0) await db.learningEvents.bulkPut(valid.events);
    if (valid.collections.length > 0) await db.collections.bulkPut(valid.collections);
  });
  return counts;
}

/** Convenience: validate text, then replace. */
export async function restoreFromJson(db: LexicalWorkbenchDB, text: string): Promise<BackupCounts> {
  return importBackup(db, parseBackup(text));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateRecord(value: unknown, index: number): LearningRecord {
  const path = `records[${index}]`;
  const row = asObject(value, 'invalid_record', path);
  const target = row.target;
  if (!isTargetRef(target)) fail('invalid_record', `${path}.target is not a learning target`);

  const status = row.status;
  if (typeof status !== 'string' || !(LEARNING_STATUSES as readonly string[]).includes(status)) {
    fail('invalid_record', `${path}.status is not a learning status`);
  }
  const tags = row.tags;
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
    fail('invalid_record', `${path}.tags must be an array of strings`);
  }
  const note = row.note;
  if (typeof note !== 'string') fail('invalid_record', `${path}.note must be a string`);
  const studyCount = row.studyCount;
  if (typeof studyCount !== 'number' || !Number.isFinite(studyCount) || studyCount < 0) {
    fail('invalid_record', `${path}.studyCount must be a non-negative number`);
  }
  const createdAt = isoTimestamp(row.createdAt, 'invalid_record', `${path}.createdAt`);
  const updatedAt = isoTimestamp(row.updatedAt, 'invalid_record', `${path}.updatedAt`);
  const lastStudiedAt = row.lastStudiedAt === null ? null : isoTimestamp(row.lastStudiedAt, 'invalid_record', `${path}.lastStudiedAt`);

  return {
    target,
    status: status as LearningRecord['status'],
    tags: [...(tags as string[])],
    note,
    studyCount,
    createdAt,
    updatedAt,
    lastStudiedAt,
  };
}

function validateEvent(value: unknown, index: number): LearningEvent {
  const path = `events[${index}]`;
  const row = asObject(value, 'invalid_event', path);
  const target = row.target;
  if (!isTargetRef(target)) fail('invalid_event', `${path}.target is not a learning target`);
  const type = row.type;
  if (typeof type !== 'string' || !(EVENT_TYPES as readonly string[]).includes(type)) {
    fail('invalid_event', `${path}.type is not a learning event type`);
  }
  const at = isoTimestamp(row.at, 'invalid_event', `${path}.at`);
  const batchId = row.batchId === null || row.batchId === undefined ? null : asString(row.batchId, 'invalid_event', `${path}.batchId`);
  const before = row.before === null || row.before === undefined ? null : asObject(row.before, 'invalid_event', `${path}.before`);
  const after = asObject(row.after, 'invalid_event', `${path}.after`);
  const event: LearningEvent = {
    at,
    target,
    type: type as LearningEvent['type'],
    batchId,
    before,
    after,
  };
  if (row.id !== undefined && row.id !== null) {
    if (typeof row.id !== 'number' || !Number.isInteger(row.id)) fail('invalid_event', `${path}.id must be an integer`);
    event.id = row.id;
  }
  if (row.sourceLabel !== undefined) {
    event.sourceLabel = asString(row.sourceLabel, 'invalid_event', `${path}.sourceLabel`);
  }
  return event;
}

function validateCollection(value: unknown, index: number): Collection {
  const path = `collections[${index}]`;
  const row = asObject(value, 'invalid_collection', path);
  const id = asString(row.id, 'invalid_collection', `${path}.id`);
  const name = asString(row.name, 'invalid_collection', `${path}.name`);
  const description = typeof row.description === 'string' ? row.description : '';
  const createdAt = isoTimestamp(row.createdAt, 'invalid_collection', `${path}.createdAt`);
  const updatedAt = isoTimestamp(row.updatedAt, 'invalid_collection', `${path}.updatedAt`);

  if (row.kind === 'static') {
    if (!Array.isArray(row.targets)) fail('invalid_collection', `${path}.targets must be an array`);
    const targets = row.targets.map((t, i) => {
      if (!isTargetRef(t)) fail('invalid_collection', `${path}.targets[${i}] is not a learning target`);
      return t;
    });
    if (new Set(targets).size !== targets.length) fail('invalid_collection', `${path}.targets contains duplicates`);
    return { id, kind: 'static', name, description, targets, createdAt, updatedAt };
  }

  if (row.kind === 'dynamic') {
    const query = asObject(row.query, 'invalid_collection', `${path}.query`);
    if (typeof query.kind !== 'string' || !ENTITY_KINDS.includes(query.kind as EntityKind)) {
      fail('invalid_collection', `${path}.query.kind is not an entity kind`);
    }
    // Deeper query grammar is owned by the query protocol; a malformed filter simply matches
    // nothing there, so the import does not rewrite it.
    return { id, kind: 'dynamic', name, description, query: query as unknown as LexQuery, createdAt, updatedAt };
  }

  return fail('invalid_collection', `${path}.kind must be "static" or "dynamic"`);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fail(code: BackupErrorCode, message: string): never {
  throw new BackupError(code, message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown, code: BackupErrorCode, path: string): Record<string, unknown> {
  if (!isObject(value)) fail(code, `${path} must be an object`);
  return value;
}

function asString(value: unknown, code: BackupErrorCode, path: string): string {
  if (typeof value !== 'string') fail(code, `${path} must be a string`);
  return value;
}

function isoTimestamp(value: unknown, code: BackupErrorCode, path: string): string {
  const text = asString(value, code, path);
  if (Number.isNaN(Date.parse(text))) fail(code, `${path} must be an ISO timestamp`);
  return text;
}
