import Dexie, { type Table } from 'dexie';
import {
  ActivityLogEntry,
  DictionaryTemplate,
  LearningStatus,
  UserWordRecord,
  WordCollection,
} from '../data/types.ts';
import { DEFAULT_FILTER_CRITERIA } from '../data/searchAndFilter.ts';

export interface CustomDatasetRecord {
  id: 'cet2016' | 'bnc_coca';
  fileName: string;
  content: string;
  updatedAt: string;
}

export class LexicalWorkbenchDB extends Dexie {
  userWords!: Table<UserWordRecord, string>;
  activityLogs!: Table<ActivityLogEntry, number>;
  collections!: Table<WordCollection, string>;
  customDatasets!: Table<CustomDatasetRecord, string>;

  constructor() {
    super('LexicalWorkbenchDB_v1');

    this.version(1).stores({
      userWords: 'wordId, status, updatedAt, *tags',
      activityLogs: '++id, batchId, timestamp, wordId, actionType',
      collections: 'id, type, updatedAt',
      customDatasets: 'id, updatedAt',
    });
  }
}

export const db = new LexicalWorkbenchDB();

const DEFAULT_BUILTIN_COLLECTIONS: WordCollection[] = [
  {
    id: 'builtin-cet4-core',
    name: 'CET-4 核心高频词 (1k–3k)',
    description: '四级大纲与 BNC 1k–3k 交集词汇，英语阅读与写作基石',
    type: 'dynamic',
    wordIds: [],
    filterCriteria: {
      ...DEFAULT_FILTER_CRITERIA,
      sourceFilter: 'cet4',
      minBand: 1,
      maxBand: 3,
    },
    sortField: 'priority_weight_desc',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-cet6-academic',
    name: 'CET-6 进阶核心词 (2k–6k)',
    description: '六级新增高频实词，适合四级通过后集中突破',
    type: 'dynamic',
    wordIds: [],
    filterCriteria: {
      ...DEFAULT_FILTER_CRITERIA,
      sourceFilter: 'cet6_new',
      minBand: 2,
      maxBand: 6,
    },
    sortField: 'priority_weight_desc',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-my-Difficult',
    name: '我的重点难词本',
    description: '手动归入的易错词、熟词僻义或真题高频词条',
    type: 'static',
    wordIds: ['appropriate', 'accountancy', 'owing to', 'compromise', 'consecutive'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

export async function ensureDefaultCollections(): Promise<void> {
  const count = await db.collections.count();
  if (count === 0) {
    await db.collections.bulkPut(DEFAULT_BUILTIN_COLLECTIONS);
  }
}

/**
 * Pure helper to restore a UserWordRecord to its state prior to a specific ActivityLogEntry.
 * Restores status, tags, notes, studyCount, and lastStudiedAt consistently, while remaining
 * backward-compatible with older log entries that did not store previousStudyCount/previousLastStudiedAt.
 */
export function applyLogUndoToRecord(
  current: UserWordRecord,
  log: ActivityLogEntry,
  now: string
): UserWordRecord | null {
  if (log.existedBefore === false) {
    return null;
  }

  const restored: UserWordRecord = {
    ...current,
    updatedAt: now,
  };

  if (log.previousStatus !== undefined) {
    restored.status = log.previousStatus;
  }
  if (log.previousTags !== undefined) {
    restored.tags = [...log.previousTags];
  }
  if (log.previousNotes !== undefined) {
    restored.notes = log.previousNotes;
  }

  const legacyIncrementedStudy =
    log.actionType === 'study_touch' ||
    ((log.actionType === 'status_change' || log.actionType === 'batch_import') &&
      log.previousStatus !== log.newStatus &&
      (log.newStatus === 'learning' || log.newStatus === 'mastered'));

  if (log.previousStudyCount !== undefined) {
    restored.studyCount = log.previousStudyCount;
  } else if (legacyIncrementedStudy) {
    restored.studyCount = Math.max(0, (current.studyCount || 1) - 1);
  }

  if ('previousLastStudiedAt' in log) {
    restored.lastStudiedAt = log.previousLastStudiedAt;
  } else if (legacyIncrementedStudy && (restored.studyCount || 0) === 0) {
    restored.lastStudiedAt = undefined;
  }

  return restored;
}

/**
 * Pure, explainable merge rule for two UserWordRecord snapshots of the same word.
 * - When both records have valid, distinct `updatedAt` timestamps, the strictly newer record wins
 *   for status (even if the user actively reset status to 'unrated'), tags, notes, studyCount, and lastStudiedAt.
 * - Only when timestamps are identical or missing on either side does it fall back to a conservative union.
 */
export function mergeUserWordRecordPair(
  existing: UserWordRecord,
  incoming: UserWordRecord
): UserWordRecord {
  const existingTs = existing.updatedAt || '';
  const incomingTs = incoming.updatedAt || '';
  const earliestFirstRecorded =
    existing.firstRecordedAt && incoming.firstRecordedAt
      ? existing.firstRecordedAt <= incoming.firstRecordedAt
        ? existing.firstRecordedAt
        : incoming.firstRecordedAt
      : existing.firstRecordedAt || incoming.firstRecordedAt;

  // Distinct timestamps: strictly respect the newer effective operation
  if (existingTs && incomingTs && existingTs !== incomingTs) {
    const winner = incomingTs > existingTs ? incoming : existing;
    return {
      ...winner,
      tags: [...(winner.tags || [])],
      notes: winner.notes || '',
      firstRecordedAt: earliestFirstRecorded,
      studyCount: winner.studyCount ?? 0,
      lastStudiedAt: winner.lastStudiedAt,
    };
  }

  // Tie or missing timestamp fallback: conservative union
  const incomingNewerOrEqual = incomingTs >= existingTs;
  const mergedTags = Array.from(new Set([...(existing.tags || []), ...(incoming.tags || [])]));
  const mergedNotes = existing.notes
    ? incoming.notes && !existing.notes.includes(incoming.notes)
      ? `${existing.notes}\n${incoming.notes}`
      : existing.notes
    : incoming.notes || '';

  const nextStatus: LearningStatus = incomingNewerOrEqual
    ? incoming.status !== 'unrated'
      ? incoming.status
      : existing.status
    : existing.status !== 'unrated'
      ? existing.status
      : incoming.status;

  return {
    ...(incomingNewerOrEqual ? incoming : existing),
    status: nextStatus,
    tags: mergedTags,
    notes: mergedNotes,
    firstRecordedAt: earliestFirstRecorded,
    updatedAt: incomingNewerOrEqual ? incoming.updatedAt || existing.updatedAt : existing.updatedAt,
    studyCount: Math.max(existing.studyCount || 0, incoming.studyCount || 0),
    lastStudiedAt:
      (incoming.lastStudiedAt || '') > (existing.lastStudiedAt || '')
        ? incoming.lastStudiedAt
        : existing.lastStudiedAt,
  };
}

/**
 * Pure, explainable merge rule for two WordCollection snapshots with the same id.
 * - If `updatedAt` timestamps are distinct and non-empty, the newer snapshot wins (preserving intentional member removals).
 * - Only if timestamps are identical or missing does it union `wordIds`.
 */
export function mergeWordCollectionPair(
  existingCol: WordCollection,
  incomingCol: WordCollection
): WordCollection {
  const existingTs = existingCol.updatedAt || '';
  const incomingTs = incomingCol.updatedAt || '';

  if (existingTs && incomingTs && existingTs !== incomingTs) {
    const winner = incomingTs > existingTs ? incomingCol : existingCol;
    return {
      ...winner,
      wordIds: [...(winner.wordIds || [])],
    };
  }

  const incomingNewerOrEqual = incomingTs >= existingTs;
  const mergedWordIds = Array.from(
    new Set([...(existingCol.wordIds || []), ...(incomingCol.wordIds || [])])
  );
  return {
    ...(incomingNewerOrEqual ? incomingCol : existingCol),
    wordIds: mergedWordIds,
    updatedAt: incomingNewerOrEqual
      ? incomingCol.updatedAt || existingCol.updatedAt
      : existingCol.updatedAt,
  };
}

/**
 * Updates a single word's learning status and writes an activity log entry.
 * Repeating the same status is a no-op and never refreshes lastStudiedAt or studyCount.
 */
export async function updateWordStatus(
  wordId: string,
  wordDisplay: string,
  newStatus: LearningStatus,
  sourceLabel = '工作台快捷标注'
): Promise<UserWordRecord> {
  const now = new Date().toISOString();
  return db.transaction('rw', db.userWords, db.activityLogs, async () => {
    const existing = await db.userWords.get(wordId);
    const previousStatus: LearningStatus = existing?.status || 'unrated';

    // Setting the exact same status is a no-op: do not refresh lastStudiedAt or studyCount
    if (existing && previousStatus === newStatus) {
      return existing;
    }

    const prevStudyCount = existing?.studyCount || 0;
    const prevLastStudiedAt = existing?.lastStudiedAt;
    const studiedNow =
      previousStatus !== newStatus && (newStatus === 'learning' || newStatus === 'mastered');
    const nextStudyCount = studiedNow ? prevStudyCount + 1 : prevStudyCount;
    const nextLastStudiedAt = studiedNow ? now : prevLastStudiedAt;

    const record: UserWordRecord = existing
      ? {
          ...existing,
          status: newStatus,
          updatedAt: now,
          studyCount: nextStudyCount,
          lastStudiedAt: nextLastStudiedAt,
        }
      : {
          wordId,
          word: wordDisplay,
          status: newStatus,
          tags: [],
          notes: '',
          firstRecordedAt: now,
          updatedAt: now,
          studyCount: nextStudyCount,
          lastStudiedAt: nextLastStudiedAt,
        };

    await db.userWords.put(record);

    if (previousStatus !== newStatus) {
      await db.activityLogs.add({
        timestamp: now,
        wordId,
        word: wordDisplay,
        actionType: 'status_change',
        previousStatus,
        newStatus,
        previousTags: existing?.tags || [],
        newTags: record.tags,
        previousNotes: existing?.notes || '',
        newNotes: record.notes,
        previousStudyCount: prevStudyCount,
        newStudyCount: nextStudyCount,
        previousLastStudiedAt: prevLastStudiedAt,
        newLastStudiedAt: nextLastStudiedAt,
        existedBefore: Boolean(existing),
        sourceLabel,
      });
    }

    return record;
  });
}

/**
 * Explicitly records a study review touch ("记录本次学习") without mutating the word's learning status.
 * Increments studyCount, updates lastStudiedAt, and adds a 'study_touch' activity log entry.
 */
export async function recordWordStudyTouch(
  wordId: string,
  wordDisplay: string,
  sourceLabel = '词条详情复习打卡'
): Promise<UserWordRecord> {
  const now = new Date().toISOString();
  return db.transaction('rw', db.userWords, db.activityLogs, async () => {
    const existing = await db.userWords.get(wordId);
    const prevStatus: LearningStatus = existing?.status || 'unrated';
    // Keep status strictly unchanged when recording a study touch
    const nextStatus: LearningStatus = prevStatus;
    const prevStudyCount = existing?.studyCount || 0;
    const prevLastStudiedAt = existing?.lastStudiedAt;
    const nextStudyCount = prevStudyCount + 1;

    const record: UserWordRecord = existing
      ? {
          ...existing,
          status: nextStatus,
          updatedAt: now,
          studyCount: nextStudyCount,
          lastStudiedAt: now,
        }
      : {
          wordId,
          word: wordDisplay,
          status: nextStatus,
          tags: [],
          notes: '',
          firstRecordedAt: now,
          updatedAt: now,
          studyCount: 1,
          lastStudiedAt: now,
        };

    await db.userWords.put(record);

    await db.activityLogs.add({
      timestamp: now,
      wordId,
      word: wordDisplay,
      actionType: 'study_touch',
      previousStatus: prevStatus,
      newStatus: nextStatus,
      previousTags: existing?.tags || [],
      newTags: record.tags,
      previousNotes: existing?.notes || '',
      newNotes: record.notes,
      previousStudyCount: prevStudyCount,
      newStudyCount: nextStudyCount,
      previousLastStudiedAt: prevLastStudiedAt,
      newLastStudiedAt: now,
      existedBefore: Boolean(existing),
      sourceLabel: `${sourceLabel} (累计 ${nextStudyCount} 次)`,
    });

    return record;
  });
}

/**
 * Updates personal tags and notes for a single word without altering status, studyCount, or lastStudiedAt.
 */
export async function updateWordTagsAndNotes(
  wordId: string,
  wordDisplay: string,
  tags: string[],
  notes: string,
  sourceLabel = '词条详情编辑'
): Promise<UserWordRecord> {
  const now = new Date().toISOString();
  return db.transaction('rw', db.userWords, db.activityLogs, async () => {
    const existing = await db.userWords.get(wordId);
    const prevTags = existing?.tags || [];
    const prevNotes = existing?.notes || '';
    const prevStudyCount = existing?.studyCount || 0;
    const prevLastStudiedAt = existing?.lastStudiedAt;

    const tagsChanged = JSON.stringify(prevTags) !== JSON.stringify(tags);
    const notesChanged = prevNotes !== notes;

    if (!tagsChanged && !notesChanged) {
      if (existing) return existing;
      return {
        wordId,
        word: wordDisplay,
        status: 'unrated',
        tags,
        notes,
        firstRecordedAt: now,
        updatedAt: now,
        studyCount: 0,
      };
    }

    const record: UserWordRecord = existing
      ? {
          ...existing,
          tags,
          notes,
          updatedAt: now,
        }
      : {
          wordId,
          word: wordDisplay,
          status: 'unrated',
          tags,
          notes,
          firstRecordedAt: now,
          updatedAt: now,
          studyCount: 0,
        };

    await db.userWords.put(record);

    await db.activityLogs.add({
      timestamp: now,
      wordId,
      word: wordDisplay,
      actionType: tagsChanged ? 'tags_change' : 'note_change',
      previousStatus: record.status,
      newStatus: record.status,
      previousTags: prevTags,
      newTags: tags,
      previousNotes: prevNotes,
      newNotes: notes,
      previousStudyCount: prevStudyCount,
      newStudyCount: prevStudyCount,
      previousLastStudiedAt: prevLastStudiedAt,
      newLastStudiedAt: prevLastStudiedAt,
      existedBefore: Boolean(existing),
      sourceLabel,
    });

    return record;
  });
}

/**
 * Batch applies updates (status, tags, notes) to multiple words and records a shared batchId.
 * CRITICAL:
 * 1. When `item.status` and `options.defaultStatus` are both omitted (e.g. batch adding tags),
 *    `nextStatus` preserves `existing?.status ?? 'unrated'` and NEVER implicitly turns unrated words into `'queued'`.
 * 2. `studyCount` and `lastStudiedAt` are ONLY updated when `nextStatus !== prevStatus` AND `nextStatus` is `'learning'` or `'mastered'`.
 *    Adding tags or notes to an already-mastered word NEVER overwrites its `lastStudiedAt` or increments `studyCount`.
 */
export async function batchApplyWordUpdates(
  items: {
    wordId: string;
    word: string;
    status?: LearningStatus;
    tagsToAdd?: string[];
    noteToAppend?: string;
  }[],
  options: {
    defaultStatus?: LearningStatus;
    commonTags?: string[];
    sourceLabel: string;
    customTimestamp?: string;
  }
): Promise<{ batchId: string; updatedCount: number }> {
  if (items.length === 0) return { batchId: '', updatedCount: 0 };

  const timestamp = options.customTimestamp || new Date().toISOString();
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let actualUpdatedCount = 0;

  await db.transaction('rw', db.userWords, db.activityLogs, async () => {
    const ids = items.map((i) => i.wordId);
    const existingRecords = await db.userWords.bulkGet(ids);

    const recordsToPut: UserWordRecord[] = [];
    const logsToAdd: ActivityLogEntry[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const existing = existingRecords[i];

      const prevStatus: LearningStatus = existing?.status || 'unrated';
      const prevTags = existing?.tags || [];
      const prevNotes = existing?.notes || '';
      const prevStudyCount = existing?.studyCount || 0;
      const prevLastStudiedAt = existing?.lastStudiedAt;

      // Preserve existing status or 'unrated' if no status was specified!
      const nextStatus: LearningStatus =
        item.status ?? options.defaultStatus ?? existing?.status ?? 'unrated';

      const nextTags = Array.from(
        new Set([...prevTags, ...(options.commonTags || []), ...(item.tagsToAdd || [])])
      );

      let nextNotes = prevNotes;
      if (item.noteToAppend && item.noteToAppend.trim()) {
        const cleanNote = item.noteToAppend.trim();
        nextNotes = prevNotes
          ? prevNotes.includes(cleanNote)
            ? prevNotes
            : `${prevNotes}\n${cleanNote}`
          : cleanNote;
      }

      const statusChanged = nextStatus !== prevStatus;
      const tagsChanged = JSON.stringify(prevTags) !== JSON.stringify(nextTags);
      const notesChanged = prevNotes !== nextNotes;

      if (existing && !statusChanged && !tagsChanged && !notesChanged) {
        continue;
      }

      const studiedNow =
        statusChanged && (nextStatus === 'learning' || nextStatus === 'mastered');
      const nextStudyCount = studiedNow ? prevStudyCount + 1 : prevStudyCount;
      const nextLastStudiedAt = studiedNow ? timestamp : prevLastStudiedAt;

      const record: UserWordRecord = existing
        ? {
            ...existing,
            status: nextStatus,
            tags: nextTags,
            notes: nextNotes,
            updatedAt: timestamp,
            studyCount: nextStudyCount,
            lastStudiedAt: nextLastStudiedAt,
            sourceNote: options.sourceLabel,
          }
        : {
            wordId: item.wordId,
            word: item.word,
            status: nextStatus,
            tags: nextTags,
            notes: nextNotes,
            firstRecordedAt: timestamp,
            updatedAt: timestamp,
            studyCount: nextStudyCount,
            lastStudiedAt: nextLastStudiedAt,
            sourceNote: options.sourceLabel,
          };

      recordsToPut.push(record);
      logsToAdd.push({
        batchId,
        timestamp,
        wordId: item.wordId,
        word: item.word,
        actionType:
          item.status === undefined && options.defaultStatus === undefined
            ? 'tags_change'
            : 'batch_import',
        previousStatus: prevStatus,
        newStatus: nextStatus,
        previousTags: prevTags,
        newTags: nextTags,
        previousNotes: prevNotes,
        newNotes: nextNotes,
        previousStudyCount: prevStudyCount,
        newStudyCount: nextStudyCount,
        previousLastStudiedAt: prevLastStudiedAt,
        newLastStudiedAt: nextLastStudiedAt,
        existedBefore: Boolean(existing),
        sourceLabel: options.sourceLabel,
      });
    }

    actualUpdatedCount = recordsToPut.length;
    if (recordsToPut.length > 0) {
      await db.userWords.bulkPut(recordsToPut);
    }
    if (logsToAdd.length > 0) {
      await db.activityLogs.bulkAdd(logsToAdd);
    }
  });

  return { batchId, updatedCount: actualUpdatedCount };
}

/**
 * Safely rolls back a batch operation by batchId.
 * Checks if any affected word has subsequent modifications after this batch.
 * If newer modifications exist, refuses to overwrite newer edits and throws a clear error.
 * Restores status, tags, notes, studyCount, and lastStudiedAt consistently.
 */
export async function rollbackBatchById(batchId: string): Promise<number> {
  if (!batchId) return 0;
  const now = new Date().toISOString();

  return db.transaction('rw', db.userWords, db.activityLogs, async () => {
    const batchLogs = await db.activityLogs.where('batchId').equals(batchId).toArray();
    if (batchLogs.length === 0) return 0;

    const maxBatchLogId = Math.max(...batchLogs.map((l) => l.id ?? 0));
    const affectedWordIds = Array.from(new Set(batchLogs.map((l) => l.wordId)));

    const conflictingWords: string[] = [];
    for (const wordId of affectedWordIds) {
      const wordLogs = await db.activityLogs.where('wordId').equals(wordId).toArray();
      const hasNewerEdit = wordLogs.some(
        (l) => l.batchId !== batchId && (l.id ?? 0) > maxBatchLogId
      );
      if (hasNewerEdit) {
        const display = batchLogs.find((b) => b.wordId === wordId)?.word || wordId;
        conflictingWords.push(display);
      }
    }

    if (conflictingWords.length > 0) {
      const sample = conflictingWords.slice(0, 4).join('、');
      const suffix = conflictingWords.length > 4 ? ` 等 ${conflictingWords.length} 个词条` : '';
      throw new Error(
        `无法回滚该批次：词条「${sample}${suffix}」在此批次之后已有新的个人记录修改。为保护最新学习记录不被覆盖，已阻止整批回滚。`
      );
    }

    const existingRecords = await db.userWords.bulkGet(batchLogs.map((l) => l.wordId));
    const toRestore: UserWordRecord[] = [];
    const toDeleteIds: string[] = [];

    for (let i = 0; i < batchLogs.length; i++) {
      const log = batchLogs[i];
      const current = existingRecords[i];
      if (!current) continue;

      const restored = applyLogUndoToRecord(current, log, now);
      if (restored === null) {
        toDeleteIds.push(log.wordId);
      } else {
        toRestore.push(restored);
      }
    }

    if (toRestore.length > 0) {
      await db.userWords.bulkPut(toRestore);
    }
    if (toDeleteIds.length > 0) {
      await db.userWords.bulkDelete(toDeleteIds);
    }
    await db.activityLogs.bulkDelete(
      batchLogs.map((l) => l.id!).filter((id) => id !== undefined)
    );
    return toRestore.length + toDeleteIds.length;
  });
}

/**
 * Safely undoes a single activity log entry.
 * Refuses to undo if a newer activity log exists for the same wordId,
 * and restores all fields modified by that operation (status, tags, notes, studyCount, lastStudiedAt).
 */
export async function undoSingleActivityLog(logId: number): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.userWords, db.activityLogs, async () => {
    const log = await db.activityLogs.get(logId);
    if (!log) return;

    const wordLogs = await db.activityLogs.where('wordId').equals(log.wordId).toArray();
    const newerLogs = wordLogs.filter((l) => (l.id ?? 0) > (log.id ?? 0));
    if (newerLogs.length > 0) {
      throw new Error(
        `无法撤销此条旧记录：词条「${log.word}」在该操作之后还有 ${newerLogs.length} 条更新的修改记录。请先按时间倒序撤销最新操作，或直接在词条详情中修改。`
      );
    }

    const current = await db.userWords.get(log.wordId);
    if (current) {
      const restored = applyLogUndoToRecord(current, log, now);
      if (restored === null) {
        await db.userWords.delete(log.wordId);
      } else {
        await db.userWords.put(restored);
      }
    }

    await db.activityLogs.delete(logId);
  });
}

export interface FullBackupPayload {
  version: string;
  exportedAt: string;
  userWords: UserWordRecord[];
  collections: WordCollection[];
  activityLogs: ActivityLogEntry[];
  dictionaries?: DictionaryTemplate[];
  customDatasets?: CustomDatasetRecord[];
}

export async function exportFullBackupJson(
  dictionaries: DictionaryTemplate[]
): Promise<string> {
  const [userWords, collections, activityLogs, customDatasets] = await Promise.all([
    db.userWords.toArray(),
    db.collections.toArray(),
    db.activityLogs.toArray(),
    db.customDatasets.toArray(),
  ]);

  const payload: FullBackupPayload = {
    version: '1.1.0',
    exportedAt: new Date().toISOString(),
    userWords,
    collections,
    activityLogs,
    dictionaries,
    customDatasets,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Validates and imports a backup JSON string.
 * Supports:
 * - 'merge' (按更新时间合并): compares updatedAt timestamps so the newer record wins (including active resets to 'unrated' or tag/collection edits),
 *   with conservative fallback only on identical/missing timestamps.
 * - 'overwrite' (完全覆盖): validates structure first, then atomically replaces all tables.
 */
export async function importBackupJson(
  jsonText: string,
  mode: 'merge' | 'overwrite'
): Promise<{
  importedWords: number;
  importedLogs: number;
  importedCollections: number;
  importedDatasets: number;
  importedCustomDatasets: number;
  dictionaries?: DictionaryTemplate[];
}> {
  let parsed: Partial<FullBackupPayload>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('备份文件不是合法的 JSON 格式');
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.userWords)) {
    throw new Error('备份文件缺少有效的 userWords 数组字段，已拒绝导入以保护现有数据');
  }
  if (parsed.collections !== undefined && !Array.isArray(parsed.collections)) {
    throw new Error('备份文件 collections 字段格式无效');
  }
  if (parsed.activityLogs !== undefined && !Array.isArray(parsed.activityLogs)) {
    throw new Error('备份文件 activityLogs 字段格式无效');
  }
  if (parsed.customDatasets !== undefined && !Array.isArray(parsed.customDatasets)) {
    throw new Error('备份文件 customDatasets 字段格式无效');
  }

  const incomingWords = parsed.userWords;
  const incomingCols = parsed.collections || [];
  const incomingLogs = parsed.activityLogs || [];
  const incomingDatasets = parsed.customDatasets || [];

  return db.transaction(
    'rw',
    db.userWords,
    db.collections,
    db.activityLogs,
    db.customDatasets,
    async () => {
      if (mode === 'overwrite') {
        await Promise.all([
          db.userWords.clear(),
          db.collections.clear(),
          db.activityLogs.clear(),
          db.customDatasets.clear(),
        ]);

        if (incomingWords.length > 0) await db.userWords.bulkPut(incomingWords);
        if (incomingCols.length > 0) await db.collections.bulkPut(incomingCols);
        if (incomingLogs.length > 0) await db.activityLogs.bulkPut(incomingLogs);
        if (incomingDatasets.length > 0) await db.customDatasets.bulkPut(incomingDatasets);

        return {
          importedWords: incomingWords.length,
          importedCollections: incomingCols.length,
          importedLogs: incomingLogs.length,
          importedDatasets: incomingDatasets.length,
          importedCustomDatasets: incomingDatasets.length,
          dictionaries: parsed.dictionaries,
        };
      }

      // Timestamp-aware Merge (按更新时间优先合并，时间戳相同时保守合并)
      let importedWords = 0;
      for (const item of incomingWords) {
        if (!item || !item.wordId) continue;
        const existing = await db.userWords.get(item.wordId);
        if (!existing) {
          await db.userWords.put(item);
          importedWords++;
        } else {
          const merged = mergeUserWordRecordPair(existing, item);
          await db.userWords.put(merged);
          importedWords++;
        }
      }

      let importedCollections = 0;
      for (const col of incomingCols) {
        if (!col || !col.id) continue;
        const existingCol = await db.collections.get(col.id);
        if (!existingCol) {
          await db.collections.put(col);
        } else {
          const mergedCol = mergeWordCollectionPair(existingCol, col);
          await db.collections.put(mergedCol);
        }
        importedCollections++;
      }

      let importedLogs = 0;
      if (incomingLogs.length > 0) {
        const existingLogs = await db.activityLogs.toArray();
        const existingSigs = new Set(
          existingLogs.map((l) => `${l.timestamp}|${l.wordId}|${l.actionType}`)
        );
        const newLogs: ActivityLogEntry[] = [];
        for (const log of incomingLogs) {
          const sig = `${log.timestamp}|${log.wordId}|${log.actionType}`;
          if (!existingSigs.has(sig)) {
            existingSigs.add(sig);
            const { id: _ignoreId, ...rest } = log;
            newLogs.push(rest);
          }
        }
        if (newLogs.length > 0) {
          await db.activityLogs.bulkAdd(newLogs);
          importedLogs = newLogs.length;
        }
      }

      let importedDatasets = 0;
      if (incomingDatasets.length > 0) {
        await db.customDatasets.bulkPut(incomingDatasets);
        importedDatasets = incomingDatasets.length;
      }

      return {
        importedWords,
        importedCollections,
        importedLogs,
        importedDatasets,
        importedCustomDatasets: importedDatasets,
        dictionaries: parsed.dictionaries,
      };
    }
  );
}
