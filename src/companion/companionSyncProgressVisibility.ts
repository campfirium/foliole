import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';

import type { CompanionSyncPassInput } from './companionSyncPassResult';

function hasRemainingResourceBacklog(result: CompanionSyncPassInput) {
  return isKnownBacklog(result.remainingAttachmentResourceCount) || isKnownBacklog(result.remainingContentBlobCount);
}

function isKnownBacklog(count: number | null) {
  return typeof count === 'number' && count > 0;
}

function hasContentProgress(result: CompanionSyncPassInput) {
  return (result.syncedContentBlobHashes?.length ?? 0) > 0;
}

function hasAttachmentProgress(result: CompanionSyncPassInput) {
  return (result.syncedAttachmentIds?.length ?? 0) > 0;
}

function knownNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value : undefined;
}

export function shouldClearCompanionSyncProgress(result: CompanionSyncPassInput) {
  if (result.attachmentResourceError || result.contentBlobError) {
    return !hasRemainingResourceBacklog(result);
  }
  const structureDone = result.remainingStructureChangeCount === undefined || result.remainingStructureChangeCount === 0;
  return result.remainingAttachmentResourceCount === 0 && result.remainingContentBlobCount === 0 && structureDone;
}

export function buildRemainingSyncProgress(result: CompanionSyncPassInput): CompanionDesktopSyncProgress | null {
  if (isKnownBacklog(result.remainingContentBlobCount)) {
    if (hasContentProgress(result)) {
      return null;
    }
    return {
      completed: 0,
      completedBytes: 0,
      contentBreakdown: result.remainingContentBreakdown,
      failedBytes: knownNumber(result.remainingFailedContentBlobBytes),
      failedCount: knownNumber(result.remainingFailedContentBlobCount),
      phase: 'content',
      total: result.remainingContentBlobCount,
      totalBytes: result.remainingContentBlobBytes ?? null
    };
  }
  if (isKnownBacklog(result.remainingAttachmentResourceCount)) {
    if (hasAttachmentProgress(result)) {
      return null;
    }
    return {
      attachmentBreakdown: result.remainingAttachmentBreakdown,
      completed: 0,
      completedBytes: 0,
      failedBytes: knownNumber(result.remainingFailedAttachmentResourceBytes),
      failedCount: knownNumber(result.remainingFailedAttachmentResourceCount),
      phase: 'attachment',
      total: result.remainingAttachmentResourceCount,
      totalBytes: result.remainingAttachmentResourceBytes ?? null
    };
  }
  const remaining = result.remainingStructureChangeCount;
  if (remaining === undefined || remaining === 0) {
    return null;
  }
  return {
    completed: 0,
    phase: 'structure',
    total: remaining
  };
}
