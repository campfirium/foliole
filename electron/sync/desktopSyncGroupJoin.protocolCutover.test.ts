import { beforeEach, expect, it, vi } from 'vitest';

const syncState = vi.hoisted(() => ({ getPeerCursor: vi.fn(), setPeerCursor: vi.fn() }));
const syncGroupStore = vi.hoisted(() => ({ loadDesktopSyncGroup: vi.fn() }));
const packApply = vi.hoisted(() => ({ downloadAndApplyDesktopSyncGroupPack: vi.fn() }));
const cursorCommit = vi.hoisted(() => ({ reportDesktopSyncGroupCursorCommitted: vi.fn() }));
const resources = vi.hoisted(() => ({
  assertDesktopSyncGroupResourcesComplete: vi.fn(),
  downloadDesktopSyncGroupResources: vi.fn()
}));

vi.mock('../../lib/core/database/syncState.js', () => syncState);
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => ({ driver: {} }) }));
vi.mock('../database/syncGroupStore.js', () => ({
  joinDesktopSyncGroup: vi.fn(),
  loadDesktopSyncGroup: syncGroupStore.loadDesktopSyncGroup
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: () => true
}));
vi.mock('./desktopSyncGroupPackApply.js', () => packApply);
vi.mock('./desktopSyncGroupCursorCommit.js', () => cursorCommit);
vi.mock('./desktopSyncGroupResources.js', () => resources);
vi.mock('./desktopSyncGroupPeerSingleFlight.js', () => ({
  runDesktopSyncGroupPeerSingleFlight: (_id: string, work: () => Promise<unknown>) => work()
}));
vi.mock('./companionMdnsAdvertisement.js', () => ({ refreshCompanionMdnsAdvertisement: vi.fn() }));

import { continueDesktopSyncGroupSync } from './desktopSyncGroupJoin.js';

const peer = {
  endpoint_url: 'http://a5:38641',
  group_id: 'group-1',
  local_authorization_id: 'mac-auth',
  local_host_name: 'Mac',
  peer_authorization_id: 'a5-auth',
  peer_host_name: 'A5',
  peer_host_platform: 'android',
  timeline_id: 'timeline-1'
};

beforeEach(() => {
  vi.clearAllMocks();
  syncGroupStore.loadDesktopSyncGroup.mockReturnValue({ group_id: 'group-1' });
  syncState.getPeerCursor.mockReturnValue('7');
  resources.downloadDesktopSyncGroupResources.mockResolvedValue(undefined);
});

it('does not commit a cursor or receipt when a legacy pack is rejected', async () => {
  packApply.downloadAndApplyDesktopSyncGroupPack
    .mockRejectedValue(new Error('invalid_sync_pack_manifest'));

  await expect(continueDesktopSyncGroupSync(peer))
    .rejects.toThrow('sync_group_sync_pack_failed: invalid_sync_pack_manifest');
  expect(syncState.setPeerCursor).not.toHaveBeenCalled();
  expect(cursorCommit.reportDesktopSyncGroupCursorCommitted).not.toHaveBeenCalled();
});

it('retries from the unchanged cursor and commits only after a current pack applies', async () => {
  packApply.downloadAndApplyDesktopSyncGroupPack.mockResolvedValue(11);

  await expect(continueDesktopSyncGroupSync(peer)).resolves.toMatchObject({ cursor: 11 });
  expect(packApply.downloadAndApplyDesktopSyncGroupPack).toHaveBeenCalledWith(
    expect.objectContaining({ after: 7, peer })
  );
  expect(syncState.setPeerCursor).toHaveBeenCalledWith(
    {}, 'a5-auth', 'state', '11', expect.any(String)
  );
  expect(cursorCommit.reportDesktopSyncGroupCursorCommitted).toHaveBeenCalledWith({
    cursor: 11,
    peerAuthorizationId: 'a5-auth'
  });
});
