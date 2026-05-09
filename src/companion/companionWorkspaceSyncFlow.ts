import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import {
  syncCompanionObjectsFromDesktop,
  type CompanionDesktopSyncProgress
} from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import {
  createCompanionSyncRunId,
  statusForSyncRunResult
} from '../shared/platform/companionSyncActivityEvents';
import {
  loadCompanionReadableArticle,
  recordCompanionWorkspaceSyncEvent
} from '../shared/platform/companionWorkspaceSync';

import { loadCompanionStateAfterStructureSync } from './companionStructureSyncSnapshot';
import { formatCompanionSyncFailureMessage } from './companionSyncFailureMessage';
import { describeCompanionSyncPassResult } from './companionSyncPassResult';
import {
  buildRemainingSyncProgress,
  shouldClearCompanionSyncProgress
} from './companionSyncProgressVisibility';
import { runCompanionSyncAsOwner } from './companionSyncRunOwner';
import { buildCompanionSyncRunSummary } from './companionSyncRunSummary';
import { recordCompanionSyncStageEvents } from './companionSyncStageEvents';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';

export type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';
export type ForegroundAutoSyncOutcome = 'backlog' | 'completed' | 'failed' | 'skipped';

function isKnownBacklog(count: number | null) {
  return typeof count === 'number' && count > 0;
}

function madeResourceProgress(result: Awaited<ReturnType<typeof syncCompanionObjectsFromDesktop>>) {
  return (result.syncedContentBlobHashes?.length ?? 0) > 0 || (result.syncedAttachmentIds?.length ?? 0) > 0;
}

const STARTING_STRUCTURE_PROGRESS = {
  completed: 0,
  phase: 'structure' as const,
  total: null
};

function hasFastRetryWork(result: Awaited<ReturnType<typeof syncCompanionObjectsFromDesktop>>) {
  if (result.attachmentResourceError || result.contentBlobError) {
    return false;
  }
  const remainingStructure = result.remainingStructureChangeCount ?? 0;
  const waitingLocalChanges =
    !result.pushError &&
    result.pushConflictCount === 0 &&
    result.pushRejectedCount === 0 &&
    (result.pushIssueCount ?? 0) === 0 &&
    ((result.localDirtyCount ?? 0) > 0 || (result.pendingAckCount ?? 0) > 0);
  return (
    isKnownBacklog(result.remainingContentBlobCount) ||
    isKnownBacklog(result.remainingAttachmentResourceCount) ||
    madeResourceProgress(result) ||
    remainingStructure > 0 ||
    waitingLocalChanges
  );
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

export async function runCompanionStreamSync(args: {
  cancelled: () => boolean;
  endpointUrl: string;
  runId: string;
  startedAt: string;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
}) {
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
    onStructureSynced: refreshAfterStructureSync
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
    summary: buildCompanionSyncRunSummary({ occurredAt, result, startedAt: args.startedAt })
  });
  await showCompletedStructure({
    setReadableArticle: args.setReadableArticle,
    setState: args.setState,
    setStatus: args.setStatus,
    state: completedState,
    workspaceSnapshot: latestWorkspaceSnapshot
  });
  applyRemainingProgress({ result, setSyncProgress: args.setSyncProgress });
  if (passResult.outcome === 'skipped' && hasFastRetryWork(result)) {
    return 'backlog';
  }
  return passResult.outcome;
}

export async function tryForegroundAutoSync(args: {
  cancelled: () => boolean;
  setError(error: string | null): void;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  state: NativeCompanionWorkspaceSyncState;
}): Promise<ForegroundAutoSyncOutcome> {
  const endpointUrl = resolveCompanionWorkspaceSyncEndpoint(args.state);
  if (!endpointUrl) return 'skipped';
  const run = await runCompanionSyncAsOwner(endpointUrl, async () => {
    const runId = createCompanionSyncRunId();
    const startedAt = new Date().toISOString();
    try {
      args.setStatus('syncing');
      args.setError(null);
      args.setSyncProgress(STARTING_STRUCTURE_PROGRESS);
      await recordCompanionWorkspaceSyncEvent({
        endpointUrl,
        kind: 'run_started',
        message: 'Auto sync started.',
        runId,
        startedAt,
        status: 'started'
      });
      return await runCompanionStreamSync({
        ...args,
        endpointUrl,
        runId,
        startedAt,
        workspaceSnapshot: args.state.workspace_snapshot
      }) ?? 'skipped';
    } catch (syncError) {
      if (args.cancelled()) return 'skipped';
      const message = formatCompanionSyncFailureMessage(syncError);
      const refreshedState = await loadCompanionStateAfterStructureSync(args.state.workspace_snapshot);
      const workspaceSnapshot = refreshedState?.workspace_snapshot ?? args.state.workspace_snapshot;
      args.setStatus('idle');
      args.setSyncProgress(null);
      args.setError(message);
      const failedState = await recordCompanionWorkspaceSyncEvent({
        endpointUrl,
        kind: 'run_finished',
        message,
        result: 'failed',
        runId,
        startedAt,
        status: 'failed'
      }).catch(() => null);
      if (failedState) args.setState({ ...failedState, workspace_snapshot: workspaceSnapshot });
      return 'failed';
    }
  });
  return run.owned ? run.result : 'skipped';
}
