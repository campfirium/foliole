import { beforeEach, describe, expect, it } from 'vitest';

import {
  createActions,
  createSnapshot,
  createSyncResult,
  createSyncState,
  getSyncObjectsMock,
  getWorkspaceSyncMock,
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

    expect(workspaceSyncMock.loadCompanionReadableArticle).toHaveBeenCalledWith(syncedSnapshot);
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
      'http://192.168.0.11:38641', expect.any(Object)
    );
  });
});
