/**
 * Lexical Workbench 2.0 — hash route codec (PRODUCT_SPEC §2).
 *
 * Route format:
 *   `#/<workspace>`                        workspace, no query, no selection
 *   `#/<workspace>?q=<base64url LexQuery>` a list state that can be shared and revisited
 *   `#/<workspace>?ref=<EntityRef>`        one selected entity (Detail panel/open target)
 *
 * `q` is the UTF-8 JSON of a `LexQuery`, base64url encoded, so Unicode spellings survive
 * (`café`, `coup d'état`) without depending on URL escaping rules. `ref` is percent-encoded
 * because refs contain `|`, `:` and non-ASCII letters.
 *
 * Decoding never throws: an unknown workspace falls back to Explore and an unreadable query or
 * ref is dropped, so a stale or hand-edited link still opens a usable page.
 */
import {
  ENTITY_KINDS,
  METRICS,
  parseRef,
  type EntityKind,
  type EntityRef,
  type LexQuery,
  type MetricId,
  type QueryFilter,
  type SortSpec,
} from '../../v2/index.ts';

export const WORKSPACES = ['explore', 'corpus', 'family', 'study', 'insights', 'data'] as const;

export type WorkspaceId = (typeof WORKSPACES)[number];
export type RouteWorkspace = WorkspaceId;

export interface AppRoute {
  workspace: RouteWorkspace;
  /** List state carried by the route (dynamic result set). */
  query?: LexQuery;
  /** Selected entity: opens the Detail panel / the entity the page is about. */
  ref?: EntityRef;
}

export const DEFAULT_WORKSPACE: WorkspaceId = 'explore';

const TEXT_MODES = ['exact', 'prefix', 'contains'] as const;
const FILTER_TYPES = [
  'metric_range',
  'metric_present',
  'source_presence',
  'coca_pos',
  'cet_level',
  'learning_status',
  'in_refs',
  'spelling_class',
  'multi_pos',
  'multi_family',
] as const;

export function isWorkspaceId(value: string): value is WorkspaceId {
  return (WORKSPACES as readonly string[]).includes(value);
}

/** `{ workspace, query?, ref? }` → `#/workspace?q=…&ref=…` (order is stable). */
export function encodeRoute(route: AppRoute): string {
  const params: string[] = [];
  if (route.query) params.push(`q=${toBase64Url(canonicalJson(route.query))}`);
  if (route.ref) params.push(`ref=${encodeURIComponent(route.ref)}`);
  const search = params.length > 0 ? `?${params.join('&')}` : '';
  return `#/${route.workspace}${search}`;
}

export function decodeRoute(input: string | null | undefined): AppRoute {
  const raw = (input ?? '').replace(/^#/, '');
  const [pathPart, searchPart = ''] = raw.split('?');
  const workspaceName = pathPart.replace(/^\/+|\/+$/g, '').toLowerCase();
  const workspace: RouteWorkspace = isWorkspaceId(workspaceName) ? workspaceName : DEFAULT_WORKSPACE;

  const params = new URLSearchParams(searchPart);
  const query = readQuery(params.get('q'));
  const ref = readRef(params.get('ref'));
  const route: AppRoute = { workspace };
  if (query) route.query = query;
  if (ref) route.ref = ref;
  return route;
}

/**
 * Two routes are the same page state. Comparing the ENCODED form only works because the codec
 * serialises queries canonically (sorted keys), which also keeps shared links stable.
 */
export function isSameRoute(a: AppRoute, b: AppRoute): boolean {
  return encodeRoute(a) === encodeRoute(b);
}

/** Key-order independent JSON: equal page states must produce equal URLs. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// ---------------------------------------------------------------------------
// Query validation
// ---------------------------------------------------------------------------

function readQuery(value: string | null): LexQuery | undefined {
  if (!value) return undefined;
  const text = fromBase64Url(value);
  if (text === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return isLexQuery(parsed) ? parsed : undefined;
}

function readRef(value: string | null): EntityRef | undefined {
  if (!value) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return undefined;
  }
  try {
    const parsed = parseRef(decoded); // throws for anything that is not a ref
    if (parsed.kind === 'lemma_pos_target') return undefined; // route refs are entities, not targets
    return decoded;
  } catch {
    return undefined;
  }
}

/** Structural check of a decoded query; it never repairs the value, it rejects it. */
export function isLexQuery(value: unknown): value is LexQuery {
  if (!isRecord(value)) return false;
  if (typeof value.kind !== 'string' || !ENTITY_KINDS.includes(value.kind as EntityKind)) return false;
  if (value.text !== undefined) {
    if (!isRecord(value.text) || typeof value.text.q !== 'string') return false;
    if (typeof value.text.mode !== 'string' || !(TEXT_MODES as readonly string[]).includes(value.text.mode)) return false;
  }
  if (value.filters !== undefined) {
    if (!Array.isArray(value.filters)) return false;
    if (!value.filters.every((f) => isRecord(f) && typeof f.type === 'string' && (FILTER_TYPES as readonly string[]).includes(f.type))) {
      return false;
    }
    if (!(value.filters as unknown as QueryFilter[]).every(isFilterPayloadValid)) return false;
  }
  if (value.sort !== undefined) {
    if (!Array.isArray(value.sort) || !value.sort.every(isSortSpec)) return false;
  }
  if (value.page !== undefined) {
    if (!isRecord(value.page)) return false;
    if (!isCount(value.page.offset) || !isCount(value.page.limit)) return false;
  }
  if (value.aggregates !== undefined) {
    if (!Array.isArray(value.aggregates)) return false;
    if (!value.aggregates.every((a) => isRecord(a) && isMetricId(a.metric) && typeof a.op === 'string')) return false;
  }
  return true;
}

/** A metric id is only valid when the registry knows it; a typo must not reach a renderer. */
function isMetricId(value: unknown): value is MetricId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(METRICS, value);
}

function isFilterPayloadValid(filter: QueryFilter): boolean {
  switch (filter.type) {
    case 'metric_range':
      return isMetricId(filter.metric);
    case 'metric_present':
      return isMetricId(filter.metric) && typeof filter.present === 'boolean';
    case 'source_presence':
      return typeof filter.source === 'string' && typeof filter.present === 'boolean';
    case 'coca_pos':
      return Array.isArray(filter.pos);
    case 'cet_level':
      return Array.isArray(filter.levels);
    case 'learning_status':
      return Array.isArray(filter.statuses);
    case 'in_refs':
      return Array.isArray(filter.refs) && filter.refs.every((r) => typeof r === 'string');
    case 'spelling_class':
      return Array.isArray(filter.classes) && typeof filter.present === 'boolean';
    case 'multi_pos':
    case 'multi_family':
      return typeof filter.value === 'boolean';
  }
}

function isSortSpec(value: unknown): value is SortSpec {
  if (!isRecord(value)) return false;
  if (value.dir !== 'asc' && value.dir !== 'desc') return false;
  if (value.by === 'metric') return isMetricId(value.metric);
  return value.by === 'spelling';
}

// ---------------------------------------------------------------------------
// base64url (UTF-8 safe)
// ---------------------------------------------------------------------------

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
