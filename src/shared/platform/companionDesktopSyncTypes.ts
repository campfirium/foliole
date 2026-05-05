export interface CompanionDesktopSyncOptions {
  onProgress?: (progress: CompanionDesktopSyncProgress) => void;
  onStructureSynced?: () => Promise<void> | void;
}

export interface CompanionDesktopSyncProgress {
  attachmentBreakdown?: {
    activeTopicAttachments?: number;
    dueReviewAttachments?: number;
    imageAttachments?: number;
    imageBytes?: number;
    otherAttachments?: number;
    otherBytes?: number;
    pdfAttachments?: number;
    pdfBytes?: number;
  };
  completed: number;
  completedBytes?: number;
  elapsedMs?: number;
  failedCount?: number;
  failedBytes?: number;
  contentBreakdown?: {
    activeTopicBodies?: number;
    dueReviewBodies?: number;
    externalDocumentBodies?: number;
    nestedTopicBodies?: number;
    topLevelTopicBodies?: number;
    topicBodies?: number;
  };
  mode?: 'active' | 'remaining';
  phase: 'attachment' | 'content' | 'structure';
  total: number | null;
  totalBytes?: number | null;
}

export interface CompanionContentBlobNativeTiming {
  dbElapsedMs: number;
  httpElapsedMs: number;
  parseElapsedMs: number;
  totalElapsedMs: number;
}

export interface CompanionDesktopSyncResult {
  appliedNodeIds: string[];
  appliedPackBlobCount: number;
  appliedPackObjectCount: number;
  appliedObjectIds: string[];
  appliedReviewOpIds: string[];
  changedObjectIds: string[];
  pushedNodeIds: string[];
  pushedObjectIds: string[];
  pushedReviewOpIds: string[];
  pushError: string | null;
  requestedObjectIds: string[];
  syncedAttachmentIds: string[];
  syncedAttachmentResourceBytes: number;
  syncedAttachmentResourceElapsedMs?: number;
  syncedContentBlobElapsedMs?: number;
  syncedContentBlobNativeTiming?: CompanionContentBlobNativeTiming;
  syncedResourceElapsedMs: number;
  syncedStructureElapsedMs?: number;
  attachmentResourceError: string | null;
  contentBlobError: string | null;
  localDirtyCount: number | null;
  pendingAckCount: number | null;
  pushConflictCount: number;
  pushIssueCount: number | null;
  pushRejectedCount: number;
  remainingAttachmentBreakdown?: CompanionDesktopSyncProgress['attachmentBreakdown'];
  remainingAttachmentResourceBytes: number | null;
  remainingAttachmentResourceCount: number | null;
  remainingFailedAttachmentResourceBytes: number | null;
  remainingFailedAttachmentResourceCount: number | null;
  remainingContentBreakdown?: CompanionDesktopSyncProgress['contentBreakdown'];
  remainingContentBlobBytes: number | null;
  remainingContentBlobCount: number | null;
  remainingFailedContentBlobBytes: number | null;
  remainingFailedContentBlobCount: number | null;
  remainingStructureChangeCount: number | null;
  syncedContentBlobHashes: string[];
  syncedContentBlobBytes: number;
}
