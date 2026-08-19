import { useCallback, useEffect, useState } from 'react';

import { onDesktopCompanionPairingRequestsChanged } from '../desktopCompanionPairingRuntimeRepository';
import { loadRuntimeActiveSyncGroupMembership } from '../externalSearchRuntimeRepository';

export function useActiveSyncGroupMembership() {
  const [isActive, setIsActive] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setIsActive(await loadRuntimeActiveSyncGroupMembership());
    } catch {
      setIsActive(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onDesktopCompanionPairingRequestsChanged(() => {
      void refresh();
    }) ?? undefined;
  }, [refresh]);

  return isActive;
}
