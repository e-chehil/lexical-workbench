import {
  BncCocaFamily,
  CetOfficialEntry,
  DictionaryTemplate,
  FilterCriteria,
  LearningStatus,
  LexiconWordItem,
  SortField,
  UserWordRecord,
} from './types.ts';

export const DEFAULT_FILTER_CRITERIA: FilterCriteria = {
  searchQuery: '',
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
 * Tolerates either `(word, urlTemplate)` or `(urlTemplate, word)` argument order,
 * and strips ★ and homograph superscripts (¹ ² ³ ⁴ ⁵).
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

/**
 * Closed-class ultra-high-frequency grammar particles / single-letter suffixes
 * that appear at the top of raw BNC 1k frequency lists ("the", "of", "and", "to", "s", etc.)
 * and should be deprioritized in the default "Recommended Study Priority" sort
 * so learners immediately see meaningful CET-4/CET-6 & core content vocabulary.
 */
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
  's', 't', 'd', 'm', 're', 've', 'll', 'oh', 'yeah', 'uh', 'um', 'ok', 'okay',
]);

/**
 * Computes study priority score & human-readable reason for sorting and batch planning.
 * Already mastered or deferred words return score 0.
 * Closed-class particles and 1-letter tokens are heavily penalized so substantive content words
 * (e.g. able, ability, accept, account...) lead the recommended study order.
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
 * Multi-dimensional filtering and sorting across 76k+ lexicon items.
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
  const bandsSet = criteria.bands.length > 0 ? new Set(criteria.bands) : null;
  const statusSet = criteria.statuses.length > 0 ? new Set(criteria.statuses) : null;
  const requiredTags = criteria.tags;

  // Pre-compute families with at least one mastered member if needed
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

    // 1. Source filter
    switch (criteria.sourceFilter) {
      case 'cet_all':
        if (!w.inCet) continue;
        break;
      case 'cet4':
        if (!w.isCet4) continue;
        break;
      case 'cet6':
        // All CET-6 words (including homographs shared with CET-4 like ★appropriate²)
        if (!w.isCet6) continue;
        break;
      case 'cet6_new':
        // Strictly CET-6 only words (excluding CET-4 words)
        if (!w.isCet6Only) continue;
        break;
      case 'bnc_all':
        if (!w.inBnc && !w.bncLinkedViaVariant) continue;
        break;
      case 'both_cet_bnc':
        if (!w.inCet || (!w.inBnc && !w.bncLinkedViaVariant)) continue;
        break;
      case 'cet_only':
        if (!w.inCet || w.inBnc || w.bncLinkedViaVariant) continue;
        break;
      case 'bnc_only':
        if (!w.inBnc || w.inCet) continue;
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

    // 3. Frequency filters
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

    // 4. Status filter
    if (statusSet && !statusSet.has(status)) continue;

    // 5. Tags filter
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

    // 6. Family structure filter
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

    // 7. Special toggles
    if (criteria.phrasesOnly && !w.isPhrase) continue;
    if (criteria.homographsOnly && w.homographNumbers.length === 0) continue;

    // 8. Search query matching
    if (cleanQ) {
      const matchWord = w.normalized.includes(cleanQ);
      const matchHead = w.headword ? w.headword.toLowerCase().includes(cleanQ) : false;
      const matchRawCet = w.cetRefs.some((r) => r.rawLine.toLowerCase().includes(cleanQ));
      const matchNotes = rec?.notes ? rec.notes.toLowerCase().includes(cleanQ) : false;
      const matchTags = rec?.tags ? rec.tags.some((t) => t.toLowerCase().includes(cleanQ)) : false;
      if (!matchWord && !matchHead && !matchRawCet && !matchNotes && !matchTags) {
        continue;
      }
    }

    result.push(w);
  }

  // Sort results
  // If user typed a search query, always surface exact matches and headword matches first
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

/**
 * Levenshtein distance <= 1 check for optional fuzzy search in GlobalSearchModal.
 */
function isEditDistanceAtMostOne(a: string, b: string): boolean {
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

export interface SearchLexiconResult {
  word: LexiconWordItem;
  matchRank: 'exact' | 'headword' | 'prefix' | 'cet_raw' | 'substring' | 'fuzzy';
  matchedContext: string;
}

/**
 * Fast ranked search across words, inflections, headwords, and raw CET shorthand.
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
      exactMatches.push({
        word: w,
        matchRank: 'exact',
        matchedContext: w.isHeadword
          ? `词族首词 (${w.band || 'CET'})`
          : w.headword
            ? `派生自词族 ${w.headword} (${w.band})`
            : '大纲词条',
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
        matchedContext: w.headword ? `词族 ${w.headword}` : '前缀匹配',
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
    (b.word.formFrequency ?? b.word.familyFrequency ?? 0) -
    (a.word.formFrequency ?? a.word.familyFrequency ?? 0);

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
 * Parse a single CSV or TSV line following RFC 4180 quote and escaped-quote rules.
 * Supports:
 * - Tab-delimited lines (TSV)
 * - Comma-delimited lines with double-quoted fields, commas inside quotes ("核心词,高频"),
 *   and escaped double-quotes ("" -> ").
 */
export function parseCsvLine(line: string, delimiter: ',' | '\t' = ','): string[] {
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
      } else if (ch === delimiter) {
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
 * Parses multi-line batch input text (single-column, TSV, or RFC 4180 CSV)
 * and resolves each row against the lexicon.
 */
export function parseBatchInputText(
  rawText: string,
  wordsMap: Map<string, LexiconWordItem>,
  allWords: LexiconWordItem[]
): BatchParsedRow[] {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const rows: BatchParsedRow[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('#')) continue;

    // Detect delimiter: prefer Tab if present, otherwise Comma if present
    let cols: string[];
    if (rawLine.includes('\t')) {
      cols = parseCsvLine(rawLine, '\t');
    } else if (rawLine.includes(',')) {
      cols = parseCsvLine(rawLine, ',');
    } else {
      cols = [rawLine];
    }

    const firstCol = (cols[0] || '').replace(/^["']|["']$/g, '').trim();
    if (!firstCol) continue;

    // Skip optional CSV/TSV header row
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

    if (cols[1]) {
      const sCandidate = STATUS_TOKEN_MAP[cols[1].trim().toLowerCase()] || STATUS_TOKEN_MAP[cols[1].trim()];
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
      // Support both exported CSV columns (Word,CET_Levels,BNC_Band,Headword,Form_Frequency,Family_Frequency,Learning_Status,Tags,Notes)
      // and standard 4-column batch format (Word, Status, Tags, Notes)
      if (cols.length >= 8 && STATUS_TOKEN_MAP[cols[6]?.trim().toLowerCase()]) {
        parsedStatus = STATUS_TOKEN_MAP[cols[6].trim().toLowerCase()];
        parsedTags = (cols[7] || '')
          .split(/[,，;；|/]+/)
          .map((t) => t.trim().replace(/^#/, ''))
          .filter(Boolean);
        parsedNote = cols[8]?.trim() || undefined;
      } else {
        parsedTags.push(
          ...cols[2]
            .split(/[,，;；|/]+/)
            .map((t) => t.trim().replace(/^#/, ''))
            .filter(Boolean)
        );
        if (cols[3]) {
          parsedNote = cols.slice(3).join(', ').trim() || undefined;
        }
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
      // Try variant or inflection fallback
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

export interface BandCoverageRow {
  bandNum: number;
  bandLabel: string;
  familyCount: number;
  coveredFamilies: number;
  wordCount: number;
  masteredWords: number;
  learningOrQueuedWords: number;
  cetWordsInBand: number;
  pctMastered: number;
}

/**
 * Pure statistical summary for AnalyticsView and unit tests.
 * Explicitly separates:
 * 1. CET-4 / CET-6 expanded word-form mastery (展开词形掌握率)
 * 2. Official CET2016 raw entry partial coverage (官方词目覆盖率: 词目下任一词形已掌握)
 * 3. Official CET2016 raw entry full mastery (官方词目完整掌握率: 词目下所有成员槽位均已掌握)
 * 4. Strict BNC/COCA corpus token frequency coverage (仅统计 BNC/COCA 独立实测词形频次，绝不累加变体借用频次)
 */
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
}

export function computeLexiconAnalytics(
  words: LexiconWordItem[],
  families: BncCocaFamily[],
  cetEntries: CetOfficialEntry[],
  userRecordsMap: Map<string, UserWordRecord>
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

  for (const w of words) {
    const rec = userRecordsMap.get(w.id);
    const st: LearningStatus = rec?.status || 'unrated';
    statusCounts[st]++;

    // Only sum genuine BNC/COCA recorded word frequencies (never variant-linked null frequencies)
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

  const bandRows: BandCoverageRow[] = Array.from({ length: 25 }, (_, idx) => {
    const bandNum = idx + 1;
    const bandFams = families.filter((f) => f.bandNumber === bandNum);
    const seenWordsInBand = new Set<string>();
    let masteredWords = 0;
    let learningOrQueuedWords = 0;
    let coveredFamilies = 0;
    let cetWordsInBand = 0;

    for (const fam of bandFams) {
      let famHasMastered = false;
      cetWordsInBand += fam.cetMemberCount;
      for (const m of fam.members) {
        const st = userRecordsMap.get(m.normalized)?.status || 'unrated';
        if (st === 'mastered') {
          famHasMastered = true;
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
      if (famHasMastered) coveredFamilies++;
    }

    const wordCount = seenWordsInBand.size;
    return {
      bandNum,
      bandLabel: `${bandNum}k`,
      familyCount: bandFams.length,
      coveredFamilies,
      wordCount,
      masteredWords,
      learningOrQueuedWords,
      cetWordsInBand,
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
  };
}
