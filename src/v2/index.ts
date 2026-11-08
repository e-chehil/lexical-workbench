/** Public surface of the v2 lexical engine. UI code imports from here only. */
export * from './domain/ids.ts';
export * from './domain/types.ts';
export * from './domain/metrics.ts';
export { parseCocaJson, parseCocaData } from './sources/cocaAdapter.ts';
export { parseBncFamilies } from './sources/bncAdapter.ts';
export { parseCetSyllabus } from './sources/cetAdapter.ts';
export { LexicalIndex, buildLexicalIndex, type SourceSnapshots } from './engine/lexicalIndex.ts';
export * from './engine/query.ts';
export * from './engine/alignment.ts';
export * from './learning/model.ts';
