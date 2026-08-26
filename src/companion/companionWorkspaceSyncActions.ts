import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { definedProps } from '../shared/lib/definedProps';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { createCompanionSyncRunId } from '../shared/platform/companionSyncActivityEvents';
import { loadCompanionSyncNodeConflicts } from '../shared/platform/companionSyncObjects';
import {
  loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState,
  persistCompanionWorkspaceSnapshot,
  removeCompanionWorkspaceSyncRememberedTarget,
  saveCompanionSyncOnboardingStatus,
  saveCompanionWorkspaceSyncEndpoint
} from '../shared/platform/companionWorkspaceSync';

import {
  finishCompanionManualSyncAction,
  markCompanionManualSyncActionRunning,
  startCompanionManualSyncAction,
  type CompanionManualSyncAction
} from './companionManualSyncAction';
import { hydrateCompanionReviewSchedulerSettings } from './companionReviewSchedulerSettingsHydration';
import { runCompanionSyncCoordinator } from './companionSyncCoordinator';
import { formatCompanionSyncFailureMessage } from './companionSyncFailureMessage';
import { hydrateCompanionSystemEntryDisplayNames } from './companionSystemEntryDisplayNamesHydration';
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

function createPullFromDesktop(args: WorkspaceSnapshotActionArgs) {
  return async function pullFromDesktop(endpointUrl: string) {
    let action = startCompanionManualSyncAction(createCompanionSyncRunId());
    let syncFailure: string | null = null;
    args.setManualSyncAction?.(action);
    try {
      action = markCompanionManualSyncActionRunning(action);
      args.setManualSyncAction?.(action);
      const outcome = await runCompanionSyncCoordinator({
        cancelled: () => false,
        setError: (message) => {
          syncFailure = message;
          args.setError(message);
        },
        setReadableArticle: args.setReadableArticle,
        setState: args.setState,
        setSyncProgress: args.setSyncProgress,
        setStatus: args.setStatus,
        state: { ...args.state, endpoint_url: endpointUrl },
        triggerReason: 'manual'
      });
      if (outcome === 'failed' || outcome === 'skipped') {
        throw new Error(syncFailure ?? 'Manual sync did not complete.');
      }
      const state = await refreshConflictAwareState(args);
      args.setManualSyncAction?.(finishCompanionManualSyncAction(action, 'completed'));
      return state;
    } catch (error) {
      args.setStatus('idle');
      args.setSyncProgress(null);
      args.setError(formatCompanionSyncFailureMessage(error));
      args.setManualSyncAction?.(finishCompanionManualSyncAction(action, 'failed'));
      throw error;
    }
  };
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
