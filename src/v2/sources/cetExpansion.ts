/**
 * CET 2016 token expansion and entry parsing (moved out of the legacy v1 data layer).
 *
 * The syllabus notation is source data: superscript homograph numbers, ★ CET-6 markers, slash
 * alternatives and optional parenthetical letters are expanded deterministically. This module
 * emits only spellings and their expansion rule; it does not know about learning or metrics.
 */

export type ExpansionRuleType =
  | 'exact'
  | 'slash_parallel'
  | 'slash_suffix'
  | 'paren_optional'
  | 'combined_paren_slash'
  | 'homograph'
  | 'phrase'
  | 'unexpanded_ambiguous';

export interface CetMemberExpansion {
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

export interface CetEntryExpansion {
  id: string;
  lineNumber: number;
  rawLine: string;
  isCet6: boolean;
  level: 'CET4' | 'CET6';
  headwordRaw: string;
  headwordDisplay: string;
  members: CetMemberExpansion[];
}

export interface CetExpansionDiagnostic {
  id: string;
  source: string;
  severity: 'info' | 'ambiguous';
  category: string;
  rawText: string;
  lineNumber: number;
  parsedResult: string[];
  explanation: string;
}

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
      const suffix = rightRaw.slice(1); // e.g., 'er', 're', 'yse', 'ise', 'sation', 'tre', 'bre', 'xion', 'sy', 'ce', 'ice', 'iser', 'sational'
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
      // Parallel words separated by slash, e.g., "a/an", "airplane/aeroplane", "check²/cheque"
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
export function parseCet2016(rawContent: string): { entries: CetEntryExpansion[]; diagnostics: CetExpansionDiagnostic[] } {
  const cleanContent = rawContent.replace(/^\uFEFF/, '');
  const lines = cleanContent.split(/\r?\n/);
  const entries: CetEntryExpansion[] = [];
  const diagnostics: CetExpansionDiagnostic[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trimEnd();
    if (!rawLine.trim()) continue;
    const lineNumber = i + 1;

    const tabParts = rawLine.split('\t').map((p) => p.trim()).filter(Boolean);
    if (tabParts.length === 0) continue;

    const lineHasStar = tabParts.some((p) => p.includes('★'));
    const members: CetMemberExpansion[] = tabParts.map((part, idx) => {
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
      } else if (expanded.expansionRule === 'slash_suffix' || expanded.expansionRule === 'slash_parallel') {
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

