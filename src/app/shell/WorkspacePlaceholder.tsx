/**
 * Workspace placeholder (V2-T04 boundary: no workspace content yet).
 *
 * It still shows the state the route carries — the encoded query and the selected ref — because
 * that is what the next tasks consume, and it makes routing verifiable in the browser.
 */
import { WORKSPACE_META } from './workspaceMeta.ts';
import type { AppRoute, WorkspaceId } from '../routing/codec.ts';

export interface WorkspacePlaceholderProps {
  workspace: WorkspaceId;
  route: AppRoute;
}

export function WorkspacePlaceholder({ workspace, route }: WorkspacePlaceholderProps) {
  const meta = WORKSPACE_META[workspace];
  const Icon = meta.icon;

  return (
    <section className="mx-auto w-full max-w-3xl overflow-y-auto px-6 py-10">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-hover)]">
            <Icon size={20} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {meta.name}
              <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{meta.label}</span>
            </h2>
            <p className="text-xs text-[var(--text-muted)]">{meta.description}</p>
          </div>
        </div>

        <p className="mb-4 rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          该工作区的内容由 <span className="font-mono">{meta.plannedIn}</span> 实现；本轮只提供应用外壳、路由与数据通道。
        </p>

        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border-subtle)] px-3 py-2">
            <dt className="text-[11px] text-[var(--text-muted)]">路由中的查询</dt>
            <dd className="mt-1 break-all font-mono text-[11px] text-[var(--text-secondary)]">
              {route.query ? JSON.stringify(route.query) : '（无）'}
            </dd>
          </div>
          <div className="rounded-lg border border-[var(--border-subtle)] px-3 py-2">
            <dt className="text-[11px] text-[var(--text-muted)]">选中的实体</dt>
            <dd className="mt-1 break-all font-mono text-[11px] text-[var(--text-secondary)]">{route.ref ?? '（无）'}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
