import {
  formatSyncPassCount
} from './companionSyncPassResultFormat';

export interface CompanionSyncPassInput {
  attachmentResourceError: string | null;
  contentBlobError: string | null;
  localDirtyCount?: number | null;
  pendingAckCount?: number | null;
  pushConflictCount?: number;
  pushError?: string | null;
  pushIssueCount?: number | null;
  pushRejectedCount?: number;
  syncedAttachmentIds?: string[];
  syncedAttachmentResourceElapsedMs?: number;
  syncedAttachmentResourceBytes?: number;
  syncedContentBlobElapsedMs?: number;
  syncedContentBlobBytes?: number;
  syncedContentBlobHashes?: string[];
  syncedContentBlobNativeTiming?: {
    dbElapsedMs: number;
    httpElapsedMs: number;
    parseElapsedMs: number;
    totalElapsedMs: number;
  };
  syncedResourceElapsedMs?: number;
  syncedStructureElapsedMs?: number;
  remainingAttachmentBreakdown?: {
    activeTopicAttachments?: number;
    dueReviewAttachments?: number;
    imageAttachments?: number;
    imageBytes?: number;
    otherAttachments?: number;
    otherBytes?: number;
    pdfAttachments?: number;
    pdfBytes?: number;
  };
  remainingAttachmentResourceBytes?: number | null;
  remainingAttachmentResourceCount: number | null;
  remainingFailedAttachmentResourceBytes?: number | null;
  remainingFailedAttachmentResourceCount?: number | null;
  remainingContentBreakdown?: {
    activeTopicBodies?: number;
    dueReviewBodies?: number;
    externalDocumentBodies?: number;
    nestedTopicBodies?: number;
    topLevelTopicBodies?: number;
    topicBodies?: number;
  };
  remainingContentBlobBytes?: number | null;
  remainingContentBlobCount: number | null;
  remainingFailedContentBlobBytes?: number | null;
  remainingFailedContentBlobCount?: number | null;
  remainingStructureChangeCount?: number | null;
}

export interface CompanionSyncPassResult {
  message: string;
  outcome: 'completed' | 'failed' | 'skipped';
  result: 'blocked' | 'cancelled' | 'completed' | 'failed' | 'partial';
  status: 'completed' | 'failed' | 'skipped';
}

function createPassResult(
  message: string,
  status: CompanionSyncPassResult['status'],
  result: CompanionSyncPassResult['result'] = status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'partial'
): CompanionSyncPassResult {
  return { message, outcome: status, result, status };
}

function hasRemainingResourceBacklog(result: CompanionSyncPassInput) {
  return isKnownBacklog(result.remainingContentBlobCount) || isKnownBacklog(result.remainingAttachmentResourceCount);
}

function isKnownBacklog(count: number | null) {
  return typeof count === 'number' && count > 0;
}

function clarifyCheckOnlyMessage(message: string) {
  return message === 'Sync checked' ? 'Sync checked; resource backlog was not measured in this pass.' : message;
}

function madeResourceProgress(result: CompanionSyncPassInput) {
  return (result.syncedContentBlobHashes?.length ?? 0) > 0 || (result.syncedAttachmentIds?.length ?? 0) > 0;
}

function hasFailedResourceBacklog(result: CompanionSyncPassInput) {
  return (result.remainingFailedContentBlobCount ?? 0) > 0 || (result.remainingFailedAttachmentResourceCount ?? 0) > 0;
}

export function describeCompanionSyncPassResult(result: CompanionSyncPassInput): CompanionSyncPassResult {
  const withTiming = (message: string) => message;
  const errorResult = describeErrorPass(result, withTiming);
  if (errorResult) return errorResult;
  const pushResult = describePushPass(result, withTiming);
  if (pushResult) return pushResult;
  const completedResult = describeCompletedPass(result, withTiming);
  if (completedResult) return completedResult;
  return describeUnfinishedPass(result, withTiming);
}

function describeErrorPass(
  result: CompanionSyncPassInput,
  withTiming: (message: string) => string
) {
  if (result.attachmentResourceError) {
    if (hasRemainingResourceBacklog(result)) {
      return createPassResult(
        withTiming(`Sync checked; attachment files could not download in this pass: ${result.attachmentResourceError}`),
        'skipped',
        'partial'
      );
    }
    return createPassResult(withTiming(`Attachment download failed: ${result.attachmentResourceError}`), 'failed');
  }
  if (result.contentBlobError) {
    if (hasRemainingResourceBacklog(result)) {
      return createPassResult(
        withTiming(`Sync checked; topic bodies could not download in this pass: ${result.contentBlobError}`),
        'skipped',
        'partial'
      );
    }
    return createPassResult(withTiming(`Topic body download failed: ${result.contentBlobError}`), 'failed');
  }
  return null;
}

function describePushPass(
  result: CompanionSyncPassInput,
  withTiming: (message: string) => string
) {
  if (result.pushError) {
    return createPassResult(
      withTiming(`Android changes could not be sent: ${result.pushError}`),
      'skipped',
      'blocked'
    );
  }
  const rejectedOrConflicted = Math.max(
    result.pushIssueCount ?? 0,
    (result.pushConflictCount ?? 0) + (result.pushRejectedCount ?? 0)
  );
  if (rejectedOrConflicted > 0) {
    return createPassResult(
      withTiming(`${formatSyncPassCount(rejectedOrConflicted, 'Android change', 'Android changes')} ${rejectedOrConflicted === 1 ? 'needs' : 'need'} review before sending.`),
      'skipped',
      'blocked'
    );
  }
  return null;
}

function describeCompletedPass(
  result: CompanionSyncPassInput,
  withTiming: (message: string) => string
) {
  if (
    result.remainingContentBlobCount === 0 &&
    result.remainingAttachmentResourceCount === 0 &&
    (result.remainingStructureChangeCount === undefined || result.remainingStructureChangeCount === 0) &&
    result.localDirtyCount === 0 &&
    result.pendingAckCount === 0
  ) {
    return createPassResult(withTiming('All stages completed.'), 'completed');
  }
  return null;
}

function describeUnfinishedPass(
  result: CompanionSyncPassInput,
  withTiming: (message: string) => string
) {
  if (
    result.remainingContentBlobCount === 0 &&
    result.remainingAttachmentResourceCount === 0 &&
    (result.remainingStructureChangeCount === undefined || result.remainingStructureChangeCount === 0)
  ) {
    return createPassResult(withTiming('Android changes are still waiting to settle.'), 'skipped', 'blocked');
  }
  if (result.remainingStructureChangeCount === null || (result.remainingStructureChangeCount ?? 0) > 0) {
    return createPassResult(withTiming('Topic list confirmation is still pending.'), 'skipped', 'partial');
  }
  if (hasFailedResourceBacklog(result)) {
    return createPassResult(withTiming('Resource downloads need another pass; some downloads failed earlier.'), 'skipped');
  }
  if (hasRemainingResourceBacklog(result)) {
    return createPassResult(
      withTiming(madeResourceProgress(result) ? 'Resource downloads made progress and will continue.' : 'Resource downloads are still pending.'),
      'skipped'
    );
  }
  return createPassResult(withTiming(clarifyCheckOnlyMessage('Sync checked')), 'skipped');
}
