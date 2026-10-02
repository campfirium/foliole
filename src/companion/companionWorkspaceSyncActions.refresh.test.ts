import { beforeEach, describe, expect, it } from 'vitest';

import {
  createActions,
  createSnapshot,
  createSyncResult,
  createSyncState,
  getSyncObjectsMock,
  getWorkspaceSyncMock,
  getWorkspaceRepositoryMock,
  resetSyncActionMocks,
} from './companionWorkspaceSyncActions.testSupport';

const syncObjectsMock = getSyncObjectsMock();
const workspaceSyncMock = getWorkspaceSyncMock();

describe('companion workspace manual sync refresh', () => {
  beforeEach(resetSyncActionMocks);

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

    await expect(actions.pullFromDesktop('http://10.0.2.2:38641')).resolves.toEqual(createSyncState({
      workspace_snapshot: syncedSnapshot
    }));

    expect(workspaceSyncMock.loadCompanionReadableArticle).not.toHaveBeenCalled();
    expect(callbacks.setState).toHaveBeenLastCalledWith(expect.objectContaining({
      workspace_snapshot: syncedSnapshot
    }));
  });

  it('persists the endpoint used for manual sync before pulling desktop data', async () => {
    const { actions, callbacks } = createActions();
    workspaceSyncMock.saveCompanionWorkspaceSyncEndpoint.mockResolvedValueOnce(createSyncState({
      endpoint_url: 'http://10.0.2.2:38641', workspace_snapshot: null
    }));
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValueOnce(createSyncResult());

    await expect(actions.pullFromDesktop('http://10.0.2.2:38641')).resolves.toEqual(createSyncState());

    expect(workspaceSyncMock.saveCompanionWorkspaceSyncEndpoint).toHaveBeenCalledWith('http://10.0.2.2:38641');
    expect(callbacks.setState).toHaveBeenCalledWith(expect.objectContaining({
      endpoint_url: 'http://10.0.2.2:38641', workspace_snapshot: createSnapshot()
    }));
  });

  it('repairs a stale emulator endpoint before manual sync on a real device', async () => {
    const { actions } = createActions();
    workspaceSyncMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockResolvedValueOnce([{
      deviceId: 'device-maci', endpointUrl: 'http://192.168.0.11:38641',
      groupId: 'group-1', deviceName: 'Maci'
    }]);
    workspaceSyncMock.saveCompanionWorkspaceSyncEndpoint.mockResolvedValueOnce(createSyncState({
      endpoint_url: 'http://192.168.0.11:38641',
      remembered_targets: ['http://192.168.0.11:38641', 'http://10.0.2.2:38641']
    }));
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValueOnce(createSyncResult());

    await expect(actions.pullFromDesktop('http://10.0.2.2:38641')).resolves.toEqual(createSyncState());

    expect(workspaceSyncMock.saveCompanionWorkspaceSyncEndpoint).toHaveBeenCalledWith('http://192.168.0.11:38641');
    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledWith(
      'http://192.168.0.11:38641', expect.any(Object)
    );
  });
});

it('refreshes saved workspace projections without reading a default article', async () => {
  resetSyncActionMocks();
  const { actions, callbacks } = createActions();
  const snapshot = createSnapshot('changed-topic');
  const state = createSyncState({ workspace_snapshot: snapshot });
  workspaceSyncMock.loadCompanionWorkspaceSyncState.mockResolvedValue(state);
  getWorkspaceRepositoryMock().refreshCompanionWorkspaceAfterMutation.mockResolvedValue(snapshot);

  await expect(actions.refreshFromDevice()).resolves.toEqual(state);
  await expect(actions.refreshAfterMutation(snapshot)).resolves.toEqual(snapshot);

  const update = callbacks.setState.mock.lastCall?.[0];
  expect(update(createSyncState())).toEqual(state);
  expect(workspaceSyncMock.loadCompanionReadableArticle).not.toHaveBeenCalled();
});


it('merges a delayed local refresh into the latest connection state', async () => {
  resetSyncActionMocks();
  const { actions, callbacks } = createActions();
  const snapshot = createSnapshot('saved-topic');
  let resolveRead!: (value: typeof snapshot) => void;
  getWorkspaceRepositoryMock().refreshCompanionWorkspaceAfterMutation.mockReturnValue(
    new Promise((resolve) => { resolveRead = resolve; })
  );
  const refresh = actions.refreshAfterMutation();
  const latest = createSyncState({ endpoint_url: 'http://new-device:38641', last_synced_at: '2026-10-03T00:00:00Z' });
  resolveRead(snapshot);
  await refresh;
  expect(callbacks.setState.mock.lastCall?.[0](latest)).toEqual({ ...latest, workspace_snapshot: snapshot });
  expect(callbacks.setSyncConflictCount).toHaveBeenCalledWith(0);
});

it('does not invent a saved projection when the repository read fails', async () => {
  resetSyncActionMocks();
  const { actions, callbacks } = createActions();
  getWorkspaceRepositoryMock().refreshCompanionWorkspaceAfterMutation.mockRejectedValue(new Error('read failed'));
  await expect(actions.refreshAfterMutation()).rejects.toThrow('read failed');
  expect(callbacks.setState).not.toHaveBeenCalled();
});
