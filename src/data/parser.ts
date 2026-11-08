import { getCocaPosMeta } from './types.ts';
import type {
  BncCocaFamily,
  BncCocaMember,
  BncFamilyMembership,
  CetMemberItem,
  CetOfficialEntry,
  CetWordReference,
  CocaLexemeRecord,
  CocaRawJsonEntry,
  DataDiagnosticItem,
  DataDiagnosticsReport,
  ExpansionRuleType,
  LexiconDatabaseBundle,
  LexiconWordItem,
  ThreeSourceVennSummary,
} from './types.ts';
import { parseCoca2020 } from './cocaParser.ts';

const SUPERSCRIPT_MAP: Record<string, number> = {
  '¹': 1,
  '²': 2,
  '³': 3,
  '⁴': 4,
  '⁵': 5,
};

/**
 * Extracts homograph superscript number (¹ ² ³) and returns cleaned string + number.
 */
export function extractHomograph(raw: string): { text: string; homographNumber: number | null } {
  let homographNumber: number | null = null;
  let cleaned = raw;
  for (const [sup, num] of Object.entries(SUPERSCRIPT_MAP)) {
    if (cleaned.includes(sup)) {
      homographNumber = num;
      cleaned = cleaned.replaceAll(sup, '');
    }
  }
  return { text: cleaned.trim(), homographNumber };
}

/**
 * Expands a single CET member token (after ★ is stripped) into deterministic word forms.
 */
export function expandCetMemberToken(rawTokenWithStar: string): {
  isCet6Star: boolean;
  cleanRaw: string;
  homographNumber: number | null;
  expandedForms: string[];
  expansionRule: ExpansionRuleType;
  expansionNotes: string;
  isAmbiguous: boolean;
} {
  const trimmed = rawTokenWithStar.trim();
  const isCet6Star = trimmed.startsWith('★');
  const withoutStar = isCet6Star ? trimmed.slice(1).trim() : trimmed;
  const { text: token, homographNumber } = extractHomograph(withoutStar);

  // 1. Special combined parenthetical + slash patterns in CET2016
  if (token === 'kilogram(me)/kilo') {
    return {
      isCet6Star,
      cleanRaw: withoutStar,
      homographNumber,
      expandedForms: ['kilogram', 'kilogramme', 'kilo'],
      expansionRule: 'combined_paren_slash',
      expansionNotes: '括号可选字母 + 斜杠缩写展开：kilogram / kilogramme / kilo',
      isAmbiguous: false,
    };
  }
  if (token === 'math(ematics)/maths') {
    return {
      isCet6Star,
      cleanRaw: withoutStar,
      homographNumber,
      expandedForms: ['math', 'mathematics', 'maths'],
      expansionRule: 'combined_paren_slash',
      expansionNotes: '括号可选词尾 + 斜杠英美缩写展开：math / mathematics / maths',
      isAmbiguous: false,
    };
  }
  if (token === "coup (d'état)") {
    return {
      isCet6Star,
      cleanRaw: withoutStar,
      homographNumber,
      expandedForms: ['coup', "coup d'état"],
      expansionRule: 'paren_optional',
      expansionNotes: "括号可选短语成分展开：coup / coup d'état",
      isAmbiguous: false,
    };
  }

  // 2. Official CET2016 outline special slash shorthands — strictly preserve all syllabus forms
  if (token === 'Celsius/-cius') {
    return {
      isCet6Star,
      cleanRaw: withoutStar,
      homographNumber,
      expandedForms: ['Celsius', 'Celcius'],
      expansionRule: 'slash_suffix',
      expansionNotes:
        '依据考纲原文 Celsius/-cius 完整保留两种拼写形式：Celsius / Celcius',
      isAmbiguous: true,
    };
  }
  if (token === 'sober/-re') {
    return {
      isCet6Star,
      cleanRaw: withoutStar,
      homographNumber,
      expandedForms: ['sober', 'sobre'],
      expansionRule: 'slash_suffix',
      expansionNotes:
        '依据考纲原文 sober/-re 完整保留两种拼写形式：sober / sobre',
      isAmbiguous: true,
    };
  }

  // 3. Parenthetical optional characters: prefix(opt)suffix
  const parenMatch = token.match(/^([^(]+)\(([^)]+)\)(.*)$/);
  if (parenMatch) {
    const [, prefix, opt, suffix] = parenMatch;
    const formWithout = `${prefix}${suffix}`.trim();
    const formWith = `${prefix}${opt}${suffix}`.trim();
    const forms = Array.from(new Set([formWithout, formWith]));
    return {
      isCet6Star,
      cleanRaw: withoutStar,
      homographNumber,
      expandedForms: forms,
      expansionRule: 'paren_optional',
      expansionNotes: `括号可选字母展开：${forms.join(' / ')}`,
      isAmbiguous: false,
    };
  }

  // 4. Slash patterns
  if (token.includes('/')) {
    const [leftRaw, rightRaw] = token.split('/').map((s) => s.trim());
    if (rightRaw.startsWith('-')) {
      const suffix = rightRaw.slice(1);
      let altForm: string | null = null;

      if (suffix === 'er' && leftRaw.endsWith('or')) {
        altForm = leftRaw.slice(0, -2) + 'er';
      } else if (suffix === 're' && leftRaw.endsWith('er')) {
        altForm = leftRaw.slice(0, -2) + 're';
      } else if (suffix === 'yse' && leftRaw.endsWith('yze')) {
        altForm = leftRaw.slice(0, -3) + 'yse';
      } else if (suffix === 'ise' && leftRaw.endsWith('ize')) {
        altForm = leftRaw.slice(0, -3) + 'ise';
      } else if (suffix === 'iser' && leftRaw.endsWith('izer')) {
        altForm = leftRaw.slice(0, -4) + 'iser';
      } else if (suffix === 'sation' && leftRaw.endsWith('zation')) {
        altForm = leftRaw.slice(0, -6) + 'sation';
      } else if (suffix === 'sational' && leftRaw.endsWith('zational')) {
        altForm = leftRaw.slice(0, -8) + 'sational';
      } else if (suffix === 'tre' && leftRaw.endsWith('ter')) {
        altForm = leftRaw.slice(0, -3) + 'tre';
      } else if (suffix === 'bre' && leftRaw.endsWith('ber')) {
        altForm = leftRaw.slice(0, -3) + 'bre';
      } else if (suffix === 'xion' && leftRaw.endsWith('ction')) {
        altForm = leftRaw.slice(0, -5) + 'xion';
      } else if (suffix === 'sy' && leftRaw.endsWith('zy')) {
        altForm = leftRaw.slice(0, -2) + 'sy';
      } else if (suffix === 'ce' && leftRaw.endsWith('se')) {
        altForm = leftRaw.slice(0, -2) + 'ce';
      } else if (suffix === 'ice' && leftRaw.endsWith('ise')) {
        altForm = leftRaw.slice(0, -3) + 'ice';
      } else if (suffix.length > 0 && leftRaw.length > suffix.length) {
        altForm = leftRaw.slice(0, -suffix.length) + suffix;
      }

      if (altForm) {
        return {
          isCet6Star,
          cleanRaw: withoutStar,
          homographNumber,
          expandedForms: Array.from(new Set([leftRaw, altForm])),
          expansionRule: 'slash_suffix',
          expansionNotes: `词尾简写展开 (${withoutStar})：${leftRaw} / ${altForm}`,
          isAmbiguous: false,
        };
      } else {
        return {
          isCet6Star,
          cleanRaw: withoutStar,
          homographNumber,
          expandedForms: [leftRaw],
          expansionRule: 'unexpanded_ambiguous',
          expansionNotes: `保留考纲词形 ${withoutStar}`,
          isAmbiguous: true,
        };
      }
    } else {
      const forms = Array.from(new Set([leftRaw, rightRaw].filter(Boolean)));
      return {
        isCet6Star,
        cleanRaw: withoutStar,
        homographNumber,
        expandedForms: forms,
        expansionRule: 'slash_parallel',
        expansionNotes: `并列拼写/同义词条展开：${forms.join(' / ')}`,
        isAmbiguous: false,
      };
    }
  }

  // 5. Multi-word phrase
  if (token.includes(' ')) {
    return {
      isCet6Star,
      cleanRaw: withoutStar,
      homographNumber,
      expandedForms: [token],
      expansionRule: 'phrase',
      expansionNotes: '保留词组内部空格作为完整多词短语词条',
      isAmbiguous: false,
    };
  }

  // 6. Homograph or exact single word
  return {
    isCet6Star,
    cleanRaw: withoutStar,
    homographNumber,
    expandedForms: [token],
    expansionRule: homographNumber !== null ? 'homograph' : 'exact',
    expansionNotes:
      homographNumber !== null
        ? `保留官方同形异义词编号 #${homographNumber} (${withoutStar})`
        : '标准单词词条',
    isAmbiguous: false,
  };
}

/**
 * Parses CET2016.txt content into structured CetOfficialEntry records and diagnostic items.
 */
export function parseCet2016(rawContent: string): {
  entries: CetOfficialEntry[];
  diagnostics: DataDiagnosticItem[];
} {
  const cleanContent = rawContent.replace(/^\uFEFF/, '');
  const lines = cleanContent.split(/\r?\n/);
  const entries: CetOfficialEntry[] = [];
  const diagnostics: DataDiagnosticItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trimEnd();
    if (!rawLine.trim()) continue;
    const lineNumber = i + 1;

    const tabParts = rawLine.split('\t').map((p) => p.trim()).filter(Boolean);
    if (tabParts.length === 0) continue;

    const lineHasStar = tabParts.some((p) => p.includes('★'));
    const members: CetMemberItem[] = tabParts.map((part, idx) => {
      const expanded = expandCetMemberToken(part);
      const isMemberCet6 = expanded.isCet6Star || lineHasStar;

      if (expanded.isAmbiguous) {
        diagnostics.push({
          id: `cet_ambig_${lineNumber}_${idx}`,
          source: 'CET2016',
          severity: 'ambiguous',
          category: 'ambiguous_spelling',
          rawText: part,
          lineNumber,
          parsedResult: expanded.expandedForms,
          explanation: expanded.expansionNotes,
        });
      } else if (
        expanded.expansionRule === 'slash_suffix' ||
        expanded.expansionRule === 'slash_parallel'
      ) {
        diagnostics.push({
          id: `cet_slash_${lineNumber}_${idx}`,
          source: 'CET2016',
          severity: 'info',
          category: 'slash_expansion',
          rawText: part,
          lineNumber,
          parsedResult: expanded.expandedForms,
          explanation: expanded.expansionNotes,
        });
      } else if (
        expanded.expansionRule === 'paren_optional' ||
        expanded.expansionRule === 'combined_paren_slash'
      ) {
        diagnostics.push({
          id: `cet_paren_${lineNumber}_${idx}`,
          source: 'CET2016',
          severity: 'info',
          category: 'paren_expansion',
          rawText: part,
          lineNumber,
          parsedResult: expanded.expandedForms,
          explanation: expanded.expansionNotes,
        });
      } else if (expanded.expansionRule === 'phrase') {
        diagnostics.push({
          id: `cet_phrase_${lineNumber}_${idx}`,
          source: 'CET2016',
          severity: 'info',
          category: 'phrase_entry',
          rawText: part,
          lineNumber,
          parsedResult: expanded.expandedForms,
          explanation: `第 ${lineNumber} 行包含多词短语 "${part}"，所属大纲词目：${tabParts[0]}`,
        });
      } else if (expanded.homographNumber !== null) {
        diagnostics.push({
          id: `cet_homo_${lineNumber}_${idx}`,
          source: 'CET2016',
          severity: 'info',
          category: 'homograph',
          rawText: part,
          lineNumber,
          parsedResult: expanded.expandedForms,
          explanation: `同形词编号词目 ${part.replace(/^★/, '')} (${lineHasStar ? 'CET-6' : 'CET-4'})`,
        });
      }

      return {
        rawText: part,
        cleanRaw: expanded.cleanRaw,
        isRepresentative: idx === 0,
        isCet6Star: isMemberCet6,
        homographNumber: expanded.homographNumber,
        expandedForms: expanded.expandedForms,
        expansionRule: expanded.expansionRule,
        expansionNotes: expanded.expansionNotes,
        isAmbiguous: expanded.isAmbiguous,
      };
    });

    const headMember = members[0];
    entries.push({
      id: `cet_${lineNumber}`,
      lineNumber,
      rawLine,
      isCet6: lineHasStar,
      level: lineHasStar ? 'CET6' : 'CET4',
      headwordRaw: headMember.rawText,
      headwordDisplay: headMember.cleanRaw,
      members,
    });
  }

  return { entries, diagnostics };
}

/**
 * Parses BNC_COCA_lists.txt content into structured BncCocaFamily records and diagnostic items.
 */
export function parseBncCoca(rawContent: string): {
  families: BncCocaFamily[];
  diagnostics: DataDiagnosticItem[];
  totalLines: number;
} {
  const cleanContent = rawContent.replace(/^\uFEFF/, '');
  const lines = cleanContent.split(/\r?\n/);
  const families: BncCocaFamily[] = [];
  const diagnostics: DataDiagnosticItem[] = [];
  let validLineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    if (i === 0 && rawLine.toLowerCase().startsWith('list')) {
      continue;
    }
    validLineCount++;
    const lineNumber = i + 1;
    const cols = rawLine.split('\t');
    if (cols.length < 4) continue;

    const band = cols[0].trim();
    const bandMatch = band.match(/^(\d+)k$/i);
    const bandNumber = bandMatch ? parseInt(bandMatch[1], 10) : 99;
    const headword = cols[1].trim();
    const relatedRaw = cols[2].trim().replace(/^"|"$/g, '');
    const totalFrequency = parseInt(cols[3].trim(), 10) || 0;

    const memberMap = new Map<string, BncCocaMember>();
    let calculatedSum = 0;

    if (relatedRaw) {
      const items = relatedRaw.split(/,\s*/);
      for (const item of items) {
        const m = item.match(/^(.*?)\s*\((\d+)\)$/);
        if (m) {
          const wordForm = m[1].trim();
          const freq = parseInt(m[2], 10);
          calculatedSum += freq;
          const norm = wordForm.toLowerCase();
          const existing = memberMap.get(norm);
          if (existing) {
            existing.frequency += freq;
            existing.isZeroFrequency = existing.frequency === 0;
          } else {
            memberMap.set(norm, {
              word: wordForm,
              normalized: norm,
              frequency: freq,
              isHeadword: norm === headword.toLowerCase(),
              isZeroFrequency: freq === 0,
            });
          }
        }
      }
    }

    const normHead = headword.toLowerCase();
    if (!memberMap.has(normHead)) {
      memberMap.set(normHead, {
        word: headword,
        normalized: normHead,
        frequency: totalFrequency,
        isHeadword: true,
        isZeroFrequency: totalFrequency === 0,
      });
    } else {
      const hm = memberMap.get(normHead)!;
      hm.isHeadword = true;
    }

    const hasSumMismatch = calculatedSum !== totalFrequency;
    if (hasSumMismatch) {
      diagnostics.push({
        id: `bnc_mismatch_${lineNumber}`,
        source: 'BNC_COCA',
        severity: 'warning',
        category: 'sum_mismatch',
        rawText: `${band} | ${headword}`,
        lineNumber,
        parsedResult: [`官方总频次: ${totalFrequency}`, `成员求和: ${calculatedSum}`],
        explanation: `词族 ${headword} (${band}) 的成员频次之和 (${calculatedSum}) 与官方 Total frequency (${totalFrequency}) 不一致，已保留官方总频次并记录差异。`,
      });
    }

    const members = Array.from(memberMap.values()).sort((a, b) => {
      if (a.isHeadword !== b.isHeadword) return a.isHeadword ? -1 : 1;
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      return a.word.localeCompare(b.word);
    });

    families.push({
      id: `bnc_${band}_${normHead}_${families.length + 1}`,
      band,
      bandNumber,
      headword,
      normalizedHeadword: normHead,
      totalFrequency,
      calculatedSum,
      hasSumMismatch,
      members,
      cetMemberCount: 0,
      cet4MemberCount: 0,
      cet6MemberCount: 0,
    });
  }

  return { families, diagnostics, totalLines: validLineCount };
}

const PHRASE_CORE_WORD_MAP: Record<string, string> = {
  'owing to': 'owe',
  'baby boom': 'baby',
  'baby boomer': 'baby',
  'according to': 'accord',
  'ought to': 'ought',
  "coup d'état": 'coup',
};

/**
 * Builds the complete cross-referenced LexiconDatabaseBundle from CET2016, BNC/COCA 25k,
 * and (optionally) COCA 2020 JSON.
 */
export function buildLexiconDatabase(
  cetRaw: string,
  bncRaw: string,
  cocaRaw?: string | CocaRawJsonEntry[]
): LexiconDatabaseBundle {
  const { entries: cetEntries, diagnostics: cetDiagnostics } = parseCet2016(cetRaw);
  const {
    families: bncFamilies,
    diagnostics: bncDiagnostics,
    totalLines: bncTotalLines,
  } = parseBncCoca(bncRaw);

  const parsedCoca = cocaRaw ? parseCoca2020(cocaRaw) : null;

  const diagnostics: DataDiagnosticItem[] = [
    ...cetDiagnostics,
    ...bncDiagnostics,
    ...(parsedCoca ? parsedCoca.diagnostics : []),
  ];

  // Index BNC/COCA members by normalized lowercase form
  const bncFormIndex = new Map<
    string,
    { family: BncCocaFamily; member: BncCocaMember }[]
  >();
  let bncTotalWordForms = 0;
  let bncZeroFreqFormCount = 0;

  for (const family of bncFamilies) {
    for (const member of family.members) {
      bncTotalWordForms++;
      if (member.isZeroFrequency) bncZeroFreqFormCount++;
      const list = bncFormIndex.get(member.normalized) || [];
      list.push({ family, member });
      bncFormIndex.set(member.normalized, list);
    }
  }

  // Map normalized word -> LexiconWordItem
  const wordsMap = new Map<string, LexiconWordItem>();

  // 1. Populate all BNC/COCA word forms first
  for (const family of bncFamilies) {
    for (const member of family.members) {
      const existing = wordsMap.get(member.normalized);
      const membership: BncFamilyMembership = {
        familyId: family.id,
        headword: family.headword,
        band: family.band,
        bandNumber: family.bandNumber,
        frequency: member.frequency,
        familyFrequency: family.totalFrequency,
        isHeadword: member.isHeadword,
        isZeroFrequency: member.isZeroFrequency,
      };

      if (!existing) {
        wordsMap.set(member.normalized, {
          id: member.normalized,
          word: member.word,
          normalized: member.normalized,
          isPhrase: member.word.includes(' '),
          hasCapitalVariant: member.word !== member.normalized,
          displayVariants: [member.word],
          hasHyphen: member.word.includes('-'),
          hasSlash: member.word.includes('/'),
          hasApostrophe: member.word.includes("'"),
          inBnc: true,
          hasExactBncForm: true,
          bncLinkedViaVariant: false,
          familyId: family.id,
          headword: family.headword,
          band: family.band,
          bandNumber: family.bandNumber,
          formFrequency: member.frequency,
          familyFrequency: family.totalFrequency,
          isHeadword: member.isHeadword,
          familyMemberCount: family.members.length,
          familyCetMemberCount: 0,
          bncMemberships: [membership],
          matchType: 'exact',
          matchConfidence: 'high',
          matchNote: '精确匹配 BNC/COCA 词族成员词形',
          relatedPhraseCoreWord: null,
          inCet: false,
          isCet4: false,
          isCet6: false,
          isCet6Only: false,
          cetLevels: [],
          cetRefs: [],
          homographNumbers: [],
          inCoca: false,
          cocaLinkedViaVariant: false,
          cocaCanonicalVariant: null,
          cocaHeadwordTotalFreq: null,
          cocaHeadwordDerivedRank: null,
          cocaBestPosRank: null,
          cocaPrimaryPos: null,
          cocaPrimaryPosFreq: null,
          cocaPosCount: 0,
          cocaPosEntropy: 0,
          cocaDominantPosSharePct: 0,
          cocaLexemes: [],
        });
      } else {
        existing.bncMemberships = [...(existing.bncMemberships || []), membership];
        diagnostics.push({
          id: `bnc_multifam_${member.normalized}_${family.id}`,
          source: 'BNC_COCA',
          severity: 'info',
          category: 'multi_family_member',
          rawText: member.word,
          parsedResult: existing.bncMemberships.map(
            (m) => `${m.headword} (${m.band}, 词形频次 ${m.frequency.toLocaleString()})`
          ),
          explanation: `词形 "${member.word}" 在 BNC/COCA 中归属多个词族：主词族 "${existing.headword}" (${existing.band}, 频次 ${existing.formFrequency}) 与 "${family.headword}" (${family.band}, 频次 ${member.frequency})。`,
        });
      }
    }
  }

  // 2. Link CET2016 entries and their expanded forms
  let cetTotalExpandedForms = 0;
  const cetDistinctSet = new Set<string>();
  let cetUnmatchedInBncCount = 0;
  let cetVariantLinkedCount = 0;

  for (const entry of cetEntries) {
    const allLineExpandedForms = Array.from(
      new Set(entry.members.flatMap((m) => m.expandedForms))
    );

    for (const member of entry.members) {
      let fallbackBncMatch: {
        family: BncCocaFamily;
        member: BncCocaMember;
        viaForm: string;
        rule: ExpansionRuleType;
      } | null = null;

      for (const candidateForm of member.expandedForms) {
        const hit = bncFormIndex.get(candidateForm.toLowerCase());
        if (hit && hit.length > 0) {
          fallbackBncMatch = {
            family: hit[0].family,
            member: hit[0].member,
            viaForm: candidateForm,
            rule: member.expansionRule,
          };
          break;
        }
      }

      for (let fIdx = 0; fIdx < member.expandedForms.length; fIdx++) {
        const form = member.expandedForms[fIdx];
        const norm = form.toLowerCase();
        cetTotalExpandedForms++;
        cetDistinctSet.add(norm);

        const role: 'headword' | 'derivative' | 'variant' = member.isRepresentative
          ? fIdx === 0
            ? 'headword'
            : 'variant'
          : fIdx === 0
            ? 'derivative'
            : 'variant';

        const cetRef: CetWordReference = {
          entryId: entry.id,
          lineNumber: entry.lineNumber,
          rawLine: entry.rawLine,
          rawMember: member.rawText,
          level: member.isCet6Star ? 'CET6' : 'CET4',
          homographNumber: member.homographNumber,
          role,
          representativeHeadword: entry.headwordDisplay,
          peerForms: allLineExpandedForms.filter((p) => p.toLowerCase() !== norm),
          expansionRule: member.expansionRule,
          expansionNotes: member.expansionNotes,
        };

        let wordItem = wordsMap.get(norm);

        if (!wordItem) {
          const phraseCore = PHRASE_CORE_WORD_MAP[norm] || null;

          if (fallbackBncMatch) {
            cetVariantLinkedCount++;
            const { family, viaForm, rule } = fallbackBncMatch;
            const isAbbrev =
              rule === 'slash_parallel' &&
              (norm === 'apt.' ||
                norm === 'bbq' ||
                norm === 'tv' ||
                norm === 'ad' ||
                norm === 'demo' ||
                norm === 'dorm' ||
                norm === 'flu' ||
                norm === 'lab' ||
                norm === 'memo' ||
                norm === 'tech' ||
                norm === 'phone' ||
                norm === 'fridge' ||
                norm === 'bike');

            wordItem = {
              id: norm,
              word: form,
              normalized: norm,
              isPhrase: form.includes(' '),
              hasCapitalVariant: form !== norm,
              displayVariants: member.expandedForms,
              hasHyphen: form.includes('-'),
              hasSlash: form.includes('/'),
              hasApostrophe: form.includes("'"),
              inBnc: false,
              hasExactBncForm: false,
              bncLinkedViaVariant: true,
              familyId: family.id,
              headword: family.headword,
              band: family.band,
              bandNumber: family.bandNumber,
              formFrequency: null, // CRITICAL: Never borrow sibling variant's frequency!
              familyFrequency: family.totalFrequency,
              isHeadword: false,
              familyMemberCount: family.members.length,
              familyCetMemberCount: 0,
              bncMemberships: [],
              matchType: isAbbrev ? 'abbreviation_expansion' : 'uk_us_variant',
              matchConfidence: 'high',
              matchNote: `关联至 ${family.headword} 词族（通过官方同条变体 "${viaForm}"）；该词形在 BNC/COCA 中无独立频次记录`,
              relatedPhraseCoreWord: phraseCore,
              inCet: true,
              isCet4: false,
              isCet6: false,
              isCet6Only: false,
              cetLevels: [],
              cetRefs: [],
              homographNumbers: [],
              inCoca: false,
              cocaLinkedViaVariant: false,
              cocaCanonicalVariant: null,
              cocaHeadwordTotalFreq: null,
              cocaHeadwordDerivedRank: null,
              cocaBestPosRank: null,
              cocaPrimaryPos: null,
              cocaPrimaryPosFreq: null,
              cocaPosCount: 0,
              cocaPosEntropy: 0,
              cocaDominantPosSharePct: 0,
              cocaLexemes: [],
            };
          } else {
            cetUnmatchedInBncCount++;
            diagnostics.push({
              id: `cross_unmatched_${entry.lineNumber}_${norm}`,
              source: 'CROSS_MATCH',
              severity: 'info',
              category: 'unmatched_cet',
              rawText: member.rawText,
              lineNumber: entry.lineNumber,
              parsedResult: [form],
              explanation: phraseCore
                ? `多词短语 "${form}" 在 BNC/COCA 25k 词族表中未独立收录（不显示频次为 0），可参考核心词 "${phraseCore}"。`
                : `CET 词条 "${form}" (原表: ${member.rawText}) 未在 BNC/COCA 25k 词族表命中，标记为“BNC/COCA 未收录”。`,
            });

            wordItem = {
              id: norm,
              word: form,
              normalized: norm,
              isPhrase: form.includes(' '),
              hasCapitalVariant: form !== norm,
              displayVariants: member.expandedForms,
              hasHyphen: form.includes('-'),
              hasSlash: form.includes('/'),
              hasApostrophe: form.includes("'"),
              inBnc: false,
              hasExactBncForm: false,
              bncLinkedViaVariant: false,
              familyId: null,
              headword: null,
              band: null,
              bandNumber: null,
              formFrequency: null,
              familyFrequency: null,
              isHeadword: false,
              familyMemberCount: null,
              familyCetMemberCount: 0,
              bncMemberships: [],
              matchType: phraseCore ? 'phrase_reference' : 'unmatched',
              matchConfidence: phraseCore ? 'medium' : 'none',
              matchNote: phraseCore
                ? `多词短语在 BNC/COCA 中无独立频次记录；可跳转查看核心词 "${phraseCore}" 的词族数据`
                : 'BNC/COCA 25k 词族表未收录该词条，无可用语料库频次',
              relatedPhraseCoreWord: phraseCore,
              inCet: true,
              isCet4: false,
              isCet6: false,
              isCet6Only: false,
              cetLevels: [],
              cetRefs: [],
              homographNumbers: [],
              inCoca: false,
              cocaLinkedViaVariant: false,
              cocaCanonicalVariant: null,
              cocaHeadwordTotalFreq: null,
              cocaHeadwordDerivedRank: null,
              cocaBestPosRank: null,
              cocaPrimaryPos: null,
              cocaPrimaryPosFreq: null,
              cocaPosCount: 0,
              cocaPosEntropy: 0,
              cocaDominantPosSharePct: 0,
              cocaLexemes: [],
            };
          }
          wordsMap.set(norm, wordItem);
        } else {
          if (form !== norm && wordItem.word === norm) {
            wordItem.hasCapitalVariant = true;
            if (!wordItem.displayVariants.includes(form)) {
              wordItem.displayVariants.push(form);
            }
            if (wordItem.matchType === 'exact') {
              wordItem.matchType = 'case_insensitive';
              wordItem.matchNote = `大小写不敏感匹配 (${form} ↔ ${wordItem.word})`;
            }
          }
          for (const v of member.expandedForms) {
            if (!wordItem.displayVariants.includes(v)) {
              wordItem.displayVariants.push(v);
            }
          }
        }

        wordItem.inCet = true;
        wordItem.cetRefs.push(cetRef);
        if (cetRef.level === 'CET4') {
          wordItem.isCet4 = true;
          if (!wordItem.cetLevels.includes('CET4')) wordItem.cetLevels.push('CET4');
        } else {
          wordItem.isCet6 = true;
          if (!wordItem.cetLevels.includes('CET6')) wordItem.cetLevels.push('CET6');
        }
        wordItem.isCet6Only = wordItem.isCet6 && !wordItem.isCet4;
        if (
          cetRef.homographNumber !== null &&
          !wordItem.homographNumbers.includes(cetRef.homographNumber)
        ) {
          wordItem.homographNumbers.push(cetRef.homographNumber);
        }
      }
    }
  }

  // 3. Integrate COCA 2020 (when provided)
  let cocaLexemes: CocaLexemeRecord[] | undefined;
  let vennSummary: ThreeSourceVennSummary | undefined;

  if (parsedCoca) {
    for (const [norm, cocaHw] of parsedCoca.headwordsMap.entries()) {
      let wordItem = wordsMap.get(norm);
      if (wordItem) {
        // Attach COCA 2020 observations to existing Form/Headword entity
        wordItem.inCoca = true;
        wordItem.cocaHeadwordTotalFreq = cocaHw.totalFrequency;
        wordItem.cocaHeadwordDerivedRank = cocaHw.derivedRank;
        wordItem.cocaBestPosRank = cocaHw.bestPosRank;
        wordItem.cocaPrimaryPos = cocaHw.primaryPos;
        wordItem.cocaPrimaryPosFreq = cocaHw.primaryPosFreq;
        wordItem.cocaPosCount = cocaHw.posCount;
        wordItem.cocaPosEntropy = cocaHw.posEntropy;
        wordItem.cocaDominantPosSharePct = cocaHw.dominantSharePct;
        wordItem.cocaLexemes = cocaHw.lexemes;

        // Preserve original COCA capitalization in displayVariants (e.g. TRUE, FALSE)
        if (cocaHw.headword !== norm) {
          wordItem.hasCapitalVariant = true;
          if (!wordItem.displayVariants.includes(cocaHw.headword)) {
            wordItem.displayVariants.push(cocaHw.headword);
          }
        }
      } else {
        // COCA-only headword (18,623 items, e.g., "climate change", "R&D", "n't", "and/or", hyphenated lemmas)
        wordItem = {
          id: norm,
          word: cocaHw.headword, // Preserves original COCA orthography ("R&D", "B&B", "climate change")
          normalized: norm,
          isPhrase: cocaHw.headword.includes(' '),
          hasCapitalVariant: cocaHw.headword !== norm,
          displayVariants:
            cocaHw.headword !== norm ? [cocaHw.headword, norm] : [cocaHw.headword],
          hasHyphen: cocaHw.headword.includes('-'),
          hasSlash: cocaHw.headword.includes('/'),
          hasApostrophe: cocaHw.headword.includes("'"),
          inBnc: false,
          hasExactBncForm: false,
          bncLinkedViaVariant: false,
          familyId: null,
          headword: cocaHw.headword,
          band: null,
          bandNumber: null,
          formFrequency: null, // CRITICAL: Not in BNC 25k, so BNC formFrequency is null!
          familyFrequency: null,
          isHeadword: true,
          familyMemberCount: null,
          familyCetMemberCount: 0,
          bncMemberships: [],
          matchType: 'exact',
          matchConfidence: 'high',
          matchNote: 'COCA 2020 官方词头（未在 BNC 25k 词族表独立收录）',
          relatedPhraseCoreWord: null,
          inCet: false,
          isCet4: false,
          isCet6: false,
          isCet6Only: false,
          cetLevels: [],
          cetRefs: [],
          homographNumbers: [],
          inCoca: true,
          cocaLinkedViaVariant: false,
          cocaCanonicalVariant: null,
          cocaHeadwordTotalFreq: cocaHw.totalFrequency,
          cocaHeadwordDerivedRank: cocaHw.derivedRank,
          cocaBestPosRank: cocaHw.bestPosRank,
          cocaPrimaryPos: cocaHw.primaryPos,
          cocaPrimaryPosFreq: cocaHw.primaryPosFreq,
          cocaPosCount: cocaHw.posCount,
          cocaPosEntropy: cocaHw.posEntropy,
          cocaDominantPosSharePct: cocaHw.dominantSharePct,
          cocaLexemes: cocaHw.lexemes,
        };
        wordsMap.set(norm, wordItem);
      }
    }

    // Check CET words that are not directly in COCA, but have a CET sibling variant in the same member slot that IS in COCA (e.g. colour -> color)
    let cetVariantLinkedToCocaCount = 0;
    let cetTrulyMissingFromCocaCount = 0;

    for (const norm of cetDistinctSet) {
      const w = wordsMap.get(norm);
      if (!w) continue;
      if (w.inCoca) continue;

      let matchedSiblingInCoca: string | null = null;
      for (const v of w.displayVariants) {
        const vNorm = v.toLowerCase();
        if (vNorm !== norm && parsedCoca.headwordsMap.has(vNorm)) {
          matchedSiblingInCoca = parsedCoca.headwordsMap.get(vNorm)!.headword;
          break;
        }
      }

      if (matchedSiblingInCoca) {
        w.cocaLinkedViaVariant = true;
        w.cocaCanonicalVariant = matchedSiblingInCoca;
        cetVariantLinkedToCocaCount++;
      } else {
        cetTrulyMissingFromCocaCount++;
      }
    }

    // Build the 60,000 CocaLexemeRecord array with full cross-source context
    cocaLexemes = parsedCoca.rawLexemes.map((raw) => {
      const w = wordsMap.get(raw.normalizedHeadword);
      const posMeta = getCocaPosMeta(raw.pos);
      return {
        id: raw.id,
        headword: raw.headword,
        normalizedHeadword: raw.normalizedHeadword,
        pos: raw.pos,
        posZh: posMeta.shortZh,
        posAbbr: posMeta.abbr,
        rank: raw.rank,
        frequency: raw.frequency,
        headwordTotalFreq: raw.headwordTotalFreq,
        headwordDerivedRank: raw.headwordDerivedRank,
        headwordPosCount: raw.headwordPosCount,
        shareInHeadwordPct: raw.shareInHeadwordPct,
        isPrimaryPos: raw.isPrimaryPos,
        inBnc: Boolean(w?.inBnc),
        bncFamilyId: w?.familyId || null,
        bncHeadword: w?.headword || null,
        bncBand: w?.band || null,
        bncBandNumber: w?.bandNumber ?? null,
        bncFormFrequency: w?.formFrequency ?? null,
        bncFamilyFrequency: w?.familyFrequency ?? null,
        inCet: Boolean(w?.inCet),
        isCet4: Boolean(w?.isCet4),
        isCet6: Boolean(w?.isCet6),
        isCet6Only: Boolean(w?.isCet6Only),
        cetLevels: w?.cetLevels || [],
      };
    });

    // Compute exact 7-region Venn diagram across CET, BNC, and COCA normalized forms
    let allThreeCount = 0;
    let cetAndBncOnlyCount = 0;
    let cetAndCocaOnlyCount = 0;
    let bncAndCocaOnlyCount = 0;
    let cetOnlyExactCount = 0;
    let bncOnlyExactCount = 0;
    let cocaOnlyExactCount = 0;

    for (const w of wordsMap.values()) {
      const c = w.inCet;
      const b = w.inBnc;
      const k = Boolean(w.inCoca);
      if (c && b && k) allThreeCount++;
      else if (c && b && !k) cetAndBncOnlyCount++;
      else if (c && !b && k) cetAndCocaOnlyCount++;
      else if (!c && b && k) bncAndCocaOnlyCount++;
      else if (c && !b && !k) cetOnlyExactCount++;
      else if (!c && b && !k) bncOnlyExactCount++;
      else if (!c && !b && k) cocaOnlyExactCount++;
    }

    let bncHeadwordsInCocaCount = 0;
    for (const fam of bncFamilies) {
      if (parsedCoca.headwordsMap.has(fam.normalizedHeadword)) {
        bncHeadwordsInCocaCount++;
      }
    }

    vennSummary = {
      totalDistinctForms: wordsMap.size,
      cetDistinctForms: cetDistinctSet.size,
      bncDistinctForms: bncFormIndex.size,
      cocaDistinctHeadwords: parsedCoca.headwordCount,
      cocaTotalLexemes: parsedCoca.lexemeCount,
      allThreeCount,
      cetAndBncOnlyCount,
      cetAndCocaOnlyCount,
      bncAndCocaOnlyCount,
      cetOnlyExactCount,
      bncOnlyExactCount,
      cocaOnlyExactCount,
      bncAndCocaIntersection: allThreeCount + bncAndCocaOnlyCount,
      cetAndCocaIntersection: allThreeCount + cetAndCocaOnlyCount,
      cetAndBncIntersection: allThreeCount + cetAndBncOnlyCount,
      bncHeadwordsInCocaCount,
      cetVariantLinkedToCocaCount,
      cetTrulyMissingFromCocaCount,
    };
  }

  // 4. Calculate CET and COCA member counts per BNC/COCA family
  const familyById = new Map<string, BncCocaFamily>();
  for (const fam of bncFamilies) {
    familyById.set(fam.id, fam);
  }

  for (const fam of bncFamilies) {
    let cetCount = 0;
    let cet4Count = 0;
    let cet6Count = 0;
    let cocaCount = 0;
    for (const mem of fam.members) {
      const w = wordsMap.get(mem.normalized);
      if (w && w.inCet) {
        cetCount++;
        if (w.isCet4) cet4Count++;
        if (w.isCet6) cet6Count++;
      }
      if (w && w.inCoca) {
        cocaCount++;
      }
    }
    fam.cetMemberCount = cetCount;
    fam.cet4MemberCount = cet4Count;
    fam.cet6MemberCount = cet6Count;
    fam.cocaMatchedMemberCount = cocaCount;

    const headWordItem = wordsMap.get(fam.normalizedHeadword);
    fam.headwordCocaRank = headWordItem?.cocaHeadwordDerivedRank ?? null;
    fam.headwordCocaFreq = headWordItem?.cocaHeadwordTotalFreq ?? null;
    fam.headwordBestPosRank = headWordItem?.cocaBestPosRank ?? null;
  }

  // Propagate familyCetMemberCount to each LexiconWordItem
  let bothCetAndBncCount = 0;
  let cetOnlyCount = 0;
  let bncOnlyCount = 0;

  for (const w of wordsMap.values()) {
    if (w.familyId) {
      const fam = familyById.get(w.familyId);
      if (fam) {
        w.familyCetMemberCount = fam.cetMemberCount;
      }
    }
    if (w.inCet && (w.inBnc || w.bncLinkedViaVariant)) bothCetAndBncCount++;
    else if (w.inCet && !w.inBnc && !w.bncLinkedViaVariant) cetOnlyCount++;
    else if (!w.inCet && w.inBnc) bncOnlyCount++;
  }

  const words = Array.from(wordsMap.values()).sort((a, b) =>
    a.normalized.localeCompare(b.normalized)
  );

  const cet4EntryCount = cetEntries.filter((e) => !e.isCet6).length;
  const cet6EntryCount = cetEntries.filter((e) => e.isCet6).length;
  const cetHomographCount = diagnostics.filter((d) => d.category === 'homograph').length;
  const cetSlashCount = diagnostics.filter((d) => d.category === 'slash_expansion').length;
  const cetParenCount = diagnostics.filter((d) => d.category === 'paren_expansion').length;
  const cetPhraseCount = diagnostics.filter((d) => d.category === 'phrase_entry').length;
  const cetAmbiguousCount = diagnostics.filter((d) => d.category === 'ambiguous_spelling').length;
  const bncSumMismatchCount = bncFamilies.filter((f) => f.hasSumMismatch).length;
  const distinctBands = new Set(bncFamilies.map((f) => f.band)).size;

  const report: DataDiagnosticsReport = {
    generatedAt: new Date().toISOString(),
    cetTotalLines: cetEntries.length,
    cet4EntryCount,
    cet6EntryCount,
    cetTotalExpandedForms,
    cetDistinctWordForms: cetDistinctSet.size,
    cetHomographCount,
    cetSlashCount,
    cetParenCount,
    cetPhraseCount,
    cetAmbiguousCount,
    cetUnmatchedInBncCount,
    cetVariantLinkedCount,
    bncTotalLines,
    bncFamilyCount: bncFamilies.length,
    bncTotalWordForms,
    bncDistinctWordForms: bncFormIndex.size,
    bncZeroFreqFormCount,
    bncSumMismatchCount,
    bncBandsCount: distinctBands,
    // COCA 2020 audit fields
    cocaHeadwordCount: parsedCoca?.headwordCount,
    cocaLexemeRecordCount: parsedCoca?.lexemeCount,
    cocaTotalTokenFrequency: parsedCoca?.totalTokenFrequency,
    cocaRankMin: parsedCoca?.rankMin,
    cocaRankMax: parsedCoca?.rankMax,
    cocaHasCompleteRankRange: parsedCoca?.hasCompleteRankRange,
    cocaHyphenatedHeadwordCount: parsedCoca?.hyphenatedCount,
    cocaMultiPosHeadwordCount: parsedCoca?.multiPosCount,
    cocaMultiWordHeadwordCount: parsedCoca?.multiWordCount,
    cocaCapitalizedHeadwordCount: parsedCoca?.capitalizedCount,
    cocaPosDistribution: parsedCoca?.posDistribution,
    venn: vennSummary,
    totalDistinctLexiconWords: words.length,
    bothCetAndBncCount,
    cetOnlyCount,
    bncOnlyCount,
    items: diagnostics,
  };

  return {
    version: '2.0.0',
    words,
    families: bncFamilies,
    cetEntries,
    cocaLexemes,
    diagnostics: report,
  };
}

/**
 * Validates a custom dataset file's basic structure and parses it before saving to IndexedDB.
 */
export function validateCustomDatasetContent(
  type: 'cet2016' | 'bnc_coca' | 'coca2020',
  content: string
): { entriesCount: number } {
  const trimmed = (content || '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    throw new Error('上传的词表文件为空，请检查文件内容');
  }

  if (type === 'coca2020') {
    if (!trimmed.startsWith('[')) {
      throw new Error('COCA 2020 词表必须为 JSON 数组格式 (以 "[" 开头)');
    }
    const parsedCoca = parseCoca2020(trimmed);
    if (parsedCoca.headwordCount === 0 || parsedCoca.lexemeCount === 0) {
      throw new Error('未能从 JSON 文件中解析出有效的 COCA 2020 headword / PoS 记录');
    }
    return { entriesCount: parsedCoca.lexemeCount };
  }

  // Reject obvious HTML/JSON/binary uploads for text wordlists
  if (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  ) {
    throw new Error('上传的文件格式无效（检测到 HTML 或 JSON 内容，而非纯文本词表）');
  }

  if (type === 'bnc_coca') {
    const parsedBnc = parseBncCoca(content);
    if (parsedBnc.families.length === 0) {
      throw new Error(
        '未能从文件中解析出任何有效的 BNC/COCA 词族记录（需包含如 "1k\\table\\t..." 的 Tab 分隔行）'
      );
    }
    return { entriesCount: parsedBnc.families.length };
  }

  // type === 'cet2016'
  const firstLine = trimmed.split(/\r?\n/)[0] || '';
  if (/^list\s*\t\s*headword/i.test(firstLine) || /^\d+k\t/i.test(firstLine)) {
    throw new Error('检测到 BNC/COCA 词族表格式，请勿将其上传至 CET2016 大纲词表槽位');
  }

  const parsedCet = parseCet2016(content);
  if (parsedCet.entries.length === 0) {
    throw new Error('未能从文件中解析出任何有效的 CET 大纲词目行');
  }
  const validAlphaEntries = parsedCet.entries.filter((e) => /[a-zA-Z]/.test(e.headwordDisplay));
  if (validAlphaEntries.length === 0) {
    throw new Error('上传的 CET 词表未包含有效的英文词条');
  }

  return { entriesCount: parsedCet.entries.length };
}
