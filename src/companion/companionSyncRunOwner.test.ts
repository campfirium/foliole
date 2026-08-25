import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionWorkspaceSyncTarget } from '../shared/platform/companion/network/companionWorkspaceEndpoint';
import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';

let persistedEvents: NativeCompanionWorkspaceSyncState['sync_events'] = [];

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

const activeGroupTarget: CompanionWorkspaceSyncTarget = {
  authorizationId: 'authorization-maci',
  endpointUrl: 'http://192.168.1.20:38641',
  groupId: 'group-1',
  hostName: 'Maci'
};

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
    sync_events: persistedEvents,
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

function resetSyncRunOwnerMocks() {
  vi.resetAllMocks();
  persistedEvents = [];
  workspaceSyncMock.recordCompanionWorkspaceSyncEvent.mockImplementation(async (event) => {
    persistedEvents = [{
      endpoint_url: event.endpointUrl,
      id: `event-${persistedEvents.length + 1}`,
      kind: event.kind,
      message: event.message,
      occurred_at: event.occurredAt ?? new Date().toISOString(),
      result: event.result,
      run_id: event.runId,
      started_at: event.startedAt,
      status: event.status,
      summary: event.summary
    }, ...persistedEvents];
    return syncState();
  });
  workspaceSyncMock.loadCompanionWorkspaceSyncState.mockImplementation(async () => syncState());
  workspaceSyncMock.resolveReachableCompanionWorkspaceSyncEndpoint.mockImplementation(async (endpointUrl: string) => endpointUrl);
  workspaceSyncMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockImplementation(
    async (endpointUrl: string) => [{ endpointUrl }]
  );
}

describe('companion sync run owner', () => {
  beforeEach(resetSyncRunOwnerMocks);

  it('queues a distinct clicked manual run behind an active automatic run', async () => {
    const { createWorkspaceSnapshotActions } = await import('./companionWorkspaceSyncActions');
    const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
    const { releaseSync, syncStarted } = await startBlockedSync();
    const setManualSyncAction = vi.fn();
    const actions = createWorkspaceSnapshotActions({
      setError: vi.fn(),
      setReadableArticle: vi.fn(),
      setState: vi.fn(),
      setSyncConflictCount: vi.fn(),
      setSyncProgress: vi.fn(),
      setManualSyncAction,
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
    expect(setManualSyncAction.mock.calls.map(([action]) => action.status)).toEqual(['starting']);
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(syncResult());
    releaseSync();

    await autoSync;
    await expect(manualSync).resolves.toMatchObject({ sync_events: expect.any(Array) });
    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledTimes(2);
    expect(countRunEvents()).toBe(4);
    const lifecycle = setManualSyncAction.mock.calls.map(([action]) => action);
    expect(lifecycle.map(({ status }) => status)).toEqual(['starting', 'running', 'terminal']);
    expect(new Set(lifecycle.map(({ runId }) => runId)).size).toBe(1);
    expect(lifecycle.at(-1)?.terminalResult).toBe('completed');
  });
});

describe('companion manual sync target selection', () => {
  beforeEach(resetSyncRunOwnerMocks);

  it('runs immediate sync through the discovered active group member instead of the remembered target', async () => {
    const { createWorkspaceSnapshotActions } = await import('./companionWorkspaceSyncActions');
    workspaceSyncMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockResolvedValueOnce([activeGroupTarget]);
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValueOnce(syncResult());
    const setManualSyncAction = vi.fn();
    const actions = createWorkspaceSnapshotActions({
      setError: vi.fn(), setReadableArticle: vi.fn(), setState: vi.fn(),
      setSyncConflictCount: vi.fn(), setSyncProgress: vi.fn(), setStatus: vi.fn(),
      setManualSyncAction,
      state: syncState()
    });

    await actions.pullFromDesktop('http://remembered:38641');

    expect(workspaceSyncMock.bindCompanionWorkspaceSyncTarget).toHaveBeenCalledWith(activeGroupTarget);
    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledWith(
      'http://192.168.1.20:38641', expect.any(Object)
    );
    const lifecycle = setManualSyncAction.mock.calls.map(([action]) => action);
    expect(lifecycle.map(({ status }) => status)).toEqual(['starting', 'running', 'terminal']);
    expect(new Set(lifecycle.map(({ runId }) => runId)).size).toBe(1);
    expect(lifecycle.at(-1)?.started).toBe(true);
    expect(lifecycle.at(-1)?.terminalResult).toBe('completed');
  });
});
