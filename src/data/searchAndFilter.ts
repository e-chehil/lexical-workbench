import {
  BncCocaFamily,
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
    shortName: '剑桥英汉',
    description: '剑桥词典英语-简体中文官方释义与例句',
    urlTemplate: 'https://dictionary.cambridge.org/dictionary/english-chinese-simplified/{word}',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'oxford',
    name: "Oxford Learner's Dictionaries",
    shortName: '牛津高阶',
    description: '牛津学习者词典官方音标、搭配与词源',
    urlTemplate: 'https://www.oxfordlearnersdictionaries.com/definition/english/{word}',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'ldoce',
    name: 'Longman Dictionary (LDOCE)',
    shortName: '朗文当代',
    description: '朗文当代高级英语辞典固定搭配与语料库例句',
    urlTemplate: 'https://www.ldoceonline.com/dictionary/{word}',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'collins',
    name: 'Collins Online Dictionary',
    shortName: '柯林斯',
    description: '柯林斯整句释义与词频趋势',
    urlTemplate: 'https://www.collinsdictionary.com/dictionary/english/{word}',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'merriam_webster',
    name: 'Merriam-Webster Dictionary',
    shortName: '韦氏词典',
    description: '韦氏大学词典美式用法与近义词辨析',
    urlTemplate: 'https://www.merriam-webster.com/dictionary/{word}',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'britannica',
    name: 'The Britannica Dictionary',
    shortName: '大英词典',
    description: '原韦氏学习者词典，简明清晰的核心用法',
    urlTemplate: 'https://www.britannica.com/dictionary/{word}',
    enabled: true,
    isBuiltIn: true,
  },
];

/**
 * Cleans internal symbols (★, ¹²³) and builds a safe external dictionary URL.
 */
export function buildDictionaryUrl(arg1: string, arg2: string): string {
  const isArg1Url = arg1.includes('{word}') || arg1.startsWith('http');
  const rawWord = isArg1Url ? arg2 : arg1;
  const templateUrl = isArg1Url ? arg1 : arg2;

  const cleaned = rawWord
    .replace(/★/g, '')
    .replace(/[¹²³⁴⁵]/g, '')
    .trim();

  // Most dictionary paths use hyphen for spaces in URL slugs except Merriam-Webster which accepts encoded space
  const isMerriam = templateUrl.includes('merriam-webster.com');
  const slug = isMerriam
    ? encodeURIComponent(cleaned)
    : encodeURIComponent(cleaned.replace(/\s+/g, '-').toLowerCase());

  return templateUrl.replace('{word}', slug);
}

/**
 * Computes transparent priority weight for a word to assist study planning.
 * Higher score = higher value to learn next.
 */
export function computeStudyPriorityScore(
  word: LexiconWordItem,
  userRecord?: UserWordRecord,
  familyMasteredRatio = 0
): { score: number; reason: string } {
  const status = userRecord?.status || 'unrated';
  if (status === 'mastered') {
    return { score: 0, reason: '已掌握，无需重复列入计划' };
  }
  if (status === 'deferred') {
    return { score: 1, reason: '已标记为暂缓学习' };
  }

  let score = 0;
  const reasons: string[] = [];

  // 1. Exam relevance weight (0 - 400 pts)
  if (word.isCet4) {
    score += 400;
    reasons.push('CET4 核心大纲 (+400)');
  } else if (word.isCet6) {
    score += 320;
    reasons.push('CET6 进阶大纲 (+320)');
  }

  // 2. BNC/COCA frequency band weight (0 - 500 pts)
  if (word.bandNumber !== null && word.bandNumber >= 1 && word.bandNumber <= 25) {
    const bandPoints = Math.max(0, (26 - word.bandNumber) * 20);
    score += bandPoints;
    reasons.push(`${word.band} 频段权重 (+${bandPoints})`);
  }

  // 3. Log-scaled form & family frequency bonus (0 - 200 pts)
  if (word.formFrequency !== null && word.formFrequency > 0) {
    const formBonus = Math.min(120, Math.round(Math.log10(word.formFrequency + 1) * 28));
    score += formBonus;
    reasons.push(`词形频次 ${word.formFrequency.toLocaleString()} (+${formBonus})`);
  }
  if (word.familyFrequency !== null && word.familyFrequency > 0) {
    const famBonus = Math.min(80, Math.round(Math.log10(word.familyFrequency + 1) * 16));
    score += famBonus;
  }

  // 4. Family leverage bonus: if family already has mastered words, learning a derivative is easier
  if (familyMasteredRatio > 0 && familyMasteredRatio < 1) {
    const leverageBonus = Math.round(familyMasteredRatio * 90);
    score += leverageBonus;
    reasons.push(`熟词词族派生加权 (+${leverageBonus})`);
  }

  // 5. Status boost if user already queued it
  if (status === 'queued') {
    score += 150;
    reasons.push('已标记待学 (+150)');
  } else if (status === 'learning') {
    score += 100;
    reasons.push('学习中巩固 (+100)');
  }

  return {
    score,
    reason: reasons.length > 0 ? reasons.join(' · ') : '基础词库收录词',
  };
}

export interface SearchResultItem {
  word: LexiconWordItem;
  matchRank: 'exact' | 'variant_or_cet_raw' | 'prefix' | 'substring' | 'fuzzy';
  matchedContext: string;
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      edits++;
      if (edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  if (i < a.length || j < b.length) edits++;
  return edits <= 1;
}

/**
 * Searches the lexicon with exact match priority, variant/CET raw match, prefix match, substring match, and optional fuzzy match.
 */
export function searchLexicon(
  words: LexiconWordItem[],
  rawQuery: string,
  options: { enableFuzzy?: boolean; limit?: number } = {}
): SearchResultItem[] {
  const query = rawQuery
    .replace(/★/g, '')
    .replace(/[¹²³⁴⁵]/g, '')
    .trim()
    .toLowerCase();

  if (!query) return [];
  const limit = options.limit ?? 80;
  const enableFuzzy = options.enableFuzzy ?? false;

  const exact: SearchResultItem[] = [];
  const variantMatch: SearchResultItem[] = [];
  const prefix: SearchResultItem[] = [];
  const substring: SearchResultItem[] = [];
  const fuzzy: SearchResultItem[] = [];

  for (const w of words) {
    if (w.normalized === query) {
      exact.push({
        word: w,
        matchRank: 'exact',
        matchedContext: w.isHeadword
          ? `词族代表词 (${w.band || 'CET'})`
          : w.headword
            ? `词族 ${w.headword} 成员词形 (${w.formFrequency?.toLocaleString() ?? '未收录'})`
            : '精确匹配词条',
      });
      continue;
    }

    // Check raw CET member text or display variants (e.g. "colo(u)r", "advisor/-er")
    const hitCetRaw = w.cetRefs.find(
      (r) => r.rawMember.toLowerCase().includes(query) || r.rawLine.toLowerCase() === query
    );
    if (
      w.displayVariants.some((v) => v.toLowerCase() === query) ||
      (hitCetRaw && hitCetRaw.rawMember.replace(/★|[¹²³]/g, '').toLowerCase() === query)
    ) {
      variantMatch.push({
        word: w,
        matchRank: 'variant_or_cet_raw',
        matchedContext: `匹配官方原表写法 ${hitCetRaw?.rawMember || w.displayVariants.join('/')}`,
      });
      continue;
    }

    if (w.normalized.startsWith(query)) {
      prefix.push({
        word: w,
        matchRank: 'prefix',
        matchedContext: w.headword ? `词族: ${w.headword} (${w.band})` : '前缀匹配',
      });
      continue;
    }

    if (query.length >= 2 && w.normalized.includes(query)) {
      substring.push({
        word: w,
        matchRank: 'substring',
        matchedContext: w.isPhrase ? '匹配多词短语' : `包含 "${query}"`,
      });
      continue;
    }

    if (
      enableFuzzy &&
      query.length >= 5 &&
      fuzzy.length < 25 &&
      editDistanceAtMostOne(w.normalized, query)
    ) {
      fuzzy.push({
        word: w,
        matchRank: 'fuzzy',
        matchedContext: '拼写相近候选',
      });
    }
  }

  // Sort prefix and substring by family/form frequency desc then length asc
  const sortByRelevance = (a: SearchResultItem, b: SearchResultItem) => {
    if (a.word.inCet !== b.word.inCet) return a.word.inCet ? -1 : 1;
    const freqA = a.word.formFrequency ?? -1;
    const freqB = b.word.formFrequency ?? -1;
    if (freqB !== freqA) return freqB - freqA;
    return a.word.normalized.length - b.word.normalized.length;
  };

  prefix.sort(sortByRelevance);
  substring.sort(sortByRelevance);

  return [...exact, ...variantMatch, ...prefix, ...substring, ...fuzzy].slice(0, limit);
}

/**
 * Multi-dimensional filtering and sorting of LexiconWordItems combined with UserWordRecords.
 */
export function filterAndSortWords(
  words: LexiconWordItem[],
  userRecordsMap: Map<string, UserWordRecord>,
  criteria: FilterCriteria,
  sortField: SortField,
  familiesMap?: Map<string, BncCocaFamily>
): LexiconWordItem[] {
  // Pre-calculate family unmastered info if needed for family filter or priority sort
  const familyHasUnmastered = new Set<string>();
  const familyMasteredRatioMap = new Map<string, number>();

  if (
    familiesMap &&
    (criteria.familyFilter === 'high_freq_unmastered_member' || sortField === 'priority_weight_desc')
  ) {
    for (const fam of familiesMap.values()) {
      let masteredCount = 0;
      let hasUnmastered = false;
      for (const m of fam.members) {
        const st = userRecordsMap.get(m.normalized)?.status || 'unrated';
        if (st === 'mastered') masteredCount++;
        else hasUnmastered = true;
      }
      if (hasUnmastered && fam.bandNumber <= 5) {
        familyHasUnmastered.add(fam.id);
      }
      familyMasteredRatioMap.set(
        fam.id,
        fam.members.length > 0 ? masteredCount / fam.members.length : 0
      );
    }
  }

  const q = criteria.searchQuery
    .replace(/★/g, '')
    .replace(/[¹²³⁴⁵]/g, '')
    .trim()
    .toLowerCase();

  const filtered = words.filter((w) => {
    // 1. Search query
    if (q) {
      const matchWord = w.normalized.includes(q);
      const matchHead = w.headword?.toLowerCase().includes(q) ?? false;
      const matchCetRaw = w.cetRefs.some((r) => r.rawMember.toLowerCase().includes(q));
      const userRec = userRecordsMap.get(w.id);
      const matchNoteOrTag =
        (userRec?.notes?.toLowerCase().includes(q) ?? false) ||
        (userRec?.tags?.some((t) => t.toLowerCase().includes(q)) ?? false);
      if (!matchWord && !matchHead && !matchCetRaw && !matchNoteOrTag) {
        return false;
      }
    }

    // 2. Source / Exam filter
    switch (criteria.sourceFilter) {
      case 'cet_all':
        if (!w.inCet) return false;
        break;
      case 'cet4':
        if (!w.isCet4) return false;
        break;
      case 'cet6_new':
        if (!w.isCet6Only) return false;
        break;
      case 'bnc_all':
        if (!w.inBnc) return false;
        break;
      case 'both_cet_bnc':
        if (!(w.inCet && w.inBnc)) return false;
        break;
      case 'cet_only':
        if (!(w.inCet && !w.inBnc)) return false;
        break;
      case 'bnc_only':
        if (!(!w.inCet && w.inBnc)) return false;
        break;
    }

    // 3. Phrase / Homograph toggles
    if (criteria.phrasesOnly && !w.isPhrase) return false;
    if (criteria.homographsOnly && w.homographNumbers.length === 0) return false;

    // 4. Band filters
    if (criteria.bands.length > 0) {
      if (w.bandNumber === null || !criteria.bands.includes(w.bandNumber)) return false;
    }
    if (criteria.minBand !== null) {
      if (w.bandNumber === null || w.bandNumber < criteria.minBand) return false;
    }
    if (criteria.maxBand !== null) {
      if (w.bandNumber === null || w.bandNumber > criteria.maxBand) return false;
    }

    // 5. Frequency filters
    if (!criteria.includeUnrankedFreq && !w.inBnc) return false;
    if (!criteria.includeZeroFreq && w.formFrequency === 0) return false;

    if (criteria.minFormFreq !== null) {
      if (w.formFrequency === null || w.formFrequency < criteria.minFormFreq) return false;
    }
    if (criteria.maxFormFreq !== null) {
      if (w.formFrequency === null || w.formFrequency > criteria.maxFormFreq) return false;
    }
    if (criteria.minFamilyFreq !== null) {
      if (w.familyFrequency === null || w.familyFrequency < criteria.minFamilyFreq) return false;
    }
    if (criteria.maxFamilyFreq !== null) {
      if (w.familyFrequency === null || w.familyFrequency > criteria.maxFamilyFreq) return false;
    }

    // 6. User Status & Tags
    const userRec = userRecordsMap.get(w.id);
    const currentStatus: LearningStatus = userRec?.status || 'unrated';
    if (criteria.statuses.length > 0 && !criteria.statuses.includes(currentStatus)) {
      return false;
    }

    const userTags = userRec?.tags || [];
    if (criteria.tagFilterMode === 'untagged') {
      if (userTags.length > 0) return false;
    } else if (criteria.tags.length > 0) {
      if (criteria.tagFilterMode === 'all') {
        if (!criteria.tags.every((t) => userTags.includes(t))) return false;
      } else {
        if (!criteria.tags.some((t) => userTags.includes(t))) return false;
      }
    }

    // 7. Family characteristics filter
    switch (criteria.familyFilter) {
      case 'headword_only':
        if (!w.isHeadword && !w.cetRefs.some((r) => r.role === 'headword')) return false;
        break;
      case 'derived_only':
        if (w.isHeadword && !w.cetRefs.some((r) => r.role === 'derivative')) return false;
        if (!w.inBnc && !w.cetRefs.some((r) => r.role === 'derivative')) return false;
        break;
      case 'has_cet_peers':
        if (
          w.familyCetMemberCount <= 1 &&
          !w.cetRefs.some((r) => r.peerForms.length > 0)
        ) {
          return false;
        }
        break;
      case 'high_freq_unmastered_member':
        if (
          currentStatus === 'mastered' ||
          !w.familyId ||
          !familyHasUnmastered.has(w.familyId)
        ) {
          return false;
        }
        break;
      case 'high_family_low_form':
        // High family freq (>= 5000) but lower individual form freq (<= 800 and < 15% of family)
        if (
          w.familyFrequency === null ||
          w.formFrequency === null ||
          w.familyFrequency < 5000 ||
          w.formFrequency > 800 ||
          w.formFrequency / w.familyFrequency > 0.15
        ) {
          return false;
        }
        break;
      case 'single_member_family':
        if (w.familyMemberCount !== 1) return false;
        break;
      case 'large_family':
        if (w.familyMemberCount === null || w.familyMemberCount < 8) return false;
        break;
    }

    return true;
  });

  // Sort results
  const sorted = [...filtered].sort((a, b) => {
    // If there is an active search query, always put exact match first!
    if (q) {
      const aExact = a.normalized === q;
      const bExact = b.normalized === q;
      if (aExact !== bExact) return aExact ? -1 : 1;
    }

    switch (sortField) {
      case 'word_asc':
        return a.normalized.localeCompare(b.normalized);
      case 'word_desc':
        return b.normalized.localeCompare(a.normalized);
      case 'form_freq_desc': {
        const fa = a.formFrequency ?? -1;
        const fb = b.formFrequency ?? -1;
        if (fb !== fa) return fb - fa;
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
        const fa = a.familyFrequency ?? -1;
        const fb = b.familyFrequency ?? -1;
        return fb - fa;
      }
      case 'band_desc': {
        const ba = a.bandNumber ?? -1;
        const bb = b.bandNumber ?? -1;
        if (bb !== ba) return bb - ba;
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
      case 'priority_weight_desc': {
        const sa = computeStudyPriorityScore(
          a,
          userRecordsMap.get(a.id),
          a.familyId ? familyMasteredRatioMap.get(a.familyId) || 0 : 0
        ).score;
        const sb = computeStudyPriorityScore(
          b,
          userRecordsMap.get(b.id),
          b.familyId ? familyMasteredRatioMap.get(b.familyId) || 0 : 0
        ).score;
        if (sb !== sa) return sb - sa;
        return a.normalized.localeCompare(b.normalized);
      }
      default:
        return a.normalized.localeCompare(b.normalized);
    }
  });

  return sorted;
}

export interface BatchParsedRow {
  rawInput: string;
  cleanedTerm: string;
  normalizedTerm: string;
  isDuplicateInBatch: boolean;
  matchedWord: LexiconWordItem | null;
  candidateWords: LexiconWordItem[];
  matchStatus: 'matched_exact' | 'matched_variant' | 'ambiguous_homograph' | 'unmatched';
  parsedStatus?: LearningStatus;
  parsedTags?: string[];
  parsedNote?: string;
}

const STATUS_ALIAS_MAP: Record<string, LearningStatus> = {
  unrated: 'unrated',
  未评估: 'unrated',
  queued: 'queued',
  待学: 'queued',
  learning: 'learning',
  学习中: 'learning',
  在学: 'learning',
  mastered: 'mastered',
  已掌握: 'mastered',
  掌握: 'mastered',
  deferred: 'deferred',
  暂缓: 'deferred',
};

/**
 * Parses batch user input (multiline text or CSV/TSV) while preserving multi-word expressions like "owing to" or "baby boom".
 */
export function parseBatchInputText(
  rawText: string,
  wordsByNormalized: Map<string, LexiconWordItem>,
  allWords: LexiconWordItem[]
): BatchParsedRow[] {
  const lines = rawText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const seenNormalized = new Set<string>();
  const results: BatchParsedRow[] = [];

  for (const line of lines) {
    // Support Tab or semicolon/comma separated metadata: word \t status \t tags \t note
    let termPart = line;
    let parsedStatus: LearningStatus | undefined;
    let parsedTags: string[] | undefined;
    let parsedNote: string | undefined;

    if (line.includes('\t')) {
      const cols = line.split('\t').map((c) => c.trim());
      termPart = cols[0];
      if (cols[1] && STATUS_ALIAS_MAP[cols[1].toLowerCase()]) {
        parsedStatus = STATUS_ALIAS_MAP[cols[1].toLowerCase()];
      }
      if (cols[2]) {
        parsedTags = cols[2]
          .split(/[,，;；]/)
          .map((t) => t.trim())
          .filter(Boolean);
      }
      if (cols[3]) {
        parsedNote = cols[3];
      }
    } else if (line.includes(',')) {
      const cols = line.split(',').map((c) => c.trim());
      if (cols.length >= 2 && STATUS_ALIAS_MAP[cols[1].toLowerCase()]) {
        termPart = cols[0];
        parsedStatus = STATUS_ALIAS_MAP[cols[1].toLowerCase()];
        if (cols[2]) {
          parsedTags = cols[2]
            .split(/[;；|]/)
            .map((t) => t.trim())
            .filter(Boolean);
        }
        if (cols[3]) parsedNote = cols[3];
      }
    }

    // Normalize internal whitespace to single space (preserving phrases like "owing to"!)
    const cleanedTerm = termPart
      .replace(/★/g, '')
      .replace(/[¹²³⁴⁵]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanedTerm) continue;
    const normalizedTerm = cleanedTerm.toLowerCase();
    const isDuplicateInBatch = seenNormalized.has(normalizedTerm);
    seenNormalized.add(normalizedTerm);

    const exactHit = wordsByNormalized.get(normalizedTerm) || null;
    if (exactHit) {
      const isHomograph = exactHit.homographNumbers.length > 1 || exactHit.cetRefs.length > 1;
      results.push({
        rawInput: line,
        cleanedTerm,
        normalizedTerm,
        isDuplicateInBatch,
        matchedWord: exactHit,
        candidateWords: [exactHit],
        matchStatus: isHomograph ? 'ambiguous_homograph' : 'matched_exact',
        parsedStatus,
        parsedTags,
        parsedNote,
      });
    } else {
      // Search variants or prefix candidates
      const candidates = allWords
        .filter(
          (w) =>
            w.displayVariants.some((v) => v.toLowerCase() === normalizedTerm) ||
            w.cetRefs.some(
              (r) => r.rawMember.replace(/★|[¹²³]/g, '').toLowerCase() === normalizedTerm
            )
        )
        .slice(0, 5);

      if (candidates.length > 0) {
        results.push({
          rawInput: line,
          cleanedTerm,
          normalizedTerm,
          isDuplicateInBatch,
          matchedWord: candidates[0],
          candidateWords: candidates,
          matchStatus: 'matched_variant',
          parsedStatus,
          parsedTags,
          parsedNote,
        });
      } else {
        results.push({
          rawInput: line,
          cleanedTerm,
          normalizedTerm,
          isDuplicateInBatch,
          matchedWord: null,
          candidateWords: [],
          matchStatus: 'unmatched',
          parsedStatus,
          parsedTags,
          parsedNote,
        });
      }
    }
  }

  return results;
}
