// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  clearPairing: vi.fn(),
  loadBootstrap: vi.fn(),
  loadPairing: vi.fn(),
  pair: vi.fn(),
  postResult: vi.fn(),
  requestPairing: vi.fn(),
  saveEndpoint: vi.fn(),
  sign: vi.fn()
}));

vi.mock('../shared/platform/companionBootstrap', () => ({ loadCompanionBootstrapState: mocks.loadBootstrap }));
vi.mock('../shared/platform/companionSyncPackApply', () => ({ applyCompanionDesktopSyncPack: mocks.apply }));
vi.mock('../shared/platform/companionWorkspacePairing', () => ({
  clearCompanionPairingCredentials: mocks.clearPairing,
  createSignedRequestHeaders: mocks.sign,
  loadCompanionPairingState: mocks.loadPairing,
  pairCompanionWithDesktop: mocks.pair,
  requestCompanionPairing: mocks.requestPairing
}));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  saveCompanionWorkspaceSyncEndpoint: mocks.saveEndpoint
}));
vi.mock('./iosBridgeAcceptance', () => ({
  acceptanceEndpoint: () => 'http://127.0.0.1:43123',
  postResult: mocks.postResult
}));

import { runIosSyncPackAcceptance } from './iosSyncPackAcceptance';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apply.mockResolvedValue({ applied_blob_count: 0, applied_object_count: 1, to_state_seq: 2 });
  mocks.loadBootstrap.mockResolvedValue({ device_id: 'ios-1', device_name: 'Acceptance iPhone' });
  mocks.requestPairing.mockResolvedValue({ pair_request_id: 'pair-1' });
  mocks.sign.mockResolvedValue({ 'X-Signature': 'signed' });
});

it('pairs and applies the identity-bound legal pack on the first launch', async () => {
  mocks.loadPairing.mockResolvedValue({ is_paired: false });

  await runIosSyncPackAcceptance();

  expect(mocks.requestPairing).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'ios-1' }));
  expect(mocks.apply).toHaveBeenCalledWith({
    headers: { 'X-Signature': 'signed' },
    url: 'http://127.0.0.1:43123/acceptance/sync-pack/legal'
  });
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({ phase: 'applied', status: 'passed' }));
});

it('reapplies through the shared path without repairing an existing pairing', async () => {
  mocks.loadPairing.mockResolvedValue({ device_id: 'ios-1', is_paired: true });

  await runIosSyncPackAcceptance();

  expect(mocks.requestPairing).not.toHaveBeenCalled();
  expect(mocks.apply).toHaveBeenCalledOnce();
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({ phase: 'reapplied', status: 'passed' }));
});

it('posts a structured apply rejection', async () => {
  mocks.loadPairing.mockResolvedValue({ device_id: 'ios-1', is_paired: true });
  mocks.apply.mockRejectedValue(new Error('cursor gap'));

  await runIosSyncPackAcceptance();

  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({
    error: 'cursor gap', phase: 'failed', scenario: 'sync-pack-runtime', status: 'failed'
  }));
});
