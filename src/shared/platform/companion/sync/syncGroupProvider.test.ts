import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  available: true,
  listen: vi.fn(),
  start: vi.fn(),
  stop: vi.fn()
}));

vi.mock('../../appVersion', () => ({ loadAppVersion: () => Promise.resolve('0.7.5') }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: {
    addListener: runtime.listen,
    resolveSyncGroupDataRequest: vi.fn(),
    startSyncGroupProvider: runtime.start,
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
  group_id: 'group-1', local_device_id: 'android-b', local_member_state: 'active' as const,
  members: [], timeline_id: 'timeline-1'
};

beforeEach(() => {
  runtime.available = true;
  runtime.start.mockReset().mockResolvedValue({ pending_requests: [], port: 1234, state: 'running' });
  runtime.listen.mockReset().mockResolvedValue({ remove: vi.fn() });
  runtime.stop.mockReset().mockResolvedValue({ pending_requests: [], port: null, state: 'stopped' });
});

it('lands an active Android member on the native provider bridge with its persistent group identity', async () => {
  await reconcileCompanionSyncGroupProvider(bootstrap, group);
  expect(runtime.start).toHaveBeenCalledWith({
    app_version: '0.7.5', device_id: 'android-b',
    device_name: 'A5', sync_group: group
  });
  expect(runtime.listen).toHaveBeenCalledWith('syncGroupDataRequest', expect.any(Function));
});

it('stops the native provider when there is no local group membership', async () => {
  await reconcileCompanionSyncGroupProvider(bootstrap, null);
  expect(runtime.stop).toHaveBeenCalledOnce();
  expect(runtime.start).not.toHaveBeenCalled();
});
