import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';

import {
  formatSyncPassCount
} from './companionSyncPassResultFormat';

export interface CompanionSyncPassInput {
  attachmentResourceError: string | null;
  contentBlobError: string | null;
  localDirtyCount?: number | null | undefined;
  pendingAckCount?: number | null | undefined;
  pushConflictCount?: number | undefined;
  pushError?: string | null | undefined;
  pushIssueCount?: number | null | undefined;
  pushRejectedCount?: number | undefined;
  syncedAttachmentIds?: string[] | undefined;
  syncedAttachmentResourceElapsedMs?: number | undefined;
  syncedAttachmentResourceBytes?: number | undefined;
  syncedContentBlobElapsedMs?: number | undefined;
  syncedContentBlobBytes?: number | undefined;
  syncedContentBlobHashes?: string[] | undefined;
  syncedContentBlobNativeTiming?: {
    dbElapsedMs: number;
    httpElapsedMs: number;
    parseElapsedMs: number;
    totalElapsedMs: number;
  } | undefined;
  syncedResourceElapsedMs?: number | undefined;
  syncedStructureElapsedMs?: number | undefined;
  remainingAttachmentBreakdown?: {
    activeTopicAttachments?: number;
    dueReviewAttachments?: number;
    imageAttachments?: number;
    imageBytes?: number;
    otherAttachments?: number;
    otherBytes?: number;
    pdfAttachments?: number;
    pdfBytes?: number;
  } | undefined;
  remainingAttachmentResourceBytes?: number | null | undefined;
  remainingAttachmentResourceCount: number | null;
  remainingFailedAttachmentResourceBytes?: number | null | undefined;
  remainingFailedAttachmentResourceCount?: number | null | undefined;
  remainingContentBreakdown?: {
    activeTopicBodies?: number;
    dueReviewBodies?: number;
    externalDocumentBodies?: number;
    nestedTopicBodies?: number;
    topLevelTopicBodies?: number;
    topicBodies?: number;
  } | undefined;
  remainingContentBlobBytes?: number | null | undefined;
  remainingContentBlobCount: number | null;
  remainingFailedContentBlobBytes?: number | null | undefined;
  remainingFailedContentBlobCount?: number | null | undefined;
  remainingStructureChangeCount?: number | null | undefined;
}

export interface CompanionSyncPassResult {
  message: string;
  outcome: 'completed' | 'failed' | 'skipped';
  result: NonNullable<CompanionSyncPassResultEvent['result']>;
  status: 'completed' | 'failed' | 'skipped';
}

type CompanionSyncPassResultEvent = Pick<NativeCompanionSyncEvent, 'result'>;

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
        withTiming(`Sync checked; body downloads could not finish in this pass: ${result.contentBlobError}`),
        'skipped',
        'partial'
      );
    }
    return createPassResult(withTiming(`Body download failed: ${result.contentBlobError}`), 'failed');
  }
  return null;
}

function describePushPass(
  result: CompanionSyncPassInput,
  withTiming: (message: string) => string
) {
  const extra = describePullBacklogWhilePushPending(result);
  if (result.pushError) {
    return createPassResult(
      withTiming(`Android changes were not sent: ${result.pushError}${extra}`),
      'skipped',
      'retrying'
    );
  }
  const rejectedOrConflicted = Math.max(
    result.pushIssueCount ?? 0,
    (result.pushConflictCount ?? 0) + (result.pushRejectedCount ?? 0)
  );
  if (rejectedOrConflicted > 0) {
    return createPassResult(
      withTiming(`${formatSyncPassCount(rejectedOrConflicted, 'Android change was', 'Android changes were')} not sent after desktop rejected or conflicted ${rejectedOrConflicted === 1 ? 'it' : 'them'}.${extra}`),
      'skipped',
      'waiting'
    );
  }
  return null;
}

function describePullBacklogWhilePushPending(result: CompanionSyncPassInput) {
  if (result.remainingStructureChangeCount === null || (result.remainingStructureChangeCount ?? 0) > 0) {
    return ' Topic list confirmation is still pending.';
  }
  if (hasRemainingResourceBacklog(result)) {
    return ' Resource downloads are still pending.';
  }
  return '';
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
    return createPassResult(withTiming('Android changes are still waiting to settle.'), 'skipped', 'waiting');
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
