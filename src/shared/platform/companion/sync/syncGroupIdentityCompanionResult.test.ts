import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ database: vi.fn(), resources: vi.fn() }));
vi.mock('./framed/companionRequestSyncDatabaseRound.js', () => ({ runCompanionRequestSyncDatabaseRound: runtime.database }));
vi.mock('./framed/companionRequestSyncResources.js', () => ({ continueCompanionRequestSyncResources: runtime.resources }));
vi.mock('./framed/companionRequestSyncPeerState.js', () => ({ requireCompanionRequestSyncPeerState:
  (_group: string, device: string, epoch: string) => ({ sender_device_identity_key: device, library_epoch: epoch }) }));
vi.mock('./syncGroupMemberStateStore.js', () => ({ loadCompanionSyncGroupMemberState: async () => ({ library_epoch: 'local-epoch' }) }));
vi.mock('./syncGroupStore', () => ({ loadCompanionSyncGroup: async () => ({ group_id: 'group', local_device_identity_key: 'local' }) }));

import { syncCompanionIdentityObjects } from './syncGroupIdentityCompanionResult';

const framedPeer = { deviceId: 'desktop', libraryEpoch: 'desktop-epoch', protocolVersion: 24 };
beforeEach(() => {
  vi.clearAllMocks();
  runtime.database.mockResolvedValue({ pending: 1, received: ['pulled'], sent: ['pushed'] });
  runtime.resources.mockResolvedValue({ pending: 2, scanned: 4, transferred: 1, unavailable: 1 });
});

it('reports request-scoped database changes and keeps attachment progress separate', async () => {
  const refreshed = vi.fn();
  const result = await syncCompanionIdentityObjects('http://peer', { framedPeer, onStructureSynced: refreshed });
  expect(runtime.database).toHaveBeenCalledWith(expect.objectContaining({ endpointUrl: 'http://peer', groupId: 'group',
    localLibraryEpoch: 'local-epoch', peerState: { sender_device_identity_key: 'desktop', library_epoch: 'desktop-epoch' } }));
  expect(refreshed).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ appliedNodeIds: ['pulled'], pushedNodeIds: ['pushed'],
    localDirtyCount: 1, remainingStructureChangeCount: 1, remainingAttachmentResourceCount: 3 });
});

it('rejects missing negotiation and the incompatible previous protocol', async () => {
  await expect(syncCompanionIdentityObjects('http://peer', {})).rejects.toThrow('framed_sync_peer_required');
  await expect(syncCompanionIdentityObjects('http://peer', { framedPeer: { ...framedPeer, protocolVersion: 23 } }))
    .rejects.toThrow('framed_sync_peer_required');
  expect(runtime.database).not.toHaveBeenCalled();
});

it('finishes an authenticated restore before a resource-only continuation', async () => {
  await syncCompanionIdentityObjects('http://peer', { framedPeer, restoreId: 'restore-1', resourcesOnly: true });
  expect(runtime.database).toHaveBeenCalledWith(expect.objectContaining({ restoreId: 'restore-1' }));
  expect(runtime.resources).toHaveBeenCalledOnce();
});

it('continues attachments without replaying database changes', async () => {
  const result = await syncCompanionIdentityObjects('http://peer', { framedPeer, resourcesOnly: true });
  expect(runtime.database).not.toHaveBeenCalled();
  expect(runtime.resources).toHaveBeenCalledOnce();
  expect(result.appliedObjectIds).toEqual([]);
  expect(result.pushedObjectIds).toEqual([]);
  expect(result.remainingAttachmentResourceCount).toBe(3);
});
