/**
 * App shell (PRODUCT_SPEC §2 as re-cut by Shape Brief §2.1): a top masthead (workspace clauses,
 * global search, engine/learning indicators), the workspace area, and a route-driven detail host
 * that floats over content by default (docked when pinned or on ≥1600px canvases).
 *
 * The shell owns three cross-cutting behaviours:
 *   - the global search shortcut (`Ctrl/⌘K`, `/`),
 *   - engine loading / failure states with an explicit retry,
 *   - route-driven detail: `ref` opens the panel, closing it rewrites the route (so back works).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { EntityRef, LexQuery } from '../../v2/index.ts';
import { DetailHost } from '../detail/DetailHost.tsx';
import { useEngine } from '../providers/EngineProvider.tsx';
import { useLearning } from '../providers/LearningProvider.tsx';
import { useRoute } from '../providers/RouteProvider.tsx';
import { isWorkspaceId } from '../routing/codec.ts';
import { SearchPalette } from '../search/SearchPalette.tsx';
import { Masthead } from './Masthead.tsx';
import { MobileTabBar } from './MobileTabBar.tsx';
import { WorkspacePlaceholder } from './WorkspacePlaceholder.tsx';
import { WORKSPACE_META } from './workspaceMeta.ts';
import { ExploreWorkspace } from '../workspaces/explore/ExploreWorkspace.tsx';

export function Shell() {
  const { route, navigate } = useRoute();
  const { client, status, ready, error, retry } = useEngine();
  const learning = useLearning();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const workspace = isWorkspaceId(route.workspace) ? route.workspace : 'explore';
  const meta = WORKSPACE_META[workspace];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key === '/' && !typing) {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openInExplore = useCallback(
    (query: LexQuery) => {
      navigate({ workspace: 'explore', query, ref: route.ref });
    },
    [navigate, route.ref]
  );

  const openRef = useCallback(
    (ref: EntityRef) => {
      navigate({ ...route, ref });
    },
    [navigate, route]
  );

  const closeRef = useCallback(() => {
    const next = { ...route };
    delete next.ref;
    navigate(next);
  }, [navigate, route]);

  // Explore is the first real workspace (T05); the rest stay placeholders until their tasks.
  const content = useMemo(
    () => (workspace === 'explore' ? <ExploreWorkspace /> : <WorkspacePlaceholder workspace={workspace} route={route} />),
    [workspace, route]
  );

  const readySummary = ready
    ? `数据源 ${ready.sources.join(' · ')} · 构建 ${Math.round(ready.buildMs)} ms · 诊断 ${ready.diagnostics.length} 条`
    : null;

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--bg-canvas)]">
        <Loader2 size={28} className="animate-spin text-[var(--accent-primary)]" />
        <p className="text-sm font-medium text-[var(--text-primary)]">正在构建索引…</p>
        <p className="max-w-sm text-center text-xs text-[var(--text-muted)]">
          三个数据源（COCA 2020 / BNC-COCA 25k / CET 2016）在后台 Worker 中解析，主线程保持可用。
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--bg-canvas)] px-6">
        <AlertTriangle size={28} className="text-[var(--official)]" />
        <p className="text-sm font-medium text-[var(--text-primary)]">索引构建失败</p>
        <p className="max-w-lg break-words rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-center text-xs text-[var(--text-secondary)]">
          {error?.message ?? '未知错误'}
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-md bg-[var(--accent-primary)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)]"
        >
          重新构建
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-[var(--bg-canvas)]">
      <Masthead
        active={workspace}
        engineStatus={status}
        learningStatus={learning.status}
        readySummary={readySummary}
        onSelect={(next) => navigate({ workspace: next })}
        onOpenSearch={() => setPaletteOpen(true)}
      />

      {learning.status === 'error' && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle size={12} />
          本地学习数据不可用（IndexedDB 被禁用或损坏），检索仍可使用；
          <button type="button" className="underline" onClick={learning.reload}>
            重试
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{content}</main>

        <DetailHost
          client={client}
          entityRef={route.ref}
          onClose={closeRef}
          onOpenRef={openRef}
          onOpenInExplore={openInExplore}
        />
      </div>

      <MobileTabBar active={workspace} onSelect={(next) => navigate({ workspace: next })} />

      <SearchPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
