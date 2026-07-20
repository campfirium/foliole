import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';

let persistedState: NativeCompanionWorkspaceSyncState;
const stateStore = vi.hoisted(() => ({
  load: vi.fn(async () => structuredClone(persistedState)),
  save: vi.fn(async (state: NativeCompanionWorkspaceSyncState) => {
    persistedState = structuredClone(state);
    return structuredClone(persistedState);
  })
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => ({}))
}));
vi.mock('./companion/sync/workspace-state/iosCompanionWorkspaceSyncStateStore', () => ({
  loadIosCompanionWorkspaceSyncState: stateStore.load,
  saveIosCompanionWorkspaceSyncState: stateStore.save
}));

import {
  loadCompanionWorkspaceSyncState,
  recordCompanionWorkspaceSyncEvent,
  saveCompanionWorkspaceSyncEndpoint
} from './companionWorkspaceSync';

beforeEach(() => {
  persistedState = {
    endpoint_url: null,
    last_synced_at: null,
    remembered_targets: [],
    sync_events: [],
    sync_onboarding_status: 'pending',
    workspace_snapshot: null
  };
  stateStore.load.mockClear();
  stateStore.save.mockClear();
});

it('serializes concurrent iOS metadata updates without losing either permanent field', async () => {
  await Promise.all([
    saveCompanionWorkspaceSyncEndpoint('http://192.168.1.5:38641'),
    recordCompanionWorkspaceSyncEvent({
      endpointUrl: 'http://192.168.1.5:38641',
      message: 'Sync completed.',
      occurredAt: '2026-07-21T04:00:00.000Z',
      status: 'completed'
    })
  ]);

  await expect(loadCompanionWorkspaceSyncState()).resolves.toMatchObject({
    endpoint_url: 'http://192.168.1.5:38641',
    remembered_targets: ['http://192.168.1.5:38641'],
    sync_events: [expect.objectContaining({ message: 'Sync completed.' })]
  });
  expect(stateStore.save).toHaveBeenCalledTimes(2);
});
