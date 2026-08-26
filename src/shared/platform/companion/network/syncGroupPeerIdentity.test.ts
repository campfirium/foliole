import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadDiscovery: vi.fn(),
  loadGroup: vi.fn()
}));

vi.mock('../sync/syncGroupStore', () => ({ loadCompanionSyncGroup: mocks.loadGroup }));
vi.mock('../../companionWorkspaceDiscovery', () => ({ discoverCompanionDesktop: mocks.loadDiscovery }));

import { resolveCompanionSyncPeerId } from './syncGroupPeerIdentity';

describe('syncGroupPeerIdentity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('binds grouped sync progress to the discovered target Device', async () => {
    mocks.loadGroup.mockResolvedValue({ group_id: 'group-1' });
    mocks.loadDiscovery.mockResolvedValue({
      discovery: { group_id: 'group-1', provider_device_id: 'device-c', provider_device_name: 'Desktop C' }
    });

    await expect(resolveCompanionSyncPeerId('http://device-c/')).resolves.toBe('device-c');
  });

  it('accepts another Device endpoint inside the same Sync Group', async () => {
    mocks.loadGroup.mockResolvedValue({ group_id: 'group-1' });
    mocks.loadDiscovery.mockResolvedValue({
      discovery: { group_id: 'group-1', provider_device_id: 'device-c', provider_device_name: 'Desktop C' }
    });

    await expect(resolveCompanionSyncPeerId('http://device-c/')).resolves.toBe('device-c');
  });

  it('rejects Device resolution outside a Sync Group', async () => {
    mocks.loadGroup.mockResolvedValue(null);

    await expect(resolveCompanionSyncPeerId('http://device-a/')).rejects.toThrow('sync_group_not_joined');
    expect(mocks.loadDiscovery).not.toHaveBeenCalled();
  });
});
