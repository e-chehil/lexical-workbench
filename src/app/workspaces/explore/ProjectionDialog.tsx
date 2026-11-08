/**
 * Projection pre-flight: declare the source set, target kind and sample limit before producing a
 * one-shot `in_refs` set. A projection is not a saved collection; saving is a separate action.
 */
import { useEffect, useState } from 'react';
import type { EntityKind, EntityRef, LexQuery } from '../../../v2/index.ts';
import type { EngineClient } from '../../../v2/worker/client.ts';
import { ErrorPanel, Modal, Note } from '../../ui/index.tsx';
import { KIND_LABELS } from './filterState.ts';
import { n } from '../../ui/format.ts';

const TARGETS: EntityKind[] = ['form', 'coca_headword', 'coca_lemma_pos', 'bnc_family', 'bnc_member', 'cet_entry'];

export function ProjectionDialog({
  open,
  client,
  scope,
  total,
  currentKind,
  onClose,
  onProject,
}: {
  open: boolean;
  client: EngineClient;
  scope: LexQuery;
  total: number | null;
  currentKind: EntityKind;
  onClose: () => void;
  onProject: (kind: EntityKind, refs: EntityRef[]) => void;
}) {
  const [target, setTarget] = useState<EntityKind>(currentKind === 'coca_lemma_pos' ? 'coca_headword' : 'form');
  const [limit, setLimit] = useState(5000);
  const [refs, setRefs] = useState<EntityRef[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRefs(null);
    setError(null);
    setBusy(true);
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        const page = await client.query({ ...scope, page: { offset: 0, limit } });
        const projected = await client.project(page.refs, target);
        if (!cancelled) setRefs(projected);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, client, scope, target, limit]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Pre-flight"
      title="投影为固定集合"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !refs || refs.length === 0}
            onClick={() => {
              if (!refs) return;
              onProject(target, refs);
              onClose();
            }}
          >
            投影并定格
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorPanel message={error} />}
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5">
            <p className="eyebrow">来源</p>
            <p className="mt-1 text-[12px]">{KIND_LABELS[currentKind]}</p>
            <p className="font-mono-tabular text-[10px] text-[var(--text-muted)]">{n(total)} 条匹配 · 取前 {n(limit)} 条</p>
          </div>
          <label className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5">
            <span className="eyebrow">目标类别</span>
            <select className="select mt-1 w-full" value={target} onChange={(event) => setTarget(event.target.value as EntityKind)}>
              {TARGETS.map((kind) => (
                <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="eyebrow">取样上限</span>
          <input
            className="input mt-1 font-mono-tabular"
            inputMode="numeric"
            value={limit}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              setLimit(Number.isFinite(parsed) ? Math.max(1, Math.min(5000, Math.trunc(parsed))) : 1);
            }}
          />
          <span className="mt-1 block text-[10px] text-[var(--text-muted)]">按当前排序取前段，最多 5,000 条。</span>
        </label>

        <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
          <p className="eyebrow">投影结果</p>
          <p className="mt-1 font-display text-2xl font-semibold">
            {busy ? '计算中…' : refs ? `${n(refs.length)} 个${KIND_LABELS[target]}` : '—'}
          </p>
          {refs && refs.length > 0 && <p className="mt-1 truncate font-mono-tabular text-[9px] text-[var(--text-faint)]">{refs.slice(0, 3).join(' · ')} …</p>}
        </div>

        <Note>
          投影产生的是本次查询内的一次性固定集合（in_refs），不会自动保存。需要长期保留时，用「保存查询」建立动态词集，或把结果显式加入静态词集。
        </Note>
      </div>
    </Modal>
  );
}
