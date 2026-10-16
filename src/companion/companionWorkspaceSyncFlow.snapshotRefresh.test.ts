import { beforeEach, expect, it, vi } from 'vitest';

import { publishCompanionSyncMutationRevision } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';

import { loadActiveCompanionSyncRun } from './companionSyncRunOwner';
import type { TryForegroundAutoSyncArgs } from './companionWorkspaceSyncFlow';
import { createSyncObjectsResult, createSyncState, createWorkspaceSnapshot,
  resetCompanionWorkspaceSyncFlowMocks, syncObjectsMock, syncPlatformMock } from './companionWorkspaceSyncFlow.testHarness';

vi.mock('./companionReviewSchedulerSettingsHydration', () => ({ hydrateCompanionReviewSchedulerSettings: async () => undefined }));
vi.mock('./companionSystemEntryDisplayNamesHydration', () => ({ hydrateCompanionSystemEntryDisplayNames: async () => undefined }));

beforeEach(resetCompanionWorkspaceSyncFlowMocks);

function createView() {
  let state = createSyncState({ workspace_snapshot: createWorkspaceSnapshot('original') });
  return { current: () => state, args: { cancelled: () => false, state,
    setState: (update: Parameters<TryForegroundAutoSyncArgs['setState']>[0]) => {
      state = typeof update === 'function' ? update(state) : update;
    }, setError: vi.fn(), setStatus: vi.fn(), setSyncProgress: vi.fn() } };
}

function receiveChanges() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementationOnce(async (_endpoint, options) => {
    await options.onStructureSynced?.({ receivedCount: 1 });
    return createSyncObjectsResult({ appliedObjectIds: ['received'] });
  });
}

it('releases the run before a slow display refresh and preserves current metadata', async () => {
  const view = createView();
  let resolve!: (state: ReturnType<typeof createSyncState>) => void;
  syncPlatformMock.loadCompanionWorkspaceSyncState.mockImplementation(() => {
    expect(loadActiveCompanionSyncRun()).toBeNull();
    return new Promise(done => { resolve = done; });
  });
  receiveChanges();
  expect(await tryForegroundAutoSync(view.args), JSON.stringify(view.args.setError.mock.calls)).toBe('completed');
  expect(loadActiveCompanionSyncRun()).toBeNull();
  view.args.setState(current => ({ ...current, endpoint_url: 'http://new-target' }));
  resolve(createSyncState({ endpoint_url: 'http://old-target', workspace_snapshot: createWorkspaceSnapshot('received') }));
  await vi.waitFor(() => expect(view.current().workspace_snapshot?.activeNodeId).toBe('received'));
  expect(view.current().endpoint_url).toBe('http://new-target');
});

it('does not rebuild the workspace when no data was received', async () => {
  const view = createView();
  expect(await tryForegroundAutoSync(view.args), JSON.stringify(view.args.setError.mock.calls)).toBe('completed');
  expect(syncPlatformMock.loadCompanionWorkspaceSyncState).not.toHaveBeenCalled();
  expect(view.current().workspace_snapshot?.activeNodeId).toBe('original');
});

it('reloads after discarding a late snapshot so both remote changes and local edits become visible', async () => {
  const view = createView();
  let resolve!: (state: ReturnType<typeof createSyncState>) => void;
  const combined = createWorkspaceSnapshot('local-edit');
  combined.nodesById.received = createWorkspaceSnapshot('received').nodesById.received!;
  combined.nodeOrder.push('received');
  syncPlatformMock.loadCompanionWorkspaceSyncState
    .mockReturnValueOnce(new Promise(done => { resolve = done; }))
    .mockResolvedValue(createSyncState({ workspace_snapshot: combined }));
  receiveChanges();
  expect(await tryForegroundAutoSync(view.args), JSON.stringify(view.args.setError.mock.calls)).toBe('completed');
  publishCompanionSyncMutationRevision();
  view.args.setState(current => ({ ...current, workspace_snapshot: createWorkspaceSnapshot('local-edit') }));
  resolve(createSyncState({ workspace_snapshot: createWorkspaceSnapshot('stale') }));
  await vi.waitFor(() => expect(view.current().workspace_snapshot?.nodesById.received).toBeDefined());
  expect(view.current().workspace_snapshot?.activeNodeId).toBe('local-edit');
  expect(syncPlatformMock.loadCompanionWorkspaceSyncState).toHaveBeenCalledTimes(2);
});

it('reports display failure without changing the committed data result', async () => {
  const view = createView();
  syncPlatformMock.loadCompanionWorkspaceSyncState.mockRejectedValue(new Error('snapshot_failed'));
  receiveChanges();
  expect(await tryForegroundAutoSync(view.args), JSON.stringify(view.args.setError.mock.calls)).toBe('completed');
  await vi.waitFor(() => expect(view.args.setError).toHaveBeenCalledWith('sync_display_unavailable'));
  expect(loadActiveCompanionSyncRun()).toBeNull();
});

async function tryForegroundAutoSync(args: TryForegroundAutoSyncArgs) {
  return (await import('./companionWorkspaceSyncFlow')).tryForegroundAutoSync(args);
}

it('clears the visible workspace when the last received node is deleted', async () => {
  const view = createView();
  syncPlatformMock.loadCompanionWorkspaceSyncState.mockResolvedValue(createSyncState());
  receiveChanges();
  expect(await tryForegroundAutoSync(view.args)).toBe('completed');
  await vi.waitFor(() => expect(view.current().workspace_snapshot).toBeNull());
  expect(view.args.setError.mock.calls.every(([error]) => error === null)).toBe(true);
});

it('retries when a local edit arrives after reading but before React publishes the snapshot', async () => {
  const { refreshCompanionSyncDisplay } = await import('./companionSyncDisplayRefresh');
  const view = createView();
  const updates: Array<Parameters<TryForegroundAutoSyncArgs['setState']>[0]> = [];
  const combined = createWorkspaceSnapshot('local-edit');
  combined.nodesById.received = createWorkspaceSnapshot('received').nodesById.received!;
  combined.nodeOrder.push('received');
  syncPlatformMock.loadCompanionWorkspaceSyncState
    .mockResolvedValueOnce(createSyncState({ workspace_snapshot: createWorkspaceSnapshot('stale') }))
    .mockResolvedValue(createSyncState({ workspace_snapshot: combined }));
  await refreshCompanionSyncDisplay({ ...view.args, setState: update => updates.push(update) });
  publishCompanionSyncMutationRevision();
  view.args.setState(current => ({ ...current, workspace_snapshot: createWorkspaceSnapshot('local-edit') }));
  view.args.setState(updates[0]!);
  expect(view.current().workspace_snapshot?.activeNodeId).toBe('local-edit');
  await vi.waitFor(() => expect(updates).toHaveLength(2));
  view.args.setState(updates[1]!);
  expect(view.current().workspace_snapshot?.nodesById.received).toBeDefined();
  expect(view.current().workspace_snapshot?.activeNodeId).toBe('local-edit');
});
