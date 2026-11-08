/**
 * Save-to-collection dialog: append targets to an existing static collection, create a new
 * static collection, or save a dynamic query (from Explore).
 */
import { useEffect, useState } from 'react';
import type { Collection, LexQuery, TargetRef } from '../../v2/index.ts';
import type { LexicalWorkbenchDB } from '../../v2/store/dexieStore.ts';
import { cx, ErrorPanel, Modal, Note } from '../ui/index.tsx';
import { useCollections } from './useCollections.ts';

export function CollectionDialog({
  open,
  db,
  version,
  targets,
  query,
  onClose,
  onDone,
}: {
  open: boolean;
  db: LexicalWorkbenchDB | null;
  version: number;
  targets?: readonly TargetRef[];
  query?: LexQuery;
  onClose: () => void;
  onDone?: (message: string) => void;
}) {
  const collections = useCollections(db, version);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isDynamic = !targets && Boolean(query);

  useEffect(() => {
    if (!open) return;
    setName(isDynamic ? '未命名动态词集' : '新词集');
    setError(null);
    setMessage(null);
  }, [open, isDynamic]);

  const done = (text: string): void => {
    setBusy(false);
    setMessage(text);
    onDone?.(text);
    setTimeout(onClose, 650);
  };

  const run = async (operation: () => Promise<unknown>, text: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      done(text);
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const staticCollections = collections.items.filter((item): item is Extract<Collection, { kind: 'static' }> => item.kind === 'static');

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={isDynamic ? 'Save query' : 'Save targets'}
      title={isDynamic ? '保存为动态词集' : `加入词集（${targets?.length ?? 0} 个目标）`}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>取消</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || name.trim().length === 0}
            onClick={() => {
              if (isDynamic && query) void run(() => collections.createDynamic(name, query, '来自 Explore 的查询'), `已保存动态词集「${name}」`);
              else if (targets) void run(() => collections.createStatic(name, targets), `已新建「${name}」并加入 ${targets.length} 个目标`);
            }}
          >
            {busy ? '写入中…' : isDynamic ? '保存查询' : '新建并加入'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorPanel message={error} />}
        {message && <p className="border-l-2 border-[var(--seal)] pl-2 text-[12px] text-[var(--seal)]">{message}</p>}

        {!isDynamic && staticCollections.length > 0 && (
          <section>
            <p className="eyebrow">已有静态词集</p>
            <ul className="mt-1 max-h-[220px] overflow-y-auto border border-[var(--border-subtle)]">
              {staticCollections.map((collection) => (
                <li key={collection.id} className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-2 py-2 last:border-0">
                  <span className="min-w-0 flex-1 truncate text-[12px]">{collection.name}</span>
                  <span className="font-mono-tabular text-[10px] text-[var(--text-muted)]">{collection.targets.length}</span>
                  <button
                    type="button"
                    className="btn px-2 py-1 text-[10px]"
                    disabled={busy || !targets}
                    onClick={() => {
                      if (!targets) return;
                      void run(() => collections.addTargets(collection.id, targets), `已加入「${collection.name}」`);
                    }}
                  >
                    加入
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <label className="block">
          <span className="eyebrow">{isDynamic ? '新动态词集名称' : '新建静态词集'}</span>
          <input className="input mt-1" value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <Note>
          {isDynamic
            ? '动态词集保存查询本身，学习状态变化后重新打开会得到新的集合；静态词集保存明确的目标列表。'
            : '静态词集保存目标列表；同一目标重复加入不会产生副本。'}
        </Note>
        {isDynamic && <p className={cx('text-[10px]', 'text-[var(--text-faint)]')}>查询：{query ? JSON.stringify(query).slice(0, 140) : ''}</p>}
      </div>
    </Modal>
  );
}
