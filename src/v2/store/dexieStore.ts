/**
 * Lexical Workbench 2.0 — user database (ARCHITECTURE §8.2, ADR-007).
 *
 * Only user data lives here: learning records/events, collections, custom source texts and UI
 * settings. The lexical index itself is rebuilt in the worker from the source files.
 *
 * The v1 database (`LexicalWorkbenchDB_v1`) is intentionally NOT migrated: the project has no
 * production data, so v2 starts with an empty database.
 *
 * This module imports Dexie and is therefore imported by app code directly, not through
 * `src/v2/index.ts` (only the pure core is re-exported there).
 */
import Dexie, { type Table } from 'dexie';
import type { SourceId, TargetRef } from '../domain/ids.ts';
import type { Collection, LearningStore, TargetPatch } from '../contracts.ts';
import type { LearningEvent, LearningRecord } from '../learning/model.ts';
import { applyPatch, compareEventsNewestFirst, dedupeTargets, nextBatchId, undoEvents } from './core.ts';

export const DB_NAME = 'LexicalWorkbenchDB_v2';

/** Newest-first default for the event timeline (the table grows without bound). */
export const DEFAULT_EVENT_LIMIT = 200;

/** Raw replacement text for one source, uploaded in Data Studio (T13). */
export interface CustomSourceRow {
  sourceId: SourceId;
  content: string;
  updatedAt: string;
}

/** UI preference row; `value` is JSON-serialisable app state. */
export interface SettingRow {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class LexicalWorkbenchDB extends Dexie {
  learningRecords!: Table<LearningRecord, string>;
  learningEvents!: Table<LearningEvent, number>;
  collections!: Table<Collection, string>;
  customSources!: Table<CustomSourceRow, string>;
  settings!: Table<SettingRow, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      learningRecords: 'target, status, updatedAt, *tags',
      learningEvents: '++id, target, at, batchId, type',
      collections: 'id, kind, updatedAt',
      customSources: 'sourceId, updatedAt',
      settings: 'key',
    });
  }
}

export function openDatabase(name: string = DB_NAME): LexicalWorkbenchDB {
  return new LexicalWorkbenchDB(name);
}

export interface LearningStoreOptions {
  /** Injectable clock so tests and undo batches are deterministic. */
  now?: () => string;
  /** Injectable batch-id factory; defaults to `nextBatchId`. */
  newBatchId?: (now: string) => string;
}

/**
 * `LearningStore` over Dexie with an in-memory read cache.
 *
 * Every mutation runs in ONE `rw` transaction over `learningRecords` + `learningEvents`, so a
 * record and its event(s) can never diverge. The cache is updated only after the commit
 * succeeds, and subscribers are notified once per committed operation.
 */
export class DexieLearningStore implements LearningStore {
  private readonly cache = new Map<TargetRef, LearningRecord>();
  private readonly listeners = new Set<() => void>();
  private readonly now: () => string;
  private readonly makeBatchId: (now: string) => string;
  private loadPromise: Promise<void> | null = null;
  private loaded = false;

  constructor(
    readonly db: LexicalWorkbenchDB,
    options: LearningStoreOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.makeBatchId = options.newBatchId ?? nextBatchId;
  }

  async load(): Promise<void> {
    const records = await this.db.learningRecords.toArray();
    this.cache.clear();
    for (const record of records) this.cache.set(record.target, record);
    this.loaded = true;
    this.notify();
  }

  get(target: TargetRef): LearningRecord | undefined {
    return this.cache.get(target);
  }

  all(): Iterable<LearningRecord> {
    return this.cache.values();
  }

  /**
   * Applies one patch to every target as a single user action (one `batchId`). Targets are
   * deduplicated; patches that change nothing write nothing but still return the batch id.
   */
  async apply(targets: readonly TargetRef[], patch: TargetPatch, opts: { sourceLabel?: string } = {}): Promise<string> {
    await this.ensureLoaded();
    const now = this.now();
    const batchId = this.makeBatchId(now);
    const results = dedupeTargets(targets)
      .map((target) => applyPatch(this.cache.get(target), target, patch, now, batchId))
      .filter((result) => result.events.length > 0);
    if (results.length === 0) return batchId;

    const events: LearningEvent[] = results.flatMap((result) =>
      result.events.map((event) => (opts.sourceLabel ? { ...event, sourceLabel: opts.sourceLabel } : event))
    );
    await this.db.transaction('rw', this.db.learningRecords, this.db.learningEvents, async () => {
      await this.db.learningRecords.bulkPut(results.map((result) => result.record));
      await this.db.learningEvents.bulkAdd(events);
    });

    for (const result of results) this.cache.set(result.record.target, result.record);
    this.notify();
    return batchId;
  }

  /** Restores the state before `batchId` and appends `revert` events; returns affected targets. */
  async undoBatch(batchId: string): Promise<number> {
    await this.ensureLoaded();
    const events = await this.db.learningEvents.where('batchId').equals(batchId).toArray();
    if (events.length === 0) return 0;

    const now = this.now();
    const plan = undoEvents(events, (target) => this.cache.get(target), now, `revert:${batchId}`);
    if (plan.targets.length === 0) return 0;

    await this.db.transaction('rw', this.db.learningRecords, this.db.learningEvents, async () => {
      if (plan.records.length > 0) await this.db.learningRecords.bulkPut(plan.records);
      if (plan.deleteTargets.length > 0) await this.db.learningRecords.bulkDelete(plan.deleteTargets);
      if (plan.events.length > 0) await this.db.learningEvents.bulkAdd(plan.events);
    });

    for (const record of plan.records) this.cache.set(record.target, record);
    for (const target of plan.deleteTargets) this.cache.delete(target);
    this.notify();
    return plan.targets.length;
  }

  /** Newest first. `since` is inclusive (`at >= since`). */
  async events(opts: { target?: TargetRef; since?: string; limit?: number } = {}): Promise<LearningEvent[]> {
    const limit = opts.limit ?? DEFAULT_EVENT_LIMIT;
    const { target, since } = opts;
    let rows: LearningEvent[];
    if (target !== undefined && since !== undefined) {
      const sinceAt = since;
      rows = await this.db.learningEvents.where('target').equals(target).and((e) => e.at >= sinceAt).toArray();
    } else if (target !== undefined) {
      rows = await this.db.learningEvents.where('target').equals(target).toArray();
    } else if (since !== undefined) {
      rows = await this.db.learningEvents.where('at').aboveOrEqual(since).toArray();
    } else {
      rows = await this.db.learningEvents.toArray();
    }
    rows.sort(compareEventsNewestFirst);
    return limit >= 0 ? rows.slice(0, limit) : rows;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loadPromise ??= this.load();
    await this.loadPromise;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

export function createLearningStore(db: LexicalWorkbenchDB = openDatabase(), options: LearningStoreOptions = {}): DexieLearningStore {
  return new DexieLearningStore(db, options);
}
