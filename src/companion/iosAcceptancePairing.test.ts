import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pair: vi.fn(), request: vi.fn() }));

vi.mock('../shared/platform/companionWorkspacePairing', () => ({
  pairCompanionWithDesktop: mocks.pair,
  requestCompanionPairing: mocks.request
}));

import { pairIosAcceptanceCompanion } from './iosAcceptancePairing';

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
