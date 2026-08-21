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
  rerunRoundtrip: vi.fn(),
  runRoundtrip: vi.fn(),
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
vi.mock('./iosNodeVersionRoundtripAcceptance', () => ({
  rerunIosNodeVersionRoundtripAcceptance: mocks.rerunRoundtrip,
  runIosNodeVersionRoundtripAcceptance: mocks.runRoundtrip
}));

import { runIosSyncPackAcceptance } from './iosSyncPackAcceptance';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.apply.mockResolvedValue({ applied_blob_count: 0, applied_object_count: 1, to_state_seq: 2 });
  mocks.loadBootstrap.mockResolvedValue({ device_id: 'ios-1', host_name: 'Acceptance iPhone' });
  mocks.requestPairing.mockResolvedValue({ pair_request_id: 'pair-1' });
  mocks.loadPairing.mockResolvedValue({ remote_peer_id: 'desktop-1' });
  mocks.runRoundtrip.mockResolvedValue({ push: { pushedObjectIds: ['node:capture', 'node:restore'] } });
  mocks.rerunRoundtrip.mockResolvedValue({ push: { pushedObjectIds: [] } });
  mocks.sign.mockResolvedValue({ 'X-Signature': 'signed' });
});

it('pairs and applies the identity-bound legal pack on the first launch', async () => {
  mocks.loadPairing.mockResolvedValue({ is_paired: false, remote_peer_id: 'desktop-1' });

  await runIosSyncPackAcceptance();

  expect(mocks.requestPairing).toHaveBeenCalledWith(expect.objectContaining({
    hostName: 'Acceptance iPhone',
    hostPlatform: 'ios-capacitor'
  }));
  expect(mocks.apply).toHaveBeenCalledWith({
    headers: { 'X-Signature': 'signed' },
    sourcePeerId: 'desktop-1',
    url: 'http://127.0.0.1:43123/acceptance/sync-pack/legal'
  });
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({ phase: 'applied', status: 'passed' }));
});

it('reapplies through the shared path without repairing an existing pairing', async () => {
  mocks.loadPairing.mockResolvedValue({ device_id: 'ios-1', is_paired: true, remote_peer_id: 'desktop-1' });
  localStorage.setItem('foliole-ios-sync-pack-acceptance-phase', 'reapply');

  await runIosSyncPackAcceptance();

  expect(mocks.loadBootstrap).toHaveBeenCalledOnce();
  expect(mocks.loadBootstrap.mock.invocationCallOrder[0] ?? Infinity)
    .toBeLessThan(mocks.rerunRoundtrip.mock.invocationCallOrder[0] ?? -Infinity);
  expect(mocks.requestPairing).not.toHaveBeenCalled();
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.rerunRoundtrip).toHaveBeenCalledOnce();
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({ phase: 'reapplied', status: 'passed' }));
});

it.each([
  ['corrupt-envelope', 'missing_sync_pack_entry'],
  ['wrong-target', 'sync_pack_target_mismatch'],
  ['cursor-gap', 'sync_pack_cursor_not_contiguous'],
  ['legacy-format', 'unsupported_sync_pack_format_version'],
  ['illegal-dag', 'sync_pack_node_version_missing_parent']
])('accepts only the deterministic %s rejection', async (phase, error) => {
  mocks.loadPairing.mockResolvedValue({ device_id: 'ios-1', is_paired: true, remote_peer_id: 'desktop-1' });
  localStorage.setItem('foliole-ios-sync-pack-acceptance-phase', phase);
  mocks.apply.mockRejectedValue(new Error(error));

  await runIosSyncPackAcceptance();

  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({
    error, phase: 'rejected', rejection: phase, scenario: 'sync-pack-runtime', status: 'passed'
  }));
});

it('fails when a rejection category does not match the active phase', async () => {
  mocks.loadPairing.mockResolvedValue({ device_id: 'ios-1', is_paired: true, remote_peer_id: 'desktop-1' });
  localStorage.setItem('foliole-ios-sync-pack-acceptance-phase', 'wrong-target');
  mocks.apply.mockRejectedValue(new Error('missing_sync_pack_entry'));

  await runIosSyncPackAcceptance();

  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({ phase: 'failed', status: 'failed' }));
});
