/**
 * User data store tests: pure patch/undo core, Dexie persistence (fake-indexeddb), collections
 * and backup round-trips.
 *
 * The core tests pin the semantics that the rest of the app relies on:
 *   - one event per changed field group, `before: null` when the record did not exist;
 *   - a patch that changes nothing writes nothing;
 *   - Form and lemma+PoS targets are independent records, and inheritance exists only on read;
 *   - undo restores the pre-batch state and deletes records the batch created.
 */
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import type { TargetRef } from '../domain/ids.ts';
import {
  applyPatch,
  compareEventsNewestFirst,
  dedupeTargets,
  isTargetRef,
  nextBatchId,
  undoEvents,
} from '../store/core.ts';
import { DexieLearningStore, LexicalWorkbenchDB } from '../store/dexieStore.ts';
import {
  CollectionError,
  DexieCollections,
  addCollectionTargets,
  newDynamicCollection,
  newStaticCollection,
  normalizeStaticTargets,
  patchCollection,
  removeCollectionTargets,
} from '../store/collections.ts';
import {
  BACKUP_VERSION,
  BackupError,
  exportBackup,
  importBackup,
  parseBackup,
  serializeBackup,
  validatePayload,
} from '../store/backup.ts';
import { type LearningEvent, type LearningRecord, resolveEffectiveStatus } from '../learning/model.ts';

const T0 = '2026-11-08T00:00:00.000Z';
const T1 = '2026-11-08T01:00:00.000Z';
const T2 = '2026-11-08T02:00:00.000Z';
const T3 = '2026-11-08T03:00:00.000Z';

const record = (target: TargetRef, over: Partial<LearningRecord> = {}): LearningRecord => ({
  target,
  status: 'unrated',
  tags: [],
  note: '',
  studyCount: 0,
  createdAt: T0,
  updatedAt: T0,
  lastStudiedAt: null,
  ...over,
});

let dbSeq = 0;

/** Deterministic, per-store unique batch ids (a shared constant would merge separate applies). */
const batchIds = () => {
  let n = 0;
  return () => `b-${++n}`;
};

/** Fresh database per test, closed and deleted afterwards (fake-indexeddb keeps state in-memory). */
async function withDb(fn: (db: LexicalWorkbenchDB) => Promise<void>): Promise<void> {
  const name = `lw-store-test-${process.pid}-${++dbSeq}`;
  const db = new LexicalWorkbenchDB(name);
  try {
    await db.open();
    await fn(db);
  } finally {
    db.close();
    await LexicalWorkbenchDB.delete(name);
  }
}

// ---------------------------------------------------------------------------
// Pure core: applyPatch
// ---------------------------------------------------------------------------

test('applyPatch creates the record and reports before: null for a new target', () => {
  const { record: next, events } = applyPatch(undefined, 'f:work', { status: 'learning' }, T0, 'batch-1');
  assert.deepEqual(next, record('f:work', { status: 'learning' }));
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    at: T0,
    target: 'f:work',
    type: 'status',
    batchId: 'batch-1',
    before: null,
    after: { status: 'learning' },
  });
});

test('applyPatch emits one event per changed field group, in a stable order', () => {
  const prev = record('f:work', { status: 'learning', tags: ['core'], note: 'old' });
  const { record: next, events } = applyPatch(
    prev,
    'f:work',
    { status: 'mastered', tags: ['core', 'exam'], note: 'new', studied: true },
    T1,
    'batch-2'
  );

  assert.deepEqual(
    events.map((e) => e.type),
    ['status', 'tags', 'note', 'study']
  );
  assert.deepEqual(
    events.map((e) => e.before),
    [
      { status: 'learning' },
      { tags: ['core'] },
      { note: 'old' },
      { studyCount: 0, lastStudiedAt: null },
    ]
  );
  assert.deepEqual(
    events.map((e) => e.after),
    [{ status: 'mastered' }, { tags: ['core', 'exam'] }, { note: 'new' }, { studyCount: 1, lastStudiedAt: T1 }]
  );

  assert.equal(next.status, 'mastered');
  assert.deepEqual(next.tags, ['core', 'exam']);
  assert.equal(next.note, 'new');
  assert.equal(next.studyCount, 1);
  assert.equal(next.lastStudiedAt, T1);
  assert.equal(next.createdAt, T0, 'createdAt is never rewritten');
  assert.equal(next.updatedAt, T1);
  assert.ok(events.every((e) => e.batchId === 'batch-2'));
});

test('applyPatch with no effective change emits nothing and keeps the record untouched', () => {
  const prev = record('f:work', { status: 'learning', tags: ['core'], note: '' });
  const { record: next, events } = applyPatch(prev, 'f:work', { status: 'learning', tags: ['core'], note: '' }, T2, 'b');
  assert.equal(events.length, 0);
  assert.equal(next, prev, 'the same record object is returned so nothing gets persisted');

  // `studied: false` is a no-op, not a decrement.
  const studiedOff = applyPatch(prev, 'f:work', { studied: false }, T2, 'b');
  assert.equal(studiedOff.events.length, 0);
  assert.equal(studiedOff.record.studyCount, 0);
});

test('applyPatch treats tag order as part of the stored value', () => {
  const prev = record('f:work', { tags: ['a', 'b'] });
  assert.equal(applyPatch(prev, 'f:work', { tags: ['a', 'b'] }, T1, null).events.length, 0);
  const reordered = applyPatch(prev, 'f:work', { tags: ['b', 'a'] }, T1, null);
  assert.deepEqual(reordered.events.map((e) => e.type), ['tags']);
  assert.deepEqual(reordered.record.tags, ['b', 'a']);
});

test('applyPatch keeps Form and lemma+PoS targets on separate records', () => {
  const formRecord = record('f:work', { status: 'learning' });
  const { record: posRecord, events } = applyPatch(undefined, 'lp:work|noun', { status: 'mastered' }, T1, 'b');
  assert.equal(posRecord.target, 'lp:work|noun');
  assert.equal(formRecord.status, 'learning', 'the Form record is not touched by a PoS patch');
  assert.deepEqual(events[0].before, null);
});

// ---------------------------------------------------------------------------
// Pure core: undoEvents
// ---------------------------------------------------------------------------

test('undoEvents restores the state before the batch, oldest before-value winning', () => {
  const original = record('f:work', { status: 'learning', tags: [] });
  const step1 = applyPatch(original, 'f:work', { status: 'mastered' }, T1, 'batch-1');
  const step2 = applyPatch(step1.record, 'f:work', { status: 'deferred', tags: ['later'] }, T2, 'batch-1');

  const plan = undoEvents([step2.events[1], step2.events[0], step1.events[0]], (t) => step2.record, T3, 'revert:batch-1');

  assert.deepEqual(plan.deleteTargets, []);
  assert.deepEqual(plan.skipped, []);
  assert.equal(plan.records.length, 1);
  const restored = plan.records[0];
  assert.equal(restored.target, 'f:work');
  assert.equal(restored.status, 'learning');
  assert.deepEqual(restored.tags, []);
  assert.equal(restored.updatedAt, T3);

  assert.deepEqual(plan.targets, ['f:work']);
  assert.equal(plan.events.length, 1);
  assert.equal(plan.events[0].type, 'revert');
  assert.equal(plan.events[0].batchId, 'revert:batch-1');
  assert.deepEqual(plan.events[0].before, { status: 'deferred', tags: ['later'] });
  assert.deepEqual(plan.events[0].after, { status: 'learning', tags: [] });
});

test('undoEvents deletes a record the batch created and reports the removed fields', () => {
  const created = applyPatch(undefined, 'f:brandnew', { status: 'learning', tags: ['x'] }, T1, 'batch-1');
  const plan = undoEvents(created.events, () => created.record, T2, 'revert:batch-1');

  assert.deepEqual(plan.deleteTargets, ['f:brandnew']);
  assert.deepEqual(plan.records, []);
  assert.deepEqual(plan.targets, ['f:brandnew']);
  assert.deepEqual(plan.events[0].before, {
    status: 'learning',
    tags: ['x'],
    note: '',
    studyCount: 0,
    lastStudiedAt: null,
  });
  assert.deepEqual(plan.events[0].after, {}, 'the record no longer exists after the undo');
});

test('undoEvents does nothing when the batch created a record that is already gone', () => {
  const created = applyPatch(undefined, 'f:gone', { status: 'queued' }, T1, 'batch-1');
  const plan = undoEvents(created.events, () => undefined, T2, null);
  assert.deepEqual(plan.targets, []);
  assert.deepEqual(plan.deleteTargets, []);
  assert.deepEqual(plan.skipped, [], 'nothing to restore and nothing was lost');
});

test('undoEvents reports a target whose record vanished instead of inventing one', () => {
  const event: LearningEvent = {
    at: T1,
    target: 'f:work',
    type: 'status',
    batchId: 'batch-9',
    before: { status: 'learning' },
    after: { status: 'mastered' },
  };
  const plan = undoEvents([event], () => undefined, T2, null);
  assert.deepEqual(plan.skipped, ['f:work']);
  assert.deepEqual(plan.targets, []);
  assert.deepEqual(plan.records, []);
});

test('undoEvents ignores revert events (an undo is undone by its own batch)', () => {
  const event: LearningEvent = {
    at: T1,
    target: 'f:work',
    type: 'revert',
    batchId: 'revert:batch-1',
    before: { status: 'mastered' },
    after: { status: 'learning' },
  };
  const plan = undoEvents([event], () => record('f:work', { status: 'learning' }), T2, null);
  assert.deepEqual(plan.targets, []);
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('event ordering, batch ids, target de-duplication and target validation', () => {
  const older: LearningEvent = { at: T1, target: 'f:a', type: 'status', batchId: null, before: null, after: {}, id: 1 };
  const newer: LearningEvent = { at: T2, target: 'f:a', type: 'status', batchId: null, before: null, after: {}, id: 2 };
  const sameTime: LearningEvent = { ...older, id: 3 };
  assert.deepEqual([older, newer].sort(compareEventsNewestFirst).map((e) => e.id), [2, 1]);
  assert.deepEqual([older, sameTime].sort(compareEventsNewestFirst).map((e) => e.id), [3, 1]);

  const a = nextBatchId(T0);
  const b = nextBatchId(T0);
  assert.match(a, /^batch-\d+-[\w-]+$/);
  assert.notEqual(a, b);

  assert.deepEqual(dedupeTargets(['f:b', 'f:a', 'f:b']), ['f:b', 'f:a']);

  assert.ok(isTargetRef('f:work'));
  assert.ok(isTargetRef('lp:work|noun'));
  assert.ok(!isTargetRef('lp:work'), 'a PoS target needs a pos part');
  assert.ok(!isTargetRef('coca2020:hw:work'), 'source entities are not learning targets');
  assert.ok(!isTargetRef(''), 'empty string is not a target');
});

// ---------------------------------------------------------------------------
// Dexie store
// ---------------------------------------------------------------------------

test('store: apply writes records and events with one batch id and survives a reload', async () => {
  await withDb(async (db) => {
    const store = new DexieLearningStore(db, { now: () => T0, newBatchId: (now) => `batch-fixed-${now}` });
    await store.load();
    assert.equal(store.get('f:work'), undefined);
    assert.deepEqual([...store.all()], []);

    const batchId = await store.apply(['f:work', 'f:worked', 'lp:work|noun'], { status: 'mastered' }, { sourceLabel: 'Explore' });
    assert.equal(batchId, `batch-fixed-${T0}`);

    const records = await db.learningRecords.toArray();
    assert.equal(records.length, 3);
    const events = await db.learningEvents.toArray();
    assert.equal(events.length, 3);
    assert.ok(events.every((e) => e.batchId === batchId));
    assert.ok(events.every((e) => e.sourceLabel === 'Explore'));
    assert.ok(events.every((e) => e.type === 'status' && e.before === null));

    assert.equal(store.get('f:work')!.status, 'mastered');
    assert.deepEqual(
      [...store.all()].map((r) => r.target).sort(),
      ['f:work', 'f:worked', 'lp:work|noun']
    );

    // A second store over the same database reads the persisted state (no shared cache).
    const reopened = new DexieLearningStore(db);
    await reopened.load();
    assert.equal(reopened.get('lp:work|noun')!.status, 'mastered');
  });
});

test('store: Form and PoS records stay independent, inheritance is read-time only', async () => {
  await withDb(async (db) => {
    const store = new DexieLearningStore(db, { now: () => T0, newBatchId: batchIds() });
    await store.apply(['f:work'], { status: 'learning' });
    await store.apply(['lp:work|noun'], { status: 'mastered' });

    assert.equal(store.get('f:work')!.status, 'learning');
    assert.equal(store.get('lp:work|noun')!.status, 'mastered');
    assert.equal(store.get('lp:work|verb'), undefined, 'no explicit record for the verb');

    assert.deepEqual(resolveEffectiveStatus(store, 'lp:work|verb'), {
      status: 'learning',
      origin: 'inherited',
      from: 'f:work',
    });
    assert.deepEqual(resolveEffectiveStatus(store, 'lp:work|noun'), {
      status: 'mastered',
      origin: 'own',
      from: 'lp:work|noun',
    });
    assert.deepEqual(resolveEffectiveStatus(store, 'f:work'), { status: 'learning', origin: 'own', from: 'f:work' });

    // Writing the inherited value explicitly creates an independent record; the Form is unchanged.
    await store.apply(['lp:work|verb'], { status: 'deferred' });
    assert.equal(store.get('lp:work|verb')!.status, 'deferred');
    assert.equal(store.get('f:work')!.status, 'learning');
    assert.equal((await db.learningRecords.toArray()).length, 3);
  });
});

test('store: duplicate targets in one call and no-op patches do not duplicate data', async () => {
  await withDb(async (db) => {
    const store = new DexieLearningStore(db, { now: () => T0, newBatchId: batchIds() });
    await store.apply(['f:work', 'f:work'], { status: 'learning' });
    assert.equal((await db.learningRecords.toArray()).length, 1);
    assert.equal((await db.learningEvents.toArray()).length, 1);

    const before = await db.learningRecords.get('f:work');
    await store.apply(['f:work'], { status: 'learning' });
    const after = await db.learningRecords.get('f:work');
    assert.deepEqual(after, before, 'a patch that changes nothing must not touch updatedAt');
    assert.equal((await db.learningEvents.toArray()).length, 1);
  });
});

test('store: tags, note and study fields round-trip and are undone together', async () => {
  await withDb(async (db) => {
    const store = new DexieLearningStore(db, { now: () => T0, newBatchId: batchIds() });
    await store.apply(['f:work'], { status: 'learning', tags: ['core'], note: 'first pass' });
    const batchId = await store.apply(['f:work'], { note: 'second pass', studied: true });

    let current = store.get('f:work')!;
    assert.equal(current.note, 'second pass');
    assert.equal(current.studyCount, 1);
    assert.equal(current.lastStudiedAt, T0);

    const undone = await store.undoBatch(batchId);
    assert.equal(undone, 1);
    current = store.get('f:work')!;
    assert.equal(current.note, 'first pass');
    assert.equal(current.studyCount, 0);
    assert.equal(current.lastStudiedAt, null);

    const revert = (await db.learningEvents.where('batchId').equals(`revert:${batchId}`).toArray())[0];
    assert.equal(revert.type, 'revert');
    assert.deepEqual(revert.before, { note: 'second pass', studyCount: 1, lastStudiedAt: T0 });
    assert.deepEqual(revert.after, { note: 'first pass', studyCount: 0, lastStudiedAt: null });
  });
});

test('store: undoBatch restores values, deletes created records and is itself persisted', async () => {
  await withDb(async (db) => {
    const store = new DexieLearningStore(db, { now: () => T0, newBatchId: batchIds() });
    const created = await store.apply(['f:work', 'f:worked'], { status: 'learning' });
    const changed = await store.apply(['f:work', 'f:worked'], { status: 'mastered' });

    assert.equal(await store.undoBatch(changed), 2);
    assert.equal(store.get('f:work')!.status, 'learning');
    assert.equal(store.get('f:worked')!.status, 'learning');

    assert.equal(await store.undoBatch(created), 2);
    assert.equal(store.get('f:work'), undefined, 'the batch created the record, so undo deletes it');
    assert.equal(store.get('f:worked'), undefined);
    assert.deepEqual([...store.all()], []);

    const reopened = new DexieLearningStore(db);
    await reopened.load();
    assert.deepEqual([...reopened.all()], []);

    // Every undo appended its own revert events; the original history is preserved.
    const events = await db.learningEvents.toArray();
    assert.equal(events.length, 4 + 4, 'two applies (2 events each) + two undos (2 revert events each)');
    assert.ok(events.some((e) => e.batchId === `revert:${changed}`));
    assert.ok(events.some((e) => e.batchId === `revert:${created}`));

    assert.equal(await store.undoBatch('no-such-batch'), 0);
  });
});

test('store: events() filters by target and since, newest first, with a limit', async () => {
  await withDb(async (db) => {
    let now = T0;
    const store = new DexieLearningStore(db, { now: () => now, newBatchId: batchIds() });
    await store.apply(['f:work'], { status: 'queued' });
    now = T1;
    await store.apply(['f:worked'], { status: 'learning' });
    now = T2;
    await store.apply(['f:work'], { status: 'mastered' });

    const all = await store.events();
    assert.deepEqual(
      all.map((e) => [e.target, e.at]),
      [
        ['f:work', T2],
        ['f:worked', T1],
        ['f:work', T0],
      ]
    );

    const forWork = await store.events({ target: 'f:work' });
    assert.deepEqual(
      forWork.map((e) => e.at),
      [T2, T0]
    );

    const since = await store.events({ since: T1 });
    assert.deepEqual(
      since.map((e) => e.at),
      [T2, T1],
      'since is inclusive'
    );

    const limited = await store.events({ limit: 1 });
    assert.deepEqual(
      limited.map((e) => e.at),
      [T2]
    );

    const both = await store.events({ target: 'f:work', since: T1 });
    assert.deepEqual(
      both.map((e) => e.at),
      [T2]
    );
  });
});

test('store: subscribers are notified on load, apply and undo, and unsubscribe works', async () => {
  await withDb(async (db) => {
    const store = new DexieLearningStore(db, { now: () => T0, newBatchId: batchIds() });
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls++;
    });

    await store.load();
    assert.equal(calls, 1);

    const batchId = await store.apply(['f:work'], { status: 'learning' });
    assert.equal(calls, 2);

    await store.apply(['f:work'], { status: 'learning' }); // no-op → no write, no notification
    assert.equal(calls, 2);

    await store.undoBatch(batchId);
    assert.equal(calls, 3);

    unsubscribe();
    await store.apply(['f:work'], { status: 'queued' });
    assert.equal(calls, 3);
  });
});

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

test('collections: static targets are de-duplicated, order preserved, names validated', () => {
  const created = newStaticCollection({
    id: 'c1',
    name: '  My list  ',
    targets: ['f:work', 'lp:work|noun', 'f:work'],
    now: T0,
  });
  assert.equal(created.kind, 'static');
  assert.equal(created.name, 'My list');
  assert.deepEqual(created.targets, ['f:work', 'lp:work|noun']);
  assert.deepEqual([created.createdAt, created.updatedAt], [T0, T0]);

  assert.deepEqual(normalizeStaticTargets(['f:b', 'f:a', 'f:b']), ['f:b', 'f:a']);

  assert.throws(
    () => newStaticCollection({ id: 'c2', name: '   ', targets: [], now: T0 }),
    (e: unknown) => e instanceof CollectionError && e.code === 'invalid'
  );
  assert.throws(
    () => newStaticCollection({ id: 'c2', name: 'bad', targets: ['coca2020:hw:work' as TargetRef], now: T0 }),
    (e: unknown) => e instanceof CollectionError && e.code === 'invalid'
  );
  assert.throws(
    () => newDynamicCollection({ id: 'c3', name: 'bad', query: { kind: 'nope' as never }, now: T0 }),
    (e: unknown) => e instanceof CollectionError && e.code === 'invalid'
  );
});

test('collections: patching keeps kind and identity, and rejects cross-kind fields', () => {
  const created = newStaticCollection({ id: 'c1', name: 'List', targets: ['f:a'], now: T0 });
  const renamed = patchCollection(created, { name: 'Renamed', description: 'why' }, T1);
  assert.equal(renamed.kind, 'static');
  assert.equal(renamed.id, 'c1');
  assert.equal(renamed.name, 'Renamed');
  assert.equal(renamed.description, 'why');
  assert.equal(renamed.updatedAt, T1);
  assert.deepEqual(renamed.kind === 'static' ? renamed.targets : [], ['f:a']);

  const unchanged = patchCollection(renamed, { name: 'Renamed' }, T2);
  assert.equal(unchanged, renamed, 'no change → same object, so updatedAt is not bumped');

  const added = addCollectionTargets(created, ['f:b', 'f:a'], T1);
  assert.deepEqual(added.kind === 'static' ? added.targets : [], ['f:a', 'f:b']);
  const removed = removeCollectionTargets(added, ['f:a'], T2);
  assert.deepEqual(removed.kind === 'static' ? removed.targets : [], ['f:b']);

  assert.throws(
    () => patchCollection(created, { query: { kind: 'form' } }, T1),
    (e: unknown) => e instanceof CollectionError && e.code === 'kind_mismatch'
  );
  assert.throws(
    () => addCollectionTargets(newDynamicCollection({ id: 'd1', name: 'D', query: { kind: 'form' }, now: T0 }), ['f:a'], T1),
    (e: unknown) => e instanceof CollectionError && e.code === 'kind_mismatch'
  );
  assert.throws(
    () => patchCollection(created, { targets: ['f:a'], query: { kind: 'form' } }, T1),
    (e: unknown) => e instanceof CollectionError && e.code === 'kind_mismatch'
  );
});

test('collections: Dexie CRUD persists across instances and lists newest first', async () => {
  await withDb(async (db) => {
    let now = T0;
    let seq = 0;
    const collections = new DexieCollections(db.collections, { now: () => now, newId: () => `col-${++seq}` });

    const list = await collections.createStatic({ name: 'CET4 core', targets: ['f:work', 'f:work'] });
    assert.deepEqual(list.kind === 'static' ? list.targets : [], ['f:work']);

    now = T1;
    const dynamic = await collections.createDynamic({ name: 'Top 1k', query: { kind: 'form', page: { offset: 0, limit: 50 } } });
    assert.equal(dynamic.kind, 'dynamic');

    assert.deepEqual(
      (await collections.list()).map((c) => c.id),
      ['col-2', 'col-1'],
      'most recently updated first'
    );

    now = T2;
    const updated = await collections.addTargets('col-1', ['f:worked', 'f:work']);
    assert.deepEqual(updated.kind === 'static' ? updated.targets : [], ['f:work', 'f:worked']);
    assert.equal(updated.updatedAt, T2);

    const reopened = new DexieCollections(db.collections);
    const persisted = await reopened.get('col-1');
    assert.ok(persisted && persisted.kind === 'static');
    assert.deepEqual(persisted.targets, ['f:work', 'f:worked']);

    await assert.rejects(
      () => reopened.update('missing', { name: 'x' }),
      (e: unknown) => e instanceof CollectionError && e.code === 'not_found'
    );

    assert.equal(await reopened.remove('col-1'), true);
    assert.equal(await reopened.remove('col-1'), false);
    assert.equal((await reopened.list()).length, 1);
  });
});

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

test('backup: export → serialize → parse → import restores records, events and collections', async () => {
  await withDb(async (db) => {
    const store = new DexieLearningStore(db, { now: () => T0, newBatchId: batchIds() });
    await store.apply(['f:work'], { status: 'learning', tags: ['core'] });
    await store.apply(['lp:work|noun'], { status: 'mastered' });
    const collections = new DexieCollections(db.collections, { now: () => T0, newId: () => 'col-1' });
    await collections.createStatic({ name: 'Mine', targets: ['f:work'] });

    const exported = await exportBackup(db, T3);
    assert.equal(exported.version, BACKUP_VERSION);
    assert.equal(exported.records.length, 2);
    assert.equal(exported.events.length, 3, 'status + tags for f:work, status for the PoS target');
    assert.equal(exported.collections.length, 1);
    assert.equal(exported.exportedAt, T3);
    assert.deepEqual(
      exported.events.map((e) => e.at),
      [T0, T0, T0],
      'events export in chronological order'
    );

    const text = serializeBackup(exported);
    const parsed = parseBackup(text);
    assert.deepEqual(parsed.records, exported.records);
    assert.deepEqual(parsed.events, exported.events);
    assert.deepEqual(parsed.collections, exported.collections);

    // Import into a different database: replace mode restores everything.
    await withDb(async (target) => {
      const counts = await importBackup(target, parsed);
      assert.deepEqual(counts, { records: 2, events: 3, collections: 1 });
      const restoredStore = new DexieLearningStore(target);
      await restoredStore.load();
      assert.equal(restoredStore.get('f:work')!.status, 'learning');
      assert.deepEqual(restoredStore.get('f:work')!.tags, ['core']);
      assert.equal(restoredStore.get('lp:work|noun')!.status, 'mastered');
      assert.equal((await target.collections.toArray())[0].name, 'Mine');
      assert.equal((await restoredStore.events()).length, 3);
    });
  });
});

test('backup: import replaces existing user data instead of merging', async () => {
  await withDb(async (db) => {
    const store = new DexieLearningStore(db, { now: () => T0, newBatchId: batchIds() });
    await store.apply(['f:stale'], { status: 'mastered' });

    const payload = {
      version: BACKUP_VERSION,
      records: [record('f:fresh', { status: 'queued' })],
      events: [],
      collections: [],
      exportedAt: T1,
    };
    await importBackup(db, payload);

    assert.equal(await db.learningRecords.get('f:stale'), undefined, 'replace mode clears older data');
    assert.equal((await db.learningRecords.toArray()).length, 1);

    const reloaded = new DexieLearningStore(db);
    await reloaded.load();
    assert.equal(reloaded.get('f:fresh')!.status, 'queued');
    assert.equal(reloaded.get('f:stale'), undefined);
  });
});

test('backup: invalid documents are rejected and leave the database untouched', async () => {
  const base = {
    version: BACKUP_VERSION,
    records: [record('f:work', { status: 'learning' })],
    events: [],
    collections: [newStaticCollection({ id: 'c1', name: 'Mine', targets: ['f:work'], now: T0 })],
    exportedAt: T1,
  };

  const expectCode = (fn: () => unknown, code: BackupError['code']) =>
    assert.throws(fn, (e: unknown) => e instanceof BackupError && e.code === code);

  expectCode(() => parseBackup('not json'), 'invalid_json');
  expectCode(() => parseBackup(JSON.stringify({ ...base, version: 1 })), 'unsupported_version');
  expectCode(
    () => parseBackup(JSON.stringify({ ...base, records: [record('f:work', { status: 'bogus' as never })] })),
    'invalid_record'
  );
  expectCode(
    () => parseBackup(JSON.stringify({ ...base, records: [record('f:work'), record('f:work')] })),
    'duplicate_record'
  );
  expectCode(
    () => parseBackup(JSON.stringify({ ...base, records: [record('coca2020:hw:work' as TargetRef)] })),
    'invalid_record'
  );
  expectCode(
    () =>
      parseBackup(
        JSON.stringify({
          ...base,
          events: [{ target: 'f:work', type: 'bogus', at: T0, batchId: null, before: null, after: {} }],
        })
      ),
    'invalid_event'
  );
  expectCode(
    () =>
      validatePayload({
        ...base,
        collections: [{ ...base.collections[0], targets: ['f:work', 'f:work'] }],
      }),
    'invalid_collection'
  );

  await withDb(async (db) => {
    const store = new DexieLearningStore(db, { now: () => T0, newBatchId: batchIds() });
    await store.apply(['f:keep'], { status: 'learning' });

    await assert.rejects(
      () => importBackup(db, { ...base, version: 99 }),
      (e: unknown) => e instanceof BackupError && e.code === 'unsupported_version'
    );
    await assert.rejects(
      () => importBackup(db, { ...base, records: [record('f:x', { status: 'nope' as never })] }),
      (e: unknown) => e instanceof BackupError && e.code === 'invalid_record'
    );

    assert.equal((await db.learningRecords.toArray()).length, 1, 'failed imports roll back to the previous state');
    assert.equal(await db.learningRecords.get('f:keep') !== undefined, true);
  });
});

test('database: the v2 schema declares the documented tables', async () => {
  const db = new LexicalWorkbenchDB('lw-store-schema-test');
  try {
    await db.open();
    for (const table of ['learningRecords', 'learningEvents', 'collections', 'customSources', 'settings']) {
      assert.ok(
        db.tables.some((t) => t.name === table),
        `table ${table} exists`
      );
    }
  } finally {
    db.close();
    await LexicalWorkbenchDB.delete('lw-store-schema-test');
  }
  assert.equal(new LexicalWorkbenchDB().name, 'LexicalWorkbenchDB_v2');
});
