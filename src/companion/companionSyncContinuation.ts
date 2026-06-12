import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';

export type CompanionSyncContinuationMode = 'full' | 'resources-only';

function isKnownBacklog(count: number | null) {
  return typeof count === 'number' && count > 0;
}

function madeResourceProgress(result: CompanionDesktopSyncResult) {
  return (result.syncedContentBlobHashes?.length ?? 0) > 0 || (result.syncedAttachmentIds?.length ?? 0) > 0;
}

function hasResourceBacklog(result: CompanionDesktopSyncResult) {
  return isKnownBacklog(result.remainingContentBlobCount) || isKnownBacklog(result.remainingAttachmentResourceCount);
}

function hasWaitingLocalChanges(result: CompanionDesktopSyncResult) {
  return (
    !result.pushError &&
    result.pushConflictCount === 0 &&
    result.pushRejectedCount === 0 &&
    (result.pushIssueCount ?? 0) === 0 &&
    ((result.localDirtyCount ?? 0) > 0 || (result.pendingAckCount ?? 0) > 0)
  );
}

export function resolveCompanionSyncContinuationMode(result: CompanionDesktopSyncResult): CompanionSyncContinuationMode {
  if (
    result.attachmentResourceError ||
    result.contentBlobError ||
    !hasResourceBacklog(result) ||
    !madeResourceProgress(result) ||
    (result.remainingStructureChangeCount ?? 0) > 0 ||
    hasWaitingLocalChanges(result)
  ) {
    return 'full';
  }
  return 'resources-only';
}

export function hasFastRetryWork(result: CompanionDesktopSyncResult) {
  if (result.attachmentResourceError || result.contentBlobError) {
    return false;
  }
  return madeResourceProgress(result) || (result.remainingStructureChangeCount ?? 0) > 0 || hasWaitingLocalChanges(result);
}
