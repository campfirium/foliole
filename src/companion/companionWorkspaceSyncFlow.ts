import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { SyncTriggerReason } from '../../lib/platform/syncTriggerContract';
import {
  syncCompanionObjectsFromDesktop,
  type CompanionDesktopSyncProgress
} from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import {
  statusForSyncRunResult
} from '../shared/platform/companionSyncActivityEvents';
import {
  loadCompanionReadableArticle,
  recordCompanionWorkspaceSyncEvent,
  resolveReachableCompanionWorkspaceSyncEndpoints
} from '../shared/platform/companionWorkspaceSync';

import { hydrateCompanionReviewSchedulerSettings } from './companionReviewSchedulerSettingsHydration';
import { loadCompanionStateAfterStructureSync } from './companionStructureSyncSnapshot';
import {
  hasFastRetryWork,
  resolveCompanionSyncContinuationMode,
  type CompanionSyncContinuationMode
} from './companionSyncContinuation';
import { describeCompanionSyncPassResult } from './companionSyncPassResult';
import {
  buildRemainingSyncProgress,
  shouldClearCompanionSyncProgress
} from './companionSyncProgressVisibility';
import { buildCompanionSyncRunSummary } from './companionSyncRunSummary';
import { recordCompanionSyncStageEvents } from './companionSyncStageEvents';
import { tryForegroundAutoSyncTarget } from './companionSyncTargetFlow';
import { hydrateCompanionSystemEntryDisplayNames } from './companionSystemEntryDisplayNamesHydration';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';

export type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';
export type ForegroundAutoSyncOutcome = 'backlog' | 'completed' | 'failed' | 'skipped';

export interface RunCompanionStreamSyncArgs {
  cancelled: () => boolean;
  endpointUrl: string;
  runId: string;
  startedAt: string;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  continuationMode?: CompanionSyncContinuationMode;
  onContinuationModeChange?(mode: CompanionSyncContinuationMode): void;
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
  triggerReason: SyncTriggerReason;
}

export interface TryForegroundAutoSyncArgs {
  cancelled: () => boolean;
  setError(error: string | null): void;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  continuationMode?: CompanionSyncContinuationMode;
  onContinuationModeChange?(mode: CompanionSyncContinuationMode): void;
  state: NativeCompanionWorkspaceSyncState;
  triggerReason?: SyncTriggerReason;
}

export async function syncReadableArticle(snapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot']) {
  return loadCompanionReadableArticle(snapshot);
}

async function showCompletedStructure(args: {
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  state: NativeCompanionWorkspaceSyncState;
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
}) {
  args.setState({ ...args.state, workspace_snapshot: args.workspaceSnapshot });
  args.setReadableArticle(await syncReadableArticle(args.workspaceSnapshot));
  args.setStatus('idle');
}

function applyRemainingProgress(args: {
  result: Awaited<ReturnType<typeof syncCompanionObjectsFromDesktop>>;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
}) {
  const remainingProgress = buildRemainingSyncProgress(args.result);
  if (remainingProgress) {
    args.setSyncProgress(remainingProgress);
  } else if (shouldClearCompanionSyncProgress(args.result)) {
    args.setSyncProgress(null);
  }
}

async function refreshVisibleStructure(args: {
  cancelled: () => boolean;
  fallbackSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
}) {
  const refreshedState = await loadCompanionStateAfterStructureSync(args.fallbackSnapshot);
  const workspaceSnapshot = refreshedState?.workspace_snapshot ?? args.fallbackSnapshot;
  if (!args.cancelled() && refreshedState) {
    args.setState(refreshedState);
    args.setReadableArticle(await syncReadableArticle(workspaceSnapshot));
  }
  return workspaceSnapshot;
}

export async function runCompanionStreamSync(args: RunCompanionStreamSyncArgs) {
  let latestWorkspaceSnapshot = args.workspaceSnapshot;
  let structureRefreshCompleted = false;
  const refreshAfterStructureSync = async () => {
    structureRefreshCompleted = true;
    latestWorkspaceSnapshot = await refreshVisibleStructure({
      cancelled: args.cancelled,
      fallbackSnapshot: latestWorkspaceSnapshot,
      setReadableArticle: args.setReadableArticle,
      setState: args.setState
    });
  };
  const result = await syncCompanionObjectsFromDesktop(args.endpointUrl, {
    onProgress: args.setSyncProgress,
    onStructureSynced: refreshAfterStructureSync,
    resourcesOnly: args.continuationMode === 'resources-only'
  });
  if (args.cancelled()) {
    return;
  }
  if (!structureRefreshCompleted) {
    await refreshAfterStructureSync();
  }
  await recordCompanionSyncStageEvents(args, result);
  const passResult = describeCompanionSyncPassResult(result);
  const occurredAt = new Date().toISOString();
  const completedState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl,
    kind: 'run_finished',
    message: passResult.message,
    occurredAt,
    result: passResult.result,
    runId: args.runId,
    startedAt: args.startedAt,
    status: statusForSyncRunResult(passResult.result),
    summary: buildCompanionSyncRunSummary({ occurredAt, result, startedAt: args.startedAt }),
    triggerReason: args.triggerReason
  });
  await showCompletedStructure({
    setReadableArticle: args.setReadableArticle,
    setState: args.setState,
    setStatus: args.setStatus,
    state: completedState,
    workspaceSnapshot: latestWorkspaceSnapshot
  });
  await hydrateCompanionReviewSchedulerSettings().catch(() => null);
  await hydrateCompanionSystemEntryDisplayNames().catch(() => null);
  applyRemainingProgress({ result, setSyncProgress: args.setSyncProgress });
  args.onContinuationModeChange?.(resolveCompanionSyncContinuationMode(result));
  if (passResult.outcome === 'skipped' && hasFastRetryWork(result)) {
    return 'backlog';
  }
  return passResult.outcome;
}

function combineForegroundSyncOutcomes(outcomes: ForegroundAutoSyncOutcome[]) {
  if (outcomes.includes('failed')) return 'failed';
  if (outcomes.includes('backlog')) return 'backlog';
  if (outcomes.includes('completed')) return 'completed';
  return 'skipped';
}

function resetSharedContinuation(args: TryForegroundAutoSyncArgs) {
  const targetArgs = { ...args };
  delete targetArgs.continuationMode;
  delete targetArgs.onContinuationModeChange;
  return targetArgs;
}

export async function tryForegroundAutoSync(args: TryForegroundAutoSyncArgs): Promise<ForegroundAutoSyncOutcome> {
  const storedEndpointUrl = resolveCompanionWorkspaceSyncEndpoint(args.state);
  if (!storedEndpointUrl) return 'skipped';
  const targets = await resolveReachableCompanionWorkspaceSyncEndpoints(storedEndpointUrl, {
    allowWhileNotParticipating: args.triggerReason === 'manual'
  });
  const outcomes: ForegroundAutoSyncOutcome[] = [];
  for (const target of targets) {
    if (args.cancelled()) break;
    const targetArgs = targets.length > 1 ? resetSharedContinuation(args) : args;
    outcomes.push(await tryForegroundAutoSyncTarget(
      targetArgs, target, runCompanionStreamSync
    ));
  }
  return combineForegroundSyncOutcomes(outcomes);
}
