/**
 * v2 application root.
 *
 * Provider order matters: routing is pure state, the engine owns the worker, and the learning
 * store needs the engine client to push `syncLearning` snapshots.
 *
 * `#/legacy` renders the frozen v1 app through a lazy import, so the legacy bundle is a separate
 * chunk that only loads when someone asks for it.
 */
import { Suspense, lazy } from 'react';
import { EngineProvider } from './providers/EngineProvider.tsx';
import { LearningProvider } from './providers/LearningProvider.tsx';
import { RouteProvider, useRoute } from './providers/RouteProvider.tsx';
import { Shell } from './shell/Shell.tsx';

const LegacyApp = lazy(() => import('../App.tsx'));

function LegacyRoute() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-[var(--text-muted)]">正在载入旧版界面…</p>}>
      <LegacyApp />
    </Suspense>
  );
}

/** `#/legacy` does not need the v2 engine, so the legacy app is mounted without providers. */
function RoutedContent() {
  const { route } = useRoute();
  if (route.workspace === 'legacy') return <LegacyRoute />;
  return <V2Content />;
}

function V2Content() {
  return (
    <EngineProvider>
      <LearningProvider>
        <Shell />
      </LearningProvider>
    </EngineProvider>
  );
}

export default function Root() {
  return (
    <RouteProvider>
      <RoutedContent />
    </RouteProvider>
  );
}
