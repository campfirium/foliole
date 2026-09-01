import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  assertResourcesComplete: vi.fn(),
  downloadPack: vi.fn(),
  downloadResources: vi.fn(),
  getPeerCursor: vi.fn(),
  refreshAdvertisement: vi.fn(),
  reportCursor: vi.fn(),
  setPeerCursor: vi.fn()
}));

vi.mock('../../lib/core/database/syncState.js', () => ({
  getPeerCursor: runtime.getPeerCursor,
  setPeerCursor: runtime.setPeerCursor
}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ driver: { kind: 'test' } }),
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: vi.fn() }));
vi.mock('./companionMdnsAdvertisement.js', () => ({
  refreshCompanionMdnsAdvertisement: runtime.refreshAdvertisement
}));
vi.mock('./desktopSyncGroupCursorCommit.js', () => ({
  reportDesktopSyncGroupCursorCommitted: runtime.reportCursor
}));
vi.mock('./desktopSyncGroupHttp.js', () => ({
  createDesktopSyncGroupSignedHeaders: vi.fn()
}));
vi.mock('./desktopSyncGroupPackApply.js', () => ({
  downloadAndApplyDesktopSyncGroupPack: runtime.downloadPack
}));
vi.mock('./desktopSyncGroupPeerSingleFlight.js', () => ({
  runDesktopSyncGroupPeerSingleFlight: (_id: string, execute: () => unknown) => execute()
}));
vi.mock('./desktopSyncGroupResources.js', () => ({
  assertDesktopSyncGroupResourcesComplete: runtime.assertResourcesComplete,
  downloadDesktopSyncGroupResources: runtime.downloadResources
}));
vi.mock('./desktopSyncGroupRoutes.js', () => ({ loadDesktopSyncGroupRoutes: vi.fn() }));

import { continueDesktopSyncGroupSync } from './desktopSyncGroupTransport.js';

const peer = {
  endpoint_url: 'http://192.168.1.12:43121',
  group_id: 'group-1',
  local_device_id: 'desktop-a',
  peer_device_id: 'desktop-b',
  peer_device_name: 'Desktop B',
  peer_platform: 'windows'
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  runtime.getPeerCursor.mockReturnValue('3');
  runtime.downloadPack.mockResolvedValue(4);
  runtime.downloadResources.mockResolvedValue(undefined);
  runtime.reportCursor.mockResolvedValue(undefined);
});

it('does not re-advertise after consuming a peer change', async () => {
  await expect(continueDesktopSyncGroupSync(peer)).resolves.toEqual({ complete: true, cursor: 4 });

  expect(runtime.reportCursor).toHaveBeenCalledWith({
    cursor: 4,
    peerAuthorizationId: 'desktop-b'
  });
  expect(runtime.downloadResources).toHaveBeenCalledWith(peer);
  expect(runtime.refreshAdvertisement).not.toHaveBeenCalled();
});
