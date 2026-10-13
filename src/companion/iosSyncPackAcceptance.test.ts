// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  advancePhase: vi.fn(),
  ensureGroup: vi.fn(),
  loadPhase: vi.fn(),
  loadBootstrap: vi.fn(),
  postResult: vi.fn(),
  rerunRoundtrip: vi.fn(),
  runRoundtrip: vi.fn(),
  saveEndpoint: vi.fn()
}));

vi.mock('../shared/platform/companionBootstrap', () => ({ loadCompanionBootstrapState: mocks.loadBootstrap }));
vi.mock('./iosAcceptanceRequestSync', () => ({ syncIosAcceptanceRequest: mocks.request }));
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
vi.mock('./iosSyncPackAcceptancePhase', () => ({
  advanceIosSyncPackAcceptancePhase: mocks.advancePhase,
  IOS_SYNC_PACK_ACCEPTANCE_PHASES: ['apply', 'reapply'],
  loadIosSyncPackAcceptancePhase: mocks.loadPhase
}));

import { runIosSyncPackAcceptance } from './iosSyncPackAcceptance';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadPhase.mockResolvedValue('apply');
  mocks.request.mockResolvedValue({ applied_blob_count: 0, applied_object_count: 1, to_state_seq: 2 });
  mocks.loadBootstrap.mockResolvedValue({ database_path: '/app/foliole.db' });
  mocks.ensureGroup.mockResolvedValue({ endpointUrl: 'http://127.0.0.1:43123',
    group: { group_id: 'group-1' }, joined: true,
    peer: { sourceHostName: 'Acceptance Desktop', sourcePeerId: 'desktop-1' } });
  mocks.runRoundtrip.mockResolvedValue({ push: { pushedObjectIds: ['node:capture', 'node:restore'] } });
  mocks.rerunRoundtrip.mockResolvedValue({ push: { pushedObjectIds: [] } });
});

it('joins and requests current facts from the accepted peer on the first launch', async () => {
  await runIosSyncPackAcceptance();

  expect(mocks.ensureGroup).toHaveBeenCalledWith('/app/foliole.db');
  expect(mocks.request).toHaveBeenCalledWith('http://127.0.0.1:43123', {
    sourceHostName: 'Acceptance Desktop', sourcePeerId: 'desktop-1'
  });
  expect(mocks.runRoundtrip).toHaveBeenCalledWith('http://127.0.0.1:43123', {
    sourceHostName: 'Acceptance Desktop', sourcePeerId: 'desktop-1'
  });
  expect(mocks.advancePhase).toHaveBeenCalledWith('apply');
  expect(mocks.advancePhase.mock.invocationCallOrder[0] ?? Infinity)
    .toBeLessThan(mocks.postResult.mock.invocationCallOrder[0] ?? -Infinity);
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({ phase: 'applied', status: 'passed' }));
});

it('reapplies through the shared path while reusing the accepted Sync Group identity', async () => {
  mocks.loadPhase.mockResolvedValue('reapply');

  await runIosSyncPackAcceptance();

  expect(mocks.loadBootstrap).toHaveBeenCalledOnce();
  expect(mocks.loadBootstrap.mock.invocationCallOrder[0] ?? Infinity)
    .toBeLessThan(mocks.rerunRoundtrip.mock.invocationCallOrder[0] ?? -Infinity);
  expect(mocks.ensureGroup).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.rerunRoundtrip).toHaveBeenCalledOnce();
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({ phase: 'reapplied', status: 'passed' }));
});

it('reports request failure without advancing the durable phase', async () => {
  mocks.request.mockRejectedValueOnce(new Error('request transport failed'));

  await runIosSyncPackAcceptance();

  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({
    error: 'request transport failed', phase: 'failed', status: 'failed'
  }));
  expect(mocks.runRoundtrip).not.toHaveBeenCalled();
  expect(mocks.advancePhase).not.toHaveBeenCalled();
});
