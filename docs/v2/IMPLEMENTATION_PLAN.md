# Lexical Workbench 2.0 — Implementation Plan (Flash handoff)

How to use this file:

1. Read `AGENTS.md` (rules) first, then the task you are assigned (or `NEXT_TASK` at the bottom).
2. Read only the documents and files listed in that task. Do not re-plan the architecture.
3. Stay inside **Allowed files**. If you believe a contract must change, stop and report instead of
   changing it (unless the task lists the change under *New interfaces*).
4. Finish with the task's **Tests** and **Acceptance**, update the task's `Status` line in this file to
   `done (<date>, <commit>)`, advance `NEXT_TASK`, commit locally (no push), and write the **Report**.

Global commands (every task):

```bash
npm run lint      # tsc --noEmit, must be clean
npm test          # legacy parser tests + v2 real-data tests, all must pass
npm run build     # vite production build must succeed
```

Shared-file rule: `src/v2/index.ts` and `src/v2/worker/registry.ts` are **append-only** for tasks
(add one export / one handler line). Nobody edits `src/v2/domain/**` except where a task says so.

## Status overview

| ID | Title | Depends on | Status |
| --- | --- | --- | --- |
| V2-T00 | Architecture freeze, COCA vertical slice, audit (this round) | — | done (2026-11-08) |
| V2-T01 | Engine DTO builders (rows, form detail, family detail) | — | done (2026-11-08, 9fa4692) |
| V2-T02 | User data store (Dexie v2) + pure learning store core | — | done (2026-11-08, 0d67e94) |
| V2-T03 | Engine worker, browser loader, RPC client | T01 | done (2026-11-08, 386207a) |
| V2-T04 | App shell, routing codec, providers, global search | T02, T03 | done (2026-11-08, 30d36e4) |
| V2-T05 | Explore workspace | T04 | todo |
| V2-T06 | Detail panels (Form page, Family sheet, entity chips) | T04 | todo |
| V2-T07 | Family Atlas workspace | T06 | todo |
| V2-T08 | Insights builders (pure) + worker method | T03 | todo |
| V2-T09 | Study planner strategies (pure) + worker method | T03 | todo |
| V2-T10 | Corpus Lab workspace | T05 | todo |
| V2-T11 | Study workspace | T06, T09 | todo |
| V2-T12 | Insights workspace | T05, T08 | todo |
| V2-T13 | Data Studio workspace | T05 | todo |
| V2-T14 | Legacy removal and utility migration | T05–T13 | todo |

Parallel-safe groups: {T01, T02} → {T03} → {T04, T08, T09} → {T05, T06} → {T07, T10, T11, T12, T13} → T14.

---

## V2-T01 — Engine DTO builders

- **Status**: done (2026-11-08, 9fa4692)
- **Goal**: Pure functions that turn index + learning state into the DTOs of `src/v2/contracts.ts`, so
  the worker and UI never assemble rows themselves.
- **Depends on**: —
- **Read**: `docs/v2/CONTRACTS.md` §4–§9, `src/v2/contracts.ts`, `src/v2/engine/lexicalIndex.ts`,
  `src/v2/engine/query.ts`, `src/v2/learning/model.ts`.
- **Allowed files**: create `src/v2/engine/dto.ts`, `src/v2/tests/dto.test.ts`; append exports to
  `src/v2/index.ts`; add `test:v2` / `test` script entries for the new test file in `package.json`.
- **Must reuse**: `runQuery`, `projectRef`, `index.metricValue`, `metricDisplayLabel`, `METRICS`,
  `defaultTargetFor`, `resolveEffectiveStatus`, `posBreakdown`, `computeBncMemberWeightedCoverage`.
- **New interfaces**: functions only —
  `metricCell(index, ref, metric): MetricCell`,
  `buildRows(ctx: QueryContext, req: RowsRequest): RowsPage`,
  `buildFormDetail(ctx, formRef): FormDetailDTO | null`,
  `buildFamilyDetail(ctx, familyRef): FamilyDetailDTO | null`,
  `rowBadges(index, ref): RowBadge[]`.
- **Data input**: real files via `loadFullIndex()`.
- **Steps**:
  1. `metricCell` uses `index.metricValue` + `metricDisplayLabel`; provenance from `METRICS`.
  2. `buildRows` = `runQuery` then map refs of the page → `EntityRowDTO` (label via `index.label`,
     `formRef` via `projectRef(ref,'form')[0] ?? null` for single-form kinds, sources via
     `sourcesOfForm`, status via `defaultTargetFor` + `resolveEffectiveStatus` when `ctx.learning`).
  3. Badges: `multi_pos` (>1 COCA record), `multi_family` (>1 BNC membership), `cet4`/`cet6`,
     `case_variant` (printed surfaces differ from key), `candidate_variant` (any candidate relation),
     `not_in_coca`, `not_in_bnc`.
  4. `buildFormDetail`: fill every section of `FormDetailDTO`; COCA records in rank order with
     metrics `lp_rank, lp_freq, lp_share_of_headword`; hwMetrics `hw_freq_sum, hw_rank,
     hw_best_lp_rank, hw_pos_count`; BNC metrics `member_freq, member_share_of_family,
     family_total (of the family ref), family_band (of the family ref)`.
  5. `buildFamilyDetail`: members in source order; `otherFamilies` from the member Form; progress via
     `computeBncMemberWeightedCoverage({familyRef})` and a count of mastered member Forms.
- **Tests** (`dto.test.ts`, real data): `work` detail has 2 COCA records + 1 BNC card + CET entry;
  `went` detail has `coca: null` and BNC card in `go` with member_freq 45,876; `grannies` has 2 BNC cards
  and badge `multi_family`; family `work` detail has 15 members and `family_total` cell only in the
  family-level metrics; rows for kind `coca_lemma_pos` rank ≤ 10 page size 5 → total 10, 5 rows, first
  label `the (article)`; every derived `MetricCell.label` ends with “（计算）”.
- **Acceptance**: tests pass; lint/test/build green.
- **Boundaries**: no changes to `lexicalIndex.ts`, `query.ts`, `contracts.ts` shapes. No React.
- **Report**: functions added, test names, any DTO field you found ambiguous.
- **Done (2026-11-08)**: `src/v2/engine/dto.ts` exports `metricCell`, `buildRows`, `rowBadges`,
  `buildFormDetail`, `buildFamilyDetail` (re-exported from `src/v2/index.ts`); 12 real-data tests in
  `src/v2/tests/dto.test.ts`; `test` / `test:v2` include the new file. Decisions taken where the
  contract was silent: (1) `EntityRowDTO.formRef` is filled only for single-Form kinds
  (`form`, `coca_headword`, `coca_lemma_pos`, `bnc_member`); `bnc_family` and `cet_entry` → null,
  because one entry can link several spellings. (2) `EntityRowDTO.status` is null when no learning
  state is synchronised, otherwise `defaultTargetFor` + `resolveEffectiveStatus`. (3)
  `FamilyDetailDTO.progress.formsMastered/formsTotal` count distinct member Forms by effective Form
  status, so a mastered PoS record does not count as a mastered form. (4) `multi_pos`/`multi_family`
  badges mirror the query filters, which project through the Form, so aggregate rows can carry them.
  Cost observation: `buildRows` adds ≈15–50 ms per 200 rows on kind `form`; `runQuery`'s full-match
  sort (≈370 ms over 94 954 forms) dominates and was left unchanged.

## V2-T02 — User data store

- **Status**: done (2026-11-08, 0d67e94)
- **Goal**: Persist learning records, events and collections in `LexicalWorkbenchDB_v2`, implementing
  `LearningStore` and collection CRUD, with a pure core testable in Node.
- **Depends on**: —
- **Read**: ARCHITECTURE §7, §8.2; CONTRACTS §8–§9; `src/v2/learning/model.ts`; `src/v2/contracts.ts`;
  legacy `src/db/database.ts` (only as reference for undo/batch ideas).
- **Allowed files**: create `src/v2/store/core.ts` (pure), `src/v2/store/dexieStore.ts`,
  `src/v2/store/collections.ts`, `src/v2/store/backup.ts`, `src/v2/tests/store.test.ts`; append to
  `src/v2/index.ts` (pure core only; Dexie module is imported by app code directly); `package.json`
  test script; may add devDependency `fake-indexeddb` for Dexie tests.
- **Must reuse**: `LearningRecord`, `LearningEvent`, `applyStatusChange`, `emptyRecord`, `TargetPatch`,
  `Collection`, `LearningStore`.
- **New interfaces**: `applyPatch(prev, target, patch, now, batchId) → {record, event[]}` (pure),
  `undoEvents(events, current) → records to write` (pure), `BackupPayloadV2 { version: 2; records;
  events; collections; exportedAt }`.
- **Steps**:
  1. Pure core: patch → next record + one event per changed field type (`status`, `tags`, `note`,
     `study`); `before` contains only changed fields or `null` if the record did not exist.
  2. Undo: given a batch's events (newest first), restore `before`; if `before === null` delete record.
     Append `revert` events.
  3. Dexie schema exactly as ARCHITECTURE §8.2. `apply()` runs in one `rw` transaction over
     `learningRecords` + `learningEvents`; in-memory cache + `subscribe` listeners.
  4. Collections CRUD (static targets de-duplicated, order preserved; dynamic stores `LexQuery`).
  5. Backup export/import (replace mode only; validate `version === 2`).
- **Tests**: pure core tests (status/tags/note/study patches, undo restores and deletes, batch ids);
  Dexie tests with `fake-indexeddb/auto` (apply 3 targets → 3 records + events share batchId; undo).
- **Acceptance**: tests pass; lint/test/build green.
- **Boundaries**: do not import legacy `src/db/*`; do not change learning statuses or target shapes.
- **Report**: schema, transaction strategy, test list.
- **Done (2026-11-08)**: `src/v2/store/core.ts` (pure: `applyPatch`, `undoEvents`, `nextBatchId`,
  `dedupeTargets`, `isTargetRef`, `compareEventsNewestFirst`), `dexieStore.ts`
  (`LexicalWorkbenchDB` + `DexieLearningStore`), `collections.ts` (pure builders + `DexieCollections`),
  `backup.ts` (`exportBackup` / `parseBackup` / `validatePayload` / `importBackup` /
  `restoreFromJson`); 25 tests in `src/v2/tests/store.test.ts`; devDependency `fake-indexeddb`.
  Schema is exactly ARCHITECTURE §8.2 (`learningRecords`, `learningEvents`, `collections`,
  `customSources`, `settings`), version 1, database `LexicalWorkbenchDB_v2`, v1 not migrated.
  Decisions where the contract was silent: (1) `applyPatch` returns the *same* record object when
  nothing changed and `apply` then writes nothing, so repeated clicks do not churn `updatedAt`;
  (2) tags are compared and stored as an ordered list (order is part of the value);
  (3) `undoEvents` appends one `revert` event per affected target with the diff of changed field
  groups — a revert that deletes a record has `before` = all fields and `after = {}` — and its
  events use the batch id `revert:<batchId>`, so the original batch stays single-valued;
  (4) a batch event whose record has since been removed elsewhere is reported in
  `UndoPlan.skipped` instead of recreating it with a invented `createdAt`;
  (5) `events()` defaults to the newest 200 and treats `since` as inclusive;
  (6) `importBackup` validates the payload through the same validator as `parseBackup`, before the
  transaction, and the store cache must be refreshed with `store.load()` afterwards;
  (7) collections never cascade from learning records: deleting/undoing a record leaves stored
  targets in place (ADR-011), and `DexieCollections` reads the table fresh (no cache).
  Transaction strategy: one `rw` over records + events per `apply`/`undoBatch`; one `rw` over the
  three user tables for the replace-mode import. Cost on fake-indexeddb is not representative of
  the browser; the table sizes are user-scale (thousands), not source-scale.

## V2-T03 — Engine worker, loader, RPC client

- **Status**: done (2026-11-08, 386207a)
- **Goal**: Build the `LexicalIndex` in a Web Worker from `public/data/*` and expose
  `LexicalEngineApi` to the main thread.
- **Depends on**: T01.
- **Read**: ARCHITECTURE §8.1, CONTRACTS §9, `src/v2/contracts.ts`, `src/v2/engine/dto.ts`,
  `src/v2/node/loadSources.ts`, `vite.config.ts`, legacy `resolvePublicUrl` in `src/App.tsx` (~line 300).
- **Allowed files**: create `src/v2/worker/handlers.ts` (pure dispatcher), `src/v2/worker/registry.ts`
  (method → handler map, append-only for later tasks), `src/v2/worker/engine.worker.ts`,
  `src/v2/worker/client.ts`, `src/v2/worker/loadBrowser.ts`, `src/v2/tests/worker.test.ts`.
- **Must reuse**: adapters, `buildLexicalIndex`, `runQuery`, `projectRefs`, `compareRefSets`,
  `computeAlignmentReport`, DTO builders, `InMemoryLearningState`.
- **New interfaces**: `createEngineHandlers(index): Record<keyof LexicalEngineApi, Function>` and the
  message envelope `{ id: number; method: string; args: unknown[] }` → `{ id; ok: true; value } |
  { id; ok: false; error: { name; message; code? } }`.
- **Steps**:
  1. `loadBrowser.ts`: fetch the three files using `import.meta.env.BASE_URL` (`data/coca_freq.json`,
     `data/BNC_COCA_lists.txt`, `data/CET2016.txt`); custom sources override via a message
     `setCustomSource(sourceId, text)` (store integration happens in T13).
  2. Worker builds the index once, answers `ready()` with diagnostics and build time.
  3. `syncLearning` replaces the worker's `InMemoryLearningState`.
  4. `plan` handler: register a stub that throws `QueryError`-style `{code:'not_implemented'}` until T09.
  5. Client: promise-based proxy with request ids; serialises errors back to `Error` with `code`.
- **Tests**: Node test calling `createEngineHandlers(loadFullIndex())` directly: `query`, `rows`,
  `project`, `compare`, `formDetail('f:work')`, `alignment().venn.coca_only === 18623`, error envelope
  for `sum` on lifted metric.
- **Acceptance**: tests pass; `npm run build` emits a separate worker chunk; lint/test/build green.
- **Boundaries**: worker must not import React, Dexie or legacy code.
- **Report**: chunk names/sizes from build output, measured `ready()` time in `npm run dev` (console).
- **Done (2026-11-08)**: `worker/handlers.ts` (`createEngineHandlers`, `MutableLearningState`,
  `EngineError`, `serializeError`, `dispatchMessage`), `worker/registry.ts` (`ENGINE_METHODS`,
  `CONTROL_METHODS`, `isEngineMethod`, `isControlMethod`, `assembleHandlers`),
  `worker/loadBrowser.ts` (`SOURCE_FILES`, `resolvePublicUrl`, `loadSourceTexts`,
  `buildIndexFromTexts`, `SourceLoadError`), `worker/engine.worker.ts`
  (`createEngineWorkerRuntime`, `attachEngineWorker`), `worker/client.ts` (`EngineClient`,
  `EngineClientError`, `createEngineClient`); 20 tests in `src/v2/tests/worker.test.ts`.
  Decisions where the contract was silent: (1) builds are serialised through one FIFO queue and
  concurrent `ready()`/`query` calls share a single build (verified: three parallel calls report
  the same `buildMs`); (2) a failed build is not cached, so the next request retries rather than
  leaving the session broken; (3) `setCustomSource` builds first and commits the override only on
  success, so a rejected payload leaves the previous index in service, and the learning state
  lives outside the build so `syncLearning` survives a rebuild; (4) unknown methods are answered
  before any build; (5) a source that parses to zero units is refused at the load boundary
  (`SourceFormatError`) — note the COCA adapter itself accepts an empty array today, which
  deviates from the adapter contract and should be fixed in `sources/` by a later task;
  (6) `alignment()` is memoised per index; (7) engine error messages are English (like adapter
  diagnostics) and are localised by the UI layer later.
  **Measured (real data, Chromium; `npm run dev` and a GitHub Pages-base production build)**:
  cold `ready()` 720–1069 ms (`buildMs` in the worker, fetch + parse + build), three concurrent
  calls → one build; full sorted 95k-form page (200 rows) 266–316 ms end-to-end; `rows()`
  69–127 ms; `formDetail` 0.7–0.8 ms; `familyDetail` 2.2–3.3 ms; `alignment()` 186–222 ms first
  call, 0.3–0.9 ms cached; custom-source rebuild 496–520 ms. Main thread: `longtask` count 0 and
  timer-loop median 4.2–4.6 ms during the cold start (max 6.1 ms in the production run; the one
  789 ms outlier in a dev run came from hidden-tab timer throttling, not from main-thread work).
  Main-thread heap +0.1–0.4 MB across the whole sequence (the index lives in the worker; the
  worker heap is not observable from page JS). Production build emits
  `assets/engine.worker-<hash>.js` (44.1 kB) as a separate chunk with the worker URL resolved
  through the deployment base (`/lexical-workbench/assets/...`); because no app code imports
  `client.ts` yet, the chunk appears once T04 wires the shell.
- **Handoff for T04**: import `src/v2/worker/client.ts` directly (it is not re-exported from
  `src/v2/index.ts` because it references `new Worker`), call `createEngineClient()` once in a
  provider, and use `ready()` for the loading state. `setCustomSource` is a worker control method
  until T13 adds it to `LexicalEngineApi`; `plan` rejects with `code: 'not_implemented'` until T09.

## V2-T04 — App shell, routing, providers, global search

- **Status**: done (2026-11-08, 30d36e4)
- **Goal**: New React root with workspace navigation, hash routing carrying `LexQuery` and selected ref,
  engine/store providers, Detail panel host and command-palette search. Legacy app stays reachable at
  `#/legacy`.
- **Depends on**: T02, T03.
- **Read**: PRODUCT_SPEC §2, CONTRACTS §6, `src/main.tsx`, `src/index.css`.
- **Allowed files**: create `src/app/**` (`Root.tsx`, `shell/*`, `routing/*`, `providers/*`,
  `search/*`); modify `src/main.tsx` (render `src/app/Root.tsx`); tests `src/app/routing/*.test.ts`.
- **Must reuse**: `client.ts` (T03), `dexieStore.ts` (T02), `refs`, `parseRef`, `LexQuery`.
- **New interfaces**: `encodeRoute({workspace, query?, ref?}) / decodeRoute(hash)`;
  `useEngine()`, `useLearning()`, `useRoute()`; `openInExplore(query | refs)` helper (the universal
  "Open in Explore" contract).
- **Steps**: routing codec (base64url JSON for `LexQuery`, round-trip tested); shell layouts for desktop
  rail and mobile bottom bar (PRODUCT_SPEC §2); providers with loading/error states (engine `ready`);
  search palette calling `query` per kind with `prefix` mode, limit 8 each; `#/legacy` renders legacy
  `App` lazily; store changes trigger `syncLearning`.
- **Tests**: codec round-trip for 5 queries incl. Unicode (`café`, `coup d'état`), unknown workspace →
  Explore.
- **Acceptance**: `npm run dev` shows the shell; search for `went` lists Form `went` and BNC family `go`
  is reachable from it; browser back/forward restores route. Verify with the in-app browser once.
- **Boundaries**: no workspace content beyond placeholders; no data logic in components.
- **Report**: route format, screenshots not required; list providers and hooks.
- **Route format**: `#/<workspace>?q=<base64url LexQuery>&ref=<EntityRef>` where
  `<workspace>` ∈ explore | corpus | family | study | insights | data (and `legacy`). `q` is the
  UTF-8 JSON of a `LexQuery` in canonical form (object keys sorted) so equal page states always
  produce equal URLs; `ref` is percent-encoded because refs contain `|`, `:` and non-ASCII letters.
  Unknown workspace → Explore; an unreadable `q`/`ref` is dropped rather than throwing.
- **Done (2026-11-08)**: `routing/codec.ts` (`encodeRoute`, `decodeRoute`, `isSameRoute`,
  `canonicalJson`, `isLexQuery`), `routing/openInExplore.ts` (`commonKind`, `queryForRefs`,
  `routeForQuery`, `routeForRefs`), `providers/RouteProvider.tsx` (`useRoute`,
  `useNavigateIfChanged`), `providers/EngineProvider.tsx` (`useEngine`),
  `providers/LearningProvider.tsx` (`useLearning`), `shell/*` (`Shell`, `WorkspaceRail`,
  `MobileTabBar`, `TopBar`, `WorkspacePlaceholder`, `workspaceMeta`), `search/*` (`useSearch`,
  `SearchPalette`), `detail/*` (`DetailHost`, `RefDetail`), `Root.tsx`; `src/main.tsx` renders
  `Root`. 10 tests in `src/app/routing/*.test.ts`.
- **Decisions where the contract was silent**: (1) the palette calls `rows()` with
  `columns: []` rather than `query()`, because `query()` returns bare refs and the palette must
  show `index.label`-derived labels without deriving them in the component — `rows()` is the DTO
  wrapper around the same `runQuery`; (2) `navigate` assigns `location.hash` (one history entry)
  and `isSameRoute` suppresses duplicate entries, while `replace` uses `history.replaceState` for
  the initial normalisation; (3) `DetailHost` is route-driven, so opening an entity is linkable and
  browser back closes the panel; (4) the learning provider pushes the full snapshot on every
  committed change and after `ready()`, and treats IndexedDB failure as a banner (browsing must not
  depend on writable storage); (5) `RefDetail` is a deliberately minimal view (label, kind,
  cross-source chips, "open in Explore") that T06 replaces — it exists because T05's spec refers to
  a "minimal ref view" when T06 is absent; (6) engine error messages stay English (adapter
  diagnostics do too); the shell shows them verbatim inside a localised frame.
- **Measured / verified in Chromium (`npm run dev`, viewport 575 px + a forced desktop rail)**:
  shell ready in 711–888 ms with `coca2020 · bnc25k · cet2016` and 6 info diagnostics; learning
  store connected (Dexie) and a real `apply(['f:work','lp:work|noun'], mastered)` became visible to
  worker queries (`learning_status` filter 0 → `['f:work']`, `formDetail('f:work').status` mastered
  own, noun record mastered own), then `undoBatch` brought it back to 0 — so the store → worker sync
  path is real, not assumed. Search `went` → 1 hit (Form `went`), its BNC chip `go` → family `go`
  with 13 members; back/forward restored both routes; typing `wo` then `went` quickly left only the
  `went` result (stale response dropped); `Ctrl+K` opened and `Escape` closed the palette; a deep
  link `#/family?q=…&ref=bnc25k%3Afam%3Acaf%C3%A9` decoded with `café` intact. Removing
  `public/data/coca_freq.json` produced the error screen
  `[coca2020] invalid JSON: Unexpected token '<' …` with a retry button; restoring the file and
  clicking 重新构建 brought the shell back. Production build under `GITHUB_PAGES=true` +
  `vite preview --base=/lexical-workbench/`: worker `assets/engine.worker-*.js` (44.2 kB) and data
  (`/lexical-workbench/data/coca_freq.json`) load from the sub-path, the shell becomes ready in
  888 ms, and the legacy app is only fetched (`App-*.js`, 288 kB) when `#/legacy` is visited.
- **Handoff for T05**: use `useRoute().navigate` + `openInExplore` for every set; `useEngine()`
  gives `{client,status,ready,error,retry}`; the Explore page should render
  `WorkspacePlaceholder`'s slot, and `DetailHost`/`RefDetail` are placeholders T06 replaces.
  Search uses `rows()` (labels) — reuse `useSearch` instead of querying per component.
- **Open issue (fixed after T04)**: the browser loader accepted any HTTP 200 body, so a missing
  *text* source served as the SPA fallback HTML was parsed as one bogus CET entry while the source
  was reported as loaded. `worker/loadBrowser.ts` now checks each payload's *content* shape
  (`assertSourcePayload`: HTML page detection plus a one-line structural probe per source) and
  raises `SourceFormatError` naming the source, so the app keeps its previous data. Covered by
  tests for BNC and CET on an HTTP 200 HTML body and for the three real files being accepted.

## V2-T05 — Explore workspace

- **Status**: todo
- **Goal**: PRODUCT_SPEC §3.1 list part: kind tabs, filter panel, virtualised table with metric
  columns, aggregates, selection and bulk status, "Open in Explore" target.
- **Depends on**: T04 (uses T06 panel if present; otherwise opens a minimal ref view).
- **Allowed files**: `src/app/workspaces/explore/**`, tests `src/app/workspaces/explore/*.test.ts` for
  pure helpers (filter-state ↔ `LexQuery` mapping).
- **Must reuse**: `engine.rows`, `METRICS`, `useLearning().apply`. The column chooser offers, per kind,
  only metrics whose lift rule in CONTRACTS §5.3 is not "null"; encode that table once as
  `ALLOWED_COLUMNS: Record<EntityKind, MetricId[]>` in this folder and unit-test it against
  `index.metricValue` on one real entity per kind (non-null for at least one entity).
- **Steps**: filter state model → `LexQuery` (pure, tested); table with TanStack Virtual, page fetch by
  window (offset/limit 200); keyboard model from v1 (↑↓, Shift-range, Space, Enter, 1–5);
  bulk bar (status, add to collection, export selection via T11 later — hide until available).
- **Tests**: mapping tests (CET6 + rank ≤ 5000 + unrated → expected `LexQuery`).
- **Acceptance**: PRODUCT_SPEC §3.1 acceptance items 3, 5, 6 verified in the in-app browser; lint/test/build.
- **Boundaries**: no client-side filtering/sorting of rows; everything through `rows`.
- **Report**: implemented filters/columns, performance observation for full-form scroll.

## V2-T06 — Detail panels

- **Status**: todo
- **Goal**: Form page, Family sheet and source-entity views used by every workspace; PoS strip with
  own/inherited status; entity chips; metric cell renderer with tooltip.
- **Depends on**: T04.
- **Allowed files**: `src/app/detail/**`, `src/app/components/MetricCell.tsx`,
  `src/app/components/EntityChip.tsx`, `src/app/components/StatusControl.tsx`.
- **Must reuse**: `engine.formDetail`, `engine.familyDetail`, `MetricCell`, `refs.lemmaPosTarget`,
  dictionary URL templates (copy `DEFAULT_DICTIONARIES` + `buildDictionaryUrl` from
  `src/data/searchAndFilter.ts` into `src/app/detail/dictionaries.ts`).
- **Acceptance**: PRODUCT_SPEC §3.1 acceptance 1, 2, 4 and §3.3 acceptance 3–4 in the in-app browser;
  setting `work` noun mastered while Form is learning shows verb chip "learning (继承)".
- **Boundaries**: panels render DTOs only; no direct index access.
- **Report**: component list and props.

## V2-T07 — Family Atlas

- **Status**: todo · **Depends on**: T06
- **Goal**: PRODUCT_SPEC §3.3.
- **Allowed files**: `src/app/workspaces/family/**`.
- **Must reuse**: `engine.rows` (kind `bnc_family`, sorts by `bnc25k.family_total`/`family_band`),
  Family sheet from T06, store `apply`, collections API (T02).
- **Acceptance**: PRODUCT_SPEC §3.3 items 1–5; lint/test/build.
- **Boundaries**: no inferred morphology graph; member share visual uses `member_share_of_family` cells.
- **Report**: screenshots optional; acceptance results.

## V2-T08 — Insights builders (pure) + worker method

- **Status**: todo · **Depends on**: T03
- **Goal**: Pure statistics for PRODUCT_SPEC §3.5.
- **Allowed files**: create `src/v2/insights/**`, `src/v2/tests/insights.test.ts`; **additive** change
  to `src/v2/contracts.ts`: add `InsightsRequest`, `InsightsReport` types and
  `insights(req): Promise<InsightsReport>` to `LexicalEngineApi`; one registry line in
  `src/v2/worker/registry.ts`.
- **Must reuse**: `computeCocaWeightedCoverage`, `computeBncMemberWeightedCoverage`,
  `resolveEffectiveStatus`, `HW_RANK_BUCKETS`, `runQuery`.
- **Report contents**: status counts per unit (form, coca_headword via Form target, coca_lemma_pos via
  effective lp status, cet_entry partial/full, bnc_family any/all members mastered); COCA rank-bucket
  progress (records); BNC band progress (distinct member Forms per band); coverage set for R ∈
  {1000, 5000, 20000, 60000} and bands {1–3, 1–9, 1–25}; each cell carries the `LexQuery` that opens it.
- **Tests** (real data + synthetic learning state): only `f:work` mastered → R=1000 coverage numerator
  1,310,264; band 1 progress counts `work` once; a Form in two families counts once per band.
- **Acceptance**: tests pass; lint/test/build.
- **Boundaries**: no new metric ids in `metrics.ts`; coverage definitions unchanged.
- **Report**: report shape, timing on full data.

## V2-T09 — Study planner strategies (pure) + worker method

- **Status**: todo · **Depends on**: T03
- **Goal**: Implement `StudyPlanner` for the four `StrategyId`s (PRODUCT_SPEC §3.4) with `PlanReason`s.
- **Allowed files**: create `src/v2/planning/**`, `src/v2/tests/planning.test.ts`; replace the `plan`
  stub handler in `src/v2/worker/handlers.ts` (one function).
- **Must reuse**: `runQuery`, `projectRef`, `defaultTargetFor`, `resolveEffectiveStatus`,
  `metricDisplayLabel`.
- **Tests**: empty state `coca_high_freq` size 20, no scope → first item target `f:the` (single-PoS
  headword → Form target; multi-PoS headword whose records have differing effective statuses → lp
  target) with reason code `coca_rank` value 1; with `work` learning + `lp:work|noun` mastered →
  never proposes `lp:work|noun`; `bnc_family_completion` after mastering `worked` proposes members of
  `work` ordered by member freq; every item has ≥ 1 reason with a metric or source code; no duplicate
  targets in `custom_mix`.
- **Acceptance**: tests pass; lint/test/build.
- **Boundaries**: no hidden numeric score formulas without reasons; no stop-word lists. Excluding
  function words is done only through an explicit `coca_pos` filter in `PlanRequest.scope` (the Study UI
  may offer it as a preset, visibly applied).
- **Report**: ordering rules per strategy.

## V2-T10 — Corpus Lab

- **Status**: todo · **Depends on**: T05
- **Goal**: PRODUCT_SPEC §3.2.
- **Allowed files**: `src/app/workspaces/corpus/**`; may add a lightweight SVG chart component in
  that folder (no new chart dependency).
- **Must reuse**: `engine.rows`, `engine.query` aggregates, `engine.alignment`, `engine.compare`,
  `openInExplore`.
- **Acceptance**: PRODUCT_SPEC §3.2 items 1–6.
- **Boundaries**: chart values come from engine responses; no recomputation of shares in components.

## V2-T11 — Study workspace

- **Status**: todo · **Depends on**: T06, T09
- **Goal**: PRODUCT_SPEC §3.4 (collections, queue, planner UI, export).
- **Allowed files**: `src/app/workspaces/study/**`; create `src/v2/util/csv.ts` by moving (copying)
  `splitCsvRecords`, `parseCsvLine`, `escapeCsvField` from `src/data/searchAndFilter.ts` with their tests
  into `src/v2/tests/csv.test.ts`.
- **Must reuse**: collections API (T02), `engine.plan`, store `apply`, `undoBatch`.
- **Acceptance**: PRODUCT_SPEC §3.4 items 1–5; CSV round-trip test (commas, quotes, newlines, Chinese).

## V2-T12 — Insights workspace

- **Status**: todo · **Depends on**: T05, T08
- **Goal**: PRODUCT_SPEC §3.5 UI; event timeline from `store.events`.
- **Allowed files**: `src/app/workspaces/insights/**`.
- **Acceptance**: PRODUCT_SPEC §3.5 items 1–3.

## V2-T13 — Data Studio

- **Status**: todo · **Depends on**: T05
- **Goal**: PRODUCT_SPEC §3.6: source cards, diagnostics, alignment panels, custom source upload
  (validated in worker, persisted in `customSources`), user data export/import, orphan targets.
- **Allowed files**: `src/app/workspaces/data/**`; `src/v2/store/customSources.ts`; worker message
  `setCustomSource` handler (one function in `handlers.ts`).
- **Acceptance**: PRODUCT_SPEC §3.6 items 1–4.

## V2-T14 — Legacy removal and utility migration

- **Status**: todo · **Depends on**: T05–T13
- **Goal**: Delete v1 UI/data/db code and make v2 self-contained.
- **Allowed files**: delete `src/App.tsx`, `src/components/**`, `src/db/**`, `src/data/searchAndFilter.ts`,
  `src/utils/frequency.ts`; move CET expansion (`extractHomograph`, `expandCetMemberToken`,
  `parseCet2016`) into `src/v2/sources/cetExpansion.ts`, migrate the CET-related tests from
  `src/data/parser.test.ts` into `src/v2/tests/cet.test.ts`, delete `src/data/**`; update `README.md`,
  `package.json` scripts, remove `#/legacy` route; remove unused deps only if no import remains
  (`@google/genai`, `express`, `dotenv` are candidates — verify with grep).
- **Acceptance**: `grep -r "src/data\|LexiconWordItem" src` returns nothing; `npm run audit:v2`
  regenerates `docs/v2/data-audit.generated.json` with **no diff**; lint/test/build green.
- **Report**: removed files, migrated tests, dependency changes.

---

## Change control for public interfaces

| Interface | Owner | May change in |
| --- | --- | --- |
| `src/v2/domain/**` | architecture | only via ADR amendment |
| `engine/query.ts` `LexQuery`/`QueryFilter` | architecture | additive filter types allowed in T05 if a spec filter is impossible otherwise; must update CONTRACTS §6 and add a test |
| `contracts.ts` DTOs | architecture | additive fields only (T01 may add optional fields it needs) |
| `LexicalEngineApi` | T03 | additive methods in T08 (`insights`), T13 (`setCustomSource`) |
| `LearningStore`, `Collection` | T02 | none after T02 |

NEXT_TASK: V2-T05
