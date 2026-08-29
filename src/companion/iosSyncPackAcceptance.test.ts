// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  ensureGroup: vi.fn(),
  leaveGroup: vi.fn(),
  loadBootstrap: vi.fn(),
  postResult: vi.fn(),
  rerunRoundtrip: vi.fn(),
  runRoundtrip: vi.fn(),
  saveEndpoint: vi.fn(),
  sign: vi.fn()
}));

vi.mock('../shared/platform/companionBootstrap', () => ({ loadCompanionBootstrapState: mocks.loadBootstrap }));
vi.mock('../shared/platform/companion/network/signedRequest', () => ({ createSignedRequestHeaders: mocks.sign }));
vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({
  leaveCompanionSyncGroupDevice: mocks.leaveGroup
}));
vi.mock('../shared/platform/companionSyncPackApply', () => ({ applyCompanionDesktopSyncPack: mocks.apply }));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  saveCompanionWorkspaceSyncEndpoint: mocks.saveEndpoint
}));
vi.mock('./iosBridgeAcceptance', () => ({ postResult: mocks.postResult }));
vi.mock('./iosAcceptanceSyncGroup', () => ({
  ensureIosAcceptanceSyncGroup: mocks.ensureGroup
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
  mocks.loadBootstrap.mockResolvedValue({ database_path: '/app/foliole.db' });
  mocks.leaveGroup.mockResolvedValue(undefined);
  mocks.ensureGroup.mockResolvedValue({ endpointUrl: 'http://127.0.0.1:43123',
    group: { group_id: 'group-1' }, joined: true,
    peer: { sourceHostName: 'Acceptance Desktop', sourcePeerId: 'desktop-1' } });
  mocks.runRoundtrip.mockResolvedValue({ push: { pushedObjectIds: ['node:capture', 'node:restore'] } });
  mocks.rerunRoundtrip.mockResolvedValue({ push: { pushedObjectIds: [] } });
  mocks.sign.mockResolvedValue({ 'X-Signature': 'signed' });
});

it('joins and applies the identity-bound legal pack on the first launch', async () => {
  await runIosSyncPackAcceptance();

  expect(mocks.ensureGroup).toHaveBeenCalledWith('/app/foliole.db');
  expect(mocks.apply).toHaveBeenCalledWith({
    headers: { 'X-Signature': 'signed' },
    sourceHostName: 'Acceptance Desktop',
    sourcePeerId: 'desktop-1',
    url: 'http://127.0.0.1:43123/acceptance/sync-pack/legal'
  });
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({ phase: 'applied', status: 'passed' }));
});

it('reapplies through the shared path after rebuilding the acceptance Sync Group', async () => {
  localStorage.setItem('foliole-ios-sync-pack-acceptance-phase', 'reapply');

  await runIosSyncPackAcceptance();

  expect(mocks.loadBootstrap).toHaveBeenCalledOnce();
  expect(mocks.loadBootstrap.mock.invocationCallOrder[0] ?? Infinity)
    .toBeLessThan(mocks.rerunRoundtrip.mock.invocationCallOrder[0] ?? -Infinity);
  expect(mocks.ensureGroup).toHaveBeenCalledOnce();
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.rerunRoundtrip).toHaveBeenCalledOnce();
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({ phase: 'reapplied', status: 'passed' }));
});

it.each([
  ['wrong-target', 'sync_pack_target_mismatch'],
  ['cursor-gap', 'sync_pack_cursor_not_contiguous']
])('accepts only the deterministic %s rejection', async (phase, error) => {
  localStorage.setItem('foliole-ios-sync-pack-acceptance-phase', phase);
  mocks.apply.mockRejectedValue(new Error(error));

  await runIosSyncPackAcceptance();

  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({
    error, phase: 'rejected', rejection: phase, scenario: 'sync-pack-runtime', status: 'passed'
  }));
});

it('fails when a rejection category does not match the active phase', async () => {
  localStorage.setItem('foliole-ios-sync-pack-acceptance-phase', 'wrong-target');
  mocks.apply.mockRejectedValue(new Error('missing_sync_pack_entry'));

  await runIosSyncPackAcceptance();

  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({ phase: 'failed', status: 'failed' }));
});
