import { useCallback } from 'react';

import type { DesktopCompanionPairingOverviewPayload } from '../../../../lib/platform/nativeCompanionSyncContract';
import {
  leaveDesktopSyncGroup,
  removeDesktopSyncGroupMember
} from '../desktopCompanionPairingRuntimeRepository';

interface MembershipActionState {
  setError(value: string | null): void;
  setIsLoading(value: boolean): void;
  setOverview(value: DesktopCompanionPairingOverviewPayload): void;
  setPendingActionId(value: string | null): void;
}

export function useSyncGroupMembershipActions(state: MembershipActionState) {
  const run = useCallback(async (action: 'leave' | 'remove', hostName?: string) => {
    state.setPendingActionId(action === 'leave' ? 'leave-sync-group' : `remove-sync-group-member:${hostName}`);
    try {
      const overview = action === 'leave'
        ? await leaveDesktopSyncGroup()
        : await removeDesktopSyncGroupMember(hostName!);
      state.setOverview(overview);
      state.setError(null);
      return overview;
    } catch (error) {
      state.setError(error instanceof Error ? error.message : 'Failed to update Sync Group membership.');
      throw error;
    } finally {
      state.setPendingActionId(null);
      state.setIsLoading(false);
    }
  }, [state]);
  return {
    leave: () => run('leave'),
    remove: (deviceId: string) => run('remove', deviceId)
  };
}
