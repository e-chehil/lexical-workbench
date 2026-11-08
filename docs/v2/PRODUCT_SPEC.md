# Lexical Workbench 2.0 — Product Specification

Audience: implementers of `src/app/**`. Data semantics are defined in `ARCHITECTURE.md`; APIs in
`CONTRACTS.md`. This spec defines **what** each workspace does and how it is accepted. Visual styling is
left to implementers (Tailwind, existing light/dark tokens, lucide icons).

## 1. Product positioning

A local-first workbench for serious English vocabulary learners and researchers that combines three
sources — COCA 2020 lemma+PoS frequencies, Nation BNC/COCA 25k word families, CET-4/6 syllabus — into
one queryable knowledge system, and turns it into explainable study decisions. Principle: *precise data
underneath, explicit units on every number, the learner's decisions at the centre.*

## 2. Global shell and navigation

| Element | Desktop (≥ 1024 px) | Mobile (< 768 px) |
| --- | --- | --- |
| Workspace nav | Left rail: Explore · Corpus Lab · Family Atlas · Study · Insights · Data Studio | Bottom tab bar with 4 items (Explore, Study, Insights, More → Corpus Lab, Family Atlas, Data Studio) |
| Global search | `Ctrl/⌘K` or `/` opens command palette; results grouped by kind (Form, COCA headword, BNC family, CET entry) | Search icon in top bar → full-screen search |
| Detail | Right-side **Detail panel** (resizable, 380–560 px), stays open while browsing lists | Full-screen sheet pushed on a stack; back gesture returns to list with scroll restored |
| Selection & bulk actions | Row checkboxes, Shift-range, drag-select; sticky bulk bar at list bottom | Long-press enters selection mode; bulk bar slides up |
| Status keys | `1`–`5` set status of focused/selected rows (unrated, queued, learning, mastered, deferred) | Swipe row left → status menu |
| Routing | Hash routes `#/<workspace>?q=<encoded LexQuery>&ref=<EntityRef>` so every list and detail is linkable and back/forward works | same |

**Universal "Open in Explore" contract**: any count, bar, cell or list in any workspace that represents
a set of entities is clickable and opens Explore with an equivalent `LexQuery` (dynamic) or `in_refs`
(static). This is the main interaction loop of the product.

**Entity chips**: every ref is rendered as a chip showing kind icon + label (`index.label`). Clicking
opens the Detail panel for that entity; for non-Form kinds the panel shows the source entity view with
a link to its Form page.

**Metric display**: every number is a `MetricCell` rendered with its label; derived metrics carry the
“（计算）” suffix and a dotted underline; tooltip shows source, unit and definition from `METRICS`.
`null` renders as “—” with “<source> 未收录”.

## 3. Workspaces

### 3.1 Explore — 词汇探索

- **Objects**: any `EntityKind`; default view kind = `form`.
- **Main tasks**: search; filter by source/metric/PoS/CET/status; sort by any metric; inspect details;
  jump across entities; act (set status, add to collection, export).
- **Layout (desktop)**: top **Query bar** (text box + mode, kind switcher tabs: 词形 Form · COCA 词头 ·
  COCA 词性条目 · BNC 词族 · BNC 成员 · CET 词目); left **Filter panel** (collapsible facets: sources
  present/absent, COCA PoS, COCA official rank range, COCA headword rank range, BNC band range, CET level,
  learning status own/effective, spelling classes, multi-PoS, multi-family); centre **virtualised
  result table** (TanStack Virtual) with column chooser (metric ids allowed for the kind); right
  **Detail panel**. Result header shows `total` and requested aggregates.
- **Mobile**: kind switcher as horizontal chips; filters in a bottom sheet with an "Apply (n results)"
  button; list shows 2 metrics per row (user-selectable).
- **Form Detail (Word page)**: sections in fixed order — Header (surfaces per source, Form status,
  PoS strip with own/inherited chips) · COCA (headword metrics + record table with PoS, official rank,
  freq, share（计算）) · BNC memberships (one card per family: band, member freq, share（计算）, family total,
  "open family") · CET entries (display, role, level, homograph) · Relations (source / computed /
  candidate groups) · Notes & tags · External dictionaries (reuse v1 URL templates).
- **APIs**: `rows`, `query`, `formDetail`, `familyDetail`, `project`; store `apply`.
- **Acceptance**:
  1. Searching `TRUE` (exact) yields exactly the Form `true`; its page shows COCA printed `TRUE`
     adjective rank 414, BNC family `true` 1k, CET entry `true`.
  2. Form `went` shows BNC membership in `go` (45,876) and COCA section "未收录 (COCA 以词元统计)";
     no COCA number appears anywhere on it.
  3. Kind = COCA 词性条目, filter official rank ≤ 1000 → total 1,000; switching kind to COCA 词头 with the
     same scope via "project" → 898.
  4. Form `grannies` shows two membership cards and the multi-family badge in the list.
  5. Sorting by COCA headword rank puts rows without a COCA headword last in both directions.
  6. Selecting 3 rows and pressing `4` creates 3 `mastered` records and one batch event id; undo
     restores the previous states.

### 3.2 Corpus Lab — 语料实验室

- **Objects**: `coca_lemma_pos`, `coca_headword`, `form` (sets), alignment report.
- **Tasks**: browse COCA 60k by official rank; browse headwords by derived rank; PoS distribution;
  rank–frequency curve; band × rank cross-tab; Venn and set comparison.
- **Layout (desktop)**: tabbed canvas — (a) *Ranking*: table of records (rank, headword, PoS, freq,
  share（计算）) with a toggle "按词性条目 / 按词头（计算）"; (b) *Distribution*: PoS table + bar chart
  (records and freq share), rank-band table (DATA_AUDIT §2.4) and a log-log rank–freq line chart;
  (c) *Cross-analysis*: hw_rank bucket × BNC band heat table; (d) *Sets*: three-source Venn with seven
  region counts + a comparison builder (pick two saved collections/queries, pick unit, see onlyA/onlyB/both).
- **Mobile**: one tab at a time; charts stack above their tables; heat table scrolls horizontally with a
  frozen first column.
- **APIs**: `query` (with aggregates), `alignment`, `compare`.
- **Acceptance**:
  1. Ranking tab shows rank 1 `the` article 50,033,612 and rank 60,000 `dustbuster`.
  2. Toggling to 按词头 shows `the, be, to, and` as ranks 1–4 labelled “COCA 词头综合排名（计算）”.
  3. PoS table equals DATA_AUDIT §2.2 (14 rows).
  4. Venn regions equal DATA_AUDIT §5.1; clicking "COCA only (18,623)" opens Explore with that set.
  5. Heat-table cell "1–1,000 × 1k" shows 761 and opens those 761 Forms in Explore.
  6. No chart or table divides a BNC value by a COCA value.

### 3.3 Family Atlas — 词族研究

- **Objects**: `bnc_family`, `bnc_member`.
- **Tasks**: navigate 25,002 families by band / search / size; study one family's members with
  frequencies and shares; see multi-family forms; see COCA headwords and CET info per member; family
  progress.
- **Layout (desktop)**: left family list (band filter 1k–25k, sort by total / member count / progress);
  centre family sheet: header (headword, band, total, member count, progress bar = forms mastered and
  member-weighted coverage（计算）), member table (form, member freq, share（计算）, COCA headword chip +
  hw_rank（计算） if any, CET level chips, status, other-family badge); right detail panel.
  Visualisation: horizontal bar list of member shares (sorted), no inferred morphology edges.
- **Mobile**: family list → family sheet push; member table becomes cards.
- **APIs**: `query(kind:'bnc_family')`, `familyDetail`, `project`, coverage functions.
- **Acceptance**:
  1. Family `work` lists 15 members; `worked` 12,474; total 168,597.
  2. Marking `worked` mastered changes the progress to 1/15 and 12,474 / 168,597 = 7.4%（计算）.
  3. Family `grandfather` shows `grannies` with an "also in granny (6k)" link.
  4. The family total is never displayed in a member row.
  5. "Add family to collection" asks which members (default: all non-zero members not mastered/deferred)
     and stores their Form targets.

### 3.4 Study — 学习工作台

- **Objects**: learning targets, collections, plans.
- **Tasks**: maintain status at Form and PoS level; manage collections (static/dynamic) and a study
  queue; generate plans by strategy; batch operations; import/export.
- **Layout (desktop)**: left collections & queues; centre current list (targets with label, status,
  reasons, key metrics); right detail panel. Top **Planner** drawer: strategy picker, scope (any
  LexQuery from Explore), size, exclusions, mix weights; preview list with reasons; "Add to queue /
  Save as collection".
- **Strategies** (pure functions in `src/v2/planning`, all reasons are `PlanReason` with metric ids):
  - `coca_high_freq`: COCA records by official rank within scope, excluding effective mastered/deferred;
    target = Form target, or the lp target when the headword's records have differing effective statuses.
  - `bnc_family_completion`: families with ≥ 1 mastered member and ≥ 1 not-mastered member, ordered by
    family band then member freq; target = member Form.
  - `cet_syllabus`: CET entries by level (CET4 first), headword before derivatives; target = Form.
  - `custom_mix`: weighted round-robin of the above with de-duplication by target.
  - "High-frequency knowledge gap" = `coca_high_freq` with scope `lp_rank ≤ 5000` restricted to
    status unrated.
- **Mobile**: list + floating "Plan" button opening the planner as a full-screen sheet; review mode
  (one card at a time, swipe for status) is optional.
- **Export**: CSV (RFC 4180, reuse v1 utilities) and JSON with columns target, label, status, tags,
  note, studyCount, lastStudiedAt, plus requested metric cells (with labels in the header).
- **Acceptance**:
  1. `coca_high_freq` size 20, no learning data → first item `the` with reason "COCA 官方排名 #1 (article)".
  2. Marking `work` learning and `work` noun mastered: planner never proposes `lp:work|noun`; it may
     propose `lp:work|verb` with reason showing rank 115.
  3. Static collection stores TargetRefs; reloading the app restores identical members.
  4. Dynamic collection "CET6 ∧ COCA hw_rank ≤ 5000 ∧ not mastered" updates when a member becomes mastered.
  5. Every plan item has ≥ 1 reason and every reason names a metric or a source fact.

### 3.5 Insights — 学习洞察

- **Objects**: aggregates over learning state.
- **Tasks**: progress per unit (Forms, COCA headwords, COCA records, BNC families, CET entries); COCA
  rank-band progress; BNC band progress; weighted coverage; trends from events.
- **Layout (desktop)**: KPI row (each KPI states unit and definition id); grid of panels: status by unit,
  COCA rank-bucket progress bars (records, effective status), BNC band progress (member Forms, distinct
  per band), weighted coverage (`coverage.coca_lp_weighted` for R ∈ {1k, 5k, 20k, 60k},
  `coverage.bnc_member_weighted` for bands 1–3, 1–9, 1–25), CET entry coverage (partial = any linked Form
  mastered, full = all linked Forms mastered), event timeline (per day: status changes, study touches).
- **Mobile**: KPI carousel + stacked panels.
- **APIs**: `src/v2/insights` builders (pure) over index + `LearningStateReader` + events.
- **Acceptance**:
  1. With only `work` (Form) mastered, COCA weighted coverage at R=1000 = (854,095 + 456,169) /
     695,117,371 and is labelled “（计算）”.
  2. Every panel cell opens the underlying set in Explore.
  3. Unit switch never mixes counts of different kinds in one bar.

### 3.6 Data Studio — 数据中心

- **Objects**: sources, diagnostics, alignment report, orphan targets, user data.
- **Tasks**: see source metadata and integrity; read diagnostics by code; inspect alignment
  (Venn, case-folded list, candidate pairs, COCA-unmatched by spelling class); replace a source with a
  custom file (validated by its adapter before activation); export/import user data JSON; rebuild index.
- **Layout**: source cards (title, edition, unit, counts, diagnostics summary); diagnostics table with
  code filter; alignment panels; user-data panel.
- **Acceptance**:
  1. Source cards show 53,951 / 60,000 (COCA), 25,002 / 76,126 (BNC), 5,377 / 8,107 (CET).
  2. Uploading an invalid COCA file shows the `SourceFormatError` message and keeps the old data.
  3. Candidate pairs list cafe/café and e-mail/email as *candidates*, with no effect on statistics.
  4. User-data export → clear → import round-trips records, events and collections exactly.

## 4. Core user flows (end-to-end acceptance)

1. **Look up a word**: `/` → type `running` → open Form page → see COCA adjective/noun, BNC member of
   `run`, CET derivative of `run` → click family `run` → Family Atlas → mark three members learning.
2. **Find high-frequency gaps**: Corpus Lab ranking → filter official rank ≤ 2000 → "Open in Explore" →
   add effective-status filter unrated → select all → status `queued` → Study queue shows them.
3. **Complete a family**: Study → planner `bnc_family_completion` → reasons cite family band and member
   freq → add 20 → review.
4. **Report progress**: Insights → COCA coverage panel → click "5k" bar → Explore opens unmastered records
   with lp_rank ≤ 5000.

## 5. Non-functional requirements

- First usable paint ≤ 1 s with a loading state; engine ready ≤ 5 s on a mid-range laptop.
- Lists of 95k rows scroll at 60 fps (virtualised); queries run in the worker (main thread never blocks
  > 50 ms on data work).
- Offline: PWA caches all three data files (`globPatterns` already include txt/json).
- Accessibility: keyboard reachable lists and panels; status colours always paired with text labels.
