import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadDiscovery: vi.fn(),
  loadGroup: vi.fn(),
  loadPairing: vi.fn()
}));

vi.mock('../sync/syncGroupStore', () => ({ loadCompanionSyncGroup: mocks.loadGroup }));
vi.mock('../../companionWorkspacePairing', () => ({
  loadCompanionDiscovery: mocks.loadDiscovery,
  loadCompanionPairingState: mocks.loadPairing
}));

import { resolveCompanionSyncPeerId } from './syncGroupPeerIdentity';

describe('syncGroupPeerIdentity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('binds grouped sync progress to the discovered target Device', async () => {
    mocks.loadGroup.mockResolvedValue({ group_id: 'group-1', timeline_id: 'timeline-1' });
    mocks.loadDiscovery.mockResolvedValue({
      group_id: 'group-1', peer_id: 'device-c', timeline_id: 'timeline-1'
    });

    await expect(resolveCompanionSyncPeerId('http://device-c/')).resolves.toBe('device-c');
  });

  it('accepts legacy timeline metadata changes inside the same workgroup', async () => {
    mocks.loadGroup.mockResolvedValue({ group_id: 'group-1', timeline_id: 'timeline-1' });
    mocks.loadDiscovery.mockResolvedValue({
      group_id: 'group-1', peer_id: 'device-c', timeline_id: 'timeline-2'
    });

    await expect(resolveCompanionSyncPeerId('http://device-c/')).resolves.toBe('device-c');
  });

  it('retains the original pairing identity outside a Sync Group', async () => {
    mocks.loadGroup.mockResolvedValue(null);
    mocks.loadPairing.mockResolvedValue({ remote_peer_id: 'device-a' });

    await expect(resolveCompanionSyncPeerId('http://device-a/')).resolves.toBe('device-a');
    expect(mocks.loadDiscovery).not.toHaveBeenCalled();
  });
});
