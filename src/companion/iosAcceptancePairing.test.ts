import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ load: vi.fn(), pair: vi.fn(), request: vi.fn() }));

vi.mock('../shared/platform/companionWorkspacePairing', () => ({
  loadCompanionPairingState: mocks.load,
  pairCompanionWithDesktop: mocks.pair,
  requestCompanionPairing: mocks.request
}));

import { loadIosAcceptanceSyncPeer, pairIosAcceptanceCompanion } from './iosAcceptancePairing';

it('carries discovery-owned desktop identity into the native pairing adapter', async () => {
  mocks.request.mockResolvedValue({ pair_request_id: 'pair-1' });

  await pairIosAcceptanceCompanion('http://127.0.0.1:43123', 'Acceptance iPhone');

  expect(mocks.request).toHaveBeenCalledWith({
    endpointUrl: 'http://127.0.0.1:43123',
    hostName: 'Acceptance iPhone',
    hostPlatform: 'ios-capacitor'
  });
  expect(mocks.pair).toHaveBeenCalledWith({
    endpointUrl: 'http://127.0.0.1:43123',
    hostName: 'Acceptance iPhone',
    hostPlatform: 'ios-capacitor',
    pairRequestId: 'pair-1',
    remotePeerName: 'Acceptance Desktop',
    remotePeerPlatform: 'darwin'
  });
});

it('returns the persisted remote peer identity required by direct pack apply', async () => {
  mocks.load.mockResolvedValue({
    remote_peer_id: ' desktop-authorization ', remote_peer_name: ' Acceptance Desktop '
  });

  await expect(loadIosAcceptanceSyncPeer()).resolves.toEqual({
    sourceHostName: 'Acceptance Desktop', sourcePeerId: 'desktop-authorization'
  });
});
