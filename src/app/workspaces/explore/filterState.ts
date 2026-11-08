/**
 * Explore filter state → `LexQuery` (PRODUCT_SPEC §3.1).
 *
 * The panel holds a small amount of UI state; the *query* is the only thing that reaches the
 * engine. Everything here is pure so the mapping can be tested without React, and so the URL
 * (which carries the same `LexQuery`) always describes exactly what the table shows.
 *
 * Two rules decide the shape of this module:
 *   - the UI never filters, sorts or formats frequencies itself, it only builds a query;
 *   - filters that have no facet in the panel (`in_refs` from "Open in Explore", future ones) are
 *     carried through verbatim, so following a link never silently drops a constraint.
 */
import {
  ENTITY_KINDS,
  METRICS,
  metricDisplayLabel,
  type AggregateSpec,
  type CetLevel,
  type CocaPos,
  type EntityKind,
  type LearningStatus,
  type LexQuery,
  type MetricId,
  type QueryFilter,
  type SortSpec,
  type SourceId,
  type SpecialSpellingClass,
  type TextMatchMode,
} from '../../../v2/index.ts';

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

export const EXPLORE_KINDS: readonly EntityKind[] = ENTITY_KINDS;

export const KIND_LABELS: Record<EntityKind, string> = {
  form: '词形 Form',
  coca_headword: 'COCA 词头',
  coca_lemma_pos: 'COCA 词性条目',
  bnc_family: 'BNC 词族',
  bnc_member: 'BNC 成员',
  cet_entry: 'CET 词目',
};

export function isExploreKind(value: string): value is EntityKind {
  return (EXPLORE_KINDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Columns: only metrics whose lift rule can produce a value for the kind
// ---------------------------------------------------------------------------

const HW_METRICS: readonly MetricId[] = [
  'coca2020.hw_rank',
  'coca2020.hw_freq_sum',
  'coca2020.hw_best_lp_rank',
  'coca2020.hw_pos_count',
];

/**
 * Metrics that can be non-null on each kind, derived from the lift table in CONTRACTS §5.3:
 * family totals are never lifted, `member_share_of_family` only exists on a membership, COCA PoS
 * metrics never lift to a Form, and BNC frequencies never reach a COCA record.
 * `exploreFilters.test.ts` pins this against `index.metricValue` on real entities.
 */
export const ALLOWED_COLUMNS: Record<EntityKind, readonly MetricId[]> = {
  form: [...HW_METRICS, 'bnc25k.member_freq', 'bnc25k.family_band'],
  coca_headword: [...HW_METRICS, 'bnc25k.member_freq', 'bnc25k.family_band'],
  coca_lemma_pos: ['coca2020.lp_rank', 'coca2020.lp_freq', 'coca2020.lp_share_of_headword', ...HW_METRICS.slice(0, 1), 'bnc25k.member_freq', 'bnc25k.family_band'],
  bnc_family: ['bnc25k.family_total', 'bnc25k.family_band'],
  bnc_member: ['bnc25k.member_freq', 'bnc25k.member_share_of_family', 'bnc25k.family_band', 'coca2020.hw_rank'],
  cet_entry: ['coca2020.hw_rank', 'coca2020.hw_freq_sum', 'bnc25k.family_band'],
};

/** Two or three columns per kind: the signal a reader needs first, without a wall of numbers. */
export const DEFAULT_COLUMNS: Record<EntityKind, MetricId[]> = {
  form: ['coca2020.hw_rank', 'bnc25k.member_freq'],
  coca_headword: ['coca2020.hw_rank', 'coca2020.hw_freq_sum'],
  coca_lemma_pos: ['coca2020.lp_rank', 'coca2020.lp_freq'],
  bnc_family: ['bnc25k.family_total', 'bnc25k.family_band'],
  bnc_member: ['bnc25k.member_freq', 'bnc25k.member_share_of_family'],
  cet_entry: ['coca2020.hw_rank', 'bnc25k.family_band'],
};

/** Keeps a column choice inside the kind's allowed set and non-empty. */
export function sanitizeColumns(kind: EntityKind, columns: readonly MetricId[]): MetricId[] {
  const allowed = new Set(ALLOWED_COLUMNS[kind]);
  const kept = columns.filter((metric) => allowed.has(metric));
  return kept.length > 0 ? [...new Set(kept)] : [...DEFAULT_COLUMNS[kind]];
}

/**
 * Aggregates shown in the result header: `count_present` for every column (legal on lifted values),
 * plus `sum` only for a column that is native to the kind and counts occurrences — a sum of ranks,
 * bands or ratios would be arithmetic nonsense.
 */
export function aggregateSpecsFor(kind: EntityKind, columns: readonly MetricId[]): AggregateSpec[] {
  const specs: AggregateSpec[] = [];
  for (const metric of columns) {
    specs.push({ metric, op: 'count_present' });
    if (METRICS[metric].targetKind === kind && METRICS[metric].unit === 'occurrences') {
      specs.push({ metric, op: 'sum' });
    }
  }
  return specs;
}

/** Columns are compared by identity, not by position, when deciding whether to refetch. */
export function sameColumns(a: readonly MetricId[], b: readonly MetricId[]): boolean {
  return a.length === b.length && a.every((metric, index) => metric === b[index]);
}

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

export interface RangeFilter {
  min?: number;
  max?: number;
}

export interface ExploreFilters {
  /** Sources that must be present on the entity's Form(s). */
  sourcesPresent: SourceId[];
  /** Sources that must be absent. */
  sourcesAbsent: SourceId[];
  pos: CocaPos[];
  /** Official COCA record rank. */
  lpRank: RangeFilter;
  /** Derived COCA headword rank. */
  hwRank: RangeFilter;
  /** BNC/COCA band (1..25). */
  band: RangeFilter;
  cetLevels: CetLevel[];
  /** Empty means "any status". */
  status: LearningStatus[];
  /** `own` reads only explicit records; `effective` includes read-time inheritance. */
  statusResolution: 'own' | 'effective';
  spellingClasses: SpecialSpellingClass[];
  multiPos: boolean | null;
  multiFamily: boolean | null;
  /** Filters the panel cannot express, carried through unchanged (`in_refs` and future kinds). */
  extra: QueryFilter[];
}

export const EMPTY_FILTERS: ExploreFilters = {
  sourcesPresent: [],
  sourcesAbsent: [],
  pos: [],
  lpRank: {},
  hwRank: {},
  band: {},
  cetLevels: [],
  status: [],
  statusResolution: 'effective',
  spellingClasses: [],
  multiPos: null,
  multiFamily: null,
  extra: [],
};

export interface ExploreState {
  kind: EntityKind;
  text: string;
  textMode: TextMatchMode;
  filters: ExploreFilters;
  sort: SortSpec;
}

export const TEXT_MODES: readonly TextMatchMode[] = ['prefix', 'exact', 'contains'];

export const TEXT_MODE_LABELS: Record<TextMatchMode, string> = {
  prefix: '前缀',
  exact: '精确',
  contains: '包含',
};

export const DEFAULT_SORT: SortSpec = { by: 'spelling', dir: 'asc' };

export function defaultExploreState(kind: EntityKind = 'form'): ExploreState {
  return { kind, text: '', textMode: 'prefix', filters: EMPTY_FILTERS, sort: DEFAULT_SORT };
}

export function isRangeEmpty(range: RangeFilter): boolean {
  return range.min === undefined && range.max === undefined;
}

/** A range that would match nothing is not sent at all (it would be a silent empty table). */
function rangeFilter(metric: MetricId, range: RangeFilter): QueryFilter | null {
  if (isRangeEmpty(range)) return null;
  const filter: QueryFilter = { type: 'metric_range', metric };
  if (range.min !== undefined) filter.min = range.min;
  if (range.max !== undefined) filter.max = range.max;
  return filter;
}

export function toQueryFilters(filters: ExploreFilters): QueryFilter[] {
  const out: QueryFilter[] = [];
  for (const source of filters.sourcesPresent) out.push({ type: 'source_presence', source, present: true });
  for (const source of filters.sourcesAbsent) out.push({ type: 'source_presence', source, present: false });
  if (filters.pos.length > 0) out.push({ type: 'coca_pos', pos: [...filters.pos] });

  const lp = rangeFilter('coca2020.lp_rank', filters.lpRank);
  if (lp) out.push(lp);
  const hw = rangeFilter('coca2020.hw_rank', filters.hwRank);
  if (hw) out.push(hw);
  const band = rangeFilter('bnc25k.family_band', filters.band);
  if (band) out.push(band);

  if (filters.cetLevels.length > 0) out.push({ type: 'cet_level', levels: [...filters.cetLevels] });
  if (filters.status.length > 0) {
    out.push({ type: 'learning_status', statuses: [...filters.status], resolution: filters.statusResolution });
  }
  if (filters.spellingClasses.length > 0) {
    out.push({ type: 'spelling_class', classes: [...filters.spellingClasses], present: true });
  }
  if (filters.multiPos !== null) out.push({ type: 'multi_pos', value: filters.multiPos });
  if (filters.multiFamily !== null) out.push({ type: 'multi_family', value: filters.multiFamily });

  out.push(...filters.extra);
  return out;
}

/**
 * Builds the query for one window. `page` is not part of the route state: it is the scroll
 * position, so it is supplied per request instead of living in the URL.
 */
export function toLexQuery(state: ExploreState, page?: { offset: number; limit: number }, aggregates?: AggregateSpec[]): LexQuery {
  const query: LexQuery = { kind: state.kind };
  const text = state.text.trim();
  if (text.length > 0) query.text = { q: text, mode: state.textMode };
  const filters = toQueryFilters(state.filters);
  if (filters.length > 0) query.filters = filters;
  query.sort = [state.sort];
  if (page) query.page = page;
  if (aggregates && aggregates.length > 0) query.aggregates = aggregates;
  return query;
}

/** Inverse of `toLexQuery` for the parts the panel owns; anything else is kept in `extra`. */
export function fromLexQuery(query: LexQuery | undefined, fallbackKind: EntityKind = 'form'): ExploreState {
  const kind = query && isExploreKind(query.kind) ? query.kind : fallbackKind;
  const filters: ExploreFilters = {
    ...EMPTY_FILTERS,
    sourcesPresent: [],
    sourcesAbsent: [],
    pos: [],
    cetLevels: [],
    status: [],
    spellingClasses: [],
    extra: [],
  };

  if (query?.text) {
    // no-op: text is read below so an empty string stays empty
  }

  for (const filter of query?.filters ?? []) {
    switch (filter.type) {
      case 'source_presence':
        (filter.present ? filters.sourcesPresent : filters.sourcesAbsent).push(filter.source);
        break;
      case 'coca_pos':
        filters.pos = [...filter.pos];
        break;
      case 'cet_level':
        filters.cetLevels = [...filter.levels];
        break;
      case 'learning_status':
        filters.status = [...filter.statuses];
        filters.statusResolution = filter.resolution === 'own' ? 'own' : 'effective';
        break;
      case 'spelling_class':
        filters.spellingClasses = [...filter.classes];
        break;
      case 'multi_pos':
        filters.multiPos = filter.value;
        break;
      case 'multi_family':
        filters.multiFamily = filter.value;
        break;
      case 'metric_range': {
        const range: RangeFilter = {};
        if (filter.min !== undefined) range.min = filter.min;
        if (filter.max !== undefined) range.max = filter.max;
        if (filter.metric === 'coca2020.lp_rank') filters.lpRank = range;
        else if (filter.metric === 'coca2020.hw_rank') filters.hwRank = range;
        else if (filter.metric === 'bnc25k.family_band') filters.band = range;
        else filters.extra.push(filter);
        break;
      }
      default:
        filters.extra.push(filter);
    }
  }

  const firstSort = query?.sort?.[0];
  return {
    kind,
    text: query?.text?.q ?? '',
    textMode: query?.text?.mode ?? 'prefix',
    filters,
    sort: firstSort ?? DEFAULT_SORT,
  };
}

// ---------------------------------------------------------------------------
// Display helpers (labels come from the registry, never from this module)
// ---------------------------------------------------------------------------

/**
 * Registry label for a metric id. An id the registry does not know (a hand-edited URL, a stale
 * link) renders as the raw id instead of throwing inside a cell renderer.
 */
export function columnLabel(metric: MetricId): string {
  return METRICS[metric] ? metricDisplayLabel(metric) : metric;
}

export function sortLabel(sort: SortSpec): string {
  const direction = sort.dir === 'asc' ? '↑' : '↓';
  if (sort.by === 'spelling') return `拼写 ${direction}`;
  return `${columnLabel(sort.metric)} ${direction}`;
}

/** Formats a metric value for display; `null` means "the source does not list it". */
export function formatMetricValue(metric: MetricId, value: number | null): string {
  if (value === null) return '—';
  const definition = METRICS[metric];
  if (!definition) return String(value);
  switch (definition.unit) {
    case 'ratio':
      return `${(value * 100).toFixed(1)}%`;
    case 'occurrences':
    case 'count':
      return value.toLocaleString('en-US');
    case 'rank':
      return `#${value.toLocaleString('en-US')}`;
    case 'band':
      return `${value}k`;
  }
}

/** Missing-value tooltip: names the source instead of pretending the value is zero. */
export function missingHint(metric: MetricId): string {
  return METRICS[metric] ? `${METRICS[metric].source} 未收录` : '未收录';
}

// ---------------------------------------------------------------------------
// Facet vocabulary (labels only; the values are the domain's own)
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<LearningStatus, string> = {
  unrated: '未评',
  queued: '待学',
  learning: '在学',
  mastered: '掌握',
  deferred: '暂缓',
};

/** Status shortcut keys 1–5, in the order the product spec fixes. */
export const STATUS_KEYS: readonly LearningStatus[] = ['unrated', 'queued', 'learning', 'mastered', 'deferred'];

export const SPELLING_CLASSES: readonly SpecialSpellingClass[] = [
  'hyphen',
  'apostrophe',
  'slash',
  'space',
  'uppercase',
  'digit',
  'ampersand',
  'non_ascii',
];

export const SPELLING_CLASS_LABELS: Record<SpecialSpellingClass, string> = {
  hyphen: '连字符',
  apostrophe: '撇号',
  slash: '斜杠',
  space: '空格',
  uppercase: '大写',
  digit: '数字',
  ampersand: '&',
  non_ascii: '非 ASCII',
};

export const SOURCE_LABELS: Record<SourceId, string> = {
  coca2020: 'COCA 2020',
  bnc25k: 'BNC/COCA 25k',
  cet2016: 'CET 2016',
};

export const CET_LEVELS: readonly CetLevel[] = ['CET4', 'CET6'];

export const COCA_POS = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'number',
  'interjection',
  'preposition',
  'pronoun',
  'conjunction',
  'determiner',
  'article',
  '+infinitive',
  'negation',
  'existential',
] as const satisfies readonly CocaPos[];

/** Applies a facet change and keeps present/absent mutually exclusive per source. */
export function toggleSource(filters: ExploreFilters, source: SourceId, mode: 'present' | 'absent'): ExploreFilters {
  const present = new Set(filters.sourcesPresent);
  const absent = new Set(filters.sourcesAbsent);
  if (mode === 'present') {
    if (present.has(source)) present.delete(source);
    else {
      present.add(source);
      absent.delete(source);
    }
  } else {
    if (absent.has(source)) absent.delete(source);
    else {
      absent.add(source);
      present.delete(source);
    }
  }
  return { ...filters, sourcesPresent: [...present], sourcesAbsent: [...absent] };
}

/** Generic add/remove for the multi-select facets (pos, CET level, status, spelling class). */
export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function setRange(range: RangeFilter, edge: 'min' | 'max', raw: string): RangeFilter {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    const next = { ...range };
    delete next[edge];
    return next;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return range; // ignore garbage instead of sending NaN to the engine
  return { ...range, [edge]: Math.max(0, Math.trunc(parsed)) };
}

/**
 * Switching kind keeps text and filters ("same scope"), but a sort key that cannot produce values
 * for the new kind would silently degrade to spelling order — reset it explicitly instead.
 */
export function sortForKind(sort: SortSpec, kind: EntityKind): SortSpec {
  if (sort.by === 'spelling') return sort;
  return ALLOWED_COLUMNS[kind].includes(sort.metric) ? sort : DEFAULT_SORT;
}

/**
 * Switching kind keeps the scope but drops a rank range the new kind cannot satisfy: an official
 * COCA record rank only exists on `coca_lemma_pos`, and a COCA headword rank never lifts to a
 * family. Keeping them would show an empty table for a reason the panel cannot explain.
 */
export function filtersForKind(filters: ExploreFilters, kind: EntityKind): ExploreFilters {
  const next: ExploreFilters = { ...filters };
  if (kind !== 'coca_lemma_pos' && !isRangeEmpty(filters.lpRank)) next.lpRank = {};
  if (kind === 'bnc_family' && !isRangeEmpty(filters.hwRank)) next.hwRank = {};
  return next;
}

/** Counts the facets a reader has turned on (used by the panel badge and the mobile button). */
export function countActiveFilters(filters: ExploreFilters): number {
  let count = filters.sourcesPresent.length + filters.sourcesAbsent.length;
  count += filters.pos.length + filters.cetLevels.length + filters.status.length + filters.spellingClasses.length;
  if (!isRangeEmpty(filters.lpRank)) count += 1;
  if (!isRangeEmpty(filters.hwRank)) count += 1;
  if (!isRangeEmpty(filters.band)) count += 1;
  if (filters.multiPos !== null) count += 1;
  if (filters.multiFamily !== null) count += 1;
  count += filters.extra.length;
  return count;
}
