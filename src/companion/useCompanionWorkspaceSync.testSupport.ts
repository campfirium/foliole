import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { NativeSyncNodeConflictRecord } from '../../lib/platform/nativeSyncContract';
import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';

export function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'topic-1',
    nodeOrder: ['topic-1'],
    nodesById: {
      'topic-1': {
        anchorLink: null,
        content: '# Synced topic\n\nBody',
        createdAt: '2026-04-25T09:00:00.000Z',
        hideTitleHeading: false,
        id: 'topic-1',
        isTitleManual: false,
        kind: 'topic',
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        title: 'Synced topic',
        updatedAt: '2026-04-25T09:05:00.000Z'
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

export function createSyncState(snapshot: WorkspaceSnapshot | null) {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: snapshot ? '2026-04-25T09:06:00.000Z' : null,
    remembered_targets: ['http://10.0.2.2:38641'],
    sync_events: [],
    sync_onboarding_status: 'completed' as const,
    workspace_snapshot: snapshot
  };
}

export function createSyncObjectsResult(
  overrides: Partial<CompanionDesktopSyncResult> = {}
): CompanionDesktopSyncResult {
  return {
    appliedNodeIds: [],
    appliedObjectIds: [],
    appliedPackBlobCount: 0,
    appliedPackObjectCount: 0,
    appliedReviewOpIds: [],
    attachmentResourceError: null,
    changedObjectIds: [],
    contentBlobError: null,
    localDirtyCount: 0,
    pendingAckCount: 0,
    pushedNodeIds: [],
    pushedObjectIds: [],
    pushedReviewOpIds: [],
    pushConflictCount: 0,
    pushError: null,
    pushIssueCount: 0,
    pushRejectedCount: 0,
    remainingAttachmentBreakdown: undefined,
    remainingAttachmentResourceBytes: null,
    remainingAttachmentResourceCount: 0,
    remainingFailedAttachmentResourceBytes: null,
    remainingFailedAttachmentResourceCount: 0,
    remainingContentBreakdown: undefined,
    remainingContentBlobBytes: null,
    remainingContentBlobCount: 0,
    remainingFailedContentBlobBytes: null,
    remainingFailedContentBlobCount: 0,
    remainingStructureChangeCount: 0,
    requestedObjectIds: [],
    syncedAttachmentIds: [],
    syncedAttachmentResourceBytes: 0,
    syncedContentBlobBytes: 0,
    syncedContentBlobHashes: [],
    syncedResourceElapsedMs: 0,
    ...overrides
  };
}

export function createConflictSnapshot(title: string): NativeSyncNodeConflictRecord['snapshot'] {
  return {
    anchor_link: null,
    attachments: [],
    content: '',
    created_at: '2026-04-25T09:00:00.000Z',
    deleted_at: null,
    desired_retention: null,
    hide_title_heading: false,
    id: title.toLowerCase(),
    image_regions: null,
    is_title_manual: false,
    kind: 'topic',
    opening_text: null,
    parent_id: null,
    position: null,
    priority: null,
    reveal: null,
    title,
    updated_at: '2026-04-25T09:06:00.000Z',
    virtual_filter: null
  };
}
