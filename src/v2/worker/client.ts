/**
 * Lexical Workbench 2.0 — main-thread RPC client for the engine worker.
 *
 * A promise-based proxy over the message envelope of `handlers.ts`: every call gets a request id
 * and resolves when the matching response arrives, so concurrent queries cannot be mixed up.
 * Errors arrive as data and are re-thrown as `EngineClientError` carrying the original `name` and
 * `code`, which lets callers branch on `code` (e.g. `aggregate_requires_native_metric`,
 * `not_implemented`, `source_format_error`) without inspecting messages.
 *
 * The worker reference is injectable, so the whole RPC path is testable in Node with a fake worker.
 */
import type { LexicalEngineApi } from '../contracts.ts';
import type { EngineResponseMessage, SerializedEngineError } from './handlers.ts';
import type { SourceId } from '../domain/ids.ts';

/** The slice of the DOM `Worker` this client needs. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  terminate(): void;
}

export interface WorkerMessageEvent {
  data: unknown;
}

export interface WorkerFailureEvent {
  message?: string;
}

/** An engine error after deserialisation: `code` is the machine-readable reason. */
export class EngineClientError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    name = 'EngineError'
  ) {
    super(message);
    this.name = name;
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export interface EngineClientOptions {
  /** Injected for tests; by default a module worker of `engine.worker.ts`. */
  worker?: WorkerLike;
  /** Observes worker crashes (a per-request error also rejects the pending calls). */
  onWorkerError?: (error: EngineClientError) => void;
}

export class EngineClient implements LexicalEngineApi {
  private readonly worker: WorkerLike;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly onWorkerError?: (error: EngineClientError) => void;
  private nextId = 1;
  private terminated = false;

  constructor(options: EngineClientOptions = {}) {
    this.worker = options.worker ?? createEngineWorker();
    this.onWorkerError = options.onWorkerError;
    this.worker.addEventListener('message', (event: unknown) => this.handleMessage(event as WorkerMessageEvent));
    this.worker.addEventListener('error', (event: unknown) => this.handleFailure(event as WorkerFailureEvent));
    this.worker.addEventListener('messageerror', (event: unknown) => this.handleFailure(event as WorkerFailureEvent));
  }

  // -------------------------------------------------------------- LexicalEngineApi

  ready() {
    return this.send<Awaited<ReturnType<LexicalEngineApi['ready']>>>('ready', []);
  }

  query(q: Parameters<LexicalEngineApi['query']>[0]) {
    return this.send<Awaited<ReturnType<LexicalEngineApi['query']>>>('query', [q]);
  }

  rows(req: Parameters<LexicalEngineApi['rows']>[0]) {
    return this.send<Awaited<ReturnType<LexicalEngineApi['rows']>>>('rows', [req]);
  }

  project(refs: Parameters<LexicalEngineApi['project']>[0], to: Parameters<LexicalEngineApi['project']>[1]) {
    return this.send<Awaited<ReturnType<LexicalEngineApi['project']>>>('project', [refs, to]);
  }

  compare(a: Parameters<LexicalEngineApi['compare']>[0], b: Parameters<LexicalEngineApi['compare']>[1], at: Parameters<LexicalEngineApi['compare']>[2]) {
    return this.send<Awaited<ReturnType<LexicalEngineApi['compare']>>>('compare', [a, b, at]);
  }

  formDetail(formRef: Parameters<LexicalEngineApi['formDetail']>[0]) {
    return this.send<Awaited<ReturnType<LexicalEngineApi['formDetail']>>>('formDetail', [formRef]);
  }

  familyDetail(familyRef: Parameters<LexicalEngineApi['familyDetail']>[0]) {
    return this.send<Awaited<ReturnType<LexicalEngineApi['familyDetail']>>>('familyDetail', [familyRef]);
  }

  alignment() {
    return this.send<Awaited<ReturnType<LexicalEngineApi['alignment']>>>('alignment', []);
  }

  syncLearning(records: Parameters<LexicalEngineApi['syncLearning']>[0]) {
    return this.send<Awaited<ReturnType<LexicalEngineApi['syncLearning']>>>('syncLearning', [records]);
  }

  plan(req: Parameters<LexicalEngineApi['plan']>[0]) {
    return this.send<Awaited<ReturnType<LexicalEngineApi['plan']>>>('plan', [req]);
  }

  // ------------------------------------------------------------------ control / lifecycle

  /**
   * Replaces one source text and rebuilds the worker index (Data Studio, T13). Not part of
   * `LexicalEngineApi` until T13; the promise settles after the rebuild.
   */
  setCustomSource(sourceId: SourceId, text: string) {
    return this.send<{ sourceId: SourceId; custom: true; buildMs: number }>('setCustomSource', [sourceId, text]);
  }

  /** Number of in-flight requests (diagnostics for the app shell). */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Stops the worker and rejects everything in flight. */
  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.worker.terminate();
    this.rejectAll(new EngineClientError('engine client terminated', 'worker_terminated'));
  }

  // ------------------------------------------------------------------ plumbing

  private send<T>(method: string, args: unknown[]): Promise<T> {
    if (this.terminated) {
      return Promise.reject(new EngineClientError('engine client terminated', 'worker_terminated'));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      try {
        this.worker.postMessage({ id, method, args });
      } catch (error) {
        this.pending.delete(id);
        reject(
          new EngineClientError(
            `could not post message to the engine worker: ${error instanceof Error ? error.message : String(error)}`,
            'worker_post_failed'
          )
        );
      }
    });
  }

  private handleMessage(event: WorkerMessageEvent): void {
    const message = event.data as EngineResponseMessage | undefined;
    if (!message || typeof message !== 'object' || typeof message.id !== 'number') return;
    const entry = this.pending.get(message.id);
    if (!entry) return; // late response for a request that was already rejected
    this.pending.delete(message.id);
    if (message.ok) entry.resolve(message.value);
    else entry.reject(toClientError(message.error));
  }

  private handleFailure(event: WorkerFailureEvent): void {
    const error = new EngineClientError(event.message || 'engine worker failed', 'worker_error');
    this.rejectAll(error);
    this.onWorkerError?.(error);
  }

  private rejectAll(error: EngineClientError): void {
    for (const [, entry] of this.pending) entry.reject(error);
    this.pending.clear();
  }
}

function toClientError(payload: SerializedEngineError): EngineClientError {
  return new EngineClientError(payload?.message ?? 'engine error', payload?.code, payload?.name ?? 'EngineError');
}

/** Default worker: a module worker, bundled separately by Vite. */
export function createEngineWorker(): WorkerLike {
  const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  return worker as unknown as WorkerLike;
}

export function createEngineClient(options: EngineClientOptions = {}): EngineClient {
  return new EngineClient(options);
}
