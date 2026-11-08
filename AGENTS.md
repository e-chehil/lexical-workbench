# Lexical Workbench — Agent Rules

Read this first in every session. Long-form design lives in `docs/v2/`; do not re-plan it.

## Product

Local-first English vocabulary workbench (React PWA). Version 2.0 fuses three sources into one
queryable system and turns it into explainable study decisions:

- `coca2020` — COCA 2020 top-60k **lemma + PoS** list (`public/data/coca_freq.json`)
- `bnc25k` — Nation BNC/COCA 25k **word families** (`public/data/BNC_COCA_lists.txt`)
- `cet2016` — CET-4/6 **syllabus entries** (`public/data/CET2016.txt`)

## Stack & commands

React 19 · TypeScript 7 (`tsc --noEmit`) · Vite 8 · Tailwind 4 · Dexie 4 · vite-plugin-pwa ·
TanStack Virtual/Table · tests with `node:test` via `tsx`. Node ≥ 22. Windows dev machine (CRLF warnings
from git are expected).

```bash
npm run lint       # type check — must be clean
npm test           # legacy parser tests + v2 real-data tests
npm run test:v2    # v2 tests only
npm run build      # production build
npm run audit:v2   # regenerate docs/v2/data-audit.generated.json (only when adapters/data change)
npm run dev        # http://localhost:3000
```

## Where things are

| Path | Role |
| --- | --- |
| `docs/v2/IMPLEMENTATION_PLAN.md` | **Task list. Find `NEXT_TASK` at the bottom.** |
| `docs/v2/CONTRACTS.md` | Contracts explained; code is the source of truth |
| `docs/v2/ARCHITECTURE.md` | Domain model, statistics semantics, ADR-001…011 |
| `docs/v2/PRODUCT_SPEC.md` | Workspaces, flows, acceptance criteria |
| `docs/v2/DATA_AUDIT.md` (+ `data-audit.generated.json`) | Real data facts and numbers |
| `src/v2/domain/` | ids, entity types, metric registry |
| `src/v2/sources/` | one adapter per source |
| `src/v2/engine/` | `LexicalIndex`, query protocol, projection, alignment, `dto.ts` (row / form / family DTO builders for the worker and UI) |
| `src/v2/learning/` | learning targets, effective status, coverage |
| `src/v2/contracts.ts` | DTO / worker / store / planner contracts (types for upcoming tasks) |
| `src/v2/index.ts` | public surface — app code imports v2 only from here |
| `src/v2/node/` | Node-only loaders for tests/scripts — never import in browser code |
| `src/app/` | new v2 UI (created by tasks T04+) |
| `src/App.tsx`, `src/components/`, `src/data/`, `src/db/` | **legacy v1, frozen** — do not extend; removed in T14 |

## Domain in one screen

- **Form** `f:<formKey>`: spelling hub (NFC, trimmed, lowercase; diacritics/hyphens kept). Not a lexeme.
- **COCA headword** `coca2020:hw:<printed>` → **COCA lemma+PoS record** `coca2020:lp:<printed>|<pos>`
  (official `rank`, `freq`). A source unit, not a dictionary lexeme.
- **BNC family** `bnc25k:fam:<headword>` (band, official total) → **BNC member**
  `bnc25k:mem:<family>|<form>` (per-form count belongs to the membership).
- **CET entry** `cet2016:ent:<display>` → links to Forms with role/level.
- Cross-source hops go **only** through the Form. Word pages are aggregates keyed by a Form.
- **Learning targets**: `f:<formKey>` (default) or `lp:<formKey>|<pos>` (PoS refinement). PoS targets
  inherit the Form status on read; nothing cascades on write. Families/entries are aggregates.

## Non-negotiable data rules

1. No generic `frequency` field. Every number has a `MetricId` (`src/v2/domain/metrics.ts`); UI labels
   come from `metricDisplayLabel()`. Derived metrics are labelled “（计算）”.
2. `null` = not listed by the source; `0` = printed zero. Never coerce null to 0; missing sorts last.
3. Never lend a value across units: no BNC family total on a form, no `go` lemma freq on `went`, no BNC
   value divided by a COCA value.
4. Never infer morphology or variants (went→go, colour=color, cafe=café) in core logic; such links are
   source facts or `candidate` relations only.
5. Set comparisons project to one entity kind first (`compareRefSets`); `sum` aggregates only on
   metrics native to the query kind.
6. Adapters skip bad units with a diagnostic; they never invent or sum duplicate values.
7. IDs come from `refs.*` builders — never from line numbers, ranks or array positions.

## Module rules

- UI never filters, sorts, matches spellings or looks up frequencies itself: use the query protocol
  (`runQuery` / worker `rows`) and DTOs.
- `domain`, `sources`, `engine`, `learning`, `planning`, `insights` are pure TS (no React/DOM/Dexie).
- Stay inside the task's *Allowed files*. `src/v2/index.ts` and `src/v2/worker/registry.ts` are
  append-only. Changing `src/v2/domain/**` or a contract needs an ADR/plan entry — stop and report.

## Coding & tests

- TypeScript strict-by-convention: no `any` in v2 public APIs; explicit return types on exports.
- Import with `.ts` extensions (existing convention). Keep comments factual and short.
- Pure logic gets `node:test` tests in `src/v2/tests/` against the **real** data files
  (`loadFullIndex()`); synthetic inputs only for validation/error paths. Add new test files to the
  `test` and `test:v2` scripts.
- UI changes: verify the listed acceptance items in the in-app browser (`npm run dev`).

## Finishing a task

1. `npm run lint`, `npm test`, `npm run build` all green (state real results; never claim unrun checks).
2. Update the task `Status` in `IMPLEMENTATION_PLAN.md`, advance `NEXT_TASK`, update docs only if a
   contract changed.
3. Local commit (`<type>(v2): <summary>`, trailer `Made-with: Proma`); do not push.
4. Report: files changed, tests run with results, acceptance items verified, open issues.

<!-- proma:memory:start -->
## 记忆维护

- 项目记忆索引：[MEMORY.md](<C:\Users\chehil\.proma\agent-workspaces\lexical-workbench\memory\MEMORY.md>)；详细主题按索引按需读取，新增、移动、归档主题时同步索引。
- 全局用户画像：[user_profile.md](<C:\Users\chehil\.proma\memory\user_profile.md>)，跨项目共享；本项目补充偏好存入 C:\Users\chehil\.proma\agent-workspaces\lexical-workbench\memory\project-preferences.md 并加入项目索引，仅在本项目覆盖全局偏好。
- 在任务中及时修订已确认的偏好、经验和决策，保留来源、适用范围和核验日期；不把临时任务进度写成永久偏好。超过一周的阶段性要求结合本轮证据复查；到期或被替代的内容移出有效入口并可恢复地归档。读取不等于核验，不编造用户事实。
<!-- proma:memory:end -->
