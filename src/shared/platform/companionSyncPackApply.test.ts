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
      host_name: 'Android test host',
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
const iosSyncPackApplyMock = vi.hoisted(() => ({
  apply: vi.fn(async () => ({
    applied_blob_count: 5,
    applied_object_count: 6,
    to_state_seq: 12
  }))
}));
const bootstrapMock = vi.hoisted(() => ({
  load: vi.fn(async () => ({
    booted_at: '2026-05-04T00:00:00.000Z',
    database_path: '/tmp/foliole.db',
    database_ready: true,
    device_id: 'android-test-device',
    host_name: 'Android test host',
    runtime_kind: 'android-capacitor' as 'android-capacitor' | 'ios-capacitor'
  }))
}));
const pairingMock = vi.hoisted(() => ({
  load: vi.fn(async () => ({
    primary_device_id: 'desktop-test-device', remote_peer_id: 'desktop-test-device'
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
vi.mock('./companionBootstrap', () => ({ loadCompanionBootstrapState: bootstrapMock.load }));
vi.mock('./companionWorkspacePairing', () => ({ loadCompanionPairingState: pairingMock.load }));
vi.mock('./companion/sync/pack-apply/iosCompanionSyncPackApply', () => ({
  applyIosCompanionSyncPackPath: iosSyncPackApplyMock.apply
}));

beforeEach(() => {
  vi.clearAllMocks();
  capacitorMock.isNative.mockReturnValue(true);
  capacitorMock.platform.mockReturnValue('android');
  bootstrapMock.load.mockResolvedValue({
    booted_at: '2026-05-04T00:00:00.000Z',
    database_path: '/tmp/foliole.db',
    database_ready: true,
    device_id: 'android-test-device',
    host_name: 'Android test host',
    runtime_kind: 'android-capacitor'
  });
});

it('downloads desktop packs before applying them through the shared database owner', async () => {
  const api = await import('./companionSyncPackApply');

  await expect(api.applyCompanionDesktopSyncPack({
    headers: { 'X-Authorization-Id': 'android' },
    sourceHostName: 'Desktop Test Host',
    sourcePeerId: 'desktop-test-device',
    url: 'http://desktop/companion/sync-pack'
  })).resolves.toEqual({
    applied_blob_count: 5,
    applied_object_count: 6,
    to_state_seq: 12
  });

  expect(capacitorMock.plugin.downloadDesktopSyncPack).toHaveBeenCalledWith({
    expected_peer_id: 'android-test-device',
    expected_source_peer_id: 'desktop-test-device',
    headers: { 'X-Authorization-Id': 'android' },
    url: 'http://desktop/companion/sync-pack'
  });
  expect(iosSyncPackApplyMock.apply).toHaveBeenCalledWith({
    deviceId: 'android-test-device',
    hostName: 'Android test host',
    packPath: '/tmp/downloaded-pack.db',
    sourceHostName: 'Desktop Test Host',
    sourcePeerId: 'desktop-test-device'
  });
  expect(capacitorMock.plugin.deleteDownloadedSyncPack).toHaveBeenCalledWith({ pack_path: '/tmp/downloaded-pack.db' });
});

it('keeps pack apply inert outside native companion hosts', async () => {
  capacitorMock.isNative.mockReturnValue(false);
  capacitorMock.platform.mockReturnValue('web');
  const api = await import('./companionSyncPackApply');

  await expect(api.applyCompanionDesktopSyncPack({
    headers: {}, sourcePeerId: 'desktop-test-device', url: 'http://desktop/pack.db'
  })).resolves.toEqual({
    applied_blob_count: 0,
    applied_object_count: 0,
    to_state_seq: 0
  });
});

it('downloads validated packs before routing iOS through its shared-core adapter', async () => {
  capacitorMock.platform.mockReturnValue('ios');
  bootstrapMock.load.mockResolvedValueOnce({
    booted_at: '2026-07-19T00:00:00.000Z',
    database_path: '/tmp/foliole.db',
    database_ready: true,
    device_id: 'ios-test-device',
    host_name: 'iOS test host',
    runtime_kind: 'ios-capacitor'
  });
  const api = await import('./companionSyncPackApply');

  await expect(api.applyCompanionDesktopSyncPack({
    headers: { 'X-Authorization-Id': 'ios-test-device' },
    sourceHostName: 'Desktop Test Host',
    sourcePeerId: 'desktop-test-device',
    url: 'http://desktop/companion/sync-pack'
  })).resolves.toEqual({ applied_blob_count: 5, applied_object_count: 6, to_state_seq: 12 });

  expect(iosSyncPackApplyMock.apply).toHaveBeenCalledWith({
    deviceId: 'ios-test-device',
    hostName: 'iOS test host',
    packPath: '/tmp/downloaded-pack.db',
    sourceHostName: 'Desktop Test Host',
    sourcePeerId: 'desktop-test-device'
  });
  expect(capacitorMock.plugin.deleteDownloadedSyncPack).toHaveBeenCalledWith({
    pack_path: '/tmp/downloaded-pack.db'
  });
});

it('deletes downloaded desktop packs when shared core apply fails', async () => {
  iosSyncPackApplyMock.apply.mockRejectedValueOnce(new Error('apply failed'));
  const api = await import('./companionSyncPackApply');

  await expect(api.applyCompanionDesktopSyncPack({
    headers: { 'X-Authorization-Id': 'android' },
    sourceHostName: 'Desktop Test Host',
    sourcePeerId: 'desktop-test-device',
    url: 'http://desktop/companion/sync-pack'
  })).rejects.toThrow('apply failed');

  expect(capacitorMock.plugin.deleteDownloadedSyncPack).toHaveBeenCalledWith({ pack_path: '/tmp/downloaded-pack.db' });
});
