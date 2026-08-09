import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import {
  syncCompanionObjectsFromDesktop,
  type CompanionDesktopSyncProgress
} from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import {
  statusForSyncRunResult
} from '../shared/platform/companionSyncActivityEvents';
import { loadCompanionSyncNodeConflicts } from '../shared/platform/companionSyncObjects';
import {
  loadCompanionReadableArticle,
  recordCompanionWorkspaceSyncEvent
} from '../shared/platform/companionWorkspaceSync';

import { loadCompanionStateAfterStructureSync } from './companionStructureSyncSnapshot';
import { describeCompanionSyncPassResult } from './companionSyncPassResult';
import {
  buildRemainingSyncProgress,
  shouldClearCompanionSyncProgress
} from './companionSyncProgressVisibility';
import { recordCompanionSyncStageEvents } from './companionSyncStageEvents';

interface ManualSyncArgs {
  endpointUrl: string;
  runId: string;
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setSyncConflictCount: (count: number) => void;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
  setSyncProgress: (progress: CompanionDesktopSyncProgress | null) => void;
  startedAt: string;
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
}

const MAX_MANUAL_STRUCTURE_PASSES = 3;

function resourceBacklog(result: Awaited<ReturnType<typeof syncCompanionObjectsFromDesktop>>) {
  const counts = [result.remainingAttachmentResourceCount, result.remainingContentBlobCount];
  const failed = [result.remainingFailedAttachmentResourceCount, result.remainingFailedContentBlobCount];
  if (counts.some((count) => typeof count !== 'number') || failed.some((count) => count !== 0)) return null;
  return counts.reduce<number>((total, count) => total + (count ?? 0), 0);
}

async function continueResourceBacklog(
  args: ManualSyncArgs,
  initial: Awaited<ReturnType<typeof syncCompanionObjectsFromDesktop>>
) {
  let result = initial;
  let previousBacklog = resourceBacklog(result);
  while (previousBacklog !== null && previousBacklog > 0) {
    const next = await syncCompanionObjectsFromDesktop(args.endpointUrl, {
      onProgress: args.setSyncProgress,
      resourcesOnly: true
    });
    await recordCompanionSyncStageEvents(args, next);
    const nextBacklog = resourceBacklog(next);
    result = next;
    if (nextBacklog === null || nextBacklog >= previousBacklog) break;
    previousBacklog = nextBacklog;
  }
  return result;
}

function shouldContinueStructureCatchUp(
  result: Awaited<ReturnType<typeof syncCompanionObjectsFromDesktop>>,
  passIndex: number
) {
  return passIndex + 1 < MAX_MANUAL_STRUCTURE_PASSES
    && (result.remainingStructureChangeCount ?? 0) > 0
    && !result.pushError
    && result.pushConflictCount === 0
    && result.pushRejectedCount === 0
    && (result.pushIssueCount ?? 0) === 0;
}

export async function syncCompanionDesktopStreams(args: ManualSyncArgs) {
  let latestWorkspaceSnapshot = args.workspaceSnapshot;
  let structureRefreshCompleted = false;
  const refreshAfterStructureSync = async () => {
    structureRefreshCompleted = true;
    const refreshedState = await loadCompanionStateAfterStructureSync(latestWorkspaceSnapshot);
    latestWorkspaceSnapshot = refreshedState?.workspace_snapshot ?? latestWorkspaceSnapshot;
    if (refreshedState) {
      args.setState(refreshedState);
      args.setReadableArticle(await loadCompanionReadableArticle(latestWorkspaceSnapshot));
    }
  };
  let result: Awaited<ReturnType<typeof syncCompanionObjectsFromDesktop>> | null = null;
  for (let passIndex = 0; passIndex < MAX_MANUAL_STRUCTURE_PASSES; passIndex += 1) {
    result = await syncCompanionObjectsFromDesktop(args.endpointUrl, {
      onProgress: args.setSyncProgress,
      onStructureSynced: refreshAfterStructureSync
    });
    await recordCompanionSyncStageEvents(args, result);
    if (!shouldContinueStructureCatchUp(result, passIndex)) break;
  }
  if (!result) throw new Error('Manual sync did not run.');
  result = await continueResourceBacklog(args, result);
  if (!structureRefreshCompleted) {
    await refreshAfterStructureSync();
  }
  const passResult = describeCompanionSyncPassResult(result);
  const nextState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl,
    kind: 'run_finished',
    message: passResult.message,
    result: passResult.result,
    runId: args.runId,
    startedAt: args.startedAt,
    status: statusForSyncRunResult(passResult.result)
  });
  args.setState({ ...nextState, workspace_snapshot: latestWorkspaceSnapshot });
  args.setReadableArticle(await loadCompanionReadableArticle(latestWorkspaceSnapshot));
  args.setSyncConflictCount((await loadCompanionSyncNodeConflicts()).length);
  const remainingProgress = buildRemainingSyncProgress(result);
  if (remainingProgress) {
    args.setSyncProgress(remainingProgress);
  } else if (shouldClearCompanionSyncProgress(result)) {
    args.setSyncProgress(null);
  }
  return nextState;
}

export async function recordCompanionManualSyncFailure(args: {
  endpointUrl: string;
  message: string;
  runId: string;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
  startedAt: string;
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
}) {
  const refreshedState = await loadCompanionStateAfterStructureSync(args.workspaceSnapshot);
  const workspaceSnapshot = refreshedState?.workspace_snapshot ?? args.workspaceSnapshot;
  const failedState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl,
    kind: 'run_finished',
    message: args.message,
    result: 'failed',
    runId: args.runId,
    startedAt: args.startedAt,
    status: 'failed'
  }).catch(() => null);
  if (failedState) args.setState({ ...failedState, workspace_snapshot: workspaceSnapshot });
}
