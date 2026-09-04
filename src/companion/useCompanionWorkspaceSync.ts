import { useCallback, useEffect, useState } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { publishCompanionSyncMutationRevision } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { leaveCompanionSyncGroupDevice } from '../shared/platform/companion/sync/syncGroupStore';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { loadCompanionSyncNodeConflicts } from '../shared/platform/companionSyncObjects';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import type { CompanionManualSyncAction } from './companionManualSyncAction';
import { hydrateCompanionReviewSchedulerSettings } from './companionReviewSchedulerSettingsHydration';
import { runCompanionSyncCoordinator } from './companionSyncCoordinator';
import { mergeCompanionSyncProgressSession } from './companionSyncProgressSession';
import { hydrateCompanionSystemEntryDisplayNames } from './companionSystemEntryDisplayNamesHydration';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import {
  type CompanionWorkspaceSyncStatus,
  syncReadableArticle
} from './companionWorkspaceSyncFlow';
import { useCompanionSyncGroupJoin } from './useCompanionSyncGroupJoin';
import { useForegroundAutoSync } from './useCompanionWorkspaceAutoSync';
import { useCompanionWorkspaceParticipationActions } from './useCompanionWorkspaceParticipationActions';

const EMPTY_SYNC_STATE: NativeCompanionWorkspaceSyncState = {
  endpoint_url: null,
  last_synced_at: null,
  remembered_targets: [],
  sync_events: [],
  sync_onboarding_status: 'pending',
  workspace_snapshot: null
};

async function initializeWorkspaceSyncState(args: {
  cancelled: () => boolean;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setIsStateReady(ready: boolean): void;
  setSyncConflictCount(count: number): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
}) {
  const nextState = await loadCompanionWorkspaceSyncState();
  if (args.cancelled()) {
    return;
  }
  args.setState(nextState);
  args.setReadableArticle(await syncReadableArticle(nextState.workspace_snapshot));
  args.setSyncConflictCount((await loadCompanionSyncNodeConflicts()).length);
  await hydrateCompanionReviewSchedulerSettings().catch(() => null);
  await hydrateCompanionSystemEntryDisplayNames().catch(() => null);
  args.setIsStateReady(true);
  args.setStatus('idle');
}

function useWorkspaceSyncBootstrap(
  setIsStateReady: (ready: boolean) => void,
  setReadableArticle: (article: CompanionReadableArticle | null) => void,
  setSyncConflictCount: (count: number) => void,
  setState: (state: NativeCompanionWorkspaceSyncState) => void,
  setStatus: (status: CompanionWorkspaceSyncStatus) => void
) {
  useEffect(() => {
    let cancelled = false;

    void initializeWorkspaceSyncState({
      cancelled: () => cancelled,
      setIsStateReady,
      setReadableArticle,
      setSyncConflictCount,
      setState,
      setStatus
    })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setIsStateReady(true);
        setStatus('idle');
      });

    return () => {
      cancelled = true;
    };
  }, [setIsStateReady, setReadableArticle, setSyncConflictCount, setState, setStatus]);
}

async function leaveCompanionWorkspaceSyncGroup(args: {
  saveEndpoint: (endpointUrl: string) => Promise<unknown>;
}) {
  await leaveCompanionSyncGroupDevice();
  publishCompanionSyncMutationRevision();
  await args.saveEndpoint('');
}

function useMergedCompanionSyncProgress() {
  const [syncProgress, setSyncProgress] = useState<CompanionDesktopSyncProgress | null>(null);
  const setMergedSyncProgress = useCallback((progress: CompanionDesktopSyncProgress | null) => {
    setSyncProgress((previous) => mergeCompanionSyncProgressSession(previous, progress));
  }, []);
  return [syncProgress, setMergedSyncProgress] as const;
}

function useCompanionSyncViewState() {
  const [state, setState] = useState<NativeCompanionWorkspaceSyncState>(EMPTY_SYNC_STATE);
  const [isWorkspaceSyncStateReady, setIsWorkspaceSyncStateReady] = useState(false);
  const [readableArticle, setReadableArticle] = useState<CompanionReadableArticle | null>(null);
  const [syncConflictCount, setSyncConflictCount] = useState(0);
  const [status, setStatus] = useState<CompanionWorkspaceSyncStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [manualSyncAction, setManualSyncAction] = useState<CompanionManualSyncAction | null>(null);
  return { error, isWorkspaceSyncStateReady, readableArticle, setError, setIsWorkspaceSyncStateReady,
    manualSyncAction, setManualSyncAction, setReadableArticle, setState, setStatus,
    setSyncConflictCount, state, status, syncConflictCount };
}

function useCompanionAutoSync(
  viewState: ReturnType<typeof useCompanionSyncViewState>,
  setSyncProgress: ReturnType<typeof useMergedCompanionSyncProgress>[1],
  groupReady: boolean,
  syncEnabled: boolean,
  syncPaused: boolean
) {
  const enabled = shouldEnableCompanionAutoSync({ groupReady, syncEnabled, syncPaused });
  useForegroundAutoSync(
    viewState.setError,
    viewState.setReadableArticle,
    viewState.setState,
    setSyncProgress,
    viewState.setStatus,
    enabled,
    viewState.state,
    runCompanionSyncCoordinator
  );
}

function createCompanionSnapshotActions(
  viewState: ReturnType<typeof useCompanionSyncViewState>,
  setSyncProgress: ReturnType<typeof useMergedCompanionSyncProgress>[1]
) {
  return createWorkspaceSnapshotActions({
    setError: viewState.setError,
    setReadableArticle: viewState.setReadableArticle,
    setSyncConflictCount: viewState.setSyncConflictCount,
    setState: viewState.setState,
    setManualSyncAction: viewState.setManualSyncAction,
    setSyncProgress,
    setStatus: viewState.setStatus,
    state: viewState.state
  });
}

export function shouldEnableCompanionAutoSync(args: {
  groupReady: boolean;
  syncEnabled: boolean;
  syncPaused: boolean;
}) {
  return args.groupReady && args.syncEnabled && !args.syncPaused;
}

export function useCompanionWorkspaceSync(bootstrapState: NativeCompanionBootstrapState) {
  const viewState = useCompanionSyncViewState();
  const { error, isWorkspaceSyncStateReady, readableArticle, setError, setIsWorkspaceSyncStateReady,
    manualSyncAction, setReadableArticle, setState, setStatus,
    setSyncConflictCount, state, status, syncConflictCount } = viewState;
  const [syncProgress, setMergedSyncProgress] = useMergedCompanionSyncProgress();
  const snapshotActions = createCompanionSnapshotActions(viewState, setMergedSyncProgress);
  const join = useCompanionSyncGroupJoin({
    bootstrapState,
    onError: setError,
    onSaveEndpoint: snapshotActions.saveEndpoint
  });
  const participationActions = useCompanionWorkspaceParticipationActions({ join, setError, snapshotActions });
  const leaveSyncGroup = useCallback(() => leaveCompanionWorkspaceSyncGroup({
    saveEndpoint: snapshotActions.saveEndpoint
  }), [snapshotActions.saveEndpoint]);
  useWorkspaceSyncBootstrap(setIsWorkspaceSyncStateReady, setReadableArticle, setSyncConflictCount, setState, setStatus);
  useCompanionAutoSync(
    viewState,
    setMergedSyncProgress,
    join.joined,
    participationActions.participation.sync_enabled,
    participationActions.participation.sync_paused
  );

  return {
    bootstrapState,
    clearError: () => setError(null),
    error,
    isWorkspaceSyncStateReady,
    manualSyncAction,
    readableArticle,
    syncParticipation: participationActions.participation,
    state,
    syncConflictCount,
    syncProgress,
    status,
    pullFromDesktop: participationActions.pullFromDevice,
    refreshFromDevice: snapshotActions.refreshFromDevice,
    removeRememberedTarget: snapshotActions.removeRememberedTarget,
    replaceSnapshot: snapshotActions.replaceSnapshot,
    saveEndpoint: snapshotActions.saveEndpoint,
    saveSyncOnboardingStatus: snapshotActions.saveSyncOnboardingStatus,
    cancelJoin: join.cancel,
    completeSyncGroupJoin: join.complete,
    syncGroupDiscoveries: join.discoveries,
    discoverSyncGroups: join.discover,
    syncGroupJoined: join.joined,
    pendingJoinRequest: join.pendingRequest,
    requestSyncGroupJoin: join.request,
    joinStatus: join.status,
    checkDesktop: participationActions.discover,
    completeJoin: participationActions.completeJoin,
    leaveSyncGroup,
    requestJoin: participationActions.requestJoin
  };
}
