/**
 * Source-entity view for every non-Form, non-family kind (COCA headword / record, BNC membership,
 * CET entry). It shows the entity's own native metrics and the refs it structurally touches,
 * always with a link back to the Form hub.
 */
import { useEffect, useState } from 'react';
import { ArrowUpRight, ExternalLink } from 'lucide-react';
import {
  kindOf,
  type EntityKind,
  type EntityRowDTO,
  type LearningStatus,
  type MetricId,
} from '../../v2/index.ts';
import { useLearning } from '../providers/LearningProvider.tsx';
import { EntityChip } from '../components/EntityChip.tsx';
import { MetricCell } from '../components/MetricCell.tsx';
import { StatusControl } from '../components/StatusControl.tsx';
import { ErrorPanel, Note, Panel, SectionLabel, Spinner } from '../ui/index.tsx';
import { targetForRow } from '../workspaces/explore/selection.ts';
import { DetailHeader, type DetailPageProps } from './FormPage.tsx';
import { useAsync } from './useAsync.ts';

const KIND_TITLES: Record<Exclude<EntityKind, 'form' | 'bnc_family'>, { title: string; eyebrow: string }> = {
  coca_headword: { title: 'COCA 词头', eyebrow: 'COCA HEADWORD' },
  coca_lemma_pos: { title: 'COCA 词性记录', eyebrow: 'COCA LEMMA + POS' },
  bnc_member: { title: 'BNC 词族成员', eyebrow: 'BNC MEMBERSHIP' },
  cet_entry: { title: 'CET 大纲条目', eyebrow: 'CET SYLLABUS ENTRY' },
};

const CONFIG: Record<Exclude<EntityKind, 'form' | 'bnc_family'>, { metrics: MetricId[]; related: { to: EntityKind; title: string }[]; note: string }> = {
  coca_headword: {
    metrics: ['coca2020.hw_freq_sum', 'coca2020.hw_rank', 'coca2020.hw_best_lp_rank', 'coca2020.hw_pos_count'],
    related: [
      { to: 'coca_lemma_pos', title: '词性记录' },
      { to: 'form', title: '词形 Form' },
    ],
    note: '词头合计频次是已列出的词性记录之和，是下界而不是语料库总频次。',
  },
  coca_lemma_pos: {
    metrics: ['coca2020.lp_rank', 'coca2020.lp_freq', 'coca2020.lp_share_of_headword'],
    related: [
      { to: 'coca_headword', title: '父词头' },
      { to: 'form', title: '词形 Form' },
    ],
    note: '官方排名 1–60,000 内唯一；缺失表示未被 COCA 词表列出，不等于零。',
  },
  bnc_member: {
    metrics: ['bnc25k.member_freq', 'bnc25k.member_share_of_family', 'bnc25k.family_band'],
    related: [
      { to: 'bnc_family', title: '所属词族' },
      { to: 'form', title: '词形 Form' },
    ],
    note: '成员频次属于这个成员槽，同一个拼写在别的词族里可能有不同的值。',
  },
  cet_entry: {
    metrics: ['coca2020.hw_rank', 'coca2020.hw_freq_sum', 'bnc25k.family_band'],
    related: [{ to: 'form', title: '关联词形' }],
    note: 'CET 条目可链接多个拼写；词族频段只在第一个词形存在时借用，不与条目本身混为同一单位。',
  },
};

export function EntityPage({ client, entityRef, onClose, onOpenRef, onOpenInExplore, extraHeaderAction }: DetailPageProps) {
  const learning = useLearning();
  const kind = kindOf(entityRef) as Exclude<EntityKind, 'form' | 'bnc_family'>;
  const config = CONFIG[kind];
  const [row, setRow] = useState<EntityRowDTO | null>(null);
  const [groups, setGroups] = useState<{ title: string; rows: EntityRowDTO[] }[]>([]);
  const [writeError, setWriteError] = useState<string | null>(null);

  const { data, loading, error } = useAsync(async () => {
    const [self, ...projected] = await Promise.all([
      client.rows({ query: { kind, filters: [{ type: 'in_refs', refs: [entityRef] }] }, columns: config.metrics }),
      ...config.related.map((relation) => client.project([entityRef], relation.to)),
    ]);
    const related = await Promise.all(
      config.related.map((relation, index) => {
        const refs = projected[index] ?? [];
        if (refs.length === 0) return Promise.resolve({ title: relation.title, rows: [] as EntityRowDTO[] });
        return client
          .rows({ query: { kind: relation.to, filters: [{ type: 'in_refs', refs }] }, columns: [] })
          .then((page) => ({ title: relation.title, rows: page.rows }));
      })
    );
    return { self: self.rows[0] ?? null, related: related.filter((group) => group.rows.length > 0) };
  }, entityRef, [learning.syncedVersion]);

  useEffect(() => {
    setWriteError(null);
  }, [entityRef]);

  useEffect(() => {
    // `useAsync` clears data when the entity key changes; clear the derived view too so a
    // previous entity never stays visible (or writable) under a new route.
    setRow(data?.self ?? null);
    setGroups(data?.related ?? []);
  }, [data]);

  const write = async (target: ReturnType<typeof targetForRow>, status: LearningStatus): Promise<void> => {
    const store = learning.store;
    if (!store || !target) return;
    setWriteError(null);
    try {
      await store.apply([target], { status }, { sourceLabel: 'Entity page' });
    } catch (cause) {
      setWriteError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  if (loading && !row) {
    return (
      <div className="flex h-full flex-col">
        <DetailHeader eyebrow={KIND_TITLES[kind]?.eyebrow ?? 'ENTITY'} title="载入中…" onClose={onClose} extraHeaderAction={extraHeaderAction} />
        <div className="flex flex-1 items-center justify-center"><Spinner label="正在读取来源实体…" /></div>
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="flex h-full flex-col">
        <DetailHeader eyebrow={KIND_TITLES[kind]?.eyebrow ?? 'ENTITY'} title="无法读取" onClose={onClose} extraHeaderAction={extraHeaderAction} />
        <div className="p-4"><ErrorPanel message={error ?? '当前来源中没有这个实体。'} /></div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader
        eyebrow={KIND_TITLES[kind]?.eyebrow ?? 'ENTITY'}
        title={row.label}
        subtitle={entityRef}
        onClose={onClose}
        extraHeaderAction={extraHeaderAction}
      />

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-4 py-4">
          {writeError && <ErrorPanel message={`学习状态写入失败：${writeError}`} />}
          <Panel className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>{KIND_TITLES[kind]?.title ?? '来源实体'}</SectionLabel>
              <StatusControl
                status={row.status}
                compact
                onSet={(status) => void write(targetForRow(row), status)}
                disabled={!learning.store || targetForRow(row) === null}
                disabledReason="该实体没有单一学习目标"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {row.metrics.map((cell) => (
                <MetricCell key={cell.metric} cell={cell} label />
              ))}
            </div>
            <div className="mt-3"><Note>{config.note}</Note></div>
          </Panel>

          {groups.map((group) => (
            <Panel key={group.title} className="p-3">
              <SectionLabel right={`${group.rows.length} 项`}>{group.title}</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {group.rows.map((related) => (
                  <EntityChip key={related.ref} entityRef={related.ref} label={related.label} kind={related.kind} onOpen={onOpenRef} />
                ))}
              </div>
            </Panel>
          ))}

          <div className="flex gap-2">
            <button type="button" onClick={() => onOpenInExplore({ kind, filters: [{ type: 'in_refs', refs: [entityRef] }] })} className="btn flex-1">
              在 Explore 中打开
              <ArrowUpRight size={12} />
            </button>
            {groups.some((group) => group.title.includes('词形')) && (
              <button
                type="button"
                onClick={() => {
                  const form = groups.find((group) => group.title.includes('词形'))?.rows[0];
                  if (form) onOpenRef(form.ref);
                }}
                className="btn flex-1"
              >
                打开词形页 <ExternalLink size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
