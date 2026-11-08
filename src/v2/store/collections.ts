/**
 * Lexical Workbench 2.0 — collections (ADR-011).
 *
 * A static collection stores explicit `TargetRef[]` (what the user will study); a dynamic
 * collection stores a `LexQuery` that is re-evaluated later. Stored meaning never changes when
 * sources change, so adding a family or a CET entry expands to explicit targets in the UI.
 *
 * The builders are pure; `DexieCollections` only adds persistence and is imported by app code
 * directly (it is not part of the core public surface).
 */
import type { Table } from 'dexie';
import type { TargetRef } from '../domain/ids.ts';
import { ENTITY_KINDS, type EntityKind } from '../domain/ids.ts';
import type { Collection } from '../contracts.ts';
import type { LexQuery } from '../engine/query.ts';
import { dedupeTargets, isTargetRef } from './core.ts';

export class CollectionError extends Error {
  constructor(
    public readonly code: 'not_found' | 'kind_mismatch' | 'invalid',
    message: string
  ) {
    super(message);
    this.name = 'CollectionError';
  }
}

/** Deduplicated in first-appearance order: the stored order is the study order. */
export function normalizeStaticTargets(targets: readonly TargetRef[]): TargetRef[] {
  for (const target of targets) {
    if (!isTargetRef(target)) throw new CollectionError('invalid', `not a learning target: ${String(target)}`);
  }
  return dedupeTargets(targets);
}

export interface NewStaticCollectionInput {
  id: string;
  name: string;
  description?: string;
  targets: readonly TargetRef[];
  now: string;
}

export interface NewDynamicCollectionInput {
  id: string;
  name: string;
  description?: string;
  query: LexQuery;
  now: string;
}

export function newStaticCollection(input: NewStaticCollectionInput): Collection {
  assertName(input.name);
  return {
    id: input.id,
    kind: 'static',
    name: input.name.trim(),
    description: input.description ?? '',
    targets: normalizeStaticTargets(input.targets),
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function newDynamicCollection(input: NewDynamicCollectionInput): Collection {
  assertName(input.name);
  assertQuery(input.query);
  return {
    id: input.id,
    kind: 'dynamic',
    name: input.name.trim(),
    description: input.description ?? '',
    query: input.query,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export interface CollectionPatch {
  name?: string;
  description?: string;
  /** Static collections only: replaces the stored target list. */
  targets?: readonly TargetRef[];
  /** Dynamic collections only: replaces the stored query. */
  query?: LexQuery;
}

/** Applies a patch, keeping kind and identity immutable; `updatedAt` only moves on real change. */
export function patchCollection(current: Collection, patch: CollectionPatch, now: string): Collection {
  if (patch.name !== undefined) assertName(patch.name);
  if (patch.query !== undefined) assertQuery(patch.query);
  if (patch.targets !== undefined && patch.query !== undefined) {
    throw new CollectionError('kind_mismatch', 'a collection cannot hold both targets and a query');
  }
  if (current.kind === 'static' && patch.query !== undefined) {
    throw new CollectionError('kind_mismatch', `static collection ${current.id} cannot store a query`);
  }
  if (current.kind === 'dynamic' && patch.targets !== undefined) {
    throw new CollectionError('kind_mismatch', `dynamic collection ${current.id} cannot store targets`);
  }

  const next: Collection =
    current.kind === 'static'
      ? {
          ...current,
          name: patch.name?.trim() ?? current.name,
          description: patch.description ?? current.description,
          targets: patch.targets ? normalizeStaticTargets(patch.targets) : current.targets,
        }
      : {
          ...current,
          name: patch.name?.trim() ?? current.name,
          description: patch.description ?? current.description,
          query: patch.query ?? current.query,
        };

  return isSameCollection(current, next) ? current : { ...next, updatedAt: now };
}

/** Adds targets that are not present yet, keeping existing order first. */
export function addCollectionTargets(collection: Collection, targets: readonly TargetRef[], now: string): Collection {
  if (collection.kind !== 'static') {
    throw new CollectionError('kind_mismatch', `dynamic collection ${collection.id} has no target list`);
  }
  return patchCollection(collection, { targets: [...collection.targets, ...targets] }, now);
}

export function removeCollectionTargets(collection: Collection, targets: readonly TargetRef[], now: string): Collection {
  if (collection.kind !== 'static') {
    throw new CollectionError('kind_mismatch', `dynamic collection ${collection.id} has no target list`);
  }
  const drop = new Set(targets);
  return patchCollection(collection, { targets: collection.targets.filter((t) => !drop.has(t)) }, now);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface CollectionsOptions {
  now?: () => string;
  newId?: () => string;
}

/** CRUD over the `collections` table. No caching: the list is small and always read fresh. */
export class DexieCollections {
  private readonly now: () => string;
  private readonly newId: () => string;

  constructor(
    private readonly table: Table<Collection, string>,
    options: CollectionsOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.newId = options.newId ?? defaultCollectionId;
  }

  /** Most recently updated first. */
  async list(): Promise<Collection[]> {
    return this.table.orderBy('updatedAt').reverse().toArray();
  }

  async get(id: string): Promise<Collection | undefined> {
    return this.table.get(id);
  }

  async createStatic(input: Omit<NewStaticCollectionInput, 'id' | 'now'>): Promise<Collection> {
    const collection = newStaticCollection({ ...input, id: this.newId(), now: this.now() });
    await this.table.put(collection);
    return collection;
  }

  async createDynamic(input: Omit<NewDynamicCollectionInput, 'id' | 'now'>): Promise<Collection> {
    const collection = newDynamicCollection({ ...input, id: this.newId(), now: this.now() });
    await this.table.put(collection);
    return collection;
  }

  async update(id: string, patch: CollectionPatch): Promise<Collection> {
    const current = await this.require(id);
    const next = patchCollection(current, patch, this.now());
    if (next !== current) await this.table.put(next);
    return next;
  }

  async addTargets(id: string, targets: readonly TargetRef[]): Promise<Collection> {
    const current = await this.require(id);
    const next = addCollectionTargets(current, targets, this.now());
    if (next !== current) await this.table.put(next);
    return next;
  }

  async removeTargets(id: string, targets: readonly TargetRef[]): Promise<Collection> {
    const current = await this.require(id);
    const next = removeCollectionTargets(current, targets, this.now());
    if (next !== current) await this.table.put(next);
    return next;
  }

  async remove(id: string): Promise<boolean> {
    const existing = await this.table.get(id);
    if (!existing) return false;
    await this.table.delete(id);
    return true;
  }

  private async require(id: string): Promise<Collection> {
    const collection = await this.table.get(id);
    if (!collection) throw new CollectionError('not_found', `collection ${id} does not exist`);
    return collection;
  }
}

function defaultCollectionId(): string {
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
  return `col-${uuid ?? Math.random().toString(36).slice(2, 10)}`;
}

function assertName(name: string): void {
  if (name.trim().length === 0) throw new CollectionError('invalid', 'collection name must not be empty');
}

function assertQuery(query: LexQuery): void {
  if (!query || !ENTITY_KINDS.includes(query.kind as EntityKind)) {
    throw new CollectionError('invalid', `dynamic collection needs a valid LexQuery kind, got ${String(query?.kind)}`);
  }
}

function isSameCollection(a: Collection, b: Collection): boolean {
  if (a.kind !== b.kind || a.name !== b.name || a.description !== b.description) return false;
  if (a.kind === 'static' && b.kind === 'static') return sameList(a.targets, b.targets);
  if (a.kind === 'dynamic' && b.kind === 'dynamic') return stableJson(a.query) === stableJson(b.query);
  return false;
}

/** Key-order independent JSON, so an equivalent query does not look like an edit. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
    }
    return val;
  });
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
