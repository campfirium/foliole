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
  }))
}));
const syncGroupMock = vi.hoisted(() => ({
  load: vi.fn(async () => ({
    created_at: '2026-08-27T00:00:00.000Z',
    devices: [{ device_identity_key: 'android-group-device', state: 'active' }],
    display_name: 'Studio', group_id: 'group-1', local_device_identity_key: 'android-group-device'
  }))
}));
const receiptMock = vi.hoisted(() => ({ flush: vi.fn(async () => undefined) }));
const resumeMock = vi.hoisted(() => ({ load: vi.fn(async () => null) }));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: resumeMock.load })
}));
vi.mock('./companion/network/signedRequest', () => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Authorization-Id': 'dependency-page' }))
}));
const factProbeMock = vi.hoisted(() => ({
  prepare: vi.fn(async () => ({
    headers: { 'X-Authorization-Id': 'fact-probe' },
    url: 'http://desktop/companion/sync-pack?fact_index_id=checked',
    factClaims: { index: { index_id: 'checked' }, claims: { versions: [], parents: [], reviews: [] } }
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
vi.mock('./companion/sync/syncGroupStore', () => ({ loadCompanionSyncGroup: syncGroupMock.load }));
vi.mock('./companion/sync/companionNodeVersionReceiptDelivery', () => ({
  flushCompanionNodeVersionReceipts: receiptMock.flush
}));
vi.mock('./companion/sync/pack-apply/companionSyncPackFactProbe', () => ({
  prepareCompanionSyncPackFactRequest: factProbeMock.prepare
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
    expected_peer_id: 'android-group-device',
    expected_source_peer_id: 'desktop-test-device',
    headers: { 'X-Authorization-Id': 'fact-probe' },
    url: 'http://desktop/companion/sync-pack?fact_index_id=checked'
  });
  expect(iosSyncPackApplyMock.apply).toHaveBeenCalledWith({
    deviceId: 'android-group-device',
    hostName: 'Android test host',
    packPath: '/tmp/downloaded-pack.db',
    sourceHostName: 'Desktop Test Host',
    sourcePeerId: 'desktop-test-device',
    factClaims: { index: { index_id: 'checked' }, claims: { versions: [], parents: [], reviews: [] } }
  });
  expect(capacitorMock.plugin.deleteDownloadedSyncPack).toHaveBeenCalledWith({ pack_path: '/tmp/downloaded-pack.db' });
  expect(receiptMock.flush).toHaveBeenCalledTimes(2);
  expect(receiptMock.flush).toHaveBeenCalledWith('http://desktop', 'desktop-test-device');
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

it('consumes dependency pages internally and returns only the final advancing business page', async () => {
  const progress = { nextRow: 2, digest: 'digest', position: {
    table: 'node_sync_versions', key: { key: 'v2', ordinal: -1 }
  }, transfer: { sourceViewId: 'view', sourceEpoch: 'epoch', frontierStateSeq: 12 } };
  iosSyncPackApplyMock.apply.mockImplementationOnce(async () => ({
    applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0,
    dependencyProgress: progress
  }));
  const api = await import('./companionSyncPackApply');
  const result = await api.applyCompanionDesktopSyncPack({ headers: {},
    sourceHostName: 'Desktop Test Host', sourcePeerId: 'desktop-test-device',
    url: 'http://desktop/companion/sync-pack?after_state_seq=0' });
  expect(result.to_state_seq).toBe(12);
  expect(capacitorMock.plugin.downloadDesktopSyncPack).toHaveBeenCalledTimes(2);
  expect(capacitorMock.plugin.deleteDownloadedSyncPack).toHaveBeenCalledTimes(2);
  expect(capacitorMock.plugin.downloadDesktopSyncPack).toHaveBeenLastCalledWith(expect.objectContaining({
    headers: { 'X-Authorization-Id': 'dependency-page' },
    url: expect.stringContaining('dependency_after_row=2')
  }));
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
    deviceId: 'android-group-device',
    hostName: 'iOS test host',
    packPath: '/tmp/downloaded-pack.db',
    sourceHostName: 'Desktop Test Host',
    sourcePeerId: 'desktop-test-device',
    factClaims: { index: { index_id: 'checked' }, claims: { versions: [], parents: [], reviews: [] } }
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
