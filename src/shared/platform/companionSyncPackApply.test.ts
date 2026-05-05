import { beforeEach, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platform: vi.fn(() => 'android'),
  plugin: {
    deleteDownloadedSyncPack: vi.fn(async () => ({ deleted: true })),
    downloadDesktopSyncPack: vi.fn(async () => ({ pack_path: '/tmp/downloaded-pack.db' })),
    loadBootstrap: vi.fn(async () => ({
      booted_at: '2026-05-04T00:00:00.000Z',
      database_path: '/tmp/foliole.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor'
    })),
    loadSyncPackCursor: vi.fn(async () => ({ cursor: 4 })),
    saveSyncPackCursor: vi.fn(async ({ cursor }: { cursor: number | null }) => ({ cursor }))
  }
}));
const syncPackNodesMock = vi.hoisted(() => ({
  applyCompanionSyncPackPathWithSharedCore: vi.fn(async () => ({
    applied_blob_count: 3,
    applied_object_count: 4,
    to_state_seq: 11
  }))
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.platform,
    isNativePlatform: capacitorMock.isNative
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));
vi.mock('./companionSyncPackNodes', () => syncPackNodesMock);

beforeEach(() => {
  vi.clearAllMocks();
  capacitorMock.isNative.mockReturnValue(true);
  capacitorMock.platform.mockReturnValue('android');
});

it('downloads desktop packs before applying them through the shared TS core', async () => {
  const api = await import('./companionSyncPackApply');

  await expect(api.applyCompanionDesktopSyncPack({
    headers: { 'X-Device-Id': 'android' },
    url: 'http://desktop/companion/sync-pack'
  })).resolves.toEqual({
    applied_blob_count: 3,
    applied_object_count: 4,
    to_state_seq: 11
  });

  expect(capacitorMock.plugin.downloadDesktopSyncPack).toHaveBeenCalledWith({
    headers: { 'X-Device-Id': 'android' },
    url: 'http://desktop/companion/sync-pack'
  });
  expect(syncPackNodesMock.applyCompanionSyncPackPathWithSharedCore).toHaveBeenCalledWith({
    deviceId: 'android-test-device',
    packPath: '/tmp/downloaded-pack.db'
  }, expect.any(Object));
  expect(capacitorMock.plugin.deleteDownloadedSyncPack).toHaveBeenCalledWith({ pack_path: '/tmp/downloaded-pack.db' });
});

it('keeps pack apply inert outside native Android', async () => {
  capacitorMock.isNative.mockReturnValue(false);
  capacitorMock.platform.mockReturnValue('web');
  const api = await import('./companionSyncPackApply');

  await expect(api.applyCompanionDesktopSyncPack({ headers: {}, url: 'http://desktop/pack.db' })).resolves.toEqual({
    applied_blob_count: 0,
    applied_object_count: 0,
    to_state_seq: 0
  });
});

it('deletes downloaded desktop packs when shared core apply fails', async () => {
  syncPackNodesMock.applyCompanionSyncPackPathWithSharedCore.mockRejectedValueOnce(new Error('apply failed'));
  const api = await import('./companionSyncPackApply');

  await expect(api.applyCompanionDesktopSyncPack({
    headers: { 'X-Device-Id': 'android' },
    url: 'http://desktop/companion/sync-pack'
  })).rejects.toThrow('apply failed');

  expect(capacitorMock.plugin.deleteDownloadedSyncPack).toHaveBeenCalledWith({ pack_path: '/tmp/downloaded-pack.db' });
});
