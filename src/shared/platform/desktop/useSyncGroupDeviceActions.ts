import { useCallback } from 'react';

import type { DesktopSyncGroupOverviewPayload } from '../../../../lib/platform/nativeCompanionSyncContract';
import { leaveDesktopSyncGroup } from '../desktopSyncGroupRuntimeRepository';

interface DeviceActionState {
  setError(value: string | null): void;
  setIsLoading(value: boolean): void;
  setOverview(value: DesktopSyncGroupOverviewPayload): void;
  setPendingActionId(value: string | null): void;
}

export function useSyncGroupDeviceActions(state: DeviceActionState) {
  const run = useCallback(async () => {
    state.setPendingActionId('leave-sync-group');
    try {
      const overview = await leaveDesktopSyncGroup();
      state.setOverview(overview);
      state.setError(null);
      return overview;
    } catch (error) {
      state.setError(error instanceof Error ? error.message : 'Failed to update this Sync Group Device.');
      throw error;
    } finally {
      state.setPendingActionId(null);
      state.setIsLoading(false);
    }
  }, [state]);
  return {
    leave: run
  };
}
