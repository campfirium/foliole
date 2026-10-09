import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ framed: vi.fn() }));

vi.mock('./framed/companionFramedSyncInventoryRound', () => ({
  sendCompanionFramedSyncInventoryDifferences: runtime.framed
}));
vi.mock('./syncGroupStore', () => ({
  loadCompanionSyncGroup: async () => ({ group_id: 'group' })
}));

import { syncCompanionIdentityObjects } from './syncGroupIdentityCompanionResult';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.framed.mockResolvedValue({
    deferredObjects: [{ globalId: 'later', objectType: 'node' }],
    received: [{ objectId: 'pulled' }],
    sent: [{ objectId: 'pushed' }],
    resources: { pending: 2, scanned: 4, transferred: 1, unavailable: 1 }
  });
});

it('routes a negotiated v22 peer through the only companion data plane', async () => {
  const refreshed = vi.fn();
  const result = await syncCompanionIdentityObjects('http://peer', {
    framedPeer: { deviceId: 'desktop', libraryEpoch: 'desktop-epoch', protocolVersion: 22 },
    onStructureSynced: refreshed
  });
  expect(runtime.framed).toHaveBeenCalledWith({
    endpoint_url: 'http://peer', receiver_device_id: 'desktop',
    receiver_library_epoch: 'desktop-epoch', sync_group_id: 'group'
  });
  expect(refreshed).toHaveBeenCalledOnce();
  expect(result).toMatchObject({
    appliedNodeIds: ['pulled'], pushedNodeIds: ['pushed'],
    localDirtyCount: 1, remainingStructureChangeCount: 1
  });
});

it('rejects a peer without an exact framed v22 negotiation', async () => {
  await expect(syncCompanionIdentityObjects('http://peer', {}))
    .rejects.toThrow('framed_sync_peer_required');
  await expect(syncCompanionIdentityObjects('http://peer', {
    framedPeer: { deviceId: 'desktop', libraryEpoch: 'epoch', protocolVersion: 21 }
  })).rejects.toThrow('framed_sync_peer_required');
  expect(runtime.framed).not.toHaveBeenCalled();
});

it('keeps an authenticated restore request ahead of a resource-only continuation', async () => {
  await syncCompanionIdentityObjects('http://peer', {
    framedPeer: { deviceId: 'desktop', libraryEpoch: 'epoch', protocolVersion: 22 },
    restoreId: 'restore-1', resourcesOnly: true
  });
  expect(runtime.framed).toHaveBeenCalledWith({ endpoint_url: 'http://peer', receiver_device_id: 'desktop',
    receiver_library_epoch: 'epoch', sync_group_id: 'group' }, true, 'restore-1');
});

it('continues attachment demands through framed transport without replaying database changes', async () => {
  runtime.framed.mockResolvedValueOnce({ deferredObjects: [], received: [], sent: [],
    resources: { pending: 1, scanned: 4, transferred: 1, unavailable: 0 } });
  const result = await syncCompanionIdentityObjects('http://peer', {
    framedPeer: { deviceId: 'desktop', libraryEpoch: 'epoch', protocolVersion: 22 }, resourcesOnly: true
  });
  expect(runtime.framed).toHaveBeenCalledWith({ endpoint_url: 'http://peer', receiver_device_id: 'desktop',
    receiver_library_epoch: 'epoch', sync_group_id: 'group' }, true);
  expect(result.appliedObjectIds).toEqual([]);
  expect(result.pushedObjectIds).toEqual([]);
  expect(result.remainingAttachmentResourceCount).toBe(1);
});
