/**
 * Application root. Provider order matters: routing is pure state, the engine owns the worker,
 * and the learning store needs the engine client to push `syncLearning` snapshots.
 */
import { EngineProvider } from './providers/EngineProvider.tsx';
import { LearningProvider } from './providers/LearningProvider.tsx';
import { RouteProvider } from './providers/RouteProvider.tsx';
import { Shell } from './shell/Shell.tsx';

export default function Root() {
  return (
    <RouteProvider>
      <EngineProvider>
        <LearningProvider>
          <Shell />
        </LearningProvider>
      </EngineProvider>
    </RouteProvider>
  );
}
