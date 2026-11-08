/**
 * Lexical Workbench 2.0 — unified query protocol (reference implementation).
 *
 * Every workspace (Explore, Corpus Lab, Family Atlas, Study, Insights, Data Studio) obtains
 * lists through `runQuery` and converts between entity kinds through `projectRefs`.
 * Modules MUST NOT re-implement frequency lookup, matching or filtering.
 */
import { kindOf, refs, searchKey, type EntityKind, type EntityRef, type SourceId } from '../domain/ids.ts';
import { METRICS, type MetricId } from '../domain/metrics.ts';
import type { CetLevel, CocaPos, SpecialSpellingClass } from '../domain/types.ts';
import {
  defaultTargetFor,
  resolveEffectiveStatus,
  type LearningStateReader,
  type LearningStatus,
} from '../learning/model.ts';
import type { LexicalIndex } from './lexicalIndex.ts';

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export type TextMatchMode = 'exact' | 'prefix' | 'contains';

export type QueryFilter =
  | { type: 'metric_range'; metric: MetricId; min?: number; max?: number; includeMissing?: boolean }
  | { type: 'metric_present'; metric: MetricId; present: boolean }
  | { type: 'source_presence'; source: SourceId; present: boolean }
  | { type: 'coca_pos'; pos: CocaPos[] }
  | { type: 'cet_level'; levels: CetLevel[] }
  | { type: 'learning_status'; statuses: LearningStatus[]; resolution?: 'own' | 'effective' }
  | { type: 'in_refs'; refs: EntityRef[] }
  | { type: 'spelling_class'; classes: SpecialSpellingClass[]; present: boolean }
  | { type: 'multi_pos'; value: boolean }
  | { type: 'multi_family'; value: boolean };

export type SortSpec =
  | { by: 'metric'; metric: MetricId; dir: 'asc' | 'desc' }
  | { by: 'spelling'; dir: 'asc' | 'desc' };

export type AggregateSpec = { metric: MetricId; op: 'sum' | 'min' | 'max' | 'count_present' };

export interface LexQuery {
  kind: EntityKind;
  text?: { q: string; mode: TextMatchMode };
  filters?: QueryFilter[];
  /** Applied in order; missing values always sort last; final tie-break spelling asc, ref asc. */
  sort?: SortSpec[];
  page?: { offset: number; limit: number };
  aggregates?: AggregateSpec[];
}

export interface AggregateValue extends AggregateSpec {
  value: number | null;
}

export interface QueryResult {
  kind: EntityKind;
  /** Number of matches before paging. */
  total: number;
  /** Ordered refs (paged slice when `page` given, otherwise all matches). */
  refs: EntityRef[];
  aggregates: AggregateValue[];
}

export interface QueryContext {
  index: LexicalIndex;
  learning?: LearningStateReader;
}

export class QueryError extends Error {
  constructor(
    public readonly code:
      | 'aggregate_requires_native_metric'
      | 'learning_state_required'
      | 'invalid_page',
    message: string
  ) {
    super(message);
    this.name = 'QueryError';
  }
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * Converts one entity into related entities of another kind. Rules (CONTRACTS.md §5.4):
 * all cross-source hops go through the Form hub; same-source structure is followed directly.
 */
export function projectRef(index: LexicalIndex, ref: EntityRef, to: EntityKind): EntityRef[] {
  const from = kindOf(ref);
  if (from === to) return index.has(ref) ? [ref] : [];
  switch (from) {
    case 'form': {
      const n = index.forms.get(ref);
      if (!n) return [];
      switch (to) {
        case 'coca_headword':
          return n.cocaHeadwordRef ? [n.cocaHeadwordRef] : [];
        case 'coca_lemma_pos':
          return n.cocaHeadwordRef ? [...index.cocaHeadwords.get(n.cocaHeadwordRef)!.lemmaPosRefs] : [];
        case 'bnc_member':
          return [...n.bncMemberRefs];
        case 'bnc_family':
          return uniq(n.bncMemberRefs.map((m) => index.bncMembers.get(m)!.familyRef));
        case 'cet_entry':
          return uniq(n.cetLinks.map((l) => l.entryRef));
      }
      return [];
    }
    case 'coca_headword': {
      const h = index.cocaHeadwords.get(ref);
      if (!h) return [];
      if (to === 'coca_lemma_pos') return [...h.lemmaPosRefs];
      return projectRef(index, h.formRef, to);
    }
    case 'coca_lemma_pos': {
      const r = index.cocaRecords.get(ref);
      if (!r) return [];
      if (to === 'coca_headword') return [r.headwordRef];
      return projectRef(index, r.formRef, to);
    }
    case 'bnc_member': {
      const m = index.bncMembers.get(ref);
      if (!m) return [];
      if (to === 'bnc_family') return [m.familyRef];
      return projectRef(index, m.formRef, to);
    }
    case 'bnc_family': {
      const f = index.bncFamilies.get(ref);
      if (!f) return [];
      if (to === 'bnc_member') return [...f.memberRefs];
      const forms = f.memberRefs.map((m) => index.bncMembers.get(m)!.formRef);
      return to === 'form' ? uniq(forms) : uniq(forms.flatMap((fr) => projectRef(index, fr, to)));
    }
    case 'cet_entry': {
      const e = index.cetEntries.get(ref);
      if (!e) return [];
      const forms = e.links.map((l) => l.formRef);
      return to === 'form' ? uniq(forms) : uniq(forms.flatMap((fr) => projectRef(index, fr, to)));
    }
  }
}

export function projectRefs(index: LexicalIndex, input: Iterable<EntityRef>, to: EntityKind): EntityRef[] {
  const out = new Set<EntityRef>();
  for (const r of input) for (const p of projectRef(index, r, to)) out.add(p);
  return [...out];
}

export interface SetComparison {
  kind: EntityKind;
  onlyA: EntityRef[];
  onlyB: EntityRef[];
  both: EntityRef[];
}

/** Compare two ref sets after projecting both to ONE common kind (prevents unit mixing). */
export function compareRefSets(index: LexicalIndex, a: Iterable<EntityRef>, b: Iterable<EntityRef>, at: EntityKind): SetComparison {
  const A = new Set(projectRefs(index, a, at));
  const B = new Set(projectRefs(index, b, at));
  const onlyA: EntityRef[] = [];
  const both: EntityRef[] = [];
  for (const r of A) (B.has(r) ? both : onlyA).push(r);
  const onlyB = [...B].filter((r) => !A.has(r));
  return { kind: at, onlyA, onlyB, both };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/** Primary printed spelling of an entity (used for text search and spelling sort). */
export function primarySpelling(index: LexicalIndex, ref: EntityRef): string {
  switch (kindOf(ref)) {
    case 'form':
      return index.forms.get(ref)?.key ?? '';
    case 'coca_headword':
      return index.cocaHeadwords.get(ref)?.headword ?? '';
    case 'coca_lemma_pos':
      return index.cocaRecords.get(ref)?.headword ?? '';
    case 'bnc_family':
      return index.bncFamilies.get(ref)?.headword ?? '';
    case 'bnc_member':
      return index.bncMembers.get(ref)?.form ?? '';
    case 'cet_entry':
      return index.cetEntries.get(ref)?.links[0]?.surface ?? '';
  }
}

const SPELLING_TESTS: Record<SpecialSpellingClass, RegExp> = {
  hyphen: /-/,
  apostrophe: /'/,
  slash: /\//,
  space: / /,
  uppercase: /[A-Z]/,
  digit: /[0-9]/,
  ampersand: /&/,
  non_ascii: /[^\x00-\x7f]/,
};

function formsOf(index: LexicalIndex, ref: EntityRef): EntityRef[] {
  return kindOf(ref) === 'form' ? [ref] : projectRef(index, ref, 'form');
}

function matchFilter(ctx: QueryContext, ref: EntityRef, f: QueryFilter): boolean {
  const { index } = ctx;
  switch (f.type) {
    case 'metric_range': {
      const v = index.metricValue(ref, f.metric);
      if (v === null) return f.includeMissing === true;
      return (f.min === undefined || v >= f.min) && (f.max === undefined || v <= f.max);
    }
    case 'metric_present':
      return (index.metricValue(ref, f.metric) !== null) === f.present;
    case 'source_presence': {
      const has = formsOf(index, ref).some((fr) => index.sourcesOfForm(fr).has(f.source));
      return has === f.present;
    }
    case 'coca_pos': {
      if (kindOf(ref) === 'coca_lemma_pos') return f.pos.includes(index.cocaRecords.get(ref)!.pos);
      return projectRef(index, ref, 'coca_lemma_pos').some((lp) => f.pos.includes(index.cocaRecords.get(lp)!.pos));
    }
    case 'cet_level': {
      if (kindOf(ref) === 'cet_entry') return f.levels.includes(index.cetEntries.get(ref)!.level);
      return formsOf(index, ref).some((fr) => index.forms.get(fr)!.cetLinks.some((l) => f.levels.includes(l.level)));
    }
    case 'learning_status': {
      if (!ctx.learning) throw new QueryError('learning_state_required', 'learning_status filter needs ctx.learning');
      const target = defaultTargetFor(index, ref);
      if (!target) return false;
      const status =
        f.resolution === 'own'
          ? ctx.learning.get(target)?.status ?? 'unrated'
          : resolveEffectiveStatus(ctx.learning, target).status;
      return f.statuses.includes(status);
    }
    case 'in_refs':
      return true; // pre-resolved in runQuery
    case 'spelling_class': {
      const s = primarySpelling(index, ref);
      return f.classes.some((c) => SPELLING_TESTS[c].test(s)) === f.present;
    }
    case 'multi_pos':
      return projectRef(index, ref, 'coca_lemma_pos').length > 1 === f.value;
    case 'multi_family':
      return projectRef(index, ref, 'bnc_family').length > 1 === f.value;
  }
}

function textMatcher(q: string, mode: TextMatchMode): (s: string) => boolean {
  const needle = searchKey(q);
  if (mode === 'exact') return (s) => searchKey(s) === needle;
  if (mode === 'prefix') return (s) => searchKey(s).startsWith(needle);
  return (s) => searchKey(s).includes(needle);
}

export function runQuery(ctx: QueryContext, q: LexQuery): QueryResult {
  const { index } = ctx;
  let candidates: EntityRef[];
  const inRefs = q.filters?.filter((f): f is Extract<QueryFilter, { type: 'in_refs' }> => f.type === 'in_refs') ?? [];
  if (inRefs.length) {
    // Intersect all in_refs sets after projecting them onto the query kind.
    let set: Set<EntityRef> | null = null;
    for (const f of inRefs) {
      const projected = new Set(projectRefs(index, f.refs, q.kind));
      const prev: Set<EntityRef> | null = set;
      set = prev === null ? projected : new Set<EntityRef>([...prev].filter((r: EntityRef) => projected.has(r)));
    }
    candidates = [...(set ?? [])];
  } else if (q.text && q.text.mode === 'exact' && q.kind === 'form') {
    candidates = index.findFormsBySearchKey(q.text.q);
  } else {
    candidates = index.listRefs(q.kind);
  }

  const match = q.text ? textMatcher(q.text.q, q.text.mode) : null;
  const filters = q.filters?.filter((f) => f.type !== 'in_refs') ?? [];
  const matched = candidates.filter(
    (ref) => (!match || match(primarySpelling(index, ref))) && filters.every((f) => matchFilter(ctx, ref, f))
  );

  const sorts = q.sort ?? [{ by: 'spelling', dir: 'asc' }];
  const keyCache = new Map<EntityRef, (number | string | null)[]>();
  const keysOf = (ref: EntityRef) => {
    let k = keyCache.get(ref);
    if (!k) {
      k = sorts.map((s) => (s.by === 'metric' ? index.metricValue(ref, s.metric) : primarySpelling(index, ref)));
      keyCache.set(ref, k);
    }
    return k;
  };
  matched.sort((a, b) => {
    const ka = keysOf(a);
    const kb = keysOf(b);
    for (let i = 0; i < sorts.length; i++) {
      const va = ka[i];
      const vb = kb[i];
      if (va === vb) continue;
      if (va === null) return 1; // missing last regardless of direction
      if (vb === null) return -1;
      const cmp = typeof va === 'number' ? va - (vb as number) : (va as string).localeCompare(vb as string);
      if (cmp !== 0) return sorts[i].dir === 'asc' ? cmp : -cmp;
    }
    const sa = primarySpelling(index, a);
    const sb = primarySpelling(index, b);
    return sa < sb ? -1 : sa > sb ? 1 : a < b ? -1 : a > b ? 1 : 0;
  });

  const aggregates: AggregateValue[] = (q.aggregates ?? []).map((agg) => {
    if (agg.op === 'sum' && METRICS[agg.metric].targetKind !== q.kind) {
      throw new QueryError(
        'aggregate_requires_native_metric',
        `sum(${agg.metric}) is only allowed on ${METRICS[agg.metric].targetKind} queries (lifted values would double count)`
      );
    }
    let value: number | null = null;
    let present = 0;
    for (const ref of matched) {
      const v = index.metricValue(ref, agg.metric);
      if (v === null) continue;
      present++;
      if (agg.op === 'sum') value = (value ?? 0) + v;
      else if (agg.op === 'min') value = value === null ? v : Math.min(value, v);
      else if (agg.op === 'max') value = value === null ? v : Math.max(value, v);
    }
    return { ...agg, value: agg.op === 'count_present' ? present : value };
  });

  let page = matched;
  if (q.page) {
    if (q.page.offset < 0 || q.page.limit < 0) throw new QueryError('invalid_page', 'offset/limit must be ≥ 0');
    page = matched.slice(q.page.offset, q.page.offset + q.page.limit);
  }
  return { kind: q.kind, total: matched.length, refs: page, aggregates };
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Convenience: COCA lemma+PoS records for a spelling (case-insensitive via Form hub). */
export function cocaRecordsForSpelling(index: LexicalIndex, spelling: string) {
  return projectRef(index, refs.form(spelling), 'coca_lemma_pos').map((r) => index.cocaRecords.get(r)!);
}
