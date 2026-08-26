import { useCallback, useEffect, useMemo, useState } from 'react';

import type { DesktopSyncGroupOverviewPayload } from '../../../lib/platform/nativeCompanionSyncContract';
import { STOPPED_SYNC_GROUP_DISCOVERY } from '../../../lib/platform/syncGroupDiscoveryContract';

import {
  disableDesktopCompanionSync,
  enableDesktopCompanionSync,
  pauseDesktopCompanionSync,
  resumeDesktopCompanionSync
} from './desktop/companionSyncParticipationRuntime';
import { useSyncGroupDeviceActions } from './desktop/useSyncGroupDeviceActions';
import { useDesktopSyncGroupJoinActions } from './desktop/useSyncGroupJoinActions';
import {
  EMPTY_DESKTOP_SYNC_GROUP_OVERVIEW,
  useSyncGroupPushRefresh,
  useSyncGroupOverviewRefresh
} from './desktopSyncGroupOverviewHooks';
import {
  createDesktopSyncGroup,
  onDesktopSyncGroupDiscoveryChanged,
  acceptDesktopSyncGroupJoinRequest,
  rejectDesktopSyncGroupJoinRequest,
  syncDesktopCompanionNow,
  stopDiscoveringDesktopSyncGroups
} from './desktopSyncGroupRuntimeRepository';
import { isDesktopRuntime } from './runtime';

function useDesktopSyncGroupOverviewState() {
  const [overview, setOverview] = useState<DesktopSyncGroupOverviewPayload>(
    EMPTY_DESKTOP_SYNC_GROUP_OVERVIEW
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  return { error, isLoading, overview, pendingActionId, setError, setIsLoading, setOverview, setPendingActionId };
}

function useSyncGroupJoinRequestAction(
  setOverview: (value: DesktopSyncGroupOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void,
  setPendingActionId: (value: string | null) => void
) {
  return useCallback(async (
    requestId: string,
    action: 'accept' | 'reject'
  ) => {
    setPendingActionId(requestId);
    try {
      const nextOverview =
        action === 'accept'
          ? await acceptDesktopSyncGroupJoinRequest(requestId)
          : await rejectDesktopSyncGroupJoinRequest(requestId);
      setOverview(nextOverview);
      setError(null);
      return nextOverview;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to update Sync Group join request.');
      throw actionError;
    } finally {
      setPendingActionId(null);
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setOverview, setPendingActionId]);
}

function useToggleCompanionSyncAction(
  setOverview: (value: DesktopSyncGroupOverviewPayload) => void,
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
      setError(actionError instanceof Error ? actionError.message : 'Could not update Sync Group availability.');
      throw actionError;
    } finally {
      setPendingActionId(null);
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setOverview, setPendingActionId]);
}

function useToggleCompanionPauseAction(
  setOverview: (value: DesktopSyncGroupOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void,
  setPendingActionId: (value: string | null) => void
) {
  return useCallback(async (paused: boolean) => {
    setPendingActionId(paused ? 'pause-sync' : 'resume-sync');
    try {
      const nextOverview = paused ? await pauseDesktopCompanionSync() : await resumeDesktopCompanionSync();
      setOverview(nextOverview);
      setError(null);
      return nextOverview;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to update the sync pause state.');
      throw actionError;
    } finally {
      setPendingActionId(null);
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setOverview, setPendingActionId]);
}

function useCreateSyncGroupAction(
  setOverview: (value: DesktopSyncGroupOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void,
  setPendingActionId: (value: string | null) => void
) {
  return useCallback(async () => {
    setPendingActionId('create-sync-group');
    try {
      await stopDiscoveringDesktopSyncGroups();
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

function useSyncGroupMutationActions(state: ReturnType<typeof useDesktopSyncGroupOverviewState>) {
  const args = [state.setOverview, state.setError, state.setIsLoading, state.setPendingActionId] as const;
  return {
    createSyncGroup: useCreateSyncGroupAction(...args),
    device: useSyncGroupDeviceActions(state),
    runAction: useSyncGroupJoinRequestAction(...args),
    syncNow: useCallback(async () => {
      state.setPendingActionId('sync-now');
      try {
        const overview = await syncDesktopCompanionNow();
        state.setOverview(overview);
        state.setError(null);
        return overview;
      } catch (error) {
        state.setError(error instanceof Error ? error.message : 'Sync failed.');
        throw error;
      } finally {
        state.setPendingActionId(null);
      }
    }, [state]),
    togglePause: useToggleCompanionPauseAction(...args),
    toggleSync: useToggleCompanionSyncAction(...args)
  };
}

export function useDesktopSyncGroup() {
  const state = useDesktopSyncGroupOverviewState();
  const refresh = useSyncGroupOverviewRefresh(state.setOverview, state.setError, state.setIsLoading);
  const actions = useSyncGroupMutationActions(state);
  const join = useDesktopSyncGroupJoinActions(state);
  const [discovery, setDiscovery] = useState(STOPPED_SYNC_GROUP_DISCOVERY);
  useEffect(() => onDesktopSyncGroupDiscoveryChanged((snapshot) => {
    setDiscovery(snapshot);
    state.setOverview((current) => ({ ...current, join_candidates: snapshot.candidates }));
  }) ?? undefined, [state.setOverview]);
  useEffect(() => () => { void stopDiscoveringDesktopSyncGroups(); }, []);
  useSyncGroupPushRefresh(refresh);
  useEffect(() => { void refresh(); }, [refresh]);

  return useMemo(
    () => ({
      acceptRequest: (requestId: string) => actions.runAction(requestId, 'accept'),
      createSyncGroup: actions.createSyncGroup,
      completeSyncGroupJoin: join.completeJoin,
      discoverSyncGroups: join.discoverGroups,
      discovery,
      disableSync: () => actions.toggleSync(false),
      enableSync: () => actions.toggleSync(true),
      error: state.error,
      isDesktopRuntime: isDesktopRuntime(),
      isLoading: state.isLoading,
      leaveSyncGroup: actions.device.leave,
      overview: state.overview,
      pauseSync: () => actions.togglePause(true),
      pendingActionId: state.pendingActionId,
      refresh,
      requestSyncGroupJoin: join.requestJoin,
      rejectRequest: (requestId: string) => actions.runAction(requestId, 'reject'),
      resumeSync: () => actions.togglePause(false),
      syncNow: actions.syncNow
    }),
    [actions, discovery, join.completeJoin, join.discoverGroups, join.requestJoin, refresh, state.error, state.isLoading,
      state.overview, state.pendingActionId]
  );
}
