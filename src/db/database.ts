import Dexie, { type Table } from 'dexie';
import { DEFAULT_FILTER_CRITERIA } from '../data/searchAndFilter.ts';
import {
  ActivityLogEntry,
  DictionaryTemplate,
  LearningStatus,
  UserWordRecord,
  WordCollection,
} from '../data/types.ts';

export interface CustomDatasetOverride {
  id: 'cet2016' | 'bnc_coca';
  fileName: string;
  content: string;
  updatedAt: string;
}

export interface BackupPayloadV1 {
  app: 'Lexical Workbench';
  schemaVersion: 1;
  exportedAt: string;
  userWords: UserWordRecord[];
  activityLogs: ActivityLogEntry[];
  collections: WordCollection[];
  dictionaries?: DictionaryTemplate[];
}

export class LexicalWorkbenchDB extends Dexie {
  userWords!: Table<UserWordRecord, string>;
  activityLogs!: Table<ActivityLogEntry, number>;
  collections!: Table<WordCollection, string>;
  customDatasets!: Table<CustomDatasetOverride, string>;

  constructor() {
    super('LexicalWorkbenchDB_v1');
    this.version(1).stores({
      userWords: 'wordId, status, updatedAt, firstRecordedAt, *tags',
      activityLogs: '++id, batchId, timestamp, wordId, actionType',
      collections: 'id, type, updatedAt',
      customDatasets: 'id, updatedAt',
    });
  }
}

export const db = new LexicalWorkbenchDB();

export async function ensureDefaultCollections(): Promise<void> {
  const count = await db.collections.count();
  if (count > 0) return;

  const now = new Date().toISOString();
  const initialCollections: WordCollection[] = [
    {
      id: 'col_cet4_high_freq',
      name: 'CET-4 高频核心词 (1k–3k)',
      description: '同时属于四级大纲且处于 BNC/COCA 前 3000 词族的高价值词汇',
      type: 'dynamic',
      wordIds: [],
      filterCriteria: {
        ...DEFAULT_FILTER_CRITERIA,
        sourceFilter: 'cet4',
        minBand: 1,
        maxBand: 3,
      },
      sortField: 'family_freq_desc',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'col_cet6_only',
      name: 'CET-6 大纲进阶核心词',
      description: '大纲中的六级专属词汇，按语料库词族总频次降序排列',
      type: 'dynamic',
      wordIds: [],
      filterCriteria: {
        ...DEFAULT_FILTER_CRITERIA,
        sourceFilter: 'cet6_new',
      },
      sortField: 'family_freq_desc',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'col_cet_phrases',
      name: '大纲多词短语与固定搭配',
      description: 'CET2016 大纲原表收录的带空格短语词条（如 owing to, baby boom 等）',
      type: 'dynamic',
      wordIds: [],
      filterCriteria: {
        ...DEFAULT_FILTER_CRITERIA,
        sourceFilter: 'cet_all',
        phrasesOnly: true,
      },
      sortField: 'word_asc',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'col_high_family_derivatives',
      name: '高频词族低频派生词',
      description: '词族总频次 >= 5,000 但单一词形频次较低的派生词，适合通过熟词顺带攻克',
      type: 'dynamic',
      wordIds: [],
      filterCriteria: {
        ...DEFAULT_FILTER_CRITERIA,
        sourceFilter: 'cet_all',
        familyFilter: 'high_family_low_form',
      },
      sortField: 'family_freq_desc',
      createdAt: now,
      updatedAt: now,
    },
  ];

  await db.collections.bulkPut(initialCollections);
}

export async function updateWordStatus(
  wordId: string,
  wordDisplay: string,
  newStatus: LearningStatus,
  sourceLabel = '手动设置'
): Promise<UserWordRecord> {
  const now = new Date().toISOString();
  return db.transaction('rw', db.userWords, db.activityLogs, async () => {
    const existing = await db.userWords.get(wordId);
    const previousStatus: LearningStatus = existing?.status || 'unrated';

    const record: UserWordRecord = existing
      ? {
          ...existing,
          status: newStatus,
          updatedAt: now,
        }
      : {
          wordId,
          word: wordDisplay,
          status: newStatus,
          tags: [],
          notes: '',
          firstRecordedAt: now,
          updatedAt: now,
          sourceNote: sourceLabel,
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
        sourceLabel,
      });
    }

    return record;
  });
}

export async function updateWordTagsAndNotes(
  wordId: string,
  wordDisplay: string,
  tags: string[],
  notes: string
): Promise<UserWordRecord> {
  const now = new Date().toISOString();
  const cleanTags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));

  return db.transaction('rw', db.userWords, db.activityLogs, async () => {
    const existing = await db.userWords.get(wordId);
    const previousTags = existing?.tags || [];
    const previousNotes = existing?.notes || '';

    const record: UserWordRecord = existing
      ? {
          ...existing,
          tags: cleanTags,
          notes,
          updatedAt: now,
        }
      : {
          wordId,
          word: wordDisplay,
          status: 'unrated',
          tags: cleanTags,
          notes,
          firstRecordedAt: now,
          updatedAt: now,
        };

    await db.userWords.put(record);

    if (JSON.stringify(previousTags) !== JSON.stringify(cleanTags)) {
      await db.activityLogs.add({
        timestamp: now,
        wordId,
        word: wordDisplay,
        actionType: 'tags_change',
        previousTags,
        newTags: cleanTags,
      });
    }

    if (previousNotes !== notes) {
      await db.activityLogs.add({
        timestamp: now,
        wordId,
        word: wordDisplay,
        actionType: 'note_change',
        previousNotes,
        newNotes: notes,
      });
    }

    return record;
  });
}

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
    sourceLabel?: string;
    customTimestamp?: string;
  }
): Promise<{ batchId: string; updatedCount: number }> {
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const timestamp = options.customTimestamp || new Date().toISOString();
  const sourceLabel = options.sourceLabel || '批量录入';

  let updatedCount = 0;

  await db.transaction('rw', db.userWords, db.activityLogs, async () => {
    for (const item of items) {
      const existing = await db.userWords.get(item.wordId);
      const prevStatus: LearningStatus = existing?.status || 'unrated';
      const prevTags = existing?.tags || [];
      const prevNotes = existing?.notes || '';

      const nextStatus: LearningStatus =
        item.status ?? options.defaultStatus ?? existing?.status ?? 'queued';
      const mergedTags = Array.from(
        new Set([
          ...prevTags,
          ...(options.commonTags || []),
          ...(item.tagsToAdd || []),
        ])
      );
      const nextNotes = item.noteToAppend
        ? prevNotes
          ? `${prevNotes}\n${item.noteToAppend}`
          : item.noteToAppend
        : prevNotes;

      const record: UserWordRecord = {
        wordId: item.wordId,
        word: item.word,
        status: nextStatus,
        tags: mergedTags,
        notes: nextNotes,
        firstRecordedAt: existing?.firstRecordedAt || timestamp,
        updatedAt: timestamp,
        sourceNote: sourceLabel,
      };

      await db.userWords.put(record);
      await db.activityLogs.add({
        batchId,
        timestamp,
        wordId: item.wordId,
        word: item.word,
        actionType: 'batch_import',
        previousStatus: prevStatus,
        newStatus: nextStatus,
        previousTags: prevTags,
        newTags: mergedTags,
        previousNotes: prevNotes,
        newNotes: nextNotes,
        sourceLabel,
      });
      updatedCount++;
    }
  });

  return { batchId, updatedCount };
}

export async function rollbackBatchById(batchId: string): Promise<number> {
  return db.transaction('rw', db.userWords, db.activityLogs, async () => {
    const logs = await db.activityLogs.where('batchId').equals(batchId).toArray();
    if (logs.length === 0) return 0;

    // Revert in reverse chronological order
    const sortedLogs = [...logs].sort((a, b) => (b.id || 0) - (a.id || 0));
    const now = new Date().toISOString();

    for (const log of sortedLogs) {
      const current = await db.userWords.get(log.wordId);
      if (current) {
        await db.userWords.put({
          ...current,
          status: log.previousStatus ?? 'unrated',
          tags: log.previousTags ?? [],
          notes: log.previousNotes ?? '',
          updatedAt: now,
        });
      }
      if (log.id !== undefined) {
        await db.activityLogs.delete(log.id);
      }
    }

    return logs.length;
  });
}

export async function undoSingleActivityLog(logId: number): Promise<boolean> {
  return db.transaction('rw', db.userWords, db.activityLogs, async () => {
    const log = await db.activityLogs.get(logId);
    if (!log) return false;

    const current = await db.userWords.get(log.wordId);
    const now = new Date().toISOString();
    if (current) {
      await db.userWords.put({
        ...current,
        status: log.previousStatus ?? current.status,
        tags: log.previousTags ?? current.tags,
        notes: log.previousNotes ?? current.notes,
        updatedAt: now,
      });
    }
    await db.activityLogs.delete(logId);
    return true;
  });
}

export async function exportFullBackupJson(
  dictionaries: DictionaryTemplate[]
): Promise<string> {
  const [userWords, activityLogs, collections] = await Promise.all([
    db.userWords.toArray(),
    db.activityLogs.toArray(),
    db.collections.toArray(),
  ]);

  const payload: BackupPayloadV1 = {
    app: 'Lexical Workbench',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    userWords,
    activityLogs,
    collections,
    dictionaries,
  };

  return JSON.stringify(payload, null, 2);
}

export async function importBackupJson(
  jsonText: string,
  mode: 'overwrite' | 'merge'
): Promise<{
  importedWords: number;
  importedLogs: number;
  importedCollections: number;
  dictionaries?: DictionaryTemplate[];
}> {
  let parsed: BackupPayloadV1;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('JSON 文件格式无效，无法解析。');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.app !== 'Lexical Workbench' ||
    !Array.isArray(parsed.userWords)
  ) {
    throw new Error('备份文件缺少必要的 Lexical Workbench 结构字段 (userWords)。');
  }

  return db.transaction('rw', db.userWords, db.activityLogs, db.collections, async () => {
    if (mode === 'overwrite') {
      await Promise.all([
        db.userWords.clear(),
        db.activityLogs.clear(),
        db.collections.clear(),
      ]);
      await db.userWords.bulkPut(parsed.userWords);
      if (Array.isArray(parsed.activityLogs)) {
        const cleanLogs = parsed.activityLogs.map(({ id: _id, ...rest }) => rest);
        await db.activityLogs.bulkAdd(cleanLogs);
      }
      if (Array.isArray(parsed.collections)) {
        await db.collections.bulkPut(parsed.collections);
      }
      return {
        importedWords: parsed.userWords.length,
        importedLogs: parsed.activityLogs?.length || 0,
        importedCollections: parsed.collections?.length || 0,
        dictionaries: parsed.dictionaries,
      };
    } else {
      // Merge mode: preserve newer status, union tags, keep non-empty notes
      let mergedWordsCount = 0;
      for (const incoming of parsed.userWords) {
        const existing = await db.userWords.get(incoming.wordId);
        if (!existing) {
          await db.userWords.put(incoming);
          mergedWordsCount++;
        } else {
          const isIncomingNewer = incoming.updatedAt >= existing.updatedAt;
          const mergedTags = Array.from(new Set([...existing.tags, ...(incoming.tags || [])]));
          const mergedNotes = existing.notes
            ? incoming.notes && !existing.notes.includes(incoming.notes)
              ? `${existing.notes}\n${incoming.notes}`
              : existing.notes
            : incoming.notes || '';

          await db.userWords.put({
            wordId: existing.wordId,
            word: existing.word,
            status: isIncomingNewer ? incoming.status : existing.status,
            tags: mergedTags,
            notes: mergedNotes,
            firstRecordedAt:
              incoming.firstRecordedAt < existing.firstRecordedAt
                ? incoming.firstRecordedAt
                : existing.firstRecordedAt,
            updatedAt: isIncomingNewer ? incoming.updatedAt : existing.updatedAt,
            sourceNote: incoming.sourceNote || existing.sourceNote,
          });
          mergedWordsCount++;
        }
      }

      if (Array.isArray(parsed.collections)) {
        await db.collections.bulkPut(parsed.collections);
      }

      return {
        importedWords: mergedWordsCount,
        importedLogs: 0,
        importedCollections: parsed.collections?.length || 0,
        dictionaries: parsed.dictionaries,
      };
    }
  });
}
