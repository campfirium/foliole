export function createEmptyResourceStages() {
  return {
    remainingAttachmentResourceCount: 0,
    remainingAttachmentResourceBytes: null,
    remainingFailedAttachmentResourceCount: 0,
    remainingFailedAttachmentResourceBytes: null,
    remainingAttachmentBreakdown: undefined,
    attachmentResourceError: null,
    contentBlobError: null,
    syncedAttachmentResourceElapsedMs: 0,
    syncedAttachmentIds: [],
    syncedAttachmentResourceBytes: 0,
    syncedContentBlobElapsedMs: 0,
    syncedContentBlobBytes: 0,
    syncedContentBlobHashes: [],
    syncedResourceElapsedMs: 0
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
    remainingContentBlobBytes: null,
    remainingContentBlobCount: null,
    remainingFailedContentBlobBytes: null,
    remainingFailedContentBlobCount: null,
    remainingStructureChangeCount: 0
  };
}
