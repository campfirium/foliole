import { useEffect, useState } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import {
  syncCompanionObjectsFromDesktop,
  type CompanionDesktopSyncProgress
} from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { loadCompanionSyncNodeConflicts } from '../shared/platform/companionSyncObjects';
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

function describeManualSyncPassResult(result: {
  attachmentResourceError: string | null;
  contentBlobError: string | null;
  remainingAttachmentResourceCount: number | null;
  remainingContentBlobCount: number | null;
}) {
  if (result.attachmentResourceError) {
    return {
      message: `Attachment cache failed: ${result.attachmentResourceError}`,
      status: 'failed' as const
    };
  }
  if (result.contentBlobError) {
    return {
      message: `Topic body cache failed: ${result.contentBlobError}`,
      status: 'failed' as const
    };
  }
  const remainingBodies = result.remainingContentBlobCount;
  const remainingAttachments = result.remainingAttachmentResourceCount;
  if (remainingBodies === 0 && remainingAttachments === 0) {
    return {
      message: 'Sync pass finished; topic bodies and attachment files are cached.',
      status: 'skipped' as const
    };
  }
  if (remainingBodies === 0) {
    const remaining = remainingAttachments === null ? 'some' : String(remainingAttachments);
    return {
      message: `Sync pass finished; ${remaining} attachment files still caching.`,
      status: 'skipped' as const
    };
  }
  if (remainingAttachments === 0) {
    const remaining = remainingBodies === null ? 'some' : String(remainingBodies);
    return {
      message: `Sync pass finished; ${remaining} topic bodies still caching.`,
      status: 'skipped' as const
    };
  }
  const remainingBodyLabel = remainingBodies === null ? 'some' : String(remainingBodies);
  const remainingAttachmentLabel = remainingAttachments === null ? 'some' : String(remainingAttachments);
  return {
    message: `Sync pass finished; ${remainingBodyLabel} topic bodies and ${remainingAttachmentLabel} attachment files still caching.`,
    status: 'skipped' as const
  };
}

const EMPTY_SYNC_STATE: NativeCompanionWorkspaceSyncState = {
  endpoint_url: null,
  last_synced_at: null,
  remembered_targets: [],
  sync_events: [],
  sync_onboarding_status: 'pending',
  workspace_snapshot: null
};

interface WorkspaceSnapshotActionArgs {
  setError: (message: string | null) => void;
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setSyncConflictCount: (count: number) => void;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
  setSyncProgress: (progress: CompanionDesktopSyncProgress | null) => void;
  setStatus: (status: CompanionWorkspaceSyncStatus) => void;
  state: NativeCompanionWorkspaceSyncState;
}

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

async function syncDesktopStreams(args: {
  endpointUrl: string;
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setSyncConflictCount: (count: number) => void;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
  setSyncProgress: (progress: CompanionDesktopSyncProgress | null) => void;
}) {
  async function refreshAfterStructureSync() {
    const structureState = await loadCompanionWorkspaceSyncState();
    args.setState(structureState);
    args.setReadableArticle(await loadCompanionReadableArticle(structureState.workspace_snapshot));
    args.setSyncConflictCount((await loadCompanionSyncNodeConflicts()).length);
  }

  const startedState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl,
    message: 'Sync started.',
    status: 'started'
  });
  args.setState(startedState);
  const result = await syncCompanionObjectsFromDesktop(args.endpointUrl, {
    onProgress: args.setSyncProgress,
    onStructureSynced: refreshAfterStructureSync
  });
  const passResult = describeManualSyncPassResult(result);
  const nextState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl,
    message: passResult.message,
    status: passResult.status
  });
  args.setState(nextState);
  args.setReadableArticle(await loadCompanionReadableArticle(nextState.workspace_snapshot));
  args.setSyncConflictCount((await loadCompanionSyncNodeConflicts()).length);
  if (
    result.attachmentResourceError ||
    result.contentBlobError ||
    (result.remainingAttachmentResourceCount === 0 && result.remainingContentBlobCount === 0)
  ) {
    args.setSyncProgress(null);
  }
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

async function refreshCompanionWorkspaceFromDevice(args: {
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setSyncConflictCount: (count: number) => void;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
}) {
  const nextState = await loadCompanionWorkspaceSyncState();
  args.setState(nextState);
  args.setReadableArticle(await loadCompanionReadableArticle(nextState.workspace_snapshot));
  args.setSyncConflictCount((await loadCompanionSyncNodeConflicts()).length);
  return nextState;
}

function createPullFromDesktop(args: WorkspaceSnapshotActionArgs) {
  return async function pullFromDesktop(endpointUrl: string) {
    args.setStatus('syncing');
    args.setError(null);
    try {
      const nextState = await syncDesktopStreams({
        endpointUrl,
        setReadableArticle: args.setReadableArticle,
        setSyncConflictCount: args.setSyncConflictCount,
        setState: args.setState,
        setSyncProgress: args.setSyncProgress
      });
      args.setStatus('idle');
      return nextState;
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Desktop sync failed.';
      args.setStatus('idle');
      args.setSyncProgress(null);
      args.setError(message);
      await recordManualSyncFailure({ endpointUrl, message, setState: args.setState });
      throw syncError;
    }
  };
}

async function replaceCompanionWorkspaceSnapshot(
  args: WorkspaceSnapshotActionArgs,
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

function useWorkspaceSnapshotActions(args: WorkspaceSnapshotActionArgs) {
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

  const pullFromDesktop = createPullFromDesktop(args);

  async function replaceSnapshot(
    workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'],
    changedNodeId?: string
  ) {
    return await replaceCompanionWorkspaceSnapshot(args, workspaceSnapshot, changedNodeId);
  }

  async function refreshFromDevice() {
    return await refreshCompanionWorkspaceFromDevice({
      setReadableArticle: args.setReadableArticle,
      setSyncConflictCount: args.setSyncConflictCount,
      setState: args.setState
    });
  }

  async function saveSyncOnboardingStatus(status: NativeCompanionWorkspaceSyncState['sync_onboarding_status']) {
    const nextState = await saveCompanionSyncOnboardingStatus(status);
    args.setState(nextState);
    return nextState;
  }

  return {
    pullFromDesktop,
    refreshFromDevice,
    removeRememberedTarget,
    replaceSnapshot,
    saveEndpoint,
    saveSyncOnboardingStatus
  };
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

export function useCompanionWorkspaceSync(bootstrapState: NativeCompanionBootstrapState) {
  const [state, setState] = useState<NativeCompanionWorkspaceSyncState>(EMPTY_SYNC_STATE);
  const [readableArticle, setReadableArticle] = useState<CompanionReadableArticle | null>(null);
  const [syncConflictCount, setSyncConflictCount] = useState(0);
  const [syncProgress, setSyncProgress] = useState<CompanionDesktopSyncProgress | null>(null);
  const [status, setStatus] = useState<CompanionWorkspaceSyncStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useWorkspaceSyncBootstrap(setReadableArticle, setSyncConflictCount, setState, setStatus);
  useForegroundAutoSync(setError, setReadableArticle, setState, setSyncProgress, setStatus, state, tryForegroundAutoSync);

  function clearError() {
    setError(null);
  }

  const snapshotActions = useWorkspaceSnapshotActions({
    setError,
    setReadableArticle,
    setSyncConflictCount,
    setState,
    setSyncProgress,
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
    syncConflictCount,
    syncProgress,
    status,
    pullFromDesktop: snapshotActions.pullFromDesktop,
    refreshFromDevice: snapshotActions.refreshFromDevice,
    removeRememberedTarget: snapshotActions.removeRememberedTarget,
    replaceSnapshot: snapshotActions.replaceSnapshot,
    saveEndpoint: snapshotActions.saveEndpoint,
    saveSyncOnboardingStatus: snapshotActions.saveSyncOnboardingStatus,
    ...pairing
  };
}
