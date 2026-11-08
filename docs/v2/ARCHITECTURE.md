# Lexical Workbench 2.0 — Architecture

Status: **frozen for implementation** (2026-11-08). Changes to anything marked *normative* require an
ADR amendment in this file and an entry in `IMPLEMENTATION_PLAN.md`.

Companion documents: `CONTRACTS.md` (TypeScript contracts), `DATA_AUDIT.md` (facts and numbers),
`PRODUCT_SPEC.md` (workspaces), `IMPLEMENTATION_PLAN.md` (tasks).

Reference implementation: `src/v2/**` (engine, adapters, learning model) with real-data tests in
`src/v2/tests/`.

---

## 1. Diagnosis of v1

| # | Question | Finding | Consequence for v2 |
| --- | --- | --- | --- |
| 1 | Does `LexiconWordItem` mix layers? | Yes. One object holds the spelling, the first BNC family (`familyId`, `familyFrequency`, `band`), the per-form BNC count (`formFrequency`), a match verdict (`matchType`), CET entry references, and derived flags (`isCet6Only`). Layers: orthography, family membership, two different frequency metrics, CET syllabus and alignment heuristics. | Split into source entities + Form hub + observation columns. |
| 2 | Parsing / families / alignment coupling | `buildLexiconDatabase` parses CET, parses BNC, builds the word map, runs heuristic variant fallback (sibling spelling), computes family CET counts and diagnostics in one 400-line function. Adding COCA would require editing it. | One adapter per source → `LexicalIndex` composition; alignment is a separate read-only report. |
| 3 | Lower-cased spelling as sole ID | `UserWordRecord.wordId`, `ActivityLogEntry.wordId`, `WordCollection.wordIds`, `selectedWordId`, analytics maps, CET entry coverage (`f.toLowerCase()` lookups) all key on `normalized`. Family ids depend on line index. | Typed refs (`f:`, `coca2020:lp:`, `bnc25k:fam:` …). Lower-case spelling survives only as the *Form key*, explicitly an orthographic identity. |
| 4 | Filters, sort and learning weights | `filterAndSortWords` filters on `formFrequency`/`familyFrequency`/`band` of the *first* family; `computeStudyPriorityScore` mixes CET bonuses, band bonuses, `log10(formFrequency)` and a stop-word list into an unexplained score. | Query protocol with metric ids; planner strategies with explicit, per-factor reasons. |
| 5 | Learning granularity | One record per lower-case spelling; collections store spellings. No PoS level; families have no own state (good). | Targets = Form (default) or lemma+PoS (refinement). |
| 6 | Statistic risks | (a) `parseBncCoca` would assign the family **total** to an absent headword (0 cases in shipped data; latent). (b) Duplicate members are **summed**. (c) Multi-family forms report only the first family's numbers. (d) "Corpus-weighted coverage" sums BNC form counts with mastery but the label does not say BNC or form level. (e) Band coverage counts forms per band but a form appears in each family it belongs to. (f) README's "189 CET forms not in BNC" is an undercount of the real 206 (see DATA_AUDIT §5.4). | Observation registry with provenance labels; sets not counters; native-unit-only sums. |
| 7 | Components | `ExploreView` 1,569 lines, `CollectionsAndPlannerView` 1,031, `WordFamilyView` 992, `App.tsx` 1,150 with 18 direct DB calls. All derive data inline from `LexiconWordItem`. Worth keeping: CET token expansion (`expandCetMemberToken`, heavily tested), RFC-4180 CSV utilities (`splitCsvRecords`, `parseCsvLine`, `escapeCsvField`), dictionary URL templates, keyboard model (↑↓, Shift range select, 1–5 status keys), PWA setup, custom dataset validation idea. | Rebuild UI in `src/app/` against the engine; reuse those utilities. |
| 8 | Decisions that affect everything | Entity identity, Form key normalisation, metric ids/units, learning target shape, collection content, worker boundary. | Fixed in ADR-001…011 below. |

---

## 2. Options considered

### Option A — Canonical Lexical Entity
One normalised lexeme table (lemma + PoS + sense placeholder); every source is mapped onto it.

- (+) Single list for the UI; intuitive "word" page.
- (−) Requires decisions our sources cannot support: BNC members have no PoS; CET homographs are
  not mapped to PoS; inflections (went) have no lemma link in any source. We would have to *invent*
  mappings or create placeholder lexemes, i.e. the "empty entity" problem.
- (−) Every new source forces a re-mapping of the canonical table; mapping errors silently corrupt
  statistics.

### Option B — Source-Aware Entities & Observations
Each source keeps its own units (COCA lemma+PoS, BNC family/member, CET entry); a unified view is
computed from explicit mappings.

- (+) Faithful to sources; every number traceable to a source unit; new sources are additive.
- (−) Without a shared key, cross-source queries need N×N mappings.

### Option C (chosen) — Source-aware entities joined by an orthographic Form hub
Option B plus **one** deterministic shared entity: the **Form**, keyed by the normalised spelling.
Every source unit that *has a spelling* links to exactly one Form. All cross-source questions are
answered by hopping `source unit → Form → other source unit`. Linguistic identity claims (lexeme,
sense, inflection) are **not** made by the core; they may be added later as *sourced relations*.

Why C fits: three sources, ~95k forms, ~160k source units → comfortably in-memory; the only
cross-source fact we can verify is spelling identity, which the Form hub encodes exactly; extensions
(new corpora, lemmatisation tables, dictionaries with senses) plug in as new adapters + relations
without changing existing ids.

---

## 3. Domain entities (normative)

| Entity | Definition | Identity | Stable? | Kind |
| --- | --- | --- | --- | --- |
| **Form** | An orthographic string after Form-key normalisation (§4). Carries no meaning or PoS. Hub that records which source units use the spelling and how each source printed it (`surfaces`). | `f:<formKey>` | Yes, as long as the spelling exists in any source | Computed hub entity |
| **COCA headword** (`coca_headword`) | One object of `coca_freq.json`: the source's grouping of lemma+PoS records under one printed headword. | `coca2020:hw:<headword as printed>` | Yes | Source entity |
| **COCA lemma+PoS record** (`coca_lemma_pos`) | One `{PoS, Rank, Freq}` row. The source-defined *lemma+PoS unit*. **Not** a dictionary lexeme (see §3.1). | `coca2020:lp:<headword>|<PoS>` | Yes | Source entity |
| **BNC family** (`bnc_family`) | One line of the Nation list: headword, band, official total, members. A *lexical group* defined by the source. | `bnc25k:fam:<family headword>` | Yes (headwords unique, audited) | Source entity |
| **BNC member** (`bnc_member`) | Membership slot "form X belongs to family Y with count n". Frequency belongs to the slot, not to the form. | `bnc25k:mem:<family headword>|<form>` | Yes | Source entity (relation-with-data) |
| **CET entry** (`cet_entry`) | One syllabus line (e.g. `able ability`, `colo(u)r`, `like¹`). A lexical group defined by the syllabus. | `cet2016:ent:<headword display incl. homograph mark>` | Yes (display unique, audited) | Source entity |
| CET form link | Entry → Form with role (headword/derivative/variant), level, homograph number, expansion rule. | (entryRef, formRef) | Yes | Source fact (attribute of entry) |
| **Observation** | `(metric id, entity ref) → number`. Metric defines source, unit, provenance. | (metric, ref) | Recomputed from sources | Stored in columns |
| **Lexical relation** | Typed edge with provenance `source` / `computed` / `candidate`. Generated from adjacency on demand. | (type, from, to) | Derived | Not persisted |
| **Learning target** | What a user marks: a Form (`f:`) or a lemma+PoS (`lp:<formKey>|<pos>`). | the ref string | Yes | User-data key |
| **Learning record / event** | User state per target; append-only event log. | target / auto id | Yes | User data |
| **Collection** | Static list of targets or a saved dynamic query. | uuid | Yes | User data |

Query/display aggregates (no own identity, never stored): *Word page*, family progress, CET entry
progress, headword PoS breakdown, coverage figures, Venn regions.

### 3.1 Answers to the modelling questions

**A. Same spelling, different PoS (`work`).** One Form `f:work`; one COCA headword `coca2020:hw:work`;
two COCA records `…lp:work|verb` (rank 115) and `…lp:work|noun` (rank 207). A COCA lemma+PoS is a
*source unit*: it merges senses and is defined by COCA's tagger/lemmatiser (e.g. `running` has
adjective and noun records but its verbal uses are counted under `run`). We therefore never call it a
Lexeme. If a lexicon source is added later, its lexemes become a new entity kind with *sourced*
`corresponds_to` relations to COCA records.

**B. Same headword, different spellings.**
- `ability`/`abilities`: two Forms. `abilities` is not a COCA headword (COCA is lemmatised), so it has
  no COCA observation. Their relationship is the BNC source fact "both are members of family `able`".
- UK/US (`color`/`colour`): two Forms; related only by source facts (BNC family `colour` contains both;
  CET entry `colo(u)r` links both). No synthesised spelling-variant relation.
- Case (`May`/`may`, `TRUE`): one Form (`f:may`, `f:true`) — case-folding is part of the Form key;
  the printed spellings are preserved per source in `FormNode.surfaces` and in source entities.
  Distinct *meanings* (month vs modal) are not Form-level facts; they surface through CET entries
  (`May` and `may` are two entries) and COCA PoS (`may` noun vs verb). See ADR-002.

**C. Multiple memberships (`grannies`).** Two `BncMember` entities:
`bnc25k:mem:grandfather|grannies` (17) and `bnc25k:mem:granny|grannies` (45). The Form lists both.
No "primary family". Lift rules (CONTRACTS §5.3) define single-number views (max member freq,
min band) and UIs show a multi-family badge.

**D. Family ↔ lemma.** A BNC member is a *form*. It reaches COCA only if the same Form is a COCA
headword (`work` ∈ work → `coca2020:hw:work`). `went` ∈ go has no COCA headword; it is **not** linked to
`go`'s record. Projection `bnc_family → coca_headword` returns the COCA headwords among the family's
member spellings (for `go`: go, going, gone, goer …), which is exact and explainable.

**E. Senses.** No sense entities, no empty placeholders. Personal notes and tags on targets cover
user-defined sense memos. Future sense data arrives as a new adapter (`sense` kind with ids from that
source) plus sourced relations to COCA records — additive, no id changes (ADR-008).

**F. IDs.** Built from source spellings + source-defined keys (PoS label, family headword, CET display).
Never from line numbers, array positions, ranks or frequencies. Re-ordering or re-ranking a source file
keeps ids. Separator `|` is reserved and validated (no source spelling contains it — audited).

**G. Viewing a "headword".** The Word page is an **aggregate view keyed by a Form**. It shows, in
labelled sections, the source entities attached to that Form (COCA headword + records, BNC memberships
and families, CET entries), the user's targets for the Form and its PoS, and candidate relations. Every
number on it carries its metric label. There is no "Word" entity.

---

## 4. Identifier strategy (normative)

- Form key: `surface.normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase()`. Keeps diacritics,
  hyphens, apostrophes, slashes, ampersands. (`formKey` in `src/v2/domain/ids.ts`.)
- Search key: Form key with combining marks stripped. Used only for search and candidate detection.
- Ref prefixes: `f:`, `coca2020:hw:`, `coca2020:lp:`, `bnc25k:fam:`, `bnc25k:mem:`, `cet2016:ent:`,
  learning target `lp:`. Build with `refs.*`; parse with `parseRef`/`kindOf`. **Never** concatenate by
  hand in feature code.
- Source unit refs keep the source's printed spelling (`coca2020:lp:TRUE|adjective`); Form refs are
  folded (`f:true`); lemma+PoS targets are folded (`lp:true|adjective`) so learning state is stable
  across case changes in source files. `targetEntityRef()` maps a target back to the current record.
- New sources: prefix `<sourceId>:<kind>:`; source id includes edition when editions can coexist
  (e.g. `coca2020`, future `coca2025`).

---

## 5. Relations

| Type | Provenance | Meaning |
| --- | --- | --- |
| `coca_headword_has_record` | source | COCA object contains this PoS row |
| `bnc_family_has_member` | source | family line lists this form |
| `cet_entry_has_form` | source | syllabus line yields this spelling (role, level) |
| `spelling_exact` / `spelling_casefold` | computed | source unit's printed spelling equals / case-folds to the Form key |
| `candidate_diacritic_variant` | candidate | forms equal after removing diacritics (cafe/café) |
| `candidate_hyphen_variant` | candidate | hyphenated form equals another form without hyphens (e-mail/email) |

Rules: relations are generated from adjacency (`LexicalIndex.getRelations`) — not materialised.
Candidates are shown in Data Studio and as hints; they never affect statistics, projections or
learning inheritance. Future sourced relations (`inflection_of`, `spelling_variant_of`,
`corresponds_to`) must name their source adapter.

---

## 6. Observations and statistical semantics (normative)

### 6.1 Model

An observation is `(MetricId, EntityRef) → number`. Each `MetricDefinition` states source, target
kind, unit (`occurrences | rank | band | ratio | count`), provenance (`official | derived`), label,
direction, tie rule and meaning of "missing". Storage is columnar: one `Map<ref, number>` per metric
(`ObservationStore`). This keeps lookups O(1), sorting cheap, and adding a corpus = adding metric ids.

Registered metrics (`src/v2/domain/metrics.ts`):

| Metric | Prov. | Target | Meaning |
| --- | --- | --- | --- |
| `bnc25k.member_freq` | official | bnc_member | per-form count printed in a family line |
| `bnc25k.family_total` | official | bnc_family | official family Total frequency |
| `bnc25k.family_band` | official | bnc_family | Nation band 1–25 (ordinal) |
| `bnc25k.member_share_of_family` | derived | bnc_member | member_freq / family_total |
| `coca2020.lp_freq` | official | coca_lemma_pos | official Freq |
| `coca2020.lp_rank` | official | coca_lemma_pos | official Rank (unique) |
| `coca2020.lp_share_of_headword` | derived | coca_lemma_pos | lp_freq / hw_freq_sum |
| `coca2020.hw_freq_sum` | derived | coca_headword | Σ listed lp_freq |
| `coca2020.hw_rank` | derived | coca_headword | ordinal by hw_freq_sum |
| `coca2020.hw_best_lp_rank` | derived | coca_headword | min official lp_rank |
| `coca2020.hw_pos_count` | derived | coca_headword | number of listed PoS |

### 6.2 Missing vs zero
`null` = the source does not list the unit (COCA beyond 60k, form not in a family). `0` only when the
source prints 0 (7,947 BNC slots). Code must never coerce `null → 0` in storage, sorting (missing
always last) or display ("—" with a tooltip "not listed by <source>").

### 6.3 Ranks and ties
- Official ranks are used as printed (COCA has no ties).
- `hw_rank`: sort by `hw_freq_sum` desc, then `hw_best_lp_rank` asc → unique, deterministic ordinal.
- Any future derived rank must define a deterministic tie-break; dense/competition ranks are not used.

### 6.4 Denominators and normalisation
The files contain no corpus sizes. Therefore: no per-million values, no cross-corpus ratios. Shares are
"of listed records" (COCA) or "of family total" (BNC). A future metric `…_per_million` may be added
only with a sourced corpus size stored in `SourceInfo`.

### 6.5 The eight statistical questions
1. **Top-N records vs headwords.** "COCA Top N" in UI is either *records with lp_rank ≤ N* (unit
   lemma+PoS) or *headwords with hw_rank ≤ N* (unit headword). Top 1,000 records = 898 headwords.
   Every rank filter names its metric, so the unit is explicit.
2. **Multi-PoS headword total** = Σ of its *listed* records (`hw_freq_sum`, derived, lower bound).
3. **Headword composite rank** = `hw_rank` with the tie-break above; labelled “（计算）”.
4. **BNC band × COCA rank** = cross-tab of two ordinals on the Form unit (band = min over families
   containing the spelling; rank bucket = `hw_rank` bucket). Cells are counts of Forms; no frequencies
   are combined. Implemented in `computeAlignmentReport().crosstabHwRankByBncBand`.
5. **BNC ÷ COCA is meaningless**: different corpora, different units (word form within a family vs
   lemma+PoS), unknown denominators, different time spans. No API exposes such a ratio.
6. **Set comparison without double counting**: `compareRefSets` projects both sides to one kind before
   comparing; `sum` aggregates are allowed only on metrics native to the query kind (a lifted
   `hw_freq_sum` on lemma+PoS rows would be counted once per PoS → `QueryError`).
7. **Frequency-weighted coverage** (all derived, labelled):
   - `coverage.coca_lp_weighted`: scope = COCA records with `lp_rank ≤ R`; numerator Σ `lp_freq` of
     records whose *effective* status ∈ S (default {mastered}); denominator Σ `lp_freq` in scope. Records
     are disjoint, so no double counting. Effective status of a record = own lp target record, else its
     Form target record (inheritance), else unrated.
   - `coverage.bnc_member_weighted`: scope = memberships of families in bands [a,b] (or one family);
     numerator Σ `member_freq` whose Form status ∈ S; denominator Σ `member_freq` in scope. Family
     totals are not used (they equal Σ members in this file, but the definition must not depend on it).
   - Count-based progress (forms mastered / forms in scope) is reported alongside, never mixed.
8. **No mislabelled metrics**: UI labels come only from `metricDisplayLabel(id)`; derived metrics end in
   “（计算）” (asserted by test). Charts must show the metric id's label and source in legends/tooltips.

---

## 7. Personal learning model (normative)

- **Targets**: `f:<formKey>` (default) and `lp:<formKey>|<pos>` (refinement, PoS from COCA records of
  that Form). Families, CET entries and COCA headwords are not targets; acting on them maps through
  `defaultTargetFor` (headword → Form; record → lp target; member → Form; entry → its headword Form;
  family → explicit member selection required).
- **Statuses**: `unrated | queued | learning | mastered | deferred` (unchanged five states).
- **Independence**: records never cascade on write. **Inheritance on read**: an lp target without its own
  record takes the Form's status (`origin: 'inherited'`); the UI shows inherited values muted.
- **Scenarios**: work = learning (`f:work`); work-noun mastered (`lp:work|noun` own); work-verb shows
  learning (inherited); `worked` managed as `f:worked`; family `work` progress = aggregate of member
  Form statuses (1/15 members, 12,474/168,597 member-weighted) — tested in `engine.test.ts`.
- **Display**: Word page header shows the Form status; a PoS strip shows one chip per COCA PoS with
  own/inherited styling. A "mixed" marker appears when any own lp status differs from the Form status.
- **Study events**: `studyCount`, `lastStudiedAt` on the record; every change appends a
  `LearningEvent` (`before`/`after` of changed fields, `batchId` for bulk operations → undo by batch).
- **Collections**: static collections store `TargetRef[]` (what the user will study); dynamic
  collections store a `LexQuery` (re-evaluated, then mapped with `defaultTargetFor`).
- **Statistics/planning** read through `LearningStateReader` + `resolveEffectiveStatus`; they never
  read storage directly.

---

## 8. Runtime, storage and indexes

### 8.1 Static lexical data (ADR-007)
Built in memory from the three source texts by the adapters into a `LexicalIndex` inside a **Web
Worker**. Measured on the real files (Node 22, this machine): parse + build ≈ 0.9 s, alignment
report ≈ 0.4 s, a sorted 95k-form query ≈ 90 ms, a `contains` text search ≈ 70 ms, heap ≈ 200 MB
after build (includes source strings). Browsers should be within 2–3× of this. The main thread talks to the worker through a small
RPC (`runQuery`, `getEntityDetail`, `projectRefs`, `compareRefSets`, `getAlignmentReport`,
`computeCoverage`) and receives DTOs (refs + rows), never the index itself.

Optional cache: the serialised snapshots may be stored in IndexedDB keyed by a content hash of the
source texts; must produce byte-identical query results to a fresh build (test).

### 8.2 User database `LexicalWorkbenchDB_v2` (Dexie)

| Table | Primary key | Indexes | Content |
| --- | --- | --- | --- |
| `learningRecords` | `target` | `status, updatedAt, *tags` | `LearningRecord` |
| `learningEvents` | `++id` | `target, at, batchId, type` | `LearningEvent` |
| `collections` | `id` | `kind, updatedAt` | `Collection` (static targets or dynamic query) |
| `customSources` | `sourceId` | `updatedAt` | raw replacement text for a source |
| `settings` | `key` | — | UI prefs (density, dictionaries, last workspace) |

The v1 database (`LexicalWorkbenchDB_v1`) is not migrated (project not in production use).

### 8.3 Index structures in `LexicalIndex`
Maps by ref for each entity kind; Form adjacency (`cocaHeadwordRef`, `bncMemberRefs`,
`bncFamilyHeadedRef`, `cetLinks`); lazy search-key index; columnar observations. Query evaluation is a
linear scan with memoised sort keys — sufficient for ≤100k rows (≈ 90 ms for a sorted full-form
query). If a workspace needs faster text search, add a prefix index inside `engine/` without
changing contracts.

---

## 9. Module boundaries (normative)

```text
src/v2/domain     ids, types, metrics            ← no imports from other v2 folders
src/v2/sources    one adapter per source         ← domain (cetAdapter temporarily reuses src/data/parser.ts CET expansion)
src/v2/engine     LexicalIndex, query, alignment ← domain, sources (types), learning (status filter)
src/v2/learning   pure learning model            ← domain, engine (types)
src/v2/node       Node-only loaders (tests, scripts) — never imported by browser code
src/v2/index.ts   public surface for app code
--- to be built (see IMPLEMENTATION_PLAN) ---
src/v2/worker     browser loader + RPC
src/v2/store      Dexie v2 + LearningStateReader implementation
src/v2/planning   study strategies (pure)
src/v2/insights   statistics builders (pure)
src/app/**        new React shell and workspaces; imports only src/v2/index.ts, worker client, store
src/legacy (=current src/components, src/data, src/db) — frozen; deleted in the switch-over task
```

Rules: UI never computes frequencies, matches spellings or filters lists itself; it calls the query
protocol. Pure modules (`domain`, `sources`, `engine`, `learning`, `planning`, `insights`) have no React,
DOM or Dexie imports and are tested with `node:test` on real data.

---

## 10. Architecture Decision Records

**ADR-001 Source-aware entities joined by an orthographic Form hub.** Accepted. Option A rejected:
needs unsupported lexeme/PoS/inflection mappings and placeholder entities. Pure B rejected: N×N
mappings. Consequence: "word" pages are aggregates; cross-source facts are spelling facts.

**ADR-002 Form key = NFC + trim + whitespace collapse + lowercase; diacritics/hyphens kept.** Accepted.
Case-folding is required (COCA prints TRUE/FALSE; CET prints May, Internet). Cost: `May`/`may` share a
Form; distinctions survive in CET entries, COCA PoS and printed surfaces. Diacritic/hyphen folding
rejected because it would merge 92 + 525 pairs without evidence; they become candidates.

**ADR-003 IDs from source keys, typed prefixes, no positions/ranks.** Accepted.

**ADR-004 No generic `frequency` field; metric registry + columnar observations; null ≠ 0.** Accepted.

**ADR-005 Derived metrics are explicit, labelled, deterministic; sums only on native metrics; lift rules
are fixed (CONTRACTS §5.3) and never lift family totals to forms.** Accepted.

**ADR-006 Learning targets = Form (default) + lemma+PoS (refinement); no cascade; read-time
inheritance; families/entries aggregate only.** Accepted. Rejected: family-level status (would
contradict partial mastery), sense-level targets (no data), BNC-member-level targets (same form in
two families would split one word's state).

**ADR-007 Static data rebuilt in a Web Worker from source texts; IndexedDB only for user data, custom
sources and an optional cache.** Accepted. Rejected: persisting the lexical graph as Dexie tables
(slow bulk writes, schema churn, duplicate truth).

**ADR-008 No sense entities until a sense-bearing source exists.** Accepted.

**ADR-009 No inferred morphology (went→go, abilities→ability) in the core.** Accepted. A future
lemmatisation source may add `inflection_of` relations with provenance `source`.

**ADR-010 v2 UI is built in parallel (`src/app`), legacy UI frozen, then removed in one switch-over
task.** Accepted. Avoids half-migrated components.

**ADR-011 Static collections hold `TargetRef[]`; dynamic collections hold `LexQuery`.** Accepted.
Adding a family or CET entry to a collection expands to explicit targets (UI confirms the member
list) — the stored meaning never changes when sources change.

---

## 11. Extension strategy

- **New corpus** (e.g. COCA 2025, SUBTLEX): new `SourceId`, adapter, entity kinds if units differ,
  metric ids `<source>.<metric>`; Form links make it queryable immediately. No change to existing ids.
- **Lemmatisation / variant tables**: adapter producing sourced relations; projections may then offer an
  opt-in hop `form → lemma via <source>`; statistics must name it.
- **Dictionary / senses**: new kinds (`<src>:sense:<id>`), sourced `corresponds_to` relations to COCA
  records; learning targets may later add `sense:` refs with inheritance from lp targets.
- **Performance**: if scans exceed budget, add per-kind sorted columns or prefix trees inside `engine/`;
  the `LexQuery` contract stays.
