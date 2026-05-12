import { useEffect } from 'react';

import { loadRuntimeRemovedSources } from '../../shared/platform/removedSourcesRuntimeRepository';

export function useRemovedSourcesWarmup(isWorkspaceHydrated: boolean) {
  useEffect(() => {
    if (isWorkspaceHydrated) {
      void loadRuntimeRemovedSources();
    }
  }, [isWorkspaceHydrated]);
}
