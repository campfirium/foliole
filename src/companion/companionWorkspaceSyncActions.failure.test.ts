import { beforeEach, describe, expect, it } from 'vitest';

import {
  createActions,
  createSyncResult,
  createSyncState,
  getSyncObjectsMock,
  getWorkspaceSyncMock,
  resetSyncActionMocks,
} from './companionWorkspaceSyncActions.testSupport';

const syncObjectsMock = getSyncObjectsMock();
const workspaceSyncMock = getWorkspaceSyncMock();

describe('companion workspace manual sync failures', () => {
  beforeEach(resetSyncActionMocks);

  it('records the real structure apply cause and leaves the manual sync idle', async () => {
    const { actions, callbacks } = createActions();
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValueOnce(new Error(
      'Failed to apply companion desktop sync pack. FOREIGN KEY constraint failed while inserting node_reading.'
    ));

    await expect(actions.pullFromDesktop('http://10.0.2.2:38641')).rejects.toThrow('FOREIGN KEY constraint failed');

    expect(workspaceSyncMock.recordCompanionWorkspaceSyncEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      message: 'Topic list sync failed: FOREIGN KEY constraint failed while inserting node_reading.',
      status: 'failed', triggerReason: 'manual'
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
  });
});
