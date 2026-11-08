/**
 * Engine DTO builder tests (real COCA 2020 + BNC/COCA 25k + CET 2016 data).
 *
 * The assertions pin the value semantics that make the DTOs safe for the UI:
 * a number is attached to the unit the source attaches it to, missing values stay null,
 * and learning status distinguishes an own record from an inherited Form record.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullIndex } from '../node/loadSources.ts';
import { refs } from '../domain/ids.ts';
import { METRICS, type MetricId } from '../domain/metrics.ts';
import { buildFamilyDetail, buildFormDetail, buildRows, metricCell, rowBadges } from '../engine/dto.ts';
import { QueryError, type QueryContext } from '../engine/query.ts';
import { InMemoryLearningState, type LearningRecord } from '../learning/model.ts';

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

const valueOf = (cells: { metric: MetricId; value: number | null }[], metric: MetricId) =>
  cells.find((c) => c.metric === metric)?.value;

test('form detail: work assembles COCA headword, records, one BNC card and the CET entry', () => {
  const ctx: QueryContext = { index };
  const detail = buildFormDetail(ctx, refs.form('work'));
  assert.ok(detail);
  assert.equal(detail.formRef, 'f:work');
  assert.equal(detail.key, 'work');
  assert.deepEqual(detail.surfaces, [
    { source: 'coca2020', surface: 'work' },
    { source: 'bnc25k', surface: 'work' },
    { source: 'cet2016', surface: 'work' },
  ]);

  // COCA: one headword, two PoS records ordered by official rank (verb 115 < noun 207).
  assert.ok(detail.coca);
  assert.equal(detail.coca.headwordRef, 'coca2020:hw:work');
  assert.deepEqual(
    detail.coca.records.map((r) => [r.pos, r.ref]),
    [
      ['verb', 'coca2020:lp:work|verb'],
      ['noun', 'coca2020:lp:work|noun'],
    ]
  );
  const verb = detail.coca.records[0];
  assert.equal(valueOf(verb.metrics, 'coca2020.lp_rank'), 115);
  assert.equal(valueOf(verb.metrics, 'coca2020.lp_freq'), 854095);
  assert.ok(Math.abs(valueOf(verb.metrics, 'coca2020.lp_share_of_headword')! - 854095 / 1310264) < 1e-12);
  assert.deepEqual(
    detail.coca.hwMetrics.map((c) => [c.metric, c.value]),
    [
      ['coca2020.hw_freq_sum', 1310264],
      ['coca2020.hw_rank', 85],
      ['coca2020.hw_best_lp_rank', 115],
      ['coca2020.hw_pos_count', 2],
    ]
  );
  // No learning state synchronised → every status is the default, never "mastered".
  assert.deepEqual(verb.status, { status: 'unrated', origin: 'default', from: null });
  assert.deepEqual(detail.status, { status: 'unrated', origin: 'default', from: null });

  // BNC: one membership card in family "work", family numbers read from the family.
  assert.equal(detail.bnc.length, 1);
  const card = detail.bnc[0];
  assert.equal(card.memberRef, 'bnc25k:mem:work|work');
  assert.equal(card.familyRef, 'bnc25k:fam:work');
  assert.equal(card.familyHeadword, 'work');
  assert.equal(valueOf(card.metrics, 'bnc25k.member_freq'), 90756);
  assert.equal(valueOf(card.metrics, 'bnc25k.family_total'), 168597);
  assert.equal(valueOf(card.metrics, 'bnc25k.family_band'), 1);
  assert.ok(Math.abs(valueOf(card.metrics, 'bnc25k.member_share_of_family')! - 90756 / 168597) < 1e-12);
  assert.equal(detail.bncFamilyHeaded, 'bnc25k:fam:work');

  // CET: one entry, role/level straight from the syllabus line.
  assert.deepEqual(detail.cet, [
    { entryRef: 'cet2016:ent:work', display: 'work', role: 'headword', level: 'CET4', homographNumber: null },
  ]);

  // Relations come from the index, never invented here.
  assert.ok(detail.relations.length > 0);
  assert.ok(detail.relations.every((r) => r.from === 'f:work' || r.to === 'f:work'));
});

test('form detail: went has no COCA section and its BNC card stays inside family go', () => {
  const detail = buildFormDetail({ index }, refs.form('went'));
  assert.ok(detail);
  assert.equal(detail.coca, null, 'went is not a COCA headword: no lemma record is borrowed from go');
  assert.equal(detail.bncFamilyHeaded, null);
  assert.equal(detail.cet.length, 0);
  assert.equal(detail.bnc.length, 1);

  const card = detail.bnc[0];
  assert.equal(card.memberRef, 'bnc25k:mem:go|went');
  assert.equal(card.familyRef, 'bnc25k:fam:go');
  assert.equal(card.familyHeadword, 'go');
  assert.equal(valueOf(card.metrics, 'bnc25k.member_freq'), 45876);
  // Family figures belong to the family line, not to the member spelling.
  assert.equal(valueOf(card.metrics, 'bnc25k.family_total'), 244339);
  assert.ok(rowBadges(index, refs.form('went')).includes('not_in_coca'));
});

test('form detail: grannies keeps two membership cards and the multi_family badge', () => {
  const detail = buildFormDetail({ index }, refs.form('grannies'));
  assert.ok(detail);
  assert.equal(detail.coca, null);
  assert.deepEqual(
    detail.bnc.map((c) => [c.memberRef, c.familyHeadword, valueOf(c.metrics, 'bnc25k.member_freq')]),
    [
      ['bnc25k:mem:grandfather|grannies', 'grandfather', 17],
      ['bnc25k:mem:granny|grannies', 'granny', 45],
    ]
  );
  // Each card keeps its own family denominator.
  assert.equal(valueOf(detail.bnc[0].metrics, 'bnc25k.family_total'), index.getObservation('bnc25k.family_total', 'bnc25k:fam:grandfather'));
  assert.equal(valueOf(detail.bnc[1].metrics, 'bnc25k.family_total'), index.getObservation('bnc25k.family_total', 'bnc25k:fam:granny'));

  const badges = rowBadges(index, refs.form('grannies'));
  assert.ok(badges.includes('multi_family'));
  assert.ok(!badges.includes('multi_pos'));
  assert.ok(badges.includes('not_in_coca'));
});

test('form detail: family totals are only present where the source attaches them', () => {
  const detail = buildFormDetail({ index }, refs.form('work'));
  assert.ok(detail);
  const card = detail.bnc[0];

  // The membership and the form have no family total of their own…
  assert.equal(metricCell(index, card.memberRef, 'bnc25k.family_total').value, null);
  assert.equal(metricCell(index, refs.form('work'), 'bnc25k.family_total').value, null);
  // …while the family ref does, and that is the value the card shows.
  assert.equal(metricCell(index, card.familyRef, 'bnc25k.family_total').value, 168597);

  // A bnc_member row can therefore never display a family total as its own frequency.
  const rows = buildRows(
    { index },
    {
      query: {
        kind: 'bnc_member',
        filters: [{ type: 'in_refs', refs: [refs.bncFamily('work')] }],
        page: { offset: 0, limit: 15 },
      },
      columns: ['bnc25k.member_freq', 'bnc25k.family_total'],
    }
  );
  assert.equal(rows.rows.length, 15);
  for (const row of rows.rows) {
    assert.equal(valueOf(row.metrics, 'bnc25k.family_total'), null);
    assert.notEqual(valueOf(row.metrics, 'bnc25k.member_freq'), null);
  }
});

test('family detail: work lists 15 members in source order with family-level progress', () => {
  const detail = buildFamilyDetail({ index }, refs.bncFamily('work'));
  assert.ok(detail);
  assert.equal(detail.headword, 'work');
  assert.equal(detail.band, 1);
  assert.equal(detail.totalFrequency, 168597);
  assert.equal(detail.members.length, 15);

  // Source order is preserved and each member keeps its own printed frequency.
  assert.deepEqual(
    detail.members.slice(0, 4).map((m) => [m.form, m.memberFreq]),
    [
      ['work', 90756],
      ['rework', 34],
      ['reworked', 74],
      ['reworking', 89],
    ]
  );
  const worked = detail.members.find((m) => m.form === 'worked')!;
  assert.equal(worked.memberFreq, 12474);
  assert.ok(Math.abs(worked.share! - 12474 / 168597) < 1e-12);
  assert.equal(worked.cocaHeadwordRef, 'coca2020:hw:worked');
  assert.deepEqual(worked.otherFamilies, []);
  assert.deepEqual(worked.cetLevels, []);
  assert.deepEqual(worked.status, { status: 'unrated', origin: 'default', from: null });

  assert.equal(detail.progress.formsTotal, 15);
  assert.equal(detail.progress.formsMastered, 0);
  assert.equal(detail.progress.weighted.definition, 'coverage.bnc_member_weighted');
  assert.equal(detail.progress.weighted.unitsInScope, 15);
  assert.equal(detail.progress.weighted.denominator, 168597);

  // The headword of the family carries its CET level through its Form, not through the family.
  assert.deepEqual(detail.members[0].cetLevels, ['CET4']);
});

test('family detail: progress counts Form status only, so a mastered PoS is not a mastered form', () => {
  const state = new InMemoryLearningState([
    rec(refs.lemmaPosTarget('work', 'noun'), 'mastered'),
    rec(refs.formTarget('worked'), 'mastered'),
  ]);
  const detail = buildFamilyDetail({ index, learning: state }, refs.bncFamily('work'));
  assert.ok(detail);

  const work = detail.members.find((m) => m.form === 'work')!;
  assert.deepEqual(work.status, { status: 'unrated', origin: 'default', from: null });

  assert.equal(detail.progress.formsMastered, 1, 'only "worked" is a mastered Form');
  assert.equal(detail.progress.formsTotal, 15);
  // Weighted coverage uses the Form target of each membership, so the noun record does not count.
  assert.equal(detail.progress.weighted.numerator, 12474);
  assert.equal(detail.progress.weighted.unitsCounted, 1);
});

test('form detail: PoS rows report inherited Form status with origin, own records keep origin own', () => {
  const state = new InMemoryLearningState([
    rec(refs.formTarget('work'), 'learning'),
    rec(refs.lemmaPosTarget('work', 'noun'), 'mastered'),
  ]);
  const detail = buildFormDetail({ index, learning: state }, refs.form('work'));
  assert.ok(detail?.coca);
  assert.deepEqual(
    detail.coca.records.map((r) => [r.pos, r.status.status, r.status.origin, r.status.from]),
    [
      ['verb', 'learning', 'inherited', 'f:work'],
      ['noun', 'mastered', 'own', 'lp:work|noun'],
    ]
  );
  // The Form target itself is "learning" (own), not promoted by the mastered PoS record.
  assert.deepEqual(detail.status, { status: 'learning', origin: 'own', from: 'f:work' });
});

test('rows: page, offset, label, formRef, sources, badges and column order', () => {
  const page = buildRows(
    { index },
    {
      query: {
        kind: 'coca_lemma_pos',
        filters: [{ type: 'metric_range', metric: 'coca2020.lp_rank', max: 10 }],
        sort: [{ by: 'metric', metric: 'coca2020.lp_rank', dir: 'asc' }],
        page: { offset: 0, limit: 5 },
        aggregates: [{ metric: 'coca2020.lp_freq', op: 'sum' }],
      },
      columns: ['coca2020.lp_rank', 'coca2020.lp_freq'],
    }
  );

  assert.equal(page.total, 10);
  assert.equal(page.offset, 0);
  assert.equal(page.rows.length, 5);
  assert.equal(page.rows[0].label, 'the (article)');
  assert.deepEqual(
    page.rows.map((r) => r.label),
    ['the (article)', 'be (verb)', 'and (conjunction)', 'a (article)', 'of (preposition)']
  );

  const first = page.rows[0];
  assert.equal(first.ref, 'coca2020:lp:the|article');
  assert.equal(first.kind, 'coca_lemma_pos');
  assert.equal(first.formRef, 'f:the');
  assert.deepEqual(first.sources, ['coca2020', 'bnc25k', 'cet2016'], 'sources are the coverage of its Form');
  assert.equal(first.status, null, 'no learning state synchronised → no status on the row');
  assert.deepEqual(first.metrics.map((c) => c.metric), ['coca2020.lp_rank', 'coca2020.lp_freq']);
  assert.equal(valueOf(first.metrics, 'coca2020.lp_rank'), 1);

  // Aggregates are computed over all matches, not over the page.
  const all = buildRows(
    { index },
    {
      query: {
        kind: 'coca_lemma_pos',
        filters: [{ type: 'metric_range', metric: 'coca2020.lp_rank', max: 10 }],
        aggregates: [{ metric: 'coca2020.lp_freq', op: 'sum' }],
      },
      columns: [],
    }
  );
  assert.equal(all.rows.length, 10);
  assert.deepEqual(page.aggregates, all.aggregates);
  assert.equal(
    page.aggregates[0].value,
    index.listRefs('coca_lemma_pos')
      .filter((r) => index.metricValue(r, 'coca2020.lp_rank')! <= 10)
      .reduce((sum, r) => sum + index.metricValue(r, 'coca2020.lp_freq')!, 0)
  );
});

test('rows: learning status filter and inherited status are visible per row', () => {
  const state = new InMemoryLearningState([rec(refs.formTarget('the'), 'mastered')]);
  const page = buildRows(
    { index, learning: state },
    {
      query: {
        kind: 'coca_lemma_pos',
        filters: [
          { type: 'metric_range', metric: 'coca2020.lp_rank', max: 10 },
          { type: 'learning_status', statuses: ['mastered'], resolution: 'effective' },
        ],
        sort: [{ by: 'metric', metric: 'coca2020.lp_rank', dir: 'asc' }],
      },
      columns: [],
    }
  );
  assert.equal(page.total, 1);
  const row = page.rows[0];
  assert.equal(row.label, 'the (article)');
  assert.deepEqual(row.status, { status: 'mastered', origin: 'inherited', from: 'f:the' });

  // Query misuse still surfaces as a QueryError instead of a half-built page.
  assert.throws(
    () =>
      buildRows(
        { index },
        {
          query: { kind: 'coca_lemma_pos', aggregates: [{ metric: 'coca2020.hw_freq_sum', op: 'sum' }] },
          columns: [],
        }
      ),
    (e: unknown) => e instanceof QueryError && e.code === 'aggregate_requires_native_metric'
  );
});

test('rows: badges are facts from the index (case variant, candidate, family aggregate)', () => {
  assert.deepEqual(rowBadges(index, refs.form('true')), ['cet4', 'case_variant']);
  assert.deepEqual(rowBadges(index, refs.form('cafe')), ['cet4', 'candidate_variant']);
  assert.ok(rowBadges(index, refs.form('work')).includes('multi_pos'));
  assert.ok(rowBadges(index, refs.form('grannies')).includes('multi_family'));
  assert.ok(rowBadges(index, refs.form('abbreviation')).includes('cet6'));

  // A BNC family row is an aggregate: no single form, no default learning target.
  const familyRow = buildRows(
    { index, learning: new InMemoryLearningState() },
    {
      query: { kind: 'bnc_family', text: { q: 'work', mode: 'exact' } },
      columns: ['bnc25k.family_total', 'bnc25k.family_band'],
    }
  ).rows[0];
  assert.equal(familyRow.label, 'work');
  assert.equal(familyRow.formRef, null);
  assert.equal(familyRow.status, null);
  assert.deepEqual(familyRow.sources, ['coca2020', 'bnc25k', 'cet2016']);
  assert.equal(valueOf(familyRow.metrics, 'bnc25k.family_total'), 168597);
  assert.equal(valueOf(familyRow.metrics, 'bnc25k.family_band'), 1);
});

test('metric cells: labels and provenance come from the registry, null is never coerced', () => {
  for (const def of Object.values(METRICS)) {
    const subject = index.listRefs(def.targetKind)[0];
    const cell = metricCell(index, subject, def.id);
    assert.equal(cell.metric, def.id);
    assert.equal(cell.provenance, def.provenance);
    if (def.provenance === 'derived') {
      assert.ok(cell.label.endsWith('（计算）'), `${def.id} label must be marked as computed`);
      assert.notEqual(cell.value, null, `${def.id} is observed on ${subject}`);
    } else {
      assert.ok(!cell.label.endsWith('（计算）'), `${def.id} is an official value`);
    }
  }

  // Missing stays null; an explicit printed 0 stays 0.
  assert.equal(metricCell(index, refs.form('went'), 'coca2020.lp_freq').value, null);
  const zeroMember = [...index.bncMembers.values()].find((m) => m.frequency === 0)!;
  assert.equal(metricCell(index, zeroMember.ref, 'bnc25k.member_freq').value, 0);
});

test('detail builders return null for unknown refs and wrong kinds', () => {
  assert.equal(buildFormDetail({ index }, refs.form('zzzz-not-a-word')), null);
  assert.equal(buildFormDetail({ index }, refs.bncFamily('work')), null);
  assert.equal(buildFamilyDetail({ index }, refs.bncFamily('zzzz-not-a-family')), null);
  assert.equal(buildFamilyDetail({ index }, refs.form('work')), null);
});
