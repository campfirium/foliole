import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';

export type CompanionSyncContinuationMode = 'full' | 'resources-only';

function isKnownBacklog(count: number | null) {
  return typeof count === 'number' && count > 0;
}

function madeResourceProgress(result: CompanionDesktopSyncResult) {
  return result.attachmentWorkYielded === true || (result.transferredAttachmentCount ?? 0) > 0 || (result.transferredAttachmentBlockCount ?? 0) > 0;
}

function hasResourceBacklog(result: CompanionDesktopSyncResult) {
  return result.remainingAttachmentResourceCount === null || isKnownBacklog(result.remainingAttachmentResourceCount);
}

function hasWaitingLocalChanges(result: CompanionDesktopSyncResult) {
  return (
    !result.pushError &&
    (result.pushIssueCount ?? (result.pushConflictCount + result.pushRejectedCount)) === 0 &&
    ((result.localDirtyCount ?? 0) > 0 || (result.pendingAckCount ?? 0) > 0)
  );
}

export function resolveCompanionSyncContinuationMode(result: CompanionDesktopSyncResult): CompanionSyncContinuationMode {
  if (
    result.sessionConfirmationPending ||
    result.attachmentWorkYielded ||
    result.attachmentResourceError ||
    !hasResourceBacklog(result) ||
    !madeResourceProgress(result) ||
    (result.remainingStructureChangeCount ?? 0) > 0 ||
    hasWaitingLocalChanges(result)
  ) {
    return 'full';
  }
  return 'resources-only';
}

export function hasRetryWork(result: CompanionDesktopSyncResult) {
  if (result.sessionConfirmationPending) return true;
  if (result.attachmentResourceError) {
    return false;
  }
  // Attachment streams drain within a round, so progress alone no longer implies leftover work.
  return result.attachmentWorkYielded === true || hasResourceBacklog(result) || (result.remainingStructureChangeCount ?? 0) > 0 || hasWaitingLocalChanges(result);
}

export function hasFastRetryWork(result: CompanionDesktopSyncResult) {
  return hasRetryWork(result) && (madeResourceProgress(result)
    || result.madeDatabaseProgress === true || result.dynamicDatabaseBacklog === true);
}
