/**
 * Command-palette search (PRODUCT_SPEC §2).
 *
 * Four kinds are searched in parallel with `prefix` mode and `limit 8` each. Two things matter
 * here and are handled explicitly:
 *   - request racing: every keystroke bumps a generation, and a response that no longer belongs to
 *     the newest generation is dropped, so a slow earlier query can never overwrite a newer one;
 *   - labels stay server-side: `rows()` with no columns returns `EntityRowDTO` (label + kind +
 *     Form) without any metric work, so the UI never derives a label itself.
 */
import { useEffect, useRef, useState } from 'react';
import type { EntityKind, EntityRef, MetricId } from '../../v2/index.ts';
import type { EngineClient } from '../../v2/worker/client.ts';
import type { EngineStatus } from '../providers/EngineProvider.tsx';

export const SEARCH_KINDS = ['form', 'coca_headword', 'bnc_family', 'cet_entry'] as const;
export const SEARCH_LIMIT_PER_KIND = 8;
export const SEARCH_DEBOUNCE_MS = 140;

export type SearchKind = (typeof SEARCH_KINDS)[number];

export interface SearchHit {
  ref: EntityRef;
  kind: EntityKind;
  label: string;
  formRef: EntityRef | null;
}

export interface SearchState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  hits: SearchHit[];
  /** Per-kind counts of the returned page (a kind without matches is simply absent). */
  counts: Partial<Record<SearchKind, number>>;
  error: string | null;
}

const EMPTY: SearchState = { status: 'idle', hits: [], counts: {}, error: null };
const NO_COLUMNS: MetricId[] = [];

export function useSearch(client: EngineClient, engineStatus: EngineStatus, term: string): SearchState {
  const [state, setState] = useState<SearchState>(EMPTY);
  const generation = useRef(0);

  useEffect(() => {
    const query = term.trim();
    generation.current += 1;
    const current = generation.current;

    if (engineStatus !== 'ready' || query.length === 0) {
      setState(EMPTY);
      return;
    }

    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    const timer = setTimeout(() => {
      void searchAll(client, query)
        .then((result) => {
          if (generation.current !== current) return; // a newer keystroke already won
          setState(result);
        })
        .catch((cause: unknown) => {
          if (generation.current !== current) return;
          setState({ status: 'error', hits: [], counts: {}, error: cause instanceof Error ? cause.message : String(cause) });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [client, engineStatus, term]);

  return state;
}

async function searchAll(client: EngineClient, query: string): Promise<SearchState> {
  const pages = await Promise.all(
    SEARCH_KINDS.map((kind) =>
      client.rows({
        query: { kind, text: { q: query, mode: 'prefix' }, page: { offset: 0, limit: SEARCH_LIMIT_PER_KIND } },
        columns: NO_COLUMNS,
      })
    )
  );

  const hits: SearchHit[] = [];
  const counts: Partial<Record<SearchKind, number>> = {};
  SEARCH_KINDS.forEach((kind, index) => {
    const page = pages[index];
    if (page.total > 0) counts[kind] = page.total;
    for (const row of page.rows) hits.push({ ref: row.ref, kind: row.kind, label: row.label, formRef: row.formRef });
  });
  return { status: 'ready', hits, counts, error: null };
}

/** Groups hits in the fixed palette order, dropping empty groups. */
export function groupHits(hits: readonly SearchHit[]): { kind: SearchKind; hits: SearchHit[] }[] {
  return SEARCH_KINDS.map((kind) => ({ kind, hits: hits.filter((hit) => hit.kind === kind) })).filter((group) => group.hits.length > 0);
}

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  form: 'Form 拼写',
  coca_headword: 'COCA 词头',
  bnc_family: 'BNC 词族',
  cet_entry: 'CET 大纲条目',
};
