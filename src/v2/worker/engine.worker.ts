/**
 * Lexical Workbench 2.0 — engine Web Worker (ARCHITECTURE §8.1, ADR-007).
 *
 * Owns the single `LexicalIndex` of the session: fetches the three source texts, parses them and
 * builds the index off the main thread, then answers the RPC envelopes of `handlers.ts`.
 *
 * Build policy:
 *   - the index is built lazily and exactly once; concurrent callers share one build,
 *   - builds are serialised through one queue, so an in-flight build can never overwrite the
 *     result of a newer build (`setCustomSource`),
 *   - a failed build caches nothing, so the next request retries (a transient fetch failure does
 *     not brick the session) while every pending caller receives an error envelope,
 *   - the synchronised learning state lives in a `MutableLearningState` outside the build and
 *     therefore survives a rebuild.
 *
 * The runtime is a factory so Node tests can drive the exact same code with an injected loader;
 * the module only binds it to `self` when it is actually loaded as a worker.
 */
import type { SourceId } from '../domain/ids.ts';
import { SOURCE_IDS } from '../domain/ids.ts';
import {
  EngineError,
  MutableLearningState,
  createEngineHandlers,
  serializeError,
  type EngineHandlers,
  type EngineRequestMessage,
  type EngineResponseMessage,
} from './handlers.ts';
import { buildIndexFromTexts, loadSourceTexts, type SourceTexts } from './loadBrowser.ts';
import { assembleHandlers, isControlMethod, isEngineMethod, type ControlMethod } from './registry.ts';

/** Minimal worker global shape; this project compiles against the DOM lib, not the webworker lib. */
export interface WorkerScope {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
}

export interface EngineRuntimeDeps {
  /** Injection seam for tests (defaults to the real browser loader). */
  loadSources?: (overrides: SourceTexts) => Promise<Record<SourceId, string>>;
}

export interface SetCustomSourceResult {
  sourceId: SourceId;
  custom: true;
  buildMs: number;
}

export interface EngineRuntime {
  /** Envelope in, envelope out. Never throws: failures become `ok: false` responses. */
  handle(message: EngineRequestMessage): Promise<EngineResponseMessage>;
}

export function createEngineWorkerRuntime(deps: EngineRuntimeDeps = {}): EngineRuntime {
  const load = deps.loadSources ?? ((overrides: SourceTexts) => loadSourceTexts({ overrides }));
  /** One instance for the whole session: rebuilt indexes keep the same learning state. */
  const learning = new MutableLearningState();

  let overrides: SourceTexts = {};
  let handlers: EngineHandlers | null = null;

  /** FIFO build queue: builds never interleave, so the last committed build is the newest. */
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function build(withOverrides: SourceTexts): Promise<{ handlers: EngineHandlers; buildMs: number }> {
    const started = performance.now();
    const texts = await load(withOverrides);
    const built = buildIndexFromTexts(texts);
    const buildMs = performance.now() - started;
    return {
      buildMs,
      handlers: assembleHandlers(
        createEngineHandlers(built.index, {
          info: { sources: built.sources, diagnostics: built.diagnostics, buildMs },
          learning,
        })
      ),
    };
  }

  /** Current handler table, building it once even when several requests arrive together. */
  function engine(): Promise<EngineHandlers> {
    if (handlers) return Promise.resolve(handlers);
    return enqueue(async () => {
      if (handlers) return handlers; // a queued build already succeeded
      const built = await build(overrides);
      handlers = built.handlers;
      return handlers;
    });
  }

  /** `setCustomSource(sourceId, text)`: rebuild first, commit the override only on success. */
  function setCustomSource(sourceId: SourceId, text: string): Promise<SetCustomSourceResult> {
    const candidate: SourceTexts = { ...overrides, [sourceId]: text };
    return enqueue(async () => {
      const built = await build(candidate);
      overrides = candidate;
      handlers = built.handlers;
      return { sourceId, custom: true as const, buildMs: built.buildMs };
    });
  }

  async function runControl(method: ControlMethod, args: unknown[]): Promise<unknown> {
    const [first, second] = args;
    if (method === 'setCustomSource') {
      if (typeof first !== 'string' || !(SOURCE_IDS as readonly string[]).includes(first)) {
        throw new EngineError('invalid_source', `unknown source id: ${String(first)}`);
      }
      if (typeof second !== 'string' || second.trim().length === 0) {
        throw new EngineError('invalid_custom_source', 'custom source text must be a non-empty string');
      }
      return setCustomSource(first as SourceId, second);
    }
    throw new EngineError('unknown_method', `unknown control method: ${String(method)}`);
  }

  async function reply(id: number, call: () => Promise<unknown>): Promise<EngineResponseMessage> {
    try {
      return { id, ok: true, value: await call() };
    } catch (error) {
      return { id, ok: false, error: serializeError(error) };
    }
  }

  return {
    async handle(message) {
      const method = message?.method;
      if (!message || typeof message.id !== 'number' || typeof method !== 'string' || !Array.isArray(message.args)) {
        return { id: typeof message?.id === 'number' ? message.id : 0, ok: false, error: serializeError(new EngineError('malformed_request', 'message must be { id, method, args[] }')) };
      }
      if (isControlMethod(method)) return reply(message.id, () => runControl(method, message.args));
      if (!isEngineMethod(method)) {
        // Reject before building: an unknown method must not pay for the index.
        return {
          id: message.id,
          ok: false,
          error: { name: 'EngineError', message: `unknown engine method: ${method}`, code: 'unknown_method' },
        };
      }
      return reply(message.id, async () => {
        const table = await engine();
        // The envelope carries untyped arguments; each handler validates what it needs.
        const handler = table[method] as unknown as (...args: unknown[]) => Promise<unknown>;
        return handler(...message.args);
      });
    },
  };
}

/** Binds a runtime to a worker global; only used when this module is loaded as a worker. */
export function attachEngineWorker(scope: WorkerScope, deps: EngineRuntimeDeps = {}): EngineRuntime {
  const runtime = createEngineWorkerRuntime(deps);
  scope.onmessage = (event) => {
    const data = event.data as Partial<EngineRequestMessage> | undefined;
    // Nothing to answer without a request id; the runtime rejects malformed shapes it can address.
    if (!data || typeof data.id !== 'number' || typeof data.method !== 'string') return;
    void runtime.handle(data as EngineRequestMessage).then((response) => scope.postMessage(response));
  };
  return runtime;
}

/**
 * True only inside a worker global: workers expose `postMessage` and have no `document`, whereas a
 * window has both. A stray main-thread import must not hijack `window.onmessage`.
 */
const globalScope = typeof self !== 'undefined' ? (self as unknown as { document?: unknown; postMessage?: unknown }) : null;
const inWorkerScope = Boolean(globalScope && globalScope.document === undefined && typeof globalScope.postMessage === 'function');
if (inWorkerScope) attachEngineWorker(self as unknown as WorkerScope);
