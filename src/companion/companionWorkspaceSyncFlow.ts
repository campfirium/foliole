import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import {
  syncCompanionObjectsFromDesktop,
  type CompanionDesktopSyncProgress
} from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import {
  loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState,
  recordCompanionWorkspaceSyncEvent
} from '../shared/platform/companionWorkspaceSync';

import { describeCompanionSyncPassResult } from './companionSyncPassResult';
import {
  buildRemainingSyncProgress,
  shouldClearCompanionSyncProgress
} from './companionSyncProgressVisibility';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';

export type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';
export type ForegroundAutoSyncOutcome = 'backlog' | 'completed' | 'failed' | 'skipped';

function isKnownBacklog(count: number | null) {
  return typeof count === 'number' && count > 0;
}

function madeResourceProgress(result: Awaited<ReturnType<typeof syncCompanionObjectsFromDesktop>>) {
  return (result.syncedContentBlobHashes?.length ?? 0) > 0 || (result.syncedAttachmentIds?.length ?? 0) > 0;
}

function formatSyncFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Desktop sync failed.';
  if (message.includes('Failed to apply companion desktop sync pack.')) {
    return `Topic list sync failed: ${message.replace('Failed to apply companion desktop sync pack.', '').trim() || 'Android could not apply the desktop sync pack.'}`;
  }
  if (message.includes('applying the structure pack')) {
    return `Topic list sync failed: ${message}`;
  }
  if (message.includes('fetching topic bodies')) {
    return `Topic body sync failed: ${message}`;
  }
  if (message.includes('fetching attachment resources')) {
    return `Attachment file sync failed: ${message}`;
  }
  if (message.includes('pushing local review changes')) {
    return `Local change upload failed: ${message}`;
  }
  return message;
}

export function hasSyncBacklog(result: Awaited<ReturnType<typeof syncCompanionObjectsFromDesktop>>) {
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

function hasFastRetryWork(result: Awaited<ReturnType<typeof syncCompanionObjectsFromDesktop>>) {
  const remainingStructure = result.remainingStructureChangeCount ?? 0;
  const waitingLocalChanges =
    !result.pushError &&
    result.pushConflictCount === 0 &&
    result.pushRejectedCount === 0 &&
    (result.pushIssueCount ?? 0) === 0 &&
    ((result.localDirtyCount ?? 0) > 0 || (result.pendingAckCount ?? 0) > 0);
  return madeResourceProgress(result) || remainingStructure > 0 || waitingLocalChanges;
}

export async function syncReadableArticle(snapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot']) {
  return loadCompanionReadableArticle(snapshot);
}

export async function runCompanionStreamSync(args: {
  cancelled: () => boolean;
  endpointUrl: string;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
}) {
  const result = await syncCompanionObjectsFromDesktop(args.endpointUrl, {
    onProgress: args.setSyncProgress,
    onStructureSynced: async () => {
      if (args.cancelled()) {
        return;
      }
      const structureState = await loadCompanionWorkspaceSyncState();
      args.setState(structureState);
      args.setReadableArticle(await syncReadableArticle(structureState.workspace_snapshot));
    }
  });
  if (args.cancelled()) {
    return;
  }
  const passResult = describeCompanionSyncPassResult(result);
  const completedState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl,
    message: passResult.message,
    status: passResult.status
  });
  args.setState(completedState);
  args.setReadableArticle(await syncReadableArticle(completedState.workspace_snapshot));
  args.setStatus('idle');
  const remainingProgress = buildRemainingSyncProgress(result);
  if (remainingProgress) {
    args.setSyncProgress(remainingProgress);
  } else if (shouldClearCompanionSyncProgress(result)) {
    args.setSyncProgress(null);
  }
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
  args.setStatus('syncing');
  try {
    await recordCompanionWorkspaceSyncEvent({ endpointUrl, message: 'Auto sync started.', status: 'started' });
    return await runCompanionStreamSync({ ...args, endpointUrl }) ?? 'skipped';
  } catch (syncError) {
    if (args.cancelled()) return 'skipped';
    const message = formatSyncFailureMessage(syncError);
    args.setStatus('idle');
    args.setSyncProgress(null);
    const failedState = await recordCompanionWorkspaceSyncEvent({ endpointUrl, message, status: 'failed' }).catch(() => null);
    if (failedState) args.setState(failedState);
    return 'failed';
  }
}
