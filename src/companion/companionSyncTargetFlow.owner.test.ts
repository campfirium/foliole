import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exchangeMemberState: vi.fn(),
  run: vi.fn()
}));

vi.mock('./companionSyncRunOwner', () => ({ runCompanionSyncAsOwner: mocks.run }));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  bindCompanionWorkspaceSyncTarget: vi.fn(async () => undefined),
  recordCompanionWorkspaceSyncEvent: vi.fn(async () => undefined),
  saveCompanionWorkspaceSyncEndpoint: vi.fn(async () => undefined)
}));
vi.mock('../shared/platform/companion/network/companionSyncGroupMemberState', () => ({
  exchangeCompanionSyncGroupMemberState: mocks.exchangeMemberState
}));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  beginNativeCompanionSyncRun: vi.fn(async () => undefined)
}));
vi.mock('./companionStructureSyncSnapshot', () => ({
  loadCompanionStateAfterStructureSync: vi.fn()
}));

it('joins a duplicate request to the active shared run', async () => {
  mocks.run.mockReturnValue({
    completion: Promise.resolve('completed'), mode: 'joined', runId: 'run-active'
  });
  const runStreamSync = vi.fn();
  const { tryForegroundAutoSyncTarget } = await import('./companionSyncTargetFlow');
  const outcome = await tryForegroundAutoSyncTarget({
    cancelled: () => false, setError: vi.fn(),
    setState: vi.fn(), setSyncProgress: vi.fn(), setStatus: vi.fn(),
    state: { endpoint_url: 'http://desktop:38641', last_synced_at: null,
      remembered_targets: [], sync_events: [], sync_onboarding_status: 'completed',
      workspace_snapshot: null }
  }, { endpointUrl: 'http://desktop:38641' }, runStreamSync);

  expect(outcome).toBe('completed');
  expect(runStreamSync).not.toHaveBeenCalled();
});

it('carries the negotiated peer protocol and authenticated epoch into stream sync', async () => {
  mocks.exchangeMemberState.mockResolvedValue({
    localExited: false, normalSyncReady: true, peerLibraryEpoch: 'desktop-epoch',
    peerRemoved: false, restoreFromPeer: null
  });
  mocks.run.mockImplementation((_endpointUrl, runId, work) => ({
    completion: work(), mode: 'started', runId
  }));
  const runStreamSync = vi.fn(async () => 'completed' as const);
  const { tryForegroundAutoSyncTarget } = await import('./companionSyncTargetFlow');

  await tryForegroundAutoSyncTarget({
    cancelled: () => false, setError: vi.fn(), setState: vi.fn(),
    setSyncProgress: vi.fn(), setStatus: vi.fn(), state: {
      endpoint_url: 'http://desktop:38641', last_synced_at: null,
      remembered_targets: [], sync_events: [], sync_onboarding_status: 'completed',
      workspace_snapshot: null
    }
  }, {
    deviceId: 'desktop-1', endpointUrl: 'http://desktop:38641', groupId: 'group-1',
    protocolVersion: 22
  }, runStreamSync);

  expect(runStreamSync).toHaveBeenCalledWith(expect.objectContaining({ framedPeer: {
    deviceId: 'desktop-1', libraryEpoch: 'desktop-epoch', protocolVersion: 22
  } }));
});
