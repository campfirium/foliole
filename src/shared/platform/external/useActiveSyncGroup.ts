import { useCallback, useEffect, useState } from 'react';

import { onDesktopSyncGroupJoinRequestsChanged } from '../desktopSyncGroupRuntimeRepository';
import { loadRuntimeActiveSyncGroupDevice } from '../externalSearchRuntimeRepository';

export function useActiveSyncGroup() {
  const [isActive, setIsActive] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setIsActive(await loadRuntimeActiveSyncGroupDevice());
    } catch {
      setIsActive(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onDesktopSyncGroupJoinRequestsChanged(() => {
      void refresh();
    }) ?? undefined;
  }, [refresh]);

  return isActive;
}
