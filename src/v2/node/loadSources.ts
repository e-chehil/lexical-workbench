/**
 * Node-only loader for tests and scripts. The browser loader (fetch + Web Worker) is task
 * V2-T03 in docs/v2/IMPLEMENTATION_PLAN.md and must produce the same LexicalIndex.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseBncFamilies } from '../sources/bncAdapter.ts';
import { parseCetSyllabus } from '../sources/cetAdapter.ts';
import { parseCocaJson } from '../sources/cocaAdapter.ts';
import { buildLexicalIndex, type LexicalIndex } from '../engine/lexicalIndex.ts';

export const DATA_FILES = {
  coca2020: 'public/data/coca_freq.json',
  bnc25k: 'public/data/BNC_COCA_lists.txt',
  cet2016: 'public/data/CET2016.txt',
} as const;

export function readDataFile(file: string, root = process.cwd()): string {
  return fs.readFileSync(path.resolve(root, file), 'utf8');
}

let cached: LexicalIndex | null = null;

/** Builds (once per process) the full three-source index from the real data files. */
export function loadFullIndex(root = process.cwd()): LexicalIndex {
  if (cached) return cached;
  cached = buildLexicalIndex({
    coca: parseCocaJson(readDataFile(DATA_FILES.coca2020, root)),
    bnc: parseBncFamilies(readDataFile(DATA_FILES.bnc25k, root)),
    cet: parseCetSyllabus(readDataFile(DATA_FILES.cet2016, root)),
  });
  return cached;
}
