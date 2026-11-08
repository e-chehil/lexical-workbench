/** Public surface of the v2 lexical engine. UI code imports from here only. */
export * from './domain/ids.ts';
export * from './domain/types.ts';
export * from './domain/metrics.ts';
export { parseCocaJson, parseCocaData } from './sources/cocaAdapter.ts';
export { parseBncFamilies } from './sources/bncAdapter.ts';
export { parseCetSyllabus } from './sources/cetAdapter.ts';
export { LexicalIndex, buildLexicalIndex, type SourceSnapshots } from './engine/lexicalIndex.ts';
export { metricCell, buildRows, buildFormDetail, buildFamilyDetail, rowBadges } from './engine/dto.ts';
export {
  applyPatch,
  undoEvents,
  nextBatchId,
  dedupeTargets,
  isTargetRef,
  compareEventsNewestFirst,
  type ApplyPatchResult,
  type UndoPlan,
  type LearningFields,
} from './store/core.ts';
export {
  CollectionError,
  normalizeStaticTargets,
  newStaticCollection,
  newDynamicCollection,
  patchCollection,
  addCollectionTargets,
  removeCollectionTargets,
  type CollectionPatch,
  type NewStaticCollectionInput,
  type NewDynamicCollectionInput,
} from './store/collections.ts';
export * from './engine/query.ts';
export * from './engine/alignment.ts';
export * from './learning/model.ts';
export type * from './contracts.ts';
