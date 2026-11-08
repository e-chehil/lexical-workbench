/**
 * COCA 2020 lemma+PoS (top 60k) source adapter.
 * Input: the raw text of coca_freq.json. Output: CocaSnapshot (source facts only — no
 * derived metrics; those are computed in engine/buildIndex.ts).
 */
import { formKey, refs } from '../domain/ids.ts';
import {
  COCA_POS_VALUES,
  SourceFormatError,
  type CocaHeadword,
  type CocaLemmaPosRecord,
  type CocaPos,
  type CocaSnapshot,
  type CocaSourceStats,
  type SourceDiagnostic,
  type SpecialSpellingClass,
} from '../domain/types.ts';

const INTEGER_STRING = /^[0-9]+$/;

const SPECIAL_TESTS: [SpecialSpellingClass, RegExp][] = [
  ['hyphen', /-/],
  ['apostrophe', /'/],
  ['slash', /\//],
  ['space', / /],
  ['uppercase', /[A-Z]/],
  ['digit', /[0-9]/],
  ['ampersand', /&/],
  ['non_ascii', /[^\x00-\x7f]/],
];

function isCocaPos(v: string): v is CocaPos {
  return (COCA_POS_VALUES as readonly string[]).includes(v);
}

/** Accepts integer strings ("115") or non-negative safe integers. Returns null otherwise. */
function toCount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? v : null;
  if (typeof v === 'string' && INTEGER_STRING.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

export function parseCocaJson(rawText: string): CocaSnapshot {
  const text = rawText.replace(/^\uFEFF/, '');
  if (!text.trim()) throw new SourceFormatError('coca2020', 'empty payload');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new SourceFormatError('coca2020', `invalid JSON: ${(e as Error).message}`);
  }
  return parseCocaData(data);
}

export function parseCocaData(data: unknown): CocaSnapshot {
  if (!Array.isArray(data)) {
    throw new SourceFormatError('coca2020', 'root must be an array of {headword, content[]}');
  }
  const diagnostics: SourceDiagnostic[] = [];
  const diag = (severity: SourceDiagnostic['severity'], code: string, message: string, subject?: string) =>
    diagnostics.push({ source: 'coca2020', severity, code, message, subject });

  const records: CocaLemmaPosRecord[] = [];
  const headwords: CocaHeadword[] = [];
  const seenHeadword = new Set<string>();
  const seenFormKey = new Map<string, string>();
  const rankOwner = new Map<number, string>();

  for (let i = 0; i < data.length; i++) {
    const entry = data[i] as { headword?: unknown; content?: unknown };
    if (!entry || typeof entry !== 'object' || typeof entry.headword !== 'string' || !Array.isArray(entry.content)) {
      diag('error', 'coca.invalid_entry', `entry #${i} lacks string headword or content[]`);
      continue;
    }
    const headword = entry.headword;
    if (headword !== headword.trim() || headword === '') {
      diag('error', 'coca.invalid_headword', `headword has surrounding whitespace or is empty`, JSON.stringify(headword));
      continue;
    }
    if (seenHeadword.has(headword)) {
      diag('error', 'coca.duplicate_headword', `headword appears in more than one entry; later entry skipped`, headword);
      continue;
    }
    const fk = formKey(headword);
    const prior = seenFormKey.get(fk);
    if (prior !== undefined) {
      // Would make the COCA headword ↔ Form mapping non-unique; keep both but report.
      diag('warning', 'coca.case_collision', `headwords "${prior}" and "${headword}" share form key "${fk}"`, headword);
    } else {
      seenFormKey.set(fk, headword);
    }
    seenHeadword.add(headword);

    const hwRef = refs.cocaHeadword(headword);
    const formRef = refs.form(headword);
    const children: CocaLemmaPosRecord[] = [];
    const seenPos = new Set<string>();

    for (const item of entry.content as unknown[]) {
      const c = item as { PoS?: unknown; Rank?: unknown; Freq?: unknown };
      if (!c || typeof c !== 'object' || typeof c.PoS !== 'string') {
        diag('error', 'coca.invalid_record', 'record lacks string PoS', headword);
        continue;
      }
      if (!isCocaPos(c.PoS)) {
        diag('error', 'coca.unknown_pos', `unknown PoS "${c.PoS}" (add to COCA_POS_VALUES deliberately)`, headword);
        continue;
      }
      const rank = toCount(c.Rank);
      const freq = toCount(c.Freq);
      if (rank === null || rank < 1 || freq === null) {
        diag('error', 'coca.invalid_number', `invalid Rank/Freq ${JSON.stringify(c.Rank)}/${JSON.stringify(c.Freq)}`, `${headword}|${c.PoS}`);
        continue;
      }
      if (seenPos.has(c.PoS)) {
        diag('error', 'coca.duplicate_pos', `PoS "${c.PoS}" repeated within headword; later record skipped`, headword);
        continue;
      }
      const owner = rankOwner.get(rank);
      if (owner !== undefined) {
        diag('error', 'coca.duplicate_rank', `rank ${rank} already used by ${owner}`, `${headword}|${c.PoS}`);
        continue;
      }
      seenPos.add(c.PoS);
      rankOwner.set(rank, `${headword}|${c.PoS}`);
      children.push({
        ref: refs.cocaLemmaPos(headword, c.PoS),
        headwordRef: hwRef,
        formRef,
        headword,
        pos: c.PoS,
        rank,
        freq,
      });
    }
    if (children.length === 0) {
      diag('error', 'coca.empty_headword', 'headword has no valid records; skipped', headword);
      continue;
    }
    children.sort((a, b) => a.rank - b.rank);
    records.push(...children);
    headwords.push({ ref: hwRef, formRef, headword, lemmaPosRefs: children.map((r) => r.ref) });
  }

  records.sort((a, b) => a.rank - b.rank);

  // Rank continuity and frequency monotonicity (official ranks should follow descending Freq).
  for (let i = 0; i < records.length; i++) {
    const expected = i + 1;
    if (records[i].rank !== expected) {
      diag('warning', 'coca.rank_gap', `rank sequence breaks at position ${expected}: found ${records[i].rank}`);
      break;
    }
  }
  let inversions = 0;
  for (let i = 1; i < records.length; i++) {
    if (records[i].freq > records[i - 1].freq) inversions++;
  }
  if (inversions > 0) {
    diag('warning', 'coca.freq_rank_inversion', `${inversions} adjacent pairs where a lower rank has higher Freq`);
  }

  const stats = computeStats(headwords, records);
  for (const hw of stats.specialSpellings.uppercase) {
    diag('info', 'coca.uppercase_headword', 'headword printed with uppercase letters; matched to other sources via case-folded form key', hw);
  }
  return { source: 'coca2020', records, headwords, diagnostics, stats };
}

function computeStats(headwords: CocaHeadword[], records: CocaLemmaPosRecord[]): CocaSourceStats {
  const posRecordCounts: Record<string, number> = {};
  const posFreqSums: Record<string, number> = {};
  let freqSum = 0;
  for (const r of records) {
    posRecordCounts[r.pos] = (posRecordCounts[r.pos] ?? 0) + 1;
    posFreqSums[r.pos] = (posFreqSums[r.pos] ?? 0) + r.freq;
    freqSum += r.freq;
  }
  const posCountDistribution: Record<number, number> = {};
  for (const h of headwords) {
    const n = h.lemmaPosRefs.length;
    posCountDistribution[n] = (posCountDistribution[n] ?? 0) + 1;
  }
  const specialSpellings = Object.fromEntries(SPECIAL_TESTS.map(([k]) => [k, [] as string[]])) as Record<
    SpecialSpellingClass,
    string[]
  >;
  for (const h of headwords) {
    for (const [cls, re] of SPECIAL_TESTS) if (re.test(h.headword)) specialSpellings[cls].push(h.headword);
  }
  return {
    headwordCount: headwords.length,
    recordCount: records.length,
    rankMin: records.length ? records[0].rank : 0,
    rankMax: records.length ? records[records.length - 1].rank : 0,
    freqSum,
    multiPosHeadwordCount: headwords.filter((h) => h.lemmaPosRefs.length > 1).length,
    posRecordCounts,
    posFreqSums,
    posCountDistribution,
    specialSpellings,
  };
}
