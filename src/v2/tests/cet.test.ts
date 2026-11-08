/**
 * CET 2016 expansion tests migrated from the legacy parser test (T14). The syllabus notation is
 * data, not a suggestion: every expansion rule keeps both printed forms and records why.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { expandCetMemberToken, parseCet2016 } from '../sources/cetExpansion.ts';
import { parseCetSyllabus } from '../sources/cetAdapter.ts';
import { readDataFile, DATA_FILES } from '../node/loadSources.ts';

test('CET2016 token expansion handles slash, parenthesis, homograph and phrase notation', () => {
  assert.deepEqual(expandCetMemberToken('a/an').expandedForms, ['a', 'an']);
  assert.equal(expandCetMemberToken('a/an').expansionRule, 'slash_parallel');
  assert.equal(expandCetMemberToken('a/an').isCet6Star, false);

  const jewel = expandCetMemberToken('jewel(l)ery');
  assert.deepEqual(jewel.expandedForms, ['jewelery', 'jewellery']);
  assert.equal(jewel.expansionRule, 'paren_optional');

  const advisor = expandCetMemberToken('advisor/-er');
  assert.deepEqual(advisor.expandedForms, ['advisor', 'adviser']);
  assert.equal(advisor.expansionRule, 'slash_suffix');

  const approp = expandCetMemberToken('★appropriate²');
  assert.equal(approp.isCet6Star, true);
  assert.equal(approp.homographNumber, 2);
  assert.deepEqual(approp.expandedForms, ['appropriate']);

  assert.deepEqual(expandCetMemberToken('owing to').expandedForms, ['owing to']);
  assert.equal(expandCetMemberToken('owing to').expansionRule, 'phrase');

  const celsius = expandCetMemberToken('Celsius/-cius');
  assert.equal(celsius.isAmbiguous, true);
  assert.deepEqual(celsius.expandedForms, ['Celsius', 'Celcius']);

  const sober = expandCetMemberToken('★sober/-re');
  assert.equal(sober.isCet6Star, true);
  assert.deepEqual(sober.expandedForms, ['sober', 'sobre']);
});

test('CET2016 parser strips BOM, keeps Tab relationships and homograph levels', () => {
  const sample = `\uFEFFa/an\nable\tability\naccount\taccounting\taccountant\taccountancy\n★abbreviation\nappropriate¹\n★appropriate²\tappropriation\nowe\towing to\nbaby boom\tbaby boomer\n★appal(l)\tappalling\nadvise\tadvisor/-er\tadvisory\tadvisable\nCelsius/-cius`;
  const { entries, diagnostics } = parseCet2016(sample);
  assert.equal(entries.length, 11);
  assert.equal(entries[0].headwordRaw, 'a/an');
  assert.deepEqual(entries[0].members[0].expandedForms, ['a', 'an']);
  assert.equal(entries[2].members.length, 4);
  assert.equal(entries[2].members[3].rawText, 'accountancy');
  assert.equal(entries[4].level, 'CET4');
  assert.equal(entries[4].members[0].homographNumber, 1);
  assert.equal(entries[5].level, 'CET6');
  assert.equal(entries[5].members[0].homographNumber, 2);
  assert.equal(entries[6].members[1].expandedForms[0], 'owing to');
  assert.equal(entries[7].members[0].expandedForms[0], 'baby boom');
  assert.ok(diagnostics.some((d) => d.category === 'ambiguous_spelling' && d.rawText === 'Celsius/-cius'));
});

test('CET2016 real file still produces the audited entry count', () => {
  const snapshot = parseCetSyllabus(readDataFile(DATA_FILES.cet2016));
  assert.equal(snapshot.entries.length, 5377);
  assert.ok(snapshot.entries.every((entry) => entry.links.length > 0));
});
