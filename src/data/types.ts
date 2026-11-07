export type LearningStatus = 'unrated' | 'queued' | 'learning' | 'mastered' | 'deferred';

export const LEARNING_STATUS_META: Record<
  LearningStatus,
  { label: string; shortLabel: string; description: string; badgeClass: string; dotClass: string }
> = {
  unrated: {
    label: '未评估',
    shortLabel: '未评',
    description: '尚未人工处理（默认状态）',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
    dotClass: 'bg-slate-400 dark:bg-slate-500',
  },
  queued: {
    label: '待学',
    shortLabel: '待学',
    description: '已筛出，准备放入近期学习计划',
    badgeClass:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70',
    dotClass: 'bg-amber-500',
  },
  learning: {
    label: '学习中',
    shortLabel: '在学',
    description: '正在其他词汇书、背单词软件或阅读中重点接触',
    badgeClass:
      'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/70',
    dotClass: 'bg-blue-600 dark:bg-blue-400',
  },
  mastered: {
    label: '已掌握',
    shortLabel: '掌握',
    description: '已认识并基本掌握',
    badgeClass:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70',
    dotClass: 'bg-emerald-600 dark:bg-emerald-400',
  },
  deferred: {
    label: '暂缓',
    shortLabel: '暂缓',
    description: '当前不优先学习，例如专有名词、超低频词或暂不需要的词形',
    badgeClass:
      'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/70',
    dotClass: 'bg-purple-500',
  },
};

export type ExpansionRuleType =
  | 'exact'
  | 'slash_parallel'
  | 'slash_suffix'
  | 'paren_optional'
  | 'combined_paren_slash'
  | 'homograph'
  | 'phrase'
  | 'unexpanded_ambiguous';

export interface CetMemberItem {
  rawText: string;
  cleanRaw: string;
  isRepresentative: boolean;
  isCet6Star: boolean;
  homographNumber: number | null;
  expandedForms: string[];
  expansionRule: ExpansionRuleType;
  expansionNotes: string;
  isAmbiguous: boolean;
}

export interface CetOfficialEntry {
  id: string;
  lineNumber: number;
  rawLine: string;
  isCet6: boolean;
  level: 'CET4' | 'CET6';
  headwordRaw: string;
  headwordDisplay: string;
  members: CetMemberItem[];
}

export interface BncCocaMember {
  word: string;
  normalized: string;
  frequency: number;
  isHeadword: boolean;
  isZeroFrequency: boolean;
}

export interface BncCocaFamily {
  id: string;
  band: string; // '1k' .. '25k'
  bandNumber: number; // 1 .. 25
  headword: string;
  normalizedHeadword: string;
  totalFrequency: number;
  calculatedSum: number;
  hasSumMismatch: boolean;
  members: BncCocaMember[];
  cetMemberCount: number;
  cet4MemberCount: number;
  cet6MemberCount: number;
}

export interface BncFamilyMembership {
  familyId: string;
  headword: string;
  band: string;
  bandNumber: number;
  frequency: number;
  familyFrequency: number;
  isHeadword: boolean;
  isZeroFrequency: boolean;
}

export type CrossSourceMatchType =
  | 'exact'
  | 'case_insensitive'
  | 'uk_us_variant'
  | 'abbreviation_expansion'
  | 'phrase_reference'
  | 'unmatched';

export interface CetWordReference {
  entryId: string;
  lineNumber: number;
  rawLine: string;
  rawMember: string;
  level: 'CET4' | 'CET6';
  homographNumber: number | null;
  role: 'headword' | 'derivative' | 'variant';
  representativeHeadword: string;
  peerForms: string[];
  expansionRule: ExpansionRuleType;
  expansionNotes: string;
}

export interface LexiconWordItem {
  id: string; // normalized lowercase key
  word: string; // display spelling
  normalized: string;
  isPhrase: boolean;
  hasCapitalVariant: boolean;
  displayVariants: string[]; // e.g., ['color', 'colour'] or ['May', 'may']

  // BNC/COCA attributes
  inBnc: boolean; // true ONLY when this exact spelling (case-insensitive) exists in BNC/COCA
  hasExactBncForm?: boolean; // alias for clarity: true when independently recorded in BNC/COCA
  bncLinkedViaVariant?: boolean; // true when not in BNC/COCA directly, but linked to a BNC family via CET sibling variant
  familyId: string | null;
  headword: string | null;
  band: string | null;
  bandNumber: number | null;
  formFrequency: number | null; // null when not independently in BNC/COCA; 0 only when explicitly (0) in BNC/COCA
  familyFrequency: number | null;
  isHeadword: boolean;
  familyMemberCount: number | null;
  familyCetMemberCount: number;
  bncMemberships?: BncFamilyMembership[]; // supports words appearing in multiple BNC families (e.g., grannies)
  matchType: CrossSourceMatchType;
  matchConfidence: 'high' | 'medium' | 'ambiguous' | 'none';
  matchNote: string | null;
  relatedPhraseCoreWord: string | null;

  // CET2016 attributes
  inCet: boolean;
  isCet4: boolean;
  isCet6: boolean;
  isCet6Only: boolean;
  cetLevels: ('CET4' | 'CET6')[];
  cetRefs: CetWordReference[];
  homographNumbers: number[];
}

export interface DataDiagnosticItem {
  id: string;
  source: 'CET2016' | 'BNC_COCA' | 'CROSS_MATCH';
  severity: 'info' | 'warning' | 'ambiguous';
  category:
    | 'slash_expansion'
    | 'paren_expansion'
    | 'homograph'
    | 'ambiguous_spelling'
    | 'phrase_entry'
    | 'case_sensitivity'
    | 'sum_mismatch'
    | 'zero_frequency'
    | 'unmatched_cet'
    | 'multi_family_member';
  rawText: string;
  lineNumber?: number;
  parsedResult: string[];
  explanation: string;
}

export interface DataDiagnosticsReport {
  generatedAt: string;
  cetTotalLines: number;
  cet4EntryCount: number;
  cet6EntryCount: number;
  cetTotalExpandedForms: number;
  cetDistinctWordForms: number;
  cetHomographCount: number;
  cetSlashCount: number;
  cetParenCount: number;
  cetPhraseCount: number;
  cetAmbiguousCount: number;
  cetUnmatchedInBncCount: number;
  cetVariantLinkedCount?: number;

  bncTotalLines: number;
  bncFamilyCount: number;
  bncTotalWordForms: number;
  bncDistinctWordForms?: number;
  bncZeroFreqFormCount: number;
  bncSumMismatchCount: number;
  bncBandsCount: number;

  totalDistinctLexiconWords: number;
  bothCetAndBncCount: number;
  cetOnlyCount: number;
  bncOnlyCount: number;

  items: DataDiagnosticItem[];
}

export interface LexiconDatabaseBundle {
  version: string;
  words: LexiconWordItem[];
  families: BncCocaFamily[];
  cetEntries: CetOfficialEntry[];
  diagnostics: DataDiagnosticsReport;
}

// IndexedDB User Data Models
export interface UserWordRecord {
  wordId: string; // matches LexiconWordItem.id (normalized)
  word: string;
  status: LearningStatus;
  tags: string[];
  notes: string;
  firstRecordedAt: string; // ISO date
  updatedAt: string; // ISO date
  studyCount?: number;
  lastStudiedAt?: string;
  sourceNote?: string;
}

export interface ActivityLogEntry {
  id?: number;
  batchId?: string;
  timestamp: string; // ISO timestamp
  wordId: string;
  word: string;
  actionType:
    | 'status_change'
    | 'tags_change'
    | 'note_change'
    | 'batch_import'
    | 'study_touch'
    | 'manual_Rollback';
  previousStatus?: LearningStatus;
  newStatus?: LearningStatus;
  previousTags?: string[];
  newTags?: string[];
  previousNotes?: string;
  newNotes?: string;
  sourceLabel?: string;
}

export interface FilterCriteria {
  searchQuery: string;
  sourceFilter:
    | 'all'
    | 'cet_all'
    | 'cet4'
    | 'cet6'
    | 'cet6_new'
    | 'bnc_all'
    | 'both_cet_bnc'
    | 'cet_only'
    | 'bnc_only';
  bands: number[]; // empty = all bands, otherwise [1, 2, 3...]
  minBand: number | null;
  maxBand: number | null;
  minFormFreq: number | null;
  maxFormFreq: number | null;
  minFamilyFreq: number | null;
  maxFamilyFreq: number | null;
  includeUnrankedFreq: boolean;
  includeZeroFreq: boolean;
  statuses: LearningStatus[]; // empty = all
  tags: string[]; // empty = all
  tagFilterMode: 'any' | 'all' | 'untagged';
  familyFilter:
    | 'all'
    | 'headword_only'
    | 'derived_only'
    | 'has_cet_peers'
    | 'high_freq_unmastered_member'
    | 'high_family_low_form'
    | 'single_member_family'
    | 'large_family';
  phrasesOnly: boolean;
  homographsOnly: boolean;
}

export type SortField =
  | 'priority_weight_desc'
  | 'word_asc'
  | 'word_desc'
  | 'form_freq_desc'
  | 'form_freq_asc'
  | 'family_freq_desc'
  | 'family_freq_asc'
  | 'band_asc'
  | 'band_desc'
  | 'updated_desc'
  | 'first_recorded_desc';

export interface WordCollection {
  id: string;
  name: string;
  description: string;
  type: 'static' | 'dynamic' | 'study_plan';
  wordIds: string[]; // used for static & study_plan
  filterCriteria?: FilterCriteria; // used for dynamic
  sortField?: SortField;
  planMetadata?: {
    targetCount: number;
    formulaDescription: string;
    createdAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DictionaryTemplate {
  id: string;
  name: string;
  shortName: string;
  description: string;
  urlTemplate: string; // uses {word}
  enabled: boolean;
  isBuiltIn: boolean;
}
