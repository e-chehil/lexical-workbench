/**
 * Study planner strategies (V2-T09).
 *
 * Every proposal is justified by source facts: COCA official rank / PoS, BNC band and member
 * frequency, CET level and syllabus role. There are no hidden stop-word lists or opaque scores;
 * ordering is an explicit rule per strategy and `score` is only the sort key used for previewing.
 *
 * Exclusion is read through the effective learning status, so a PoS target that inherits a mastered
 * Form is never proposed again. Nothing is written here — the UI turns a preview into a collection.
 */
import type { EntityKind, EntityRef, TargetRef } from '../domain/ids.ts';
import type { LexQuery, QueryContext } from '../engine/query.ts';
import { projectRefs, runQuery } from '../engine/query.ts';
import { defaultTargetFor, resolveEffectiveStatus, type LearningStatus } from '../learning/model.ts';
import type { PlanItem, PlanReason, PlanRequest, StrategyId } from '../contracts.ts';

const DEFAULT_EXCLUDED: readonly LearningStatus[] = ['mastered', 'deferred'];

function scopeRefs(ctx: QueryContext, scope: LexQuery | undefined, kind: EntityKind): Set<EntityRef> | null {
  if (!scope) return null;
  const refs = runQuery(ctx, { ...scope, kind: scope.kind, page: undefined, aggregates: undefined }).refs;
  return new Set(projectRefs(ctx.index, refs, kind));
}

function targetStatus(ctx: QueryContext, target: TargetRef): LearningStatus {
  return ctx.learning ? resolveEffectiveStatus(ctx.learning, target).status : 'unrated';
}

function isExcluded(ctx: QueryContext, target: TargetRef, excluded: ReadonlySet<LearningStatus>): boolean {
  return excluded.has(targetStatus(ctx, target));
}

function compareRank(a: PlanItem, b: PlanItem): number {
  return b.score - a.score;
}

/** COCA records by official rank, Form target unless the headword's PoS statuses differ. */
export function planCocaHighFreq(ctx: QueryContext, req: PlanRequest): PlanItem[] {
  const excluded = new Set(req.excludeStatuses ?? DEFAULT_EXCLUDED);
  const allowed = scopeRefs(ctx, req.scope, 'coca_lemma_pos');
  const { index } = ctx;

  // Effective status per record tells us whether a headword needs PoS refinement.
  const headwordStatuses = new Map<EntityRef, Set<LearningStatus>>();
  const recordTargets = new Map<EntityRef, TargetRef>();
  for (const record of index.cocaRecords.values()) {
    if (allowed && !allowed.has(record.ref)) continue;
    const target = defaultTargetFor(index, record.ref);
    if (!target) continue;
    recordTargets.set(record.ref, target);
    const status = targetStatus(ctx, target);
    let set = headwordStatuses.get(record.headwordRef);
    if (!set) {
      set = new Set();
      headwordStatuses.set(record.headwordRef, set);
    }
    set.add(status);
  }

  const items: PlanItem[] = [];
  const seen = new Set<TargetRef>();
  for (const record of index.cocaRecords.values()) {
    if (allowed && !allowed.has(record.ref)) continue;
    const polish = headwordStatuses.get(record.headwordRef);
    const target = (polish && polish.size > 1 ? defaultTargetFor(index, record.ref) : defaultTargetFor(index, record.headwordRef)) ?? recordTargets.get(record.ref);
    if (!target || seen.has(target)) continue;
    if (isExcluded(ctx, target, excluded)) continue;
    seen.add(target);
    const reasons: PlanReason[] = [
      {
        code: 'coca_rank',
        text: `COCA 官方排名 #${record.rank.toLocaleString('en-US')}（${record.pos}）`,
        metric: 'coca2020.lp_rank',
        value: record.rank,
      },
      {
        code: 'coca_freq',
        text: `词性频次 ${record.freq.toLocaleString('en-US')}`,
        metric: 'coca2020.lp_freq',
        value: record.freq,
      },
    ];
    if (polish && polish.size > 1) {
      reasons.push({ code: 'pos_refinement', text: '该词头各词性的学习状态不同，按词性记录追踪' });
    }
    items.push({ target, evidenceRef: record.ref, score: -record.rank, reasons });
    if (items.length >= req.size * 4) break;
  }
  items.sort(compareRank);
  return items.slice(0, req.size);
}

/** Families with at least one mastered member and at least one not-yet-mastered member. */
export function planBncFamilyCompletion(ctx: QueryContext, req: PlanRequest): PlanItem[] {
  const excluded = new Set(req.excludeStatuses ?? DEFAULT_EXCLUDED);
  const allowed = scopeRefs(ctx, req.scope, 'bnc_family');
  const { index } = ctx;
  const candidates: { item: PlanItem; band: number; freq: number }[] = [];

  for (const family of index.bncFamilies.values()) {
    if (allowed && !allowed.has(family.ref)) continue;
    const members = family.memberRefs.map((ref) => index.bncMembers.get(ref)).filter((m): m is NonNullable<typeof m> => Boolean(m));
    let mastered = 0;
    for (const member of members) {
      if ((ctx.learning ? resolveEffectiveStatus(ctx.learning, member.formRef as TargetRef).status : 'unrated') === 'mastered') mastered++;
    }
    if (mastered === 0 || mastered === members.length) continue;

    for (const member of members) {
      const target = member.formRef as TargetRef;
      if (isExcluded(ctx, target, excluded)) continue;
      const reasons: PlanReason[] = [
        {
          code: 'family_partially_mastered',
          text: `词族 ${family.headword} 已掌握 ${mastered}/${members.length} 个成员`,
          metric: 'bnc25k.family_band',
          value: family.band,
        },
        {
          code: 'family_band',
          text: `BNC/COCA 频段 ${family.bandLabel}`,
          metric: 'bnc25k.family_band',
          value: family.band,
        },
        {
          code: 'member_freq',
          text: `成员频次 ${member.frequency.toLocaleString('en-US')}`,
          metric: 'bnc25k.member_freq',
          value: member.frequency,
        },
      ];
      candidates.push({
        item: { target, evidenceRef: member.ref, score: member.frequency, reasons },
        band: family.band,
        freq: member.frequency,
      });
    }
  }

  // Order: earlier band first, then the member's own frequency (descending).
  candidates.sort((a, b) => a.band - b.band || b.freq - a.freq);
  const seen = new Set<TargetRef>();
  const out: PlanItem[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.item.target)) continue;
    seen.add(candidate.item.target);
    out.push(candidate.item);
    if (out.length >= req.size) break;
  }
  return out;
}

/** CET syllabus order: CET4 before CET6, headword before derivatives/variants. */
export function planCetSyllabus(ctx: QueryContext, req: PlanRequest): PlanItem[] {
  const excluded = new Set(req.excludeStatuses ?? DEFAULT_EXCLUDED);
  const allowed = scopeRefs(ctx, req.scope, 'cet_entry');
  const { index } = ctx;
  const templates: { item: PlanItem; level: number; role: number; order: number }[] = [];

  let order = 0;
  for (const entry of index.cetEntries.values()) {
    if (allowed && !allowed.has(entry.ref)) continue;
    const links = [...entry.links].sort((a, b) => {
      const roleRank = (role: string) => (role === 'headword' ? 0 : role === 'derivative' ? 1 : 2);
      return roleRank(a.role) - roleRank(b.role);
    });
    for (const link of links) {
      const target = link.formRef as TargetRef;
      const reasons: PlanReason[] = [
        { code: 'cet_level', text: `CET 大纲 ${link.level}`, value: link.level === 'CET4' ? 4 : 6 },
        {
          code: 'cet_role',
          text: link.role === 'headword' ? '大纲主词条' : link.role === 'derivative' ? '大纲派生词' : '大纲变体拼写',
        },
        { code: 'cet_entry', text: `词目 ${entry.display}` },
      ];
      templates.push({
        item: { target, evidenceRef: entry.ref, score: 10_000 - order, reasons },
        level: link.level === 'CET4' ? 0 : 1,
        role: link.role === 'headword' ? 0 : link.role === 'derivative' ? 1 : 2,
        order: order++,
      });
    }
  }

  templates.sort((a, b) => a.level - b.level || a.role - b.role || a.order - b.order);
  const seen = new Set<TargetRef>();
  const out: PlanItem[] = [];
  for (const template of templates) {
    if (seen.has(template.item.target) || isExcluded(ctx, template.item.target, excluded)) continue;
    seen.add(template.item.target);
    out.push(template.item);
    if (out.length >= req.size) break;
  }
  return out;
}

/** Weighted smooth round-robin over the three strategies, de-duplicated by target. */
export function planCustomMix(ctx: QueryContext, req: PlanRequest): PlanItem[] {
  const weights = req.mix ?? {};
  const strategies: Exclude<StrategyId, 'custom_mix'>[] = ['coca_high_freq', 'bnc_family_completion', 'cet_syllabus'];
  const lists = strategies.map((strategy) => ({
    items: planStrategy(ctx, { ...req, strategy, size: Math.max(req.size * 3, 30) }),
    cursor: 0,
    weight: Math.max(0, weights[strategy] ?? 1),
  }));
  const totalWeight = lists.reduce((sum, list) => sum + list.weight, 0) || 1;

  const out: PlanItem[] = [];
  const seen = new Set<TargetRef>();
  const current = lists.map(() => 0);
  let guard = 0;

  while (out.length < req.size && guard++ < req.size * 100) {
    let active = false;
    for (let i = 0; i < lists.length; i++) {
      if (lists[i].cursor >= lists[i].items.length) continue;
      active = true;
      current[i] += lists[i].weight;
    }
    if (!active) break;

    let pick = -1;
    for (let i = 0; i < lists.length; i++) {
      if (lists[i].cursor >= lists[i].items.length) continue;
      if (pick === -1 || current[i] > current[pick]) pick = i;
    }
    if (pick === -1) break;
    current[pick] -= totalWeight;

    let item: PlanItem | undefined;
    while (lists[pick].cursor < lists[pick].items.length) {
      const next = lists[pick].items[lists[pick].cursor++];
      if (!seen.has(next.target)) {
        item = next;
        break;
      }
    }
    if (!item) continue;
    seen.add(item.target);
    out.push(item);
  }
  return out.slice(0, req.size);
}

export function planStrategy(ctx: QueryContext, req: PlanRequest): PlanItem[] {
  const size = Math.max(1, Math.floor(req.size));
  const normalized = { ...req, size };
  switch (req.strategy) {
    case 'coca_high_freq':
      return planCocaHighFreq(ctx, normalized);
    case 'bnc_family_completion':
      return planBncFamilyCompletion(ctx, normalized);
    case 'cet_syllabus':
      return planCetSyllabus(ctx, normalized);
    case 'custom_mix':
      return planCustomMix(ctx, normalized);
    default:
      return [];
  }
}
