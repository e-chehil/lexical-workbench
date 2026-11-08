/**
 * Lexical Workbench 2.0 — worker RPC method table (append-only).
 *
 * One line per method, in the order of `LexicalEngineApi`. Later tasks append their method here
 * and register the handler group next to the core group in `engine.worker.ts`:
 *   - V2-T08 adds `insights`,
 *   - V2-T13 adds `setCustomSource` (which today is a worker control method, see below).
 * `assembleHandlers` fails fast when a declared method has no handler, so a forgotten
 * registration cannot silently produce `unknown_method` at runtime.
 */
import type { LexicalEngineApi } from '../contracts.ts';
import { EngineError, type EngineHandlers } from './handlers.ts';

export type EngineMethod = keyof LexicalEngineApi;

/** Every method the worker answers; mirrors `LexicalEngineApi`. Append-only. */
export const ENGINE_METHODS = [
  'ready',
  'query',
  'rows',
  'project',
  'compare',
  'formDetail',
  'familyDetail',
  'alignment',
  'syncLearning',
  'plan',
] as const satisfies readonly EngineMethod[];

/**
 * Worker control methods: they change the index itself and are therefore handled by the worker
 * entry, not by a `LexicalEngineApi` handler. `setCustomSource` becomes a typed API method in
 * V2-T13 (Data Studio), where the text is persisted before it is sent.
 */
export const CONTROL_METHODS = ['setCustomSource'] as const;

export type ControlMethod = (typeof CONTROL_METHODS)[number];

export function isEngineMethod(method: string): method is EngineMethod {
  return (ENGINE_METHODS as readonly string[]).includes(method);
}

export function isControlMethod(method: string): method is ControlMethod {
  return (CONTROL_METHODS as readonly string[]).includes(method);
}

/** A partial table a task contributes (core in T03, insights in T08, …). */
export type HandlerGroup = Partial<EngineHandlers>;

/** Merges handler groups and verifies that every declared method is covered exactly once. */
export function assembleHandlers(...groups: readonly HandlerGroup[]): EngineHandlers {
  const merged: Record<string, unknown> = {};
  for (const group of groups) {
    for (const [method, handler] of Object.entries(group)) {
      if (typeof handler !== 'function') continue;
      if (method in merged) throw new EngineError('duplicate_handler', `handler registered twice: ${method}`);
      merged[method] = handler;
    }
  }
  const missing = ENGINE_METHODS.filter((method) => typeof merged[method] !== 'function');
  if (missing.length > 0) {
    throw new EngineError('incomplete_handlers', `missing handlers: ${missing.join(', ')}`);
  }
  return merged as EngineHandlers;
}
