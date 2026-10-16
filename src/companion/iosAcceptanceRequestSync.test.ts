import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract';

const mocks = vi.hoisted(() => ({ ensure: vi.fn(), group: vi.fn(), exchange: vi.fn(), sync: vi.fn() }));
vi.mock('../shared/platform/companion/sync/syncGroupProviderDataOwner', () => ({
  ensureCompanionSyncGroupDataOwner: mocks.ensure
}));
vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({ loadCompanionSyncGroup: mocks.group }));
vi.mock('../shared/platform/companion/network/companionSyncGroupMemberState', () => ({
  exchangeCompanionSyncGroupMemberState: mocks.exchange
}));
vi.mock('../shared/platform/companionDesktopSyncObjects', () => ({ syncCompanionObjectsFromDesktop: mocks.sync }));

import { syncIosAcceptanceRequest } from './iosAcceptanceRequestSync';

const endpoint = 'http://fixture.local:9191';
const peer = { sourcePeerId: 'provider-device' };
const ready = { localExited: false, peerRemoved: false, normalSyncReady: true, peerLibraryEpoch: 'provider-epoch' };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.group.mockResolvedValue({ group_id: 'accepted-group' });
  mocks.exchange.mockResolvedValue(ready);
  mocks.sync.mockResolvedValue({ appliedNodeIds: ['node'] });
});

describe('iOS acceptance request sync', () => {
  it.each([false, true])('uses verified provider epoch and current protocol with resourcesOnly=%s', async resourcesOnly => {
    await expect(syncIosAcceptanceRequest(endpoint, peer, resourcesOnly)).resolves.toEqual({ appliedNodeIds: ['node'] });
    expect(mocks.ensure).toHaveBeenCalledOnce();
    expect(mocks.exchange).toHaveBeenCalledWith({ endpointUrl: endpoint, deviceId: peer.sourcePeerId, groupId: 'accepted-group' });
    expect(mocks.sync).toHaveBeenCalledWith(endpoint, { resourcesOnly, framedPeer: {
      deviceId: peer.sourcePeerId, libraryEpoch: 'provider-epoch', protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version
    } });
    expect(mocks.ensure.mock.invocationCallOrder[0]).toBeLessThan(mocks.exchange.mock.invocationCallOrder[0]!);
    expect(mocks.exchange.mock.invocationCallOrder[0]).toBeLessThan(mocks.sync.mock.invocationCallOrder[0]!);
  });
  it.each([
    { localExited: true }, { peerRemoved: true }, { normalSyncReady: false }, { peerLibraryEpoch: null }, { peerLibraryEpoch: '' }
  ])('rejects unavailable membership %j before syncing', async unavailable => {
    mocks.exchange.mockResolvedValue({ ...ready, ...unavailable });
    await expect(syncIosAcceptanceRequest(endpoint, peer)).rejects.toThrow('ios_acceptance_request_peer_unavailable');
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('rejects a missing local group', async () => {
    mocks.group.mockResolvedValue(null);
    await expect(syncIosAcceptanceRequest(endpoint, peer)).rejects.toThrow('sync_group_not_joined');
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('rejects a missing provider identity', async () => {
    await expect(syncIosAcceptanceRequest(endpoint, { sourcePeerId: '' })).rejects.toThrow('ios_acceptance_request_peer_missing');
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('propagates member-state failure without starting database or resource requests', async () => {
    mocks.exchange.mockRejectedValue(new Error('sync_group_member_state_failed_401'));
    await expect(syncIosAcceptanceRequest(endpoint, peer)).rejects.toThrow('sync_group_member_state_failed_401');
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
