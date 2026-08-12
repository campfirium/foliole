import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';

const syncObjectsMock = vi.hoisted(() => ({
  loadCompanionSyncNodeConflicts: vi.fn(async () => []),
  syncCompanionObjectsFromDesktop: vi.fn()
}));
const workspaceSyncMock = vi.hoisted(() => ({
  bindCompanionWorkspaceSyncTarget: vi.fn(async () => undefined),
  loadCompanionReadableArticle: vi.fn(async () => null),
  loadCompanionWorkspaceSyncState: vi.fn(),
  persistCompanionWorkspaceSnapshot: vi.fn(),
  recordCompanionWorkspaceSyncEvent: vi.fn(),
  removeCompanionWorkspaceSyncRememberedTarget: vi.fn(),
  resolveReachableCompanionWorkspaceSyncEndpoint: vi.fn(async (endpointUrl: string) => endpointUrl),
  resolveReachableCompanionWorkspaceSyncEndpoints: vi.fn(async (endpointUrl: string) => [{ endpointUrl }]),
  saveCompanionSyncOnboardingStatus: vi.fn(),
  saveCompanionWorkspaceSyncEndpoint: vi.fn()
}));

vi.mock('../shared/platform/companionDesktopSyncObjects', () => syncObjectsMock);
vi.mock('../shared/platform/companionSyncObjects', () => ({
  loadCompanionSyncNodeConflicts: syncObjectsMock.loadCompanionSyncNodeConflicts
}));
vi.mock('../shared/platform/companionWorkspaceSync', () => workspaceSyncMock);

function snapshot(nodeId = 'topic-1'): WorkspaceSnapshot {
  return {
    activeNodeId: nodeId,
    nodeOrder: [nodeId],
    nodesById: {
      [nodeId]: {
        anchorLink: null,
        content: '# Synced topic',
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

function syncState(): NativeCompanionWorkspaceSyncState {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: null,
    remembered_targets: ['http://10.0.2.2:38641'],
    sync_events: [],
    sync_onboarding_status: 'completed',
    workspace_snapshot: snapshot()
  };
}

function syncResult(): CompanionDesktopSyncResult {
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
    pushConflictCount: 0,
    pushedNodeIds: [],
    pushedObjectIds: [],
    pushedReviewOpIds: [],
    pushError: null,
    pushIssueCount: 0,
    pushRejectedCount: 0,
    remainingAttachmentResourceBytes: 0,
    remainingAttachmentResourceCount: 0,
    remainingContentBlobBytes: 0,
    remainingContentBlobCount: 0,
    remainingFailedAttachmentResourceBytes: 0,
    remainingFailedAttachmentResourceCount: 0,
    remainingFailedContentBlobBytes: 0,
    remainingFailedContentBlobCount: 0,
    remainingStructureChangeCount: 0,
    requestedObjectIds: [],
    syncedAttachmentIds: [],
    syncedAttachmentResourceBytes: 0,
    syncedContentBlobBytes: 0,
    syncedContentBlobHashes: [],
    syncedResourceElapsedMs: 0
  };
}

function countRunEvents() {
  return workspaceSyncMock.recordCompanionWorkspaceSyncEvent.mock.calls.filter(([event]) => (
    event.kind === 'run_started' || event.kind === 'run_finished'
  )).length;
}

async function startBlockedSync() {
  let releaseSync: () => void = () => undefined;
  const syncStarted = new Promise<void>((resolveStarted) => {
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementationOnce(async () => {
      resolveStarted();
      await new Promise<void>((resolve) => {
        releaseSync = resolve;
      });
      return syncResult();
    });
  });
  return { releaseSync: () => releaseSync(), syncStarted };
}

describe('companion sync run owner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    workspaceSyncMock.recordCompanionWorkspaceSyncEvent.mockResolvedValue(syncState());
    workspaceSyncMock.loadCompanionWorkspaceSyncState.mockResolvedValue(syncState());
    workspaceSyncMock.resolveReachableCompanionWorkspaceSyncEndpoint.mockImplementation(async (endpointUrl: string) => endpointUrl);
    workspaceSyncMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockImplementation(
      async (endpointUrl: string) => [{ endpointUrl }]
    );
  });

  it('lets manual sync wait for an active auto run without writing activity', async () => {
    const { createWorkspaceSnapshotActions } = await import('./companionWorkspaceSyncActions');
    const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
    const { releaseSync, syncStarted } = await startBlockedSync();
    const actions = createWorkspaceSnapshotActions({
      setError: vi.fn(),
      setReadableArticle: vi.fn(),
      setState: vi.fn(),
      setSyncConflictCount: vi.fn(),
      setSyncProgress: vi.fn(),
      setStatus: vi.fn(),
      state: syncState()
    });

    const autoSync = tryForegroundAutoSync({
      cancelled: () => false,
      setError: vi.fn(),
      setReadableArticle: vi.fn(),
      setState: vi.fn(),
      setSyncProgress: vi.fn(),
      setStatus: vi.fn(),
      state: syncState()
    });
    await syncStarted;
    const manualSync = actions.pullFromDesktop('http://10.0.2.2:38641');
    releaseSync();

    await Promise.all([autoSync, manualSync]);
    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledTimes(1);
    expect(countRunEvents()).toBe(2);
  });
});
