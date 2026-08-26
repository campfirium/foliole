import { expect, it, vi } from 'vitest';

const ownerMock = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock('./companionSyncRunOwner', () => ({ runCompanionSyncAsOwner: ownerMock.run }));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  bindCompanionWorkspaceSyncTarget: vi.fn(),
  recordCompanionWorkspaceSyncEvent: vi.fn(),
  saveCompanionWorkspaceSyncEndpoint: vi.fn()
}));
vi.mock('./companionStructureSyncSnapshot', () => ({
  loadCompanionStateAfterStructureSync: vi.fn()
}));

it('joins a duplicate request to the active shared run', async () => {
  ownerMock.run.mockReturnValue({
    completion: Promise.resolve('completed'), mode: 'joined', runId: 'run-active'
  });
  const runStreamSync = vi.fn();
  const { tryForegroundAutoSyncTarget } = await import('./companionSyncTargetFlow');
  const outcome = await tryForegroundAutoSyncTarget({
    cancelled: () => false, setError: vi.fn(), setReadableArticle: vi.fn(),
    setState: vi.fn(), setSyncProgress: vi.fn(), setStatus: vi.fn(),
    state: { endpoint_url: 'http://desktop:38641', last_synced_at: null,
      remembered_targets: [], sync_events: [], sync_onboarding_status: 'completed',
      workspace_snapshot: null }
  }, { endpointUrl: 'http://desktop:38641' }, runStreamSync);

  expect(outcome).toBe('completed');
  expect(runStreamSync).not.toHaveBeenCalled();
});
