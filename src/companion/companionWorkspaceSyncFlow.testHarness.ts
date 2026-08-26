import { vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionWorkspaceSyncTarget } from '../shared/platform/companion/network/companionWorkspaceEndpoint';
import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';

export const syncPlatformMock = {
  bindCompanionWorkspaceSyncTarget: vi.fn(),
  loadCompanionReadableArticle: vi.fn(async () => null),
  loadCompanionWorkspaceSyncState: vi.fn(),
  recordCompanionWorkspaceSyncEvent: vi.fn(),
  resolveReachableCompanionWorkspaceSyncEndpoint: vi.fn(async (endpointUrl: string) => endpointUrl),
  resolveReachableCompanionWorkspaceSyncEndpoints: vi.fn(
    async (endpointUrl: string): Promise<CompanionWorkspaceSyncTarget[]> => [{ endpointUrl }]
  ),
  saveCompanionWorkspaceSyncEndpoint: vi.fn()
};

export const syncObjectsMock = {
  syncCompanionObjectsFromDesktop: vi.fn()
};

vi.mock('../shared/platform/companionWorkspaceSync', () => syncPlatformMock);
vi.mock('../shared/platform/companionDesktopSyncObjects', () => syncObjectsMock);
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  beginNativeCompanionSyncRun: vi.fn(async (reason: string, runId: string) => ({ reason, run_id: runId, runtime: 'android' }))
}));

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
    syncedContentBlobHashes: [],
    syncedContentBlobBytes: 0,
    syncedResourceElapsedMs: 0,
    ...overrides
  };
}

export function createWorkspaceSnapshot(nodeId = 'topic-1'): WorkspaceSnapshot {
  return {
    activeNodeId: nodeId,
    nodeOrder: [nodeId],
    nodesById: {
      [nodeId]: {
        anchorLink: null,
        content: '# Synced topic\n\nBody',
        createdAt: '2026-04-25T09:00:00.000Z',
        hideTitleHeading: false,
        id: nodeId,
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
  syncPlatformMock.loadCompanionWorkspaceSyncState.mockResolvedValue(createSyncState());
  syncPlatformMock.recordCompanionWorkspaceSyncEvent.mockResolvedValue(createSyncState());
  syncPlatformMock.bindCompanionWorkspaceSyncTarget.mockResolvedValue(undefined);
  syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoint.mockImplementation(async (endpointUrl: string) => endpointUrl);
  syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockImplementation(
    async (endpointUrl: string) => [{ endpointUrl }]
  );
  syncPlatformMock.saveCompanionWorkspaceSyncEndpoint.mockResolvedValue(createSyncState());
}
