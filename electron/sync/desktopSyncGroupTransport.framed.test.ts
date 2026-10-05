import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  exchangeMemberState: vi.fn(), framedRound: vi.fn(),
  pendingConflicts: vi.fn(), reconcileBodies: vi.fn()
}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ driver: {} }),
  runWithDatabaseConnectionOwner: async (task: () => unknown) => task()
}));
vi.mock('../database/syncBodyProjectionReconcile.js', () => ({
  reconcileVersionedInlineBodies: runtime.reconcileBodies
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: vi.fn() }));
vi.mock('../database/watchedFolderConflictDecisions.js', () => ({
  loadPendingWatchedFolderConflicts: runtime.pendingConflicts
}));
vi.mock('./desktopFramedSyncInventoryRound.js', () => ({
  runDesktopFramedSyncInventoryRound: runtime.framedRound
}));
vi.mock('./desktopSyncActivityStore.js', () => ({ recordDesktopSyncActivity: vi.fn() }));
vi.mock('./desktopSyncGroupMemberState.js', () => ({
  exchangeDesktopSyncGroupMemberState: runtime.exchangeMemberState
}));
vi.mock('./desktopSyncGroupPeerCompatibility.js', () => ({
  assertDesktopSyncGroupPeerCompatible: vi.fn()
}));
vi.mock('./desktopSyncGroupPeerSingleFlight.js', () => ({
  runDesktopSyncGroupPeerSingleFlight: (_id: string, task: () => unknown) => task()
}));
vi.mock('./desktopSyncGroupRoutes.js', () => ({ loadDesktopSyncGroupRoutes: vi.fn() }));

import { continueDesktopSyncGroupSync } from './desktopSyncGroupTransport.js';

const peer = {
  endpoint_url: 'http://peer', group_id: 'group', local_device_id: 'device-a',
  peer_device_id: 'device-b', peer_device_name: 'Device B', peer_platform: 'desktop'
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  runtime.pendingConflicts.mockReturnValue([]);
  runtime.exchangeMemberState.mockResolvedValue({
    localExited: false, localLibraryEpoch: 'epoch-a', normalSyncReady: true,
    peerBlocked: false, remoteLibraryEpoch: 'epoch-b', restoreFromPeer: null
  });
  runtime.framedRound.mockResolvedValue({ complete: true, pending: 0, transferred: 1 });
});

it('routes a normal compatible peer through the framed inventory round', async () => {
  await expect(continueDesktopSyncGroupSync(peer)).resolves.toEqual({ complete: true });
  expect(runtime.framedRound).toHaveBeenCalledWith({
    localLibraryEpoch: 'epoch-a', peer, remoteLibraryEpoch: 'epoch-b'
  });
  expect(runtime.reconcileBodies).toHaveBeenCalledOnce();
});

it('does not start the framed round while a watched conflict is pending', async () => {
  runtime.pendingConflicts.mockReturnValue([{ conflict_key: 'same-path' }]);
  await expect(continueDesktopSyncGroupSync(peer)).resolves.toEqual({ complete: false });
  expect(runtime.framedRound).not.toHaveBeenCalled();
});

it('rechecks restore readiness and still uses the framed inventory round', async () => {
  runtime.exchangeMemberState.mockResolvedValueOnce({
    localExited: false, localLibraryEpoch: 'epoch-a', normalSyncReady: false,
    peerBlocked: false, remoteLibraryEpoch: 'epoch-b', restoreFromPeer: 'restore'
  }).mockResolvedValueOnce({ normalSyncReady: true });
  await expect(continueDesktopSyncGroupSync(peer)).resolves.toEqual({ complete: true });
  expect(runtime.exchangeMemberState).toHaveBeenCalledTimes(2);
  expect(runtime.framedRound).toHaveBeenCalledOnce();
});
