import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';

const syncObjectsMock = vi.hoisted(() => ({
  syncCompanionObjectsFromDesktop: vi.fn()
}));
const syncPlatformMock = vi.hoisted(() => ({
  loadCompanionReadableArticle: vi.fn(async () => null),
  recordCompanionWorkspaceSyncEvent: vi.fn(),
}));
const stageEventsMock = vi.hoisted(() => ({
  recordCompanionSyncStageEvents: vi.fn(async () => undefined)
}));
const provisioningMock = vi.hoisted(() => ({
  activateCompanionSyncGroupIfComplete: vi.fn(async () => null),
  isCompanionSyncGroupProvisioning: vi.fn(async () => false)
}));

vi.mock('../shared/platform/companionDesktopSyncObjects', () => syncObjectsMock);
vi.mock('../shared/platform/companion/sync/syncGroupProvisioning', () => ({
  activateCompanionSyncGroupIfComplete: provisioningMock.activateCompanionSyncGroupIfComplete
}));
vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({
  recoverInterruptedCompanionSyncGroupProvisioning: provisioningMock.isCompanionSyncGroupProvisioning
}));
vi.mock('../shared/platform/companionSyncObjects', () => ({ loadCompanionSyncNodeConflicts: vi.fn(async () => []) }));
vi.mock('../shared/platform/companionWorkspaceSync', () => syncPlatformMock);
vi.mock('./companionStructureSyncSnapshot', () => ({ loadCompanionStateAfterStructureSync: vi.fn(async () => null) }));
vi.mock('./companionSyncStageEvents', () => stageEventsMock);

function createSyncObjectsResult(
  overrides: Partial<CompanionDesktopSyncResult> = {}
): CompanionDesktopSyncResult {
  return {
    appliedNodeIds: [], appliedObjectIds: [], appliedPackBlobCount: 0, appliedPackObjectCount: 0,
    appliedReviewOpIds: [], attachmentResourceError: null, changedObjectIds: [], contentBlobError: null,
    localDirtyCount: 0, pendingAckCount: 0, pushedNodeIds: [], pushedObjectIds: [], pushedReviewOpIds: [],
    pushConflictCount: 0, pushError: null, pushIssueCount: 0, pushRejectedCount: 0,
    remainingAttachmentResourceBytes: null, remainingAttachmentResourceCount: 0,
    remainingFailedAttachmentResourceBytes: null, remainingFailedAttachmentResourceCount: 0,
    remainingContentBlobBytes: null, remainingContentBlobCount: 0, remainingFailedContentBlobBytes: null,
    remainingFailedContentBlobCount: 0, remainingStructureChangeCount: 0, requestedObjectIds: [],
    syncedAttachmentIds: [], syncedAttachmentResourceBytes: 0, syncedContentBlobBytes: 0,
    syncedContentBlobHashes: [], syncedResourceElapsedMs: 0, ...overrides
  };
}

function createSyncState() {
  return {
    endpoint_url: 'http://127.0.0.1:38641', last_synced_at: null, remembered_targets: [],
    sync_events: [], sync_onboarding_status: 'completed' as const, workspace_snapshot: null
  };
}

function syncArgs() {
  return {
    endpointUrl: 'http://127.0.0.1:38641',
    runId: 'run-1',
    setReadableArticle: vi.fn(),
    setSyncConflictCount: vi.fn(),
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    startedAt: '2026-07-25T05:00:00.000Z',
    workspaceSnapshot: null
  };
}

describe('manual companion sync structure catch-up', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    provisioningMock.isCompanionSyncGroupProvisioning.mockResolvedValue(false);
    syncPlatformMock.recordCompanionWorkspaceSyncEvent.mockResolvedValue(createSyncState());
  });

  it('consumes a resolution created after the first structure pack in the same run', async () => {
    syncObjectsMock.syncCompanionObjectsFromDesktop
      .mockResolvedValueOnce(createSyncObjectsResult({ appliedPackObjectCount: 3, remainingStructureChangeCount: 3 }))
      .mockResolvedValueOnce(createSyncObjectsResult());
    const { syncCompanionDesktopStreams } = await import('./companionWorkspaceManualSync');

    await syncCompanionDesktopStreams(syncArgs());

    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledTimes(2);
    expect(stageEventsMock.recordCompanionSyncStageEvents).toHaveBeenCalledTimes(2);
    expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'run_finished', message: 'All stages completed.', result: 'completed'
    }));
  });

  it('stops an actively changing desktop after three immediate structure passes', async () => {
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(
      createSyncObjectsResult({ appliedPackObjectCount: 1, remainingStructureChangeCount: 1 })
    );
    const { syncCompanionDesktopStreams } = await import('./companionWorkspaceManualSync');

    await syncCompanionDesktopStreams(syncArgs());

    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledTimes(3);
    expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'run_finished', message: 'Topic list confirmation is still pending.', result: 'partial'
    }));
  });

  it('finishes a decreasing resource backlog before activating a provisioning member', async () => {
    provisioningMock.isCompanionSyncGroupProvisioning.mockResolvedValue(true);
    syncObjectsMock.syncCompanionObjectsFromDesktop
      .mockResolvedValueOnce(createSyncObjectsResult({ remainingContentBlobCount: 1404 }))
      .mockResolvedValueOnce(createSyncObjectsResult({ remainingContentBlobCount: 764 }))
      .mockResolvedValueOnce(createSyncObjectsResult({ remainingContentBlobCount: 0 }));
    const { syncCompanionDesktopStreams } = await import('./companionWorkspaceManualSync');

    await syncCompanionDesktopStreams(syncArgs());

    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledTimes(3);
    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenLastCalledWith(
      'http://127.0.0.1:38641', expect.objectContaining({ resourcesOnly: true })
    );
    expect(provisioningMock.activateCompanionSyncGroupIfComplete).toHaveBeenCalledOnce();
  });

  it('stops provisioning continuation when a resource pass makes no progress', async () => {
    provisioningMock.isCompanionSyncGroupProvisioning.mockResolvedValue(true);
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(
      createSyncObjectsResult({ remainingContentBlobCount: 1404 })
    );
    const { syncCompanionDesktopStreams } = await import('./companionWorkspaceManualSync');

    await syncCompanionDesktopStreams(syncArgs());

    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledTimes(2);
  });
});
