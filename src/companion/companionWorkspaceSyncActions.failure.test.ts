import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionWorkspaceSyncTarget } from '../shared/platform/companion/network/companionWorkspaceEndpoint';
import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';

import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';

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
  resolveReachableCompanionWorkspaceSyncEndpoints: vi.fn(
    async (endpointUrl: string): Promise<CompanionWorkspaceSyncTarget[]> => [{ endpointUrl }]
  ),
  saveCompanionSyncOnboardingStatus: vi.fn(),
  saveCompanionWorkspaceSyncEndpoint: vi.fn()
}));

vi.mock('../shared/platform/companionDesktopSyncObjects', () => syncObjectsMock);
vi.mock('../shared/platform/companionSyncObjects', () => ({
  loadCompanionSyncNodeConflicts: syncObjectsMock.loadCompanionSyncNodeConflicts
}));
vi.mock('../shared/platform/companionWorkspaceSync', () => workspaceSyncMock);

function createSnapshot(nodeId = 'topic-1'): WorkspaceSnapshot {
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

function createSyncState(overrides: Partial<NativeCompanionWorkspaceSyncState> = {}): NativeCompanionWorkspaceSyncState {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: null,
    remembered_targets: ['http://10.0.2.2:38641'],
    sync_events: [],
    sync_onboarding_status: 'completed',
    workspace_snapshot: createSnapshot(),
    ...overrides
  };
}

function createSyncResult(): CompanionDesktopSyncResult {
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

function createActions() {
  const callbacks = {
    setError: vi.fn(),
    setReadableArticle: vi.fn(),
    setSyncConflictCount: vi.fn(),
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus: vi.fn()
  };
  return {
    callbacks,
    actions: createWorkspaceSnapshotActions({
      ...callbacks,
      state: createSyncState()
    })
  };
}

describe('companion workspace manual sync failures', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    workspaceSyncMock.recordCompanionWorkspaceSyncEvent.mockResolvedValue(createSyncState());
    workspaceSyncMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockImplementation(
      async (endpointUrl: string) => [{ endpointUrl }]
    );
    workspaceSyncMock.saveCompanionWorkspaceSyncEndpoint.mockResolvedValue(createSyncState());
  });

  it('records the real structure apply cause and leaves the manual sync idle', async () => {
    const { actions, callbacks } = createActions();
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValueOnce(new Error(
      'Failed to apply companion desktop sync pack. FOREIGN KEY constraint failed while inserting node_reading.'
    ));

    await expect(actions.pullFromDesktop('http://10.0.2.2:38641')).rejects.toThrow('FOREIGN KEY constraint failed');

    expect(workspaceSyncMock.recordCompanionWorkspaceSyncEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      message: 'Topic list sync failed: FOREIGN KEY constraint failed while inserting node_reading.',
      status: 'failed'
    }));
    expect(callbacks.setStatus).toHaveBeenNthCalledWith(1, 'syncing');
    expect(callbacks.setStatus).toHaveBeenLastCalledWith('idle');
    expect(callbacks.setSyncProgress).toHaveBeenLastCalledWith(null);
    expect(callbacks.setError).toHaveBeenLastCalledWith(
      'Topic list sync failed: FOREIGN KEY constraint failed while inserting node_reading.'
    );
  });

  it('clears progress and can run again after a failed manual sync', async () => {
    const { actions, callbacks } = createActions();
    syncObjectsMock.syncCompanionObjectsFromDesktop
      .mockRejectedValueOnce(new Error('Desktop sync timed out while applying the structure pack.'))
      .mockResolvedValueOnce(createSyncResult());

    await expect(actions.pullFromDesktop('http://10.0.2.2:38641')).rejects.toThrow('structure pack');
    await expect(actions.pullFromDesktop('http://10.0.2.2:38641')).resolves.toEqual(createSyncState());

    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledTimes(2);
    expect(callbacks.setStatus).toHaveBeenLastCalledWith('idle');
    expect(callbacks.setSyncProgress).toHaveBeenCalledWith(null);
    expect(workspaceSyncMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Topic list sync failed: Desktop sync timed out while applying the structure pack.',
      status: 'failed'
    }));
  });
});

describe('companion workspace manual sync refresh', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    workspaceSyncMock.recordCompanionWorkspaceSyncEvent.mockResolvedValue(createSyncState());
    workspaceSyncMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockImplementation(
      async (endpointUrl: string) => [{ endpointUrl }]
    );
    workspaceSyncMock.saveCompanionWorkspaceSyncEndpoint.mockResolvedValue(createSyncState());
  });

  it('refreshes the visible workspace snapshot after manual structure sync', async () => {
    const { actions, callbacks } = createActions();
    const syncedSnapshot = createSnapshot('synced-topic');
    workspaceSyncMock.loadCompanionWorkspaceSyncState.mockResolvedValue(createSyncState({
      workspace_snapshot: syncedSnapshot
    }));
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementationOnce(async (_endpoint, options) => {
      await options.onStructureSynced?.();
      return createSyncResult();
    });

    await expect(actions.pullFromDesktop('http://10.0.2.2:38641')).resolves.toEqual(createSyncState());

    expect(workspaceSyncMock.loadCompanionWorkspaceSyncState).toHaveBeenCalled();
    expect(workspaceSyncMock.loadCompanionReadableArticle).toHaveBeenCalledWith(syncedSnapshot);
    expect(callbacks.setState).toHaveBeenLastCalledWith(expect.objectContaining({
      workspace_snapshot: syncedSnapshot
    }));
  });

  it('persists the endpoint used for manual sync before pulling desktop data', async () => {
    const { actions, callbacks } = createActions();
    workspaceSyncMock.saveCompanionWorkspaceSyncEndpoint.mockResolvedValueOnce(createSyncState({
      endpoint_url: 'http://10.0.2.2:38641',
      workspace_snapshot: null
    }));
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValueOnce(createSyncResult());

    await expect(actions.pullFromDesktop('http://10.0.2.2:38641')).resolves.toEqual(createSyncState());

    expect(workspaceSyncMock.saveCompanionWorkspaceSyncEndpoint).toHaveBeenCalledWith('http://10.0.2.2:38641');
    expect(callbacks.setState).toHaveBeenCalledWith(expect.objectContaining({
      endpoint_url: 'http://10.0.2.2:38641',
      workspace_snapshot: createSnapshot()
    }));
  });

  it('repairs a stale emulator endpoint before manual sync on a real device', async () => {
    const { actions } = createActions();
    workspaceSyncMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockResolvedValueOnce([{
      authorizationId: 'authorization-maci', endpointUrl: 'http://192.168.0.11:38641',
      groupId: 'group-1', hostName: 'Maci'
    }]);
    workspaceSyncMock.saveCompanionWorkspaceSyncEndpoint.mockResolvedValueOnce(createSyncState({
      endpoint_url: 'http://192.168.0.11:38641',
      remembered_targets: ['http://192.168.0.11:38641', 'http://10.0.2.2:38641']
    }));
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValueOnce(createSyncResult());

    await expect(actions.pullFromDesktop('http://10.0.2.2:38641')).resolves.toEqual(createSyncState());

    expect(workspaceSyncMock.saveCompanionWorkspaceSyncEndpoint).toHaveBeenCalledWith('http://192.168.0.11:38641');
    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledWith(
      'http://192.168.0.11:38641',
      expect.any(Object)
    );
  });
});
