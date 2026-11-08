/**
 * Family sheet. Members are memberships of one family: frequency and share belong to the slot,
 * the family total belongs to the family, and progress is computed from member Forms.
 */
import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { refs, type EntityRef, type FamilyDetailDTO, type LearningStatus, type TargetRef } from '../../v2/index.ts';
import { useLearning } from '../providers/LearningProvider.tsx';
import { MetricCell } from '../components/MetricCell.tsx';
import { StatusControl } from '../components/StatusControl.tsx';
import { ErrorPanel, Meter, Note, Panel, SectionLabel, Spinner } from '../ui/index.tsx';
import { n, ratio } from '../ui/format.ts';
import { DetailHeader, type DetailPageProps } from './FormPage.tsx';
import { useAsync } from './useAsync.ts';

export function FamilyPage({ client, entityRef, onClose, onOpenRef, onOpenInExplore, extraHeaderAction }: DetailPageProps) {
  const learning = useLearning();
  const { data, loading, error } = useAsync(() => client.familyDetail(entityRef), entityRef, [learning.syncedVersion]);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [otherFamilies, setOtherFamilies] = useState<Map<EntityRef, { label: string; band: number | null }>>(new Map());

  const write = async (target: TargetRef, status: LearningStatus): Promise<void> => {
    const store = learning.store;
    if (!store) return;
    setBusy(true);
    setWriteError(null);
    try {
      await store.apply([target], { status }, { sourceLabel: 'Family page' });
    } catch (cause) {
      setWriteError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setWriteError(null);
  }, [entityRef]);

  useEffect(() => {
    if (!data) return;
    const refs = [...new Set(data.members.flatMap((member) => member.otherFamilies))];
    if (refs.length === 0) return;
    let cancelled = false;
    void client
      .rows({ query: { kind: 'bnc_family', filters: [{ type: 'in_refs', refs }] }, columns: ['bnc25k.family_band'] })
      .then((page) => {
        if (cancelled) return;
        const map = new Map<EntityRef, { label: string; band: number | null }>();
        for (const row of page.rows) {
          const band = row.metrics.find((cell) => cell.metric === 'bnc25k.family_band')?.value ?? null;
          map.set(row.ref, { label: row.label, band });
        }
        setOtherFamilies(map);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, data]);

  if (loading && !data) {
    return (
      <div className="flex h-full flex-col">
        <DetailHeader eyebrow="FAMILY" title="载入中…" onClose={onClose} extraHeaderAction={extraHeaderAction} />
        <div className="flex flex-1 items-center justify-center"><Spinner label="正在读取词族…" /></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col">
        <DetailHeader eyebrow="FAMILY" title="无法读取" onClose={onClose} extraHeaderAction={extraHeaderAction} />
        <div className="p-4"><ErrorPanel message={error ?? '当前来源中没有这个词族。'} /></div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader
        eyebrow={`BNC/COCA FAMILY · ${refs.bncFamily(data.headword)}`}
        title={data.headword}
        subtitle={`${data.band}k 频段 · 官方总频次 ${n(data.totalFrequency)} · ${data.members.length} 个成员槽`}
        onClose={onClose}
        extraHeaderAction={extraHeaderAction}
      />

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-4 py-4">
          {writeError && <ErrorPanel message={`学习状态写入失败：${writeError}`} />}
          <Panel className="p-3">
            <SectionLabel right={`${data.progress.formsMastered}/${data.progress.formsTotal} 词形`}>掌握进度</SectionLabel>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <p className="font-display text-[28px] leading-none text-[var(--seal)]">{ratio(data.progress.weighted.ratio)}</p>
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">成员频次加权（计算），不是成员个数比例</p>
              </div>
              <div className="text-right">
                <p className="font-mono-tabular text-[11px] text-[var(--text-secondary)]">{n(data.progress.weighted.numerator)}</p>
                <p className="font-mono-tabular text-[10px] text-[var(--text-faint)]">/ {n(data.progress.weighted.denominator)}</p>
              </div>
            </div>
            <div className="mt-2"><Meter value={data.progress.weighted.numerator} total={data.progress.weighted.denominator} tone="seal" /></div>
          </Panel>

          <section>
            <SectionLabel right={`${data.members.length} 个成员`}>成员与占比</SectionLabel>
            <div className="mt-2 overflow-x-auto border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <table className="w-full min-w-[430px] border-collapse text-left">
                <thead>
                  <tr className="roster-head eyebrow">
                    <th className="px-2 py-2 font-normal">词形</th>
                    <th className="px-2 py-2 text-right font-normal">成员频次</th>
                    <th className="px-2 py-2 text-right font-normal">族内占比</th>
                    <th className="px-2 py-2 font-normal">来源</th>
                    <th className="px-2 py-2 text-right font-normal">学习</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((member) => (
                    <FamilyMemberRow
                      key={member.memberRef}
                      member={member}
                      onOpenRef={onOpenRef}
                      onSetStatus={(status) => void write(member.formRef as TargetRef, status)}
                      disabled={busy || !learning.store}
                      otherFamilies={otherFamilies}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Note>成员频次是词形在这个词族里的频次；族内占比 = 成员频次 ÷ 同族总频次。词族总频次不会出现在成员行上。</Note>
          </section>

          <div className="flex gap-2">
            <button type="button" onClick={() => onOpenInExplore({ kind: 'bnc_family', text: { q: data.headword, mode: 'exact' } })} className="btn flex-1">
              在 Explore 打开词族
              <ArrowUpRight size={12} />
            </button>
            <button type="button" onClick={() => onOpenInExplore({ kind: 'form', filters: [{ type: 'in_refs', refs: data.members.map((m) => m.formRef) }] })} className="btn flex-1">
              在 Explore 打开成员
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FamilyMemberRow({
  member,
  onOpenRef,
  onSetStatus,
  disabled,
  otherFamilies,
}: {
  member: FamilyDetailDTO['members'][number];
  onOpenRef: (ref: EntityRef) => void;
  onSetStatus: (status: LearningStatus) => void;
  disabled: boolean;
  otherFamilies: Map<EntityRef, { label: string; band: number | null }>;
}) {
  return (
    <tr className="roster-row">
      <td className="px-2 py-1.5">
        <button type="button" onClick={() => onOpenRef(member.formRef)} className="max-w-[150px] truncate text-left font-display text-[15px] font-semibold hover:text-[var(--signal)]">
          {member.form}
        </button>
        {member.otherFamilies.length > 0 && (
          <span className="ml-1.5 align-middle chip !px-1 !py-0 text-[9px]" title={`也属于：${member.otherFamilies.join(', ')}`}>
            多词族
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <MetricCell metric="bnc25k.member_freq" value={member.memberFreq} />
      </td>
      <td className="px-2 py-1.5 text-right">
        <MetricCell metric="bnc25k.member_share_of_family" value={member.share} />
        <span className="mt-1 block h-0.5 w-16 overflow-hidden rounded-full bg-[var(--bg-inset)]" aria-hidden>
          <span className="block h-full bg-[var(--seal)]" style={{ width: `${Math.max(0, Math.min(100, (member.share ?? 0) * 100))}%` }} />
        </span>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {member.cocaHeadwordRef && (
            <button type="button" onClick={() => onOpenRef(member.cocaHeadwordRef!)} className="chip !px-1 !py-0 text-[9px]">
              COCA
            </button>
          )}
          {member.cetLevels.map((level) => (
            <span key={level} className={`chip !px-1 !py-0 text-[9px] ${level === 'CET6' ? 'chip-signal' : ''}`}>{level}</span>
          ))}
          {member.otherFamilies.map((family) => {
            const info = otherFamilies.get(family);
            return (
              <button key={family} type="button" onClick={() => onOpenRef(family)} className="chip !px-1 !py-0 text-[9px] hover:border-[var(--signal)]" title={`也属于 ${info?.label ?? family}`}>
                也属于 {info?.label ?? family}{info?.band ? ` ${info.band}k` : ''}
              </button>
            );
          })}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <StatusControl status={member.status} compact onSet={onSetStatus} disabled={disabled} />
      </td>
    </tr>
  );
}
