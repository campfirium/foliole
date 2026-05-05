import { vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';

export const syncPlatformMock = {
  loadCompanionReadableArticle: vi.fn(async () => null),
  recordCompanionWorkspaceSyncEvent: vi.fn()
};

export const syncObjectsMock = {
  syncCompanionObjectsFromDesktop: vi.fn()
};

vi.mock('../shared/platform/companionWorkspaceSync', () => syncPlatformMock);
vi.mock('../shared/platform/companionDesktopSyncObjects', () => syncObjectsMock);

export function createSyncObjectsResult(overrides: Partial<CompanionDesktopSyncResult> = {}): CompanionDesktopSyncResult {
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
    remainingContentBreakdown: undefined,
    remainingContentBlobBytes: null,
    remainingContentBlobCount: 0,
    remainingStructureChangeCount: 0,
    requestedObjectIds: [],
    syncedAttachmentIds: [],
    syncedAttachmentResourceBytes: 0,
    syncedContentBlobHashes: [],
    syncedContentBlobBytes: 0,
    ...overrides
  };
}

export function createSyncState(overrides: Partial<NativeCompanionWorkspaceSyncState> = {}): NativeCompanionWorkspaceSyncState {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: '2026-04-25T08:00:00.000Z',
    remembered_targets: ['http://10.0.2.2:38641'],
    sync_events: [],
    sync_onboarding_status: 'completed',
    workspace_snapshot: null,
    ...overrides
  };
}

export function resetCompanionWorkspaceSyncFlowMocks() {
  vi.resetAllMocks();
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult());
  syncPlatformMock.recordCompanionWorkspaceSyncEvent.mockResolvedValue(createSyncState());
}
