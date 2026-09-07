import { expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

import { assertDesktopSyncGroupPeerCompatible } from './desktopSyncGroupPeerCompatibility.js';

const peer = {
  endpoint_url: 'http://peer.local', group_id: 'group-1', local_device_id: 'local-1',
  peer_device_id: 'peer-1', peer_device_name: 'Peer', peer_platform: 'darwin'
};

function response(protocol: unknown = CURRENT_SYNC_PROTOCOL_DESCRIPTOR) {
  return {
    json: vi.fn(async () => ({ group_id: 'group-1', protocol, provider_device_id: 'peer-1' })),
    ok: true,
    status: 200
  } as unknown as Response;
}

it('accepts a peer only when its complete descriptor and identity match', async () => {
  const request = vi.fn(async () => response());
  await expect(assertDesktopSyncGroupPeerCompatible(peer, request as typeof fetch)).resolves.toBeUndefined();
  expect(request).toHaveBeenCalledWith('http://peer.local/companion/discovery', {
    signal: expect.any(AbortSignal)
  });
});

it('rejects a v4 peer missing the complete member capability', async () => {
  const protocol = {
    ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities
      .filter((capability) => capability !== 'complete-member-data-plane')
  };
  await expect(assertDesktopSyncGroupPeerCompatible(
    peer, vi.fn(async () => response(protocol)) as typeof fetch
  )).rejects.toThrow('sync_group_peer_incompatible:required_capability_missing');
});
