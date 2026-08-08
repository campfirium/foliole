import { useCallback, useMemo, useState } from 'react';

import type { DesktopCompanionPairingOverviewPayload } from '../../../lib/platform/nativeCompanionSyncContract';

import { useDesktopSyncGroupJoinActions } from './desktop/useSyncGroupJoinActions';
import {
  EMPTY_DESKTOP_COMPANION_PAIRING_OVERVIEW,
  useCompanionPairingPolling,
  useCompanionPairingPushRefresh,
  useCompanionPairingRefresh
} from './desktopCompanionPairingOverviewHooks';
import {
  disableDesktopCompanionSync,
  enableDesktopCompanionSync,
  createDesktopSyncGroup,
  approveDesktopCompanionPairRequest,
  clearDesktopCompanionPairedDevices,
  removeDesktopCompanionPairedDevice,
  rejectDesktopCompanionPairRequest
} from './desktopCompanionPairingRuntimeRepository';
import { isDesktopRuntime } from './runtime';

function useDesktopCompanionPairingOverviewState() {
  const [overview, setOverview] = useState<DesktopCompanionPairingOverviewPayload>(
    EMPTY_DESKTOP_COMPANION_PAIRING_OVERVIEW
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  return { error, isLoading, overview, pendingActionId, setError, setIsLoading, setOverview, setPendingActionId };
}

function useCompanionPairingAction(
  setOverview: (value: DesktopCompanionPairingOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void,
  setPendingActionId: (value: string | null) => void
) {
  return useCallback(async (pairRequestId: string, action: 'approve' | 'reject') => {
    setPendingActionId(pairRequestId);
    try {
      const nextOverview =
        action === 'approve'
          ? await approveDesktopCompanionPairRequest(pairRequestId)
          : await rejectDesktopCompanionPairRequest(pairRequestId);
      setOverview(nextOverview);
      setError(null);
      return nextOverview;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to update companion pairing request.');
      throw actionError;
    } finally {
      setPendingActionId(null);
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setOverview, setPendingActionId]);
}

function useClearPairedDevicesAction(
  setOverview: (value: DesktopCompanionPairingOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void,
  setPendingActionId: (value: string | null) => void
) {
  return useCallback(async () => {
    setPendingActionId('clear-paired-devices');
    try {
      const nextOverview = await clearDesktopCompanionPairedDevices();
      setOverview(nextOverview);
      setError(null);
      return nextOverview;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to clear paired companion devices.');
      throw actionError;
    } finally {
      setPendingActionId(null);
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setOverview, setPendingActionId]);
}

function useRemovePairedDeviceAction(
  setOverview: (value: DesktopCompanionPairingOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void,
  setPendingActionId: (value: string | null) => void
) {
  return useCallback(async (deviceId: string) => {
    const actionId = `remove-paired-device:${deviceId}`;
    setPendingActionId(actionId);
    try {
      const nextOverview = await removeDesktopCompanionPairedDevice(deviceId);
      setOverview(nextOverview);
      setError(null);
      return nextOverview;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to disconnect companion device.');
      throw actionError;
    } finally {
      setPendingActionId(null);
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setOverview, setPendingActionId]);
}

function useToggleCompanionSyncAction(
  setOverview: (value: DesktopCompanionPairingOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void,
  setPendingActionId: (value: string | null) => void
) {
  return useCallback(async (enabled: boolean) => {
    setPendingActionId(enabled ? 'enable-sync' : 'disable-sync');
    try {
      const nextOverview = enabled ? await enableDesktopCompanionSync() : await disableDesktopCompanionSync();
      setOverview(nextOverview);
      setError(null);
      return nextOverview;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to update device sync availability.');
      throw actionError;
    } finally {
      setPendingActionId(null);
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setOverview, setPendingActionId]);
}

function useCreateSyncGroupAction(
  setOverview: (value: DesktopCompanionPairingOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void,
  setPendingActionId: (value: string | null) => void
) {
  return useCallback(async () => {
    setPendingActionId('create-sync-group');
    try {
      const nextOverview = await createDesktopSyncGroup();
      setOverview(nextOverview);
      setError(null);
      return nextOverview;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to create Sync Group.');
      throw actionError;
    } finally {
      setPendingActionId(null);
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setOverview, setPendingActionId]);
}

export function useDesktopCompanionPairingRequests(pollMs = 2_000) {
  const state = useDesktopCompanionPairingOverviewState();
  const refresh = useCompanionPairingRefresh(state.setOverview, state.setError, state.setIsLoading);
  const runAction = useCompanionPairingAction(
    state.setOverview,
    state.setError,
    state.setIsLoading,
    state.setPendingActionId
  );
  const clearPairedDevices = useClearPairedDevicesAction(
    state.setOverview,
    state.setError,
    state.setIsLoading,
    state.setPendingActionId
  );
  const removePairedDevice = useRemovePairedDeviceAction(
    state.setOverview,
    state.setError,
    state.setIsLoading,
    state.setPendingActionId
  );
  const toggleSync = useToggleCompanionSyncAction(
    state.setOverview,
    state.setError,
    state.setIsLoading,
    state.setPendingActionId
  );
  const createSyncGroup = useCreateSyncGroupAction(
    state.setOverview,
    state.setError,
    state.setIsLoading,
    state.setPendingActionId
  );
  const join = useDesktopSyncGroupJoinActions(state);
  useCompanionPairingPushRefresh(refresh);
  useCompanionPairingPolling(pollMs, state.setOverview, state.setError, state.setIsLoading);

  return useMemo(
    () => ({
      approveRequest: (pairRequestId: string) => runAction(pairRequestId, 'approve'),
      createSyncGroup,
      clearPairedDevices,
      completeSyncGroupJoin: join.completeJoin,
      removePairedDevice,
      discoverSyncGroups: join.discoverGroups,
      disableSync: () => toggleSync(false),
      enableSync: () => toggleSync(true),
      error: state.error,
      isDesktopRuntime: isDesktopRuntime(),
      isLoading: state.isLoading,
      overview: state.overview,
      pendingActionId: state.pendingActionId,
      refresh,
      requestSyncGroupJoin: join.requestJoin,
      rejectRequest: (pairRequestId: string) => runAction(pairRequestId, 'reject')
    }),
    [clearPairedDevices, createSyncGroup, join.completeJoin, join.discoverGroups, join.requestJoin, removePairedDevice,
      refresh, runAction, state.error, state.isLoading, state.overview, state.pendingActionId, toggleSync]
  );
}
