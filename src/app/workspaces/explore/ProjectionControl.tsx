/**
 * "Project this result set onto another kind" control (PRODUCT_SPEC §3.1 acceptance 3).
 *
 * 1,000 COCA PoS records sorted by official rank are not 1,000 headwords: the projection runs the
 * query, projects the refs through the engine (`project`, never a local spelling match) and opens
 * the result as a static `in_refs` set on the target kind.
 *
 * A very large result set is capped: the refs travel through the worker boundary, and a 95k-row
 * projection would be paid on every scroll. The cap is reported, not silently applied.
 */
import { useState } from 'react';
import { Loader2, Shuffle } from 'lucide-react';
import { ENTITY_KINDS, type EntityKind, type LexQuery } from '../../../v2/index.ts';
import type { EngineClient } from '../../../v2/worker/client.ts';
import { KIND_LABELS } from './filterState.ts';

export const PROJECTION_LIMIT = 5000;

export interface ProjectionControlProps {
  client: EngineClient;
  scope: LexQuery;
  total: number | null;
  currentKind: EntityKind;
  onProject: (kind: EntityKind, refs: string[]) => void;
  onMessage: (message: string) => void;
}

export function ProjectionControl({ client, scope, total, currentKind, onProject, onMessage }: ProjectionControlProps) {
  const [busy, setBusy] = useState(false);
  const targets = ENTITY_KINDS.filter((kind) => kind !== currentKind);

  const project = async (kind: EntityKind): Promise<void> => {
    setBusy(true);
    try {
      const query: LexQuery = { ...scope };
      delete query.aggregates;
      query.page = { offset: 0, limit: PROJECTION_LIMIT };
      const result = await client.query(query);
      const truncated = result.total > result.refs.length;
      const projected = await client.project(result.refs, kind);
      if (projected.length === 0) {
        onMessage(`当前 ${result.refs.length} 条结果没有可投影到「${KIND_LABELS[kind]}」的实体`);
        return;
      }
      onProject(kind, projected);
      onMessage(
        `已投影 ${result.refs.length}${truncated ? `（上限 ${PROJECTION_LIMIT}）` : ''} 条到「${KIND_LABELS[kind]}」：${projected.length} 个实体`
      );
    } catch (cause) {
      onMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
      <Shuffle size={11} />
      <span className="hidden sm:inline">投影到</span>
      <select
        value=""
        disabled={busy || (total ?? 0) === 0}
        onChange={(event) => {
          const kind = event.target.value as EntityKind;
          event.target.value = '';
          if (kind) void project(kind);
        }}
        aria-label="把这个结果集投影到另一个类别"
        className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1 py-0.5 text-[10px] text-[var(--text-secondary)] disabled:opacity-40"
      >
        <option value="">{busy ? '投影中…' : '选择类别'}</option>
        {targets.map((kind) => (
          <option key={kind} value={kind}>
            {KIND_LABELS[kind]}
          </option>
        ))}
      </select>
      {busy && <Loader2 size={10} className="animate-spin" />}
    </label>
  );
}
