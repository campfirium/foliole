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
    sent: [{ objectId: 'pushed' }]
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

it('rejects the retired out-of-band resource continuation', async () => {
  await expect(syncCompanionIdentityObjects('http://peer', {
    framedPeer: { deviceId: 'desktop', libraryEpoch: 'epoch', protocolVersion: 22 },
    resourcesOnly: true
  })).rejects.toThrow('framed_sync_resources_are_in_band');
  expect(runtime.framed).not.toHaveBeenCalled();
});
