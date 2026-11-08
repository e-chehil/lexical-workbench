/**
 * Lexical Workbench 2.0 — cross-source alignment report.
 * All set operations are performed on ONE unit: the Form (case-folded spelling key).
 * The report states facts about spellings, not claims that units are the same lexeme.
 */
import { formKey, type EntityRef } from '../domain/ids.ts';
import type { LexicalIndex } from './lexicalIndex.ts';

export type VennRegion =
  | 'coca_bnc_cet'
  | 'coca_bnc'
  | 'coca_cet'
  | 'bnc_cet'
  | 'coca_only'
  | 'bnc_only'
  | 'cet_only';

export interface AlignmentReport {
  unit: 'form';
  formCount: number;
  sourceFormCounts: { coca2020: number; bnc25k: number; cet2016: number };
  venn: Record<VennRegion, number>;
  pairwise: { coca_bnc: number; coca_cet: number; bnc_cet: number };
  /** Forms reached only through case folding in at least one source (printed ≠ key). */
  caseFoldedMatches: { form: string; printed: string[] }[];
  coca: {
    headwordsMatchingBncFamilyHeadword: number;
    headwordsMatchingBncNonHeadMemberOnly: number;
    headwordsWithoutBncForm: number;
    unmatchedBySpellingClass: Record<string, number>;
    topUnmatchedByFreq: { headword: string; hwFreqSum: number; hwRank: number }[];
  };
  bnc: {
    familyHeadwordsInCoca: number;
    familyHeadwordsNotInCoca: number;
    memberFormsNotCocaHeadword: number;
    zeroFreqMemberFormsNotInCoca: number;
    multiFamilyForms: { form: string; families: string[]; freqs: number[] }[];
  };
  cet: { formsNotInCoca: number; formsNotInBnc: number; cetOnlyForms: string[] };
  candidates: {
    diacriticPairs: { a: string; b: string }[];
    hyphenPairs: number;
    hyphenPairSamples: { hyphenated: string; joined: string }[];
  };
  /** Rows: derived COCA headword rank buckets; columns: BNC band (1..25) of the same spelling, or 'none'. */
  crosstabHwRankByBncBand: { bucket: string; total: number; byBand: Record<string, number> }[];
  topN: {
    n: number;
    distinctHeadwordsInTopNRecords: number;
    headwordsWithHwRankLeN: number;
    topNRecordsWhoseFormInBnc: number;
    topNRecordsWhoseFormInCet: number;
  }[];
}

export const HW_RANK_BUCKETS: [number, number][] = [
  [1, 1000],
  [1001, 2000],
  [2001, 3000],
  [3001, 5000],
  [5001, 10000],
  [10001, 20000],
  [20001, 30000],
  [30001, 40000],
  [40001, 60000],
];

const CLASS_TESTS: [string, RegExp][] = [
  ['space', / /],
  ['slash', /\//],
  ['apostrophe', /'/],
  ['digit', /[0-9]/],
  ['ampersand', /&/],
  ['hyphen', /-/],
];

function spellingClass(s: string): string {
  for (const [c, re] of CLASS_TESTS) if (re.test(s)) return c;
  return 'plain_letters';
}

export function computeAlignmentReport(index: LexicalIndex): AlignmentReport {
  const venn: Record<VennRegion, number> = {
    coca_bnc_cet: 0,
    coca_bnc: 0,
    coca_cet: 0,
    bnc_cet: 0,
    coca_only: 0,
    bnc_only: 0,
    cet_only: 0,
  };
  const counts = { coca2020: 0, bnc25k: 0, cet2016: 0 };
  const caseFoldedMatches: AlignmentReport['caseFoldedMatches'] = [];
  const cetOnlyForms: string[] = [];
  let cetNotCoca = 0;
  let cetNotBnc = 0;

  for (const n of index.forms.values()) {
    const s = index.sourcesOfForm(n.ref);
    const c = s.has('coca2020');
    const b = s.has('bnc25k');
    const t = s.has('cet2016');
    if (c) counts.coca2020++;
    if (b) counts.bnc25k++;
    if (t) counts.cet2016++;
    if (t && !c) cetNotCoca++;
    if (t && !b) cetNotBnc++;
    const region: VennRegion | null =
      c && b && t ? 'coca_bnc_cet' : c && b ? 'coca_bnc' : c && t ? 'coca_cet' : b && t ? 'bnc_cet' : c ? 'coca_only' : b ? 'bnc_only' : t ? 'cet_only' : null;
    if (region) venn[region]++;
    if (region === 'cet_only') cetOnlyForms.push(n.surfaces[0].surface);
    if (s.size >= 2) {
      const printed = [...new Set(n.surfaces.filter((x) => s.has(x.source)).map((x) => x.surface))];
      if (printed.some((p) => p !== n.key)) caseFoldedMatches.push({ form: n.key, printed });
    }
  }

  // COCA side
  let hwFam = 0;
  let hwMemberOnly = 0;
  let hwNoBnc = 0;
  const unmatchedBySpellingClass: Record<string, number> = {};
  const unmatched: { headword: string; hwFreqSum: number; hwRank: number }[] = [];
  for (const h of index.cocaHeadwords.values()) {
    const n = index.forms.get(h.formRef)!;
    if (n.bncFamilyHeadedRef) hwFam++;
    else if (n.bncMemberRefs.length) hwMemberOnly++;
    if (!n.bncMemberRefs.length) {
      hwNoBnc++;
      const cls = spellingClass(h.headword);
      unmatchedBySpellingClass[cls] = (unmatchedBySpellingClass[cls] ?? 0) + 1;
      unmatched.push({
        headword: h.headword,
        hwFreqSum: index.getObservation('coca2020.hw_freq_sum', h.ref)!,
        hwRank: index.getObservation('coca2020.hw_rank', h.ref)!,
      });
    }
  }
  unmatched.sort((a, b) => a.hwRank - b.hwRank);

  // BNC side
  let famInCoca = 0;
  for (const f of index.bncFamilies.values()) if (index.forms.get(f.formRef)?.cocaHeadwordRef) famInCoca++;
  let memberFormsNotCoca = 0;
  let zeroNotCoca = 0;
  const multiFamilyForms: AlignmentReport['bnc']['multiFamilyForms'] = [];
  for (const n of index.forms.values()) {
    if (!n.bncMemberRefs.length) continue;
    if (!n.cocaHeadwordRef) {
      memberFormsNotCoca++;
      if (n.bncMemberRefs.every((m) => index.bncMembers.get(m)!.frequency === 0)) zeroNotCoca++;
    }
    if (n.bncMemberRefs.length > 1) {
      const ms = n.bncMemberRefs.map((m) => index.bncMembers.get(m)!);
      multiFamilyForms.push({
        form: n.key,
        families: ms.map((m) => index.bncFamilies.get(m.familyRef)!.headword),
        freqs: ms.map((m) => m.frequency),
      });
    }
  }

  // Candidates (diacritics / hyphenation) — between forms of DIFFERENT keys
  const diacriticPairs: { a: string; b: string }[] = [];
  const seenPair = new Set<string>();
  let hyphenPairs = 0;
  const hyphenPairSamples: { hyphenated: string; joined: string }[] = [];
  for (const n of index.forms.values()) {
    for (const rel of index.candidateRelationsOf(n.ref)) {
      const other = index.forms.get(rel.to)!.key;
      if (rel.type === 'candidate_diacritic_variant') {
        const k = [n.key, other].sort().join('\u0000');
        if (!seenPair.has(k)) {
          seenPair.add(k);
          diacriticPairs.push({ a: n.key, b: other });
        }
      } else {
        hyphenPairs++;
        if (hyphenPairSamples.length < 20) hyphenPairSamples.push({ hyphenated: n.key, joined: other });
      }
    }
  }

  // Crosstab: COCA derived headword rank bucket × BNC band of the same spelling
  const crosstab = HW_RANK_BUCKETS.map(([lo, hi]) => ({ bucket: `${lo}-${hi}`, total: 0, byBand: {} as Record<string, number> }));
  for (const h of index.cocaHeadwords.values()) {
    const r = index.getObservation('coca2020.hw_rank', h.ref)!;
    const bi = HW_RANK_BUCKETS.findIndex(([lo, hi]) => r >= lo && r <= hi);
    if (bi < 0) continue;
    const band = index.metricValue(h.formRef, 'bnc25k.family_band');
    const col = band === null ? 'none' : String(band);
    crosstab[bi].total++;
    crosstab[bi].byBand[col] = (crosstab[bi].byBand[col] ?? 0) + 1;
  }

  // Top-N: records vs distinct headwords
  const records = [...index.cocaRecords.values()].sort((a, b) => a.rank - b.rank);
  const topN = [1000, 2000, 3000, 5000, 10000, 20000, 60000].map((n) => {
    const slice = records.slice(0, n);
    const hws = new Set(slice.map((r) => r.headwordRef));
    let inBnc = 0;
    let inCet = 0;
    for (const r of slice) {
      const s = index.sourcesOfForm(r.formRef);
      if (s.has('bnc25k')) inBnc++;
      if (s.has('cet2016')) inCet++;
    }
    let hwLe = 0;
    for (const v of index.obs['coca2020.hw_rank'].values()) if (v <= n) hwLe++;
    return { n, distinctHeadwordsInTopNRecords: hws.size, headwordsWithHwRankLeN: hwLe, topNRecordsWhoseFormInBnc: inBnc, topNRecordsWhoseFormInCet: inCet };
  });

  return {
    unit: 'form',
    formCount: index.forms.size,
    sourceFormCounts: counts,
    venn,
    pairwise: {
      coca_bnc: venn.coca_bnc_cet + venn.coca_bnc,
      coca_cet: venn.coca_bnc_cet + venn.coca_cet,
      bnc_cet: venn.coca_bnc_cet + venn.bnc_cet,
    },
    caseFoldedMatches,
    coca: {
      headwordsMatchingBncFamilyHeadword: hwFam,
      headwordsMatchingBncNonHeadMemberOnly: hwMemberOnly,
      headwordsWithoutBncForm: hwNoBnc,
      unmatchedBySpellingClass,
      topUnmatchedByFreq: unmatched.slice(0, 30),
    },
    bnc: {
      familyHeadwordsInCoca: famInCoca,
      familyHeadwordsNotInCoca: index.bncFamilies.size - famInCoca,
      memberFormsNotCocaHeadword: memberFormsNotCoca,
      zeroFreqMemberFormsNotInCoca: zeroNotCoca,
      multiFamilyForms,
    },
    cet: { formsNotInCoca: cetNotCoca, formsNotInBnc: cetNotBnc, cetOnlyForms: cetOnlyForms.sort() },
    candidates: { diacriticPairs, hyphenPairs, hyphenPairSamples },
    crosstabHwRankByBncBand: crosstab,
    topN,
  };
}

/** Exact-spelling (case-sensitive, no folding) intersection, for the audit's strictness check. */
export function exactCaseSensitiveIntersection(a: Iterable<string>, b: Iterable<string>): number {
  const B = new Set(b);
  let n = 0;
  for (const x of new Set(a)) if (B.has(x)) n++;
  return n;
}

export function formKeys(spellings: Iterable<string>): Set<string> {
  const s = new Set<string>();
  for (const x of spellings) s.add(formKey(x));
  return s;
}

export type { EntityRef };
