import { useCallback, useEffect, useState } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { isCompanionPairingSyncUsable } from '../shared/platform/companionPairingState';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { loadCompanionSyncNodeConflicts } from '../shared/platform/companionSyncObjects';
import {
  clearCompanionPairingCredentials,
  loadCompanionWorkspaceSyncState
} from '../shared/platform/companionWorkspaceSync';

import { isCompanionAutoSyncEligible } from './companionAutoSyncEligibility';
import type { CompanionManualSyncAction } from './companionManualSyncAction';
import { hydrateCompanionReviewSchedulerSettings } from './companionReviewSchedulerSettingsHydration';
import { useCompanionSyncGroupProviderAvailability } from './companionSyncGroupProviderAvailability';
import { mergeCompanionSyncProgressSession } from './companionSyncProgressSession';
import { hydrateCompanionSystemEntryDisplayNames } from './companionSystemEntryDisplayNamesHydration';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import {
  type CompanionWorkspaceSyncStatus,
  syncReadableArticle,
  tryForegroundAutoSync
} from './companionWorkspaceSyncFlow';
import { useForegroundAutoSync } from './useCompanionWorkspaceAutoSync';
import { useCompanionWorkspacePairing } from './useCompanionWorkspacePairing';
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

async function disconnectCompanionWorkspacePairing(args: {
  refreshPairingState: () => Promise<unknown>;
  saveEndpoint: (endpointUrl: string) => Promise<unknown>;
}) {
  await clearCompanionPairingCredentials();
  const nextPairingState = await args.refreshPairingState();
  await args.saveEndpoint('');
  return nextPairingState;
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
  enabled: boolean
) {
  useForegroundAutoSync(
    viewState.setError,
    viewState.setReadableArticle,
    viewState.setState,
    setSyncProgress,
    viewState.setStatus,
    enabled,
    viewState.state,
    tryForegroundAutoSync
  );
}

function useCompanionAutoSyncEnabled(
  state: NativeCompanionWorkspaceSyncState, pairingUsable: boolean, participating: boolean
) {
  return isCompanionAutoSyncEligible({
    hasCompletedSync: Boolean(state.last_synced_at), pairingUsable, participating,
    providerAvailable: useCompanionSyncGroupProviderAvailability()
  });
}

export function useCompanionWorkspaceSync(bootstrapState: NativeCompanionBootstrapState) {
  const viewState = useCompanionSyncViewState();
  const { error, isWorkspaceSyncStateReady, readableArticle, setError, setIsWorkspaceSyncStateReady,
    manualSyncAction, setManualSyncAction, setReadableArticle, setState, setStatus,
    setSyncConflictCount, state, status, syncConflictCount } = viewState;
  const [syncProgress, setMergedSyncProgress] = useMergedCompanionSyncProgress();
  const snapshotActions = createWorkspaceSnapshotActions({
    setError,
    setReadableArticle,
    setSyncConflictCount,
    setState,
    setManualSyncAction,
    setSyncProgress: setMergedSyncProgress,
    setStatus,
    state
  });
  const pairing = useCompanionWorkspacePairing({
    bootstrapState,
    onError: setError,
    onSaveEndpoint: snapshotActions.saveEndpoint
  });
  const participationActions = useCompanionWorkspaceParticipationActions({ pairing, setError, snapshotActions });
  const disconnectPairing = useCallback(() => disconnectCompanionWorkspacePairing({
    refreshPairingState: pairing.refreshPairingState,
    saveEndpoint: snapshotActions.saveEndpoint
  }), [pairing.refreshPairingState, snapshotActions.saveEndpoint]);
  useWorkspaceSyncBootstrap(setIsWorkspaceSyncStateReady, setReadableArticle, setSyncConflictCount, setState, setStatus);
  useCompanionAutoSync(viewState, setMergedSyncProgress, useCompanionAutoSyncEnabled(
    state, isCompanionPairingSyncUsable(pairing.pairingState),
    participationActions.participation.participating
  ));

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
    pullFromDesktop: participationActions.pullFromDesktop,
    refreshFromDevice: snapshotActions.refreshFromDevice,
    removeRememberedTarget: snapshotActions.removeRememberedTarget,
    replaceSnapshot: snapshotActions.replaceSnapshot,
    saveEndpoint: snapshotActions.saveEndpoint,
    saveSyncOnboardingStatus: snapshotActions.saveSyncOnboardingStatus,
    ...pairing,
    checkDesktop: participationActions.checkDesktop,
    completePairing: participationActions.completePairing,
    disconnectPairing,
    requestPairing: participationActions.requestPairing
  };
}
