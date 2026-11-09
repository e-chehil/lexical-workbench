import { getCocaPosMeta } from './types.ts';
import type {
  BncCocaFamily,
  CetOfficialEntry,
  CocaLexemeRecord,
  DictionaryTemplate,
  FilterCriteria,
  LearningStatus,
  LexiconWordItem,
  SortField,
  UserWordRecord,
} from './types.ts';

export const DEFAULT_FILTER_CRITERIA: FilterCriteria = {
  searchQuery: '',
  searchMatchMode: 'auto',
  sourceFilter: 'all',
  bands: [],
  minBand: null,
  maxBand: null,
  minFormFreq: null,
  maxFormFreq: null,
  minFamilyFreq: null,
  maxFamilyFreq: null,
  includeUnrankedFreq: true,
  includeZeroFreq: true,
  cocaRankMode: 'derived_headword',
  minCocaRank: null,
  maxCocaRank: null,
  minCocaFreq: null,
  maxCocaFreq: null,
  cocaPosFilter: [],
  cocaMultiPosOnly: false,
  statuses: [],
  tags: [],
  tagFilterMode: 'any',
  familyFilter: 'all',
  phrasesOnly: false,
  homographsOnly: false,
};

export const DEFAULT_DICTIONARIES: DictionaryTemplate[] = [
  {
    id: 'cambridge_zh',
    name: 'Cambridge Dictionary (英汉双解)',
    shortName: '剑桥双解',
    description: '剑桥官方英汉双解词典，释义精准、例句地道',
    urlTemplate: 'https://dictionary.cambridge.org/dictionary/english-chinese-simplified/{word}',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'ldoce',
    name: 'Longman Dictionary (朗文当代)',
    shortName: '朗文当代',
    description: '朗文当代高级英语辞典，提供高频搭配与语料库频次标记',
    urlTemplate: 'https://www.ldoceonline.com/dictionary/{word}',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'oald',
    name: 'Oxford Learner’s (牛津高阶)',
    shortName: '牛津高阶',
    description: '牛津高阶学习词典，权威词源与学术用法搭配',
    urlTemplate: 'https://www.oxfordlearnersdictionaries.com/definition/english/{word}',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'collins',
    name: 'Collins Dictionary (柯林斯)',
    shortName: '柯林斯',
    description: '整句释义与真实语境频率星级',
    urlTemplate: 'https://www.collinsdictionary.com/dictionary/english/{word}',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'merriam_webster',
    name: 'Merriam-Webster (韦氏词典)',
    shortName: '韦氏词典',
    description: '美式英语权威词典，详尽词源与近义词辨析',
    urlTemplate: 'https://www.merriam-webster.com/dictionary/{word}',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'youdao',
    name: 'Youdao Dictionary (有道词典)',
    shortName: '有道词典',
    description: '支持四六级真题例句与中文快速检索',
    urlTemplate: 'https://dict.youdao.com/result?word={word}&lang=en',
    enabled: true,
    isBuiltIn: true,
  },
];

/**
 * Builds an external dictionary URL from a word and template.
 */
export function buildDictionaryUrl(arg1: string, arg2: string): string {
  const isArg1Template = arg1.includes('{word}') || arg1.startsWith('http');
  const template = isArg1Template ? arg1 : arg2;
  const rawWord = isArg1Template ? arg2 : arg1;

  const cleanedWord = rawWord
    .replace(/★/g, '')
    .replace(/[¹²³⁴⁵]/g, '')
    .trim();

  return template.replace('{word}', encodeURIComponent(cleanedWord));
}

export const CLOSED_CLASS_STOPWORDS = new Set([
  'the', 'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
  'of', 'and', 'a', 'an', 'in', 'to', 'have', 'has', 'had', 'having',
  'it', 'its', 'itself', 'for', 'i', 'me', 'my', 'mine', 'myself',
  'that', 'this', 'these', 'those', 'you', 'your', 'yours', 'yourself',
  'he', 'him', 'his', 'himself', 'on', 'with', 'do', 'does', 'did', 'doing', 'done',
  'at', 'by', 'not', 'but', 'from', 'they', 'them', 'their', 'theirs',
  'she', 'her', 'hers', 'or', 'as', 'what', 'which', 'who', 'whom', 'whose',
  'we', 'us', 'our', 'ours', 'can', 'could', 'will', 'would', 'shall', 'should',
  'may', 'might', 'must', 'so', 'if', 'up', 'about', 'into', 'than', 'then',
  'out', 'no', 'nor', 'yes', 'now', 'there', 'here', 'when', 'where', 'why', 'how',
  'all', 'one', 'some', 'any', 'every', 'each', 'much', 'many', 'more', 'most',
  'other', 'another', 'such', 'own', 'same', 'both', 'two', 'three', 'four', 'five',
  's', 't', 'd', 'm', 're', 've', 'll', 'oh', 'yeah', 'uh', 'um', 'ok', 'okay', "n't",
]);

/**
 * Computes study priority score & human-readable reason for sorting and batch planning.
 */
export function computeStudyPriorityScore(
  word: LexiconWordItem,
  userRecord?: UserWordRecord,
  familyMasteryRatio = 0
): { score: number; reason: string } {
  const status: LearningStatus = userRecord?.status || 'unrated';
  if (status === 'mastered' || status === 'deferred') {
    return { score: 0, reason: status === 'mastered' ? '已掌握' : '已暂缓' };
  }

  let score = 0;
  const reasons: string[] = [];

  const isStopword = word.normalized.length <= 1 || CLOSED_CLASS_STOPWORDS.has(word.normalized);
  if (isStopword) {
    score -= 900;
    reasons.push('基础功能虚词');
  }

  if (word.isCet4) {
    score += 460;
    reasons.push('CET-4 核心');
  } else if (word.isCet6) {
    score += 340;
    reasons.push('CET-6 进阶');
  }

  // COCA high-frequency signal (kept distinct from BNC band signal)
  if (word.inCoca && word.cocaHeadwordDerivedRank !== null && word.cocaHeadwordDerivedRank !== undefined) {
    if (word.cocaHeadwordDerivedRank <= 3000) {
      score += 180;
      reasons.push(`COCA #${word.cocaHeadwordDerivedRank}`);
    } else if (word.cocaHeadwordDerivedRank <= 8000) {
      score += 100;
      reasons.push(`COCA #${word.cocaHeadwordDerivedRank}`);
    } else if (word.cocaHeadwordDerivedRank <= 15000) {
      score += 45;
    }
  }

  if (word.bandNumber !== null) {
    if (word.bandNumber <= 3) {
      score += (4 - word.bandNumber) * 90 + 140;
      reasons.push(`BNC ${word.band} 高频族`);
    } else if (word.bandNumber <= 8) {
      score += (9 - word.bandNumber) * 28 + 40;
      reasons.push(`BNC ${word.band} 中高频`);
    } else if (word.bandNumber <= 15) {
      score += (16 - word.bandNumber) * 8;
    }
  }

  if (word.isHeadword) {
    score += 110;
    if ((word.familyMemberCount || 1) >= 4) {
      score += Math.min(80, (word.familyMemberCount || 1) * 6);
      reasons.push(`统领 ${word.familyMemberCount} 派生词`);
    }
  }

  if (word.formFrequency !== null && word.formFrequency > 0) {
    score += Math.round(Math.log10(word.formFrequency + 1) * 36);
  } else if (word.familyFrequency !== null && word.familyFrequency > 0) {
    score += Math.round(Math.log10(word.familyFrequency + 1) * 18);
  }

  if (familyMasteryRatio > 0 && !word.isHeadword) {
    score += Math.round(familyMasteryRatio * 140);
    reasons.push('熟词族派生拓展');
  }

  if (status === 'queued') {
    score += 85;
    reasons.push('已列入待学');
  } else if (status === 'learning') {
    score += 55;
    reasons.push('正在学习');
  }

  return {
    score: Math.max(1, Math.round(score)),
    reason: reasons.slice(0, 2).join(' · ') || '语料库拓展词',
  };
}

/**
 * Multi-Objective Study Planner Strategy Types & Explainable Candidate Scoring
 */
export type MultiObjectiveStrategyId =
  | 'coca_high_freq'
  | 'bnc_family_value'
  | 'cet_syllabus'
  | 'high_freq_gap'
  | 'family_completion'
  | 'custom_multi_objective';

export interface MultiObjectiveWeights {
  cocaWeight: number; // 0..100
  bncWeight: number; // 0..100
  cetWeight: number; // 0..100
  gapWeight: number; // 0..100
}

export interface StudyPlanCandidate {
  word: LexiconWordItem;
  status: LearningStatus;
  // Separate, transparent 0..100 dimension scores (never mixing raw corpus frequencies!)
  dimensions: {
    cocaValue: number; // 0..100 based on COCA rank
    bncFamilyValue: number; // 0..100 based on BNC band & family size
    examRelevance: number; // 0..100 based on CET-4 / CET-6 / CET family peers
    knowledgeGapValue: number; // 0..100 based on status, unmastered high-freq gap, or family completion
  };
  compositeScore: number; // Weighted sum of the 0..100 normalized dimensions
  isParetoOptimal: boolean; // True if no other candidate dominates this word across all 4 dimensions
  explainableReasons: string[];
}

export function computeMultiObjectiveStudyCandidates(
  words: LexiconWordItem[],
  familiesMap: Map<string, BncCocaFamily>,
  userRecordsMap: Map<string, UserWordRecord>,
  options: {
    strategy: MultiObjectiveStrategyId;
    customWeights?: MultiObjectiveWeights;
    excludeStopwords?: boolean;
    onlyHeadwords?: boolean;
    maxCandidatesPool?: number;
  }
): StudyPlanCandidate[] {
  const excludeStopwords = options.excludeStopwords ?? true;
  const onlyHeadwords = options.onlyHeadwords ?? false;

  // Pre-compute family mastery ratios for family_completion & gap evaluation
  const familyMasteryStats = new Map<
    string,
    { masteredCount: number; totalCount: number; ratio: number }
  >();
  for (const fam of familiesMap.values()) {
    let mastered = 0;
    for (const m of fam.members) {
      if (userRecordsMap.get(m.normalized)?.status === 'mastered') {
        mastered++;
      }
    }
    familyMasteryStats.set(fam.id, {
      masteredCount: mastered,
      totalCount: fam.members.length,
      ratio: fam.members.length > 0 ? mastered / fam.members.length : 0,
    });
  }

  let weights: MultiObjectiveWeights = {
    cocaWeight: 35,
    bncWeight: 25,
    cetWeight: 25,
    gapWeight: 15,
  };

  switch (options.strategy) {
    case 'coca_high_freq':
      weights = { cocaWeight: 70, bncWeight: 10, cetWeight: 10, gapWeight: 10 };
      break;
    case 'bnc_family_value':
      weights = { cocaWeight: 15, bncWeight: 65, cetWeight: 10, gapWeight: 10 };
      break;
    case 'cet_syllabus':
      weights = { cocaWeight: 20, bncWeight: 15, cetWeight: 55, gapWeight: 10 };
      break;
    case 'high_freq_gap':
      weights = { cocaWeight: 45, bncWeight: 20, cetWeight: 15, gapWeight: 20 };
      break;
    case 'family_completion':
      weights = { cocaWeight: 15, bncWeight: 30, cetWeight: 15, gapWeight: 40 };
      break;
    case 'custom_multi_objective':
      if (options.customWeights) {
        weights = options.customWeights;
      }
      break;
  }

  const totalW =
    Math.max(1, weights.cocaWeight + weights.bncWeight + weights.cetWeight + weights.gapWeight);

  const candidates: StudyPlanCandidate[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const rec = userRecordsMap.get(w.id);
    const status: LearningStatus = rec?.status || 'unrated';

    // Skip already mastered or deferred words
    if (status === 'mastered' || status === 'deferred') continue;

    if (excludeStopwords && (w.normalized.length <= 1 || CLOSED_CLASS_STOPWORDS.has(w.normalized))) {
      continue;
    }
    if (onlyHeadwords && !w.isHeadword && !w.inCoca) {
      continue;
    }

    // Strategy-specific hard pre-filters so each strategy focuses on relevant candidates
    if (options.strategy === 'coca_high_freq' && !w.inCoca) continue;
    if (options.strategy === 'bnc_family_value' && !w.inBnc) continue;
    if (options.strategy === 'cet_syllabus' && !w.inCet) continue;
    if (options.strategy === 'high_freq_gap') {
      const isCocaHigh = w.inCoca && (w.cocaHeadwordDerivedRank ?? 99999) <= 8000;
      const isBncHigh = w.inBnc && (w.bandNumber ?? 99) <= 4;
      if (!isCocaHigh && !isBncHigh) continue;
    }
    if (options.strategy === 'family_completion') {
      if (!w.familyId) continue;
      const famStat = familyMasteryStats.get(w.familyId);
      if (!famStat || famStat.masteredCount === 0 || famStat.masteredCount === famStat.totalCount) {
        continue;
      }
    }

    // Dimension 1: COCA High-Frequency Value (0..100)
    let cocaValue = 0;
    const cocaRank = w.cocaHeadwordDerivedRank ?? w.cocaBestPosRank ?? null;
    if (w.inCoca && cocaRank !== null) {
      if (cocaRank <= 1000) cocaValue = 100 - Math.round((cocaRank / 1000) * 8);
      else if (cocaRank <= 3000) cocaValue = 92 - Math.round(((cocaRank - 1000) / 2000) * 12);
      else if (cocaRank <= 5000) cocaValue = 80 - Math.round(((cocaRank - 3000) / 2000) * 12);
      else if (cocaRank <= 10000) cocaValue = 68 - Math.round(((cocaRank - 5000) / 5000) * 18);
      else if (cocaRank <= 20000) cocaValue = 50 - Math.round(((cocaRank - 10000) / 10000) * 20);
      else cocaValue = Math.max(5, 30 - Math.round(((cocaRank - 20000) / 40000) * 25));
      if ((w.cocaPosCount || 0) >= 3) {
        cocaValue = Math.min(100, cocaValue + 4);
      }
    }

    // Dimension 2: BNC Word Family Value (0..100)
    let bncFamilyValue = 0;
    if (w.bandNumber !== null) {
      const bandBase = Math.max(4, Math.round(((26 - w.bandNumber) / 25) * 78));
      const memberBonus = Math.min(14, (w.familyMemberCount || 1) * 2);
      const headBonus = w.isHeadword ? 8 : 0;
      bncFamilyValue = Math.min(100, bandBase + memberBonus + headBonus);
    }

    // Dimension 3: CET Exam Relevance (0..100)
    let examRelevance = 0;
    if (w.isCet4) {
      examRelevance = 100;
    } else if (w.isCet6Only || w.isCet6) {
      examRelevance = 84;
    } else if (w.familyCetMemberCount > 0) {
      examRelevance = Math.min(48, 20 + w.familyCetMemberCount * 8);
    }

    // Dimension 4: Personal Knowledge Gap & Family Completion (0..100)
    let knowledgeGapValue = 25;
    const famStat = w.familyId ? familyMasteryStats.get(w.familyId) : undefined;
    if (status === 'queued') knowledgeGapValue += 30;
    else if (status === 'learning') knowledgeGapValue += 20;

    if (famStat && famStat.masteredCount > 0 && famStat.ratio < 1) {
      knowledgeGapValue += Math.round(famStat.ratio * 42);
    }
    if ((cocaRank !== null && cocaRank <= 5000) || (w.bandNumber !== null && w.bandNumber <= 3)) {
      knowledgeGapValue += 22;
    }
    knowledgeGapValue = Math.min(100, knowledgeGapValue);

    const compositeScore = Number(
      (
        (cocaValue * weights.cocaWeight +
          bncFamilyValue * weights.bncWeight +
          examRelevance * weights.cetWeight +
          knowledgeGapValue * weights.gapWeight) /
        totalW
      ).toFixed(1)
    );

    const explainableReasons: string[] = [];
    if (w.inCoca && cocaRank !== null) {
      explainableReasons.push(
        `COCA 词头排名 #${cocaRank.toLocaleString()}${
          (w.cocaPosCount || 0) > 1 ? ` (${w.cocaPosCount}词性)` : ` (${w.cocaPrimaryPos})`
        }`
      );
    }
    if (w.isCet4) {
      explainableReasons.push('CET-4 大纲核心');
    } else if (w.isCet6) {
      explainableReasons.push(w.isCet6Only ? 'CET-6 新增核心' : 'CET-6 大纲词');
    }
    if (w.band) {
      explainableReasons.push(
        `BNC ${w.band} ${w.isHeadword ? `族首词 (统领${w.familyMemberCount || 1}词)` : `派生词 (族:${w.headword})`}`
      );
    }
    if (famStat && famStat.masteredCount > 0 && famStat.masteredCount < famStat.totalCount) {
      explainableReasons.push(
        `词族已掌握 ${famStat.masteredCount}/${famStat.totalCount} 词（补全高价值余项）`
      );
    }

    candidates.push({
      word: w,
      status,
      dimensions: {
        cocaValue,
        bncFamilyValue,
        examRelevance,
        knowledgeGapValue,
      },
      compositeScore,
      isParetoOptimal: false,
      explainableReasons,
    });
  }

  // Sort by compositeScore descending, then COCA rank ascending, then normalized
  candidates.sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
    const ra = a.word.cocaHeadwordDerivedRank ?? 999999;
    const rb = b.word.cocaHeadwordDerivedRank ?? 999999;
    if (ra !== rb) return ra - rb;
    return a.word.normalized.localeCompare(b.word.normalized);
  });

  const topPool = candidates.slice(0, options.maxCandidatesPool ?? 300);

  // Compute Pareto Frontier among the top candidate pool
  for (let i = 0; i < topPool.length; i++) {
    const a = topPool[i].dimensions;
    let dominated = false;
    for (let j = 0; j < topPool.length; j++) {
      if (i === j) continue;
      const b = topPool[j].dimensions;
      const bGeAll =
        b.cocaValue >= a.cocaValue &&
        b.bncFamilyValue >= a.bncFamilyValue &&
        b.examRelevance >= a.examRelevance &&
        b.knowledgeGapValue >= a.knowledgeGapValue;
      const bStrictOne =
        b.cocaValue > a.cocaValue ||
        b.bncFamilyValue > a.bncFamilyValue ||
        b.examRelevance > a.examRelevance ||
        b.knowledgeGapValue > a.knowledgeGapValue;
      if (bGeAll && bStrictOne) {
        dominated = true;
        break;
      }
    }
    topPool[i].isParetoOptimal = !dominated;
  }

  return topPool;
}

/**
 * Levenshtein distance <= 1 check for fuzzy search.
 */
export function isEditDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;

  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      edits++;
      if (edits > 1) return false;
      if (la > lb) i++;
      else if (lb > la) j++;
      else {
        i++;
        j++;
      }
    }
  }
  if (i < la || j < lb) edits++;
  return edits <= 1;
}

/**
 * Multi-dimensional filtering and sorting across 94k+ lexicon items (Headwords & Forms views).
 */
export function filterAndSortWords(
  words: LexiconWordItem[],
  userRecordsMap: Map<string, UserWordRecord>,
  criteria: FilterCriteria,
  sortField: SortField,
  familiesMap?: Map<string, BncCocaFamily>
): LexiconWordItem[] {
  const q = criteria.searchQuery.trim().toLowerCase();
  const cleanQ = q.replace(/★/g, '').replace(/[¹²³⁴⁵]/g, '');
  const matchMode = criteria.searchMatchMode || 'auto';
  const bandsSet = criteria.bands.length > 0 ? new Set(criteria.bands) : null;
  const statusSet = criteria.statuses.length > 0 ? new Set(criteria.statuses) : null;
  const requiredTags = criteria.tags;
  const posFilterSet =
    criteria.cocaPosFilter && criteria.cocaPosFilter.length > 0
      ? new Set(criteria.cocaPosFilter)
      : null;
  const cocaRankMode = criteria.cocaRankMode || 'derived_headword';

  let unmasteredHighFreqFamilyIds: Set<string> | null = null;
  if (criteria.familyFilter === 'high_freq_unmastered_member' && familiesMap) {
    unmasteredHighFreqFamilyIds = new Set<string>();
    for (const fam of familiesMap.values()) {
      if (fam.bandNumber <= 5) {
        unmasteredHighFreqFamilyIds.add(fam.id);
      }
    }
  }

  const result: LexiconWordItem[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const rec = userRecordsMap.get(w.id);
    const status: LearningStatus = rec?.status || 'unrated';

    // 1. Source filter (3-source aware)
    switch (criteria.sourceFilter) {
      case 'cet_all':
        if (!w.inCet) continue;
        break;
      case 'cet4':
        if (!w.isCet4) continue;
        break;
      case 'cet6':
        if (!w.isCet6) continue;
        break;
      case 'cet6_new':
        if (!w.isCet6Only) continue;
        break;
      case 'bnc_all':
        if (!w.inBnc && !w.bncLinkedViaVariant) continue;
        break;
      case 'coca_all':
        if (!w.inCoca) continue;
        break;
      case 'both_cet_bnc':
        if (!w.inCet || (!w.inBnc && !w.bncLinkedViaVariant)) continue;
        break;
      case 'both_cet_coca':
        if (!w.inCet || !w.inCoca) continue;
        break;
      case 'both_bnc_coca':
        if (!w.inBnc || !w.inCoca) continue;
        break;
      case 'all_three_sources':
        if (!w.inCet || !w.inBnc || !w.inCoca) continue;
        break;
      case 'cet_only':
        if (!w.inCet || w.inBnc || w.bncLinkedViaVariant || w.inCoca) continue;
        break;
      case 'bnc_only':
        if (!w.inBnc || w.inCet || w.inCoca) continue;
        break;
      case 'coca_only':
        if (!w.inCoca || w.inBnc || w.inCet) continue;
        break;
      case 'cet_not_in_coca':
        if (!w.inCet || w.inCoca) continue;
        break;
    }

    // 2. Band filters
    if (bandsSet) {
      if (w.bandNumber === null || !bandsSet.has(w.bandNumber)) continue;
    }
    if (criteria.minBand !== null) {
      if (w.bandNumber === null || w.bandNumber < criteria.minBand) continue;
    }
    if (criteria.maxBand !== null) {
      if (w.bandNumber === null || w.bandNumber > criteria.maxBand) continue;
    }

    // 3. BNC Frequency filters
    if (!criteria.includeUnrankedFreq && w.formFrequency === null) continue;
    if (!criteria.includeZeroFreq && w.formFrequency === 0) continue;

    if (criteria.minFormFreq !== null) {
      if (w.formFrequency === null || w.formFrequency < criteria.minFormFreq) continue;
    }
    if (criteria.maxFormFreq !== null) {
      if (w.formFrequency === null || w.formFrequency > criteria.maxFormFreq) continue;
    }
    if (criteria.minFamilyFreq !== null) {
      if (w.familyFrequency === null || w.familyFrequency < criteria.minFamilyFreq) continue;
    }
    if (criteria.maxFamilyFreq !== null) {
      if (w.familyFrequency === null || w.familyFrequency > criteria.maxFamilyFreq) continue;
    }

    // 4. COCA 2020 Rank, Frequency & PoS filters
    if (criteria.cocaMultiPosOnly) {
      if (!w.inCoca || (w.cocaPosCount || 0) < 2) continue;
    }
    if (posFilterSet) {
      if (!w.inCoca || !w.cocaLexemes || !w.cocaLexemes.some((l) => posFilterSet.has(l.pos))) {
        continue;
      }
    }
    if (criteria.minCocaRank !== null && criteria.minCocaRank !== undefined) {
      if (!w.inCoca) continue;
      const effectiveRank =
        cocaRankMode === 'lemma_pos'
          ? posFilterSet && w.cocaLexemes
            ? Math.min(
                ...w.cocaLexemes.filter((l) => posFilterSet.has(l.pos)).map((l) => l.rank)
              )
            : (w.cocaBestPosRank ?? null)
          : (w.cocaHeadwordDerivedRank ?? null);
      if (effectiveRank === null || effectiveRank < criteria.minCocaRank) continue;
    }
    if (criteria.maxCocaRank !== null && criteria.maxCocaRank !== undefined) {
      if (!w.inCoca) continue;
      const effectiveRank =
        cocaRankMode === 'lemma_pos'
          ? posFilterSet && w.cocaLexemes
            ? Math.min(
                ...w.cocaLexemes.filter((l) => posFilterSet.has(l.pos)).map((l) => l.rank)
              )
            : (w.cocaBestPosRank ?? null)
          : (w.cocaHeadwordDerivedRank ?? null);
      if (effectiveRank === null || effectiveRank > criteria.maxCocaRank) continue;
    }
    if (criteria.minCocaFreq !== null && criteria.minCocaFreq !== undefined) {
      if (!w.inCoca || (w.cocaHeadwordTotalFreq ?? -1) < criteria.minCocaFreq) continue;
    }
    if (criteria.maxCocaFreq !== null && criteria.maxCocaFreq !== undefined) {
      if (!w.inCoca || (w.cocaHeadwordTotalFreq ?? Number.MAX_SAFE_INTEGER) > criteria.maxCocaFreq) {
        continue;
      }
    }

    // 5. Status filter
    if (statusSet && !statusSet.has(status)) continue;

    // 6. Tags filter
    if (criteria.tagFilterMode === 'untagged') {
      if (rec && rec.tags && rec.tags.length > 0) continue;
    } else if (requiredTags.length > 0) {
      const userTags = rec?.tags || [];
      if (userTags.length === 0) continue;
      if (criteria.tagFilterMode === 'all') {
        if (!requiredTags.every((t) => userTags.includes(t))) continue;
      } else {
        if (!requiredTags.some((t) => userTags.includes(t))) continue;
      }
    }

    // 7. Family structure filter
    switch (criteria.familyFilter) {
      case 'headword_only':
        if (!w.isHeadword) continue;
        break;
      case 'derived_only':
        if (w.isHeadword || (!w.inBnc && !w.bncLinkedViaVariant)) continue;
        break;
      case 'has_cet_peers':
        if (w.familyCetMemberCount < 1) continue;
        break;
      case 'high_freq_unmastered_member':
        if (
          status === 'mastered' ||
          !w.familyId ||
          (unmasteredHighFreqFamilyIds && !unmasteredHighFreqFamilyIds.has(w.familyId)) ||
          (w.bandNumber !== null && w.bandNumber > 5)
        ) {
          continue;
        }
        break;
      case 'high_family_low_form':
        if (
          w.isHeadword ||
          (w.familyFrequency || 0) < 5000 ||
          w.formFrequency === null ||
          w.formFrequency > 800
        ) {
          continue;
        }
        break;
      case 'single_member_family':
        if (w.familyMemberCount !== 1) continue;
        break;
      case 'large_family':
        if ((w.familyMemberCount || 0) < 6) continue;
        break;
    }

    // 8. Special toggles
    if (criteria.phrasesOnly && !w.isPhrase) continue;
    if (criteria.homographsOnly && w.homographNumbers.length === 0) continue;

    // 9. Search query matching
    if (cleanQ) {
      if (matchMode === 'exact') {
        const exactHit =
          w.normalized === cleanQ ||
          w.displayVariants.some((v) => v.toLowerCase() === cleanQ);
        if (!exactHit) continue;
      } else if (matchMode === 'prefix') {
        const prefixHit =
          w.normalized.startsWith(cleanQ) ||
          w.displayVariants.some((v) => v.toLowerCase().startsWith(cleanQ));
        if (!prefixHit) continue;
      } else if (matchMode === 'fuzzy') {
        const fuzzyHit =
          w.normalized === cleanQ ||
          w.normalized.startsWith(cleanQ) ||
          isEditDistanceAtMostOne(w.normalized, cleanQ);
        if (!fuzzyHit) continue;
      } else {
        const matchWord = w.normalized.includes(cleanQ);
        const matchVariant = w.displayVariants.some((v) => v.toLowerCase().includes(cleanQ));
        const matchHead = w.headword ? w.headword.toLowerCase().includes(cleanQ) : false;
        const matchRawCet = w.cetRefs.some((r) => r.rawLine.toLowerCase().includes(cleanQ));
        const matchNotes = rec?.notes ? rec.notes.toLowerCase().includes(cleanQ) : false;
        const matchTags = rec?.tags ? rec.tags.some((t) => t.toLowerCase().includes(cleanQ)) : false;
        if (!matchWord && !matchVariant && !matchHead && !matchRawCet && !matchNotes && !matchTags) {
          continue;
        }
      }
    }

    result.push(w);
  }

  if (cleanQ) {
    result.sort((a, b) => {
      const aExact = a.normalized === cleanQ ? 0 : 1;
      const bExact = b.normalized === cleanQ ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;

      const aPrefix = a.normalized.startsWith(cleanQ) ? 0 : 1;
      const bPrefix = b.normalized.startsWith(cleanQ) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;

      return compareWords(a, b, sortField, userRecordsMap);
    });
    return result;
  }

  result.sort((a, b) => compareWords(a, b, sortField, userRecordsMap));
  return result;
}

/**
 * Filters and sorts the 60,000 official COCA 2020 Lemma+PoS records (`CocaLexemeRecord[]`)
 * using the unified `FilterCriteria` model.
 */
export function filterAndSortCocaLexemes(
  lexemes: CocaLexemeRecord[],
  userRecordsMap: Map<string, UserWordRecord>,
  criteria: FilterCriteria,
  sortField: SortField
): CocaLexemeRecord[] {
  const q = criteria.searchQuery.trim().toLowerCase();
  const cleanQ = q.replace(/★/g, '').replace(/[¹²³⁴⁵]/g, '');
  const matchMode = criteria.searchMatchMode || 'auto';
  const bandsSet = criteria.bands.length > 0 ? new Set(criteria.bands) : null;
  const statusSet = criteria.statuses.length > 0 ? new Set(criteria.statuses) : null;
  const posFilterSet =
    criteria.cocaPosFilter && criteria.cocaPosFilter.length > 0
      ? new Set(criteria.cocaPosFilter)
      : null;
  const cocaRankMode = criteria.cocaRankMode || 'lemma_pos';

  const result: CocaLexemeRecord[] = [];

  for (let i = 0; i < lexemes.length; i++) {
    const lex = lexemes[i];
    const rec = userRecordsMap.get(lex.normalizedHeadword);
    // Check explicit PoS-level status first; fall back to unrated if not set, or allow matching overall status
    const posStatus: LearningStatus = rec?.posStatuses?.[lex.pos] || rec?.status || 'unrated';

    switch (criteria.sourceFilter) {
      case 'cet_all':
      case 'both_cet_coca':
        if (!lex.inCet) continue;
        break;
      case 'cet4':
        if (!lex.isCet4) continue;
        break;
      case 'cet6':
        if (!lex.isCet6) continue;
        break;
      case 'cet6_new':
        if (!lex.isCet6Only) continue;
        break;
      case 'bnc_all':
      case 'both_bnc_coca':
        if (!lex.inBnc) continue;
        break;
      case 'all_three_sources':
        if (!lex.inCet || !lex.inBnc) continue;
        break;
      case 'coca_only':
        if (lex.inCet || lex.inBnc) continue;
        break;
      case 'cet_only':
      case 'bnc_only':
      case 'cet_not_in_coca':
        continue;
    }

    if (bandsSet) {
      if (lex.bncBandNumber === null || !bandsSet.has(lex.bncBandNumber)) continue;
    }
    if (criteria.minBand !== null) {
      if (lex.bncBandNumber === null || lex.bncBandNumber < criteria.minBand) continue;
    }
    if (criteria.maxBand !== null) {
      if (lex.bncBandNumber === null || lex.bncBandNumber > criteria.maxBand) continue;
    }

    if (criteria.cocaMultiPosOnly && lex.headwordPosCount < 2) continue;
    if (posFilterSet && !posFilterSet.has(lex.pos)) continue;

    const targetRank = cocaRankMode === 'derived_headword' ? lex.headwordDerivedRank : lex.rank;
    if (
      criteria.minCocaRank !== null &&
      criteria.minCocaRank !== undefined &&
      targetRank < criteria.minCocaRank
    ) {
      continue;
    }
    if (
      criteria.maxCocaRank !== null &&
      criteria.maxCocaRank !== undefined &&
      targetRank > criteria.maxCocaRank
    ) {
      continue;
    }
    if (
      criteria.minCocaFreq !== null &&
      criteria.minCocaFreq !== undefined &&
      lex.frequency < criteria.minCocaFreq
    ) {
      continue;
    }
    if (
      criteria.maxCocaFreq !== null &&
      criteria.maxCocaFreq !== undefined &&
      lex.frequency > criteria.maxCocaFreq
    ) {
      continue;
    }

    if (statusSet && !statusSet.has(posStatus)) continue;

    if (cleanQ) {
      if (matchMode === 'exact') {
        if (lex.normalizedHeadword !== cleanQ) continue;
      } else if (matchMode === 'prefix') {
        if (!lex.normalizedHeadword.startsWith(cleanQ)) continue;
      } else if (matchMode === 'fuzzy') {
        if (
          lex.normalizedHeadword !== cleanQ &&
          !lex.normalizedHeadword.startsWith(cleanQ) &&
          !isEditDistanceAtMostOne(lex.normalizedHeadword, cleanQ)
        ) {
          continue;
        }
      } else {
        const hitHw = lex.normalizedHeadword.includes(cleanQ);
        const hitPos = lex.pos.toLowerCase().includes(cleanQ) || lex.posZh.includes(cleanQ);
        if (!hitHw && !hitPos) continue;
      }
    }

    result.push(lex);
  }

  result.sort((a, b) => {
    if (cleanQ) {
      const aEx = a.normalizedHeadword === cleanQ ? 0 : 1;
      const bEx = b.normalizedHeadword === cleanQ ? 0 : 1;
      if (aEx !== bEx) return aEx - bEx;
    }
    switch (sortField) {
      case 'coca_rank_desc':
      case 'coca_freq_asc':
        return b.rank - a.rank;
      case 'word_asc':
        return (
          a.normalizedHeadword.localeCompare(b.normalizedHeadword) || a.rank - b.rank
        );
      case 'word_desc':
        return (
          b.normalizedHeadword.localeCompare(a.normalizedHeadword) || a.rank - b.rank
        );
      case 'coca_pos_count_desc':
        return b.headwordPosCount - a.headwordPosCount || a.rank - b.rank;
      case 'band_asc':
        return (a.bncBandNumber ?? 999) - (b.bncBandNumber ?? 999) || a.rank - b.rank;
      case 'coca_rank_asc':
      case 'coca_freq_desc':
      default:
        return a.rank - b.rank;
    }
  });

  return result;
}

function compareWords(
  a: LexiconWordItem,
  b: LexiconWordItem,
  sortField: SortField,
  userRecordsMap: Map<string, UserWordRecord>
): number {
  switch (sortField) {
    case 'word_asc':
      return a.normalized.localeCompare(b.normalized);
    case 'word_desc':
      return b.normalized.localeCompare(a.normalized);
    case 'coca_rank_asc': {
      const ra = a.cocaHeadwordDerivedRank ?? a.cocaBestPosRank ?? Number.MAX_SAFE_INTEGER;
      const rb = b.cocaHeadwordDerivedRank ?? b.cocaBestPosRank ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      const bpa = a.cocaBestPosRank ?? Number.MAX_SAFE_INTEGER;
      const bpb = b.cocaBestPosRank ?? Number.MAX_SAFE_INTEGER;
      if (bpa !== bpb) return bpa - bpb;
      return a.normalized.localeCompare(b.normalized);
    }
    case 'coca_rank_desc': {
      const ra = a.cocaHeadwordDerivedRank ?? a.cocaBestPosRank ?? -1;
      const rb = b.cocaHeadwordDerivedRank ?? b.cocaBestPosRank ?? -1;
      if (rb !== ra) return rb - ra;
      return a.normalized.localeCompare(b.normalized);
    }
    case 'coca_freq_desc': {
      const fa = a.cocaHeadwordTotalFreq ?? -1;
      const fb = b.cocaHeadwordTotalFreq ?? -1;
      if (fb !== fa) return fb - fa;
      const bpa = a.cocaBestPosRank ?? Number.MAX_SAFE_INTEGER;
      const bpb = b.cocaBestPosRank ?? Number.MAX_SAFE_INTEGER;
      if (bpa !== bpb) return bpa - bpb;
      return a.normalized.localeCompare(b.normalized);
    }
    case 'coca_freq_asc': {
      const fa = a.cocaHeadwordTotalFreq ?? Number.MAX_SAFE_INTEGER;
      const fb = b.cocaHeadwordTotalFreq ?? Number.MAX_SAFE_INTEGER;
      if (fa !== fb) return fa - fb;
      return a.normalized.localeCompare(b.normalized);
    }
    case 'coca_pos_count_desc': {
      const pca = a.cocaPosCount ?? 0;
      const pcb = b.cocaPosCount ?? 0;
      if (pcb !== pca) return pcb - pca;
      const fa = a.cocaHeadwordTotalFreq ?? -1;
      const fb = b.cocaHeadwordTotalFreq ?? -1;
      if (fb !== fa) return fb - fa;
      return a.normalized.localeCompare(b.normalized);
    }
    case 'form_freq_desc': {
      const fa = a.formFrequency ?? -1;
      const fb = b.formFrequency ?? -1;
      if (fb !== fa) return fb - fa;
      const fma = a.familyFrequency ?? -1;
      const fmb = b.familyFrequency ?? -1;
      if (fmb !== fma) return fmb - fma;
      return a.normalized.localeCompare(b.normalized);
    }
    case 'form_freq_asc': {
      const fa = a.formFrequency ?? Number.MAX_SAFE_INTEGER;
      const fb = b.formFrequency ?? Number.MAX_SAFE_INTEGER;
      if (fa !== fb) return fa - fb;
      return a.normalized.localeCompare(b.normalized);
    }
    case 'family_freq_desc': {
      const fa = a.familyFrequency ?? -1;
      const fb = b.familyFrequency ?? -1;
      if (fb !== fa) return fb - fa;
      const fma = a.formFrequency ?? -1;
      const fmb = b.formFrequency ?? -1;
      if (fmb !== fma) return fmb - fma;
      return a.normalized.localeCompare(b.normalized);
    }
    case 'family_freq_asc': {
      const fa = a.familyFrequency ?? Number.MAX_SAFE_INTEGER;
      const fb = b.familyFrequency ?? Number.MAX_SAFE_INTEGER;
      if (fa !== fb) return fa - fb;
      return a.normalized.localeCompare(b.normalized);
    }
    case 'band_asc': {
      const ba = a.bandNumber ?? 999;
      const bb = b.bandNumber ?? 999;
      if (ba !== bb) return ba - bb;
      const fa = a.formFrequency ?? -1;
      const fb = b.formFrequency ?? -1;
      if (fb !== fa) return fb - fa;
      return a.normalized.localeCompare(b.normalized);
    }
    case 'band_desc': {
      const ba = a.bandNumber ?? -1;
      const bb = b.bandNumber ?? -1;
      if (bb !== ba) return bb - ba;
      const fa = a.formFrequency ?? -1;
      const fb = b.formFrequency ?? -1;
      if (fb !== fa) return fb - fa;
      return a.normalized.localeCompare(b.normalized);
    }
    case 'updated_desc': {
      const ua = userRecordsMap.get(a.id)?.updatedAt || '';
      const ub = userRecordsMap.get(b.id)?.updatedAt || '';
      if (ub !== ua) return ub.localeCompare(ua);
      return a.normalized.localeCompare(b.normalized);
    }
    case 'first_recorded_desc': {
      const fa = userRecordsMap.get(a.id)?.firstRecordedAt || '';
      const fb = userRecordsMap.get(b.id)?.firstRecordedAt || '';
      if (fb !== fa) return fb.localeCompare(fa);
      return a.normalized.localeCompare(b.normalized);
    }
    case 'priority_weight_desc':
    default: {
      const pa = computeStudyPriorityScore(a, userRecordsMap.get(a.id)).score;
      const pb = computeStudyPriorityScore(b, userRecordsMap.get(b.id)).score;
      if (pb !== pa) return pb - pa;
      return a.normalized.localeCompare(b.normalized);
    }
  }
}

export interface SearchLexiconResult {
  word: LexiconWordItem;
  matchRank: 'exact' | 'headword' | 'prefix' | 'cet_raw' | 'substring' | 'fuzzy';
  matchedContext: string;
}

/**
 * Fast ranked search across words, inflections, headwords, COCA lemmas, and raw CET shorthand.
 */
export function searchLexicon(
  words: LexiconWordItem[],
  query: string,
  options?: { enableFuzzy?: boolean; limit?: number }
): SearchLexiconResult[] {
  const q = query
    .trim()
    .toLowerCase()
    .replace(/★/g, '')
    .replace(/[¹²³⁴⁵]/g, '');
  if (!q) return [];

  const limit = options?.limit ?? 40;
  const enableFuzzy = options?.enableFuzzy ?? false;

  const exactMatches: SearchLexiconResult[] = [];
  const headwordMatches: SearchLexiconResult[] = [];
  const prefixMatches: SearchLexiconResult[] = [];
  const cetRawMatches: SearchLexiconResult[] = [];
  const substringMatches: SearchLexiconResult[] = [];
  const fuzzyMatches: SearchLexiconResult[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    if (w.normalized === q) {
      const cocaPart = w.inCoca ? ` · COCA #${w.cocaHeadwordDerivedRank}` : '';
      exactMatches.push({
        word: w,
        matchRank: 'exact',
        matchedContext: w.isHeadword
          ? `词头 (${w.band || (w.inCoca ? 'COCA' : 'CET')})${cocaPart}`
          : w.headword
            ? `派生自词族 ${w.headword} (${w.band})${cocaPart}`
            : `大纲词条${cocaPart}`,
      });
      continue;
    }

    if (w.headword && w.headword.toLowerCase() === q) {
      headwordMatches.push({
        word: w,
        matchRank: 'headword',
        matchedContext: `词族 ${w.headword} 成员`,
      });
      continue;
    }

    if (w.normalized.startsWith(q)) {
      prefixMatches.push({
        word: w,
        matchRank: 'prefix',
        matchedContext: w.headword
          ? `词族 ${w.headword}`
          : w.inCoca
            ? `COCA #${w.cocaHeadwordDerivedRank}`
            : '前缀匹配',
      });
      continue;
    }

    if (w.cetRefs.some((r) => r.rawLine.toLowerCase().includes(q))) {
      cetRawMatches.push({
        word: w,
        matchRank: 'cet_raw',
        matchedContext: '考纲同源行匹配',
      });
      continue;
    }

    if (w.normalized.includes(q)) {
      substringMatches.push({
        word: w,
        matchRank: 'substring',
        matchedContext: w.headword ? `词族 ${w.headword}` : '包含匹配',
      });
      continue;
    }

    if (enableFuzzy && q.length >= 4 && isEditDistanceAtMostOne(w.normalized, q)) {
      fuzzyMatches.push({
        word: w,
        matchRank: 'fuzzy',
        matchedContext: '拼写相近容错',
      });
    }
  }

  const sortByFreq = (a: SearchLexiconResult, b: SearchLexiconResult) =>
    (b.word.cocaHeadwordTotalFreq ?? b.word.formFrequency ?? b.word.familyFrequency ?? 0) -
    (a.word.cocaHeadwordTotalFreq ?? a.word.formFrequency ?? a.word.familyFrequency ?? 0);

  headwordMatches.sort(sortByFreq);
  prefixMatches.sort(sortByFreq);
  cetRawMatches.sort(sortByFreq);
  substringMatches.sort(sortByFreq);
  fuzzyMatches.sort(sortByFreq);

  return [
    ...exactMatches,
    ...headwordMatches,
    ...prefixMatches,
    ...cetRawMatches,
    ...substringMatches,
    ...fuzzyMatches,
  ].slice(0, limit);
}

/**
 * Splits a multi-line CSV/TSV text into logical records following RFC 4180 quote rules.
 */
export function splitCsvRecords(rawText: string): string[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const records: string[] = [];
  let current = '';
  let inQuotes = false;
  let atFieldStart = true;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (inQuotes) {
      current += ch;
      if (ch === '"') {
        if (i + 1 < normalized.length && normalized[i + 1] === '"') {
          current += normalized[i + 1];
          i++;
        } else {
          inQuotes = false;
          atFieldStart = false;
        }
      }
    } else {
      if (ch === '"' && atFieldStart) {
        inQuotes = true;
        atFieldStart = false;
        current += ch;
      } else if (ch === '\n') {
        records.push(current);
        current = '';
        atFieldStart = true;
      } else if (ch === ',' || ch === '\t') {
        current += ch;
        atFieldStart = true;
      } else {
        if (ch !== ' ') {
          atFieldStart = false;
        }
        current += ch;
      }
    }
  }

  if (current.length > 0) {
    records.push(current);
  }
  return records;
}

/**
 * Parse a single CSV or TSV record following RFC 4180 quote rules.
 */
export function parseCsvLine(line: string, delimiter?: ',' | '\t'): string[] {
  let effectiveDelimiter: ',' | '\t' = delimiter || ',';
  if (!delimiter) {
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') q = !q;
      else if (!q && c === '\t') {
        effectiveDelimiter = '\t';
        break;
      }
    }
  }

  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        current += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"' && current.trim() === '') {
        inQuotes = true;
        current = '';
        i++;
        continue;
      } else if (ch === effectiveDelimiter) {
        fields.push(current.trim());
        current = '';
        i++;
        continue;
      } else {
        current += ch;
        i++;
        continue;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Format a string field safely for RFC 4180 CSV export.
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const STATUS_TOKEN_MAP: Record<string, LearningStatus> = {
  unrated: 'unrated',
  未评估: 'unrated',
  未评: 'unrated',
  queued: 'queued',
  todo: 'queued',
  待学: 'queued',
  待学习: 'queued',
  生词: 'queued',
  learning: 'learning',
  studying: 'learning',
  学习中: 'learning',
  在学: 'learning',
  mastered: 'mastered',
  known: 'mastered',
  learned: 'mastered',
  已掌握: 'mastered',
  掌握: 'mastered',
  熟词: 'mastered',
  deferred: 'deferred',
  ignored: 'deferred',
  暂缓: 'deferred',
  忽略: 'deferred',
};

export interface BatchParsedRow {
  lineNumber: number;
  rawLine: string;
  cleanedTerm: string;
  parsedStatus?: LearningStatus;
  parsedTags: string[];
  parsedNote?: string;
  matchStatus: 'matched_exact' | 'matched_variant' | 'ambiguous_homograph' | 'unmatched';
  matchedWord: LexiconWordItem | null;
  candidateWords: LexiconWordItem[];
  isDuplicateInBatch: boolean;
}

/**
 * Parses multi-line batch input text and resolves each row against the lexicon.
 */
export function parseBatchInputText(
  rawText: string,
  wordsMap: Map<string, LexiconWordItem>,
  allWords: LexiconWordItem[]
): BatchParsedRow[] {
  const records = splitCsvRecords(rawText);
  const rows: BatchParsedRow[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const rawLine = records[i].trim();
    if (!rawLine || rawLine.startsWith('#')) continue;

    let hasTabOutsideQuotes = false;
    let hasCommaOutsideQuotes = false;
    let q = false;
    for (let k = 0; k < rawLine.length; k++) {
      const ch = rawLine[k];
      if (ch === '"') q = !q;
      else if (!q) {
        if (ch === '\t') hasTabOutsideQuotes = true;
        else if (ch === ',') hasCommaOutsideQuotes = true;
      }
    }

    let cols: string[];
    if (hasTabOutsideQuotes) {
      cols = parseCsvLine(rawLine, '\t');
    } else if (hasCommaOutsideQuotes) {
      cols = parseCsvLine(rawLine, ',');
    } else {
      cols = parseCsvLine(rawLine, ',');
    }

    const firstCol = (cols[0] || '').replace(/^["']|["']$/g, '').trim();
    if (!firstCol) continue;

    if (
      i === 0 &&
      ['word', '单词', '词条', 'headword'].includes(firstCol.toLowerCase()) &&
      cols.length > 1
    ) {
      continue;
    }

    const cleanedTerm = firstCol
      .replace(/★/g, '')
      .replace(/[¹²³⁴⁵]/g, '')
      .trim();
    const norm = cleanedTerm.toLowerCase();

    let parsedStatus: LearningStatus | undefined;
    let parsedTags: string[] = [];
    let parsedNote: string | undefined;

    const col6Status =
      cols.length >= 7
        ? STATUS_TOKEN_MAP[(cols[6] || '').trim().toLowerCase()] ||
          STATUS_TOKEN_MAP[(cols[6] || '').trim()]
        : undefined;

    if (cols.length >= 7 && col6Status) {
      parsedStatus = col6Status;
      parsedTags = (cols[7] || '')
        .split(/[,，;；|/]+/)
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean);
      parsedNote = cols[8]?.trim() || undefined;
    } else {
      if (cols[1]) {
        const sCandidate =
          STATUS_TOKEN_MAP[cols[1].trim().toLowerCase()] || STATUS_TOKEN_MAP[cols[1].trim()];
        if (sCandidate) {
          parsedStatus = sCandidate;
        } else {
          parsedTags.push(
            ...cols[1]
              .split(/[,，;；|/]+/)
              .map((t) => t.trim().replace(/^#/, ''))
              .filter(Boolean)
          );
        }
      }

      if (cols[2]) {
        parsedTags.push(
          ...cols[2]
            .split(/[,，;；|/]+/)
            .map((t) => t.trim().replace(/^#/, ''))
            .filter(Boolean)
        );
      }

      if (cols.length >= 4 && cols[3] !== undefined) {
        const rawNote = cols.slice(3).join(', ').trim();
        if (rawNote) parsedNote = rawNote;
      }
    }

    parsedTags = Array.from(new Set(parsedTags));

    let matchedWord = wordsMap.get(norm) || null;
    let matchStatus: BatchParsedRow['matchStatus'] = 'unmatched';
    let candidateWords: LexiconWordItem[] = [];

    if (matchedWord) {
      candidateWords = [matchedWord];
      if (matchedWord.homographNumbers.length > 1) {
        matchStatus = 'ambiguous_homograph';
      } else {
        matchStatus = 'matched_exact';
      }
    } else {
      const stemCandidates = [
        norm.replace(/ies$/, 'y'),
        norm.replace(/es$/, ''),
        norm.replace(/s$/, ''),
        norm.replace(/ed$/, ''),
        norm.replace(/ing$/, ''),
      ];
      for (const cand of stemCandidates) {
        if (cand.length >= 2 && wordsMap.has(cand)) {
          matchedWord = wordsMap.get(cand)!;
          candidateWords = [matchedWord];
          matchStatus = 'matched_variant';
          break;
        }
      }

      if (!matchedWord && allWords.length > 0) {
        const variantHit = allWords.find((w) =>
          w.displayVariants.some((v) => v.toLowerCase() === norm)
        );
        if (variantHit) {
          matchedWord = variantHit;
          candidateWords = [variantHit];
          matchStatus = 'matched_variant';
        }
      }
    }

    const dedupeKey = matchedWord ? matchedWord.id : norm;
    const isDuplicateInBatch = seenIds.has(dedupeKey);
    seenIds.add(dedupeKey);

    rows.push({
      lineNumber: i + 1,
      rawLine,
      cleanedTerm,
      parsedStatus,
      parsedTags,
      parsedNote,
      matchStatus,
      matchedWord,
      candidateWords,
      isDuplicateInBatch,
    });
  }

  return rows;
}

/**
 * Selects CET-4/CET-6 word IDs inside a BNC/COCA family for the "大纲词标为待学" action.
 */
export function selectFamilyCetWordIdsForQueue(
  family: BncCocaFamily,
  wordsMap: Map<string, LexiconWordItem>,
  userRecordsMap: Map<string, UserWordRecord>,
  overwriteExisting = false
): string[] {
  return family.members
    .filter((m) => {
      const entry = wordsMap.get(m.normalized);
      if (!entry || (!entry.isCet4 && !entry.isCet6)) return false;
      if (overwriteExisting) return true;
      const currentStatus = userRecordsMap.get(m.normalized)?.status || 'unrated';
      return currentStatus === 'unrated';
    })
    .map((m) => m.normalized);
}

/**
 * Corpus Comparison Workbench — Preset Set Definitions & Set Comparison Engine
 */
export type CorpusComparisonPresetId =
  | 'coca_top1k'
  | 'coca_top3k'
  | 'coca_top5k'
  | 'coca_top10k'
  | 'coca_20k_40k'
  | 'bnc_1k_3k'
  | 'bnc_1k_5k'
  | 'bnc_5k_10k'
  | 'bnc_10k_20k'
  | 'cet4_all'
  | 'cet6_all'
  | 'cet6_new';

export const CORPUS_COMPARISON_PRESETS: {
  id: CorpusComparisonPresetId;
  label: string;
  unitDescription: string;
}[] = [
  { id: 'coca_top1k', label: 'COCA Top 1,000 词头', unitDescription: '按词头合计频次派生排名前 1,000 个去重词头' },
  { id: 'coca_top3k', label: 'COCA Top 3,000 词头', unitDescription: '按词头合计频次派生排名前 3,000 个去重词头' },
  { id: 'coca_top5k', label: 'COCA Top 5,000 词头', unitDescription: '按词头合计频次派生排名前 5,000 个去重词头' },
  { id: 'coca_top10k', label: 'COCA Top 10,000 词头', unitDescription: '按词头合计频次派生排名前 10,000 个去重词头' },
  { id: 'coca_20k_40k', label: 'COCA 20k–40k 中低频词头', unitDescription: 'COCA 词头综合排名 20,001–40,000 区间词头' },
  { id: 'bnc_1k_3k', label: 'BNC 1k–3k 词族代表词头', unitDescription: 'Nation BNC/COCA 1k–3k 频段词族代表词头' },
  { id: 'bnc_1k_5k', label: 'BNC 1k–5k 词族代表词头', unitDescription: 'Nation BNC/COCA 1k–5k 频段词族代表词头' },
  { id: 'bnc_5k_10k', label: 'BNC 5k–10k 词族代表词头', unitDescription: 'Nation BNC/COCA 5k–10k 频段词族代表词头' },
  { id: 'bnc_10k_20k', label: 'BNC 10k–20k 词族代表词头', unitDescription: 'Nation BNC/COCA 10k–20k 频段词族代表词头' },
  { id: 'cet4_all', label: 'CET-4 四级大纲词条', unitDescription: 'CET2016 四级大纲收录的全部去重词形' },
  { id: 'cet6_all', label: 'CET-6 六级大纲词条', unitDescription: 'CET2016 六级大纲收录的全部去重词形' },
  { id: 'cet6_new', label: 'CET-6 六级新增词条', unitDescription: '仅属于 CET-6 新增（不含四级）的去重词形' },
];

export function resolvePresetWordSet(
  presetId: CorpusComparisonPresetId,
  words: LexiconWordItem[],
  bncMode: 'headwords_only' | 'all_family_forms' = 'headwords_only'
): LexiconWordItem[] {
  return words.filter((w) => {
    switch (presetId) {
      case 'coca_top1k':
        return Boolean(w.inCoca && (w.cocaHeadwordDerivedRank ?? 999999) <= 1000);
      case 'coca_top3k':
        return Boolean(w.inCoca && (w.cocaHeadwordDerivedRank ?? 999999) <= 3000);
      case 'coca_top5k':
        return Boolean(w.inCoca && (w.cocaHeadwordDerivedRank ?? 999999) <= 5000);
      case 'coca_top10k':
        return Boolean(w.inCoca && (w.cocaHeadwordDerivedRank ?? 999999) <= 10000);
      case 'coca_20k_40k':
        return Boolean(
          w.inCoca &&
            (w.cocaHeadwordDerivedRank ?? 0) > 20000 &&
            (w.cocaHeadwordDerivedRank ?? 999999) <= 40000
        );
      case 'bnc_1k_3k':
        return (
          w.inBnc &&
          (bncMode === 'all_family_forms' || w.isHeadword) &&
          w.bandNumber !== null &&
          w.bandNumber >= 1 &&
          w.bandNumber <= 3
        );
      case 'bnc_1k_5k':
        return (
          w.inBnc &&
          (bncMode === 'all_family_forms' || w.isHeadword) &&
          w.bandNumber !== null &&
          w.bandNumber >= 1 &&
          w.bandNumber <= 5
        );
      case 'bnc_5k_10k':
        return (
          w.inBnc &&
          (bncMode === 'all_family_forms' || w.isHeadword) &&
          w.bandNumber !== null &&
          w.bandNumber >= 5 &&
          w.bandNumber <= 10
        );
      case 'bnc_10k_20k':
        return (
          w.inBnc &&
          (bncMode === 'all_family_forms' || w.isHeadword) &&
          w.bandNumber !== null &&
          w.bandNumber >= 10 &&
          w.bandNumber <= 20
        );
      case 'cet4_all':
        return w.isCet4;
      case 'cet6_all':
        return w.isCet6;
      case 'cet6_new':
        return w.isCet6Only;
    }
  });
}

export interface CorpusSetComparisonResult {
  setACount: number;
  setBCount: number;
  intersectionWords: LexiconWordItem[];
  onlyInAWords: LexiconWordItem[];
  onlyInBWords: LexiconWordItem[];
  unionCount: number;
  jaccardSimilarityPct: number;
  overlapCoeffPct: number;
  intersectionPosCounts: Record<string, number>;
  intersectionBandCounts: Record<string, number>;
}

export function compareCorpusWordSets(
  setA: LexiconWordItem[],
  setB: LexiconWordItem[]
): CorpusSetComparisonResult {
  const mapA = new Map(setA.map((w) => [w.id, w]));
  const mapB = new Map(setB.map((w) => [w.id, w]));

  const intersectionWords: LexiconWordItem[] = [];
  const onlyInAWords: LexiconWordItem[] = [];
  const onlyInBWords: LexiconWordItem[] = [];
  const intersectionPosCounts: Record<string, number> = {};
  const intersectionBandCounts: Record<string, number> = {};

  for (const [id, w] of mapA.entries()) {
    if (mapB.has(id)) {
      intersectionWords.push(w);
      const pos = w.cocaPrimaryPos ? getCocaPosMeta(w.cocaPrimaryPos).shortZh : '无COCA词性';
      intersectionPosCounts[pos] = (intersectionPosCounts[pos] || 0) + 1;
      const bandKey = w.bandNumber
        ? w.bandNumber <= 5
          ? `BNC ${w.band}`
          : w.bandNumber <= 10
            ? 'BNC 6k–10k'
            : 'BNC 11k–25k'
        : '无BNC频段';
      intersectionBandCounts[bandKey] = (intersectionBandCounts[bandKey] || 0) + 1;
    } else {
      onlyInAWords.push(w);
    }
  }

  for (const [id, w] of mapB.entries()) {
    if (!mapA.has(id)) {
      onlyInBWords.push(w);
    }
  }

  const unionCount = intersectionWords.length + onlyInAWords.length + onlyInBWords.length;
  const minCount = Math.min(setA.length, setB.length);
  const jaccardSimilarityPct =
    unionCount > 0 ? Number(((intersectionWords.length / unionCount) * 100).toFixed(2)) : 0;
  const overlapCoeffPct =
    minCount > 0 ? Number(((intersectionWords.length / minCount) * 100).toFixed(2)) : 0;

  return {
    setACount: setA.length,
    setBCount: setB.length,
    intersectionWords,
    onlyInAWords,
    onlyInBWords,
    unionCount,
    jaccardSimilarityPct,
    overlapCoeffPct,
    intersectionPosCounts,
    intersectionBandCounts,
  };
}

export interface BandCoverageRow {
  bandNum: number;
  bandLabel: string;
  familyCount: number;
  coveredFamilies: number; // touched or partial or full (at least 1 mastered member for backward compatibility)
  touchedFamilies: number; // >= 1 member queued/learning/mastered
  partialMasteredFamilies: number; // >= 1 mastered AND < all members mastered
  fullMasteredFamilies: number; // all members in family mastered
  wordCount: number;
  masteredWords: number;
  learningOrQueuedWords: number;
  cetWordsInBand: number;
  cocaWordsInBand: number;
  pctMastered: number;
}

export interface CocaRankTierCoverageRow {
  tierId: string;
  tierLabel: string;
  maxRank: number;
  minRank: number;
  totalCount: number;
  unratedCount: number;
  queuedCount: number;
  learningCount: number;
  masteredCount: number;
  deferredCount: number;
  evaluatedCount: number;
  totalFreqWeight: number;
  masteredFreqWeight: number;
  freqCoveragePct: number;
}

export interface LexiconAnalyticsSummary {
  statusCounts: Record<LearningStatus, number>;
  cet4FormsTotal: number;
  cet4FormsMastered: number;
  cet4FormsLearningOrQueued: number;
  cet6AllFormsTotal: number;
  cet6AllFormsMastered: number;
  cet6OnlyFormsTotal: number;
  cet6OnlyFormsMastered: number;
  cet6OnlyFormsLearningOrQueued: number;
  cet4OfficialTotal: number;
  cet4OfficialPartialCovered: number;
  cet4OfficialFullMastered: number;
  cet6OfficialTotal: number;
  cet6OfficialPartialCovered: number;
  cet6OfficialFullMastered: number;
  totalCorpusFreq: number;
  masteredCorpusFreq: number;
  corpusWeightedPct: string;
  bandRows: BandCoverageRow[];

  // Lexical Workbench 2.0 Multi-Layer & COCA Analytics
  cocaHeadwordsTotal: number;
  cocaHeadwordsMastered: number;
  cocaHeadwordsLearningOrQueued: number;
  cocaLexemesTotal: number;
  cocaLexemesExplicitMastered: number;
  cocaLexemesExplicitLearningOrQueued: number;
  cocaLexemesProxyMastered: number;
  cocaTotalTokenFreq: number;
  cocaExplicitMasteredFreq: number;
  cocaExplicitWeightedPct: string;
  cocaProxyMasteredFreq: number;
  cocaProxyWeightedPct: string;
  cocaHeadwordTierRows: CocaRankTierCoverageRow[];
  cocaLexemeTierRows: CocaRankTierCoverageRow[];
  bncFamiliesTotal: number;
  bncFamiliesUntouched: number;
  bncFamiliesTouched: number;
  bncFamiliesPartialMastered: number;
  bncFamiliesFullMastered: number;
}

const COCA_TIER_BOUNDS: { id: string; label: string; min: number; max: number }[] = [
  { id: '1k', label: 'Top 1,000', min: 1, max: 1000 },
  { id: '3k', label: '1,001–3,000 (Top 3k)', min: 1001, max: 3000 },
  { id: '5k', label: '3,001–5,000 (Top 5k)', min: 3001, max: 5000 },
  { id: '10k', label: '5,001–10,000 (Top 10k)', min: 5001, max: 10000 },
  { id: '20k', label: '10,001–20,000 (Top 20k)', min: 10001, max: 20000 },
  { id: '30k', label: '20,001–30,000 (Top 30k)', min: 20001, max: 30000 },
  { id: '60k', label: '30,001–60,000 (30k–60k)', min: 30001, max: 60000 },
];

export function computeLexiconAnalytics(
  words: LexiconWordItem[],
  families: BncCocaFamily[],
  cetEntries: CetOfficialEntry[],
  userRecordsMap: Map<string, UserWordRecord>,
  cocaLexemes?: CocaLexemeRecord[]
): LexiconAnalyticsSummary {
  const statusCounts: Record<LearningStatus, number> = {
    unrated: 0,
    queued: 0,
    learning: 0,
    mastered: 0,
    deferred: 0,
  };

  let cet4FormsTotal = 0;
  let cet4FormsMastered = 0;
  let cet4FormsLearningOrQueued = 0;

  let cet6AllFormsTotal = 0;
  let cet6AllFormsMastered = 0;

  let cet6OnlyFormsTotal = 0;
  let cet6OnlyFormsMastered = 0;
  let cet6OnlyFormsLearningOrQueued = 0;

  let totalCorpusFreq = 0;
  let masteredCorpusFreq = 0;

  let cocaHeadwordsTotal = 0;
  let cocaHeadwordsMastered = 0;
  let cocaHeadwordsLearningOrQueued = 0;
  let cocaTotalTokenFreq = 0;
  let cocaProxyMasteredFreq = 0;

  const cocaHeadwordTierRows: CocaRankTierCoverageRow[] = COCA_TIER_BOUNDS.map((b) => ({
    tierId: b.id,
    tierLabel: b.label,
    minRank: b.min,
    maxRank: b.max,
    totalCount: 0,
    unratedCount: 0,
    queuedCount: 0,
    learningCount: 0,
    masteredCount: 0,
    deferredCount: 0,
    evaluatedCount: 0,
    totalFreqWeight: 0,
    masteredFreqWeight: 0,
    freqCoveragePct: 0,
  }));

  for (const w of words) {
    const rec = userRecordsMap.get(w.id);
    const st: LearningStatus = rec?.status || 'unrated';
    statusCounts[st]++;

    if (w.inBnc && w.hasExactBncForm !== false && w.formFrequency !== null && w.formFrequency > 0) {
      totalCorpusFreq += w.formFrequency;
      if (st === 'mastered') {
        masteredCorpusFreq += w.formFrequency;
      }
    }

    if (w.isCet4) {
      cet4FormsTotal++;
      if (st === 'mastered') cet4FormsMastered++;
      else if (st === 'learning' || st === 'queued') cet4FormsLearningOrQueued++;
    }
    if (w.isCet6) {
      cet6AllFormsTotal++;
      if (st === 'mastered') cet6AllFormsMastered++;
    }
    if (w.isCet6Only) {
      cet6OnlyFormsTotal++;
      if (st === 'mastered') cet6OnlyFormsMastered++;
      else if (st === 'learning' || st === 'queued') cet6OnlyFormsLearningOrQueued++;
    }

    if (w.inCoca && w.cocaHeadwordDerivedRank !== null && w.cocaHeadwordDerivedRank !== undefined) {
      cocaHeadwordsTotal++;
      const hwFreq = w.cocaHeadwordTotalFreq || 0;
      cocaTotalTokenFreq += hwFreq;
      if (st === 'mastered') {
        cocaHeadwordsMastered++;
        cocaProxyMasteredFreq += hwFreq;
      } else if (st === 'learning' || st === 'queued') {
        cocaHeadwordsLearningOrQueued++;
      }

      const r = w.cocaHeadwordDerivedRank;
      const tier = cocaHeadwordTierRows.find((t) => r >= t.minRank && r <= t.maxRank);
      if (tier) {
        tier.totalCount++;
        tier.totalFreqWeight += hwFreq;
        if (st === 'unrated') tier.unratedCount++;
        else {
          tier.evaluatedCount++;
          if (st === 'queued') tier.queuedCount++;
          else if (st === 'learning') tier.learningCount++;
          else if (st === 'mastered') {
            tier.masteredCount++;
            tier.masteredFreqWeight += hwFreq;
          } else if (st === 'deferred') tier.deferredCount++;
        }
      }
    }
  }

  for (const tier of cocaHeadwordTierRows) {
    tier.freqCoveragePct =
      tier.totalFreqWeight > 0
        ? Number(((tier.masteredFreqWeight / tier.totalFreqWeight) * 100).toFixed(1))
        : 0;
  }

  // Compute COCA Lexeme (60,000 lemma+PoS records) mastery
  let cocaLexemesTotal = 0;
  let cocaLexemesExplicitMastered = 0;
  let cocaLexemesExplicitLearningOrQueued = 0;
  let cocaLexemesProxyMastered = 0;
  let cocaExplicitMasteredFreq = 0;

  const cocaLexemeTierRows: CocaRankTierCoverageRow[] = COCA_TIER_BOUNDS.map((b) => ({
    tierId: b.id,
    tierLabel: b.label,
    minRank: b.min,
    maxRank: b.max,
    totalCount: 0,
    unratedCount: 0,
    queuedCount: 0,
    learningCount: 0,
    masteredCount: 0,
    deferredCount: 0,
    evaluatedCount: 0,
    totalFreqWeight: 0,
    masteredFreqWeight: 0,
    freqCoveragePct: 0,
  }));

  if (cocaLexemes && cocaLexemes.length > 0) {
    cocaLexemesTotal = cocaLexemes.length;
    for (const lex of cocaLexemes) {
      const rec = userRecordsMap.get(lex.normalizedHeadword);
      const explicitPosSt: LearningStatus = rec?.posStatuses?.[lex.pos] || 'unrated';
      // For single-PoS headwords, if the user marked the headword mastered, or explicitly marked the PoS mastered
      const effectiveExplicitSt: LearningStatus =
        explicitPosSt !== 'unrated'
          ? explicitPosSt
          : lex.headwordPosCount === 1 && rec?.status
            ? rec.status
            : 'unrated';
      const proxySt: LearningStatus =
        explicitPosSt !== 'unrated' ? explicitPosSt : rec?.status || 'unrated';

      if (effectiveExplicitSt === 'mastered') {
        cocaLexemesExplicitMastered++;
        cocaExplicitMasteredFreq += lex.frequency;
      } else if (effectiveExplicitSt === 'learning' || effectiveExplicitSt === 'queued') {
        cocaLexemesExplicitLearningOrQueued++;
      }

      if (proxySt === 'mastered') {
        cocaLexemesProxyMastered++;
      }

      const tier = cocaLexemeTierRows.find((t) => lex.rank >= t.minRank && lex.rank <= t.maxRank);
      if (tier) {
        tier.totalCount++;
        tier.totalFreqWeight += lex.frequency;
        if (proxySt === 'unrated') tier.unratedCount++;
        else {
          tier.evaluatedCount++;
          if (proxySt === 'queued') tier.queuedCount++;
          else if (proxySt === 'learning') tier.learningCount++;
          else if (proxySt === 'mastered') {
            tier.masteredCount++;
            tier.masteredFreqWeight += lex.frequency;
          } else if (proxySt === 'deferred') tier.deferredCount++;
        }
      }
    }
  }

  for (const tier of cocaLexemeTierRows) {
    tier.freqCoveragePct =
      tier.totalFreqWeight > 0
        ? Number(((tier.masteredFreqWeight / tier.totalFreqWeight) * 100).toFixed(1))
        : 0;
  }

  let cet4OfficialTotal = 0;
  let cet4OfficialPartialCovered = 0;
  let cet4OfficialFullMastered = 0;

  let cet6OfficialTotal = 0;
  let cet6OfficialPartialCovered = 0;
  let cet6OfficialFullMastered = 0;

  for (const entry of cetEntries) {
    const anyMastered = entry.members.some((m) =>
      m.expandedForms.some((f) => userRecordsMap.get(f.toLowerCase())?.status === 'mastered')
    );

    const allMembersMastered =
      entry.members.length > 0 &&
      entry.members.every((m) =>
        m.expandedForms.some((f) => userRecordsMap.get(f.toLowerCase())?.status === 'mastered')
      );

    if (entry.level === 'CET4') {
      cet4OfficialTotal++;
      if (anyMastered) cet4OfficialPartialCovered++;
      if (allMembersMastered) cet4OfficialFullMastered++;
    } else {
      cet6OfficialTotal++;
      if (anyMastered) cet6OfficialPartialCovered++;
      if (allMembersMastered) cet6OfficialFullMastered++;
    }
  }

  let bncFamiliesUntouched = 0;
  let bncFamiliesTouched = 0;
  let bncFamiliesPartialMastered = 0;
  let bncFamiliesFullMastered = 0;

  const bandRows: BandCoverageRow[] = Array.from({ length: 25 }, (_, idx) => {
    const bandNum = idx + 1;
    const bandFams = families.filter((f) => f.bandNumber === bandNum);
    const seenWordsInBand = new Set<string>();
    let masteredWords = 0;
    let learningOrQueuedWords = 0;
    let coveredFamilies = 0;
    let touchedFamilies = 0;
    let partialMasteredFamilies = 0;
    let fullMasteredFamilies = 0;
    let cetWordsInBand = 0;
    let cocaWordsInBand = 0;

    for (const fam of bandFams) {
      let famMasteredMembers = 0;
      let famActiveMembers = 0;
      cetWordsInBand += fam.cetMemberCount;
      cocaWordsInBand += fam.cocaMatchedMemberCount || 0;

      for (const m of fam.members) {
        const st = userRecordsMap.get(m.normalized)?.status || 'unrated';
        if (st === 'mastered') {
          famMasteredMembers++;
          famActiveMembers++;
        } else if (st === 'learning' || st === 'queued') {
          famActiveMembers++;
        }
        if (!seenWordsInBand.has(m.normalized)) {
          seenWordsInBand.add(m.normalized);
          if (st === 'mastered') {
            masteredWords++;
          } else if (st === 'learning' || st === 'queued') {
            learningOrQueuedWords++;
          }
        }
      }

      if (famActiveMembers === 0) {
        bncFamiliesUntouched++;
      } else {
        touchedFamilies++;
        bncFamiliesTouched++;
      }
      if (famMasteredMembers > 0) {
        coveredFamilies++;
        if (famMasteredMembers === fam.members.length) {
          fullMasteredFamilies++;
          bncFamiliesFullMastered++;
        } else {
          partialMasteredFamilies++;
          bncFamiliesPartialMastered++;
        }
      }
    }

    const wordCount = seenWordsInBand.size;
    return {
      bandNum,
      bandLabel: `${bandNum}k`,
      familyCount: bandFams.length,
      coveredFamilies,
      touchedFamilies,
      partialMasteredFamilies,
      fullMasteredFamilies,
      wordCount,
      masteredWords,
      learningOrQueuedWords,
      cetWordsInBand,
      cocaWordsInBand,
      pctMastered: wordCount > 0 ? Math.round((masteredWords / wordCount) * 100) : 0,
    };
  });

  return {
    statusCounts,
    cet4FormsTotal,
    cet4FormsMastered,
    cet4FormsLearningOrQueued,
    cet6AllFormsTotal,
    cet6AllFormsMastered,
    cet6OnlyFormsTotal,
    cet6OnlyFormsMastered,
    cet6OnlyFormsLearningOrQueued,
    cet4OfficialTotal,
    cet4OfficialPartialCovered,
    cet4OfficialFullMastered,
    cet6OfficialTotal,
    cet6OfficialPartialCovered,
    cet6OfficialFullMastered,
    totalCorpusFreq,
    masteredCorpusFreq,
    corpusWeightedPct:
      totalCorpusFreq > 0 ? ((masteredCorpusFreq / totalCorpusFreq) * 100).toFixed(1) : '0.0',
    bandRows,
    cocaHeadwordsTotal,
    cocaHeadwordsMastered,
    cocaHeadwordsLearningOrQueued,
    cocaLexemesTotal,
    cocaLexemesExplicitMastered,
    cocaLexemesExplicitLearningOrQueued,
    cocaLexemesProxyMastered,
    cocaTotalTokenFreq,
    cocaExplicitMasteredFreq,
    cocaExplicitWeightedPct:
      cocaTotalTokenFreq > 0
        ? ((cocaExplicitMasteredFreq / cocaTotalTokenFreq) * 100).toFixed(2)
        : '0.00',
    cocaProxyMasteredFreq,
    cocaProxyWeightedPct:
      cocaTotalTokenFreq > 0
        ? ((cocaProxyMasteredFreq / cocaTotalTokenFreq) * 100).toFixed(2)
        : '0.00',
    cocaHeadwordTierRows,
    cocaLexemeTierRows,
    bncFamiliesTotal: families.length,
    bncFamiliesUntouched,
    bncFamiliesTouched,
    bncFamiliesPartialMastered,
    bncFamiliesFullMastered,
  };
}
