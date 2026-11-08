/**
 * Reproducible data audit for Lexical Workbench 2.0.
 * Run: npm run audit:v2   → writes docs/v2/data-audit.generated.json and prints a summary.
 * Every number in docs/v2/DATA_AUDIT.md must come from this output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseCocaJson } from '../src/v2/sources/cocaAdapter.ts';
import { parseBncFamilies } from '../src/v2/sources/bncAdapter.ts';
import { parseCetSyllabus } from '../src/v2/sources/cetAdapter.ts';
import { buildLexicalIndex } from '../src/v2/engine/lexicalIndex.ts';
import { computeAlignmentReport, exactCaseSensitiveIntersection } from '../src/v2/engine/alignment.ts';
import { cocaRecordsForSpelling } from '../src/v2/engine/query.ts';
import { DATA_FILES, readDataFile } from '../src/v2/node/loadSources.ts';
import { refs } from '../src/v2/domain/ids.ts';
import type { SourceDiagnostic } from '../src/v2/domain/types.ts';

const coca = parseCocaJson(readDataFile(DATA_FILES.coca2020));
const bnc = parseBncFamilies(readDataFile(DATA_FILES.bnc25k));
const cet = parseCetSyllabus(readDataFile(DATA_FILES.cet2016));
const index = buildLexicalIndex({ coca, bnc, cet });
const alignment = computeAlignmentReport(index);

const countCodes = (ds: SourceDiagnostic[]) =>
  ds.reduce<Record<string, number>>((m, d) => ((m[`${d.severity}:${d.code}`] = (m[`${d.severity}:${d.code}`] ?? 0) + 1), m), {});

// PoS combinations among multi-PoS headwords
const combos: Record<string, number> = {};
for (const h of coca.headwords) {
  if (h.lemmaPosRefs.length < 2) continue;
  const key = h.lemmaPosRefs.map((r) => index.cocaRecords.get(r)!.pos).sort().join('+');
  combos[key] = (combos[key] ?? 0) + 1;
}
const topCombos = Object.entries(combos).sort((a, b) => b[1] - a[1]).slice(0, 15);

// Equal-frequency adjacency (rank ties broken by source)
let equalFreqAdjacent = 0;
for (let i = 1; i < coca.records.length; i++) if (coca.records[i].freq === coca.records[i - 1].freq) equalFreqAdjacent++;

// Frequency distribution of records by official rank band
const rankBands = [1000, 2000, 5000, 10000, 20000, 30000, 40000, 50000, 60000];
let prev = 0;
const freqByRankBand = rankBands.map((hi) => {
  const slice = coca.records.filter((r) => r.rank > prev && r.rank <= hi);
  const out = { ranks: `${prev + 1}-${hi}`, records: slice.length, freqSum: slice.reduce((s, r) => s + r.freq, 0), minFreq: slice.at(-1)?.freq ?? null, maxFreq: slice[0]?.freq ?? null };
  prev = hi;
  return out;
});

const testWords = ['work', 'like', 'running', 'ability', 'abilities', 'go', 'went', 'TRUE', 'FALSE', 'R&D', "n't", 'climate change', 'grannies', 'may', 'color', 'colour'];
const probes = testWords.map((w) => {
  const form = index.getForm(w);
  const hw = form?.cocaHeadwordRef ?? null;
  return {
    query: w,
    formRef: refs.form(w),
    sources: form ? [...index.sourcesOfForm(form.ref)] : [],
    printed: form?.surfaces ?? [],
    coca: cocaRecordsForSpelling(index, w).map((r) => ({ pos: r.pos, rank: r.rank, freq: r.freq })),
    cocaHwFreqSum: hw ? index.getObservation('coca2020.hw_freq_sum', hw) : null,
    cocaHwRank: hw ? index.getObservation('coca2020.hw_rank', hw) : null,
    bncMemberships: (form?.bncMemberRefs ?? []).map((m) => {
      const mm = index.bncMembers.get(m)!;
      const fam = index.bncFamilies.get(mm.familyRef)!;
      return { family: fam.headword, band: fam.band, memberFreq: mm.frequency, familyTotal: fam.totalFrequency };
    }),
    cet: (form?.cetLinks ?? []).map((l) => ({ entry: index.cetEntries.get(l.entryRef)!.display, role: l.role, level: l.level })),
  };
});

const strict = {
  cocaHeadwords_vs_bncForms_caseSensitive: exactCaseSensitiveIntersection(coca.headwords.map((h) => h.headword), bnc.members.map((m) => m.form)),
  cocaHeadwords_vs_cetForms_caseSensitive: exactCaseSensitiveIntersection(
    coca.headwords.map((h) => h.headword),
    cet.entries.flatMap((e) => e.links.map((l) => l.surface))
  ),
  bncForms_vs_cetForms_caseSensitive: exactCaseSensitiveIntersection(
    bnc.members.map((m) => m.form),
    cet.entries.flatMap((e) => e.links.map((l) => l.surface))
  ),
};

const report = {
  generatedBy: 'scripts/audit-v2.ts',
  files: DATA_FILES,
  coca: {
    stats: coca.stats,
    specialSpellingCounts: Object.fromEntries(Object.entries(coca.stats.specialSpellings).map(([k, v]) => [k, v.length])),
    specialSpellingSamples: Object.fromEntries(Object.entries(coca.stats.specialSpellings).map(([k, v]) => [k, v.slice(0, 25)])),
    diagnostics: countCodes(coca.diagnostics),
    equalFreqAdjacentPairs: equalFreqAdjacent,
    topMultiPosCombos: topCombos,
    freqByRankBand,
  },
  bnc: {
    families: bnc.families.length,
    memberSlots: bnc.members.length,
    distinctMemberForms: new Set(bnc.members.map((m) => m.formRef)).size,
    zeroFrequencySlots: bnc.members.filter((m) => m.frequency === 0).length,
    familiesHeadwordNotMember: bnc.families.filter((f) => !f.headwordIsMember).length,
    familiesSumMismatch: bnc.families.filter((f) => f.memberFrequencySum !== f.totalFrequency).length,
    memberFreqSum: bnc.members.reduce((s, m) => s + m.frequency, 0),
    familyTotalSum: bnc.families.reduce((s, f) => s + f.totalFrequency, 0),
    diagnostics: countCodes(bnc.diagnostics),
  },
  cet: {
    entries: cet.entries.length,
    cet4Entries: cet.entries.filter((e) => e.level === 'CET4').length,
    cet6Entries: cet.entries.filter((e) => e.level === 'CET6').length,
    links: cet.entries.reduce((s, e) => s + e.links.length, 0),
    distinctForms: new Set(cet.entries.flatMap((e) => e.links.map((l) => l.formRef))).size,
    diagnostics: countCodes(cet.diagnostics),
  },
  strictCaseSensitive: strict,
  alignment,
  probes,
};

const out = path.resolve('docs/v2/data-audit.generated.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify({ coca: { ...report.coca, specialSpellingSamples: undefined, stats: { ...coca.stats, specialSpellings: undefined } }, bnc: report.bnc, cet: report.cet, strict, venn: alignment.venn, sourceFormCounts: alignment.sourceFormCounts, formCount: alignment.formCount, pairwise: alignment.pairwise, cocaSide: { ...alignment.coca, topUnmatchedByFreq: alignment.coca.topUnmatchedByFreq.slice(0, 15) }, bncSide: alignment.bnc, cetSide: alignment.cet, caseFolded: alignment.caseFoldedMatches, candidates: alignment.candidates, topN: alignment.topN }, null, 1));
console.log(`\nwritten ${out}`);
