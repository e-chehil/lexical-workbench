/**
 * Lexical Workbench 2.0 — cross-module contracts that are NOT yet implemented in this round.
 * These types are normative (docs/v2/CONTRACTS.md §7–§9). Tasks in IMPLEMENTATION_PLAN.md
 * implement them; changing a shape here requires a plan entry listing affected tasks.
 */
import type { EntityKind, EntityRef, SourceId, TargetRef } from './domain/ids.ts';
import type { MetricId } from './domain/metrics.ts';
import type { CetFormRole, CetLevel, CocaPos, LexicalRelation, SourceDiagnostic } from './domain/types.ts';
import type { AlignmentReport } from './engine/alignment.ts';
import type { LexQuery, QueryResult, SetComparison } from './engine/query.ts';
import type {
  CoverageResult,
  EffectiveStatus,
  LearningEvent,
  LearningRecord,
  LearningStateReader,
  LearningStatus,
} from './learning/model.ts';

// ---------------------------------------------------------------------------
// §7 Engine ↔ UI data transfer objects
// ---------------------------------------------------------------------------

/** A labelled metric value; `value: null` renders as "—" with `missingReason`. */
export interface MetricCell {
  metric: MetricId;
  value: number | null;
  /** From metricDisplayLabel(); derived metrics end with （计算）. */
  label: string;
  provenance: 'official' | 'derived';
}

/** One row for virtualised tables. `columns` order follows the request. */
export interface EntityRowDTO {
  ref: EntityRef;
  kind: EntityKind;
  label: string;
  formRef: EntityRef | null;
  sources: SourceId[];
  metrics: MetricCell[];
  /** Effective status of defaultTargetFor(ref); null when the kind has no default target. */
  status: EffectiveStatus | null;
  badges: RowBadge[];
}

export type RowBadge =
  | 'multi_pos'
  | 'multi_family'
  | 'cet4'
  | 'cet6'
  | 'case_variant'
  | 'candidate_variant'
  | 'not_in_coca'
  | 'not_in_bnc';

export interface RowsRequest {
  query: LexQuery;
  columns: MetricId[];
}

export interface RowsPage {
  total: number;
  offset: number;
  rows: EntityRowDTO[];
  aggregates: QueryResult['aggregates'];
}

/** Word page = aggregate keyed by a Form (ARCHITECTURE §3.1 G). */
export interface FormDetailDTO {
  formRef: EntityRef;
  key: string;
  surfaces: { source: SourceId; surface: string }[];
  coca: null | {
    headwordRef: EntityRef;
    headword: string;
    hwMetrics: MetricCell[];
    records: { ref: EntityRef; pos: CocaPos; metrics: MetricCell[]; status: EffectiveStatus }[];
  };
  bnc: {
    memberRef: EntityRef;
    familyRef: EntityRef;
    familyHeadword: string;
    metrics: MetricCell[]; // member_freq, member_share_of_family, family_total, family_band
  }[];
  bncFamilyHeaded: EntityRef | null;
  cet: { entryRef: EntityRef; display: string; role: CetFormRole; level: CetLevel; homographNumber: number | null }[];
  status: EffectiveStatus;
  relations: LexicalRelation[];
}

export interface FamilyDetailDTO {
  familyRef: EntityRef;
  headword: string;
  band: number;
  totalFrequency: number;
  members: {
    memberRef: EntityRef;
    formRef: EntityRef;
    form: string;
    memberFreq: number;
    share: number | null;
    otherFamilies: EntityRef[];
    cocaHeadwordRef: EntityRef | null;
    cetLevels: CetLevel[];
    status: EffectiveStatus;
  }[];
  progress: { formsMastered: number; formsTotal: number; weighted: CoverageResult };
}

/** Worker RPC surface (src/v2/worker). All methods are async across the worker boundary. */
export interface LexicalEngineApi {
  ready(): Promise<{ sources: SourceId[]; diagnostics: SourceDiagnostic[]; buildMs: number }>;
  query(q: LexQuery): Promise<QueryResult>;
  rows(req: RowsRequest): Promise<RowsPage>;
  project(refs: EntityRef[], to: EntityKind): Promise<EntityRef[]>;
  compare(a: EntityRef[], b: EntityRef[], at: EntityKind): Promise<SetComparison>;
  formDetail(formRef: EntityRef): Promise<FormDetailDTO | null>;
  familyDetail(familyRef: EntityRef): Promise<FamilyDetailDTO | null>;
  alignment(): Promise<AlignmentReport>;
  /** Pushes the current learning state snapshot into the worker (after store changes). */
  syncLearning(records: LearningRecord[]): Promise<void>;
  /** Study planner (implemented by task V2-T09, wired by V2-T11). */
  plan(req: PlanRequest): Promise<PlanItem[]>;
}

// ---------------------------------------------------------------------------
// §8 User data store (src/v2/store)
// ---------------------------------------------------------------------------

export interface TargetPatch {
  status?: LearningStatus;
  tags?: string[];
  note?: string;
  /** Increment studyCount by 1 and set lastStudiedAt. */
  studied?: boolean;
}

export interface LearningStore extends LearningStateReader {
  load(): Promise<void>;
  /** Applies one patch to many targets atomically; returns the batch id used for events. */
  apply(targets: TargetRef[], patch: TargetPatch, opts?: { sourceLabel?: string }): Promise<string>;
  undoBatch(batchId: string): Promise<number>;
  events(opts: { target?: TargetRef; since?: string; limit?: number }): Promise<LearningEvent[]>;
  subscribe(listener: () => void): () => void;
}

export type Collection =
  | { id: string; kind: 'static'; name: string; description: string; targets: TargetRef[]; createdAt: string; updatedAt: string }
  | { id: string; kind: 'dynamic'; name: string; description: string; query: LexQuery; createdAt: string; updatedAt: string };

// ---------------------------------------------------------------------------
// §9 Study planning (src/v2/planning)
// ---------------------------------------------------------------------------

export type StrategyId = 'coca_high_freq' | 'bnc_family_completion' | 'cet_syllabus' | 'custom_mix';

export interface PlanReason {
  /** Machine code, e.g. 'coca_rank', 'family_partially_mastered', 'cet_level'. */
  code: string;
  /** Human text that names the metric, e.g. "COCA 官方排名 #207 (noun)". */
  text: string;
  metric?: MetricId;
  value?: number;
}

export interface PlanItem {
  target: TargetRef;
  /** Entity that justified the pick (COCA record, BNC member, CET entry). */
  evidenceRef: EntityRef;
  score: number;
  reasons: PlanReason[];
}

export interface PlanRequest {
  strategy: StrategyId;
  size: number;
  /** Optional restriction, e.g. CET4 only, COCA rank ≤ 5000. */
  scope?: LexQuery;
  /** Statuses to exclude (default: mastered, deferred). */
  excludeStatuses?: LearningStatus[];
  /** For custom_mix: weights per strategy. */
  mix?: Partial<Record<Exclude<StrategyId, 'custom_mix'>, number>>;
}

export interface StudyPlanner {
  plan(req: PlanRequest): PlanItem[];
}
