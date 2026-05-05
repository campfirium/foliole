import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';

import type { CompanionSyncPassInput } from './companionSyncPassResult';

export function shouldClearCompanionSyncProgress(result: CompanionSyncPassInput) {
  if (result.attachmentResourceError || result.contentBlobError) {
    return true;
  }
  const structureDone = result.remainingStructureChangeCount === undefined || result.remainingStructureChangeCount === 0;
  return result.remainingAttachmentResourceCount === 0 && result.remainingContentBlobCount === 0 && structureDone;
}

export function buildRemainingStructureProgress(result: CompanionSyncPassInput): CompanionDesktopSyncProgress | null {
  if (result.remainingContentBlobCount !== 0 || result.remainingAttachmentResourceCount !== 0) {
    return null;
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
