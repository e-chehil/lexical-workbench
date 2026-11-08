/**
 * Learning-target resolution (Study queue, collections, orphan audit).
 *
 * A target is a `f:` Form or a `lp:` lemma+PoS refinement. The entity it denotes may disappear
 * when a source file is replaced; the stored record is kept and reported as an orphan instead of
 * being deleted or shown with invented data.
 */
import { kindOf, parseRef, type EntityRef, type TargetRef } from '../domain/ids.ts';
import { METRICS, metricDisplayLabel, type MetricId } from '../domain/metrics.ts';
import type { MetricCell, TargetRowDTO } from '../contracts.ts';
import type { EffectiveStatus, LearningRecord, LearningStateReader } from './model.ts';
import { resolveEffectiveStatus, targetEntityRef } from './model.ts';
import type { LexicalIndex } from '../engine/lexicalIndex.ts';

/** Target → entity in the current index (null when the source no longer contains it). */
export function targetEntity(index: LexicalIndex, target: TargetRef): EntityRef | null {
  try {
    return targetEntityRef(index, target);
  } catch {
    return null;
  }
}

function labelOf(index: LexicalIndex, target: TargetRef, entityRef: EntityRef | null): string {
  if (entityRef) return index.label(entityRef);
  const parsed = parseRef(target);
  return parsed.kind === 'lemma_pos_target' ? `${parsed.parts[0]} (${parsed.parts[1]})` : parsed.key;
}

function metricsOf(index: LexicalIndex, entityRef: EntityRef | null, columns: readonly MetricId[]): MetricCell[] {
  if (!entityRef) return [];
  return columns.map((metric) => ({
    metric,
    value: index.metricValue(entityRef, metric),
    label: metricDisplayLabel(metric),
    provenance: METRICS[metric].provenance,
  }));
}

const EMPTY_STATUS: EffectiveStatus = { status: 'unrated', origin: 'default', from: null };

/**
 * Resolves targets in the requested order. `records` supplies tags/notes; a target without a
 * record still resolves (unrated), so a collection may list words the user has not touched yet.
 */
export function buildTargetRows(
  index: LexicalIndex,
  reader: LearningStateReader,
  targets: readonly TargetRef[],
  columns: readonly MetricId[] = [],
  records?: ReadonlyMap<TargetRef, LearningRecord>
): TargetRowDTO[] {
  const seen = new Set<TargetRef>();
  const rows: TargetRowDTO[] = [];
  for (const target of targets) {
    if (seen.has(target)) continue;
    seen.add(target);
    const entityRef = targetEntity(index, target);
    const record = records?.get(target) ?? reader.get(target);
    const status = record ? resolveEffectiveStatus(reader, target) : EMPTY_STATUS;
    rows.push({
      target,
      label: labelOf(index, target, entityRef),
      entityRef,
      kind: entityRef ? kindOf(entityRef) : 'lemma_pos_target',
      status,
      tags: record ? [...record.tags] : [],
      note: record?.note ?? '',
      studyCount: record?.studyCount ?? 0,
      lastStudiedAt: record?.lastStudiedAt ?? null,
      metrics: metricsOf(index, entityRef, columns),
    });
  }
  return rows;
}
