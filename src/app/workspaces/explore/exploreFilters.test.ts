/**
 * Explore filter-state tests.
 *
 * Two things are pinned here:
 *   1. panel state → `LexQuery`: exactly the filters the reader turned on, in a stable order, with
 *      `in_refs`-style constraints carried through untouched;
 *   2. `ALLOWED_COLUMNS`: the column chooser may only offer metrics that the lift rules can actually
 *      fill for that kind — checked against `index.metricValue` on real entities, so a wrong table
 *      fails a test instead of showing an empty column to the reader.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullIndex } from '../../../v2/node/loadSources.ts';
import { refs, type EntityKind, type EntityRef, type MetricId } from '../../../v2/index.ts';
import {
  ALLOWED_COLUMNS,
  DEFAULT_COLUMNS,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  EXPLORE_KINDS,
  aggregateSpecsFor,
  countActiveFilters,
  defaultExploreState,
  formatMetricValue,
  filtersForKind,
  fromLexQuery,
  isExploreKind,
  sanitizeColumns,
  sortForKind,
  toLexQuery,
  type ExploreState,
} from './filterState.ts';

const index = loadFullIndex();

/** One real entity per kind, chosen for having values in every allowed column. */
const SAMPLE: Record<EntityKind, EntityRef> = {
  form: refs.form('work'),
  coca_headword: refs.cocaHeadword('work'),
  coca_lemma_pos: refs.cocaLemmaPos('work', 'noun'),
  bnc_family: refs.bncFamily('work'),
  bnc_member: refs.bncMember('work', 'worked'),
  cet_entry: refs.cetEntry('work'),
};

test('explore: CET6 + headword rank ≤ 5000 + unrated maps to the expected LexQuery', () => {
  const state: ExploreState = {
    kind: 'form',
    text: '',
    textMode: 'prefix',
    sort: { by: 'metric', metric: 'coca2020.hw_rank', dir: 'asc' },
    filters: {
      ...EMPTY_FILTERS,
      cetLevels: ['CET6'],
      hwRank: { max: 5000 },
      status: ['unrated'],
      statusResolution: 'effective',
    },
  };

  // Filter order is fixed by the builder (sources → PoS → ranges → CET → status → spelling →
  // multi-* → passthrough), so the same panel state always produces the same URL.
  assert.deepEqual(toLexQuery(state), {
    kind: 'form',
    filters: [
      { type: 'metric_range', metric: 'coca2020.hw_rank', max: 5000 },
      { type: 'cet_level', levels: ['CET6'] },
      { type: 'learning_status', statuses: ['unrated'], resolution: 'effective' },
    ],
    sort: [{ by: 'metric', metric: 'coca2020.hw_rank', dir: 'asc' }],
  });
});

test('explore: every facet reaches the query, and paging only when asked', () => {
  const state: ExploreState = {
    kind: 'bnc_member',
    text: '  went  ',
    textMode: 'contains',
    sort: DEFAULT_SORT,
    filters: {
      sourcesPresent: ['bnc25k'],
      sourcesAbsent: ['coca2020'],
      pos: ['verb'],
      lpRank: { min: 1, max: 1000 },
      band: { max: 3 },
      cetLevels: ['CET4'],
      status: ['learning'],
      statusResolution: 'own',
      spellingClasses: ['hyphen'],
      multiPos: true,
      multiFamily: false,
      hwRank: {},
      extra: [{ type: 'in_refs', refs: ['bnc25k:fam:go'] }],
    },
  };

  assert.deepEqual(toLexQuery(state), {
    kind: 'bnc_member',
    text: { q: 'went', mode: 'contains' },
    filters: [
      { type: 'source_presence', source: 'bnc25k', present: true },
      { type: 'source_presence', source: 'coca2020', present: false },
      { type: 'coca_pos', pos: ['verb'] },
      { type: 'metric_range', metric: 'coca2020.lp_rank', min: 1, max: 1000 },
      { type: 'metric_range', metric: 'bnc25k.family_band', max: 3 },
      { type: 'cet_level', levels: ['CET4'] },
      { type: 'learning_status', statuses: ['learning'], resolution: 'own' },
      { type: 'spelling_class', classes: ['hyphen'], present: true },
      { type: 'multi_pos', value: true },
      { type: 'multi_family', value: false },
      { type: 'in_refs', refs: ['bnc25k:fam:go'] },
    ],
    sort: [{ by: 'spelling', dir: 'asc' }],
  });

  // `page` and `aggregates` are per request, never part of the route query.
  const withWindow = toLexQuery(state, { offset: 400, limit: 200 });
  assert.deepEqual(withWindow.page, { offset: 400, limit: 200 });

  // An empty text box sends no text filter at all (it must not narrow to the empty string).
  assert.equal(toLexQuery({ ...state, text: '   ' }).text, undefined);
});

test('explore: an empty panel is an empty query, not a filter that matches nothing', () => {
  assert.deepEqual(toLexQuery(defaultExploreState()), { kind: 'form', sort: [{ by: 'spelling', dir: 'asc' }] });
  assert.equal(countActiveFilters(EMPTY_FILTERS), 0);
});

test('explore: query → panel round-trips every facet and keeps unknown filters', () => {
  const state: ExploreState = {
    kind: 'cet_entry',
    text: 'ab',
    textMode: 'exact',
    sort: { by: 'metric', metric: 'bnc25k.family_band', dir: 'desc' },
    filters: {
      ...EMPTY_FILTERS,
      sourcesAbsent: ['coca2020'],
      pos: ['noun'],
      lpRank: { min: 10 },
      hwRank: { max: 20000 },
      band: { min: 1, max: 5 },
      cetLevels: ['CET4', 'CET6'],
      status: ['queued', 'deferred'],
      statusResolution: 'own',
      spellingClasses: ['space', 'digit'],
      multiFamily: true,
      extra: [{ type: 'in_refs', refs: ['f:work'] }],
    },
  };

  const query = toLexQuery(state);
  assert.deepEqual(fromLexQuery(query), state);
  assert.deepEqual(fromLexQuery(undefined), defaultExploreState());
});

test('explore: ALLOWED_COLUMNS matches the lift rules on real entities', () => {
  for (const kind of EXPLORE_KINDS) {
    const entity = SAMPLE[kind];
    const allowed = ALLOWED_COLUMNS[kind];
    assert.ok(allowed.length > 0, `${kind} offers at least one column`);
    for (const metric of allowed) {
      assert.notEqual(
        index.metricValue(entity, metric),
        null,
        `${kind}: ${metric} is offered but ${entity} has no value for it`
      );
    }
    // Default columns must be a subset of the allowed ones.
    for (const metric of DEFAULT_COLUMNS[kind]) assert.ok(allowed.includes(metric), `${kind} default ${metric}`);
    // A known forbidden pair per kind: family totals never lift, PoS metrics never reach a Form.
    const forbidden: [EntityRef, MetricId] = kind === 'form' ? [entity, 'bnc25k.family_total'] : [entity, 'coca2020.lp_share_of_headword'];
    if (!allowed.includes(forbidden[1])) {
      assert.equal(index.metricValue(forbidden[0], forbidden[1]), null, `${kind}: forbidden ${forbidden[1]} stays null`);
    }
  }
});

test('explore: columns are sanitized to the kind and never empty', () => {
  assert.deepEqual(sanitizeColumns('bnc_family', ['bnc25k.family_total', 'coca2020.hw_rank']), ['bnc25k.family_total']);
  assert.deepEqual(sanitizeColumns('bnc_family', ['coca2020.hw_rank']), ['bnc25k.family_total', 'bnc25k.family_band']);
  assert.deepEqual(sanitizeColumns('form', ['coca2020.hw_rank', 'coca2020.hw_rank']), ['coca2020.hw_rank']);
});

test('explore: aggregation is only summed where the metric is native and counts occurrences', () => {
  const specs = aggregateSpecsFor('coca_lemma_pos', ['coca2020.lp_rank', 'coca2020.lp_freq', 'bnc25k.member_freq']);
  assert.deepEqual(specs, [
    { metric: 'coca2020.lp_rank', op: 'count_present' },
    { metric: 'coca2020.lp_freq', op: 'count_present' },
    { metric: 'coca2020.lp_freq', op: 'sum' },
    { metric: 'bnc25k.member_freq', op: 'count_present' },
  ]);

  // A family total is native on its kind, so summing it is legitimate there.
  assert.deepEqual(aggregateSpecsFor('bnc_family', ['bnc25k.family_total']), [
    { metric: 'bnc25k.family_total', op: 'count_present' },
    { metric: 'bnc25k.family_total', op: 'sum' },
  ]);
});

test('explore: switching kind drops a sort the new kind cannot produce', () => {
  assert.deepEqual(sortForKind({ by: 'metric', metric: 'coca2020.lp_rank', dir: 'desc' }, 'form'), DEFAULT_SORT);
  assert.deepEqual(sortForKind({ by: 'metric', metric: 'coca2020.lp_rank', dir: 'desc' }, 'coca_lemma_pos'), {
    by: 'metric',
    metric: 'coca2020.lp_rank',
    dir: 'desc',
  });
  assert.deepEqual(sortForKind({ by: 'spelling', dir: 'desc' }, 'bnc_family'), { by: 'spelling', dir: 'desc' });
});

test('explore: switching kind drops ranges the new kind cannot satisfy', () => {
  const filters = { ...EMPTY_FILTERS, lpRank: { max: 1000 }, hwRank: { max: 5000 }, band: { max: 3 } };

  // Official COCA record rank exists only on the PoS-record kind.
  assert.deepEqual(filtersForKind(filters, 'coca_headword'), { ...filters, lpRank: {} });
  assert.deepEqual(filtersForKind(filters, 'coca_lemma_pos'), filters);

  // A derived headword rank never lifts to a family; band is native there and stays.
  assert.deepEqual(filtersForKind(filters, 'bnc_family'), { ...filters, lpRank: {}, hwRank: {} });

  // A Form has no official COCA record rank of its own; its headword rank and band still apply.
  assert.deepEqual(filtersForKind(filters, 'form'), { ...filters, lpRank: {} });
});

test('explore: active facet counting and value formatting', () => {
  assert.equal(countActiveFilters({ ...EMPTY_FILTERS, cetLevels: ['CET4'], band: { max: 3 }, multiPos: false }), 3);
  assert.equal(countActiveFilters({ ...EMPTY_FILTERS, extra: [{ type: 'in_refs', refs: [] }] }), 1);

  assert.equal(formatMetricValue('coca2020.lp_freq', 854095), '854,095');
  assert.equal(formatMetricValue('coca2020.lp_rank', 115), '#115');
  assert.equal(formatMetricValue('bnc25k.family_band', 1), '1k');
  assert.equal(formatMetricValue('bnc25k.member_share_of_family', 0.5383), '53.8%');
  assert.equal(formatMetricValue('coca2020.lp_freq', null), '—', 'null is a dash, never a zero');
  assert.equal(formatMetricValue('bnc25k.member_freq', 0), '0', 'a printed zero stays visible');
});

test('explore: kind guard', () => {
  assert.ok(isExploreKind('bnc_member'));
  assert.ok(!isExploreKind('legacy'));
  assert.ok(!isExploreKind('nope'));
});
