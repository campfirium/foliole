import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(async () => ({ applied_object_count: 1, applied_blob_count: 0, to_state_seq: 20 })),
  download: vi.fn<(args: { url: string }) => Promise<string>>().mockResolvedValue('/pack.db'),
  remove: vi.fn(async () => true),
  retire: vi.fn(async () => undefined),
  clearFacts: vi.fn(async () => undefined),
  loadResume: vi.fn(),
  probe: vi.fn(async (url: string): Promise<{
    url: string; headers: Record<string, string>; roundRebased?: boolean
  }> => ({ url: `${url}&fact_index_id=fresh`, headers: {} })),
  resume: { nextRow: 2, digest: 'digest', position: {
    table: 'node_sync_versions', key: { key: 'v2', ordinal: -1 }
  }, transfer: { groupId: 'group', peerId: 'source', sourceViewId: 'old-view',
    sourceEpoch: 'real-epoch', fromStateSeq: 17, frontierStateSeq: 20 } }
}));

vi.mock('../../../lib/core/sync/syncPackDependencyResume', async (original) => ({
  ...await original<typeof import('../../../lib/core/sync/syncPackDependencyResume')>(),
  retireSyncPackDependencyView: mocks.retire
}));
vi.mock('../../../lib/core/sync/syncPackKnownFactClaims', async (original) => ({
  ...await original<typeof import('../../../lib/core/sync/syncPackKnownFactClaims')>(),
  clearSyncPackKnownFactClaims: mocks.clearFacts
}));
vi.mock('./companionRuntimeCapabilities', () => ({
  getCompanionRuntimeCapability: () => ({ kind: 'android-native' })
}));
vi.mock('./companionBootstrap', () => ({ loadCompanionBootstrapState: async () => ({ host_name: 'A5' }) }));
vi.mock('./companion/sync/syncGroupStore', () => ({ loadCompanionSyncGroup: async () => ({
  group_id: 'group', local_device_identity_key: 'receiver',
  devices: [{ device_identity_key: 'receiver', state: 'active' }]
}) }));
vi.mock('./companion/network/signedRequest', () => ({ createSignedRequestHeaders: async () => ({}) }));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: mocks.loadResume,
    runWriter: async (task: (db: object) => Promise<unknown>) => task({}) })
}));
vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: async (task: () => Promise<unknown>) => task()
}));
vi.mock('./companion/sync/companionNodeVersionReceiptDelivery', () => ({
  flushCompanionNodeVersionReceipts: async () => undefined
}));
vi.mock('./companion/sync/pack-apply/companionSyncPackFactProbe', () => ({
  prepareCompanionSyncPackFactRequest: mocks.probe
}));
vi.mock('./companion/sync/pack-apply/iosCompanionSyncPackApply', () => ({
  applyIosCompanionSyncPackPath: mocks.apply
}));
vi.mock('./companionSyncPackTransfer', () => ({
  downloadCompanionDesktopSyncPack: mocks.download, deleteCompanionDownloadedSyncPack: mocks.remove
}));

const args = { headers: {}, sourceHostName: 'Mac', sourcePeerId: 'source',
  url: 'http://desktop/companion/sync-pack?after_state_seq=17&source_epoch=real-epoch&frontier_state_seq=20' };
beforeEach(() => { vi.clearAllMocks(); mocks.loadResume.mockResolvedValue(mocks.resume); });

it('reconciles authenticated source-view loss from the unchanged business cursor and real epoch', async () => {
  mocks.download.mockRejectedValueOnce(Object.assign(new Error('unavailable'), {
    code: 'sync_pack_source_view_unavailable'
  }));
  const { applyCompanionDesktopSyncPack } = await import('./companionSyncPackApply');
  expect(await applyCompanionDesktopSyncPack(args)).toMatchObject({ to_state_seq: 20 });
  expect(mocks.retire).toHaveBeenCalledExactlyOnceWith({}, mocks.resume.transfer);
  expect(mocks.probe).toHaveBeenCalledExactlyOnceWith(args.url,
    { groupId: 'group', peerId: 'source' });
  expect(mocks.download).toHaveBeenCalledTimes(2);
  expect(mocks.apply).toHaveBeenCalledTimes(1);
  expect(mocks.download.mock.calls[0]?.[0]).toMatchObject({ url: expect.stringContaining('dependency_after_row=2') });
});

it('reports a rebuilt fact round to the outer page loop', async () => {
  mocks.loadResume.mockResolvedValue(null);
  mocks.probe.mockResolvedValueOnce({ url: `${args.url}&fact_index_id=fresh`,
    headers: {}, roundRebased: true });
  const { applyCompanionDesktopSyncPack } = await import('./companionSyncPackApply');
  expect(await applyCompanionDesktopSyncPack(args)).toMatchObject({
    round_rebased: true, to_state_seq: 20
  });
});

it('reconciles a lost source view before its first dependency page without discarding business state', async () => {
  mocks.loadResume.mockResolvedValue(null);
  mocks.probe.mockResolvedValueOnce({ url: `${args.url}&fact_view=lost-view`, headers: {} })
    .mockResolvedValueOnce({ url: `${args.url}&fact_view=fresh-view`, headers: {} });
  mocks.download.mockRejectedValueOnce(Object.assign(new Error('unavailable'), {
    code: 'sync_pack_source_view_unavailable'
  }));
  const { applyCompanionDesktopSyncPack } = await import('./companionSyncPackApply');
  expect(await applyCompanionDesktopSyncPack(args)).toMatchObject({ to_state_seq: 20 });
  expect(mocks.clearFacts).toHaveBeenCalledExactlyOnceWith({},
    { groupId: 'group', peerId: 'source', sourceViewId: 'lost-view' });
  expect(mocks.retire).not.toHaveBeenCalled();
  expect(mocks.download).toHaveBeenCalledTimes(2);
});

it.each(['network timeout', 'HTTP 409', 'sync_pack_source_view_unavailable'])(
  'preserves the durable position for an unclassified failure: %s', async (message) => {
    mocks.download.mockRejectedValueOnce(new Error(message));
    const { applyCompanionDesktopSyncPack } = await import('./companionSyncPackApply');
    await expect(applyCompanionDesktopSyncPack(args)).rejects.toThrow(message);
    expect(mocks.retire).not.toHaveBeenCalled();
    expect(mocks.probe).not.toHaveBeenCalled();
    await applyCompanionDesktopSyncPack(args);
    expect(mocks.download.mock.calls[1]?.[0]).toMatchObject({
      url: expect.stringContaining('dependency_view=old-view')
    });
  }
);
