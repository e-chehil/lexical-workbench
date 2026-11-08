import { getCocaPosMeta } from './types.ts';
import type {
  BncCocaFamily,
  CetOfficialEntry,
  CocaLexemeRecord,
  CocaPosBreakdownItem,
  CocaRawJsonEntry,
  CorpusObservation,
  DataDiagnosticItem,
  LexicalRelation,
  LexiconWordItem,
} from './types.ts';

export interface ParsedCocaHeadwordSummary {
  headword: string; // Original spelling in COCA, e.g. "TRUE", "R&D", "climate change", "work"
  normalized: string; // Lowercase key, e.g. "true", "r&d", "climate change", "work"
  totalFrequency: number;
  derivedRank: number; // Competition rank among 53,951 headwords (ties share same rank)
  ordinalRank: number; // 1..53951 tie-broken by bestPosRank
  bestPosRank: number;
  primaryPos: string;
  primaryPosFreq: number;
  posCount: number;
  posEntropy: number; // Shannon entropy in bits across PoS shares
  dominantSharePct: number; // 0..100
  lexemes: CocaPosBreakdownItem[];
}

export interface ParsedCocaBundle {
  headwordsMap: Map<string, ParsedCocaHeadwordSummary>;
  rawLexemes: {
    id: string;
    headword: string;
    normalizedHeadword: string;
    pos: string;
    rank: number;
    frequency: number;
    headwordTotalFreq: number;
    headwordDerivedRank: number;
    headwordPosCount: number;
    shareInHeadwordPct: number;
    isPrimaryPos: boolean;
  }[];
  headwordCount: number;
  lexemeCount: number;
  totalTokenFrequency: number;
  rankMin: number;
  rankMax: number;
  hasCompleteRankRange: boolean;
  hyphenatedCount: number;
  multiPosCount: number;
  multiWordCount: number;
  capitalizedCount: number;
  posDistribution: Record<string, { count: number; totalFreq: number }>;
  diagnostics: DataDiagnosticItem[];
}

/**
 * Computes Shannon entropy H = -sum(p_i * log2(p_i)) for a frequency distribution.
 * Returns 0 for single-item or zero-sum distributions.
 */
export function computeShannonEntropy(frequencies: number[]): number {
  if (frequencies.length <= 1) return 0;
  const total = frequencies.reduce((acc, v) => acc + v, 0);
  if (total <= 0) return 0;
  let entropy = 0;
  for (const f of frequencies) {
    if (f > 0) {
      const p = f / total;
      entropy -= p * Math.log2(p);
    }
  }
  return Number(entropy.toFixed(4));
}

/**
 * Parses COCA 2020 JSON content (string or array of CocaRawJsonEntry) into validated
 * headword summaries, 60,000 PoS lexeme records, derived headword competition rankings,
 * and audit diagnostics.
 */
export function parseCoca2020(rawInput: string | CocaRawJsonEntry[]): ParsedCocaBundle {
  const entries: CocaRawJsonEntry[] =
    typeof rawInput === 'string' ? JSON.parse(rawInput.replace(/^\uFEFF/, '')) : rawInput;

  if (!Array.isArray(entries)) {
    throw new Error('COCA 2020 数据格式无效：根节点必须为 JSON 数组');
  }

  const headwordsTemp: {
    headword: string;
    normalized: string;
    totalFrequency: number;
    bestPosRank: number;
    primaryPos: string;
    primaryPosFreq: number;
    posCount: number;
    posEntropy: number;
    dominantSharePct: number;
    items: {
      pos: string;
      rank: number;
      frequency: number;
    }[];
  }[] = [];

  const seenRanks = new Set<number>();
  let rankMin = Number.MAX_SAFE_INTEGER;
  let rankMax = 0;
  let totalTokenFrequency = 0;
  let lexemeCount = 0;
  let hyphenatedCount = 0;
  let multiPosCount = 0;
  let multiWordCount = 0;
  let capitalizedCount = 0;
  const posDistribution: Record<string, { count: number; totalFreq: number }> = {};
  const diagnostics: DataDiagnosticItem[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry.headword !== 'string' || !Array.isArray(entry.content)) {
      continue;
    }

    const headword = entry.headword.trim();
    if (!headword) continue;
    const normalized = headword.toLowerCase();

    if (headword.includes('-')) hyphenatedCount++;
    if (headword.includes(' ')) multiWordCount++;
    if (headword !== normalized) {
      capitalizedCount++;
      diagnostics.push({
        id: `coca_cap_${normalized}`,
        source: 'COCA2020',
        severity: 'info',
        category: 'case_sensitivity',
        rawText: headword,
        parsedResult: [headword, normalized],
        explanation: `COCA 2020 原始词头保留大写表记 "${headword}"（规范化检索键为 "${normalized}"）。`,
      });
    }
    if (/[^a-zA-Z-]/.test(headword) && !headword.includes(' ')) {
      if (diagnostics.filter((d) => d.category === 'coca_special_orthography').length < 35) {
        diagnostics.push({
          id: `coca_orth_${normalized}`,
          source: 'COCA2020',
          severity: 'info',
          category: 'coca_special_orthography',
          rawText: headword,
          parsedResult: [headword],
          explanation: `COCA 2020 特殊符号词头 "${headword}"（保留撇号、斜杠、连字符或 & 符号）。`,
        });
      }
    }

    const items: { pos: string; rank: number; frequency: number }[] = [];
    let hwTotalFreq = 0;

    for (const c of entry.content) {
      const pos = String(c.PoS || '').trim();
      const rank = parseInt(String(c.Rank), 10);
      const frequency = parseInt(String(c.Freq), 10);
      if (!pos || Number.isNaN(rank) || Number.isNaN(frequency)) continue;

      items.push({ pos, rank, frequency });
      hwTotalFreq += frequency;
      totalTokenFrequency += frequency;
      lexemeCount++;

      seenRanks.add(rank);
      if (rank < rankMin) rankMin = rank;
      if (rank > rankMax) rankMax = rank;

      if (!posDistribution[pos]) {
        posDistribution[pos] = { count: 0, totalFreq: 0 };
      }
      posDistribution[pos].count += 1;
      posDistribution[pos].totalFreq += frequency;
    }

    if (items.length === 0) continue;

    // Sort PoS items inside headword by frequency desc, then official rank asc
    items.sort((a, b) => {
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      return a.rank - b.rank;
    });

    if (items.length > 1) {
      multiPosCount++;
      if (items.length >= 4) {
        diagnostics.push({
          id: `coca_multipos_${normalized}`,
          source: 'COCA2020',
          severity: 'info',
          category: 'coca_multi_pos',
          rawText: headword,
          parsedResult: items.map((it) => `${it.pos} (#${it.rank}, ${it.frequency.toLocaleString()})`),
          explanation: `多词性高频词头 "${headword}" 拥有 ${items.length} 条独立 COCA 词性记录，合计频次 ${hwTotalFreq.toLocaleString()}。`,
        });
      }
    }

    const bestPosRank = Math.min(...items.map((it) => it.rank));
    const primaryPos = items[0].pos;
    const primaryPosFreq = items[0].frequency;
    const posEntropy = computeShannonEntropy(items.map((it) => it.frequency));
    const dominantSharePct =
      hwTotalFreq > 0 ? Number(((primaryPosFreq / hwTotalFreq) * 100).toFixed(1)) : 100;

    headwordsTemp.push({
      headword,
      normalized,
      totalFrequency: hwTotalFreq,
      bestPosRank,
      primaryPos,
      primaryPosFreq,
      posCount: items.length,
      posEntropy,
      dominantSharePct,
      items,
    });
  }

  // Compute Derived Headword Rank across all 53,951 distinct COCA headwords
  // Primary sort: totalFrequency DESC
  // Secondary tie-breaker for ordinal stability: bestPosRank ASC, then normalized ASC
  headwordsTemp.sort((a, b) => {
    if (b.totalFrequency !== a.totalFrequency) return b.totalFrequency - a.totalFrequency;
    if (a.bestPosRank !== b.bestPosRank) return a.bestPosRank - b.bestPosRank;
    return a.normalized.localeCompare(b.normalized);
  });

  const headwordsMap = new Map<string, ParsedCocaHeadwordSummary>();
  const rawLexemes: ParsedCocaBundle['rawLexemes'] = [];

  let currentCompetitionRank = 1;
  for (let idx = 0; idx < headwordsTemp.length; idx++) {
    const hw = headwordsTemp[idx];
    if (idx > 0 && hw.totalFrequency < headwordsTemp[idx - 1].totalFrequency) {
      currentCompetitionRank = idx + 1;
    }
    const derivedRank = currentCompetitionRank;
    const ordinalRank = idx + 1;

    const lexemeBreakdowns: CocaPosBreakdownItem[] = hw.items.map((it, posIdx) => {
      const meta = getCocaPosMeta(it.pos);
      const sharePct =
        hw.totalFrequency > 0
          ? Number(((it.frequency / hw.totalFrequency) * 100).toFixed(1))
          : 0;
      const lexId = `lexeme:${hw.normalized}:${it.pos}`;

      rawLexemes.push({
        id: lexId,
        headword: hw.headword,
        normalizedHeadword: hw.normalized,
        pos: it.pos,
        rank: it.rank,
        frequency: it.frequency,
        headwordTotalFreq: hw.totalFrequency,
        headwordDerivedRank: derivedRank,
        headwordPosCount: hw.posCount,
        shareInHeadwordPct: sharePct,
        isPrimaryPos: posIdx === 0,
      });

      return {
        lexemeId: lexId,
        pos: it.pos,
        posZh: meta.shortZh,
        posAbbr: meta.abbr,
        rank: it.rank,
        frequency: it.frequency,
        sharePct,
        isPrimary: posIdx === 0,
      };
    });

    headwordsMap.set(hw.normalized, {
      headword: hw.headword,
      normalized: hw.normalized,
      totalFrequency: hw.totalFrequency,
      derivedRank,
      ordinalRank,
      bestPosRank: hw.bestPosRank,
      primaryPos: hw.primaryPos,
      primaryPosFreq: hw.primaryPosFreq,
      posCount: hw.posCount,
      posEntropy: hw.posEntropy,
      dominantSharePct: hw.dominantSharePct,
      lexemes: lexemeBreakdowns,
    });
  }

  // Sort rawLexemes by official Rank 1..60,000 ascending
  rawLexemes.sort((a, b) => a.rank - b.rank);

  const hasCompleteRankRange =
    lexemeCount > 0 &&
    rankMin === 1 &&
    rankMax === lexemeCount &&
    seenRanks.size === lexemeCount;

  return {
    headwordsMap,
    rawLexemes,
    headwordCount: headwordsMap.size,
    lexemeCount,
    totalTokenFrequency,
    rankMin: lexemeCount > 0 ? rankMin : 0,
    rankMax,
    hasCompleteRankRange,
    hyphenatedCount,
    multiPosCount,
    multiWordCount,
    capitalizedCount,
    posDistribution,
    diagnostics,
  };
}

/**
 * Generates the independent CorpusObservation evidence list for a given word/entity on demand.
 * Explicitly separates raw observations from derived observations.
 */
export function buildWordCorpusObservations(
  word: LexiconWordItem,
  family?: BncCocaFamily | null
): CorpusObservation[] {
  const obs: CorpusObservation[] = [];

  // 1. COCA 2020 Lemma+PoS Raw Observations + Headword Derived Observations
  if (word.inCoca && word.cocaLexemes && word.cocaLexemes.length > 0) {
    for (const lex of word.cocaLexemes) {
      obs.push({
        id: `obs:${lex.lexemeId}:rank`,
        datasetSource: 'COCA_2020',
        datasetVersion: '2020 (60k)',
        targetId: lex.lexemeId,
        targetLabel: `${word.word} (${lex.pos})`,
        targetEntityType: 'lexeme',
        metric: 'COCA_LEMMA_POS_RANK',
        unitLabel: '官方词性记录排名',
        value: lex.rank,
        isRaw: true,
        isDerived: false,
        formulaOrNote: `COCA 2020 官方词元+词性排名 (#${lex.rank} / 60,000)`,
      });
      obs.push({
        id: `obs:${lex.lexemeId}:freq`,
        datasetSource: 'COCA_2020',
        datasetVersion: '2020 (60k)',
        targetId: lex.lexemeId,
        targetLabel: `${word.word} (${lex.pos})`,
        targetEntityType: 'lexeme',
        metric: 'COCA_LEMMA_POS_FREQ',
        unitLabel: '词元+词性频次',
        value: lex.frequency,
        isRaw: true,
        isDerived: false,
        formulaOrNote: `COCA 2020 原始词元频次（占该词头总频次 ${lex.sharePct}%）`,
      });
    }

    if (
      word.cocaHeadwordTotalFreq !== undefined &&
      word.cocaHeadwordTotalFreq !== null &&
      word.cocaHeadwordDerivedRank !== undefined &&
      word.cocaHeadwordDerivedRank !== null
    ) {
      obs.push({
        id: `obs:headword:${word.id}:coca_total_freq`,
        datasetSource: 'DERIVED_COCA_2020',
        datasetVersion: '2020-derived',
        targetId: word.id,
        targetLabel: word.word,
        targetEntityType: 'headword',
        metric: 'COCA_HEADWORD_TOTAL_FREQ',
        unitLabel: '词头各词性频次之和 (派生)',
        value: word.cocaHeadwordTotalFreq,
        isRaw: false,
        isDerived: true,
        formulaOrNote:
          word.cocaLexemes.length > 1
            ? `由该词头下 ${word.cocaLexemes.length} 条 COCA 词性记录频次求和派生 (${word.cocaLexemes.map((l) => `${l.pos}:${l.frequency.toLocaleString()}`).join(' + ')})`
            : '单词性词头，合计频次等于其唯一词性记录频次（派生指标）',
      });
      obs.push({
        id: `obs:headword:${word.id}:coca_derived_rank`,
        datasetSource: 'DERIVED_COCA_2020',
        datasetVersion: '2020-derived',
        targetId: word.id,
        targetLabel: word.word,
        targetEntityType: 'headword',
        metric: 'COCA_HEADWORD_DERIVED_RANK',
        unitLabel: '词头合计频次重排 (派生)',
        value: word.cocaHeadwordDerivedRank,
        isRaw: false,
        isDerived: true,
        formulaOrNote:
          '按 53,951 个不同 COCA 词头的合计频次降序重排计算（频次相同时采用标准并列排名规则，非官方原始词性排名）',
      });
    }
  }

  // 2. BNC/COCA 2.0 Form & Family Raw Observations
  if (word.inBnc && word.formFrequency !== null) {
    obs.push({
      id: `obs:form:${word.id}:bnc_freq`,
      datasetSource: 'BNC_COCA_2.0',
      datasetVersion: 'Nation 25k',
      targetId: word.id,
      targetLabel: word.word,
      targetEntityType: 'form',
      metric: 'BNC_FORM_FREQ',
      unitLabel: '具体词形频次',
      value: word.formFrequency,
      isRaw: true,
      isDerived: false,
      formulaOrNote:
        word.formFrequency === 0
          ? 'Nation BNC/COCA 词族表明确记录为 (0) 的零频次词形（非缺失值）'
          : 'Nation BNC/COCA 词族表记录的 BNC 原始独立词形频次',
    });
  }

  const targetFam = family || null;
  if (word.band && word.familyFrequency !== null) {
    obs.push({
      id: `obs:family:${word.familyId || word.id}:band`,
      datasetSource: 'BNC_COCA_2.0',
      datasetVersion: 'Nation 25k',
      targetId: word.familyId || word.id,
      targetLabel: `${word.headword || word.word} 词族`,
      targetEntityType: 'family',
      metric: 'NATION_BAND',
      unitLabel: '词族分级 (1k–25k)',
      value: word.band,
      isRaw: true,
      isDerived: false,
      formulaOrNote: `Nation BNC/COCA 25,000 词族频段分级 (${word.band})`,
    });
    obs.push({
      id: `obs:family:${word.familyId || word.id}:total_freq`,
      datasetSource: 'BNC_COCA_2.0',
      datasetVersion: 'Nation 25k',
      targetId: word.familyId || word.id,
      targetLabel: `${word.headword || word.word} 词族`,
      targetEntityType: 'family',
      metric: 'BNC_FAMILY_FREQ',
      unitLabel: '词族总频次',
      value: word.familyFrequency,
      isRaw: true,
      isDerived: false,
      formulaOrNote: targetFam?.hasSumMismatch
        ? `BNC 词族官方总频次 ${word.familyFrequency.toLocaleString()}（成员频次求和为 ${targetFam.calculatedSum.toLocaleString()}）`
        : `BNC 词族全部 ${word.familyMemberCount || 1} 个成员词形频次总和`,
    });
  }

  return obs;
}

/**
 * Conservatively classifies whether a BNC family member is a regular grammatical inflection
 * of the family headword (supported by morphological suffix + family co-membership, and NOT an
 * independent multi-PoS conflict). Otherwise classifies only as `belongs_to_family` or `derivation_of`.
 */
function classifyFamilyMemberRelation(
  memberNorm: string,
  headNorm: string
): { type: 'inflection_of' | 'derivation_of' | 'belongs_to_family'; note: string; isExplicit: boolean } {
  if (memberNorm === headNorm) {
    return {
      type: 'belongs_to_family',
      note: 'BNC/COCA 词族代表词头 (Headword)',
      isExplicit: true,
    };
  }

  const regularInflections = new Set<string>([
    `${headNorm}s`,
    `${headNorm}es`,
    `${headNorm}ed`,
    `${headNorm}d`,
    `${headNorm}ing`,
    `${headNorm}er`,
    `${headNorm}est`,
  ]);
  if (headNorm.endsWith('y') && headNorm.length > 2) {
    const stem = headNorm.slice(0, -1);
    regularInflections.add(`${stem}ies`);
    regularInflections.add(`${stem}ied`);
    regularInflections.add(`${stem}ier`);
    regularInflections.add(`${stem}iest`);
  }
  if (headNorm.endsWith('e') && headNorm.length > 2) {
    const stem = headNorm.slice(0, -1);
    regularInflections.add(`${stem}ing`);
    regularInflections.add(`${stem}ed`);
    regularInflections.add(`${stem}er`);
    regularInflections.add(`${stem}est`);
  }

  if (regularInflections.has(memberNorm)) {
    return {
      type: 'inflection_of',
      note: `同词族内规则屈折词形 (${memberNorm} ← ${headNorm})`,
      isExplicit: false,
    };
  }

  return {
    type: 'belongs_to_family',
    note: `BNC/COCA 词族明确收录成员（属于 "${headNorm}" 词族，不强行伪造派生方向）`,
    isExplicit: true,
  };
}

/**
 * Generates traceable LexicalRelation edges for a given word on demand.
 * Explicitly distinguishes source-recorded relations (`isExplicit: true`)
 * from conservative morphological/reference relations (`isExplicit: false`).
 */
export function buildWordLexicalRelations(
  word: LexiconWordItem,
  family?: BncCocaFamily | null,
  wordsMap?: Map<string, LexiconWordItem>
): LexicalRelation[] {
  const relations: LexicalRelation[] = [];

  // 1. Realizes Lexeme (COCA 2020)
  if (word.inCoca && word.cocaLexemes) {
    for (const lex of word.cocaLexemes) {
      relations.push({
        id: `rel:realizes:${word.id}:${lex.pos}`,
        sourceId: word.id,
        sourceLabel: word.word,
        sourceEntityType: 'form',
        targetId: lex.lexemeId,
        targetLabel: `${word.word} (${lex.pos})`,
        targetEntityType: 'lexeme',
        relationType: 'realizes_lexeme',
        datasetSource: 'COCA_2020',
        isExplicit: true,
        confidence: 'high',
        explanation: `对应 COCA 2020 官方词元记录：${lex.posZh} · 官方排名 #${lex.rank.toLocaleString()} · 频次 ${lex.frequency.toLocaleString()}`,
      });
    }
  }

  // 2. Belongs to BNC Family (including multi-family memberships like "grannies")
  const memberships = word.bncMemberships || [];
  if (memberships.length > 0) {
    for (const m of memberships) {
      const cls = classifyFamilyMemberRelation(word.normalized, m.headword.toLowerCase());
      relations.push({
        id: `rel:bnc_fam:${word.id}:${m.familyId}`,
        sourceId: word.id,
        sourceLabel: word.word,
        sourceEntityType: 'form',
        targetId: m.familyId,
        targetLabel: `${m.headword} (${m.band})`,
        targetEntityType: 'family',
        relationType: 'belongs_to_family',
        datasetSource: 'BNC_COCA_2.0',
        isExplicit: true,
        confidence: 'high',
        explanation: `BNC/COCA 2.0 明确收录于 "${m.headword}" (${m.band}) 词族，该词形独立频次为 ${m.frequency.toLocaleString()}`,
      });

      if (cls.type === 'inflection_of' && m.headword.toLowerCase() !== word.normalized) {
        relations.push({
          id: `rel:infl:${word.id}:${m.headword.toLowerCase()}`,
          sourceId: word.id,
          sourceLabel: word.word,
          sourceEntityType: 'form',
          targetId: m.headword.toLowerCase(),
          targetLabel: m.headword,
          targetEntityType: 'form',
          relationType: 'inflection_of',
          datasetSource: 'BNC_COCA_2.0',
          isExplicit: false,
          confidence: 'high',
          explanation: `${cls.note}（仅在同词族内标记屈折关联，不跨词性合并 COCA 独立记录）`,
        });
      }
    }
  } else if (word.bncLinkedViaVariant && word.familyId && word.headword) {
    relations.push({
      id: `rel:bnc_var_fam:${word.id}:${word.familyId}`,
      sourceId: word.id,
      sourceLabel: word.word,
      sourceEntityType: 'form',
      targetId: word.familyId,
      targetLabel: `${word.headword} (${word.band})`,
      targetEntityType: 'family',
      relationType: 'belongs_to_family',
      datasetSource: 'CROSS_SOURCE_ALIGNMENT',
      isExplicit: false,
      confidence: 'high',
      explanation: word.matchNote || `通过 CET 官方同条拼写变体关联至 ${word.headword} 词族`,
    });
  }

  // Also check if within the same BNC family there is a clear noun singular-plural pair (e.g. abilities -> ability)
  if (family && word.normalized.endsWith('ies') && word.normalized.length > 4) {
    const singularY = `${word.normalized.slice(0, -3)}y`;
    if (
      singularY !== family.normalizedHeadword &&
      family.members.some((m) => m.normalized === singularY)
    ) {
      relations.push({
        id: `rel:infl_peer:${word.id}:${singularY}`,
        sourceId: word.id,
        sourceLabel: word.word,
        sourceEntityType: 'form',
        targetId: singularY,
        targetLabel: singularY,
        targetEntityType: 'form',
        relationType: 'inflection_of',
        datasetSource: 'BNC_COCA_2.0',
        isExplicit: false,
        confidence: 'high',
        explanation: `同词族内名词复数屈折关系 (${word.word} → ${singularY})；注意 "${word.word}" 不直接借用 "${singularY}" 的 COCA 词元频次`,
      });
    }
  }

  // 3. CET Official Entries & Spelling Variants / Inline Derivatives
  for (const ref of word.cetRefs) {
    relations.push({
      id: `rel:cet_entry:${word.id}:${ref.entryId}:${ref.rawMember}`,
      sourceId: word.id,
      sourceLabel: word.word,
      sourceEntityType: 'form',
      targetId: ref.entryId,
      targetLabel: `${ref.representativeHeadword} (${ref.level} #${ref.lineNumber})`,
      targetEntityType: 'official_entry',
      relationType: 'included_in_official_entry',
      datasetSource: 'CET2016',
      isExplicit: true,
      confidence: 'high',
      explanation: `收录于 CET2016 官方大纲第 ${ref.lineNumber} 行词目「${ref.rawLine.replace(/\t/g, ' · ')}」`,
    });

    for (const peer of ref.peerForms) {
      const peerNorm = peer.toLowerCase();
      if (peerNorm === word.normalized) continue;
      const isSpellingVariant =
        ref.expansionRule === 'slash_suffix' ||
        ref.expansionRule === 'slash_parallel' ||
        ref.expansionRule === 'paren_optional' ||
        ref.expansionRule === 'combined_paren_slash';

      relations.push({
        id: `rel:cet_peer:${word.id}:${peerNorm}:${ref.lineNumber}`,
        sourceId: word.id,
        sourceLabel: word.word,
        sourceEntityType: 'form',
        targetId: peerNorm,
        targetLabel: peer,
        targetEntityType: 'form',
        relationType: isSpellingVariant ? 'spelling_variant_of' : 'derivation_of',
        datasetSource: 'CET2016',
        isExplicit: true,
        confidence: 'high',
        explanation: isSpellingVariant
          ? `CET2016 考纲同槽位拼写/简写变体 (${ref.rawMember})`
          : `CET2016 考纲同行派生或关联词条 (${ref.representativeHeadword})`,
      });
    }
  }

  // 4. Phrase Core Reference
  if (word.relatedPhraseCoreWord) {
    const coreExists = !wordsMap || wordsMap.has(word.relatedPhraseCoreWord.toLowerCase());
    if (coreExists) {
      relations.push({
        id: `rel:phrase_core:${word.id}:${word.relatedPhraseCoreWord}`,
        sourceId: word.id,
        sourceLabel: word.word,
        sourceEntityType: 'form',
        targetId: word.relatedPhraseCoreWord.toLowerCase(),
        targetLabel: word.relatedPhraseCoreWord,
        targetEntityType: 'form',
        relationType: 'related_to',
        datasetSource: 'CROSS_SOURCE_ALIGNMENT',
        isExplicit: false,
        confidence: 'medium',
        explanation: `多词短语 "${word.word}" 的核心参考词头 "${word.relatedPhraseCoreWord}"`,
      });
    }
  }

  return relations;
}
