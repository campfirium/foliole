import type { Dispatch, SetStateAction } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { createCompanionSyncRunId } from '../shared/platform/companionSyncActivityEvents';
import { loadCompanionSyncNodeConflicts } from '../shared/platform/companionSyncObjects';
import {
  loadCompanionWorkspaceSyncState,
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
  setSyncConflictCount: (count: number) => void;
  setState: Dispatch<SetStateAction<NativeCompanionWorkspaceSyncState>>;
  setSyncProgress: (progress: CompanionDesktopSyncProgress | null) => void;
  setStatus: (status: CompanionWorkspaceSyncStatus) => void;
  setManualSyncAction?: (action: CompanionManualSyncAction | null) => void;
  state: NativeCompanionWorkspaceSyncState;
}

async function refreshConflictAwareState(args: {
  setSyncConflictCount: (count: number) => void;
  setState: Dispatch<SetStateAction<NativeCompanionWorkspaceSyncState>>;
}) {
  const nextState = await loadCompanionWorkspaceSyncState();
  args.setState(nextState);
  args.setSyncConflictCount((await loadCompanionSyncNodeConflicts()).length);
  await hydrateCompanionReviewSchedulerSettings().catch(() => null);
  await hydrateCompanionSystemEntryDisplayNames().catch(() => null);
  return nextState;
}

function createPullFromDesktop(args: WorkspaceSnapshotActionArgs) {
  return async function pullFromDesktop(endpointUrl: string) {
    const runId = createCompanionSyncRunId();
    let action = startCompanionManualSyncAction(runId);
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
        setState: args.setState,
        setSyncProgress: args.setSyncProgress,
        setStatus: args.setStatus,
        onRunIdentified: (actualRunId) => {
          if (action.runId === actualRunId) return;
          action = { ...action, runId: actualRunId };
          args.setManualSyncAction?.(action);
        },
        runId,
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

async function refreshAfterMutation(
  args: WorkspaceSnapshotActionArgs,
  previewSnapshot?: NativeCompanionWorkspaceSyncState['workspace_snapshot']
) {
  const workspaceSnapshot = await refreshCompanionWorkspaceAfterMutation(previewSnapshot);
  args.setState((current) => ({ ...current, workspace_snapshot: workspaceSnapshot }));
  args.setSyncConflictCount((await loadCompanionSyncNodeConflicts()).length);
  return workspaceSnapshot;
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
    refreshAfterMutation: (previewSnapshot?: NativeCompanionWorkspaceSyncState['workspace_snapshot']) =>
      refreshAfterMutation(args, previewSnapshot),
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
