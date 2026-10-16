export function createEmptyResourceStages() {
  return {
    remainingAttachmentResourceCount: 0,
    remainingAttachmentResourceBytes: null,
    remainingFailedAttachmentResourceCount: 0,
    remainingFailedAttachmentResourceBytes: null,
    remainingAttachmentBreakdown: undefined,
    attachmentResourceError: null,
    syncedAttachmentResourceElapsedMs: 0,
  };
}

export function createSkippedResourceSummary() {
  return {
    localDirtyCount: 0,
    pendingAckCount: 0,
    pushIssueCount: 0,
    remainingAttachmentResourceBytes: null,
    remainingAttachmentResourceCount: null,
    remainingFailedAttachmentResourceBytes: null,
    remainingFailedAttachmentResourceCount: null,
    remainingStructureChangeCount: 0
  };
}
