import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { definedProps } from '../shared/lib/definedProps';
import type { CompanionWorkspaceSyncTarget } from '../shared/platform/companion/network/companionWorkspaceEndpoint';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { createCompanionSyncRunId } from '../shared/platform/companionSyncActivityEvents';
import { loadCompanionSyncNodeConflicts } from '../shared/platform/companionSyncObjects';
import {
  loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState,
  persistCompanionWorkspaceSnapshot,
  recordCompanionWorkspaceSyncEvent,
  removeCompanionWorkspaceSyncRememberedTarget,
  bindCompanionWorkspaceSyncTarget,
  resolveReachableCompanionWorkspaceSyncEndpoints,
  saveCompanionSyncOnboardingStatus,
  saveCompanionWorkspaceSyncEndpoint
} from '../shared/platform/companionWorkspaceSync';

import {
  assertCompanionManualSyncFinished,
  type CompanionManualSyncAction
} from './companionManualSyncAction';
import { hydrateCompanionReviewSchedulerSettings } from './companionReviewSchedulerSettingsHydration';
import { formatCompanionSyncFailureMessage } from './companionSyncFailureMessage';
import { runCompanionSyncAsOwner } from './companionSyncRunOwner';
import { hydrateCompanionSystemEntryDisplayNames } from './companionSystemEntryDisplayNamesHydration';
import {
  recordCompanionManualSyncFailure,
  syncCompanionDesktopStreams
} from './companionWorkspaceManualSync';
import type { CompanionWorkspaceSyncStatus } from './companionWorkspaceSyncFlow';

interface WorkspaceSnapshotActionArgs {
  setError: (message: string | null) => void;
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setSyncConflictCount: (count: number) => void;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
  setSyncProgress: (progress: CompanionDesktopSyncProgress | null) => void;
  setStatus: (status: CompanionWorkspaceSyncStatus) => void;
  setManualSyncAction?: (action: CompanionManualSyncAction | null) => void;
  state: NativeCompanionWorkspaceSyncState;
}

const STARTING_STRUCTURE_PROGRESS = {
  completed: 0,
  phase: 'structure' as const,
  total: null
};

async function refreshConflictAwareState(args: {
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setSyncConflictCount: (count: number) => void;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
}) {
  const nextState = await loadCompanionWorkspaceSyncState();
  args.setState(nextState);
  args.setReadableArticle(await loadCompanionReadableArticle(nextState.workspace_snapshot));
  args.setSyncConflictCount((await loadCompanionSyncNodeConflicts()).length);
  await hydrateCompanionReviewSchedulerSettings().catch(() => null);
  await hydrateCompanionSystemEntryDisplayNames().catch(() => null);
  return nextState;
}

async function saveResolvedSyncTarget(args: WorkspaceSnapshotActionArgs, target: CompanionWorkspaceSyncTarget) {
  await bindCompanionWorkspaceSyncTarget(target);
  const savedEndpointState = await saveCompanionWorkspaceSyncEndpoint(target.endpointUrl);
  args.setState({ ...savedEndpointState, workspace_snapshot: args.state.workspace_snapshot });
  return target.endpointUrl;
}

async function runManualSyncTarget(args: WorkspaceSnapshotActionArgs, target: CompanionWorkspaceSyncTarget) {
  const endpointUrl = target.endpointUrl;
  const candidateRunId = createCompanionSyncRunId();
  const run = runCompanionSyncAsOwner(endpointUrl, candidateRunId, async () => {
    args.setStatus('syncing');
    args.setSyncProgress(STARTING_STRUCTURE_PROGRESS);
    args.setError(null);
    const syncEndpointUrl = await saveResolvedSyncTarget(args, target);
    const runId = candidateRunId;
    const startedAt = new Date().toISOString();
    try {
      const startedState = await recordCompanionWorkspaceSyncEvent({
        endpointUrl: syncEndpointUrl, kind: 'run_started', message: 'Sync started.',
        runId, startedAt, status: 'started'
      });
      args.setState({ ...startedState, workspace_snapshot: args.state.workspace_snapshot });
      const nextState = await syncCompanionDesktopStreams({
        endpointUrl: syncEndpointUrl, runId, setReadableArticle: args.setReadableArticle,
        setSyncConflictCount: args.setSyncConflictCount, setState: args.setState,
        setSyncProgress: args.setSyncProgress, startedAt,
        workspaceSnapshot: args.state.workspace_snapshot
      });
      await hydrateCompanionReviewSchedulerSettings().catch(() => null);
      await hydrateCompanionSystemEntryDisplayNames().catch(() => null);
      args.setStatus('idle');
      return nextState;
    } catch (syncError) {
      await handleSyncFailure(args, syncEndpointUrl, runId, startedAt, syncError);
      throw syncError;
    }
  });
  args.setManualSyncAction?.({ mode: run.mode, runId: run.runId });
  if (run.mode === 'owned') {
    return run.completion;
  }
  args.setStatus('syncing');
  await run.completion.catch(() => undefined);
  try {
    const state = await refreshConflictAwareState({
      setReadableArticle: args.setReadableArticle,
      setSyncConflictCount: args.setSyncConflictCount,
      setState: args.setState
    });
    assertCompanionManualSyncFinished(state, run.runId);
    return state;
  } catch (error) {
    args.setError(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    args.setStatus('idle');
  }
}

function createPullFromDesktop(args: WorkspaceSnapshotActionArgs) {
  return async function pullFromDesktop(endpointUrl: string) {
    args.setManualSyncAction?.({ mode: 'resolving', runId: null });
    try {
      const targets = await resolveReachableCompanionWorkspaceSyncEndpoints(endpointUrl);
      if (targets.length === 0) throw new Error('No reachable Sync Group member is available.');
      let state: NativeCompanionWorkspaceSyncState | undefined;
      for (const target of targets) state = await runManualSyncTarget(args, target);
      if (!state) throw new Error('Manual sync did not run.');
      return state;
    } finally {
      args.setManualSyncAction?.(null);
    }
  };
}

async function handleSyncFailure(
  args: WorkspaceSnapshotActionArgs,
  endpointUrl: string,
  runId: string,
  startedAt: string,
  syncError: unknown
) {
  const message = formatCompanionSyncFailureMessage(syncError);
  args.setStatus('idle');
  args.setSyncProgress(null);
  args.setError(message);
  await recordCompanionManualSyncFailure({
    endpointUrl,
    message,
    runId,
    setState: args.setState,
    startedAt,
    workspaceSnapshot: args.state.workspace_snapshot
  });
}

async function replaceCompanionWorkspaceSnapshot(
  args: WorkspaceSnapshotActionArgs,
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'],
  changedNodeId?: string
) {
  const nextState = await persistCompanionWorkspaceSnapshot({
    endpointUrl: args.state.endpoint_url,
    lastSyncedAt: args.state.last_synced_at,
    rememberedTargets: args.state.remembered_targets,
    workspaceSnapshot,
    ...definedProps({ changedNodeId })
  });
  args.setState(nextState);
  args.setReadableArticle(await loadCompanionReadableArticle(nextState.workspace_snapshot));
  return nextState;
}

export function createWorkspaceSnapshotActions(args: WorkspaceSnapshotActionArgs) {
  return {
    pullFromDesktop: createPullFromDesktop(args),
    refreshFromDevice: () => refreshConflictAwareState(args),
    removeRememberedTarget: async (endpointUrl: string) => {
      const nextState = await removeCompanionWorkspaceSyncRememberedTarget(endpointUrl);
      args.setState(nextState);
      return nextState;
    },
    replaceSnapshot: (
      workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'],
      changedNodeId?: string
    ) => replaceCompanionWorkspaceSnapshot(args, workspaceSnapshot, changedNodeId),
    saveEndpoint: async (endpointUrl: string) => {
      const nextState = await saveCompanionWorkspaceSyncEndpoint(endpointUrl);
      args.setState(nextState);
      return nextState;
    },
    saveSyncOnboardingStatus: async (status: NativeCompanionWorkspaceSyncState['sync_onboarding_status']) => {
      const nextState = await saveCompanionSyncOnboardingStatus(status);
      args.setState(nextState);
      return nextState;
    }
  };
}
