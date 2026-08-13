import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  available: true,
  listen: vi.fn(),
  loadParticipation: vi.fn(),
  setEnabled: vi.fn(),
  setPaused: vi.fn(),
  start: vi.fn(),
  stop: vi.fn()
}));

vi.mock('../../appVersion', () => ({ loadAppVersion: () => Promise.resolve('0.7.5') }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: {
    addListener: runtime.listen,
    loadSyncParticipationState: runtime.loadParticipation,
    resolveSyncGroupDataRequest: vi.fn(),
    startSyncGroupProvider: runtime.start,
    setSyncEnabled: runtime.setEnabled,
    setSyncPaused: runtime.setPaused,
    stopSyncGroupProvider: runtime.stop
  },
  isAvailableNativeAndroidCompanionRuntime: () => runtime.available
}));

import { reconcileCompanionSyncGroupProvider } from './syncGroupProvider';

const bootstrap = {
  booted_at: '2026-08-08T00:00:00.000Z',
  database_path: '/data/foliole.db',
  database_ready: true,
  device_id: 'android-b',
  device_kind: 'android-capacitor',
  device_name: 'A5',
  runtime_kind: 'android-capacitor' as const
};

const group = {
  created_at: '2026-08-08T00:00:00.000Z', created_by_device_id: 'mac-a', display_name: 'Studio',
  group_id: 'group-1', local_device_id: 'A5 2', local_member_state: 'active' as const,
  members: [{
    approved_by_device_id: 'mac-a', authorization_id: 'pair-1', device_id: 'A5 2',
    device_kind: 'android-capacitor', device_name: 'A5 2', joined_at: '2026-08-08T00:00:00.000Z', state: 'active' as const
  }], timeline_id: 'timeline-1'
};

beforeEach(() => {
  runtime.available = true;
  runtime.start.mockReset().mockResolvedValue({ pending_requests: [], port: 1234, state: 'running' });
  runtime.listen.mockReset().mockResolvedValue({ remove: vi.fn() });
  runtime.loadParticipation.mockReset().mockResolvedValue({
    lifecycle_active: true, participating: true, sync_enabled: true, sync_paused: false
  });
  runtime.setEnabled.mockReset().mockResolvedValue({
    lifecycle_active: true, participating: false, sync_enabled: false, sync_paused: false
  });
  runtime.setPaused.mockReset();
  runtime.stop.mockReset().mockResolvedValue({ pending_requests: [], port: null, state: 'stopped' });
});

it('lands an active Android member on the native provider bridge with its persistent group identity', async () => {
  await reconcileCompanionSyncGroupProvider(bootstrap, group, '4:2026-08-12T00:00:00.000Z');
  expect(runtime.start).toHaveBeenCalledWith({
    app_version: '0.7.5', device_id: 'A5 2',
    device_name: 'A5 2', facts_revision: '4:2026-08-12T00:00:00.000Z', sync_group: group
  });
  expect(runtime.listen).toHaveBeenCalledWith('syncGroupDataRequest', expect.any(Function));
});

it('lands the native service hint event on the shared subscription', async () => {
  const listener = vi.fn();
  const { subscribeCompanionSyncGroupServiceHint } = await import('./syncGroupProvider');
  await subscribeCompanionSyncGroupServiceHint(listener);
  expect(runtime.listen).toHaveBeenCalledWith('syncGroupServiceHint', listener);
});

it('stops the native provider when there is no local group membership', async () => {
  await reconcileCompanionSyncGroupProvider(bootstrap, null);
  expect(runtime.stop).toHaveBeenCalledOnce();
  expect(runtime.start).not.toHaveBeenCalled();
});

it('publishes the native participation payload after a permanent choice changes', async () => {
  const {
    getCompanionSyncParticipationSnapshot,
    setCompanionSyncEnabled,
    subscribeCompanionSyncParticipation
  } = await import('./syncGroupProvider');
  const listener = vi.fn();
  const unsubscribe = subscribeCompanionSyncParticipation(listener);

  await setCompanionSyncEnabled(false);

  expect(runtime.setEnabled).toHaveBeenCalledWith({ sync_enabled: false });
  expect(getCompanionSyncParticipationSnapshot()).toMatchObject({
    participating: false, sync_enabled: false, sync_paused: false
  });
  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
});
