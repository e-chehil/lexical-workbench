/**
 * Lexical Workbench 2.0 — worker-side engine handlers (pure, no DOM, no Dexie).
 *
 * `createEngineHandlers` binds one `LexicalIndex` (plus the synchronised learning state) to the
 * `LexicalEngineApi` contract. `dispatchMessage` is the message-envelope layer: the worker entry
 * only moves bytes, so the whole RPC surface is testable in Node without a browser.
 *
 * The index is never serialised across the boundary: callers receive DTOs and refs only.
 */
import { computeAlignmentReport, type AlignmentReport } from '../engine/alignment.ts';
import { buildFamilyDetail, buildFormDetail, buildRows } from '../engine/dto.ts';
import type { LexicalIndex } from '../engine/lexicalIndex.ts';
import { compareRefSets, projectRefs, runQuery, type QueryContext } from '../engine/query.ts';
import { InMemoryLearningState, type LearningRecord, type LearningStateReader } from '../learning/model.ts';
import type { SourceId } from '../domain/ids.ts';
import type { SourceDiagnostic } from '../domain/types.ts';
import type { LexicalEngineApi } from '../contracts.ts';

/**
 * Learning state as seen by the worker: queries read through it, `syncLearning` replaces its
 * contents in place, so a rebuilt index keeps the state the main thread last sent.
 */
export class MutableLearningState implements LearningStateReader {
  private state: InMemoryLearningState;

  constructor(records: Iterable<LearningRecord> = []) {
    this.state = new InMemoryLearningState(records);
  }

  get(target: Parameters<LearningStateReader['get']>[0]) {
    return this.state.get(target);
  }

  all(): Iterable<LearningRecord> {
    return this.state.all();
  }

  replace(records: Iterable<LearningRecord>): void {
    this.state = new InMemoryLearningState(records);
  }
}

/** Error carrying a stable machine code so the client can branch on it after deserialisation. */
export class EngineError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface EngineInfo {
  sources: SourceId[];
  diagnostics: SourceDiagnostic[];
  buildMs: number;
}

export interface EngineHandlersOptions {
  /** What `ready()` reports (filled by the worker after building the index). */
  info?: EngineInfo;
  /** Shared with the worker so a rebuild keeps the last synchronised learning state. */
  learning?: MutableLearningState;
}

export type EngineHandlers = {
  [K in keyof LexicalEngineApi]: (
    ...args: Parameters<LexicalEngineApi[K]>
  ) => ReturnType<LexicalEngineApi[K]>;
};

export function createEngineHandlers(index: LexicalIndex, options: EngineHandlersOptions = {}): EngineHandlers {
  const learning = options.learning ?? new MutableLearningState();
  const info: EngineInfo = options.info ?? { sources: [], diagnostics: [], buildMs: 0 };
  const ctx: QueryContext = { index, learning };
  /** Alignment is computed from immutable data, so it is cached for the life of this index. */
  let alignment: AlignmentReport | null = null;

  return {
    async ready() {
      return { sources: [...info.sources], diagnostics: [...info.diagnostics], buildMs: info.buildMs };
    },
    async query(q) {
      return runQuery(ctx, q);
    },
    async rows(req) {
      return buildRows(ctx, req);
    },
    async project(refs, to) {
      return projectRefs(index, refs, to);
    },
    async compare(a, b, at) {
      return compareRefSets(index, a, b, at);
    },
    async formDetail(formRef) {
      return buildFormDetail(ctx, formRef);
    },
    async familyDetail(familyRef) {
      return buildFamilyDetail(ctx, familyRef);
    },
    async alignment() {
      alignment ??= computeAlignmentReport(index);
      return alignment;
    },
    async syncLearning(records) {
      learning.replace(records);
    },
    async plan() {
      // Implemented by V2-T09; the client surfaces `code: 'not_implemented'` until then.
      throw new EngineError('not_implemented', 'study planner is not implemented yet');
    },
  };
}

// ---------------------------------------------------------------------------
// Message envelope (CONTRACTS §9)
// ---------------------------------------------------------------------------

export interface EngineRequestMessage {
  id: number;
  method: string;
  args: unknown[];
}

export interface SerializedEngineError {
  name: string;
  message: string;
  code?: string;
}

export type EngineResponseMessage =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: SerializedEngineError };

/**
 * Errors cross the boundary as data. `code` is preserved when present; a `SourceFormatError`
 * gets the stable code `source_format_error` so the UI can keep the previous source.
 */
export function serializeError(error: unknown): SerializedEngineError {
  if (error instanceof Error) {
    const withCode = error as { code?: unknown };
    const code = typeof withCode.code === 'string' ? withCode.code : undefined;
    return {
      name: error.name,
      message: error.message,
      code: code ?? (error.name === 'SourceFormatError' ? 'source_format_error' : undefined),
    };
  }
  return { name: 'Error', message: String(error) };
}

/**
 * Runs one envelope against a handler table. Never throws: a malformed message, an unknown
 * method or a failing handler all become an `ok: false` envelope with the same request id.
 */
export async function dispatchMessage(
  handlers: EngineHandlers,
  message: EngineRequestMessage
): Promise<EngineResponseMessage> {
  const id = typeof message?.id === 'number' ? message.id : 0;
  try {
    if (!message || typeof message.method !== 'string' || !Array.isArray(message.args)) {
      throw new EngineError('malformed_request', 'message must be { id, method, args[] }');
    }
    const handler = (handlers as Record<string, unknown>)[message.method];
    if (typeof handler !== 'function') {
      throw new EngineError('unknown_method', `unknown engine method: ${message.method}`);
    }
    const value = await (handler as (...args: unknown[]) => unknown)(...message.args);
    return { id, ok: true, value };
  } catch (error) {
    return { id, ok: false, error: serializeError(error) };
  }
}
