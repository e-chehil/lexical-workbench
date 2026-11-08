/**
 * Application shell (Observatory direction).
 *
 * Desktop: a dark numbered rail, a canvas top bar, the workspace surface and a docked inspector.
 * Mobile: a compact top bar, the workspace surface and a four-slot bottom bar.
 *
 * Cross-cutting concerns owned here: the global search shortcut, the engine loading/failure
 * states, the IndexedDB-unavailable banner, and route-driven detail (open/close is a route edit,
 * so back/forward and shared links always agree with the panel).
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { kindOf, type EntityRef, type LexQuery } from '../../v2/index.ts';
import { DetailHost } from '../detail/DetailHost.tsx';
import { useEngine } from '../providers/EngineProvider.tsx';
import { useLearning } from '../providers/LearningProvider.tsx';
import { useRoute } from '../providers/RouteProvider.tsx';
import { isWorkspaceId, type WorkspaceId } from '../routing/codec.ts';
import { SearchPalette } from '../search/SearchPalette.tsx';
import { useMediaQuery } from './useMediaQuery.ts';
import { AppTopBar } from './AppTopBar.tsx';
import { MobileNav } from './MobileNav.tsx';
import { Sidebar } from './Sidebar.tsx';
import { WORKSPACE_META, WORKSPACE_ORDER } from './workspaceMeta.ts';
import { ExploreWorkspace } from '../workspaces/explore/ExploreWorkspace.tsx';
import { Spinner } from '../ui/index.tsx';

// Non-default workspaces are route-level chunks: the first paint only pays for Explore.
const CorpusLabWorkspace = lazy(() => import('../workspaces/corpus/CorpusLabWorkspace.tsx').then((m) => ({ default: m.CorpusLabWorkspace })));
const FamilyAtlasWorkspace = lazy(() => import('../workspaces/family/FamilyAtlasWorkspace.tsx').then((m) => ({ default: m.FamilyAtlasWorkspace })));
const StudyWorkspace = lazy(() => import('../workspaces/study/StudyWorkspace.tsx').then((m) => ({ default: m.StudyWorkspace })));
const InsightsWorkspace = lazy(() => import('../workspaces/insights/InsightsWorkspace.tsx').then((m) => ({ default: m.InsightsWorkspace })));
const DataStudioWorkspace = lazy(() => import('../workspaces/data/DataStudioWorkspace.tsx').then((m) => ({ default: m.DataStudioWorkspace })));

function WorkspaceSurface({ workspace }: { workspace: WorkspaceId }) {
  switch (workspace) {
    case 'explore':
      return <ExploreWorkspace />;
    case 'corpus':
      return <CorpusLabWorkspace />;
    case 'family':
      return <FamilyAtlasWorkspace />;
    case 'study':
      return <StudyWorkspace />;
    case 'insights':
      return <InsightsWorkspace />;
    case 'data':
      return <DataStudioWorkspace />;
  }
}

export function Shell() {
  const { route, navigate } = useRoute();
  const { client, status, ready, error, retry } = useEngine();
  const learning = useLearning();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tablet = useMediaQuery('(min-width: 768px)');

  const workspace = isWorkspaceId(route.workspace) ? route.workspace : 'explore';

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
      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setDrawerOpen(false);
      }
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

  const content = useMemo(
    () => (
      <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner label="载入工作区…" /></div>}>
        <WorkspaceSurface workspace={workspace} />
      </Suspense>
    ),
    [workspace]
  );
  // Family refs are rendered inside Family Atlas itself; other refs use the global inspector.
  const detailRef =
    workspace === 'family' && tablet && route.ref
      ? (() => {
          try {
            return kindOf(route.ref!) === 'bnc_family' ? undefined : route.ref;
          } catch {
            return route.ref;
          }
        })()
      : route.ref;
  const readySummary = ready
    ? `数据源 ${ready.sources.join(' · ')} · 构建 ${Math.round(ready.buildMs)} ms · 诊断 ${ready.diagnostics.length} 条`
    : null;

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-canvas)] px-6">
        <div className="w-full max-w-md border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6">
          <p className="eyebrow">Lexical Workbench / bootstrap</p>
          <p className="mt-2 font-display text-[30px] font-semibold leading-none">
            Building the index<span className="text-[var(--signal)]">.</span>
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
            COCA 2020 / BNC-COCA 25k / CET 2016 正在后台 Worker 中解析。主线程保持可用，索引只构建一次。
          </p>
          <p className="mt-4 inline-flex items-center gap-2 font-mono-tabular text-[11px] text-[var(--text-secondary)]">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            正在读取 {`public/data`} …
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-canvas)] px-6">
        <div className="w-full max-w-lg border border-[var(--signal)] bg-[var(--bg-surface)] p-6">
          <p className="eyebrow text-[var(--signal)]">Index failure</p>
          <p className="mt-2 font-display text-[26px] font-semibold leading-tight">索引没有建成</p>
          <p className="mt-3 break-words border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 font-mono-tabular text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {error?.message ?? '未知错误'}
          </p>
          <button type="button" onClick={retry} className="btn btn-primary mt-4">
            重新构建索引
          </button>
        </div>
      </div>
    );
  }

  if (!learning.customSourcesReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-canvas)] px-6">
        <div className="w-full max-w-md border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6">
          <p className="eyebrow">Lexical Workbench / custom sources</p>
          <p className="mt-2 font-display text-[26px] font-semibold leading-none">Applying local sources<span className="text-[var(--signal)]">.</span></p>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-muted)]">正在把本机保存的自定义数据源应用到 Worker 索引；来源文件本身没有被修改。</p>
          <p className="mt-4 inline-flex items-center gap-2 font-mono-tabular text-[11px] text-[var(--text-secondary)]"><Loader2 size={14} className="animate-spin" aria-hidden /> rebuilding…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 bg-[var(--bg-canvas)]">
      <Sidebar
        active={workspace}
        engineStatus={status}
        learningStatus={learning.status}
        readySummary={readySummary}
        onSelect={(next) => navigate({ workspace: next })}
        onOpenSearch={() => setPaletteOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopBar
          workspace={workspace}
          engineStatus={status}
          learningStatus={learning.status}
          onOpenSearch={() => setPaletteOpen(true)}
          onOpenMobileNav={() => setDrawerOpen(true)}
        />

        {learning.customSourceError && (
          <div className="flex items-center gap-2 border-b border-[var(--signal)]/40 bg-[var(--signal-soft)] px-4 py-1.5 text-[11px] text-[var(--signal-hover)]">
            <AlertTriangle size={12} aria-hidden />
            自定义数据源未能应用，当前继续使用原始来源：{learning.customSourceError}
          </div>
        )}

        {learning.status === 'error' && (
          <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-900">
            <AlertTriangle size={12} aria-hidden />
            本地学习数据不可用（IndexedDB 被禁用或损坏），检索仍可使用。
            <button type="button" className="underline" onClick={learning.reload}>
              重试
            </button>
          </div>
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1 pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:pb-0">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{content}</main>
          <DetailHost client={client} entityRef={detailRef} onClose={closeRef} onOpenRef={openRef} onOpenInExplore={openInExplore} />
        </div>

        <MobileNav active={workspace} onSelect={(next) => navigate({ workspace: next })} />
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-[#101613]/45 lg:hidden" onMouseDown={() => setDrawerOpen(false)}>
          <div className="rise-in h-full w-[85%] max-w-xs bg-[var(--rail)] px-4 py-5 text-[var(--rail-text)]" onMouseDown={(event) => event.stopPropagation()}>
            <p className="font-display text-[26px] font-semibold leading-none">
              Lexical<span className="text-[var(--lime)]">.</span>
            </p>
            <p className="eyebrow-on-rail mt-2">Workbench / Observatory</p>
            <nav className="mt-6" aria-label="工作区导航（移动端抽屉）">
              {WORKSPACE_ORDER.map((id) => {
                const meta = WORKSPACE_META[id];
                const Icon = meta.icon;
                const current = id === workspace;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      navigate({ workspace: id });
                      setDrawerOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 border-l-2 px-3 py-3 text-left ${
                      current ? 'border-[var(--lime)] bg-[var(--lime-dim)] text-[var(--rail-text)]' : 'border-transparent text-[var(--rail-muted)]'
                    }`}
                  >
                    <Icon size={15} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px]">{meta.label}</span>
                      <span className="block font-mono-tabular text-[9px] uppercase tracking-widest opacity-55">{meta.name}</span>
                    </span>
                    <span className="font-mono-tabular text-[9px] opacity-45">{meta.index}</span>
                  </button>
                );
              })}
            </nav>
            <p className="mt-6 text-[10px] leading-relaxed text-[var(--rail-muted)]/80">
              学习记录与词集保存在本机 IndexedDB；数据源随应用离线缓存。
            </p>
          </div>
        </div>
      )}

      <SearchPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
