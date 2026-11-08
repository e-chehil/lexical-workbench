/**
 * Three-source engine tests (real CET2016 + BNC/COCA 25k + COCA 2020 data):
 * alignment numbers, observation semantics, query protocol and learning model.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullIndex } from '../node/loadSources.ts';
import { computeAlignmentReport } from '../engine/alignment.ts';
import { compareRefSets, projectRefs, runQuery, QueryError } from '../engine/query.ts';
import { parseBncFamilies } from '../sources/bncAdapter.ts';
import { refs } from '../domain/ids.ts';
import {
  InMemoryLearningState,
  applyStatusChange,
  computeBncMemberWeightedCoverage,
  computeCocaWeightedCoverage,
  defaultTargetFor,
  posBreakdown,
  resolveEffectiveStatus,
  targetEntityRef,
  type LearningRecord,
} from '../learning/model.ts';

const index = loadFullIndex();
const NOW = '2026-11-08T00:00:00.000Z';
const rec = (target: LearningRecord['target'], status: LearningRecord['status']): LearningRecord => ({
  target,
  status,
  tags: [],
  note: '',
  studyCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
  lastStudiedAt: null,
});

test('exact three-source alignment on the Form unit (full data, no sampling)', () => {
  const a = computeAlignmentReport(index);
  assert.equal(a.formCount, 94954);
  assert.deepEqual(a.sourceFormCounts, { coca2020: 53951, bnc25k: 76125, cet2016: 8014 });
  assert.deepEqual(a.venn, {
    coca_bnc_cet: 7716,
    coca_bnc: 27428,
    coca_cet: 184,
    bnc_cet: 92,
    coca_only: 18623,
    bnc_only: 40889,
    cet_only: 22,
  });
  assert.deepEqual(a.pairwise, { coca_bnc: 35144, coca_cet: 7900, bnc_cet: 7808 });
  assert.equal(a.coca.headwordsMatchingBncFamilyHeadword, 18774);
  assert.equal(a.coca.headwordsMatchingBncNonHeadMemberOnly, 16370);
  assert.equal(a.coca.headwordsWithoutBncForm, 18807);
  assert.equal(a.bnc.familyHeadwordsNotInCoca, 6228);
  assert.deepEqual(a.bnc.multiFamilyForms, [{ form: 'grannies', families: ['grandfather', 'granny'], freqs: [17, 45] }]);
  assert.ok(a.caseFoldedMatches.some((m) => m.form === 'true' && m.printed.includes('TRUE')));
});

test('exact BNC match vs COCA-only headwords', () => {
  assert.deepEqual([...index.sourcesOfForm(refs.form('work'))].sort(), ['bnc25k', 'cet2016', 'coca2020']);
  for (const w of ['R&D', "n't", 'climate change']) {
    assert.deepEqual([...index.sourcesOfForm(refs.form(w))], ['coca2020'], w);
  }
  // abilities / went are BNC member forms with no COCA lemma record of their own
  for (const w of ['abilities', 'went']) assert.deepEqual([...index.sourcesOfForm(refs.form(w))], ['bnc25k'], w);
});

test('observation semantics: memberships, no family-total leakage, no lemma borrowing', () => {
  const g1 = refs.bncMember('grandfather', 'grannies');
  const g2 = refs.bncMember('granny', 'grannies');
  assert.equal(index.getObservation('bnc25k.member_freq', g1), 17);
  assert.equal(index.getObservation('bnc25k.member_freq', g2), 45);
  assert.equal(index.metricValue(refs.form('grannies'), 'bnc25k.member_freq'), 45); // lift rule: max
  assert.equal(index.metricValue(refs.form('grannies'), 'bnc25k.family_band'), 1); // lift rule: min
  assert.equal(index.metricValue(refs.form('work'), 'bnc25k.family_total'), null, 'family total never lifted to a form');
  assert.equal(index.metricValue(refs.form('went'), 'coca2020.hw_freq_sum'), null, 'went does not borrow go');
  assert.equal(index.metricValue(refs.bncMember('go', 'went'), 'coca2020.hw_freq_sum'), null);
  assert.equal(index.getObservation('bnc25k.member_freq', refs.bncMember('go', 'went')), 45876);
  assert.equal(index.metricValue(refs.form('go'), 'coca2020.hw_freq_sum'), 3546732);
  assert.equal(index.metricValue(refs.cocaLemmaPos('TRUE', 'adjective'), 'bnc25k.family_band'), 1);
});

test('BNC adapter never fabricates a member when the family headword is absent', () => {
  const snap = parseBncFamilies('List \tHeadword \tRelated forms\tTotal frequency\n9k\tzork\t"zorks (7), zorked (3)"\t10\n');
  const fam = snap.families[0];
  assert.equal(fam.headwordIsMember, false);
  assert.deepEqual(snap.members.map((m) => [m.form, m.frequency]), [
    ['zorks', 7],
    ['zorked', 3],
  ]);
  assert.ok(snap.diagnostics.some((d) => d.code === 'bnc.headword_not_member'));
  // Real data: every headword is printed in its own member list.
  assert.equal([...index.bncFamilies.values()].filter((f) => !f.headwordIsMember).length, 0);
});

test('query protocol: COCA Top-N records vs distinct headwords vs derived headword rank', () => {
  const ctx = { index };
  const top1000 = runQuery(ctx, {
    kind: 'coca_lemma_pos',
    filters: [{ type: 'metric_range', metric: 'coca2020.lp_rank', max: 1000 }],
    sort: [{ by: 'metric', metric: 'coca2020.lp_rank', dir: 'asc' }],
    aggregates: [{ metric: 'coca2020.lp_freq', op: 'sum' }],
  });
  assert.equal(top1000.total, 1000);
  assert.equal(top1000.refs[0], 'coca2020:lp:the|article');
  assert.equal(top1000.aggregates[0].value, 695117371);
  assert.equal(projectRefs(index, top1000.refs, 'coca_headword').length, 898);

  const hw = runQuery(ctx, {
    kind: 'coca_headword',
    sort: [{ by: 'metric', metric: 'coca2020.hw_rank', dir: 'asc' }],
    page: { offset: 0, limit: 3 },
  });
  assert.equal(hw.total, 53951);
  // Derived headword rank ≠ official record rank: "to" (+infinitive 16,770,155 + preposition
  // 9,232,572 = 26,002,727) overtakes "and" (conjunction rank 3 + noun 220 = 24,778,318).
  assert.deepEqual(hw.refs, ['coca2020:hw:the', 'coca2020:hw:be', 'coca2020:hw:to']);
  assert.equal(index.getObservation('coca2020.lp_rank', 'coca2020:lp:and|conjunction'), 3);
  assert.equal(index.getObservation('coca2020.hw_rank', 'coca2020:hw:and'), 4);

  // Summing a lifted metric would double count (6 like-records × headword sum) → rejected.
  assert.throws(
    () => runQuery(ctx, { kind: 'coca_lemma_pos', aggregates: [{ metric: 'coca2020.hw_freq_sum', op: 'sum' }] }),
    (e: unknown) => e instanceof QueryError && e.code === 'aggregate_requires_native_metric'
  );
});

test('query protocol: source filters, text search, projections and set comparison', () => {
  const ctx = { index };
  const cocaNoBnc = runQuery(ctx, {
    kind: 'form',
    filters: [
      { type: 'source_presence', source: 'coca2020', present: true },
      { type: 'source_presence', source: 'bnc25k', present: false },
    ],
  });
  assert.equal(cocaNoBnc.total, 18623 + 184);

  const exact = runQuery(ctx, { kind: 'form', text: { q: 'TRUE', mode: 'exact' } });
  assert.deepEqual(exact.refs, ['f:true']);
  const diacritic = runQuery(ctx, { kind: 'form', text: { q: 'cafe', mode: 'exact' } });
  assert.deepEqual(diacritic.refs.sort(), ['f:cafe', 'f:café']);

  const cet6Multi = runQuery(ctx, {
    kind: 'form',
    filters: [
      { type: 'cet_level', levels: ['CET6'] },
      { type: 'multi_pos', value: true },
    ],
    sort: [{ by: 'metric', metric: 'coca2020.hw_rank', dir: 'asc' }],
  });
  assert.ok(cet6Multi.total > 0);
  const ranks = cet6Multi.refs.map((r) => index.metricValue(r, 'coca2020.hw_rank')!);
  for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i] >= ranks[i - 1]);

  // BNC family "go" → member forms → COCA headwords: only spellings that are COCA lemmas
  const goHeadwords = projectRefs(index, [refs.bncFamily('go')], 'coca_headword').sort();
  assert.ok(goHeadwords.includes('coca2020:hw:go'));
  assert.ok(!goHeadwords.some((r) => r.endsWith(':went')));
  const goForms = runQuery(ctx, {
    kind: 'form',
    filters: [
      { type: 'in_refs', refs: [refs.bncFamily('go')] },
      { type: 'source_presence', source: 'coca2020', present: false },
    ],
  });
  assert.ok(goForms.refs.includes('f:went'));
  assert.equal(goForms.total, 13 - goHeadwords.length);

  // CET entries vs COCA top-5000 records, compared on ONE unit (form)
  const top5000 = runQuery(ctx, { kind: 'coca_lemma_pos', filters: [{ type: 'metric_range', metric: 'coca2020.lp_rank', max: 5000 }] });
  const cmp = compareRefSets(index, index.listRefs('cet_entry'), top5000.refs, 'form');
  assert.equal(cmp.kind, 'form');
  assert.equal(cmp.both.length + cmp.onlyA.length, 8014);
  assert.equal(cmp.both.length + cmp.onlyB.length, 4333);
});

test('learning model: headword-level default, PoS refinement, form-level and family progress', () => {
  const state = new InMemoryLearningState();
  // "work" whole word learning; work-noun mastered; work-verb has no own record
  state.put(rec(refs.formTarget('work'), 'learning'));
  state.put(rec(refs.lemmaPosTarget('work', 'noun'), 'mastered'));
  // "worked" managed separately as a specific form
  state.put(rec(refs.formTarget('worked'), 'mastered'));

  assert.equal(defaultTargetFor(index, refs.cocaHeadword('work')), 'f:work');
  assert.equal(defaultTargetFor(index, refs.cocaLemmaPos('work', 'verb')), 'lp:work|verb');
  assert.equal(defaultTargetFor(index, refs.cocaLemmaPos('TRUE', 'adjective')), 'lp:true|adjective');
  assert.equal(defaultTargetFor(index, refs.bncMember('work', 'worked')), 'f:worked');
  assert.equal(defaultTargetFor(index, refs.bncFamily('work')), null);

  const pos = posBreakdown(index, state, refs.form('work'));
  assert.deepEqual(
    pos.map((p) => [p.pos, p.effective.status, p.effective.origin]),
    [
      ['verb', 'learning', 'inherited'],
      ['noun', 'mastered', 'own'],
    ]
  );
  assert.equal(resolveEffectiveStatus(state, refs.lemmaPosTarget('running', 'noun')).origin, 'default');
  assert.equal(targetEntityRef(index, 'lp:true|adjective'), 'coca2020:lp:TRUE|adjective');
  assert.equal(targetEntityRef(index, 'lp:running|verb'), null);
  assert.equal(targetEntityRef(index, 'f:went'), 'f:went');

  const cov = computeCocaWeightedCoverage(index, state, { maxRank: 1000 });
  assert.equal(cov.numerator, 456169, 'only work-noun is mastered among top-1000 records');
  assert.equal(cov.denominator, 695117371);

  const fam = computeBncMemberWeightedCoverage(index, state, { familyRef: refs.bncFamily('work') });
  assert.equal(fam.unitsInScope, 15);
  assert.equal(fam.unitsCounted, 1);
  assert.equal(fam.numerator, 12474);
  assert.equal(fam.denominator, 168597);

  const { record, event } = applyStatusChange(state.get('f:work'), 'f:work', 'mastered', NOW, 'b1');
  assert.equal(record.status, 'mastered');
  assert.deepEqual(event.before, { status: 'learning' });
  state.put(record);
  assert.equal(computeCocaWeightedCoverage(index, state, { maxRank: 1000 }).numerator, 456169 + 854095);

  const masteredForms = runQuery(
    { index, learning: state },
    { kind: 'form', filters: [{ type: 'learning_status', statuses: ['mastered'], resolution: 'own' }] }
  );
  assert.deepEqual(masteredForms.refs.sort(), ['f:work', 'f:worked']);
});
