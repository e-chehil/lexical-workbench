/**
 * The universal "Open in Explore" contract (PRODUCT_SPEC §2).
 *
 * Every count, bar, cell or list that represents a set of entities opens Explore with either an
 * equivalent `LexQuery` (dynamic) or the same set expressed as `in_refs` (static). Keeping that
 * mapping in one pure function means every workspace produces the same route for the same set.
 */
import { kindOf, type EntityKind, type EntityRef, type LexQuery } from '../../v2/index.ts';
import type { AppRoute } from './codec.ts';

/** One shared entity kind if the refs agree, otherwise the Form hub (cross-source sets). */
export function commonKind(refs: readonly EntityRef[]): EntityKind | null {
  let kind: EntityKind | null = null;
  for (const ref of refs) {
    const k = kindOf(ref);
    if (kind === null) kind = k;
    else if (kind !== k) return null;
  }
  return kind;
}

/** Static set → `in_refs` query on one kind; an empty set stays on the Form hub with 0 matches. */
export function queryForRefs(refs: readonly EntityRef[], at?: EntityKind): LexQuery {
  const kind = at ?? commonKind(refs) ?? 'form';
  return { kind, filters: [{ type: 'in_refs', refs: [...refs] }] };
}

export function routeForQuery(query: LexQuery, ref?: EntityRef): AppRoute {
  const route: AppRoute = { workspace: 'explore', query };
  if (ref) route.ref = ref;
  return route;
}

export function routeForRefs(refs: readonly EntityRef[], at?: EntityKind): AppRoute {
  return routeForQuery(queryForRefs(refs, at));
}
