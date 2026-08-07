import { expect, it, vi } from 'vitest';

const writerQueueMock = vi.hoisted(() => ({
  run: vi.fn(async <T>(task: () => Promise<T>) => task())
}));

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  plugin: {
    recordWorkspaceSyncEvent: vi.fn(async () => createNativeState()),
    removeWorkspaceSyncRememberedTarget: vi.fn(async () => createNativeState()),
    saveSyncOnboardingStatus: vi.fn(async () => createNativeState()),
    saveWorkspaceSyncEndpoint: vi.fn(async () => createNativeState())
  }
}));
const stateStore = vi.hoisted(() => ({
  load: vi.fn(async () => createNativeState()),
  save: vi.fn(async (state) => state)
}));

vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: writerQueueMock.run
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));
vi.mock('./companion/sync/workspace-state/iosCompanionWorkspaceSyncStateStore', () => ({
  loadIosCompanionWorkspaceSyncState: stateStore.load,
  saveIosCompanionWorkspaceSyncState: stateStore.save
}));

function createNativeState() {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: null,
    remembered_targets: ['http://10.0.2.2:38641'],
    sync_events: [],
    sync_onboarding_status: 'accepted',
    workspace_snapshot: null
  };
}

it('serializes native workspace sync metadata writes', async () => {
  const api = await import('./companionWorkspaceSync');

  await api.saveCompanionWorkspaceSyncEndpoint('http://10.0.2.2:38641');
  await api.removeCompanionWorkspaceSyncRememberedTarget('http://10.0.2.2:38641');
  await api.saveCompanionSyncOnboardingStatus('accepted');
  await api.recordCompanionWorkspaceSyncEvent({
    endpointUrl: 'http://10.0.2.2:38641',
    message: 'done',
    occurredAt: '2026-04-25T00:00:00.000Z',
    status: 'completed'
  });

  expect(writerQueueMock.run).toHaveBeenCalledTimes(4);
  expect(stateStore.save).toHaveBeenCalledTimes(4);
  expect(stateStore.save).toHaveBeenLastCalledWith(expect.objectContaining({
    sync_events: [expect.objectContaining({ message: 'done', status: 'completed' })]
  }));
});
