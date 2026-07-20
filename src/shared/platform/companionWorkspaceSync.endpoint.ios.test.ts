import { expect, it, vi } from 'vitest';

const iosStateStore = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(async (state) => state)
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isNativePlatform: () => true
  },
  registerPlugin: vi.fn(() => ({}))
}));
vi.mock('./companion/sync/workspace-state/iosCompanionWorkspaceSyncStateStore', () => ({
  loadIosCompanionWorkspaceSyncState: iosStateStore.load,
  saveIosCompanionWorkspaceSyncState: iosStateStore.save
}));

import { saveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSync';

it('persists the current Mac sync address through the iOS state store', async () => {
  iosStateStore.load.mockResolvedValue({
    endpoint_url: 'http://192.168.1.5:38641',
    last_synced_at: null,
    remembered_targets: ['http://192.168.1.5:38641'],
    sync_events: [],
    sync_onboarding_status: 'completed',
    workspace_snapshot: null
  });

  await expect(saveCompanionWorkspaceSyncEndpoint('http://192.168.1.8:38641/')).resolves.toMatchObject({
    endpoint_url: 'http://192.168.1.8:38641',
    remembered_targets: ['http://192.168.1.8:38641', 'http://192.168.1.5:38641']
  });
  expect(iosStateStore.save).toHaveBeenCalledWith(expect.objectContaining({
    endpoint_url: 'http://192.168.1.8:38641',
    remembered_targets: ['http://192.168.1.8:38641', 'http://192.168.1.5:38641']
  }));
});
