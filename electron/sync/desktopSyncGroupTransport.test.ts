import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  assertCompatible: vi.fn(),
  assertResourcesComplete: vi.fn(),
  downloadPack: vi.fn(),
  downloadResources: vi.fn(),
  exchangeMemberState: vi.fn(),
  getPeerCursor: vi.fn(),
  reconcileBodies: vi.fn(),
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
vi.mock('../database/syncBodyProjectionReconcile.js', () => ({
  reconcileVersionedInlineBodies: runtime.reconcileBodies
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
vi.mock('./desktopSyncGroupMemberState.js', () => ({
  exchangeDesktopSyncGroupMemberState: runtime.exchangeMemberState
}));
vi.mock('./desktopSyncGroupPeerCompatibility.js', () => ({
  assertDesktopSyncGroupPeerCompatible: runtime.assertCompatible
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
  runtime.downloadPack.mockResolvedValue({ cursor: 4, participatingArticleIds: ['article'] });
  runtime.downloadResources.mockResolvedValue(undefined);
  runtime.reportCursor.mockResolvedValue(undefined);
  runtime.assertCompatible.mockResolvedValue(undefined);
  runtime.exchangeMemberState.mockResolvedValue({ localExited: false, peerBlocked: false });
  runtime.reconcileBodies.mockReturnValue(0);
});

it('stops before content when member state marks the peer removed', async () => {
  runtime.exchangeMemberState.mockResolvedValueOnce({ localExited: false, peerBlocked: true });

  await expect(continueDesktopSyncGroupSync(peer)).resolves.toEqual({ complete: false, cursor: 0 });
  expect(runtime.downloadPack).not.toHaveBeenCalled();
  expect(runtime.downloadResources).not.toHaveBeenCalled();
});

it('does not fetch or advance a cursor for an incompatible peer', async () => {
  runtime.assertCompatible.mockRejectedValueOnce(new Error('sync_group_peer_incompatible'));

  await expect(continueDesktopSyncGroupSync(peer)).rejects.toThrow('sync_group_peer_incompatible');
  expect(runtime.downloadPack).not.toHaveBeenCalled();
  expect(runtime.setPeerCursor).not.toHaveBeenCalled();
  expect(runtime.reportCursor).not.toHaveBeenCalled();
});

it('does not re-advertise after consuming a peer change', async () => {
  await expect(continueDesktopSyncGroupSync(peer)).resolves.toEqual({ complete: true, cursor: 4 });

  expect(runtime.reportCursor).toHaveBeenCalledWith({
    cursor: 4,
    peerAuthorizationId: 'desktop-b'
  });
  expect(runtime.downloadResources).toHaveBeenCalledWith(peer, ['article']);
  expect(runtime.refreshAdvertisement).not.toHaveBeenCalled();
});

it('reconciles already-versioned bodies before committing an automatic receive cursor', async () => {
  const sequence: string[] = [];
  runtime.reconcileBodies.mockImplementation(() => { sequence.push('body'); return 439; });
  runtime.setPeerCursor.mockImplementation(() => { sequence.push('cursor'); });

  await expect(continueDesktopSyncGroupSync(peer)).resolves.toEqual({ complete: true, cursor: 4 });
  expect(sequence).toEqual(['body', 'cursor']);
});

it('does not commit a receive cursor when body reconciliation fails', async () => {
  runtime.reconcileBodies.mockImplementation(() => { throw new Error('sync_body_projection_changed'); });

  await expect(continueDesktopSyncGroupSync(peer)).rejects.toThrow('sync_body_projection_changed');
  expect(runtime.setPeerCursor).not.toHaveBeenCalled();
});
