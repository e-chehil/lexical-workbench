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
    label: '待学习',
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

export type CocaRawPos =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'preposition'
  | 'pronoun'
  | 'conjunction'
  | 'determiner'
  | 'article'
  | 'number'
  | 'interjection'
  | 'negation'
  | '+infinitive'
  | 'existential'
  | string;

export const COCA_POS_META: Record<
  string,
  {
    zh: string;
    shortZh: string;
    label: string;
    shortLabel: string;
    abbr: string;
    category: 'content' | 'function';
    badgeClass: string;
  }
> = {
  noun: {
    zh: '名词 (noun)',
    shortZh: '名词',
    label: '名词 (noun)',
    shortLabel: 'n. 名词',
    abbr: 'n.',
    category: 'content',
    badgeClass:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/70',
  },
  verb: {
    zh: '动词 (verb)',
    shortZh: '动词',
    label: '动词 (verb)',
    shortLabel: 'v. 动词',
    abbr: 'v.',
    category: 'content',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70',
  },
  adjective: {
    zh: '形容词 (adjective)',
    shortZh: '形容词',
    label: '形容词 (adj.)',
    shortLabel: 'adj. 形容词',
    abbr: 'adj.',
    category: 'content',
    badgeClass:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70',
  },
  adverb: {
    zh: '副词 (adverb)',
    shortZh: '副词',
    label: '副词 (adv.)',
    shortLabel: 'adv. 副词',
    abbr: 'adv.',
    category: 'content',
    badgeClass:
      'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/70',
  },
  number: {
    zh: '数词 (number)',
    shortZh: '数词',
    label: '数词 (num.)',
    shortLabel: 'num. 数词',
    abbr: 'num.',
    category: 'content',
    badgeClass:
      'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800/70',
  },
  interjection: {
    zh: '感叹词 (interjection)',
    shortZh: '感叹词',
    label: '感叹词 (interj.)',
    shortLabel: 'interj. 感叹',
    abbr: 'interj.',
    category: 'function',
    badgeClass:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/70',
  },
  preposition: {
    zh: '介词 (preposition)',
    shortZh: '介词',
    label: '介词 (prep.)',
    shortLabel: 'prep. 介词',
    abbr: 'prep.',
    category: 'function',
    badgeClass:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/70',
  },
  pronoun: {
    zh: '代词 (pronoun)',
    shortZh: '代词',
    label: '代词 (pron.)',
    shortLabel: 'pron. 代词',
    abbr: 'pron.',
    category: 'function',
    badgeClass:
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/70',
  },
  conjunction: {
    zh: '连词 (conjunction)',
    shortZh: '连词',
    label: '连词 (conj.)',
    shortLabel: 'conj. 连词',
    abbr: 'conj.',
    category: 'function',
    badgeClass:
      'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/70',
  },
  determiner: {
    zh: '限定词 (determiner)',
    shortZh: '限定词',
    label: '限定词 (det.)',
    shortLabel: 'det. 限定',
    abbr: 'det.',
    category: 'function',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
  article: {
    zh: '冠词/物主限定词 (article)',
    shortZh: '冠词',
    label: '冠词 (art.)',
    shortLabel: 'art. 冠词',
    abbr: 'art.',
    category: 'function',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
  negation: {
    zh: '否定词 (negation)',
    shortZh: '否定词',
    label: '否定词 (neg.)',
    shortLabel: 'neg. 否定',
    abbr: 'neg.',
    category: 'function',
    badgeClass:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70',
  },
  '+infinitive': {
    zh: '不定式标记 (+infinitive)',
    shortZh: '不定式标记',
    label: '不定式标记 (+inf.)',
    shortLabel: '+inf. 不定式',
    abbr: '+inf.',
    category: 'function',
    badgeClass:
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800/70',
  },
  existential: {
    zh: '存在句标记 (existential)',
    shortZh: '存在句标记',
    label: '存在句标记 (exist.)',
    shortLabel: 'exist. 存在',
    abbr: 'exist.',
    category: 'function',
    badgeClass:
      'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 dark:border-fuchsia-800/70',
  },
};

export function getCocaPosMeta(pos: string): {
  zh: string;
  shortZh: string;
  label: string;
  shortLabel: string;
  abbr: string;
  category: 'content' | 'function';
  badgeClass: string;
} {
  return (
    COCA_POS_META[pos] || {
      zh: `${pos}`,
      shortZh: pos,
      label: pos,
      shortLabel: pos,
      abbr: pos,
      category: 'content',
      badgeClass:
        'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    }
  );
}

/**
 * Raw JSON item from coca_freq.json
 */
export interface CocaRawJsonEntry {
  headword: string;
  content: {
    PoS: string;
    Rank: string;
    Freq: string;
  }[];
}

/**
 * 3.2 Lexeme — 词元（词头 + 原始 COCA 词性记录）
 * Represents one of the 60,000 official COCA 2020 lemma+PoS records.
 */
export interface CocaLexemeRecord {
  id: string; // e.g., "lexeme:work:verb"
  headword: string; // Original spelling from COCA, e.g., "work", "TRUE", "R&D", "climate change"
  normalizedHeadword: string; // e.g., "work", "true", "r&d", "climate change"
  pos: string; // Raw COCA PoS ("verb", "noun", "+infinitive", etc.)
  posZh: string; // Chinese label ("动词", "名词", etc.)
  posAbbr: string; // "v.", "n.", etc.
  rank: number; // Official COCA 1..60000 rank
  frequency: number; // Official COCA lemma+PoS frequency
  headwordTotalFreq: number; // Sum of frequencies across all PoS of this headword
  headwordDerivedRank: number; // Competition rank among 53,951 distinct COCA headwords
  headwordPosCount: number; // Number of PoS entries for this headword in COCA
  shareInHeadwordPct: number; // 0..100 percentage of headwordTotalFreq
  isPrimaryPos: boolean; // True if highest-frequency PoS for this headword
  // Cross-source alignment (only when exact or verified variant match exists)
  inBnc: boolean;
  bncFamilyId: string | null;
  bncHeadword: string | null;
  bncBand: string | null;
  bncBandNumber: number | null;
  bncFormFrequency: number | null;
  bncFamilyFrequency: number | null;
  inCet: boolean;
  isCet4: boolean;
  isCet6: boolean;
  isCet6Only: boolean;
  cetLevels: ('CET4' | 'CET6')[];
}

/**
 * 3.4 Lexical Relation — 可追溯词汇关系
 */
export type LexicalRelationType =
  | 'realizes_lexeme'
  | 'belongs_to_family'
  | 'inflection_of'
  | 'derivation_of'
  | 'spelling_variant_of'
  | 'included_in_official_entry'
  | 'related_to';

export interface LexicalRelation {
  id: string;
  sourceId: string;
  sourceLabel: string;
  sourceEntityType: 'form' | 'lexeme' | 'family' | 'official_entry';
  targetId: string;
  targetLabel: string;
  targetEntityType: 'form' | 'lexeme' | 'family' | 'official_entry';
  relationType: LexicalRelationType;
  datasetSource: 'CET2016' | 'BNC_COCA_2.0' | 'COCA_2020' | 'CROSS_SOURCE_ALIGNMENT';
  isExplicit: boolean; // true = explicitly recorded in source dataset; false = rule/heuristic reference
  confidence: 'high' | 'medium';
  explanation: string;
}

/**
 * 4. Corpus Observation — 独立语料统计证据层
 */
export type CorpusMetricType =
  | 'BNC_FORM_FREQ'
  | 'BNC_FAMILY_FREQ'
  | 'NATION_BAND'
  | 'COCA_LEMMA_POS_FREQ'
  | 'COCA_LEMMA_POS_RANK'
  | 'COCA_HEADWORD_TOTAL_FREQ'
  | 'COCA_HEADWORD_DERIVED_RANK';

export interface CorpusObservation {
  id: string;
  datasetSource: 'BNC_COCA_2.0' | 'COCA_2020' | 'DERIVED_COCA_2020';
  datasetVersion: string;
  targetId: string;
  targetLabel: string;
  targetEntityType: 'form' | 'lexeme' | 'headword' | 'family';
  metric: CorpusMetricType;
  unitLabel: string;
  value: number | string;
  isRaw: boolean;
  isDerived: boolean;
  formulaOrNote: string;
}

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
  // COCA 2.0 enrichment on BNC families
  cocaMatchedMemberCount?: number;
  headwordCocaRank?: number | null; // Derived headword rank of the family headword in COCA 2020
  headwordCocaFreq?: number | null; // Total COCA frequency of the family headword
  headwordBestPosRank?: number | null; // Best single-PoS COCA rank of the family headword
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

/**
 * Per-PoS COCA summary attached to a Form/Headword when and only when
 * that exact normalized spelling exists as a headword in COCA 2020.
 */
export interface CocaPosBreakdownItem {
  lexemeId: string;
  pos: string;
  posZh: string;
  posAbbr: string;
  rank: number;
  frequency: number;
  sharePct: number; // 0..100
  isPrimary: boolean;
}

/**
 * Unified Form / Headword entity in the lexical database.
 * Strictly separates BNC Form observations, BNC Family observations,
 * and COCA 2020 Lemma+PoS / Derived Headword observations.
 */
export interface LexiconWordItem {
  id: string; // normalized lowercase key (preserves spaces, hyphens, slashes, apostrophes, '&')
  word: string; // canonical display spelling (preserves original case like 'TRUE', 'R&D')
  normalized: string;
  isPhrase: boolean;
  hasCapitalVariant: boolean;
  displayVariants: string[]; // e.g., ['color', 'colour'] or ['TRUE', 'true']
  hasHyphen?: boolean;
  hasSlash?: boolean;
  hasApostrophe?: boolean;

  // BNC/COCA 2.0 attributes
  inBnc: boolean; // true ONLY when this exact spelling (case-insensitive) exists in BNC/COCA
  hasExactBncForm?: boolean;
  bncLinkedViaVariant?: boolean; // true when linked to a BNC family via CET sibling variant
  familyId: string | null;
  headword: string | null;
  band: string | null;
  bandNumber: number | null;
  formFrequency: number | null; // null when not independently in BNC/COCA; 0 only when explicitly (0) in BNC/COCA
  familyFrequency: number | null;
  isHeadword: boolean;
  familyMemberCount: number | null;
  familyCetMemberCount: number;
  bncMemberships?: BncFamilyMembership[];
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

  // COCA 2020 attributes (STRICTLY populated ONLY when this exact normalized form is a COCA headword!)
  inCoca?: boolean;
  cocaLinkedViaVariant?: boolean; // true if not directly in COCA, but a CET sibling variant (e.g. colour -> color) is in COCA
  cocaCanonicalVariant?: string | null; // e.g. 'color' for 'colour'
  cocaHeadwordTotalFreq?: number | null; // Sum of all PoS frequencies in COCA 2020 (derived)
  cocaHeadwordDerivedRank?: number | null; // Competition rank among 53,951 COCA headwords (derived)
  cocaBestPosRank?: number | null; // Best (minimum) official rank among PoS records (1..60,000)
  cocaPrimaryPos?: string | null; // Primary PoS in COCA 2020
  cocaPrimaryPosFreq?: number | null;
  cocaPosCount?: number; // Number of distinct PoS records in COCA 2020
  cocaPosEntropy?: number; // Shannon entropy across PoS distribution (0 for single-PoS)
  cocaDominantPosSharePct?: number; // Percentage share of the primary PoS (0..100)
  cocaLexemes?: CocaPosBreakdownItem[]; // Detailed PoS records for this headword
}

export interface DataDiagnosticItem {
  id: string;
  source: 'CET2016' | 'BNC_COCA' | 'COCA2020' | 'CROSS_MATCH';
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
    | 'multi_family_member'
    | 'coca_multi_pos'
    | 'coca_special_orthography'
    | 'coca_variant_alignment';
  rawText: string;
  lineNumber?: number;
  parsedResult: string[];
  explanation: string;
}

export interface ThreeSourceVennSummary {
  totalDistinctForms: number;
  cetDistinctForms: number;
  bncDistinctForms: number;
  cocaDistinctHeadwords: number;
  cocaTotalLexemes: number;
  // Exact 7 Venn disjoint regions on normalized forms
  allThreeCount: number; // CET ∩ BNC ∩ COCA
  cetAndBncOnlyCount: number; // (CET ∩ BNC) \ COCA
  cetAndCocaOnlyCount: number; // (CET ∩ COCA) \ BNC
  bncAndCocaOnlyCount: number; // (BNC ∩ COCA) \ CET
  cetOnlyExactCount: number; // CET \ (BNC ∪ COCA)
  bncOnlyExactCount: number; // BNC \ (CET ∪ COCA)
  cocaOnlyExactCount: number; // COCA \ (CET ∪ BNC)
  // Pairwise totals
  bncAndCocaIntersection: number; // 35,144
  cetAndCocaIntersection: number; // 7,900
  cetAndBncIntersection: number; // 7,808 exact (+17 variant-linked = 7,825)
  bncHeadwordsInCocaCount: number; // 18,774
  cetVariantLinkedToCocaCount: number; // 73
  cetTrulyMissingFromCocaCount: number; // 41
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

  // COCA 2020 Audit Metrics
  cocaHeadwordCount?: number;
  cocaLexemeRecordCount?: number;
  cocaTotalTokenFrequency?: number;
  cocaRankMin?: number;
  cocaRankMax?: number;
  cocaHasCompleteRankRange?: boolean;
  cocaHyphenatedHeadwordCount?: number;
  cocaMultiPosHeadwordCount?: number;
  cocaMultiWordHeadwordCount?: number;
  cocaCapitalizedHeadwordCount?: number;
  cocaPosDistribution?: Record<string, { count: number; totalFreq: number }>;

  // 3-Source Alignment Summary
  venn?: ThreeSourceVennSummary;

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
  cocaLexemes?: CocaLexemeRecord[]; // 60,000 official COCA 2020 lemma+PoS records
  diagnostics: DataDiagnosticsReport;
}

// IndexedDB User Data Models (Supports both word/headword level and PoS lexeme level!)
export interface UserWordRecord {
  wordId: string; // matches LexiconWordItem.id (normalized)
  word: string;
  status: LearningStatus; // Overall headword / word-form status set explicitly by user
  posStatuses?: Record<string, LearningStatus>; // Explicit per-PoS statuses (e.g., { verb: 'learning', noun: 'mastered' })
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
  targetPos?: string; // If this log modified a specific PoS status
  actionType:
    | 'status_change'
    | 'pos_status_change'
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
  previousStudyCount?: number;
  newStudyCount?: number;
  previousLastStudiedAt?: string;
  newLastStudiedAt?: string;
  existedBefore?: boolean;
  sourceLabel?: string;
}

export type ExploreEntityViewMode =
  | 'headwords'
  | 'lexemes'
  | 'forms'
  | 'families'
  | 'official_entries';

export type SourceFilterOption =
  | 'all'
  | 'cet_all'
  | 'cet4'
  | 'cet6'
  | 'cet6_new'
  | 'bnc_all'
  | 'coca_all'
  | 'both_cet_bnc'
  | 'both_cet_coca'
  | 'both_bnc_coca'
  | 'all_three_sources'
  | 'cet_only'
  | 'bnc_only'
  | 'coca_only'
  | 'cet_not_in_coca';

export interface FilterCriteria {
  searchQuery: string;
  searchMatchMode?: 'auto' | 'exact' | 'prefix' | 'contains' | 'fuzzy';
  sourceFilter: SourceFilterOption;
  bands: number[]; // empty = all bands, otherwise [1, 2, 3...]
  minBand: number | null;
  maxBand: number | null;
  minFormFreq: number | null;
  maxFormFreq: number | null;
  minFamilyFreq: number | null;
  maxFamilyFreq: number | null;
  includeUnrankedFreq: boolean;
  includeZeroFreq: boolean;
  // COCA 2020 filters
  cocaRankMode?: 'lemma_pos' | 'derived_headword';
  minCocaRank?: number | null;
  maxCocaRank?: number | null;
  minCocaFreq?: number | null;
  maxCocaFreq?: number | null;
  cocaPosFilter?: string[]; // empty = all PoS, otherwise ['noun', 'verb', ...]
  cocaMultiPosOnly?: boolean;
  // Learning & Tag filters
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
  | 'coca_rank_asc'
  | 'coca_rank_desc'
  | 'coca_freq_desc'
  | 'coca_freq_asc'
  | 'coca_pos_count_desc'
  | 'word_asc'
  | 'word_desc'
  | 'alpha_asc'
  | 'form_freq_desc'
  | 'form_freq_asc'
  | 'family_freq_desc'
  | 'family_freq_asc'
  | 'band_asc'
  | 'band_desc'
  | 'updated_desc'
  | 'first_recorded_desc';

export type SortOption = SortField;

export type NavigationTab =
  | 'explore'
  | 'corpus_lab'
  | 'families'
  | 'study'
  | 'insights'
  | 'data_studio'
  | 'collections'
  | 'activity'
  | 'analytics'
  | 'settings';

export interface WordCollection {
  id: string;
  name: string;
  description: string;
  type: 'static' | 'dynamic' | 'study_plan';
  entityType?: 'headword' | 'lexeme' | 'form' | 'mixed'; // Explicitly records managed entity level
  wordIds: string[]; // used for static & study_plan
  lexemeIds?: string[]; // optional when entityType === 'lexeme'
  filterCriteria?: FilterCriteria; // used for dynamic
  sortField?: SortField;
  planMetadata?: {
    targetCount: number;
    strategyId?: string;
    strategyMode?: string;
    weights?: unknown;
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
