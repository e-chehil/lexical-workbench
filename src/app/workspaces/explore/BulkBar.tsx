/**
 * Bulk action bar (PRODUCT_SPEC §3.1: status, add to collection; export arrives with T11).
 *
 * Every action works on learning targets, never on rows: `targetsForRows` reports the aggregates it
 * cannot act on (families need an explicit member choice, entries link several spellings), and the
 * bar says so instead of silently dropping them. Each committed write becomes a visible receipt
 * (Shape Brief §4.2 "one annotation stroke") with undo backed by `store.undoBatch`;
 * the per-batch history popover arrives with Phase 3.
 */
import { useEffect, useState } from 'react';
import { FolderPlus, Loader2, Undo2, X } from 'lucide-react';
import type { Collection, EntityRowDTO, LearningStatus, TargetRef } from '../../../v2/index.ts';
import { CollectionError, DexieCollections } from '../../../v2/store/collections.ts';
import type { LexicalWorkbenchDB } from '../../../v2/store/dexieStore.ts';
import { STATUS_KEYS, STATUS_LABELS } from './filterState.ts';
import { targetsForRows } from './selection.ts';

type StaticCollection = Extract<Collection, { kind: 'static' }>;

export interface BatchReceipt {
  batchId: string;
  targets: number;
  skipped: number;
  statusLabel: string;
  undone: boolean;
}

export interface BulkBarProps {
  selectedRows: EntityRowDTO[];
  receipt: BatchReceipt | null;
  busy: boolean;
  message: string | null;
  db: LexicalWorkbenchDB | null;
  onStatus: (status: LearningStatus) => void;
  onClear: () => void;
  onUndoReceipt: () => void;
  onDismissReceipt: () => void;
  onMessage: (message: string | null) => void;
}

export function BulkBar({
  selectedRows,
  receipt,
  busy,
  message,
  db,
  onStatus,
  onClear,
  onUndoReceipt,
  onDismissReceipt,
  onMessage,
}: BulkBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const mapping = targetsForRows(selectedRows);

  return (
    <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
      {receipt && (
        <p
          className={`mb-1.5 flex flex-wrap items-center gap-2 rounded-md border px-2 py-1 text-[11px] ${
            receipt.undone
              ? 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'
              : 'border-[var(--st-learning)]/30 bg-[var(--st-learning-soft)] text-[var(--text-secondary)]'
          }`}
        >
          <span>
            {receipt.undone
              ? `已撤销批次 ${receipt.batchId.slice(0, 12)}…`
              : `已记：${receipt.targets} 个目标 → ${receipt.statusLabel}`}
            {receipt.skipped > 0 ? ` · ${receipt.skipped} 项聚合已跳过` : ''} · 批次 {receipt.batchId.slice(0, 12)}…
          </span>
          {!receipt.undone && (
            <button
              type="button"
              onClick={onUndoReceipt}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-hover)] disabled:opacity-40"
            >
              <Undo2 size={11} aria-hidden />
              撤销这批
            </button>
          )}
          <button
            type="button"
            onClick={onDismissReceipt}
            aria-label="关闭回执"
            className="ml-auto rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
          >
            <X size={12} />
          </button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {selectedRows.length > 0 ? (
          <>
            <span className="text-xs font-medium text-[var(--text-primary)]">已选 {selectedRows.length} 项</span>
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] hover:border-[var(--border-strong)]"
            >
              <X size={11} />
              清除
            </button>
            <span className="mx-1 h-4 w-px bg-[var(--border-subtle)]" aria-hidden />
          </>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">最近一次写入</span>
        )}

        {STATUS_KEYS.map((status, index) => (
          <button
            key={status}
            type="button"
            disabled={busy || mapping.targets.length === 0}
            onClick={() => onStatus(status)}
            title={mapping.skipped.length > 0 ? `${mapping.skipped.length} 项聚合实体不参与状态批量修改` : undefined}
            className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="mr-1 text-[10px] text-[var(--text-muted)]">{index + 1}</span>
            {STATUS_LABELS[status]}
          </button>
        ))}

        <div className="relative">
          <button
            type="button"
            disabled={busy || mapping.targets.length === 0 || db === null}
            onClick={() => setPickerOpen((open) => !open)}
            className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FolderPlus size={11} />
            加入词集
          </button>
          {pickerOpen && db && (
            <CollectionPicker
              db={db}
              targets={mapping.targets}
              onClose={() => setPickerOpen(false)}
              onDone={(text) => {
                setPickerOpen(false);
                onMessage(text);
              }}
            />
          )}
        </div>

        {mapping.skipped.length > 0 && (
          <span className="text-[11px] text-[var(--text-muted)]">{mapping.skipped.length} 项聚合实体已跳过（在其成员词形上标记）</span>
        )}
        {busy && <Loader2 size={13} className="animate-spin text-[var(--accent-primary)]" />}
        {message && <span className="text-[11px] text-[var(--accent-hover)]">{message}</span>}
        <span className="ml-auto hidden text-[10px] text-[var(--text-muted)] md:inline">
          ↑↓ 移动 · Shift 连选 · 空格选择 · Enter 详情 · 1–5 状态
        </span>
      </div>
    </div>
  );
}

function CollectionPicker({
  db,
  targets,
  onClose,
  onDone,
}: {
  db: LexicalWorkbenchDB;
  targets: readonly TargetRef[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [collections, setCollections] = useState<StaticCollection[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = new DexieCollections(db.collections);
    let cancelled = false;
    void api
      .list()
      .then((list) => {
        const staticOnly = list.filter((collection): collection is StaticCollection => collection.kind === 'static');
        if (!cancelled) setCollections(staticOnly);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const addTo = async (id: string): Promise<void> => {
    try {
      const api = new DexieCollections(db.collections);
      const next = await api.addTargets(id, targets);
      onDone(`已加入「${next.name}」（${targets.length} 个目标）`);
    } catch (cause) {
      setError(cause instanceof CollectionError ? cause.message : cause instanceof Error ? cause.message : String(cause));
    }
  };

  const createAndAdd = async (): Promise<void> => {
    try {
      const api = new DexieCollections(db.collections);
      const created = await api.createStatic({ name, targets });
      onDone(`已新建「${created.name}」并加入 ${targets.length} 个目标`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="absolute bottom-full right-0 z-40 mb-1 w-72 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 shadow-[0_10px_28px_rgba(15,20,30,0.16)]">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[10px] text-[var(--text-muted)]">加入静态词集（保存的目标列表，与投影集合无关）</span>
        <button type="button" onClick={onClose} className="text-[var(--text-muted)]" aria-label="关闭词集选择">
          <X size={12} />
        </button>
      </div>
      {error && <p className="px-1 py-1 text-[11px] text-rose-600">{error}</p>}
      {collections === null ? (
        <p className="px-1 py-2 text-[11px] text-[var(--text-muted)]">读取词集…</p>
      ) : collections.length === 0 ? (
        <p className="px-1 py-2 text-[11px] text-[var(--text-muted)]">还没有静态词集，先在下面新建一个。</p>
      ) : (
        <ul className="max-h-40 overflow-y-auto">
          {collections.map((collection) => (
            <li key={collection.id}>
              <button
                type="button"
                onClick={() => void addTo(collection.id)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                <span className="truncate">{collection.name}</span>
                <span className="ml-2 shrink-0 text-[10px] text-[var(--text-muted)]">{collection.targets.length}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex items-center gap-1 border-t border-[var(--border-subtle)] pt-1">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="新词集名称"
          aria-label="新词集名称"
          className="w-full rounded border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-primary)]"
        />
        <button
          type="button"
          disabled={name.trim().length === 0}
          onClick={() => void createAndAdd()}
          className="shrink-0 rounded bg-[var(--accent-primary)] px-2 py-1 text-[11px] text-white disabled:opacity-40"
        >
          新建
        </button>
      </div>
    </div>
  );
}
