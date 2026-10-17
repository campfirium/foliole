export interface CompanionDesktopSyncOptions {
  framedPeer?: {
    deviceId: string;
    libraryEpoch: string;
    protocolVersion: number;
  };
  includeResources?: boolean;
  waitForInbound?: () => boolean;
  signal?: AbortSignal;
  onProgress?: (progress: CompanionDesktopSyncProgress) => void;
  onStructureSynced?: (facts: { receivedCount: number; workspaceChanged: boolean }) => Promise<void> | void;
  onDatabaseConfirmed?: (confirmedAt: string) => Promise<void>;
  resourcesOnly?: boolean;
  restoreId?: string;
  runId?: string;
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
  mode?: 'active' | 'remaining';
  phase: 'attachment' | 'structure' | 'waiting';
  total: number | null;
  totalBytes?: number | null;
}


export interface CompanionDesktopSyncResult {
  databaseConfirmedAt?: string;
  sessionConfirmationPending?: boolean;
  syncMetadataUnavailable?: boolean;
  madeDatabaseProgress?: boolean;
  dynamicDatabaseBacklog?: boolean;
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
  transferredAttachmentCount?: number;
  transferredAttachmentBlockCount?: number;
  attachmentWorkYielded?: boolean;
  syncedAttachmentResourceElapsedMs?: number;
  syncedStructureElapsedMs?: number;
  attachmentResourceError: string | null;
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
  remainingStructureChangeCount: number | null;
}
