/**
 * Lexical Workbench 2.0 — core domain types (source-aware entities + Form hub).
 * Normative description: docs/v2/ARCHITECTURE.md and docs/v2/CONTRACTS.md.
 */
import type { EntityKind, EntityRef, SourceId } from './ids.ts';

// ---------------------------------------------------------------------------
// Sources & diagnostics
// ---------------------------------------------------------------------------

export interface SourceInfo {
  id: SourceId;
  title: string;
  edition: string;
  /** Linguistic unit of the source's primary records. */
  unit: string;
  file: string;
  notes: string;
}

export const SOURCE_INFO: Record<SourceId, SourceInfo> = {
  coca2020: {
    id: 'coca2020',
    title: 'COCA 2020 lemma + PoS frequency list (top 60,000)',
    edition: '2020 / 60k',
    unit: 'lemma (headword) + part of speech',
    file: 'public/data/coca_freq.json',
    notes:
      'Each record is one headword+PoS with official Rank (1..60000, unique) and Freq. ' +
      'Inflected forms are counted under their lemma (e.g. went → go). Only the top 60k records are listed.',
  },
  bnc25k: {
    id: 'bnc25k',
    title: 'Nation BNC/COCA 25k word-family lists',
    edition: '25k (25 x 1k bands)',
    unit: 'word family (headword + member word forms)',
    file: 'public/data/BNC_COCA_lists.txt',
    notes:
      'Each line is one family with a band (1k..25k), member word forms with per-form frequency ' +
      'and the official family Total frequency. Frequencies are as printed in the list.',
  },
  cet2016: {
    id: 'cet2016',
    title: 'CET-4/6 syllabus word list (2016)',
    edition: '2016',
    unit: 'official entry (line) with expanded member spellings',
    file: 'public/data/CET2016.txt',
    notes: '★ marks CET-6 additions. Slash / parenthesis notation is expanded into spellings.',
  },
};

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface SourceDiagnostic {
  source: SourceId | 'alignment';
  severity: DiagnosticSeverity;
  /** Stable machine code, e.g. `coca.invalid_number`, `bnc.headword_not_member`. */
  code: string;
  message: string;
  /** Raw subject (headword, line excerpt) — informative only, not an identity. */
  subject?: string;
}

/** Thrown only when a payload as a whole is unusable (wrong root shape, empty file). */
export class SourceFormatError extends Error {
  constructor(
    public readonly source: SourceId,
    message: string
  ) {
    super(`[${source}] ${message}`);
    this.name = 'SourceFormatError';
  }
}

// ---------------------------------------------------------------------------
// COCA 2020
// ---------------------------------------------------------------------------

/** PoS labels exactly as they appear in coca_freq.json. Never re-map silently. */
export type CocaPos =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'number'
  | 'interjection'
  | 'preposition'
  | 'pronoun'
  | 'conjunction'
  | 'determiner'
  | 'article'
  | '+infinitive'
  | 'negation'
  | 'existential';

export const COCA_POS_VALUES: readonly CocaPos[] = [
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
];

/** One official COCA record. Source fact; immutable. */
export interface CocaLemmaPosRecord {
  ref: EntityRef; // coca2020:lp:<headword>|<pos>
  headwordRef: EntityRef; // coca2020:hw:<headword>
  formRef: EntityRef; // f:<formKey>
  /** Headword exactly as printed (e.g. "TRUE", "R&D", "n't", "climate change"). */
  headword: string;
  pos: CocaPos;
  /** Official rank, unique 1..60000. */
  rank: number;
  /** Official frequency (occurrences of this lemma+PoS in COCA). */
  freq: number;
}

/** Source-defined headword grouping of COCA records (one JSON object). */
export interface CocaHeadword {
  ref: EntityRef;
  formRef: EntityRef;
  headword: string;
  /** Child record refs, ascending by official rank. */
  lemmaPosRefs: EntityRef[];
}

export interface CocaSnapshot {
  source: 'coca2020';
  /** All valid records ascending by official rank. */
  records: CocaLemmaPosRecord[];
  /** Headwords in source order. */
  headwords: CocaHeadword[];
  diagnostics: SourceDiagnostic[];
  stats: CocaSourceStats;
}

export interface CocaSourceStats {
  headwordCount: number;
  recordCount: number;
  rankMin: number;
  rankMax: number;
  freqSum: number;
  multiPosHeadwordCount: number;
  posRecordCounts: Record<string, number>;
  posFreqSums: Record<string, number>;
  /** Headwords per number of PoS records, e.g. {1: 48324, 2: 5272, ...}. */
  posCountDistribution: Record<number, number>;
  specialSpellings: Record<SpecialSpellingClass, string[]>;
}

export type SpecialSpellingClass =
  | 'hyphen'
  | 'apostrophe'
  | 'slash'
  | 'space'
  | 'uppercase'
  | 'digit'
  | 'ampersand'
  | 'non_ascii';

// ---------------------------------------------------------------------------
// BNC/COCA 25k families
// ---------------------------------------------------------------------------

export interface BncFamily {
  ref: EntityRef; // bnc25k:fam:<headword>
  formRef: EntityRef; // Form of the family headword spelling
  headword: string;
  band: number; // 1..25
  bandLabel: string; // '1k'..'25k'
  /** Official "Total frequency" column. */
  totalFrequency: number;
  /** Sum of member frequencies as printed (diagnostic). */
  memberFrequencySum: number;
  /** Whether the headword spelling occurs in its own member list. */
  headwordIsMember: boolean;
  memberRefs: EntityRef[];
}

export interface BncMember {
  ref: EntityRef; // bnc25k:mem:<family headword>|<form>
  familyRef: EntityRef;
  formRef: EntityRef;
  /** Word form exactly as printed. */
  form: string;
  /** Per-form frequency as printed; explicit 0 retained. */
  frequency: number;
  isFamilyHeadword: boolean;
}

export interface BncSnapshot {
  source: 'bnc25k';
  families: BncFamily[];
  members: BncMember[];
  diagnostics: SourceDiagnostic[];
}

// ---------------------------------------------------------------------------
// CET2016
// ---------------------------------------------------------------------------

export type CetLevel = 'CET4' | 'CET6';
export type CetFormRole = 'headword' | 'derivative' | 'variant';

export interface CetFormLink {
  entryRef: EntityRef;
  formRef: EntityRef;
  /** Spelling as expanded from the syllabus (case preserved, e.g. "May"). */
  surface: string;
  rawMember: string;
  role: CetFormRole;
  level: CetLevel;
  homographNumber: number | null;
  expansionRule: string;
}

export interface CetEntry {
  ref: EntityRef; // cet2016:ent:<headword display>
  display: string;
  /** Entry level = level of its first (representative) member. */
  level: CetLevel;
  rawLine: string;
  links: CetFormLink[];
}

export interface CetSnapshot {
  source: 'cet2016';
  entries: CetEntry[];
  diagnostics: SourceDiagnostic[];
}

// ---------------------------------------------------------------------------
// Form hub, relations
// ---------------------------------------------------------------------------

/**
 * Form = orthographic hub keyed by formKey. It is NOT a lexeme and carries no meaning;
 * it records which source units use this spelling.
 */
export interface FormNode {
  ref: EntityRef;
  key: string;
  /** Distinct printed spellings per source (case/diacritics as printed). */
  surfaces: { source: SourceId; surface: string }[];
  cocaHeadwordRef: EntityRef | null;
  bncMemberRefs: EntityRef[];
  /** Family whose headword spelling equals this form (not membership). */
  bncFamilyHeadedRef: EntityRef | null;
  cetLinks: CetFormLink[];
}

export type RelationType =
  // source facts
  | 'coca_headword_has_record'
  | 'bnc_family_has_member'
  | 'cet_entry_has_form'
  // computed deterministic
  | 'spelling_exact'
  | 'spelling_casefold'
  // candidates — never merged automatically
  | 'candidate_diacritic_variant'
  | 'candidate_hyphen_variant';

export type RelationProvenance = 'source' | 'computed' | 'candidate';

export interface LexicalRelation {
  type: RelationType;
  from: EntityRef;
  to: EntityRef;
  provenance: RelationProvenance;
  source?: SourceId;
  evidence?: string;
}

export interface EntitySummary {
  ref: EntityRef;
  kind: EntityKind;
  label: string;
}
