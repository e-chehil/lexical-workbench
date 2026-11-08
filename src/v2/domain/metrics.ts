/**
 * Lexical Workbench 2.0 — Observation metric registry.
 *
 * ADR-005: every number shown to users comes from exactly one MetricId. There is no generic
 * "frequency" field anywhere in v2. A missing observation (null) means "not observed / not
 * listed by this source"; 0 is only stored when the source explicitly prints 0.
 */
import type { EntityKind, SourceId } from './ids.ts';

export type MetricId =
  // BNC/COCA 25k — official
  | 'bnc25k.member_freq'
  | 'bnc25k.family_total'
  | 'bnc25k.family_band'
  // BNC/COCA 25k — derived
  | 'bnc25k.member_share_of_family'
  // COCA 2020 — official
  | 'coca2020.lp_freq'
  | 'coca2020.lp_rank'
  // COCA 2020 — derived
  | 'coca2020.lp_share_of_headword'
  | 'coca2020.hw_freq_sum'
  | 'coca2020.hw_rank'
  | 'coca2020.hw_best_lp_rank'
  | 'coca2020.hw_pos_count';

export type MetricUnit = 'occurrences' | 'rank' | 'band' | 'ratio' | 'count';
export type MetricProvenance = 'official' | 'derived';

export interface MetricDefinition {
  id: MetricId;
  source: SourceId;
  /** Entity kind the value is attached to. */
  targetKind: EntityKind;
  provenance: MetricProvenance;
  unit: MetricUnit;
  /** UI label. Derived metrics MUST keep the "（计算）" suffix in UI. */
  label: string;
  /** True when a larger value means more frequent (false for rank/band). */
  largerIsMoreFrequent: boolean;
  definition: string;
  /** For ranks: how ties are resolved. */
  tieRule?: string;
  /** What a missing value means for this metric. */
  missing: string;
}

export const METRICS: Record<MetricId, MetricDefinition> = {
  'bnc25k.member_freq': {
    id: 'bnc25k.member_freq',
    source: 'bnc25k',
    targetKind: 'bnc_member',
    provenance: 'official',
    unit: 'occurrences',
    label: 'BNC 词形频次',
    largerIsMoreFrequent: true,
    definition:
      'Frequency printed after a member word form inside one family line. Attached to the ' +
      'membership, not the form: the same form can carry different values in different families ' +
      '(grannies: 17 in grandfather, 45 in granny).',
    missing: 'Form is not a member of that family. Explicit (0) is stored as 0.',
  },
  'bnc25k.family_total': {
    id: 'bnc25k.family_total',
    source: 'bnc25k',
    targetKind: 'bnc_family',
    provenance: 'official',
    unit: 'occurrences',
    label: 'BNC 词族总频次',
    largerIsMoreFrequent: true,
    definition: 'Official "Total frequency" column of the family line. Never attributed to a form.',
    missing: 'Not applicable (every family has a total).',
  },
  'bnc25k.family_band': {
    id: 'bnc25k.family_band',
    source: 'bnc25k',
    targetKind: 'bnc_family',
    provenance: 'official',
    unit: 'band',
    label: 'BNC/COCA 词族频段',
    largerIsMoreFrequent: false,
    definition: 'Nation list band number 1..25 (1k..25k). Ordinal, not a frequency.',
    missing: 'Not applicable.',
  },
  'bnc25k.member_share_of_family': {
    id: 'bnc25k.member_share_of_family',
    source: 'bnc25k',
    targetKind: 'bnc_member',
    provenance: 'derived',
    unit: 'ratio',
    label: '族内占比（计算）',
    largerIsMoreFrequent: true,
    definition: 'member_freq / family_total of the same family line. 0 when member_freq is 0.',
    missing: 'family_total is 0.',
  },
  'coca2020.lp_freq': {
    id: 'coca2020.lp_freq',
    source: 'coca2020',
    targetKind: 'coca_lemma_pos',
    provenance: 'official',
    unit: 'occurrences',
    label: 'COCA 词性频次',
    largerIsMoreFrequent: true,
    definition: 'Official Freq of one headword+PoS record (lemmatised: went counts under go).',
    missing: 'Record not in the top-60k list (true frequency unknown, may be > 0).',
  },
  'coca2020.lp_rank': {
    id: 'coca2020.lp_rank',
    source: 'coca2020',
    targetKind: 'coca_lemma_pos',
    provenance: 'official',
    unit: 'rank',
    label: 'COCA 官方排名',
    largerIsMoreFrequent: false,
    definition: 'Official Rank of the headword+PoS record, 1..60000.',
    tieRule: 'Official; unique in the source (no ties). Equal Freq values have distinct ranks.',
    missing: 'Record not in the top-60k list.',
  },
  'coca2020.lp_share_of_headword': {
    id: 'coca2020.lp_share_of_headword',
    source: 'coca2020',
    targetKind: 'coca_lemma_pos',
    provenance: 'derived',
    unit: 'ratio',
    label: '词性占比（计算）',
    largerIsMoreFrequent: true,
    definition: 'lp_freq / hw_freq_sum of its headword, within the listed records only.',
    missing: 'Never missing for listed records.',
  },
  'coca2020.hw_freq_sum': {
    id: 'coca2020.hw_freq_sum',
    source: 'coca2020',
    targetKind: 'coca_headword',
    provenance: 'derived',
    unit: 'occurrences',
    label: 'COCA 词头合计频次（计算）',
    largerIsMoreFrequent: true,
    definition:
      'Sum of lp_freq over all LISTED records of the headword. A lower bound: PoS records ' +
      'ranked beyond 60,000 are absent from the source.',
    missing: 'Headword not in the list.',
  },
  'coca2020.hw_rank': {
    id: 'coca2020.hw_rank',
    source: 'coca2020',
    targetKind: 'coca_headword',
    provenance: 'derived',
    unit: 'rank',
    label: 'COCA 词头综合排名（计算）',
    largerIsMoreFrequent: false,
    definition: 'Ordinal 1..N over headwords sorted by hw_freq_sum descending.',
    tieRule:
      'Ties on hw_freq_sum are broken by hw_best_lp_rank ascending (unique official rank), ' +
      'so the ordinal is unique and reproducible.',
    missing: 'Headword not in the list.',
  },
  'coca2020.hw_best_lp_rank': {
    id: 'coca2020.hw_best_lp_rank',
    source: 'coca2020',
    targetKind: 'coca_headword',
    provenance: 'derived',
    unit: 'rank',
    label: 'COCA 最佳词性排名（计算）',
    largerIsMoreFrequent: false,
    definition: 'Minimum official lp_rank among the headword records (= rank of its top PoS).',
    tieRule: 'Inherits uniqueness from official ranks.',
    missing: 'Headword not in the list.',
  },
  'coca2020.hw_pos_count': {
    id: 'coca2020.hw_pos_count',
    source: 'coca2020',
    targetKind: 'coca_headword',
    provenance: 'derived',
    unit: 'count',
    label: 'COCA 词性数（计算）',
    largerIsMoreFrequent: true,
    definition: 'Number of listed PoS records for the headword (1..6).',
    missing: 'Headword not in the list.',
  },
};

export function getMetric(id: MetricId): MetricDefinition {
  return METRICS[id];
}

/** UI helper: label with derived marker guaranteed. */
export function metricDisplayLabel(id: MetricId): string {
  const m = METRICS[id];
  return m.provenance === 'derived' && !m.label.includes('（计算）') ? `${m.label}（计算）` : m.label;
}

/** Columnar observation store. One map per metric for O(1) lookup and cheap sorting. */
export type ObservationStore = Record<MetricId, Map<string, number>>;

export function createObservationStore(): ObservationStore {
  const store = {} as ObservationStore;
  for (const id of Object.keys(METRICS) as MetricId[]) store[id] = new Map();
  return store;
}
