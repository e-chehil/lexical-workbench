/**
 * Selection and receipt bar. Every bulk write is one visible batch with an undo that goes through
 * `store.undoBatch`; aggregate rows are reported as skipped instead of silently dropped.
 */
import { useState } from 'react';
import { Download, FolderPlus, Loader2, Undo2, X } from 'lucide-react';
import type { EntityRowDTO, LearningStatus } from '../../../v2/index.ts';
import type { LexicalWorkbenchDB } from '../../../v2/store/dexieStore.ts';
import { buildCsv } from '../../../v2/util/csv.ts';
import { CollectionDialog } from '../../collections/CollectionDialog.tsx';
import { STATUS_KEYS, STATUS_LABELS } from './filterState.ts';
import { targetsForRows } from './selection.ts';
import { cx } from '../../ui/index.tsx';

export interface BatchReceipt {
  batchId: string;
  targets: number;
  skipped: number;
  statusLabel: string;
  undone: boolean;
}

export function BulkBar({
  selectedRows,
  receipt,
  busy,
  message,
  db,
  version,
  onStatus,
  onClear,
  onUndoReceipt,
  onDismissReceipt,
  onMessage,
}: {
  selectedRows: EntityRowDTO[];
  receipt: BatchReceipt | null;
  busy: boolean;
  message: string | null;
  db: LexicalWorkbenchDB | null;
  version: number;
  onStatus: (status: LearningStatus) => void;
  onClear: () => void;
  onUndoReceipt: () => void;
  onDismissReceipt: () => void;
  onMessage: (message: string | null) => void;
}) {
  const [collectionOpen, setCollectionOpen] = useState(false);
  const mapping = targetsForRows(selectedRows);

  const exportCsv = (): void => {
    const header = ['target', 'label', 'kind', 'status'];
    const rows: (string | number)[][] = [];
    let skipped = 0;
    for (const row of selectedRows) {
      const target = targetsForRows([row]).targets[0];
      if (!target) {
        skipped++;
        continue;
      }
      rows.push([target, row.label, row.kind, row.status?.status ?? 'unrated']);
    }
    if (rows.length === 0) {
      onMessage('所选行都是聚合实体，没有可导出的学习目标');
      return;
    }
    const blob = new Blob([buildCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lexical-selection-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    onMessage(`已导出 ${rows.length} 行 CSV${skipped > 0 ? `（跳过 ${skipped} 个聚合行）` : ''}`);
  };

  return (
    <>
      <div className="shrink-0 border-t border-[var(--border-strong)] bg-[var(--bg-ink)] px-3 py-2 text-[var(--bg-surface)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono-tabular text-[10px] uppercase tracking-wider text-[var(--lime)]">SELECTED {selectedRows.length}</span>
          <span className="h-3 w-px bg-[var(--rail-line)]" aria-hidden />
          {STATUS_KEYS.map((status, index) => (
            <button
              key={status}
              type="button"
              disabled={busy || mapping.targets.length === 0}
              onClick={() => onStatus(status)}
              className={cx(
                'border border-[var(--rail-line)] px-2 py-1 text-[10px] text-[var(--bg-surface)] transition-colors hover:border-[var(--lime)] hover:text-[var(--lime)] disabled:opacity-40',
              )}
              title={`设置状态（${index + 1}）`}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
          <span className="mx-1 h-3 w-px bg-[var(--rail-line)]" aria-hidden />
          <button type="button" onClick={() => setCollectionOpen(true)} disabled={busy || mapping.targets.length === 0} className="inline-flex items-center gap-1 border border-[var(--rail-line)] px-2 py-1 text-[10px] hover:border-[var(--lime)] hover:text-[var(--lime)] disabled:opacity-40">
            <FolderPlus size={11} /> 加入词集
          </button>
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1 border border-[var(--rail-line)] px-2 py-1 text-[10px] hover:border-[var(--lime)] hover:text-[var(--lime)]">
            <Download size={11} /> CSV
          </button>
          <button type="button" onClick={onClear} className="ml-auto inline-flex items-center gap-1 px-1 py-1 text-[10px] text-[var(--bg-surface)]/70 hover:text-[var(--bg-surface)]">
            <X size={12} /> 清除选择
          </button>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--bg-surface)]/65">
          {mapping.skipped.length > 0 && <span>{mapping.skipped.length} 个聚合实体没有单一目标，已跳过</span>}
          {busy && <Loader2 size={11} className="animate-spin" />}
          {message && <span className="text-[var(--lime)]">{message}</span>}
          {receipt && !receipt.undone && (
            <span className="inline-flex items-center gap-2">
              已记 {receipt.targets} 个目标 → {receipt.statusLabel}
              {receipt.skipped > 0 && ` · 跳过 ${receipt.skipped}`}
              <button type="button" disabled={busy} onClick={onUndoReceipt} className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-[var(--lime)] disabled:opacity-40">
                <Undo2 size={10} /> 撤销批次 {receipt.batchId.slice(0, 8)}
              </button>
              <button type="button" onClick={onDismissReceipt} aria-label="关闭回执" className="opacity-60 hover:opacity-100"><X size={10} /></button>
            </span>
          )}
          {receipt?.undone && <span>批次 {receipt.batchId.slice(0, 8)} 已撤销</span>}
        </div>
      </div>

      <CollectionDialog
        open={collectionOpen}
        db={db}
        version={version}
        targets={mapping.targets}
        onClose={() => setCollectionOpen(false)}
        onDone={(text) => onMessage(text)}
      />
    </>
  );
}
