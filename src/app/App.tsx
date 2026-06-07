import { Suspense, lazy, useEffect } from 'react';

import { createStartupBootSurfaceModel, StartupSurface } from '../shared/ui/StartupSurface';

const AppRuntime = lazy(() =>
  import('./AppRuntime').then((module) => ({ default: module.AppRuntime }))
);

function useWorkspaceHydrationPreload() {
  useEffect(() => {
    let cancelled = false;
    void import('../store/workspaceStoreHydration').then(({ ensureWorkspaceHydrated }) => {
      if (!cancelled) {
        void ensureWorkspaceHydrated();
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
}

export function App() {
  useWorkspaceHydrationPreload();

  return (
    <Suspense fallback={<StartupSurface model={createStartupBootSurfaceModel()} />}>
      <AppRuntime />
    </Suspense>
  );
}
