/**
 * Lexical Workbench 2.0 — engine DTO builders.
 *
 * Pure functions that turn an index (+ optional learning state) into the DTOs of
 * `src/v2/contracts.ts`: rows, Form detail, Family detail. The worker and the UI never
 * assemble rows themselves, so every number crossing the boundary is a `MetricCell`
 * carrying its own metric id, label and provenance (ADR-005).
 *
 * Value semantics preserved here:
 *   - metric values come from `index.metricValue` only (documented lift rules, CONTRACTS §5.3);
 *   - a family total is read from the FAMILY ref, never lifted onto a member or a form;
 *   - `null` (not listed) stays null and is never coerced to 0;
 *   - learning status is resolved through `defaultTargetFor` + `resolveEffectiveStatus`, so a
 *     PoS row without its own record reports the inherited Form status instead of a mastery.
 */
import { formKey, kindOf, SOURCE_IDS, type EntityKind, type EntityRef, type SourceId, type TargetRef } from '../domain/ids.ts';
import { METRICS, metricDisplayLabel, type MetricId } from '../domain/metrics.ts';
import type { CetLevel } from '../domain/types.ts';
import {
  computeBncMemberWeightedCoverage,
  defaultTargetFor,
  posBreakdown,
  resolveEffectiveStatus,
  type EffectiveStatus,
  type LearningStateReader,
} from '../learning/model.ts';
import type {
  EntityRowDTO,
  FamilyDetailDTO,
  FormDetailDTO,
  MetricCell,
  RowBadge,
  RowsPage,
  RowsRequest,
} from '../contracts.ts';
import type { LexicalIndex } from './lexicalIndex.ts';
import { projectRef, runQuery, type QueryContext } from './query.ts';

/** Reader used when no learning state is synchronised: every target is "unrated". */
const NO_LEARNING: LearningStateReader = { get: () => undefined, all: () => [] };

/** Kinds that denote exactly one Form; their `EntityRowDTO.formRef` is therefore known. */
const SINGLE_FORM_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>([
  'form',
  'coca_headword',
  'coca_lemma_pos',
  'bnc_member',
]);

/** Columns of the COCA headword block on a Form page (rank/sum/pos-count are all computed). */
const HW_METRICS: readonly MetricId[] = [
  'coca2020.hw_freq_sum',
  'coca2020.hw_rank',
  'coca2020.hw_best_lp_rank',
  'coca2020.hw_pos_count',
];

// ---------------------------------------------------------------------------
// Metric cells
// ---------------------------------------------------------------------------

/**
 * One number with its identity. `value` uses the lift rules of `index.metricValue`, so a
 * metric that does not apply to `ref`'s kind is `null` rather than borrowed from a neighbour.
 */
export function metricCell(index: LexicalIndex, ref: EntityRef, metric: MetricId): MetricCell {
  const def = METRICS[metric];
  return {
    metric,
    value: index.metricValue(ref, metric),
    label: metricDisplayLabel(metric),
    provenance: def.provenance,
  };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * Badges describe facts about one entity. Sources are read per Form; a badge that depends on a
 * relation is emitted only when the index actually holds that relation.
 */
export function rowBadges(index: LexicalIndex, ref: EntityRef): RowBadge[] {
  const out: RowBadge[] = [];
  const forms = formsOf(index, ref);

  // projectRef(ref, kind) returns [ref] for same-kind entities, so this covers the record itself.
  if (projectRef(index, ref, 'coca_lemma_pos').length > 1) out.push('multi_pos');
  if (projectRef(index, ref, 'bnc_family').length > 1) out.push('multi_family');

  const levels = cetLevelsOf(index, ref);
  if (levels.includes('CET4')) out.push('cet4');
  if (levels.includes('CET6')) out.push('cet6');

  if (hasCaseVariant(index, ref)) out.push('case_variant');
  if (forms.some((f) => index.candidateRelationsOf(f).length > 0)) out.push('candidate_variant');
  if (!forms.some((f) => index.sourcesOfForm(f).has('coca2020'))) out.push('not_in_coca');
  if (!forms.some((f) => index.sourcesOfForm(f).has('bnc25k'))) out.push('not_in_bnc');
  return out;
}

/** Runs the query and maps the returned page to rows; aggregates are passed through untouched. */
export function buildRows(ctx: QueryContext, req: RowsRequest): RowsPage {
  const result = runQuery(ctx, req.query);
  return {
    total: result.total,
    offset: req.query.page?.offset ?? 0,
    rows: result.refs.map((ref) => buildRow(ctx, ref, req.columns)),
    aggregates: result.aggregates,
  };
}

function buildRow(ctx: QueryContext, ref: EntityRef, columns: MetricId[]): EntityRowDTO {
  const { index } = ctx;
  return {
    ref,
    kind: kindOf(ref),
    label: index.label(ref),
    formRef: singleFormRef(index, ref),
    sources: sourcesOf(index, ref),
    metrics: columns.map((m) => metricCell(index, ref, m)),
    status: rowStatus(ctx, ref),
    badges: rowBadges(index, ref),
  };
}

/** The one Form a row denotes, or null for aggregates (families, multi-spelling entries). */
function singleFormRef(index: LexicalIndex, ref: EntityRef): EntityRef | null {
  if (!SINGLE_FORM_KINDS.has(kindOf(ref))) return null;
  return projectRef(index, ref, 'form')[0] ?? null;
}

/** Source coverage of the entity through its Form(s), in registry order. */
function sourcesOf(index: LexicalIndex, ref: EntityRef): SourceId[] {
  const present = new Set<SourceId>();
  for (const formRef of formsOf(index, ref)) for (const s of index.sourcesOfForm(formRef)) present.add(s);
  return SOURCE_IDS.filter((s) => present.has(s));
}

function rowStatus(ctx: QueryContext, ref: EntityRef): EffectiveStatus | null {
  if (!ctx.learning) return null; // nothing to resolve yet; the UI shows "—"
  const target = defaultTargetFor(ctx.index, ref);
  return target ? resolveEffectiveStatus(ctx.learning, target) : null;
}

// ---------------------------------------------------------------------------
// Form detail (word page)
// ---------------------------------------------------------------------------

/**
 * Word page for a Form: COCA headword + records in rank order, every BNC membership as its own
 * card (a form may belong to several families), CET links, and the effective Form status.
 * COCA records carry their own effective PoS status, which may be inherited from the Form.
 */
export function buildFormDetail(ctx: QueryContext, formRef: EntityRef): FormDetailDTO | null {
  const { index } = ctx;
  if (kindOf(formRef) !== 'form') return null;
  const node = index.forms.get(formRef);
  if (!node) return null;
  const reader = ctx.learning ?? NO_LEARNING;

  const coca = buildCocaSection(index, reader, formRef, node.cocaHeadwordRef);
  const bnc = node.bncMemberRefs.map((memberRef) => {
    const member = index.bncMembers.get(memberRef);
    if (!member) return null;
    const family = index.bncFamilies.get(member.familyRef);
    return {
      memberRef: member.ref,
      familyRef: member.familyRef,
      familyHeadword: family?.headword ?? member.familyRef,
      // member metrics on the membership, family metrics on the family: never mixed.
      metrics: [
        metricCell(index, member.ref, 'bnc25k.member_freq'),
        metricCell(index, member.ref, 'bnc25k.member_share_of_family'),
        metricCell(index, member.familyRef, 'bnc25k.family_total'),
        metricCell(index, member.familyRef, 'bnc25k.family_band'),
      ],
    };
  });

  const cet: FormDetailDTO['cet'] = [];
  const seenLinks = new Set<string>();
  for (const link of node.cetLinks) {
    // One row per distinct (entry, role, level, homograph) link; duplicates add nothing.
    const key = [link.entryRef, link.role, link.level, link.homographNumber ?? ''].join('\u0000');
    if (seenLinks.has(key)) continue;
    seenLinks.add(key);
    cet.push({
      entryRef: link.entryRef,
      display: index.cetEntries.get(link.entryRef)?.display ?? link.entryRef,
      role: link.role,
      level: link.level,
      homographNumber: link.homographNumber,
    });
  }

  return {
    formRef,
    key: node.key,
    surfaces: node.surfaces.map((s) => ({ source: s.source, surface: s.surface })),
    coca,
    bnc: bnc.filter((c): c is NonNullable<typeof c> => c !== null),
    bncFamilyHeaded: node.bncFamilyHeadedRef,
    cet,
    status: resolveEffectiveStatus(reader, formRef as TargetRef),
    relations: index.getRelations(formRef),
  };
}

function buildCocaSection(
  index: LexicalIndex,
  reader: LearningStateReader,
  formRef: EntityRef,
  headwordRef: EntityRef | null
): FormDetailDTO['coca'] {
  if (!headwordRef) return null;
  const headword = index.cocaHeadwords.get(headwordRef);
  if (!headword) return null;
  // posBreakdown owns the PoS → learning-target mapping (own vs inherited), so the page cannot
  // disagree with the rest of the app about which record a status belongs to.
  const records = posBreakdown(index, reader, formRef)
    .flatMap((row) => {
      const record = index.cocaRecords.get(row.lemmaPosRef);
      return record ? [{ row, record }] : [];
    })
    .sort((a, b) => a.record.rank - b.record.rank)
    .map(({ row, record }) => ({
      ref: record.ref,
      pos: row.pos,
      metrics: [
        metricCell(index, record.ref, 'coca2020.lp_rank'),
        metricCell(index, record.ref, 'coca2020.lp_freq'),
        metricCell(index, record.ref, 'coca2020.lp_share_of_headword'),
      ],
      status: row.effective,
    }));
  return {
    headwordRef: headword.ref,
    headword: headword.headword,
    hwMetrics: HW_METRICS.map((m) => metricCell(index, headword.ref, m)),
    records,
  };
}

// ---------------------------------------------------------------------------
// Family detail
// ---------------------------------------------------------------------------

/**
 * Family sheet: members in source order, each with its own family-level numbers and its Form's
 * learning status. Progress uses the documented member-weighted coverage of THIS family plus a
 * count of mastered member Forms (effective Form status, so a mastered PoS does not count).
 */
export function buildFamilyDetail(ctx: QueryContext, familyRef: EntityRef): FamilyDetailDTO | null {
  const { index } = ctx;
  if (kindOf(familyRef) !== 'bnc_family') return null;
  const family = index.bncFamilies.get(familyRef);
  if (!family) return null;
  const reader = ctx.learning ?? NO_LEARNING;

  const members = family.memberRefs
    .map((memberRef) => index.bncMembers.get(memberRef))
    .filter((m): m is NonNullable<typeof m> => m !== undefined)
    .map((m) => {
      const form = index.forms.get(m.formRef);
      const otherFamilies: EntityRef[] = [];
      for (const siblingRef of form?.bncMemberRefs ?? []) {
        const sibling = index.bncMembers.get(siblingRef);
        if (sibling && sibling.familyRef !== familyRef && !otherFamilies.includes(sibling.familyRef)) {
          otherFamilies.push(sibling.familyRef);
        }
      }
      const cetLevels: CetLevel[] = [];
      for (const link of form?.cetLinks ?? []) if (!cetLevels.includes(link.level)) cetLevels.push(link.level);
      return {
        memberRef: m.ref,
        formRef: m.formRef,
        form: m.form,
        memberFreq: m.frequency,
        share: index.getObservation('bnc25k.member_share_of_family', m.ref),
        otherFamilies,
        cocaHeadwordRef: form?.cocaHeadwordRef ?? null,
        cetLevels,
        status: resolveEffectiveStatus(reader, m.formRef as TargetRef),
      };
    });

  const distinctForms = [...new Set(members.map((m) => m.formRef))];
  const formsMastered = distinctForms.filter(
    (formRef) => resolveEffectiveStatus(reader, formRef as TargetRef).status === 'mastered'
  ).length;

  return {
    familyRef,
    headword: family.headword,
    band: family.band,
    totalFrequency: family.totalFrequency,
    members,
    progress: {
      formsMastered,
      formsTotal: distinctForms.length,
      weighted: computeBncMemberWeightedCoverage(index, reader, { familyRef }),
    },
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function formsOf(index: LexicalIndex, ref: EntityRef): EntityRef[] {
  return kindOf(ref) === 'form' ? (index.forms.has(ref) ? [ref] : []) : projectRef(index, ref, 'form');
}

/** CET levels attached to the entity: the entry's own level, or every level on its Forms. */
function cetLevelsOf(index: LexicalIndex, ref: EntityRef): CetLevel[] {
  const levels: CetLevel[] = [];
  const push = (l: CetLevel) => {
    if (!levels.includes(l)) levels.push(l);
  };
  if (kindOf(ref) === 'cet_entry') {
    const entry = index.cetEntries.get(ref);
    if (entry) push(entry.level);
    return levels;
  }
  for (const formRef of formsOf(index, ref)) {
    for (const link of index.forms.get(formRef)?.cetLinks ?? []) push(link.level);
  }
  return levels;
}

/** True when the entity's printed spelling differs from its lowercase Form key (TRUE vs true). */
function hasCaseVariant(index: LexicalIndex, ref: EntityRef): boolean {
  const printed: (string | undefined)[] = (() => {
    switch (kindOf(ref)) {
      case 'form':
        return (index.forms.get(ref)?.surfaces ?? []).map((s) => s.surface);
      case 'coca_headword':
        return [index.cocaHeadwords.get(ref)?.headword];
      case 'coca_lemma_pos':
        return [index.cocaRecords.get(ref)?.headword];
      case 'bnc_family':
        return [index.bncFamilies.get(ref)?.headword];
      case 'bnc_member':
        return [index.bncMembers.get(ref)?.form];
      case 'cet_entry':
        return (index.cetEntries.get(ref)?.links ?? []).map((l) => l.surface);
    }
  })();
  return printed.some((s) => s !== undefined && s !== formKey(s));
}
