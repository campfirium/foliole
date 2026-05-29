import { useCallback, useEffect, useState } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { loadCompanionSyncNodeConflicts } from '../shared/platform/companionSyncObjects';
import {
  clearCompanionPairingCredentials,
  loadCompanionWorkspaceSyncState
} from '../shared/platform/companionWorkspaceSync';

import { mergeCompanionSyncProgressSession } from './companionSyncProgressSession';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import {
  type CompanionWorkspaceSyncStatus,
  syncReadableArticle,
  tryForegroundAutoSync
} from './companionWorkspaceSyncFlow';
import { useForegroundAutoSync } from './useCompanionWorkspaceAutoSync';
import { useCompanionWorkspacePairing } from './useCompanionWorkspacePairing';

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
  args.setStatus('idle');
}

function useWorkspaceSyncBootstrap(
  setReadableArticle: (article: CompanionReadableArticle | null) => void,
  setSyncConflictCount: (count: number) => void,
  setState: (state: NativeCompanionWorkspaceSyncState) => void,
  setStatus: (status: CompanionWorkspaceSyncStatus) => void
) {
  useEffect(() => {
    let cancelled = false;

    void initializeWorkspaceSyncState({
      cancelled: () => cancelled,
      setReadableArticle,
      setSyncConflictCount,
      setState,
      setStatus
    })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setStatus('idle');
      });

    return () => {
      cancelled = true;
    };
  }, [setReadableArticle, setSyncConflictCount, setState, setStatus]);
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

export function useCompanionWorkspaceSync(bootstrapState: NativeCompanionBootstrapState) {
  const [state, setState] = useState<NativeCompanionWorkspaceSyncState>(EMPTY_SYNC_STATE);
  const [readableArticle, setReadableArticle] = useState<CompanionReadableArticle | null>(null);
  const [syncConflictCount, setSyncConflictCount] = useState(0);
  const [syncProgress, setMergedSyncProgress] = useMergedCompanionSyncProgress();
  const [status, setStatus] = useState<CompanionWorkspaceSyncStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const snapshotActions = createWorkspaceSnapshotActions({
    setError,
    setReadableArticle,
    setSyncConflictCount,
    setState,
    setSyncProgress: setMergedSyncProgress,
    setStatus,
    state
  });
  const pairing = useCompanionWorkspacePairing({
    bootstrapState,
    onError: setError,
    onSaveEndpoint: snapshotActions.saveEndpoint
  });
  const pullFromDesktop = useCallback(async (endpointUrl: string) => {
    const nextState = await snapshotActions.pullFromDesktop(endpointUrl);
    await pairing.refreshPairingState();
    return nextState;
  }, [pairing.refreshPairingState, snapshotActions]);
  const disconnectPairing = useCallback(() => disconnectCompanionWorkspacePairing({
    refreshPairingState: pairing.refreshPairingState,
    saveEndpoint: snapshotActions.saveEndpoint
  }), [pairing.refreshPairingState, snapshotActions.saveEndpoint]);
  useWorkspaceSyncBootstrap(setReadableArticle, setSyncConflictCount, setState, setStatus);
  useForegroundAutoSync(
    setError,
    setReadableArticle,
    setState,
    setMergedSyncProgress,
    setStatus,
    pairing.pairingState.is_paired,
    state,
    tryForegroundAutoSync
  );

  return {
    bootstrapState,
    clearError: () => setError(null),
    error,
    readableArticle,
    state,
    syncConflictCount,
    syncProgress,
    status,
    pullFromDesktop,
    refreshFromDevice: snapshotActions.refreshFromDevice,
    removeRememberedTarget: snapshotActions.removeRememberedTarget,
    replaceSnapshot: snapshotActions.replaceSnapshot,
    saveEndpoint: snapshotActions.saveEndpoint,
    saveSyncOnboardingStatus: snapshotActions.saveSyncOnboardingStatus,
    ...pairing,
    disconnectPairing
  };
}
