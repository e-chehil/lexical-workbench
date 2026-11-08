/**
 * COCA 2020 vertical-slice tests — run against the REAL public/data/coca_freq.json.
 * Synthetic payloads are used only to exercise validation paths, never to assert frequencies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCocaData, parseCocaJson } from '../sources/cocaAdapter.ts';
import { buildLexicalIndex } from '../engine/lexicalIndex.ts';
import { cocaRecordsForSpelling } from '../engine/query.ts';
import { METRICS } from '../domain/metrics.ts';
import { refs } from '../domain/ids.ts';
import { SourceFormatError } from '../domain/types.ts';
import { DATA_FILES, readDataFile } from '../node/loadSources.ts';

const coca = parseCocaJson(readDataFile(DATA_FILES.coca2020));
const index = buildLexicalIndex({ coca });

test('COCA full file: structure, counts and rank integrity', () => {
  const s = coca.stats;
  assert.equal(s.headwordCount, 53951);
  assert.equal(s.recordCount, 60000);
  assert.equal(s.rankMin, 1);
  assert.equal(s.rankMax, 60000);
  assert.equal(s.freqSum, 892945569);
  assert.equal(s.multiPosHeadwordCount, 5627);
  assert.equal(s.specialSpellings.hyphen.length, 9811);
  assert.deepEqual(s.posCountDistribution, { 1: 48324, 2: 5272, 3: 299, 4: 46, 5: 9, 6: 1 });
  assert.equal(Object.keys(s.posRecordCounts).length, 14);
  assert.equal(s.posRecordCounts['negation'], 2);
  assert.equal(s.posRecordCounts['+infinitive'], 3);
  assert.equal(s.posRecordCounts['existential'], 1);
  assert.equal(coca.diagnostics.filter((d) => d.severity !== 'info').length, 0, 'no errors/warnings on real data');
  coca.records.forEach((r, i) => assert.equal(r.rank, i + 1));
  for (let i = 1; i < coca.records.length; i++) assert.ok(coca.records[i].freq <= coca.records[i - 1].freq);
  assert.deepEqual([...s.specialSpellings.uppercase].sort(), ['B&B', 'FALSE', 'R&D', 'TRUE', 'neo-Colonial', 'non-Intervention']);
});

test('work: two official PoS records, derived headword sum and rank', () => {
  const recs = cocaRecordsForSpelling(index, 'work');
  assert.deepEqual(
    recs.map((r) => [r.pos, r.rank, r.freq]),
    [
      ['verb', 115, 854095],
      ['noun', 207, 456169],
    ]
  );
  const hw = refs.cocaHeadword('work');
  assert.equal(index.getObservation('coca2020.hw_freq_sum', hw), 854095 + 456169);
  assert.equal(index.getObservation('coca2020.hw_best_lp_rank', hw), 115);
  assert.equal(index.getObservation('coca2020.hw_rank', hw), 85);
  assert.equal(index.getObservation('coca2020.lp_rank', refs.cocaLemmaPos('work', 'noun')), 207);
});

test('like: six PoS records in official rank order with derived shares', () => {
  const recs = cocaRecordsForSpelling(index, 'like');
  assert.deepEqual(
    recs.map((r) => r.pos),
    ['preposition', 'verb', 'conjunction', 'adjective', 'adverb', 'noun']
  );
  const sum = recs.reduce((s, r) => s + r.freq, 0);
  assert.equal(sum, 2473642);
  assert.equal(index.getObservation('coca2020.hw_freq_sum', refs.cocaHeadword('like')), sum);
  assert.equal(index.getObservation('coca2020.hw_rank', refs.cocaHeadword('like')), 48);
  const share = index.getObservation('coca2020.lp_share_of_headword', refs.cocaLemmaPos('like', 'preposition'))!;
  assert.ok(Math.abs(share - 1583444 / 2473642) < 1e-12);
});

test('running keeps its source PoS semantics (adjective + noun, no verb)', () => {
  const recs = cocaRecordsForSpelling(index, 'running');
  assert.deepEqual(
    recs.map((r) => [r.pos, r.rank, r.freq]),
    [
      ['adjective', 3262, 23050],
      ['noun', 4456, 14396],
    ]
  );
  assert.equal(index.cocaRecords.has(refs.cocaLemmaPos('running', 'verb')), false);
});

test('go lemma frequency is never lent to went; abilities has no COCA record', () => {
  assert.equal(cocaRecordsForSpelling(index, 'go')[0].freq, 3546732);
  assert.deepEqual(cocaRecordsForSpelling(index, 'went'), []);
  assert.equal(index.getForm('went'), undefined, 'COCA-only index has no form for went');
  assert.deepEqual(cocaRecordsForSpelling(index, 'abilities'), []);
  assert.equal(cocaRecordsForSpelling(index, 'ability')[0].freq, 122943);
});

test('special spellings are preserved verbatim; matching uses the case-folded Form key', () => {
  const t = cocaRecordsForSpelling(index, 'true');
  assert.equal(t.length, 1);
  assert.equal(t[0].headword, 'TRUE');
  assert.equal(t[0].ref, 'coca2020:lp:TRUE|adjective');
  assert.equal(t[0].formRef, 'f:true');
  assert.equal(cocaRecordsForSpelling(index, 'FALSE')[0].rank, 2107);
  assert.deepEqual(cocaRecordsForSpelling(index, 'R&D').map((r) => [r.pos, r.freq]), [['noun', 623]]);
  assert.deepEqual(cocaRecordsForSpelling(index, "n't").map((r) => [r.pos, r.rank]), [['negation', 20]]);
  assert.deepEqual(cocaRecordsForSpelling(index, 'climate change').map((r) => r.pos), ['noun']);
});

test('derived headword rank is a unique, reproducible ordinal (sum desc, best official rank asc)', () => {
  const rows = coca.headwords.map((h) => ({
    rank: index.getObservation('coca2020.hw_rank', h.ref)!,
    sum: index.getObservation('coca2020.hw_freq_sum', h.ref)!,
    best: index.getObservation('coca2020.hw_best_lp_rank', h.ref)!,
  }));
  rows.sort((a, b) => a.rank - b.rank);
  rows.forEach((r, i) => assert.equal(r.rank, i + 1));
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    assert.ok(a.sum > b.sum || (a.sum === b.sum && a.best < b.best));
  }
  // Headword #1 by derived rank is "the"; distinct headwords among top-1000 official records:
  assert.equal(coca.headwords.find((h) => index.getObservation('coca2020.hw_rank', h.ref) === 1)!.headword, 'the');
  assert.equal(new Set(coca.records.slice(0, 1000).map((r) => r.headwordRef)).size, 898);
});

test('adapter validation: malformed payloads produce diagnostics, not silent data', () => {
  assert.throws(() => parseCocaData({}), SourceFormatError);
  assert.throws(() => parseCocaJson('   '), SourceFormatError);
  const snap = parseCocaData([
    { headword: 'alpha', content: [{ PoS: 'noun', Rank: '1', Freq: '100' }] },
    { headword: 'alpha', content: [{ PoS: 'verb', Rank: '2', Freq: '90' }] },
    { headword: 'beta', content: [{ PoS: 'noun', Rank: 'x', Freq: '80' }] },
    { headword: 'gamma', content: [{ PoS: 'gerund', Rank: '3', Freq: '70' }] },
    { headword: 'delta', content: [{ PoS: 'noun', Rank: '1', Freq: '60' }] },
    { headword: 'Alpha', content: [{ PoS: 'noun', Rank: '4', Freq: '50' }] },
  ]);
  const codes = snap.diagnostics.map((d) => d.code).sort();
  for (const c of ['coca.duplicate_headword', 'coca.invalid_number', 'coca.unknown_pos', 'coca.duplicate_rank', 'coca.case_collision']) {
    assert.ok(codes.includes(c), `expected ${c}`);
  }
  assert.deepEqual(snap.records.map((r) => r.headword), ['alpha', 'Alpha']);
});

test('metric registry: derived metrics are labelled as computed, official ones are not', () => {
  for (const m of Object.values(METRICS)) {
    if (m.provenance === 'derived') assert.match(m.label, /（计算）$/, m.id);
    else assert.doesNotMatch(m.label, /计算/, m.id);
  }
});
