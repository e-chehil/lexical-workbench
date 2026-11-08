/**
 * Study planner tests (real data + synthetic learning state). These pin the ordering rules and
 * the exclusion semantics that make a plan explainable: every item carries at least one reason
 * naming a metric or a source fact.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullIndex } from '../node/loadSources.ts';
import type { QueryContext } from '../engine/query.ts';
import { InMemoryLearningState, type LearningRecord } from '../learning/model.ts';
import { planStrategy } from '../planning/planner.ts';

const index = loadFullIndex();
const NOW = '2026-11-08T00:00:00.000Z';
let learning = new InMemoryLearningState();
let ctx: QueryContext = { index, learning };

const rec = (target: LearningRecord['target'], status: LearningRecord['status']): LearningRecord => ({
  target,
  status,
  tags: [],
  note: '',
  studyCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
  lastStudiedAt: null,
});

function reset(records: LearningRecord[] = []): void {
  learning = new InMemoryLearningState(records);
  ctx = { index, learning };
}

test('coca_high_freq: empty state starts with the rank-1 article and a metric reason', () => {
  reset();
  const items = planStrategy(ctx, { strategy: 'coca_high_freq', size: 20 });
  assert.equal(items.length, 20);
  assert.equal(items[0].target, 'f:the');
  assert.equal(items[0].reasons[0].code, 'coca_rank');
  assert.equal(items[0].reasons[0].value, 1);
  for (const item of items) assert.ok(item.reasons.length >= 1);
});

test('coca_high_freq: mastered PoS is never proposed; verb remains with rank 115', () => {
  reset([rec('f:work', 'learning'), rec('lp:work|noun', 'mastered')]);
  const items = planStrategy(ctx, { strategy: 'coca_high_freq', size: 2000 });
  assert.ok(!items.some((item) => item.target === 'lp:work|noun'));
  const verb = items.find((item) => item.target === 'lp:work|verb');
  assert.ok(verb, 'verb record should be proposed');
  const rank = verb.reasons.find((reason) => reason.code === 'coca_rank');
  assert.equal(rank?.value, 115);
});

test('coca_high_freq: a mastered Form removes its records from the plan', () => {
  reset([rec('f:work', 'mastered')]);
  const items = planStrategy(ctx, { strategy: 'coca_high_freq', size: 2000 });
  assert.ok(!items.some((item) => item.target === 'f:work' || item.target === 'lp:work|noun' || item.target === 'lp:work|verb'));
});

test('bnc_family_completion: a mastered member opens the rest of its family by member frequency', () => {
  reset([rec('f:worked', 'mastered')]);
  const items = planStrategy(ctx, { strategy: 'bnc_family_completion', size: 20 });
  assert.ok(items.length > 0);
  for (const item of items) {
    const member = item.evidenceRef;
    assert.ok(member.startsWith('bnc25k:mem:work|'), member);
    assert.ok(item.reasons.some((reason) => reason.code === 'member_freq'));
    assert.ok(item.reasons.some((reason) => reason.code === 'family_band'));
  }
  const freqs = items.map((item) => item.reasons.find((r) => r.code === 'member_freq')?.value ?? 0);
  assert.deepEqual(freqs, [...freqs].sort((a, b) => b - a));
  assert.ok(!items.some((item) => item.target === 'f:worked'));
});

test('cet_syllabus: CET4 precedes CET6 and headwords precede derivatives', () => {
  reset();
  const items = planStrategy(ctx, { strategy: 'cet_syllabus', size: 50 });
  assert.equal(items.length, 50);
  const ranks = items.map((item) => item.reasons.find((r) => r.code === 'cet_level')?.value ?? 0);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  for (const item of items) {
    const role = item.reasons.find((r) => r.code === 'cet_role')?.text;
    assert.ok(role && role.length > 0);
  }
});

test('custom_mix: no duplicate targets and every item has a reason', () => {
  reset();
  const items = planStrategy(ctx, { strategy: 'custom_mix', size: 30 });
  assert.equal(items.length, 30);
  assert.equal(new Set(items.map((item) => item.target)).size, 30);
  for (const item of items) assert.ok(item.reasons.length >= 1);
});
