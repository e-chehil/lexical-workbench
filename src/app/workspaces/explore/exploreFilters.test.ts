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
  filterChips,
  formatMetricValue,
  fromLexQuery,
  inapplicableFilters,
  isExploreKind,
  removeFilterChip,
  sanitizeColumns,
  sortForKind,
  toLexQuery,
  type ExploreFilters,
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

test('explore: every applicable facet reaches the query, and paging only when asked', () => {
  const state: ExploreState = {
    kind: 'bnc_member',
    text: '  went  ',
    textMode: 'contains',
    sort: DEFAULT_SORT,
    filters: {
      sourcesPresent: ['bnc25k'],
      sourcesAbsent: ['coca2020'],
      pos: ['verb'],
      lpRank: {},
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

  // Inapplicable ranges never travel with the wrong kind (they become disabled chips instead).
  const withLpRank = { ...state, filters: { ...state.filters, lpRank: { min: 1, max: 1000 } } };
  assert.ok(!toLexQuery(withLpRank).filters?.some((filter) => filter.type === 'metric_range' && filter.metric === 'coca2020.lp_rank'));
});

test('explore: an empty panel is an empty query, not a filter that matches nothing', () => {
  assert.deepEqual(toLexQuery(defaultExploreState()), { kind: 'form', sort: [{ by: 'spelling', dir: 'asc' }] });
  assert.equal(countActiveFilters(EMPTY_FILTERS, 'form'), 0);
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
      lpRank: {},
      hwRank: { max: 20000 },
      band: { min: 1, max: 5 },
      cetLevels: ['CET4', 'CET6'],
      status: [],
      statusResolution: 'effective',
      spellingClasses: ['space', 'digit'],
      multiFamily: true,
      extra: [{ type: 'in_refs', refs: ['f:work'] }],
    },
  };

  // The round-trip covers every applicable facet. Inapplicable ranges are withheld from the URL
  // by design (Shape Brief §4.1): they live in panel state only and never reach the query.
  const query = toLexQuery(state);
  assert.deepEqual(fromLexQuery(query), state);
  assert.deepEqual(fromLexQuery(undefined), defaultExploreState());

  const withLpRank: ExploreState = { ...state, filters: { ...state.filters, lpRank: { min: 10 } } };
  assert.ok(!toLexQuery(withLpRank).filters?.some((filter) => filter.type === 'metric_range' && filter.metric === 'coca2020.lp_rank'));
  const restoredLpRank = fromLexQuery(toLexQuery(withLpRank));
  assert.deepEqual(restoredLpRank.filters.lpRank, {}, 'the URL only carries conditions it actually sent');
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
  assert.deepEqual(sanitizeColumns('bnc_family', ['coca2020.hw_rank']), ['bnc25k.family_total']);
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

test('explore: switching kind keeps panel intent but withholds inapplicable ranges from the query', () => {
  const filters = { ...EMPTY_FILTERS, lpRank: { max: 1000 }, hwRank: { max: 5000 }, band: { max: 3 } };
  const state: ExploreState = { kind: 'form', text: '', textMode: 'prefix', filters, sort: DEFAULT_SORT };

  // Nothing is mutated away: the reader's intent survives kind switches, and the query only
  // carries conditions this kind can satisfy (Shape Brief §4.1, replacing the drop policy).
  // On a Form the official record rank is withheld; the headword rank and band still apply.
  assert.deepEqual(toLexQuery(state).filters, [
    { type: 'metric_range', metric: 'coca2020.hw_rank', max: 5000 },
    { type: 'metric_range', metric: 'bnc25k.family_band', max: 3 },
  ]);
  assert.deepEqual(inapplicableFilters(filters, 'form'), [
    { id: 'lpRank', label: '官方排名 ≤1,000', reason: 'COCA 官方排名仅存在于「COCA 词性条目」' },
  ]);

  // Switching to the kind that owns the rank re-activates both ranges with no user action.
  assert.deepEqual(toLexQuery({ ...state, kind: 'coca_lemma_pos' }).filters?.slice(0, 2), [
    { type: 'metric_range', metric: 'coca2020.lp_rank', max: 1000 },
    { type: 'metric_range', metric: 'coca2020.hw_rank', max: 5000 },
  ]);

  // A derived headword rank never lifts to a family; band is native there and stays.
  const familyState: ExploreState = { ...state, kind: 'bnc_family' };
  assert.deepEqual(toLexQuery(familyState).filters, [{ type: 'metric_range', metric: 'bnc25k.family_band', max: 3 }]);
  assert.deepEqual(
    inapplicableFilters(filters, 'bnc_family').map((item) => item.id),
    ['lpRank', 'hwRank']
  );

  // A family has no independent learning target: a status filter is withheld and shown inert.
  const familyWithStatus: ExploreState = { ...familyState, filters: { ...filters, status: ['unrated'] } };
  assert.ok(!toLexQuery(familyWithStatus).filters?.some((filter) => filter.type === 'learning_status'));
  const familyStatus = inapplicableFilters(familyWithStatus.filters, 'bnc_family').find((item) => item.id === 'status');
  assert.match(familyStatus?.reason ?? '', /聚合单位/);
  const cetState: ExploreState = { ...state, kind: 'cet_entry', filters: { ...filters, status: ['unrated'] } };
  assert.ok(!toLexQuery(cetState).filters?.some((filter) => filter.type === 'learning_status'));
  assert.match(inapplicableFilters(cetState.filters, 'cet_entry').find((item) => item.id === 'status')?.reason ?? '', /多个拼写/);
});

test('explore: chips list every applicable condition as removable, inapplicable as disabled with a reason', () => {
  const filters: ExploreFilters = {
    ...EMPTY_FILTERS,
    sourcesPresent: ['bnc25k'],
    cetLevels: ['CET6'],
    status: ['unrated'],
    hwRank: { max: 5000 },
    extra: [{ type: 'in_refs', refs: ['f:work'] }],
  };

  const chips = filterChips(filters, 'form');
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ['词头排名（计算） ≤5,000', '有 BNC/COCA 25k', 'CET6', '未评', '固定集合（1）']
  );
  assert.ok(chips.every((chip) => chip.removable));
  assert.ok(chips.every((chip) => !chip.disabled));

  // The same panel state as a family query marks the headword rank inert — text reason, not colour.
  const familyChips = filterChips(filters, 'bnc_family');
  const rank = familyChips.find((chip) => chip.id === 'hwRank');
  assert.equal(rank?.disabled, true);
  assert.match(rank?.reason ?? '', /词族/);
  const statusChip = familyChips.find((chip) => chip.id === 'status');
  assert.equal(statusChip?.disabled, true);
  assert.match(statusChip?.reason ?? '', /成员词形/);

  // Removing a chip clears exactly that condition; an unknown id changes nothing.
  assert.deepEqual(removeFilterChip(filters, 'extra:0').extra, []);
  assert.deepEqual(removeFilterChip(filters, 'cet:CET6').cetLevels, []);
  assert.deepEqual(removeFilterChip(filters, 'hwRank').hwRank, {});
  assert.deepEqual(removeFilterChip({ ...filters, status: ['unrated', 'queued'] }, 'status').status, []);
  assert.equal(removeFilterChip(filters, 'nonsense'), filters);
});

test('explore: active facet counting and value formatting', () => {
  assert.equal(countActiveFilters({ ...EMPTY_FILTERS, cetLevels: ['CET4'], band: { max: 3 }, multiPos: false }, 'form'), 3);
  assert.equal(countActiveFilters({ ...EMPTY_FILTERS, extra: [{ type: 'in_refs', refs: [] }] }, 'form'), 1);
  // An inapplicable range no longer counts as active for the badge.
  assert.equal(countActiveFilters({ ...EMPTY_FILTERS, lpRank: { max: 1000 } }, 'form'), 0);
  assert.equal(countActiveFilters({ ...EMPTY_FILTERS, lpRank: { max: 1000 } }, 'coca_lemma_pos'), 1);
  assert.equal(countActiveFilters({ ...EMPTY_FILTERS, status: ['unrated'] }, 'bnc_family'), 0);
  assert.equal(countActiveFilters({ ...EMPTY_FILTERS, status: ['unrated'] }, 'cet_entry'), 0);
  assert.equal(countActiveFilters({ ...EMPTY_FILTERS, status: ['unrated'] }, 'form'), 1);

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
