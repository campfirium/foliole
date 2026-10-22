import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  exchangeMemberState: vi.fn(), framedRound: vi.fn(),
  pendingConflicts: vi.fn()
}));
vi.mock('../database/connection.js', () => ({
  registerDatabaseConnectionCleanup: vi.fn(),
  openDatabaseConnection: () => ({ driver: {} }),
  runWithDatabaseConnectionOwner: async (task: () => unknown) => task()
}));
vi.mock('../database/betterSqliteDbPort.js', () => ({ createBetterSqliteDbPort: () => ({}) }));
vi.mock('../../lib/core/sync/syncGroupLocalAdoption.js', () => ({ loadSyncGroupLocalAdoption: async () => null }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: vi.fn() }));
vi.mock('../database/watchedFolderConflictDecisions.js', () => ({
  loadPendingWatchedFolderConflicts: runtime.pendingConflicts
}));
vi.mock('./desktopRequestSyncDatabaseRound.js', () => ({
  runDesktopRequestSyncDatabaseRound: runtime.framedRound
}));
vi.mock('./desktopRequestSyncResources.js', () => ({
  continueDesktopRequestSyncResources: vi.fn(async () => ({ pending: 0 }))
}));
vi.mock('./desktopSyncActivityStore.js', () => ({ recordDesktopSyncActivity: vi.fn() }));
vi.mock('./desktopSyncHistoryCollection.js', () => ({ collectDesktopSyncHistory: vi.fn(), recordDesktopCompletedSyncRound: vi.fn() }));
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
vi.mock('./workgroupKeyStore.js', () => ({ loadDesktopWorkgroupKey: () => ({ group_key: Buffer.alloc(32, 7).toString('base64url') }) }));
vi.mock('./desktopRequestSyncExchange.js', () => ({ createDesktopRequestSyncExchange: () => ({}) }));
vi.mock('../../lib/core/sync/requestSyncPeerRound.js', () => ({
  withRequestSyncPeerRound: async (_exchange: unknown, _round: unknown, run: () => Promise<unknown>) => run()
}));

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

it('routes a normal compatible peer through the request database round', async () => {
  await expect(continueDesktopSyncGroupSync(peer)).resolves.toMatchObject({ complete: true });
  expect(runtime.framedRound).toHaveBeenCalledWith(expect.objectContaining({
    localLibraryEpoch: 'epoch-a', peer, peerState: undefined, remoteLibraryEpoch: 'epoch-b'
  }));
  expect(runtime.exchangeMemberState).toHaveBeenCalledTimes(2);
});

it('does not start the request round while a watched conflict is pending', async () => {
  runtime.pendingConflicts.mockReturnValue([{ conflict_key: 'same-path' }]);
  await expect(continueDesktopSyncGroupSync(peer)).resolves.toEqual({ complete: false });
  expect(runtime.framedRound).not.toHaveBeenCalled();
});

it('rechecks restore readiness and still uses the request database round', async () => {
  runtime.exchangeMemberState.mockResolvedValueOnce({
    localExited: false, localLibraryEpoch: 'epoch-a', normalSyncReady: false,
    peerBlocked: false, remoteLibraryEpoch: 'epoch-b', restoreFromPeer: 'restore'
  }).mockResolvedValueOnce({ normalSyncReady: true });
  await expect(continueDesktopSyncGroupSync(peer)).resolves.toMatchObject({ complete: true });
  expect(runtime.exchangeMemberState).toHaveBeenCalledTimes(3);
  expect(runtime.framedRound).toHaveBeenCalledOnce();
});
