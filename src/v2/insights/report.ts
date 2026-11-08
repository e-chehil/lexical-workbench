/**
 * Insights builders (V2-T08).
 *
 * Pure functions over the index + learning snapshot. Every cell carries the `LexQuery` that opens
 * its underlying set in Explore, so a report is a navigation surface, not a dead picture.
 *
 * Units are never mixed: a Form, a COCA record, a BNC membership and a CET entry are counted in
 * their own panels. Coverage uses the documented frequency-weighted definitions from the learning
 * model; this module only arranges their results.
 */
import { refs, type EntityRef, type TargetRef } from '../domain/ids.ts';
import type { MetricId } from '../domain/metrics.ts';
import type { InsightBucket, InsightsReport, StatusCounts } from '../contracts.ts';
import type { LexicalIndex } from '../engine/lexicalIndex.ts';
import type { LexQuery } from '../engine/query.ts';
import {
  computeBncMemberWeightedCoverage,
  computeCocaWeightedCoverage,
  resolveEffectiveStatus,
  type LearningStateReader,
  type LearningStatus,
} from '../learning/model.ts';

export const COCA_RANK_BUCKETS: readonly { id: string; label: string; min: number; max: number }[] = [
  { id: '1-1000', label: '1–1,000', min: 1, max: 1000 },
  { id: '1001-2000', label: '1,001–2,000', min: 1001, max: 2000 },
  { id: '2001-5000', label: '2,001–5,000', min: 2001, max: 5000 },
  { id: '5001-10000', label: '5,001–10,000', min: 5001, max: 10000 },
  { id: '10001-20000', label: '10,001–20,000', min: 10001, max: 20000 },
  { id: '20001-30000', label: '20,001–30,000', min: 20001, max: 30000 },
  { id: '30001-40000', label: '30,001–40,000', min: 30001, max: 40000 },
  { id: '40001-50000', label: '40,001–50,000', min: 40001, max: 50000 },
  { id: '50001-60000', label: '50,001–60,000', min: 50001, max: 60000 },
];

const EMPTY_STATUS: Record<LearningStatus, number> = { unrated: 0, queued: 0, learning: 0, mastered: 0, deferred: 0 };

function emptyCounts(): StatusCounts {
  return { total: 0, byStatus: { ...EMPTY_STATUS } };
}

function bump(counts: StatusCounts, status: LearningStatus): void {
  counts.total++;
  counts.byStatus[status]++;
}

function statusFilter(kind: LexQuery['kind'], statuses: LearningStatus[]): LexQuery {
  return {
    kind,
    filters: [{ type: 'learning_status', statuses, resolution: 'effective' }],
    sort: [{ by: 'spelling', dir: 'asc' }],
  };
}

function rangeQuery(kind: LexQuery['kind'], metric: MetricId, min: number, max: number): LexQuery {
  return {
    kind,
    filters: [{ type: 'metric_range', metric, min, max }],
    sort: [{ by: 'spelling', dir: 'asc' }],
  };
}

/** Adds a mastered-status filter to a range query (only when that status actually has units). */
function withStatus(query: LexQuery, statuses: LearningStatus[]): LexQuery {
  return { ...query, filters: [...(query.filters ?? []), { type: 'learning_status', statuses, resolution: 'effective' }] };
}

export function buildInsightsReport(index: LexicalIndex, reader: LearningStateReader): InsightsReport {
  const forms = emptyCounts();
  const headwords = emptyCounts();
  const records = emptyCounts();

  const formStatus = new Map<EntityRef, LearningStatus>();
  for (const node of index.forms.values()) {
    const status = resolveEffectiveStatus(reader, node.ref as TargetRef).status;
    formStatus.set(node.ref, status);
    bump(forms, status);
  }
  for (const headword of index.cocaHeadwords.values()) {
    const status = formStatus.get(headword.formRef) ?? 'unrated';
    bump(headwords, status);
  }
  const recordStatus = new Map<EntityRef, LearningStatus>();
  for (const record of index.cocaRecords.values()) {
    const target = refs.lemmaPosTarget(record.headword, record.pos);
    const status = resolveEffectiveStatus(reader, target).status;
    recordStatus.set(record.ref, status);
    bump(records, status);
  }

  // BNC families: any/all member Forms mastered. Membership → Form is the learning unit.
  let familyMasteredAll = 0;
  let familyMasteredAny = 0;
  let familyUntouched = 0;
  for (const family of index.bncFamilies.values()) {
    const distinct = new Set(family.memberRefs.map((m) => index.bncMembers.get(m)!.formRef));
    let mastered = 0;
    let any = false;
    for (const formRef of distinct) {
      if ((formStatus.get(formRef) ?? 'unrated') === 'mastered') {
        mastered++;
        any = true;
      } else if ((formStatus.get(formRef) ?? 'unrated') !== 'unrated') {
        any = true;
      }
    }
    if (distinct.size > 0 && mastered === distinct.size) familyMasteredAll++;
    else if (mastered > 0) familyMasteredAny++;
    else if (!any) familyUntouched++;
  }

  // CET entries: full = every linked Form mastered; partial = some (not all) mastered.
  let cetFull = 0;
  let cetPartial = 0;
  let cetUntouched = 0;
  let cetLinks = 0;
  for (const entry of index.cetEntries.values()) {
    cetLinks += entry.links.length;
    if (entry.links.length === 0) {
      cetUntouched++;
      continue;
    }
    let mastered = 0;
    for (const link of entry.links) if ((formStatus.get(link.formRef) ?? 'unrated') === 'mastered') mastered++;
    if (mastered === entry.links.length) cetFull++;
    else if (mastered > 0) cetPartial++;
    else cetUntouched++;
  }

  // COCA official rank buckets (records).
  const cocaRankBuckets: InsightBucket[] = COCA_RANK_BUCKETS.map((bucket) => {
    let total = 0;
    let mastered = 0;
    for (const record of index.cocaRecords.values()) {
      if (record.rank < bucket.min || record.rank > bucket.max) continue;
      total++;
      if (recordStatus.get(record.ref) === 'mastered') mastered++;
    }
    const base = rangeQuery('coca_lemma_pos', 'coca2020.lp_rank', bucket.min, bucket.max);
    return {
      id: `coca-rank-${bucket.id}`,
      label: bucket.label,
      value: mastered,
      total,
      ratio: total > 0 ? mastered / total : null,
      unit: 'COCA 词性条目',
      query: mastered > 0 ? withStatus(base, ['mastered']) : base,
      note: '按官方 lp_rank 归段；每段只统计本段记录。',
    };
  });

  // BNC bands: distinct member Forms per band, mastered progress. A form in two families in the
  // same band still counts once in that band (it is a spelling, not a membership).
  const bandForms = new Map<number, Set<EntityRef>>();
  for (const member of index.bncMembers.values()) {
    const band = index.getObservation('bnc25k.family_band', member.familyRef);
    if (band === null) continue;
    let set = bandForms.get(band);
    if (!set) {
      set = new Set();
      bandForms.set(band, set);
    }
    set.add(member.formRef);
  }
  const bncBands: InsightBucket[] = [];
  for (let band = 1; band <= 25; band++) {
    const set = bandForms.get(band);
    if (!set) continue;
    let mastered = 0;
    for (const formRef of set) if ((formStatus.get(formRef) ?? 'unrated') === 'mastered') mastered++;
    const base: LexQuery = {
      kind: 'bnc_member',
      filters: [{ type: 'metric_range', metric: 'bnc25k.family_band', min: band, max: band }],
      sort: [{ by: 'metric', metric: 'bnc25k.member_freq', dir: 'desc' }],
    };
    bncBands.push({
      id: `bnc-band-${band}`,
      label: `${band}k`,
      value: mastered,
      total: set.size,
      ratio: set.size > 0 ? mastered / set.size : null,
      unit: '成员词形',
      query: mastered > 0 ? withStatus(base, ['mastered']) : base,
      note: '按成员槽打开；计数按去重词形，一个词形在一个频段只计一次。',
    });
  }

  const cocaCoverage: InsightBucket[] = [1000, 5000, 20000, 60000].map((maxRank) => {
    const coverage = computeCocaWeightedCoverage(index, reader, { maxRank });
    return {
      id: `coca-coverage-${maxRank}`,
      label: `官方排名 ≤ ${maxRank.toLocaleString('en-US')}`,
      value: coverage.numerator,
      total: coverage.denominator,
      ratio: coverage.ratio,
      unit: '频次加权 · 词性记录',
      query: withStatus(rangeQuery('coca_lemma_pos', 'coca2020.lp_rank', 1, maxRank), ['mastered']),
      note: `已掌握记录 ${coverage.unitsCounted.toLocaleString('en-US')} / ${coverage.unitsInScope.toLocaleString('en-US')}。`,
    };
  });

  const bncCoverage: InsightBucket[] = [
    { min: 1, max: 3, label: '词族频段 1k–3k' },
    { min: 1, max: 9, label: '词族频段 1k–9k' },
    { min: 1, max: 25, label: '词族频段 1k–25k' },
  ].map((range) => {
    const coverage = computeBncMemberWeightedCoverage(index, reader, { minBand: range.min, maxBand: range.max });
    return {
      id: `bnc-coverage-${range.min}-${range.max}`,
      label: range.label,
      value: coverage.numerator,
      total: coverage.denominator,
      ratio: coverage.ratio,
      unit: '频次加权 · 成员词形',
      query: withStatus(
        {
          kind: 'bnc_member',
          filters: [{ type: 'metric_range', metric: 'bnc25k.family_band', min: range.min, max: range.max }],
          sort: [{ by: 'metric', metric: 'bnc25k.member_freq', dir: 'desc' }],
        },
        ['mastered']
      ),
      note: `已掌握成员 ${coverage.unitsCounted.toLocaleString('en-US')} / ${coverage.unitsInScope.toLocaleString('en-US')}。`,
    };
  });

  const cetTotal = index.cetEntries.size;
  const cetCoverage = {
    total: cetTotal,
    partial: cetPartial,
    full: cetFull,
    partialRatio: cetTotal > 0 ? cetPartial / cetTotal : null,
    fullRatio: cetTotal > 0 ? cetFull / cetTotal : null,
  };

  return {
    units: {
      forms: index.forms.size,
      cocaHeadwords: index.cocaHeadwords.size,
      cocaRecords: index.cocaRecords.size,
      bncFamilies: index.bncFamilies.size,
      bncMembers: index.bncMembers.size,
      cetEntries: index.cetEntries.size,
      cetLinks,
    },
    status: {
      forms,
      cocaHeadwords: headwords,
      cocaRecords: records,
      bncFamilies: { total: index.bncFamilies.size, masteredAll: familyMasteredAll, masteredAny: familyMasteredAny, untouched: familyUntouched },
      cetEntries: { total: cetTotal, full: cetFull, partial: cetPartial, untouched: cetUntouched },
    },
    cocaRankBuckets,
    bncBands,
    coverage: { coca: cocaCoverage, bnc: bncCoverage, cet: cetCoverage },
  };
}

/** Convenience query for one status within one unit. */
export function statusQueryFor(kind: LexQuery['kind'], status: LearningStatus): LexQuery {
  return statusFilter(kind, status === 'unrated' ? ['unrated'] : [status]);
}
