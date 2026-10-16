import { definedProps } from '../shared/lib/definedProps';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';

import type { CompanionSyncPassInput } from './companionSyncPassResult';

function hasRemainingResourceBacklog(result: CompanionSyncPassInput) {
  return isKnownBacklog(result.remainingAttachmentResourceCount);
}

function isKnownBacklog(count: number | null) {
  return typeof count === 'number' && count > 0;
}

function hasAttachmentProgress(result: CompanionSyncPassInput) {
  return (result.transferredAttachmentCount ?? 0) > 0;
}

function knownNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value : undefined;
}

export function shouldClearCompanionSyncProgress(result: CompanionSyncPassInput) {
  if (result.attachmentResourceError) {
    return !hasRemainingResourceBacklog(result);
  }
  const structureDone = result.remainingStructureChangeCount === undefined || result.remainingStructureChangeCount === 0;
  return !isKnownBacklog(result.remainingAttachmentResourceCount) && structureDone;
}

export function buildRemainingSyncProgress(result: CompanionSyncPassInput): CompanionDesktopSyncProgress | null {
  if (isKnownBacklog(result.remainingAttachmentResourceCount)) {
    if (hasAttachmentProgress(result)) {
      return null;
    }
    return {
      completed: 0,
      completedBytes: 0,
      mode: 'remaining',
      phase: 'attachment',
      total: result.remainingAttachmentResourceCount,
      totalBytes: result.remainingAttachmentResourceBytes ?? null,
      ...definedProps({
        attachmentBreakdown: result.remainingAttachmentBreakdown,
        failedBytes: knownNumber(result.remainingFailedAttachmentResourceBytes),
        failedCount: knownNumber(result.remainingFailedAttachmentResourceCount)
      })
    };
  }
  const remaining = result.remainingStructureChangeCount;
  if (remaining === undefined || remaining === 0) {
    return null;
  }
  return {
    completed: 0,
    mode: 'remaining',
    phase: 'structure',
    total: remaining
  };
}
