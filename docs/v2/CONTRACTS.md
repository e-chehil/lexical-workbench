# Lexical Workbench 2.0 — Technical Contracts

This file explains the contracts that **exist in code**. The code is the source of truth; if this file
and the code disagree, the code wins and this file must be fixed in the same commit.

| Contract | File | Status |
| --- | --- | --- |
| Identifiers, refs | `src/v2/domain/ids.ts` | implemented, tested |
| Domain entities, sources, diagnostics | `src/v2/domain/types.ts` | implemented, tested |
| Metric registry, observation store | `src/v2/domain/metrics.ts` | implemented, tested |
| Source adapters | `src/v2/sources/*.ts` | implemented, tested |
| LexicalIndex (lookup, lift rules, relations) | `src/v2/engine/lexicalIndex.ts` | implemented, tested |
| Query protocol, projection, set comparison | `src/v2/engine/query.ts` | implemented, tested |
| Alignment report | `src/v2/engine/alignment.ts` | implemented, tested |
| Learning model, coverage | `src/v2/learning/model.ts` | implemented, tested |
| DTOs, worker API, store, planner | `src/v2/contracts.ts` | **types only** — implemented by plan tasks |
| Public surface | `src/v2/index.ts` | app code imports only from here |

---

## 1. Identifiers (`ids.ts`)

```ts
type SourceId = 'coca2020' | 'bnc25k' | 'cet2016';
type EntityKind = 'form' | 'coca_headword' | 'coca_lemma_pos' | 'bnc_family' | 'bnc_member' | 'cet_entry';
type EntityRef = string;                       // see prefixes below
type TargetRef = `f:${string}` | `lp:${string}`;

formKey(surface)    // NFC, trim, collapse spaces, lowercase — identity of a Form
searchKey(surface)  // formKey without diacritics — search/candidates ONLY
refs.form(s) refs.cocaHeadword(h) refs.cocaLemmaPos(h, pos) refs.bncFamily(h)
refs.bncMember(familyHeadword, form) refs.cetEntry(display) refs.formTarget(s) refs.lemmaPosTarget(s, pos)
parseRef(ref) -> { kind, key, parts }     kindOf(ref) -> EntityKind
```

| Kind | Ref example |
| --- | --- |
| form | `f:true` |
| coca_headword | `coca2020:hw:TRUE` |
| coca_lemma_pos | `coca2020:lp:TRUE|adjective` |
| bnc_family | `bnc25k:fam:go` |
| bnc_member | `bnc25k:mem:go|went` |
| cet_entry | `cet2016:ent:like¹` |
| learning target | `f:work`, `lp:work|noun` |

Rules: always build refs with `refs.*`; `|` is reserved (builders throw if a key part contains it).

## 2. Domain entities (`types.ts`)

Key interfaces (abbreviated; see file for comments):

```ts
interface CocaLemmaPosRecord { ref; headwordRef; formRef; headword: string; pos: CocaPos; rank: number; freq: number }
interface CocaHeadword       { ref; formRef; headword: string; lemmaPosRefs: EntityRef[] /* rank asc */ }
interface BncFamily          { ref; formRef; headword; band: number; bandLabel; totalFrequency; memberFrequencySum; headwordIsMember: boolean; memberRefs }
interface BncMember          { ref; familyRef; formRef; form: string; frequency: number; isFamilyHeadword: boolean }
interface CetEntry           { ref; display; level: CetLevel; rawLine; links: CetFormLink[] }
interface CetFormLink        { entryRef; formRef; surface; rawMember; role: 'headword'|'derivative'|'variant'; level; homographNumber; expansionRule }
interface FormNode           { ref; key; surfaces: {source, surface}[]; cocaHeadwordRef|null; bncMemberRefs[]; bncFamilyHeadedRef|null; cetLinks[] }
interface LexicalRelation    { type: RelationType; from; to; provenance: 'source'|'computed'|'candidate'; source?; evidence? }
interface SourceDiagnostic   { source: SourceId|'alignment'; severity: 'error'|'warning'|'info'; code: string; message; subject? }
class SourceFormatError extends Error   // whole payload unusable
```

`CocaPos` is the closed list of the 14 labels found in the file (DATA_AUDIT §2.2). Adding a label is a
deliberate code change, not data-driven.

## 3. Source adapters

```ts
parseCocaJson(rawText: string): CocaSnapshot     // also parseCocaData(unknown)
parseBncFamilies(rawText: string): BncSnapshot
parseCetSyllabus(rawText: string): CetSnapshot
```

Adapter contract (applies to any future source):

1. Pure function of the raw text; no I/O, no globals, deterministic output order.
2. Throws `SourceFormatError` only when the payload as a whole is unusable (empty, wrong root shape,
   zero valid units). Everything else → `SourceDiagnostic` with a stable `code`; the bad unit is skipped,
   never "repaired" with invented values.
3. Emits only **source facts** (official values as printed, parsed to numbers). Derived metrics belong
   to `LexicalIndex`.
4. Keeps printed spellings verbatim; computes `formRef` with `refs.form`.
5. Duplicate units: keep the first, report the rest. Never sum duplicates.

Diagnostic codes in use: `coca.invalid_entry`, `coca.invalid_headword`, `coca.duplicate_headword`,
`coca.case_collision`, `coca.invalid_record`, `coca.unknown_pos`, `coca.invalid_number`,
`coca.duplicate_pos`, `coca.duplicate_rank`, `coca.empty_headword`, `coca.rank_gap`,
`coca.freq_rank_inversion`, `coca.uppercase_headword`, `bnc.malformed_line`, `bnc.duplicate_family`,
`bnc.unparsed_member`, `bnc.duplicate_member`, `bnc.headword_not_member`, `bnc.sum_mismatch`,
`cet.duplicate_entry_key`.

## 4. LexicalIndex (`lexicalIndex.ts`)

```ts
buildLexicalIndex({ coca?, bnc?, cet? }): LexicalIndex   // any subset of sources
index.forms / cocaRecords / cocaHeadwords / bncFamilies / bncMembers / cetEntries : Map<EntityRef, …>
index.has(ref)  index.listRefs(kind)  index.getForm(surface)  index.label(ref)
index.sourcesOfForm(formRef): Set<SourceId>
index.getObservation(metric, ref): number | null     // native value only
index.metricValue(ref, metric): number | null        // with lift rules (§5.3)
index.getRelations(ref): LexicalRelation[]
index.candidateRelationsOf(formRef)  index.findFormsBySearchKey(text)
```

## 5. Metrics and observations (`metrics.ts`)

### 5.1 Registry
`METRICS: Record<MetricId, MetricDefinition>` — see ARCHITECTURE §6.1 for the table.
`metricDisplayLabel(id)` is the **only** allowed source of user-facing metric labels.

### 5.2 Value conventions
- `null` = not listed / not applicable. `0` = printed zero. Never coerce.
- Ranks: smaller = more frequent (`largerIsMoreFrequent: false`). Bands likewise.
- Ratios are 0..1 floats; format at the UI edge.

### 5.3 Lift rules (`metricValue`) — normative

| Entity kind \ metric target | coca_headword metrics | coca_lemma_pos metrics | bnc_member metrics | bnc_family metrics |
| --- | --- | --- | --- | --- |
| form | via `cocaHeadwordRef` | null | `member_freq`: **max** over memberships; `member_share_of_family`: null | `family_band`: **min** over families containing the form as member; `family_total`: **null** |
| coca_headword | native | null | via its Form | via its Form (band only) |
| coca_lemma_pos | via its headword | native | via its Form | via its Form (band only) |
| bnc_member | via its Form | null | native | `family_band` of its family; `family_total`: null |
| bnc_family | null | null | null | native |
| cet_entry | via first link (headword) Form | null | null | via headword Form (band only) |

A family total is never shown on a form or member row as if it were that row's frequency.
Multi-membership (`grannies`) must be indicated with the `multi_family` badge wherever a lifted BNC
value is displayed.

### 5.4 Aggregates
`sum` is allowed only when `METRICS[metric].targetKind === query.kind` (else `QueryError
'aggregate_requires_native_metric'`). `min`, `max`, `count_present` are allowed on lifted values.

## 6. Query protocol (`query.ts`)

```ts
interface LexQuery {
  kind: EntityKind;
  text?: { q: string; mode: 'exact' | 'prefix' | 'contains' };   // compares searchKey(primarySpelling)
  filters?: QueryFilter[];   // AND-combined
  sort?: SortSpec[];         // default spelling asc; missing values last; final tie spelling, ref
  page?: { offset: number; limit: number };
  aggregates?: AggregateSpec[];   // computed over ALL matches, not just the page
}
type QueryFilter =
  | { type: 'metric_range'; metric; min?; max?; includeMissing? }   // uses metricValue (lift rules)
  | { type: 'metric_present'; metric; present }
  | { type: 'source_presence'; source; present }                    // via the entity's Form(s)
  | { type: 'coca_pos'; pos: CocaPos[] }                            // any linked COCA record
  | { type: 'cet_level'; levels: CetLevel[] }
  | { type: 'learning_status'; statuses; resolution?: 'own' | 'effective' }  // needs ctx.learning
  | { type: 'in_refs'; refs: EntityRef[] }                          // projected to kind; several = intersection
  | { type: 'spelling_class'; classes: SpecialSpellingClass[]; present }
  | { type: 'multi_pos'; value } | { type: 'multi_family'; value };
type SortSpec = { by: 'metric'; metric; dir } | { by: 'spelling'; dir };
interface QueryResult { kind; total; refs: EntityRef[]; aggregates: AggregateValue[] }
runQuery(ctx: { index; learning? }, q): QueryResult
```

Source scope = `source_presence` filters. A *dynamic result set* is a stored `LexQuery`; a *static
result set* is a stored ref list, re-entered via `in_refs`.

### 6.1 Projection (`projectRef`, `projectRefs`)
All cross-source hops go through the Form. Same-source structure is followed directly.

| from → to | Result |
| --- | --- |
| form → coca_headword / coca_lemma_pos | the COCA headword with this spelling / its records |
| form → bnc_member / bnc_family | memberships of the form / their families |
| form → cet_entry | entries linking this spelling |
| coca_lemma_pos → coca_headword | parent headword |
| coca_headword → coca_lemma_pos | its records |
| bnc_family → bnc_member / form | its slots / their forms |
| bnc_member → bnc_family | its family |
| cet_entry → form | all linked spellings (headword, derivatives, variants) |
| anything else | `from → form → to` |

Projection never invents morphology: `bnc25k:fam:go → coca_headword` returns only member spellings that
are COCA headwords (go, going, gone…), not `went`.

### 6.2 Set comparison
`compareRefSets(index, a, b, at)` projects both inputs to `at` and returns
`{ kind, onlyA, onlyB, both }`. Venn/overlap UIs must use it (or `computeAlignmentReport`) — never
compare raw spelling arrays.

## 7. Alignment report (`alignment.ts`)
`computeAlignmentReport(index): AlignmentReport` — unit `form`; source counts, 7 Venn regions,
pairwise intersections, case-folded matches, COCA/BNC/CET-side breakdowns, candidate pairs, Top-N
table, rank × band cross-tab (`HW_RANK_BUCKETS`). Numbers are pinned by `engine.test.ts`.

## 8. Learning (`learning/model.ts`)

```ts
type LearningStatus = 'unrated' | 'queued' | 'learning' | 'mastered' | 'deferred';
interface LearningRecord { target: TargetRef; status; tags: string[]; note: string; studyCount: number; createdAt; updatedAt; lastStudiedAt: string | null }
interface LearningEvent  { id?; at; target; type: 'status'|'study'|'tags'|'note'|'import'|'revert'; batchId: string|null; before: Partial<…>|null; after: Partial<…>; sourceLabel? }
interface LearningStateReader { get(target); all() }
defaultTargetFor(index, ref): TargetRef | null       // bnc_family → null
resolveEffectiveStatus(reader, target): { status, origin: 'own'|'inherited'|'default', from }
posBreakdown(index, reader, formRef): PosStatusRow[]
targetEntityRef(index, target): EntityRef | null      // null = orphan target (source changed)
applyStatusChange(prev, target, status, now, batchId?) -> { record, event }
computeCocaWeightedCoverage(index, reader, { maxRank?, countedStatuses? }): CoverageResult
computeBncMemberWeightedCoverage(index, reader, { minBand?, maxBand?, familyRef?, countedStatuses? }): CoverageResult
```

Persistence (`LearningStore` in `contracts.ts`) must: write record + event in one Dexie transaction;
use one `batchId` per user action; implement undo by replaying `before` values of a batch; never
delete events except via explicit "clear history".

## 9. Implemented cross-module contracts (`contracts.ts`)

- **DTOs**: `MetricCell`, `EntityRowDTO`, `RowsRequest`, `RowsPage`, `FormDetailDTO`,
  `FamilyDetailDTO`, `TargetRowDTO`. Every number crosses the boundary as a `MetricCell`
  (metric id + label + provenance), so the UI cannot mislabel it.
- **Worker API**: `LexicalEngineApi` — query, rows, project, compare, formDetail, familyDetail,
  `resolveTargets`, `insights`, alignment, syncLearning, plan.
  `resolveTargets(targets, columns?)` resolves stored `TargetRef`s to labels/status/metrics for
  Study queues and the orphan audit; a missing entity becomes `entityRef: null`, never a deletion.
  `insights(req?)` returns the global learning report; every `InsightBucket` carries the
  `LexQuery` that opens its set.
- **Store**: `LearningStore`, `TargetPatch`, `Collection` (static = `TargetRef[]`, dynamic = `LexQuery`).
- **Planner**: `StudyPlanner`, `PlanRequest`, `PlanItem`, `PlanReason`, `StrategyId`.
  `planStrategy(ctx, req)` is pure; `createEngineHandlers` registers it as the worker `plan`
  method. `coca_high_freq`, `bnc_family_completion`, `cet_syllabus`, `custom_mix`.

`setCustomSource` remains a worker control method (not part of `LexicalEngineApi`); Data Studio
persists the text and calls it through `EngineClient.setCustomSource`.


## 10. Errors and empty states

| Situation | Contract |
| --- | --- |
| Source payload unusable | `SourceFormatError`; app keeps the previous source and shows the message |
| Bad unit inside a source | skipped + `SourceDiagnostic`; Data Studio lists it |
| Unknown ref | lookups return `undefined`/`null`/`[]`; never throw (except `parseRef` on malformed strings) |
| Metric not applicable / not listed | `null` → "—" with tooltip "<source> 未收录" |
| Query misuse (sum on lifted metric, status filter without learning state, negative page) | `QueryError` with `code` |
| Empty result | `total: 0`, `refs: []`; aggregates `sum/min/max` = `null`, `count_present` = 0 |
| Orphan learning target (source changed) | kept in store; shown in Data Studio "orphan targets"; excluded from coverage |
