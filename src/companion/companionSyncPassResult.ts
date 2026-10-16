import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';


export interface CompanionSyncPassInput {
  databaseConfirmedAt?: string;
  sessionConfirmationPending?: boolean;
  transferredAttachmentCount?: number;
  attachmentResourceError: string | null;
  localDirtyCount?: number | null | undefined;
  pendingAckCount?: number | null | undefined;
  pushConflictCount?: number | undefined;
  pushError?: string | null | undefined;
  pushIssueCount?: number | null | undefined;
  pushRejectedCount?: number | undefined;
  syncedAttachmentResourceElapsedMs?: number | undefined;
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
  return isKnownBacklog(result.remainingAttachmentResourceCount);
}

function isKnownBacklog(count: number | null) {
  return typeof count === 'number' && count > 0;
}

function clarifyCheckOnlyMessage(message: string) {
  return message === 'Sync checked' ? 'Sync checked; resource backlog was not measured in this pass.' : message;
}

function madeResourceProgress(result: CompanionSyncPassInput) {
  return (result.transferredAttachmentCount ?? 0) > 0;
}

function hasFailedResourceBacklog(result: CompanionSyncPassInput) {
  return (result.remainingFailedAttachmentResourceCount ?? 0) > 0;
}

export function describeCompanionSyncPassResult(result: CompanionSyncPassInput): CompanionSyncPassResult {
  if (result.sessionConfirmationPending) return createPassResult(
    'Text and state are waiting for confirmation.', 'skipped', 'partial');
  const errorResult = describeErrorPass(result);
  if (errorResult) return errorResult;
  const pushResult = describePushPass(result);
  if (pushResult) return pushResult;
  const completedResult = describeCompletedPass(result);
  if (completedResult) return completedResult;
  return describeUnfinishedPass(result);
}

function describeErrorPass(
  result: CompanionSyncPassInput
) {
  if (result.attachmentResourceError) {
    if (result.databaseConfirmedAt) return createPassResult(
      'Text and state synced; attachments need another attempt.', 'skipped', 'partial');
    if (hasRemainingResourceBacklog(result)) {
      return createPassResult(
        `Sync checked; attachment files could not download in this pass: ${result.attachmentResourceError}`,
        'skipped',
        'partial'
      );
    }
    return createPassResult(`Attachment download failed: ${result.attachmentResourceError}`, 'failed');
  }
  return null;
}

function describePushPass(
  result: CompanionSyncPassInput
) {
  const extra = describePullBacklogWhilePushPending(result);
  if (result.pushError) {
    return createPassResult(
      `Device changes were not sent: ${result.pushError}${extra}`,
      'skipped',
      'retrying'
    );
  }
  const rejectedOrConflicted = result.pushIssueCount ?? (
    (result.pushConflictCount ?? 0) + (result.pushRejectedCount ?? 0)
  );
  if (rejectedOrConflicted > 0) {
    return createPassResult(
      `${formatSyncPassCount(rejectedOrConflicted, 'device change was', 'device changes were')} not sent after desktop rejected or conflicted ${rejectedOrConflicted === 1 ? 'it' : 'them'}.${extra}`,
      'skipped',
      'waiting'
    );
  }
  return null;
}

function describePullBacklogWhilePushPending(result: CompanionSyncPassInput) {
  if (result.remainingStructureChangeCount === null || (result.remainingStructureChangeCount ?? 0) > 0) {
    return ' Text and state are waiting for confirmation.';
  }
  if (hasRemainingResourceBacklog(result)) {
    return ' Resource downloads are still pending.';
  }
  return '';
}

function describeCompletedPass(
  result: CompanionSyncPassInput
) {
  if (
    result.remainingAttachmentResourceCount === 0 &&
    (result.remainingStructureChangeCount === undefined || result.remainingStructureChangeCount === 0) &&
    result.localDirtyCount === 0 &&
    result.pendingAckCount === 0
  ) {
    return createPassResult('All stages completed.', 'completed');
  }
  return null;
}

function describeUnfinishedPass(
  result: CompanionSyncPassInput
) {
  if (
    result.remainingAttachmentResourceCount === 0 &&
    (result.remainingStructureChangeCount === undefined || result.remainingStructureChangeCount === 0)
  ) {
    return createPassResult('Device changes are still waiting to sync.', 'skipped', 'waiting');
  }
  if (result.remainingStructureChangeCount === null || (result.remainingStructureChangeCount ?? 0) > 0) {
    return createPassResult('Text and state are waiting for confirmation.', 'skipped', 'partial');
  }
  if (hasFailedResourceBacklog(result)) {
    return createPassResult('Resource downloads need another pass; some downloads failed earlier.', 'skipped');
  }
  if (hasRemainingResourceBacklog(result)) {
    return createPassResult(
      madeResourceProgress(result) ? 'Resource downloads made progress and will continue.' : 'Resource downloads are still pending.',
      'skipped'
    );
  }
  return createPassResult(clarifyCheckOnlyMessage('Sync checked'), 'skipped');
}

function formatSyncPassCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}
