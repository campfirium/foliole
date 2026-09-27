import { useEffect, useState } from 'react';

import type { NativeWatchedFolderBindingsState } from '../../../lib/platform/nativeWatchedFolderContract';
import { onDesktopSyncGroupOverviewChanged } from '../../shared/platform/desktopSyncGroupRuntimeRepository';
import { loadWatchedFolderBindingsFromRuntime } from '../../shared/platform/import/watchedFolderRuntimeRepository';

export function useWatchedFolderBindingState() {
  const [state, setState] = useState<NativeWatchedFolderBindingsState | null>(null);
  const refresh = () => void loadWatchedFolderBindingsFromRuntime().then(setState).catch(() => undefined);
  useEffect(() => {
    refresh();
    const unsubscribe = onDesktopSyncGroupOverviewChanged(refresh);
    return () => unsubscribe?.();
  }, []);
  return { refresh, state };
}
