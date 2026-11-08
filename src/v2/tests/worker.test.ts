/**
 * Engine worker tests (real COCA 2020 + BNC/COCA 25k + CET 2016 data).
 *
 * Three layers are covered without a browser:
 *   1. `createEngineHandlers` + `dispatchMessage` — the RPC surface and its error envelopes;
 *   2. `loadBrowser` — URL resolution under a sub-path deployment and load failures;
 *   3. `createEngineWorkerRuntime` + `EngineClient` — build-once/lazy-retry/rebuild policy and the
 *      promise plumbing (request ids, error reconstruction, worker failure) via a fake worker.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullIndex, readDataFile, DATA_FILES } from '../node/loadSources.ts';
import { refs } from '../domain/ids.ts';
import type { SourceId } from '../domain/ids.ts';
import type { LearningRecord } from '../learning/model.ts';
import { EngineError, createEngineHandlers, dispatchMessage, serializeError } from '../worker/handlers.ts';
import { assembleHandlers, ENGINE_METHODS, isControlMethod, isEngineMethod } from '../worker/registry.ts';
import {
  SOURCE_FILES,
  SourceLoadError,
  assertSourcePayload,
  buildIndexFromTexts,
  loadSourceTexts,
  looksLikeHtml,
  resolvePublicUrl,
  type SourceTexts,
} from '../worker/loadBrowser.ts';
import { attachEngineWorker, createEngineWorkerRuntime, type EngineRuntime, type WorkerScope } from '../worker/engine.worker.ts';
import { EngineClient, EngineClientError, type WorkerLike } from '../worker/client.ts';
import type { EngineRequestMessage, EngineResponseMessage } from '../worker/handlers.ts';

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

/** Loader that reads the real files from disk, with an optional override per source. */
function realLoader(overrides: SourceTexts): Promise<Record<SourceId, string>> {
  return Promise.resolve({
    coca2020: overrides.coca2020 ?? readDataFile(DATA_FILES.coca2020),
    bnc25k: overrides.bnc25k ?? readDataFile(DATA_FILES.bnc25k),
    cet2016: overrides.cet2016 ?? readDataFile(DATA_FILES.cet2016),
  });
}

// ---------------------------------------------------------------------------
// Handlers (pure dispatcher)
// ---------------------------------------------------------------------------

test('handlers: ready/query/rows/project/compare/formDetail/familyDetail answer the contract', async () => {
  const handlers = createEngineHandlers(index, {
    info: { sources: ['coca2020', 'bnc25k', 'cet2016'], diagnostics: [], buildMs: 1234 },
  });

  const ready = await handlers.ready();
  assert.deepEqual(ready.sources, ['coca2020', 'bnc25k', 'cet2016']);
  assert.deepEqual(ready.diagnostics, []);
  assert.equal(ready.buildMs, 1234);

  const query = await handlers.query({
    kind: 'coca_lemma_pos',
    filters: [{ type: 'metric_range', metric: 'coca2020.lp_rank', max: 10 }],
    sort: [{ by: 'metric', metric: 'coca2020.lp_rank', dir: 'asc' }],
    page: { offset: 0, limit: 5 },
  });
  assert.equal(query.total, 10);
  assert.equal(query.refs[0], 'coca2020:lp:the|article');

  const rows = await handlers.rows({
    query: { kind: 'form', text: { q: 'work', mode: 'exact' } },
    columns: ['bnc25k.member_freq'],
  });
  assert.equal(rows.total, 1);
  assert.equal(rows.rows[0].label, 'work');
  assert.equal(rows.rows[0].metrics[0].value, 90756);

  const headwords = await handlers.project([refs.bncFamily('go')], 'coca_headword');
  assert.ok(headwords.includes('coca2020:hw:go'));
  assert.ok(!headwords.some((r) => r.endsWith(':went')), 'projection never invents morphology');

  // A CET entry links every spelling of its line (headword + derivatives), so the comparison
  // reports the derivative as A-only while the headword Form is shared.
  const comparison = await handlers.compare([refs.cetEntry('work')], [refs.form('work')], 'form');
  assert.deepEqual(comparison, { kind: 'form', onlyA: ['f:worker'], onlyB: [], both: ['f:work'] });

  const form = await handlers.formDetail(refs.form('work'));
  assert.ok(form);
  assert.equal(form.coca?.records.length, 2);
  assert.equal(form.bnc.length, 1);
  assert.equal(form.cet.length, 1);

  const family = await handlers.familyDetail(refs.bncFamily('work'));
  assert.ok(family);
  assert.equal(family.members.length, 15);
});

test('handlers: alignment is computed once and matches the pinned real-data numbers', async () => {
  const handlers = createEngineHandlers(index);
  const first = await handlers.alignment();
  const second = await handlers.alignment();
  assert.equal(first.venn.coca_only, 18623);
  assert.equal(first.formCount, 94954);
  assert.equal(first, second, 'the report is cached for the life of the index');
});

test('handlers: syncLearning replaces the learning state used by filters and DTOs', async () => {
  const handlers = createEngineHandlers(index);
  const masteredQuery = {
    kind: 'form' as const,
    filters: [{ type: 'learning_status' as const, statuses: ['mastered' as const], resolution: 'own' as const }],
  };
  assert.equal((await handlers.query(masteredQuery)).total, 0, 'no records synchronised yet');

  await handlers.syncLearning([rec(refs.formTarget('work'), 'mastered')]);
  const after = await handlers.query(masteredQuery);
  assert.deepEqual(after.refs, ['f:work']);

  const form = await handlers.formDetail(refs.form('work'));
  assert.equal(form?.status.status, 'mastered');
  assert.equal(form?.coca?.records[1].status.origin, 'inherited', 'work-noun inherits the Form status');

  await handlers.syncLearning([]);
  assert.equal((await handlers.query(masteredQuery)).total, 0, 'replacing with an empty snapshot clears it');
});

test('handlers: the plan stub and query misuse travel as coded error envelopes', async () => {
  const handlers = createEngineHandlers(index);

  const sumOnLifted = await dispatchMessage(handlers, {
    id: 7,
    method: 'query',
    args: [{ kind: 'coca_lemma_pos', aggregates: [{ metric: 'coca2020.hw_freq_sum', op: 'sum' }] }],
  });
  assert.deepEqual(sumOnLifted, {
    id: 7,
    ok: false,
    error: {
      name: 'QueryError',
      message: 'sum(coca2020.hw_freq_sum) is only allowed on coca_headword queries (lifted values would double count)',
      code: 'aggregate_requires_native_metric',
    },
  });

  const plan = await dispatchMessage(handlers, { id: 8, method: 'plan', args: [{ strategy: 'coca_high_freq', size: 20 }] });
  assert.equal(plan.ok, false);
  assert.ok(plan.ok === false && plan.error.code === 'not_implemented');

  await assert.rejects(
    () => handlers.plan({ strategy: 'coca_high_freq', size: 20 }),
    (e: unknown) => e instanceof EngineError && e.code === 'not_implemented'
  );
});

test('handlers: unknown methods and malformed messages answer without throwing', async () => {
  const handlers = createEngineHandlers(index);

  const unknown = await dispatchMessage(handlers, { id: 1, method: 'nope', args: [] });
  assert.deepEqual(unknown, {
    id: 1,
    ok: false,
    error: { name: 'EngineError', message: 'unknown engine method: nope', code: 'unknown_method' },
  });

  const malformed = await dispatchMessage(handlers, { id: 2, method: 'query' } as unknown as EngineRequestMessage);
  assert.ok(malformed.ok === false && malformed.error.code === 'malformed_request');
  assert.equal(malformed.id, 2);

  const noId = await dispatchMessage(handlers, { method: 'query', args: [] } as unknown as EngineRequestMessage);
  assert.equal(noId.id, 0);

  // SourceFormatError gets a stable code so the UI can keep the previous source.
  assert.deepEqual(serializeError(new (class extends Error {
    constructor() {
      super('[coca2020] empty payload');
      this.name = 'SourceFormatError';
    }
  })()), { name: 'SourceFormatError', message: '[coca2020] empty payload', code: 'source_format_error' });
});

test('registry: every declared method must be registered exactly once', () => {
  const core = createEngineHandlers(index);
  const assembled = assembleHandlers(core);
  for (const method of ENGINE_METHODS) assert.equal(typeof assembled[method], 'function', method);
  assert.equal(ENGINE_METHODS.length, 10);
  assert.ok(isEngineMethod('rows'));
  assert.ok(!isEngineMethod('setCustomSource'), 'setCustomSource is a worker control method until T13');
  assert.ok(isControlMethod('setCustomSource'));
  assert.ok(!isControlMethod('rows'));

  assert.throws(
    () => assembleHandlers({ ready: core.ready }),
    (e: unknown) => e instanceof EngineError && e.code === 'incomplete_handlers'
  );
  assert.throws(
    () => assembleHandlers(core, { ready: core.ready }),
    (e: unknown) => e instanceof EngineError && e.code === 'duplicate_handler'
  );
});

// ---------------------------------------------------------------------------
// Browser loader
// ---------------------------------------------------------------------------

test('loadBrowser: public URLs follow the deployment base (GitHub Pages sub-path safe)', () => {
  assert.equal(resolvePublicUrl('data/coca_freq.json', '/'), '/data/coca_freq.json');
  assert.equal(resolvePublicUrl('/data/coca_freq.json', '/'), '/data/coca_freq.json');
  assert.equal(resolvePublicUrl('data/coca_freq.json', '/lexical-workbench/'), '/lexical-workbench/data/coca_freq.json');
  assert.equal(resolvePublicUrl('data/coca_freq.json', '/lexical-workbench'), '/lexical-workbench/data/coca_freq.json');
  assert.equal(resolvePublicUrl('data/BNC_COCA_lists.txt', ''), '/data/BNC_COCA_lists.txt');
  // Every source path is declared once and stays relative to the base.
  assert.deepEqual(Object.keys(SOURCE_FILES).sort(), ['bnc25k', 'cet2016', 'coca2020']);
  for (const path of Object.values(SOURCE_FILES)) assert.ok(!path.startsWith('/'), path);
});

test('loadBrowser: the three real files build the same index as the Node loader', () => {
  const built = buildIndexFromTexts({
    coca2020: readDataFile(DATA_FILES.coca2020),
    bnc25k: readDataFile(DATA_FILES.bnc25k),
    cet2016: readDataFile(DATA_FILES.cet2016),
  });
  assert.deepEqual(built.sources, ['coca2020', 'bnc25k', 'cet2016']);
  assert.equal(built.index.forms.size, index.forms.size);
  assert.equal(built.index.cocaRecords.size, index.cocaRecords.size);
  assert.equal(built.index.bncFamilies.size, index.bncFamilies.size);
  assert.equal(built.index.cetEntries.size, index.cetEntries.size);
  assert.equal(built.index.metricValue(refs.form('work'), 'coca2020.hw_freq_sum'), 1310264);
  assert.ok(built.diagnostics.every((d) => typeof d.code === 'string' && d.severity !== 'error'));
});

test('loadBrowser: overrides skip the fetch, and load failures are coded per source', async () => {
  const calls: string[] = [];
  const fakeFetch = (url: string) => {
    calls.push(url);
    return Promise.resolve(new Response(`text:${url}`, { status: 200 }));
  };

  const texts = await loadSourceTexts({
    baseUrl: '/lexical-workbench/',
    fetcher: fakeFetch as unknown as typeof fetch,
    overrides: { cet2016: 'custom cet text' },
  });
  assert.equal(texts.cet2016, 'custom cet text');
  assert.equal(texts.coca2020, 'text:/lexical-workbench/data/coca_freq.json');
  assert.equal(calls.length, 2, 'the overridden source is not fetched');

  const expectLoadError = (promise: Promise<unknown>, code: SourceLoadError['code'], sourceId?: SourceId) =>
    assert.rejects(promise, (e: unknown) => {
      assert.ok(e instanceof SourceLoadError, `expected SourceLoadError, got ${String(e)}`);
      assert.equal(e.code, code);
      if (sourceId) assert.equal(e.sourceId, sourceId);
      return true;
    });

  await expectLoadError(
    loadSourceTexts({ fetcher: ((url: string) => Promise.resolve(new Response('', { status: 404 }))) as unknown as typeof fetch }),
    'source_load_failed',
    'coca2020'
  );
  await expectLoadError(
    loadSourceTexts({ fetcher: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch }),
    'source_load_failed'
  );
  await expectLoadError(
    loadSourceTexts({
      fetcher: ((url: string) =>
        Promise.resolve(new Response(url.includes('coca') ? '{}' : '   ', { status: 200 }))) as unknown as typeof fetch,
    }),
    'source_empty'
  );
  await expectLoadError(loadSourceTexts({ overrides: { coca2020: '  ' } }), 'source_empty', 'coca2020');
  await expectLoadError(Promise.resolve().then(() => buildIndexFromTexts({})), 'no_sources');
});

/** Minimal but structurally valid sample of each source (validation-path fixtures). */
const MINIMAL_COCA = '[{"headword":"work","content":[{"PoS":"noun","Rank":"1","Freq":"10"}]}]';
const MINIMAL_BNC = 'List \tHeadword \tRelated forms\tTotal frequency\n1k\twork\t"work (10)"\t10\n';
const MINIMAL_CET = 'abandon\n';

/** Exactly what a static host answers for a missing file under `navigateFallback: index.html`. */
const SPA_FALLBACK_HTML = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><script type="module" src="/assets/index.js"></script></head>
  <body><div id="root"></div></body>
</html>`;

/** Minimal, structurally valid text per source: the control case for "not rejected". */
const MINIMAL_TEXTS: Record<SourceId, string> = {
  coca2020: MINIMAL_COCA,
  bnc25k: MINIMAL_BNC,
  cet2016: MINIMAL_CET,
};

test('loadBrowser: an HTTP 200 HTML fallback page is refused for BNC and CET, never parsed as data', async () => {
  // Control: the same pipeline with valid texts builds all three sources.
  const healthy = buildIndexFromTexts(MINIMAL_TEXTS);
  assert.deepEqual(healthy.sources, ['coca2020', 'bnc25k', 'cet2016']);

  for (const broken of ['bnc25k', 'cet2016'] as const) {
    // The reported failure: one data file answers 200 with the SPA shell, the others are fine.
    const respond = (url: string): Response => {
      const sourceId = (Object.keys(SOURCE_FILES) as SourceId[]).find((id) => url.endsWith(SOURCE_FILES[id]))!;
      const body = sourceId === broken ? SPA_FALLBACK_HTML : MINIMAL_TEXTS[sourceId];
      return new Response(body, { status: 200, headers: { 'content-type': sourceId === broken ? 'text/html' : 'text/plain' } });
    };
    const texts = await loadSourceTexts({ fetcher: respond as unknown as typeof fetch });
    assert.ok(looksLikeHtml(texts[broken]), `${broken}: the fetched body really is the HTML page`);

    assert.throws(
      () => buildIndexFromTexts(texts),
      (e: unknown) => {
        assert.ok(e instanceof Error, `${broken}: an error must be raised`);
        assert.equal(e.name, 'SourceFormatError');
        assert.equal((e as { source?: string }).source, broken, 'the error names the offending source');
        assert.match(e.message, /HTML page/i);
        return true;
      },
      `${broken}: an HTML fallback page must not be reported as a loaded source`
    );
  }
});

test('loadBrowser: a per-source shape check rejects substituted payloads but keeps real files', async () => {
  // Real files pass the guard (no false rejection), so the accepted-set is not narrowed.
  for (const [sourceId, file] of [
    ['coca2020', DATA_FILES.coca2020],
    ['bnc25k', DATA_FILES.bnc25k],
    ['cet2016', DATA_FILES.cet2016],
  ] as [SourceId, string][]) {
    assert.doesNotThrow(() => assertSourcePayload(sourceId, readDataFile(file)), `${sourceId} real file`);
  }
  for (const [sourceId, text] of [
    ['coca2020', MINIMAL_COCA],
    ['bnc25k', MINIMAL_BNC],
    ['cet2016', MINIMAL_CET],
  ] as [SourceId, string][]) {
    assert.doesNotThrow(() => assertSourcePayload(sourceId, text), `${sourceId} minimal valid sample`);
  }

  // HTML is refused for every source, with the source id preserved in the message.
  for (const sourceId of ['coca2020', 'bnc25k', 'cet2016'] as const) {
    assert.throws(
      () => assertSourcePayload(sourceId, SPA_FALLBACK_HTML),
      (e: unknown) => e instanceof Error && e.message.startsWith(`[${sourceId}]`) && /HTML page/i.test(e.message)
    );
  }

  // Other sources' formats are refused too (a 200 alone proves nothing).
  assert.throws(
    () => assertSourcePayload('bnc25k', MINIMAL_COCA),
    (e: unknown) => e instanceof Error && e.name === 'SourceFormatError' && /band-prefixed/i.test(e.message)
  );
  assert.throws(
    () => assertSourcePayload('coca2020', MINIMAL_BNC),
    (e: unknown) => e instanceof Error && e.name === 'SourceFormatError' && /JSON array/i.test(e.message)
  );

  // A payload that merely yields no units still fails at the adapter boundary (unchanged behaviour).
  assert.throws(
    () => buildIndexFromTexts({ coca2020: '[]' }),
    (e: unknown) => e instanceof Error && e.name === 'SourceFormatError' && /no valid units/.test(e.message)
  );
});

test('loadBrowser: an unusable payload throws SourceFormatError instead of half-building', () => {
  // Wrong root shape → the adapter refuses the payload.
  assert.throws(
    () => buildIndexFromTexts({ coca2020: '{"headword":"x"}' }),
    (e: unknown) => e instanceof Error && e.name === 'SourceFormatError'
  );
  // Valid shape but zero usable units → the load boundary refuses it too.
  for (const texts of [{ coca2020: '[]' }, { bnc25k: 'not a family line' }]) {
    assert.throws(
      () => buildIndexFromTexts(texts),
      (e: unknown) => e instanceof Error && e.name === 'SourceFormatError',
      JSON.stringify(texts)
    );
  }
});

// ---------------------------------------------------------------------------
// Worker runtime (build policy)
// ---------------------------------------------------------------------------

test('runtime: concurrent requests share one build; the learning state is kept', async () => {
  let builds = 0;
  const runtime = createEngineWorkerRuntime({
    loadSources: (overrides) => {
      builds++;
      return realLoader(overrides);
    },
  });

  const [a, b, c] = await Promise.all([
    runtime.handle({ id: 1, method: 'ready', args: [] }),
    runtime.handle({ id: 2, method: 'ready', args: [] }),
    runtime.handle({ id: 3, method: 'query', args: [{ kind: 'form', text: { q: 'work', mode: 'exact' } }] }),
  ]);
  assert.equal(builds, 1, 'three concurrent requests must not build three indexes');
  assert.ok(a.ok && b.ok && c.ok);
  assert.deepEqual(a.ok && a.value, b.ok && b.value);
  assert.ok(a.ok && (a.value as { sources: string[] }).sources.length === 3);
  assert.ok(c.ok && (c.value as { total: number }).total === 1);

  const ready = a.ok ? (a.value as { diagnostics: unknown[]; buildMs: number }) : null;
  assert.ok(ready && ready.buildMs >= 0);
  assert.ok(Array.isArray(ready.diagnostics));
});

test('runtime: a failed load is reported and retried, not cached', async () => {
  let attempt = 0;
  const runtime = createEngineWorkerRuntime({
    loadSources: (overrides) => {
      attempt++;
      if (attempt === 1) return Promise.reject(new Error('offline'));
      return realLoader(overrides);
    },
  });

  const failed = await runtime.handle({ id: 1, method: 'query', args: [{ kind: 'form' }] });
  assert.equal(failed.ok, false);
  assert.ok(failed.ok === false && failed.error.message.includes('offline'));

  const retried = await runtime.handle({ id: 2, method: 'query', args: [{ kind: 'form' }] });
  assert.ok(retried.ok, 'the next request rebuilds instead of staying broken');
  assert.equal(attempt, 2);
});

test('runtime: unknown methods and malformed envelopes never trigger a build', async () => {
  let builds = 0;
  const runtime = createEngineWorkerRuntime({
    loadSources: () => {
      builds++;
      return Promise.reject(new Error('must not be called'));
    },
  });

  const unknown = await runtime.handle({ id: 1, method: 'nope', args: [] });
  assert.ok(unknown.ok === false && unknown.error.code === 'unknown_method');

  const malformed = await runtime.handle({ id: 2, method: 'query' } as unknown as EngineRequestMessage);
  assert.ok(malformed.ok === false && malformed.error.code === 'malformed_request');

  assert.equal(builds, 0);
});

test('runtime: setCustomSource rebuilds, keeps learning state, and never loses the old index', async () => {
  let builds = 0;
  let failNext = false;
  const runtime = createEngineWorkerRuntime({
    loadSources: (overrides) => {
      builds++;
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error('custom text unusable'));
      }
      return realLoader(overrides);
    },
  });

  // 1st build: real data.
  const first = await runtime.handle({ id: 1, method: 'ready', args: [] });
  assert.ok(first.ok);
  await runtime.handle({ id: 2, method: 'syncLearning', args: [[rec(refs.formTarget('work'), 'mastered')]] });

  // 2nd build: replace the CET text with a minimal valid syllabus.
  const replaced = await runtime.handle({
    id: 3,
    method: 'setCustomSource',
    args: ['cet2016', 'abandon\nabsolute\n'],
  });
  assert.ok(replaced.ok, JSON.stringify(replaced));
  assert.equal(builds, 2);

  // The rebuilt index uses the custom CET data but keeps the synchronised learning state.
  const cetAfter = await runtime.handle({ id: 4, method: 'query', args: [{ kind: 'cet_entry' }] });
  assert.ok(cetAfter.ok && (cetAfter.value as { total: number }).total === 2);
  const mastered = await runtime.handle({
    id: 5,
    method: 'query',
    args: [{ kind: 'form', filters: [{ type: 'learning_status', statuses: ['mastered'], resolution: 'own' }] }],
  });
  assert.ok(mastered.ok && (mastered.value as { total: number }).total === 1, 'learning state survives the rebuild');
  const ready = await runtime.handle({ id: 6, method: 'ready', args: [] });
  assert.ok(ready.ok && (ready.value as { diagnostics: unknown[] }).diagnostics !== undefined);

  // A failed rebuild reports the error and leaves the previous index in service.
  failNext = true;
  const rejectedCustom = await runtime.handle({ id: 7, method: 'setCustomSource', args: ['cet2016', 'zzzz'] });
  assert.equal(rejectedCustom.ok, false);
  const stillWorks = await runtime.handle({ id: 8, method: 'query', args: [{ kind: 'cet_entry' }] });
  assert.ok(stillWorks.ok && (stillWorks.value as { total: number }).total === 2);

  // Invalid arguments are rejected before any build.
  const badSource = await runtime.handle({ id: 9, method: 'setCustomSource', args: ['nope', 'text'] });
  assert.ok(badSource.ok === false && badSource.error.code === 'invalid_source');
  const emptyText = await runtime.handle({ id: 10, method: 'setCustomSource', args: ['cet2016', '   '] });
  assert.ok(emptyText.ok === false && emptyText.error.code === 'invalid_custom_source');
  assert.equal(builds, 3, 'failed rebuild + invalid arguments did not add builds beyond the attempt');

  // A custom payload that is an HTML page (SPA fallback) is refused by the shape guard, and the
  // previous index keeps serving: `setCustomSource` must not report success for it.
  const htmlCustom = await runtime.handle({ id: 11, method: 'setCustomSource', args: ['cet2016', SPA_FALLBACK_HTML] });
  assert.equal(htmlCustom.ok, false);
  assert.ok(htmlCustom.ok === false && htmlCustom.error.code === 'source_format_error');
  assert.match(htmlCustom.ok === false ? htmlCustom.error.message : '', /^\[cet2016\].*HTML page/i);
  const stillTwo = await runtime.handle({ id: 12, method: 'query', args: [{ kind: 'cet_entry' }] });
  assert.ok(stillTwo.ok && (stillTwo.value as { total: number }).total === 2, 'the rejected payload did not replace the index');
  assert.equal(builds, 4, 'the HTML attempt is parsed and refused, so it counts as one build');
});

test('attachEngineWorker: a worker scope receives responses for every request', async () => {
  const posted: EngineResponseMessage[] = [];
  const scope: WorkerScope = { onmessage: null, postMessage: (message) => posted.push(message as EngineResponseMessage) };
  attachEngineWorker(scope, { loadSources: realLoader });

  scope.onmessage!({ data: { id: 42, method: 'ready', args: [] } });
  scope.onmessage!({ data: 'garbage' });
  await new Promise((resolve) => setTimeout(resolve, 1500));

  assert.equal(posted.length, 1, 'malformed event data is ignored, valid requests are answered');
  assert.equal(posted[0].id, 42);
  assert.ok(posted[0].ok);
});

// ---------------------------------------------------------------------------
// Client (RPC plumbing)
// ---------------------------------------------------------------------------

class FakeWorker implements WorkerLike {
  readonly posted: EngineRequestMessage[] = [];
  terminated = false;
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(private readonly runtime?: EngineRuntime) {}

  postMessage(message: unknown): void {
    const request = message as EngineRequestMessage;
    this.posted.push(request);
    if (this.runtime) {
      void this.runtime.handle(request).then((response) => this.emit('message', { data: response }));
    }
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

test('client: resolves concurrent requests by id and forwards the whole API', async () => {
  const worker = new FakeWorker(createEngineWorkerRuntime({ loadSources: realLoader }));
  const client = new EngineClient({ worker });

  const [ready, query, form] = await Promise.all([
    client.ready(),
    client.query({ kind: 'coca_lemma_pos', text: { q: 'the', mode: 'exact' } }),
    client.formDetail(refs.form('work')),
  ]);
  assert.deepEqual(ready.sources, ['coca2020', 'bnc25k', 'cet2016']);
  assert.ok(query.total >= 1);
  assert.equal(form?.coca?.records.length, 2);

  assert.deepEqual(
    worker.posted.map((m) => m.method),
    ['ready', 'query', 'formDetail'],
    'each call is one envelope'
  );
  assert.equal(new Set(worker.posted.map((m) => m.id)).size, 3, 'request ids are unique');
  assert.equal(client.pendingCount, 0);
});

test('client: responses are matched by id even when they arrive out of order', async () => {
  const worker = new FakeWorker();
  const client = new EngineClient({ worker });

  const first = client.query({ kind: 'form' });
  const second = client.alignment();
  const [firstId, secondId] = worker.posted.map((m) => m.id);

  worker.emit('message', { data: { id: secondId, ok: true, value: { pinned: true } } });
  worker.emit('message', { data: { id: firstId, ok: true, value: { kind: 'form', total: 94954, refs: [], aggregates: [] } } });

  assert.equal((await second as unknown as { pinned: boolean }).pinned, true);
  assert.equal((await first).total, 94954);
  worker.emit('message', { data: { id: 999, ok: true, value: null } }); // unknown id is ignored
  assert.equal(client.pendingCount, 0);
});

test('client: errors keep name and code, worker crashes reject pending calls', async () => {
  const worker = new FakeWorker(createEngineWorkerRuntime({ loadSources: realLoader }));
  const crashes: EngineClientError[] = [];
  const client = new EngineClient({ worker, onWorkerError: (error) => crashes.push(error) });

  const misused = client.query({ kind: 'coca_lemma_pos', aggregates: [{ metric: 'coca2020.hw_freq_sum', op: 'sum' }] });
  await assert.rejects(misused, (e: unknown) => {
    assert.ok(e instanceof EngineClientError);
    assert.equal(e.code, 'aggregate_requires_native_metric');
    assert.equal(e.name, 'QueryError');
    return true;
  });

  const planned = client.plan({ strategy: 'coca_high_freq', size: 20 });
  await assert.rejects(planned, (e: unknown) => e instanceof EngineClientError && e.code === 'not_implemented');

  // A worker-level failure rejects everything in flight instead of hanging.
  const pending = client.query({ kind: 'form' });
  worker.emit('error', { message: 'worker crashed' });
  await assert.rejects(pending, (e: unknown) => e instanceof EngineClientError && e.code === 'worker_error');
  assert.equal(crashes.length, 1);
  assert.equal(client.pendingCount, 0);

  // The client stays usable after a crash report only in the sense that it rejects explicitly.
  client.terminate();
  assert.equal(worker.terminated, true);
  await assert.rejects(() => client.ready(), (e: unknown) => e instanceof EngineClientError && e.code === 'worker_terminated');
});

test('client: a postMessage failure rejects that request and stops tracking it', async () => {
  const worker: WorkerLike = {
    postMessage: () => {
      throw new Error('detached');
    },
    addEventListener: () => undefined,
    terminate: () => undefined,
  };
  const client = new EngineClient({ worker });
  await assert.rejects(
    () => client.ready(),
    (e: unknown) => e instanceof EngineClientError && e.code === 'worker_post_failed'
  );
  assert.equal(client.pendingCount, 0);
});

test('client: setCustomSource reaches the worker control method', async () => {
  const worker = new FakeWorker(createEngineWorkerRuntime({ loadSources: realLoader }));
  const client = new EngineClient({ worker });

  const result = await client.setCustomSource('cet2016', 'abandon\nabsolute\n');
  assert.equal(result.custom, true);
  assert.equal(result.sourceId, 'cet2016');
  const cet = await client.query({ kind: 'cet_entry' });
  assert.equal(cet.total, 2);
  await assert.rejects(
    () => client.setCustomSource('nope' as SourceId, 'text'),
    (e: unknown) => e instanceof EngineClientError && e.code === 'invalid_source'
  );
});
