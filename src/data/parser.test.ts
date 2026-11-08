import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildLexiconDatabase,
  expandCetMemberToken,
  parseBncCoca,
  parseCet2016,
  validateCustomDatasetContent,
} from './parser.ts';
import {
  buildDictionaryUrl,
  compareCorpusWordSets,
  computeLexiconAnalytics,
  computeMultiObjectiveStudyCandidates,
  computeStudyPriorityScore,
  DEFAULT_FILTER_CRITERIA,
  escapeCsvField,
  filterAndSortCocaLexemes,
  filterAndSortWords,
  parseBatchInputText,
  parseCsvLine,
  resolvePresetWordSet,
  searchLexicon,
  selectFamilyCetWordIdsForQueue,
  splitCsvRecords,
} from './searchAndFilter.ts';
import {
  applyLogUndoToRecord,
  mergeUserWordRecordPair,
  mergeWordCollectionPair,
} from '../db/database.ts';
import {
  formatFamilyRoleAndShare,
  getIntraFamilyShareDetail,
} from '../utils/frequency.ts';
import type { ActivityLogEntry, UserWordRecord, WordCollection } from './types.ts';

test('CET2016 token expansion handles all required edge cases accurately', () => {
  // 1. a/an parallel slash
  const aAn = expandCetMemberToken('a/an');
  assert.deepEqual(aAn.expandedForms, ['a', 'an']);
  assert.equal(aAn.expansionRule, 'slash_parallel');
  assert.equal(aAn.isCet6Star, false);

  // 2. jewel(l)ery parenthetical optional letter
  const jewel = expandCetMemberToken('jewel(l)ery');
  assert.deepEqual(jewel.expandedForms, ['jewelery', 'jewellery']);
  assert.equal(jewel.expansionRule, 'paren_optional');

  // 3. advisor/-er suffix shorthand
  const advisor = expandCetMemberToken('advisor/-er');
  assert.deepEqual(advisor.expandedForms, ['advisor', 'adviser']);
  assert.equal(advisor.expansionRule, 'slash_suffix');

  // 4. ★appropriate² CET6 star + homograph superscript
  const approp2 = expandCetMemberToken('★appropriate²');
  assert.equal(approp2.isCet6Star, true);
  assert.equal(approp2.homographNumber, 2);
  assert.deepEqual(approp2.expandedForms, ['appropriate']);

  // 5. owing to & baby boom multi-word phrases
  const owing = expandCetMemberToken('owing to');
  assert.deepEqual(owing.expandedForms, ['owing to']);
  assert.equal(owing.expansionRule, 'phrase');

  const babyBoom = expandCetMemberToken('baby boom');
  assert.deepEqual(babyBoom.expandedForms, ['baby boom']);
  assert.equal(babyBoom.expansionRule, 'phrase');

  // 6. Celsius/-cius preserves both syllabus forms
  const celsius = expandCetMemberToken('Celsius/-cius');
  assert.equal(celsius.isAmbiguous, true);
  assert.deepEqual(celsius.expandedForms, ['Celsius', 'Celcius']);

  // 7. ★sober/-re preserves both syllabus forms ['sober', 'sobre']
  const sober = expandCetMemberToken('★sober/-re');
  assert.equal(sober.isCet6Star, true);
  assert.equal(sober.isAmbiguous, true);
  assert.deepEqual(sober.expandedForms, ['sober', 'sobre']);
});

test('CET2016 parser handles UTF-8 BOM, true Tab delimiters, and line relationships', () => {
  const sampleCet = `\uFEFFa/an
able\tability
account\taccounting\taccountant\taccountancy
★abbreviation
appropriate¹
★appropriate²\tappropriation
owe\towing to
baby boom\tbaby boomer
★appal(l)\tappalling
advise\tadvisor/-er\tadvisory\tadvisable
Celsius/-cius`;

  const { entries, diagnostics } = parseCet2016(sampleCet);
  assert.equal(entries.length, 11);

  // Check BOM stripped from first entry
  assert.equal(entries[0].headwordRaw, 'a/an');
  assert.deepEqual(entries[0].members[0].expandedForms, ['a', 'an']);

  // Check inline derivatives for account
  assert.equal(entries[2].members.length, 4);
  assert.equal(entries[2].members[0].rawText, 'account');
  assert.equal(entries[2].members[3].rawText, 'accountancy');

  // Check homograph separation: appropriate¹ (CET4) vs ★appropriate² (CET6)
  assert.equal(entries[4].level, 'CET4');
  assert.equal(entries[4].members[0].homographNumber, 1);
  assert.equal(entries[5].level, 'CET6');
  assert.equal(entries[5].members[0].homographNumber, 2);
  assert.equal(entries[5].members[1].rawText, 'appropriation');

  // Check multi-word phrase preservation inside tab-separated entry
  assert.equal(entries[6].members[0].expandedForms[0], 'owe');
  assert.equal(entries[6].members[1].expandedForms[0], 'owing to');

  assert.equal(entries[7].members[0].expandedForms[0], 'baby boom');
  assert.equal(entries[7].members[1].expandedForms[0], 'baby boomer');

  // Check ambiguous diagnostic generated for Celsius/-cius
  assert.ok(
    diagnostics.some((d) => d.category === 'ambiguous_spelling' && d.rawText === 'Celsius/-cius')
  );
});

test('BNC/COCA parser handles quotes, zero-frequency forms, and sum mismatch diagnostics', () => {
  const sampleBnc = `List \tHeadword \tRelated forms\tTotal frequency
1k\table\t"able (29930), abilities (1334), ability (9113), ably (105), inability (1256), unable (6022), unably (0)"\t47760
1k\tabout\tabout (192168)\t192168
2k\tmismatchword\t"mismatchword (100), mismatchwords (50)"\t200`;

  const { families, diagnostics } = parseBncCoca(sampleBnc);
  assert.equal(families.length, 3);

  const ableFam = families[0];
  assert.equal(ableFam.band, '1k');
  assert.equal(ableFam.bandNumber, 1);
  assert.equal(ableFam.headword, 'able');
  assert.equal(ableFam.totalFrequency, 47760);
  assert.equal(ableFam.calculatedSum, 47760);
  assert.equal(ableFam.hasSumMismatch, false);

  // Verify headword is not double-counted
  assert.equal(ableFam.members.filter((m) => m.word === 'able').length, 1);

  // Verify zero-frequency member is preserved with frequency = 0
  const unably = ableFam.members.find((m) => m.word === 'unably');
  assert.ok(unably);
  assert.equal(unably.frequency, 0);
  assert.equal(unably.isZeroFrequency, true);

  // Verify sum mismatch detection preserves official Total frequency (200) and logs diagnostic
  const mismatchFam = families[2];
  assert.equal(mismatchFam.totalFrequency, 200);
  assert.equal(mismatchFam.calculatedSum, 150);
  assert.equal(mismatchFam.hasSumMismatch, true);
  assert.ok(diagnostics.some((d) => d.category === 'sum_mismatch'));
});

test('Cross-source lexicon builder never fabricates variant formFrequency and preserves multi-family memberships', () => {
  const sampleCet = `able\tability
appropriate¹
★appropriate²\tappropriation
owe\towing to
★sober/-re
often/oftentimes`;

  const sampleBnc = `List \tHeadword \tRelated forms\tTotal frequency
1k\table\t"able (29930), abilities (1334), ability (9113), unably (0)"\t47760
1k\towe\t"owe (3000), owed (2000), owes (1000), owing (1500)"\t7500
2k\tappropriate\t"appropriate (10000), appropriately (2000), appropriation (500)"\t12500
4k\tsober\t"sober (1362), sobered (120), sobering (200)"\t1682
1k\toften\t"often (77996), oftener (12)"\t78008
1k\tgrandfather\t"grandfather (3000), grannies (17)"\t3017
6k\tgranny\t"granny (1000), grannies (45)"\t1045`;

  const bundle = buildLexiconDatabase(sampleCet, sampleBnc);
  const byId = new Map(bundle.words.map((w) => [w.id, w]));

  // 1. "sober" is directly in BNC (freq 1362), while "sobre" is NOT in BNC -> formFrequency MUST be null (never 1362!)
  const sober = byId.get('sober')!;
  const sobre = byId.get('sobre')!;
  assert.equal(sober.inBnc, true);
  assert.equal(sober.hasExactBncForm, true);
  assert.equal(sober.formFrequency, 1362);

  assert.equal(sobre.inCet, true);
  assert.equal(sobre.inBnc, false);
  assert.equal(sobre.hasExactBncForm, false);
  assert.equal(sobre.bncLinkedViaVariant, true);
  assert.equal(sobre.formFrequency, null);
  assert.equal(sobre.headword, 'sober');
  assert.equal(sobre.familyFrequency, 1682);

  // 2. "oftentimes" is linked to "often" family via variant, with formFrequency = null
  const oftentimes = byId.get('oftentimes')!;
  assert.equal(oftentimes.inBnc, false);
  assert.equal(oftentimes.bncLinkedViaVariant, true);
  assert.equal(oftentimes.formFrequency, null);
  assert.equal(oftentimes.headword, 'often');

  // 3. "grannies" appears in two BNC families: grandfather (1k, 17) and granny (6k, 45)
  const grannies = byId.get('grannies')!;
  assert.equal(grannies.inBnc, true);
  assert.equal(grannies.bncMemberships?.length, 2);
  assert.equal(grannies.bncMemberships?.[0].headword, 'grandfather');
  assert.equal(grannies.bncMemberships?.[0].frequency, 17);
  assert.equal(grannies.bncMemberships?.[1].headword, 'granny');
  assert.equal(grannies.bncMemberships?.[1].frequency, 45);
});

test('RFC 4180 CSV parser, CSV escaping, and CET partial vs full official entry analytics work accurately', () => {
  const sampleCet = `able\tability
advise\tadvisor/-er\tadvisory\tadvisable
owe\towing to
★appropriate²\tappropriation`;

  const sampleBnc = `List \tHeadword \tRelated forms\tTotal frequency
1k\table\t"able (29930), abilities (1334), ability (9113)"\t40377
2k\tadvise\t"advise (5000), adviser (2000), advisor (3000), advisory (1000), advisable (500)"\t11500`;

  const bundle = buildLexiconDatabase(sampleCet, sampleBnc);
  const wordsMap = new Map(bundle.words.map((w) => [w.id, w]));

  // RFC 4180 CSV line parsing
  const csvFields = parseCsvLine(
    '"ability","mastered","核心词,高频","note, with ""quotes"" and comma"'
  );
  assert.deepEqual(csvFields, [
    'ability',
    'mastered',
    '核心词,高频',
    'note, with "quotes" and comma',
  ]);

  // CSV field escaping
  assert.equal(escapeCsvField('simple'), 'simple');
  assert.equal(escapeCsvField('has, comma'), '"has, comma"');
  assert.equal(escapeCsvField('has "quote"'), '"has ""quote"""');

  // Batch input parser handles mixed TSV and RFC 4180 CSV lines
  const batchRows = parseBatchInputText(
    `owing to\n"able","已掌握","核心词,高频","基础四级词, 重要"\nowing to\nunknownxyz`,
    wordsMap,
    bundle.words
  );
  assert.equal(batchRows.length, 4);
  assert.equal(batchRows[0].cleanedTerm, 'owing to');
  assert.equal(batchRows[0].matchStatus, 'matched_exact');
  assert.equal(batchRows[1].parsedStatus, 'mastered');
  assert.deepEqual(batchRows[1].parsedTags, ['核心词', '高频']);
  assert.equal(batchRows[1].parsedNote, '基础四级词, 重要');
  assert.equal(batchRows[2].isDuplicateInBatch, true);
  assert.equal(batchRows[3].matchStatus, 'unmatched');

  // Analytics partial vs full official CET entry coverage
  // Entry "able \t ability" has 2 member slots: "able" and "ability".
  // If only "able" is mastered, partial coverage = 1, full mastery = 0.
  const userRecords = new Map<string, UserWordRecord>([
    [
      'able',
      {
        wordId: 'able',
        word: 'able',
        status: 'mastered',
        tags: ['高频'],
        notes: 'test',
        firstRecordedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ],
  ]);

  const analyticsPartial = computeLexiconAnalytics(
    bundle.words,
    bundle.families,
    bundle.cetEntries,
    userRecords
  );
  assert.equal(analyticsPartial.cet4OfficialPartialCovered, 1);
  assert.equal(analyticsPartial.cet4OfficialFullMastered, 0);

  // Once "ability" is also mastered, full mastery for the "able \t ability" entry becomes 1
  userRecords.set('ability', {
    wordId: 'ability',
    word: 'ability',
    status: 'mastered',
    tags: [],
    notes: '',
    firstRecordedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  });
  const analyticsFull = computeLexiconAnalytics(
    bundle.words,
    bundle.families,
    bundle.cetEntries,
    userRecords
  );
  assert.equal(analyticsFull.cet4OfficialPartialCovered, 1);
  assert.equal(analyticsFull.cet4OfficialFullMastered, 1);

  // Dictionary URL builder strips ★ and superscripts ¹²³
  const cambridgeUrl = buildDictionaryUrl(
    '★appropriate²',
    'https://dictionary.cambridge.org/dictionary/english-chinese-simplified/{word}'
  );
  assert.equal(
    cambridgeUrl,
    'https://dictionary.cambridge.org/dictionary/english-chinese-simplified/appropriate'
  );

  // Priority score check
  const priorityAble = computeStudyPriorityScore(wordsMap.get('able')!, userRecords.get('able'));
  assert.equal(priorityAble.score, 0); // mastered -> 0
  const priorityAdvise = computeStudyPriorityScore(wordsMap.get('advise')!);
  assert.ok(priorityAdvise.score > 500);
});

test('Full real dataset integration test (CET2016.txt + BNC_COCA_lists.txt)', () => {
  const cetPath = path.resolve(process.cwd(), 'public/data/CET2016.txt');
  const bncPath = path.resolve(process.cwd(), 'public/data/BNC_COCA_lists.txt');
  const cetRaw = fs.readFileSync(cetPath, 'utf8');
  const bncRaw = fs.readFileSync(bncPath, 'utf8');

  const bundle = buildLexiconDatabase(cetRaw, bncRaw);
  assert.equal(bundle.diagnostics.cetTotalLines, 5377);
  assert.equal(bundle.diagnostics.cetDistinctWordForms, 8014);
  assert.equal(bundle.diagnostics.bncFamilyCount, 25002);
  assert.equal(bundle.diagnostics.bncTotalWordForms, 76126);
  assert.equal(bundle.diagnostics.bncDistinctWordForms, 76125);
  assert.equal(bundle.diagnostics.bncBandsCount, 25);
  assert.equal(bundle.diagnostics.totalDistinctLexiconWords, 76331);
  assert.equal(bundle.diagnostics.bothCetAndBncCount, 7825);
  assert.equal(bundle.diagnostics.cetVariantLinkedCount, 17);
  assert.equal(bundle.diagnostics.cetOnlyCount, 189);

  const byId = new Map(bundle.words.map((w) => [w.id, w]));

  // Verify specific audited CET variants do NOT borrow sibling frequency
  for (const variantWord of ['sobre', 'oftentimes', 'airplane', "coup d'état", 'bbq']) {
    const item = byId.get(variantWord);
    assert.ok(item, `Expected ${variantWord} to exist in unified lexicon`);
    assert.equal(item.inBnc, false, `Expected ${variantWord} inBnc=false`);
    assert.equal(item.hasExactBncForm, false, `Expected ${variantWord} hasExactBncForm=false`);
    assert.equal(item.formFrequency, null, `Expected ${variantWord} formFrequency=null`);
    assert.equal(item.bncLinkedViaVariant, true, `Expected ${variantWord} bncLinkedViaVariant=true`);
  }

  // Verify multi-family BNC word "grannies" retains both memberships
  const grannies = byId.get('grannies')!;
  assert.equal(grannies.bncMemberships?.length, 2);
});

test('Undo & batch rollback restore studyCount, lastStudiedAt, and simultaneous tags + notes accurately', () => {
  const currentRecord: UserWordRecord = {
    wordId: 'able',
    word: 'able',
    status: 'mastered',
    tags: ['核心词', '四级'],
    notes: '第一行笔记\n第二行追加笔记',
    firstRecordedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-02T10:00:00.000Z',
    lastStudiedAt: '2026-02-02T10:00:00.000Z',
    studyCount: 3,
  };

  // 1. Batch import log that simultaneously changed status, studyCount, lastStudiedAt, tags, and notes
  const batchLog: ActivityLogEntry = {
    id: 101,
    timestamp: '2026-02-02T10:00:00.000Z',
    actionType: 'batch_import',
    wordId: 'able',
    word: 'able',
    previousStatus: 'learning',
    newStatus: 'mastered',
    previousTags: ['核心词'],
    newTags: ['核心词', '四级'],
    previousNotes: '第一行笔记',
    newNotes: '第一行笔记\n第二行追加笔记',
    previousStudyCount: 2,
    newStudyCount: 3,
    previousLastStudiedAt: '2026-01-15T08:00:00.000Z',
    newLastStudiedAt: '2026-02-02T10:00:00.000Z',
    existedBefore: true,
  };

  const restored = applyLogUndoToRecord(currentRecord, batchLog, '2026-02-03T00:00:00.000Z');
  assert.ok(restored);
  assert.equal(restored.status, 'learning');
  assert.deepEqual(restored.tags, ['核心词']);
  assert.equal(restored.notes, '第一行笔记');
  assert.equal(restored.studyCount, 2);
  assert.equal(restored.lastStudiedAt, '2026-01-15T08:00:00.000Z');

  // 2. Study touch undo restores studyCount and previousLastStudiedAt without mutating status
  const touchedRecord: UserWordRecord = {
    ...restored,
    studyCount: 3,
    lastStudiedAt: '2026-02-04T09:00:00.000Z',
    updatedAt: '2026-02-04T09:00:00.000Z',
  };
  const touchLog: ActivityLogEntry = {
    id: 102,
    timestamp: '2026-02-04T09:00:00.000Z',
    actionType: 'study_touch',
    wordId: 'able',
    word: 'able',
    previousStatus: 'learning',
    newStatus: 'learning',
    previousStudyCount: 2,
    newStudyCount: 3,
    previousLastStudiedAt: '2026-01-15T08:00:00.000Z',
    newLastStudiedAt: '2026-02-04T09:00:00.000Z',
    existedBefore: true,
  };
  const afterTouchUndo = applyLogUndoToRecord(touchedRecord, touchLog, '2026-02-04T09:05:00.000Z');
  assert.ok(afterTouchUndo);
  assert.equal(afterTouchUndo.status, 'learning');
  assert.equal(afterTouchUndo.studyCount, 2);
  assert.equal(afterTouchUndo.lastStudiedAt, '2026-01-15T08:00:00.000Z');

  // 3. Undoing the creation of a brand-new record (existedBefore=false) returns null so the row is removed cleanly
  const firstTimeRecord: UserWordRecord = {
    wordId: 'newbie',
    word: 'newbie',
    status: 'queued',
    tags: [],
    notes: '',
    firstRecordedAt: '2026-02-05T00:00:00.000Z',
    updatedAt: '2026-02-05T00:00:00.000Z',
    studyCount: 0,
  };
  const firstTimeLog: ActivityLogEntry = {
    id: 103,
    timestamp: '2026-02-05T00:00:00.000Z',
    actionType: 'status_change',
    wordId: 'newbie',
    word: 'newbie',
    previousStatus: 'unrated',
    newStatus: 'queued',
    previousStudyCount: 0,
    newStudyCount: 0,
    existedBefore: false,
  };
  const deletedResult = applyLogUndoToRecord(
    firstTimeRecord,
    firstTimeLog,
    '2026-02-05T00:01:00.000Z'
  );
  assert.equal(deletedResult, null);
});

test('Family CET batch queue selector protects already-rated members by default', () => {
  const sampleCet = `able\tability\tunable`;
  const sampleBnc = `List \tHeadword \tRelated forms\tTotal frequency
1k\table\t"able (29930), abilities (1334), ability (9113), unable (6022), unably (0)"\t46400`;
  const bundle = buildLexiconDatabase(sampleCet, sampleBnc);
  const wordsMap = new Map(bundle.words.map((w) => [w.id, w]));
  const family = bundle.families[0];

  const userRecordsMap = new Map<string, UserWordRecord>([
    [
      'able',
      {
        wordId: 'able',
        word: 'able',
        status: 'mastered',
        tags: [],
        notes: '',
        firstRecordedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
    [
      'ability',
      {
        wordId: 'ability',
        word: 'ability',
        status: 'learning',
        tags: [],
        notes: '',
        firstRecordedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
  ]);

  // Default (overwriteExisting = false): only "unable" (which is unrated & in CET) is selected
  const safeQueueIds = selectFamilyCetWordIdsForQueue(family, wordsMap, userRecordsMap, false);
  assert.deepEqual(safeQueueIds, ['unable']);

  // Explicit opt-in (overwriteExisting = true): all 3 CET members selected
  const overwriteQueueIds = selectFamilyCetWordIdsForQueue(family, wordsMap, userRecordsMap, true);
  assert.deepEqual(overwriteQueueIds.sort(), ['ability', 'able', 'unable']);
});

test('JSON backup merge strictly respects newer updatedAt timestamps for status resets and tag/collection removals', () => {
  const olderRecord: UserWordRecord = {
    wordId: 'abandon',
    word: 'abandon',
    status: 'mastered',
    tags: ['高频', '旧标签'],
    notes: '旧笔记',
    firstRecordedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
    lastStudiedAt: '2026-01-10T00:00:00.000Z',
    studyCount: 4,
  };

  // Newer record where user intentionally reset status to 'unrated' and removed '旧标签'
  const newerResetRecord: UserWordRecord = {
    wordId: 'abandon',
    word: 'abandon',
    status: 'unrated',
    tags: ['高频'],
    notes: '更新后的精简笔记',
    firstRecordedAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    lastStudiedAt: undefined,
    studyCount: 0,
  };

  // Regardless of which is local vs incoming, the newer timestamp must win
  const mergedWhenIncomingNewer = mergeUserWordRecordPair(olderRecord, newerResetRecord);
  assert.equal(mergedWhenIncomingNewer.status, 'unrated');
  assert.deepEqual(mergedWhenIncomingNewer.tags, ['高频']);
  assert.equal(mergedWhenIncomingNewer.notes, '更新后的精简笔记');
  assert.equal(mergedWhenIncomingNewer.firstRecordedAt, '2026-01-01T00:00:00.000Z');

  const mergedWhenExistingNewer = mergeUserWordRecordPair(newerResetRecord, olderRecord);
  assert.equal(mergedWhenExistingNewer.status, 'unrated');
  assert.deepEqual(mergedWhenExistingNewer.tags, ['高频']);
  assert.equal(mergedWhenExistingNewer.notes, '更新后的精简笔记');

  // Collection merge: newer collection removed 'word_b'
  const olderCol: WordCollection = {
    id: 'col_test',
    name: '测试词集',
    description: 'v1',
    type: 'static',
    wordIds: ['word_a', 'word_b'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
  };
  const newerCol: WordCollection = {
    id: 'col_test',
    name: '测试词集',
    description: 'v2',
    type: 'static',
    wordIds: ['word_a'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };
  const mergedCol = mergeWordCollectionPair(olderCol, newerCol);
  assert.deepEqual(mergedCol.wordIds, ['word_a']);
  assert.equal(mergedCol.description, 'v2');
});

test('Custom dataset validator rejects empty, JSON/HTML, or mismatched files without corrupting state', () => {
  // 1. Empty file rejected
  assert.throws(() => validateCustomDatasetContent('cet2016', '   \n  '), /词表文件为空/);

  // 2. JSON or HTML file rejected
  assert.throws(
    () => validateCustomDatasetContent('cet2016', '{"userWords": []}'),
    /HTML 或 JSON|JSON 或 HTML/
  );

  // 3. Uploading BNC_COCA_lists.txt into CET2016 slot rejected
  const sampleBnc = `List \tHeadword \tRelated forms\tTotal frequency\n1k\table\t"able (29930), ability (9113)"\t39043`;
  assert.throws(
    () => validateCustomDatasetContent('cet2016', sampleBnc),
    /BNC\/COCA 词族表格式/
  );

  // 4. Uploading CET2016.txt into BNC_COCA slot rejected
  const sampleCet = `a/an\nable\tability\n★appropriate²\tappropriation`;
  assert.throws(
    () => validateCustomDatasetContent('bnc_coca', sampleCet),
    /未能从文件中解析出任何有效的 BNC\/COCA 词族记录/
  );

  // 5. Valid files pass and return parsed counts
  const validCet = validateCustomDatasetContent('cet2016', sampleCet);
  assert.equal(validCet.entriesCount, 3);
  const validBnc = validateCustomDatasetContent('bnc_coca', sampleBnc);
  assert.equal(validBnc.entriesCount, 1);
});

test('Multiline RFC 4180 CSV export/import round-trips commas, quotes, newlines, phrases, and Chinese notes', () => {
  const sampleCet = `able\tability
owe\towing to
baby boom\tbaby boomer
★appropriate²\tappropriation`;
  const sampleBnc = `List \tHeadword \tRelated forms\tTotal frequency
1k\table\t"able (29930), abilities (1334), ability (9113), unably (0)"\t40377`;
  const bundle = buildLexiconDatabase(sampleCet, sampleBnc);
  const wordsMap = new Map(bundle.words.map((w) => [w.id, w]));

  // Construct an exported 9-column CSV containing multiline notes, quotes, commas, and a phrase with empty BNC_Band
  const header =
    'Word,CET_Levels,BNC_Band,Headword,Form_Frequency,Family_Frequency,Learning_Status,Tags,Notes';
  const multilineNote1 = '第一行：be able to do sth.\n第二行：区分 "ability" 与 "capacity"，常考搭配';
  const multilineNote2 = '多词短语：owing to (由于)\r\n注意后接名词性短语，含逗号,引号"测试"';

  const row1 = [
    escapeCsvField('able'),
    escapeCsvField('CET4'),
    escapeCsvField('1k'),
    escapeCsvField('able'),
    '29930',
    '40377',
    escapeCsvField('mastered'),
    escapeCsvField('高频;核心词'),
    escapeCsvField(multilineNote1),
  ].join(',');

  const row2 = [
    escapeCsvField('owing to'),
    escapeCsvField('CET4'),
    escapeCsvField(''), // Phrase not in BNC -> empty BNC_Band
    escapeCsvField(''),
    '',
    '',
    escapeCsvField('learning'),
    escapeCsvField('真题短语;阅读'),
    escapeCsvField(multilineNote2),
  ].join(',');

  const exportedCsv = `\uFEFF${header}\n${row1}\n${row2}\n`;

  // Verify splitCsvRecords keeps embedded newlines inside quotes intact
  const logicalRecords = splitCsvRecords(exportedCsv);
  assert.equal(logicalRecords.length, 3);

  // Round-trip parse via parseBatchInputText
  const parsed = parseBatchInputText(exportedCsv, wordsMap, bundle.words);
  assert.equal(parsed.length, 2);

  assert.equal(parsed[0].matchedWord?.id, 'able');
  assert.equal(parsed[0].parsedStatus, 'mastered');
  assert.deepEqual(parsed[0].parsedTags, ['高频', '核心词']);
  assert.equal(parsed[0].parsedNote, multilineNote1);

  assert.equal(parsed[1].matchedWord?.id, 'owing to');
  assert.equal(parsed[1].parsedStatus, 'learning');
  assert.deepEqual(parsed[1].parsedTags, ['真题短语', '阅读']);
  assert.equal(parsed[1].parsedNote, multilineNote2.replace(/\r\n/g, '\n'));
});

test('Intra-family share helper strictly distinguishes null, explicit 0%, <1% non-zero, and >=1%', () => {
  // 1. Explicit 0 frequency -> 0% with 0 bar width
  const zeroShare = getIntraFamilyShareDetail(0, 47760);
  assert.equal(zeroShare.label, '0%');
  assert.equal(zeroShare.exactPct, 0);
  assert.equal(zeroShare.isUltraLowNonZero, false);
  assert.equal(formatFamilyRoleAndShare(false, 7, 0, 47760, true, false), '派生 · 占族 0%');

  // 2. Non-zero ultra-low share (105 / 47760 = 0.22%) -> <1% label and isUltraLowNonZero = true
  const ultraLow = getIntraFamilyShareDetail(105, 47760);
  assert.equal(ultraLow.label, '<1%');
  assert.equal(ultraLow.isUltraLowNonZero, true);
  assert.ok(ultraLow.exactPct !== null && ultraLow.exactPct > 0 && ultraLow.exactPct < 1);
  assert.equal(formatFamilyRoleAndShare(false, 7, 105, 47760, true, false), '派生 · 占族 <1%');

  // 3. Null frequency (variant linked) -> '—'
  const nullShare = getIntraFamilyShareDetail(null, 1682);
  assert.equal(nullShare.label, '—');
  assert.equal(nullShare.pct, null);
  assert.equal(nullShare.exactPct, 0);
  assert.equal(formatFamilyRoleAndShare(false, 3, null, 1682, false, true), '关联词族 · 族3词');
});

test('Lexical Workbench 2.0: Full 3-source integration (CET2016 + BNC 25k + COCA 2020) and 12 mandatory linguistic cases', () => {
  const cetPath = path.resolve(process.cwd(), 'public/data/CET2016.txt');
  const bncPath = path.resolve(process.cwd(), 'public/data/BNC_COCA_lists.txt');
  const cocaPath = path.resolve(process.cwd(), 'public/data/coca_freq.json');

  const cetRaw = fs.readFileSync(cetPath, 'utf8');
  const bncRaw = fs.readFileSync(bncPath, 'utf8');
  const cocaRaw = fs.readFileSync(cocaPath, 'utf8');

  const bundle = buildLexiconDatabase(cetRaw, bncRaw, cocaRaw);
  const diag = bundle.diagnostics;

  // 1. Verify COCA 2020 exact baseline metrics
  assert.equal(diag.cocaHeadwordCount, 53951);
  assert.equal(diag.cocaLexemeRecordCount, 60000);
  assert.equal(diag.cocaTotalTokenFrequency, 892945569);
  assert.equal(diag.cocaRankMin, 1);
  assert.equal(diag.cocaRankMax, 60000);
  assert.equal(diag.cocaHasCompleteRankRange, true);
  assert.equal(diag.cocaHyphenatedHeadwordCount, 9811);
  assert.equal(diag.cocaMultiPosHeadwordCount, 5627);
  assert.equal(diag.cocaMultiWordHeadwordCount, 1);
  assert.equal(diag.cocaCapitalizedHeadwordCount, 6);

  // 2. Verify 3-source Venn diagram exact numbers
  assert.ok(diag.venn);
  assert.equal(diag.venn.totalDistinctForms, 94954);
  assert.equal(diag.venn.cetDistinctForms, 8014);
  assert.equal(diag.venn.bncDistinctForms, 76125);
  assert.equal(diag.venn.cocaDistinctHeadwords, 53951);
  assert.equal(diag.venn.cocaTotalLexemes, 60000);
  assert.equal(diag.venn.allThreeCount, 7716);
  assert.equal(diag.venn.bncAndCocaIntersection, 35144);
  assert.equal(diag.venn.cetAndCocaIntersection, 7900);
  assert.equal(diag.venn.cocaOnlyExactCount, 18623);
  assert.equal(diag.venn.cetVariantLinkedToCocaCount, 73);
  assert.equal(diag.venn.cetTrulyMissingFromCocaCount, 41);

  const byId = new Map(bundle.words.map((w) => [w.id, w]));

  // Case 1: "work" — COCA verb (#115, 854,095) and noun (#207, 456,169) stored separately
  const work = byId.get('work')!;
  assert.equal(work.inCoca, true);
  assert.equal(work.cocaPosCount, 2);
  assert.equal(work.cocaHeadwordTotalFreq, 854095 + 456169);
  assert.equal(work.cocaLexemes?.[0].pos, 'verb');
  assert.equal(work.cocaLexemes?.[0].rank, 115);
  assert.equal(work.cocaLexemes?.[0].frequency, 854095);
  assert.equal(work.cocaLexemes?.[1].pos, 'noun');
  assert.equal(work.cocaLexemes?.[1].rank, 207);
  assert.equal(work.cocaLexemes?.[1].frequency, 456169);

  // Case 2: "like" — all 6 PoS records preserved intact
  const like = byId.get('like')!;
  assert.equal(like.inCoca, true);
  assert.equal(like.cocaPosCount, 6);
  assert.deepEqual(
    like.cocaLexemes?.map((l) => l.pos),
    ['preposition', 'verb', 'conjunction', 'adjective', 'adverb', 'noun']
  );

  // Case 3 & 4: "ability" vs "abilities" — BNC form frequency vs COCA noun lemma frequency never mixed or borrowed
  const ability = byId.get('ability')!;
  assert.equal(ability.inBnc, true);
  assert.equal(ability.formFrequency, 9113); // BNC form freq
  assert.equal(ability.inCoca, true);
  assert.equal(ability.cocaHeadwordTotalFreq, 122943); // COCA noun lemma freq
  assert.equal(ability.cocaBestPosRank, 789);

  const abilities = byId.get('abilities')!;
  assert.equal(abilities.inBnc, true);
  assert.equal(abilities.formFrequency, 1334);
  assert.equal(abilities.inCoca, false);
  assert.equal(abilities.cocaHeadwordTotalFreq, null);
  assert.equal(abilities.cocaLexemes?.length, 0);

  // Case 5: "go" vs "went" — no fabricated COCA form frequency on "went"
  const go = byId.get('go')!;
  assert.equal(go.inCoca, true);
  assert.equal(go.cocaBestPosRank, 31);
  const went = byId.get('went')!;
  assert.equal(went.inBnc, true);
  assert.equal(went.inCoca, false);
  assert.equal(went.cocaHeadwordTotalFreq, null);

  // Case 6: "running" — independent COCA adjective (#3262) and noun (#4456) NOT merged into "run"
  const running = byId.get('running')!;
  assert.equal(running.inCoca, true);
  assert.equal(running.cocaPosCount, 2);
  assert.deepEqual(
    running.cocaLexemes?.map((l) => l.pos),
    ['adjective', 'noun']
  );
  const run = byId.get('run')!;
  assert.equal(run.inCoca, true);
  assert.ok(!run.cocaLexemes?.some((l) => l.rank === 3262 || l.rank === 4456));

  // Case 7: "grannies" — retains multiple BNC family memberships
  const grannies = byId.get('grannies')!;
  assert.equal(grannies.bncMemberships?.length, 2);

  // Case 8 & 9: "ably" / "abler" (<1% family share) and explicit 0-frequency BNC forms (not null)
  const ably = byId.get('ably')!;
  assert.equal(ably.formFrequency, 100);
  assert.equal(getIntraFamilyShareDetail(ably.formFrequency, ably.familyFrequency).label, '<1%');
  assert.equal(ably.inCoca, true);
  assert.equal(ably.cocaBestPosRank, 24706);

  const abler = byId.get('abler')!;
  assert.equal(abler.formFrequency, 5);
  assert.equal(getIntraFamilyShareDetail(abler.formFrequency, abler.familyFrequency).label, '<1%');
  assert.equal(abler.inCoca, false);

  const zeroFreqMember = byId.get('adaptabilities')!;
  assert.equal(zeroFreqMember.inBnc, true);
  assert.equal(zeroFreqMember.formFrequency, 0);
  assert.equal(
    getIntraFamilyShareDetail(zeroFreqMember.formFrequency, zeroFreqMember.familyFrequency).label,
    '0%'
  );
  assert.equal(zeroFreqMember.inCoca, false);

  // Case 10: "climate change" — multi-word COCA headword searchable & preserved
  const climateChange = byId.get('climate change')!;
  assert.ok(climateChange);
  assert.equal(climateChange.isPhrase, true);
  assert.equal(climateChange.inCoca, true);
  assert.equal(climateChange.cocaBestPosRank, 29067);
  assert.equal(climateChange.cocaHeadwordTotalFreq, 403);

  // Case 11: "R&D", "n't", "and/or" — special orthography preserved
  const rnd = byId.get('r&d')!;
  assert.ok(rnd);
  assert.equal(rnd.word, 'R&D');
  assert.equal(rnd.inCoca, true);
  assert.equal(rnd.cocaBestPosRank, 24379);

  const nt = byId.get("n't")!;
  assert.ok(nt);
  assert.equal(nt.inCoca, true);
  assert.equal(nt.cocaPrimaryPos, 'negation');
  assert.equal(nt.cocaBestPosRank, 20);

  const andOr = byId.get('and/or')!;
  assert.ok(andOr);
  assert.equal(andOr.inCoca, true);
  assert.equal(andOr.cocaPrimaryPos, 'conjunction');

  // Case 12: "TRUE" and "FALSE" — original capitalization retained in displayVariants
  const trueWord = byId.get('true')!;
  assert.equal(trueWord.hasCapitalVariant, true);
  assert.ok(trueWord.displayVariants.includes('TRUE'));
  const falseWord = byId.get('false')!;
  assert.equal(falseWord.hasCapitalVariant, true);
  assert.ok(falseWord.displayVariants.includes('FALSE'));
});

test('Lexical Workbench 2.0: CorpusObservations, LexicalRelations, Top-5k Dual Modes, Multi-Objective Planner, and PoS Mastery Non-Inference', () => {
  const cetRaw = fs.readFileSync(path.resolve(process.cwd(), 'public/data/CET2016.txt'), 'utf8');
  const bncRaw = fs.readFileSync(
    path.resolve(process.cwd(), 'public/data/BNC_COCA_lists.txt'),
    'utf8'
  );
  const cocaRaw = fs.readFileSync(
    path.resolve(process.cwd(), 'public/data/coca_freq.json'),
    'utf8'
  );

  const bundle = buildLexiconDatabase(cetRaw, bncRaw, cocaRaw);
  const wordsMap = new Map(bundle.words.map((w) => [w.id, w]));
  const familiesMap = new Map(bundle.families.map((f) => [f.id, f]));

  // 1. Verify "COCA Top 5,000" strictly distinguishes 5,000 lemma+PoS records vs 5,000 derived headwords
  const top5kLexemes = bundle.cocaLexemes!.filter((l) => l.rank <= 5000);
  assert.equal(top5kLexemes.length, 5000);

  const top5kHeadwords = filterAndSortWords(
    bundle.words,
    new Map(),
    {
      ...DEFAULT_FILTER_CRITERIA,
      sourceFilter: 'coca_all',
      cocaRankMode: 'derived_headword',
      minCocaRank: 1,
      maxCocaRank: 5000,
    },
    'coca_rank_asc'
  );
  // Competition ranking around 5000 yields ~5000 distinct headwords (far more than the ~4,365 unique headwords inside the top 5,000 lemma+PoS rows!)
  const uniqueHeadwordsInTop5kLexemes = new Set(top5kLexemes.map((l) => l.normalizedHeadword)).size;
  assert.ok(uniqueHeadwordsInTop5kLexemes < 5000);
  assert.ok(top5kHeadwords.length >= 5000 && top5kHeadwords.length <= 5005);

  // 2. Verify PoS-level mastery does NOT automatically infer whole-headword mastery in Analytics
  const userRecords = new Map<string, UserWordRecord>([
    [
      'work',
      {
        wordId: 'work',
        word: 'work',
        status: 'learning', // Overall headword is still "learning"
        posStatuses: {
          noun: 'mastered', // Only noun is mastered; verb is still learning
          verb: 'learning',
        },
        tags: ['高频多词性'],
        notes: 'work 作名词已掌握，动词搭配待巩固',
        firstRecordedAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z',
        studyCount: 2,
      },
    ],
  ]);

  const analytics = computeLexiconAnalytics(
    bundle.words,
    bundle.families,
    bundle.cetEntries,
    userRecords,
    bundle.cocaLexemes
  );

  // Overall headword "work" is in 'learning', NOT 'mastered'
  assert.equal(analytics.cocaHeadwordsMastered, 0);
  assert.equal(analytics.cocaHeadwordsLearningOrQueued, 1);
  // Explicit PoS mastery counts "work (noun)" (freq 456,169) as mastered, NOT "work (verb)" (freq 854,095)
  assert.equal(analytics.cocaLexemesExplicitMastered, 1);
  assert.equal(analytics.cocaExplicitMasteredFreq, 456169);

  // 3. Verify undo of pos_status_change restores posStatuses without corrupting overall headword status
  const posLog: ActivityLogEntry = {
    id: 501,
    timestamp: '2026-03-02T00:00:00.000Z',
    wordId: 'work',
    word: 'work',
    targetPos: 'noun',
    actionType: 'pos_status_change',
    previousStatus: 'unrated',
    newStatus: 'mastered',
    previousStudyCount: 1,
    newStudyCount: 2,
    existedBefore: true,
  };
  const undoneWork = applyLogUndoToRecord(
    userRecords.get('work')!,
    posLog,
    '2026-03-03T00:00:00.000Z'
  );
  assert.ok(undoneWork);
  assert.equal(undoneWork.status, 'learning');
  assert.equal(undoneWork.posStatuses?.noun, undefined);
  assert.equal(undoneWork.posStatuses?.verb, 'learning');
  assert.equal(undoneWork.studyCount, 1);

  // 4. Verify Multi-Objective Study Planner returns explainable dimensions and Pareto frontier flags
  const candidates = computeMultiObjectiveStudyCandidates(
    bundle.words,
    familiesMap,
    userRecords,
    {
      strategy: 'custom_multi_objective',
      customWeights: { cocaWeight: 40, bncWeight: 25, cetWeight: 25, gapWeight: 10 },
      maxCandidatesPool: 50,
    }
  );
  assert.equal(candidates.length, 50);
  assert.ok(candidates.some((c) => c.isParetoOptimal));
  assert.ok(candidates[0].explainableReasons.length > 0);
  assert.ok(candidates[0].dimensions.cocaValue >= 0 && candidates[0].dimensions.cocaValue <= 100);
});



