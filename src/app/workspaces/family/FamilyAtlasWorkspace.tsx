/**
 * Family Atlas: a directory of BNC/COCA families on the left and the selected family sheet in the
 * centre. Family refs live in the route; a member form opens the global inspector instead.
 */
import { useEffect, useMemo, useState } from 'react';
import { FolderPlus, Search } from 'lucide-react';
import { kindOf, type EntityRef, type FamilyDetailDTO, type LexQuery, type SortSpec, type TargetRef } from '../../../v2/index.ts';
import { useEngine } from '../../providers/EngineProvider.tsx';
import { useLearning } from '../../providers/LearningProvider.tsx';
import { useRoute } from '../../providers/RouteProvider.tsx';
import { useAsync } from '../../detail/useAsync.ts';
import { FamilyPage } from '../../detail/FamilyPage.tsx';
import { CollectionDialog } from '../../collections/CollectionDialog.tsx';
import { ErrorPanel, LoadingPanel, PageHeader, Spinner, cx } from '../../ui/index.tsx';
import { band, n } from '../../ui/format.ts';

const SORTS = [
  { id: 'total_desc', label: '总频次 ↓', sort: { by: 'metric', metric: 'bnc25k.family_total', dir: 'desc' } as SortSpec },
  { id: 'band_asc', label: '频段 ↑', sort: { by: 'metric', metric: 'bnc25k.family_band', dir: 'asc' } as SortSpec },
  { id: 'spelling_asc', label: '拼写 ↑', sort: { by: 'spelling', dir: 'asc' } as SortSpec },
];

export function FamilyAtlasWorkspace() {
  const { client, status } = useEngine();
  const { route, navigate } = useRoute();
  const learning = useLearning();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [bandValue, setBandValue] = useState<number | null>(null);
  const [sortId, setSortId] = useState('total_desc');
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionTargets, setCollectionTargets] = useState<TargetRef[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text.trim()), 220);
    return () => clearTimeout(timer);
  }, [text]);

  const selectedFamily = (() => {
    if (!route.ref) return null;
    try {
      return kindOf(route.ref) === 'bnc_family' ? route.ref : null;
    } catch {
      return null;
    }
  })();
  const sort = SORTS.find((option) => option.id === sortId)?.sort;
  const query = useMemo<LexQuery>(() => {
    const next: LexQuery = { kind: 'bnc_family', sort: sort ? [sort] : undefined };
    if (debounced) next.text = { q: debounced, mode: 'prefix' };
    if (bandValue !== null) next.filters = [{ type: 'metric_range', metric: 'bnc25k.family_band', min: bandValue, max: bandValue }];
    next.page = { offset: 0, limit: 300 };
    return next;
  }, [debounced, bandValue, sort]);

  const list = useAsync(
    () => (status === 'ready' ? client.rows({ query, columns: ['bnc25k.family_total', 'bnc25k.family_band'] }) : Promise.resolve(null)),
    JSON.stringify(query),
    [client, status]
  );

  const detail = useAsync(
    () => (selectedFamily ? client.familyDetail(selectedFamily) : Promise.resolve(null)),
    selectedFamily ?? 'none',
    [client, learning.syncedVersion]
  );

  const prepareCollection = (family: FamilyDetailDTO): void => {
    const targets = family.members
      .filter((member) => member.memberFreq > 0 && member.status.status !== 'mastered' && member.status.status !== 'deferred')
      .map((member) => member.formRef as TargetRef);
    setCollectionTargets([...new Set(targets)]);
    setCollectionOpen(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="03 / Family Atlas · BNC/COCA 25k"
        title="词族图谱"
        description="25,002 个词族按官方频段组织。选一个词族查看成员频次、族内占比与掌握进度；成员状态属于词形，不属于词族。"
        actions={
          selectedFamily && detail.data ? (
            <button
              type="button"
              className="btn btn-primary"
              title="只加入频次大于 0 且尚未掌握或暂缓的成员词形"
              onClick={() => prepareCollection(detail.data!)}
            >
              <FolderPlus size={13} /> 加入未掌握成员
            </button>
          ) : undefined
        }
      />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-full shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] md:w-[300px] lg:w-[330px]">
          <div className="space-y-2 border-b border-[var(--border-subtle)] p-3">
            <label className="relative block">
              <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" aria-hidden />
              <input className="input pl-7" value={text} onChange={(event) => setText(event.target.value)} placeholder="搜索词族头词…" aria-label="搜索词族" />
            </label>
            <div className="flex gap-2">
              <select className="select min-w-0 flex-1" value={bandValue ?? ''} onChange={(event) => setBandValue(event.target.value === '' ? null : Number(event.target.value))} aria-label="频段">
                <option value="">全部频段</option>
                {Array.from({ length: 25 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>{value}k</option>
                ))}
              </select>
              <select className="select min-w-0 flex-1" value={sortId} onChange={(event) => setSortId(event.target.value)} aria-label="排序">
                {SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
            <p className="font-mono-tabular text-[9px] text-[var(--text-faint)]">
              {list.data ? `${n(list.data.total)} 个词族` : '读取中'} · 显示前 300
            </p>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {list.error && <div className="p-3"><ErrorPanel message={list.error} /></div>}
            {list.loading && !list.data && <div className="p-4"><Spinner label="读取词族…" /></div>}
            {list.data?.rows.map((row) => {
              const value = row.metrics.find((cell) => cell.metric === 'bnc25k.family_total')?.value ?? null;
              const rowBand = row.metrics.find((cell) => cell.metric === 'bnc25k.family_band')?.value ?? null;
              const active = selectedFamily === row.ref;
              return (
                <button
                  key={row.ref}
                  type="button"
                  onClick={() => navigate({ workspace: 'family', ref: row.ref })}
                  className={cx(
                    'flex w-full items-center gap-2 border-b border-[var(--border-hairline)] px-3 py-2 text-left transition-colors',
                    active ? 'bg-[var(--signal-soft)] shadow-[inset_2px_0_0_var(--signal)]' : 'hover:bg-[var(--bg-hover)]'
                  )}
                >
                  <span className="w-8 font-mono-tabular text-[9px] text-[var(--stamp)]">{band(rowBand)}</span>
                  <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold">{row.label}</span>
                  <span className="font-mono-tabular text-[10px] text-[var(--text-muted)]">{n(value)}</span>
                </button>
              );
            })}
            {list.data && list.data.rows.length === 0 && <p className="p-4 text-center text-[11px] text-[var(--text-muted)]">没有匹配的词族。</p>}
          </div>
        </aside>

        <section className="scroll-thin hidden min-w-0 flex-1 overflow-y-auto md:block">
          {detail.loading && <LoadingPanel label="读取词族详情…" />}
          {detail.error && <div className="p-4"><ErrorPanel message={detail.error} /></div>}
          {!selectedFamily && (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                <p className="eyebrow">Directory</p>
                <p className="mt-2 font-display text-xl font-semibold">从左侧选择一个词族</p>
                <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
                  词族是 BNC/COCA 25k 的官方分组：一个头词加上成员词形。族总频次只属于词族；成员频次和族内占比属于成员槽。词形页记录个人学习状态，词族进度由成员词形聚合。
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--border-hairline)] pt-3">
                  <MiniStat label="词族" value="25,002" />
                  <MiniStat label="成员槽" value="76,126" />
                  <MiniStat label="频段" value="1k–25k" />
                </div>
              </div>
            </div>
          )}
          {selectedFamily && detail.data && (
            <FamilyPage
              client={client}
              entityRef={selectedFamily}
              onClose={() => navigate({ workspace: 'family' })}
              onOpenRef={(ref: EntityRef) => navigate({ workspace: 'family', ref })}
              onOpenInExplore={(query) => navigate({ workspace: 'explore', query })}
            />
          )}
        </section>
      </div>

      <CollectionDialog
        open={collectionOpen}
        db={learning.db}
        version={learning.version}
        targets={collectionTargets}
        onClose={() => setCollectionOpen(false)}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-mono-tabular text-[15px]">{value}</p>
    </div>
  );
}
