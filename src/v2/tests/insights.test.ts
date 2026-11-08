/**
 * Insights report tests (real data). The acceptance case is the documented COCA weighted coverage:
 * mastering Form `work` credits both of its listed PoS records (854,095 + 456,169) out of the
 * 695,117,371 occurrences in the top-1,000 records.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullIndex } from '../node/loadSources.ts';
import { refs } from '../domain/ids.ts';
import { buildInsightsReport } from '../insights/report.ts';
import { buildTargetRows } from '../learning/targets.ts';
import { InMemoryLearningState, type LearningRecord } from '../learning/model.ts';

const index = loadFullIndex();
const NOW = '2026-11-08T00:00:00.000Z';

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

test('insights: work mastered gives the documented COCA weighted coverage', () => {
  const learning = new InMemoryLearningState([rec('f:work', 'mastered')]);
  const report = buildInsightsReport(index, learning);
  const r1000 = report.coverage.coca.find((cell) => cell.id === 'coca-coverage-1000');
  assert.ok(r1000);
  assert.equal(r1000.value, 1_310_264);
  assert.equal(r1000.total, 695_117_371);
  assert.ok(Math.abs((r1000.ratio ?? 0) - 1_310_264 / 695_117_371) < 1e-12);
  assert.equal(report.status.forms.byStatus.mastered, 1);
  assert.equal(report.status.cocaRecords.byStatus.mastered, 2);
});

test('insights: rank bucket 1-1000 counts both work records and opens a valid query', () => {
  const learning = new InMemoryLearningState([rec('f:work', 'mastered')]);
  const report = buildInsightsReport(index, learning);
  const first = report.cocaRankBuckets[0];
  assert.equal(first.label, '1–1,000');
  assert.equal(first.value, 2);
  assert.equal(first.total, 1000);
  assert.equal(first.query.kind, 'coca_lemma_pos');
  assert.ok(first.query.filters?.some((f) => f.type === 'learning_status'));
});

test('insights: BNC band counts a mastered form once in its band', () => {
  const learning = new InMemoryLearningState([rec('f:work', 'mastered')]);
  const report = buildInsightsReport(index, learning);
  const band1 = report.bncBands.find((cell) => cell.label === '1k');
  assert.ok(band1);
  assert.equal(band1.value, 1);
  assert.ok((band1.total ?? 0) > 1);
  assert.equal(report.status.bncFamilies.masteredAny, 1); // `work` is one member, not all
  assert.equal(report.status.bncFamilies.masteredAll, 0);
});

test('insights: every cell carries a query and a unit', () => {
  const report = buildInsightsReport(index, new InMemoryLearningState());
  const cells = [...report.cocaRankBuckets, ...report.bncBands, ...report.coverage.coca, ...report.coverage.bnc];
  for (const cell of cells) {
    assert.ok(cell.query && cell.query.kind, cell.id);
    assert.ok(cell.unit.length > 0, cell.id);
  }
});

test('targets: resolves forms and lemma+PoS targets, and reports orphans', () => {
  const learning = new InMemoryLearningState([rec('f:work', 'learning'), rec('lp:work|noun', 'mastered')]);
  const rows = buildTargetRows(index, learning, ['f:work', 'lp:work|noun', 'f:zzzz-not-a-word'], ['coca2020.lp_rank']);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].label, 'work');
  assert.equal(rows[0].kind, 'form');
  assert.equal(rows[1].entityRef, refs.cocaLemmaPos('work', 'noun'));
  assert.equal(rows[1].status.status, 'mastered');
  assert.equal(rows[2].entityRef, null);
  assert.equal(rows[2].status.status, 'unrated');
});
