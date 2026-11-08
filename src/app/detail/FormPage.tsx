/**
 * Form page (the word page every source hops through).
 *
 * Sections follow PRODUCT_SPEC §3.1: header/surfaces + status + PoS strip · COCA headword and
 * records · one BNC card per family membership · CET entries · relations · notes/tags · external
 * dictionaries. Every number is a MetricCell; the panel never computes a frequency itself.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, ExternalLink, Loader2, X } from 'lucide-react';
import {
  kindOf,
  METRICS,
  refs,
  type EntityRef,
  type LearningStatus,
  type LexQuery,
  type TargetRef,
} from '../../v2/index.ts';
import type { EngineClient } from '../../v2/worker/client.ts';
import { useLearning } from '../providers/LearningProvider.tsx';
import { EntityChip } from '../components/EntityChip.tsx';
import { MetricCell } from '../components/MetricCell.tsx';
import { StatusControl } from '../components/StatusControl.tsx';
import { cx, ErrorPanel, Note, Panel, SectionLabel, Spinner } from '../ui/index.tsx';
import { buildDictionaryUrl, DEFAULT_DICTIONARIES } from './dictionaries.ts';
import { loadLabels } from './loadLabels.ts';
import { useAsync } from './useAsync.ts';

export interface DetailPageProps {
  client: EngineClient;
  entityRef: EntityRef;
  onClose: () => void;
  onOpenRef: (ref: EntityRef) => void;
  onOpenInExplore: (query: LexQuery) => void;
  extraHeaderAction?: ReactNode;
}

const SOURCE_TAGS: Record<string, string> = { coca2020: 'COCA 2020', bnc25k: 'BNC/COCA 25k', cet2016: 'CET 2016' };
const POS_LABELS: Record<string, string> = {
  noun: 'n.',
  verb: 'v.',
  adjective: 'adj.',
  adverb: 'adv.',
  number: 'num.',
  interjection: 'int.',
  preposition: 'prep.',
  pronoun: 'pron.',
  conjunction: 'conj.',
  determiner: 'det.',
  article: 'art.',
  '+infinitive': '+inf.',
  negation: 'neg.',
  existential: 'exist.',
};

export function FormPage({ client, entityRef, onClose, onOpenRef, onOpenInExplore, extraHeaderAction }: DetailPageProps) {
  const learning = useLearning();
  const { data, loading, error } = useAsync(() => client.formDetail(entityRef), entityRef, [learning.syncedVersion]);
  const [labels, setLabels] = useState<Map<EntityRef, string>>(new Map());
  const [tagsDraft, setTagsDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const record = learning.store?.get(entityRef as TargetRef);
  useEffect(() => {
    setTagsDraft(record?.tags.join(', ') ?? '');
    setNoteDraft(record?.note ?? '');
  }, [record?.target, record?.tags, record?.note]);

  useEffect(() => {
    if (!data) return;
    const refs = [...new Set(data.relations.map((relation) => relation.to))];
    if (refs.length === 0) return;
    let cancelled = false;
    loadLabels(client, refs)
      .then((next) => {
        if (!cancelled) setLabels(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, data]);

  const relationGroups = useMemo(() => {
    if (!data) return [];
    const groups = new Map<string, { label: string; items: { ref: EntityRef; label: string; note?: string }[] }>();
    const titles: Record<string, string> = {
      source: '来源事实',
      computed: '拼写推导',
      candidate: '候选变体（不合并）',
    };
    for (const relation of data.relations) {
      const key = relation.provenance;
      let group = groups.get(key);
      if (!group) {
        group = { label: titles[key] ?? key, items: [] };
        groups.set(key, group);
      }
      if (group.items.some((item) => item.ref === relation.to)) continue;
      group.items.push({
        ref: relation.to,
        label: labels.get(relation.to) ?? relation.to,
        note: relation.type === 'spelling_casefold' ? '大小写折叠' : undefined,
      });
    }
    return [...groups.values()];
  }, [data, labels]);

  const write = async (target: TargetRef, patch: { status?: LearningStatus; tags?: string[]; note?: string }): Promise<void> => {
    const store = learning.store;
    if (!store) return;
    setBusy(true);
    setSaved(null);
    try {
      await store.apply([target], patch, { sourceLabel: 'Word page' });
      setSaved('已写入本机学习库');
    } catch (cause) {
      setSaved(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex h-full flex-col">
        <DetailHeader eyebrow="FORM" title="载入中…" onClose={onClose} extraHeaderAction={extraHeaderAction} />
        <div className="flex flex-1 items-center justify-center">
          <Spinner label="正在解析词形…" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col">
        <DetailHeader eyebrow="FORM" title="无法读取" onClose={onClose} extraHeaderAction={extraHeaderAction} />
        <div className="p-4">
          <ErrorPanel message={error ?? '当前来源中没有这个词形。'} />
        </div>
      </div>
    );
  }

  const formTarget = data.formRef as TargetRef;
  const titleSurface = data.surfaces[0]?.surface ?? data.key;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader
        eyebrow={`FORM · ${data.key}`}
        title={titleSurface}
        subtitle={data.surfaces.map((surface) => `${SOURCE_TAGS[surface.source] ?? surface.source} 拼作 ${surface.surface}`).join(' · ')}
        onClose={onClose}
        extraHeaderAction={extraHeaderAction}
      />

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusControl
              status={data.status}
              onSet={(status) => void write(formTarget, { status })}
              disabled={!learning.store}
              disabledReason="本地学习库不可用"
            />
            <span className="text-[11px] text-[var(--text-muted)]">
              {data.status.origin === 'inherited' ? '状态继承自词形' : data.status.origin === 'own' ? '词形自身状态' : '尚未评估'}
            </span>
            <button
              type="button"
              onClick={() => onOpenInExplore({ kind: 'form', text: { q: data.key, mode: 'exact' } })}
              className="btn btn-ghost ml-auto px-2 py-1 text-[11px]"
            >
              在 Explore 中打开 <ArrowUpRight size={12} />
            </button>
          </div>

          {data.coca && (
            <Panel className="p-3">
              <SectionLabel right="COCA 2020 · lemma + PoS">COCA 记录</SectionLabel>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-display text-xl font-semibold">{data.coca.headword}</span>
                <span className="font-mono-tabular text-[10px] text-[var(--text-faint)]">{data.coca.headwordRef}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border-hairline)] pt-3">
                {data.coca.hwMetrics.map((cell) => (
                  <MetricCell key={cell.metric} cell={cell} label />
                ))}
              </div>

              <div className="mt-3 overflow-x-auto border-t border-[var(--border-hairline)] pt-2">
                <table className="w-full min-w-[330px] border-collapse text-left">
                  <thead>
                    <tr className="eyebrow">
                      <th className="py-1.5 pr-2 font-normal">词性</th>
                      <th className="py-1.5 pr-2 text-right font-normal">官方排名</th>
                      <th className="py-1.5 pr-2 text-right font-normal">频次</th>
                      <th className="py-1.5 pr-2 text-right font-normal">占比</th>
                      <th className="py-1.5 text-right font-normal">学习</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.coca.records.map((row) => {
                      const target = refs.lemmaPosTarget(data.key, row.pos);
                      return (
                        <tr key={row.ref} className="border-t border-[var(--border-hairline)]">
                          <td className="py-1.5 pr-2">
                            <span className="font-display text-[13px]">{POS_LABELS[row.pos] ?? row.pos}</span>
                          </td>
                          {row.metrics.map((cell) => (
                            <td key={cell.metric} className="py-1.5 pr-2 text-right">
                              <MetricCell cell={cell} className="items-end" />
                            </td>
                          ))}
                          <td className="py-1.5 text-right">
                            <StatusControl
                              status={row.status}
                              compact
                              onSet={(status) => void write(target, { status })}
                              disabled={!learning.store}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Note>COCA 只按词元 + 词性列出前 60,000 条；未单列的词性不等于频次为 0。</Note>
            </Panel>
          )}

          {!data.coca && (
            <Panel className="p-3">
              <SectionLabel>COCA</SectionLabel>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
                未收录。COCA 以词元统计，屈折形式（如 went → go）可能记录在别的词头下；这里不借用任何数字。
              </p>
            </Panel>
          )}

          {data.bnc.length > 0 && (
            <section className="space-y-2">
              <SectionLabel right={`${data.bnc.length} 个词族归属`}>BNC/COCA 词族</SectionLabel>
              {data.bnc.map((membership) => (
                <Panel key={membership.memberRef} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => onOpenRef(membership.familyRef)} className="group flex min-w-0 items-baseline gap-2 text-left">
                      <span className="truncate font-display text-lg font-semibold group-hover:text-[var(--signal)]">{membership.familyHeadword}</span>
                      <span className="font-mono-tabular text-[9px] text-[var(--text-faint)]">FAMILY</span>
                    </button>
                    <button type="button" onClick={() => onOpenRef(membership.familyRef)} className="btn btn-ghost px-1.5 py-1 text-[10px]">
                      打开词族 <ArrowUpRight size={11} />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3 border-t border-[var(--border-hairline)] pt-2">
                    {membership.metrics.map((cell) => (
                      <MetricCell key={cell.metric} cell={cell} label />
                    ))}
                  </div>
                </Panel>
              ))}
              <Note>族内频次属于“该词形在这个词族里的成员槽”，不是词形自己的全局频次。</Note>
            </section>
          )}

          {data.cet.length > 0 && (
            <Panel className="p-3">
              <SectionLabel right="CET 2016 大纲">考纲条目</SectionLabel>
              <ul className="mt-2 divide-y divide-[var(--border-hairline)]">
                {data.cet.map((entry) => (
                  <li key={`${entry.entryRef}:${entry.role}:${entry.level}:${entry.homographNumber ?? ''}`} className="flex items-center gap-2 py-2">
                    <button type="button" onClick={() => onOpenRef(entry.entryRef)} className="min-w-0 flex-1 truncate text-left font-display text-[15px] hover:text-[var(--signal)]">
                      {entry.display}
                    </button>
                    <span className={cx('chip', entry.level === 'CET6' ? 'chip-signal' : '')}>{entry.level}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {entry.role === 'headword' ? '主词条' : entry.role === 'derivative' ? '派生词' : '变体'}
                      {entry.homographNumber ? ` · #${entry.homographNumber}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {relationGroups.length > 0 && (
            <Panel className="p-3">
              <SectionLabel>关系</SectionLabel>
              <div className="mt-2 space-y-2">
                {relationGroups.map((group) => (
                  <div key={group.label}>
                    <p className="text-[10px] text-[var(--text-muted)]">{group.label}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {group.items.map((item) => (
                        <EntityChip key={item.ref} entityRef={item.ref} label={item.label} kind={kindOf(item.ref)} onOpen={onOpenRef} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel className="p-3">
            <SectionLabel right={saved ?? undefined}>笔记与标签</SectionLabel>
            <label className="mt-2 block">
              <span className="eyebrow">标签（逗号分隔）</span>
              <input className="input mt-1" value={tagsDraft} onChange={(event) => setTagsDraft(event.target.value)} placeholder="例如：学术, 易混" />
            </label>
            <label className="mt-2 block">
              <span className="eyebrow">备注</span>
              <textarea
                className="input mt-1 min-h-[72px] resize-y"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="记录词根、搭配、易错点…"
              />
            </label>
            <button
              type="button"
              disabled={busy || !learning.store}
              onClick={() =>
                void write(formTarget, {
                  tags: tagsDraft.split(',').map((tag) => tag.trim()).filter(Boolean),
                  note: noteDraft,
                })
              }
              className="btn btn-ink mt-2 w-full"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              保存笔记与标签
            </button>
          </Panel>

          <Panel className="p-3">
            <SectionLabel>外部词典</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DEFAULT_DICTIONARIES.map((dictionary) => (
                <a
                  key={dictionary.id}
                  href={buildDictionaryUrl(data.key, dictionary.urlTemplate)}
                  target="_blank"
                  rel="noreferrer"
                  className="chip hover:border-[var(--signal)] hover:text-[var(--signal)]"
                >
                  {dictionary.shortName}
                  <ExternalLink size={9} aria-hidden />
                </a>
              ))}
            </div>
            <p className="mt-2 font-mono-tabular text-[9px] text-[var(--text-faint)]">{METRICS['coca2020.lp_rank'].source} · labels from the metric registry</p>
          </Panel>

          {labels.size > 0 && <span className="sr-only">已加载 {labels.size} 个关系标签</span>}
        </div>
      </div>
    </div>
  );
}

export function DetailHeader({
  eyebrow,
  title,
  subtitle,
  onClose,
  extraHeaderAction,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  extraHeaderAction?: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-[var(--border-strong)] px-4 pb-3 pt-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="eyebrow truncate">{eyebrow}</p>
          <h2 className="mt-1 truncate font-display text-[30px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">{title}</h2>
          {subtitle && <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        {extraHeaderAction}
        <button type="button" onClick={onClose} className="btn btn-ghost px-1 py-1" aria-label="关闭详情">
          <X size={15} />
        </button>
      </div>
    </header>
  );
}
