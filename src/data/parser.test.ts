import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildLexiconDatabase,
  expandCetMemberToken,
  parseBncCoca,
  parseCet2016,
} from './parser.ts';
import {
  buildDictionaryUrl,
  computeLexiconAnalytics,
  computeStudyPriorityScore,
  DEFAULT_FILTER_CRITERIA,
  escapeCsvField,
  filterAndSortWords,
  parseBatchInputText,
  parseCsvLine,
  searchLexicon,
} from './searchAndFilter.ts';
import { UserWordRecord } from './types.ts';

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
