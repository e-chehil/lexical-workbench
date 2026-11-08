/**
 * Minimal entity view for the Detail panel host (V2-T04).
 *
 * T06 replaces this with the Form page / Family sheet / source-entity views. Until then it shows
 * what the route needs to be useful: the entity's own label, its kind, and the cross-source chips
 * that make the acceptance path work ("went" → BNC family "go").
 *
 * All labels and relations come from the engine (rows / project); nothing is derived here.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { kindOf, type EntityKind, type EntityRef } from '../../v2/index.ts';
import type { EngineClient } from '../../v2/worker/client.ts';
import { queryForRefs } from '../routing/openInExplore.ts';

export interface RefChip {
  ref: EntityRef;
  kind: EntityKind;
  label: string;
}

export interface RefDetailData {
  ref: EntityRef;
  kind: EntityKind;
  label: string;
  groups: { title: string; chips: RefChip[] }[];
}

const KIND_LABELS: Record<EntityKind, string> = {
  form: 'Form 拼写',
  coca_headword: 'COCA 词头',
  coca_lemma_pos: 'COCA 词性记录',
  bnc_family: 'BNC 词族',
  bnc_member: 'BNC 词族成员',
  cet_entry: 'CET 大纲条目',
};

/** Chips shown for each kind: a Form lists its source units, a unit lists the Forms it touches. */
const RELATED: Record<EntityKind, { title: string; to: EntityKind }[]> = {
  form: [
    { title: 'COCA 词头', to: 'coca_headword' },
    { title: 'BNC 词族', to: 'bnc_family' },
    { title: 'CET 大纲条目', to: 'cet_entry' },
  ],
  coca_headword: [{ title: '词形 (Form)', to: 'form' }],
  coca_lemma_pos: [
    { title: '词形 (Form)', to: 'form' },
    { title: 'COCA 词头', to: 'coca_headword' },
  ],
  bnc_family: [{ title: '成员词形 (Form)', to: 'form' }],
  bnc_member: [
    { title: '词形 (Form)', to: 'form' },
    { title: 'BNC 词族', to: 'bnc_family' },
  ],
  cet_entry: [{ title: '关联词形 (Form)', to: 'form' }],
};

export async function loadRefDetail(client: EngineClient, ref: EntityRef): Promise<RefDetailData> {
  const kind = kindOf(ref);
  const [selfPage, ...relatedRefs] = await Promise.all([
    client.rows({ query: { kind, filters: [{ type: 'in_refs', refs: [ref] }] }, columns: [] }),
    ...RELATED[kind].map((relation) => client.project([ref], relation.to)),
  ]);

  const groups: RefDetailData['groups'] = [];
  for (const [index, relation] of RELATED[kind].entries()) {
    const refs = relatedRefs[index] ?? [];
    if (refs.length === 0) continue;
    const page = await client.rows({ query: queryForRefs(refs, relation.to), columns: [] });
    groups.push({ title: relation.title, chips: page.rows.map((row) => ({ ref: row.ref, kind: row.kind, label: row.label })) });
  }

  return { ref, kind, label: selfPage.rows[0]?.label ?? ref, groups };
}

export interface RefDetailProps {
  client: EngineClient;
  entityRef: EntityRef;
  onClose: () => void;
  onOpenRef: (ref: EntityRef) => void;
  onOpenInExplore: (query: ReturnType<typeof queryForRefs>) => void;
  /** Host-provided header control (the float/dock pin). Rendered before the close button. */
  extraHeaderAction?: ReactNode;
}

export function RefDetail({ client, entityRef, onClose, onOpenRef, onOpenInExplore, extraHeaderAction }: RefDetailProps) {
  const [data, setData] = useState<RefDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    loadRefDetail(client, entityRef)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [client, entityRef]);

  const kind = kindOf(entityRef);

  return (
    <div
      className="flex h-full flex-col"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && extraHeaderAction === undefined) onClose();
      }}
    >
      <header className="flex items-start gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-[var(--text-muted)]">{KIND_LABELS[kind]}</p>
          <h2 className="truncate font-serif-lexicon text-2xl font-semibold text-[var(--text-primary)]">{data?.label ?? '载入中…'}</h2>
          <p className="truncate font-mono-tabular text-[11px] text-[var(--text-muted)]">{entityRef}</p>
        </div>
        {extraHeaderAction}
        <button type="button" onClick={onClose} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" aria-label="关闭详情">
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">读取失败：{error}</p>}
        {!data && !error && <p className="text-xs text-[var(--text-muted)]">正在读取实体信息…</p>}

        {data?.groups.map((group) => (
          <section key={group.title}>
            <h3 className="mb-1.5 text-[11px] text-[var(--text-muted)]">
              {group.title}
              <span className="ml-1.5">({group.chips.length})</span>
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {group.chips.map((chip) => (
                <li key={chip.ref}>
                  <button
                    type="button"
                    onClick={() => onOpenRef(chip.ref)}
                    className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 font-serif-lexicon text-xs text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-hover)]"
                  >
                    {chip.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
          完整词条页、词族面板与指标单元格由 V2-T06 提供；当前为该实体的最小可导航视图。
        </p>
      </div>

      <footer className="border-t border-[var(--border-subtle)] px-4 py-2.5">
        <button
          type="button"
          onClick={() => onOpenInExplore(queryForRefs([entityRef]))}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)]"
        >
          在 Explore 中打开
          <ArrowUpRight size={14} />
        </button>
      </footer>
    </div>
  );
}
