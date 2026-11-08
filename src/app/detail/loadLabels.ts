/** Resolve refs of several kinds to their engine labels (for relation chips). */
import { kindOf, type EntityKind, type EntityRef } from '../../v2/index.ts';
import type { EngineClient } from '../../v2/worker/client.ts';

export async function loadLabels(client: EngineClient, refs: readonly EntityRef[]): Promise<Map<EntityRef, string>> {
  const groups = new Map<EntityKind, EntityRef[]>();
  for (const ref of refs) {
    const kind = kindOf(ref);
    const list = groups.get(kind);
    if (list) list.push(ref);
    else groups.set(kind, [ref]);
  }
  const pages = await Promise.all(
    [...groups.entries()].map(([kind, group]) =>
      client.rows({ query: { kind, filters: [{ type: 'in_refs', refs: group }] }, columns: [] }).then((page) => page.rows)
    )
  );
  const labels = new Map<EntityRef, string>();
  for (const rows of pages) for (const row of rows) labels.set(row.ref, row.label);
  return labels;
}
