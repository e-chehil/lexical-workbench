/**
 * Lexical Workbench 2.0 — browser source loader (ARCHITECTURE §8.1).
 *
 * Fetches the three source texts from the public directory and builds the same `LexicalIndex`
 * the Node loader produces. Runs inside the Web Worker, so a ~1 s parse + build never blocks the
 * main thread.
 *
 * URLs are resolved against `import.meta.env.BASE_URL`, which Vite sets to the deployment base
 * (`/` in dev, `/lexical-workbench/` for GitHub Pages), so a sub-path deployment keeps working.
 *
 * A 200 response is not proof of success: with `navigateFallback: 'index.html'` (and on static
 * hosts in general) a missing data file is answered with the SPA shell. Every payload is therefore
 * checked against the *content* shape of its source before it is parsed, and a substituted page is
 * refused with a `SourceFormatError` that names the source — the app then keeps its previous data
 * instead of reporting a successfully loaded (but empty) source.
 */
import { SOURCE_IDS, type SourceId } from '../domain/ids.ts';
import { SourceFormatError, type SourceDiagnostic } from '../domain/types.ts';
import { buildLexicalIndex, type LexicalIndex, type SourceSnapshots } from '../engine/lexicalIndex.ts';
import { parseBncFamilies } from '../sources/bncAdapter.ts';
import { parseCetSyllabus } from '../sources/cetAdapter.ts';
import { parseCocaJson } from '../sources/cocaAdapter.ts';

/** Public path of each source file (relative to the deployment base). */
export const SOURCE_FILES: Record<SourceId, string> = {
  coca2020: 'data/coca_freq.json',
  bnc25k: 'data/BNC_COCA_lists.txt',
  cet2016: 'data/CET2016.txt',
};

export type SourceTexts = Partial<Record<SourceId, string>>;

export class SourceLoadError extends Error {
  constructor(
    public readonly code: 'source_load_failed' | 'source_empty' | 'no_sources',
    message: string,
    public readonly sourceId?: SourceId
  ) {
    super(message);
    this.name = 'SourceLoadError';
  }
}

/** `import.meta.env.BASE_URL` in Vite; `/` when the module runs outside Vite (Node tests). */
function importBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  return env?.BASE_URL ?? '/';
}

/** Joins the deployment base with a public path (`/lexical-workbench/` + `data/x` → sub-path URL). */
export function resolvePublicUrl(relativePath: string, baseUrl: string = importBaseUrl()): string {
  const base = baseUrl === '' || baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base === '' ? '/' : base}${relativePath.replace(/^\/+/, '')}`;
}

export interface LoadSourceOptions {
  /** Overrides `import.meta.env.BASE_URL`; tests pass an explicit base. */
  baseUrl?: string;
  /** Injection seam for tests (defaults to the global `fetch`). */
  fetcher?: typeof fetch;
  /** Custom source texts that replace the fetched file (Data Studio uploads, T13). */
  overrides?: SourceTexts;
}

/**
 * Reads all three source texts. Every file is required; `overrides` short-circuits a single file
 * (that is how a custom dataset replaces one source without touching the others).
 */
export async function loadSourceTexts(options: LoadSourceOptions = {}): Promise<Record<SourceId, string>> {
  const baseUrl = options.baseUrl ?? importBaseUrl();
  const fetcher = options.fetcher ?? fetch;
  const overrides = options.overrides ?? {};

  const entries = await Promise.all(
    SOURCE_IDS.map(async (sourceId) => {
      const provided = overrides[sourceId];
      if (provided !== undefined) {
        if (provided.trim().length === 0) {
          throw new SourceLoadError('source_empty', `custom ${sourceId} text is empty`, sourceId);
        }
        return [sourceId, provided] as const;
      }
      return [sourceId, await fetchSourceText(sourceId, resolvePublicUrl(SOURCE_FILES[sourceId], baseUrl), fetcher)] as const;
    })
  );
  return Object.fromEntries(entries) as Record<SourceId, string>;
}

async function fetchSourceText(sourceId: SourceId, url: string, fetcher: typeof fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(url);
  } catch (cause) {
    throw new SourceLoadError(
      'source_load_failed',
      `could not load ${url}: ${cause instanceof Error ? cause.message : String(cause)}`,
      sourceId
    );
  }
  if (!response.ok) {
    throw new SourceLoadError('source_load_failed', `could not load ${url}: HTTP ${response.status}`, sourceId);
  }
  const text = await response.text();
  if (text.trim().length === 0) {
    throw new SourceLoadError('source_empty', `${url} is empty`, sourceId);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Payload shape guards
// ---------------------------------------------------------------------------

/**
 * Markers of an HTML document (normally the SPA fallback page). Only the head of the payload is
 * inspected: a fallback page starts with its doctype or html element, while data files never do.
 */
const HTML_MARKERS: readonly RegExp[] = [
  /<!doctype\s+html/i,
  /<html[\s>]/i,
  /<head[\s>]/i,
  /<body[\s>]/i,
  /<script[\s>]/i,
];

/** True when the payload is an HTML page rather than a data file. */
export function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 2048);
  return HTML_MARKERS.some((marker) => marker.test(head));
}

/**
 * Minimal structural signature of each source file. These are one-line probes, not parsers: they
 * only separate "this source's text" from a substituted payload (an HTML page, another source's
 * format, unrelated prose), so an adapter never receives data that cannot be its own.
 */
const FORMAT_PROBES: Record<SourceId, { pattern: RegExp; expected: string }> = {
  coca2020: {
    // The file is a JSON array; a BOM or leading whitespace is tolerated.
    pattern: /^[\s\uFEFF]*\[/,
    expected: 'a JSON array of {headword, content[]} entries',
  },
  bnc25k: {
    // Every data line starts with a band label and a tab: "1k<TAB>headword<TAB>members<TAB>total".
    pattern: /(?:^|\r?\n)\s*\d{1,2}k\s*\t/,
    expected: 'band-prefixed tab-separated family lines ("1k<TAB>headword<TAB>members<TAB>total")',
  },
  cet2016: {
    // Entries start with a letter or the CET-6 star: "abandon", "★abide", "able<TAB>ability".
    pattern: /(?:^|\r?\n)\s*\uFEFF*[A-Za-z\u2605]/,
    expected: 'one syllabus entry per line ("abandon", "★abide", "able<TAB>ability")',
  },
};

/**
 * Refuses a payload that cannot be this source. `SourceFormatError` already carries the source id
 * and is serialised as `code: 'source_format_error'`, so the caller keeps its previous data and the
 * message says which source was rejected and why.
 */
export function assertSourcePayload(sourceId: SourceId, text: string): void {
  if (looksLikeHtml(text)) {
    throw new SourceFormatError(
      sourceId,
      'the response is an HTML page, not the source file (SPA fallback page or wrong URL)'
    );
  }
  const probe = FORMAT_PROBES[sourceId];
  if (!probe.pattern.test(text)) {
    throw new SourceFormatError(sourceId, `payload does not look like ${probe.expected}`);
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface BuiltSources {
  index: LexicalIndex;
  /** Sources that were actually present, in registry order. */
  sources: SourceId[];
  /** Adapter diagnostics of every loaded source (surfaced by `ready()` and Data Studio). */
  diagnostics: SourceDiagnostic[];
}

/**
 * Parses the texts with the three adapters and builds one index. A `SourceFormatError` from an
 * unusable payload propagates (the caller keeps its previous data); bad units inside a source are
 * skipped by the adapter and reported as diagnostics.
 */
export function buildIndexFromTexts(texts: SourceTexts): BuiltSources {
  const snapshots: SourceSnapshots = {};
  const diagnostics: SourceDiagnostic[] = [];
  const sources: SourceId[] = [];

  if (texts.coca2020 !== undefined) {
    assertSourcePayload('coca2020', texts.coca2020);
    snapshots.coca = parseCocaJson(texts.coca2020);
    requireUnits('coca2020', snapshots.coca.headwords.length);
    diagnostics.push(...snapshots.coca.diagnostics);
    sources.push('coca2020');
  }
  if (texts.bnc25k !== undefined) {
    assertSourcePayload('bnc25k', texts.bnc25k);
    snapshots.bnc = parseBncFamilies(texts.bnc25k);
    requireUnits('bnc25k', snapshots.bnc.families.length);
    diagnostics.push(...snapshots.bnc.diagnostics);
    sources.push('bnc25k');
  }
  if (texts.cet2016 !== undefined) {
    assertSourcePayload('cet2016', texts.cet2016);
    snapshots.cet = parseCetSyllabus(texts.cet2016);
    requireUnits('cet2016', snapshots.cet.entries.length);
    diagnostics.push(...snapshots.cet.diagnostics);
    sources.push('cet2016');
  }

  if (sources.length === 0) {
    throw new SourceLoadError('no_sources', 'no source text was provided');
  }
  return { index: buildLexicalIndex(snapshots), sources, diagnostics };
}

/**
 * A payload that yields no usable unit is unusable as a whole (adapter contract), so the app keeps
 * its previous data instead of showing a silently empty source.
 */
function requireUnits(sourceId: SourceId, units: number): void {
  if (units === 0) throw new SourceFormatError(sourceId, 'no valid units found');
}
