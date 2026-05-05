import { useEffect, useState } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { syncCompanionObjectsFromDesktop } from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import {
  loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState,
  persistCompanionWorkspaceSnapshot,
  recordCompanionWorkspaceSyncEvent,
  removeCompanionWorkspaceSyncRememberedTarget,
  saveCompanionSyncOnboardingStatus,
  saveCompanionWorkspaceSyncEndpoint
} from '../shared/platform/companionWorkspaceSync';

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
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
}) {
  const nextState = await loadCompanionWorkspaceSyncState();
  if (args.cancelled()) {
    return;
  }
  args.setState(nextState);
  args.setReadableArticle(await syncReadableArticle(nextState.workspace_snapshot));
  args.setStatus('idle');
}

async function syncDesktopStreams(args: {
  endpointUrl: string;
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
}) {
  const startedState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl,
    message: 'Sync started.',
    status: 'started'
  });
  args.setState(startedState);
  await syncCompanionObjectsFromDesktop(args.endpointUrl);
  const nextState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl,
    message: 'Sync completed.',
    status: 'completed'
  });
  args.setState(nextState);
  args.setReadableArticle(await loadCompanionReadableArticle(nextState.workspace_snapshot));
  return nextState;
}

async function recordManualSyncFailure(args: {
  endpointUrl: string;
  message: string;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
}) {
  const failedState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl,
    message: args.message,
    status: 'failed'
  }).catch(() => null);
  if (failedState) {
    args.setState(failedState);
  }
}

function useWorkspaceSnapshotActions(args: {
  setError: (message: string | null) => void;
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
  setStatus: (status: CompanionWorkspaceSyncStatus) => void;
  state: NativeCompanionWorkspaceSyncState;
}) {
  async function saveEndpoint(endpointUrl: string) {
    const nextState = await saveCompanionWorkspaceSyncEndpoint(endpointUrl);
    args.setState(nextState);
    return nextState;
  }

  async function removeRememberedTarget(endpointUrl: string) {
    const nextState = await removeCompanionWorkspaceSyncRememberedTarget(endpointUrl);
    args.setState(nextState);
    return nextState;
  }

  async function pullFromDesktop(endpointUrl: string) {
    args.setStatus('syncing');
    args.setError(null);
    try {
      const nextState = await syncDesktopStreams({
        endpointUrl,
        setReadableArticle: args.setReadableArticle,
        setState: args.setState
      });
      args.setStatus('idle');
      return nextState;
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Desktop sync failed.';
      args.setStatus('idle');
      args.setError(message);
      await recordManualSyncFailure({ endpointUrl, message, setState: args.setState });
      throw syncError;
    }
  }

  async function replaceSnapshot(
    workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'],
    changedNodeId?: string
  ) {
    const nextState = await persistCompanionWorkspaceSnapshot({
      changedNodeId,
      endpointUrl: args.state.endpoint_url,
      lastSyncedAt: args.state.last_synced_at,
      rememberedTargets: args.state.remembered_targets,
      workspaceSnapshot
    });
    args.setState(nextState);
    args.setReadableArticle(await loadCompanionReadableArticle(nextState.workspace_snapshot));
    return nextState;
  }

  async function saveSyncOnboardingStatus(status: NativeCompanionWorkspaceSyncState['sync_onboarding_status']) {
    const nextState = await saveCompanionSyncOnboardingStatus(status);
    args.setState(nextState);
    return nextState;
  }

  return { pullFromDesktop, removeRememberedTarget, replaceSnapshot, saveEndpoint, saveSyncOnboardingStatus };
}

function useWorkspaceSyncBootstrap(
  setReadableArticle: (article: CompanionReadableArticle | null) => void,
  setState: (state: NativeCompanionWorkspaceSyncState) => void,
  setStatus: (status: CompanionWorkspaceSyncStatus) => void
) {
  useEffect(() => {
    let cancelled = false;

    void initializeWorkspaceSyncState({
      cancelled: () => cancelled,
      setReadableArticle,
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
  }, [setReadableArticle, setState, setStatus]);
}

export function useCompanionWorkspaceSync(bootstrapState: NativeCompanionBootstrapState) {
  const [state, setState] = useState<NativeCompanionWorkspaceSyncState>(EMPTY_SYNC_STATE);
  const [readableArticle, setReadableArticle] = useState<CompanionReadableArticle | null>(null);
  const [status, setStatus] = useState<CompanionWorkspaceSyncStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useWorkspaceSyncBootstrap(setReadableArticle, setState, setStatus);
  useForegroundAutoSync(setError, setReadableArticle, setState, setStatus, state, tryForegroundAutoSync);

  function clearError() {
    setError(null);
  }

  const snapshotActions = useWorkspaceSnapshotActions({
    setError,
    setReadableArticle,
    setState,
    setStatus,
    state
  });
  const pairing = useCompanionWorkspacePairing({
    bootstrapState,
    onError: setError,
    onSaveEndpoint: snapshotActions.saveEndpoint
  });

  return {
    bootstrapState,
    clearError,
    error,
    readableArticle,
    state,
    status,
    pullFromDesktop: snapshotActions.pullFromDesktop,
    removeRememberedTarget: snapshotActions.removeRememberedTarget,
    replaceSnapshot: snapshotActions.replaceSnapshot,
    saveEndpoint: snapshotActions.saveEndpoint,
    saveSyncOnboardingStatus: snapshotActions.saveSyncOnboardingStatus,
    ...pairing
  };
}
