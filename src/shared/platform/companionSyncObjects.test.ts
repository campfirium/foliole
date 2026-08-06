import { beforeEach, describe, expect, it, vi } from 'vitest';

const writerQueueMock = vi.hoisted(() => ({
  run: vi.fn(async <T>(task: () => Promise<T>) => task())
}));
const iosSyncbackStoreMock = vi.hoisted(() => ({
  loadNodeVersions: vi.fn(async () => [{ object_id: 'node-1' }]),
  loadReviewLog: vi.fn(async () => [{ op_id: 'op-1' }]),
  savePushAcks: vi.fn(async () => ['ios-review-op'])
}));
const iosReadsMock = vi.hoisted(() => ({
  conflicts: vi.fn(async () => [
    { conflict_version_id: 'phone#1', object_id: 'node-1', snapshot: { title: 'Remote' } }
  ]),
  index: vi.fn(async () => [{ object_id: 'one', object_type: 'setting' }]),
  missingAttachments: vi.fn(async () => [
    { attachment_id: 'att-1', content_hash: 'hash-att-1', size_bytes: 2048 }
  ]),
  missingBlobs: vi.fn(async () => ({
    blobs: [{ hash: 'a'.repeat(64), size_bytes: 1024 }], hashes: ['a'.repeat(64)]
  })),
  objects: vi.fn(async () => [{ object_id: 'one', object_type: 'setting' }]),
  pdf: vi.fn(async () => [
    { page: 1, page_height: 200, page_width: 100, text: 'indexed pdf text' }
  ]),
  searchPdf: vi.fn(async () => [{
    attachment_id: 'att-1', excerpt: 'indexed pdf text', match_start: 8, page: 1,
    page_height: 200, page_width: 100, text: 'indexed pdf text'
  }])
}));
const iosWritesMock = vi.hoisted(() => ({
  active: vi.fn(async () => ({ content_hash: 'hash-active', object_id: 'active' })),
  reading: vi.fn(async () => ({ content_hash: 'hash-reading', object_id: 'node-1' })),
  review: vi.fn(async () => ({ content_hash: 'hash-review', object_id: 'node-1' })),
  setting: vi.fn(async () => ({ content_hash: 'hash-setting', object_id: 'setting-1' })),
  view: vi.fn(async () => ({ content_hash: 'hash-view', object_id: 'view' }))
}));

vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: writerQueueMock.run
}));
vi.mock('./companion/sync/syncback/iosCompanionSyncbackStore', () => ({
  getIosCompanionSyncbackStore: vi.fn(() => iosSyncbackStoreMock)
}));
vi.mock('./companion/runtime/iosCompanionActiveDatabaseReads', () => ({
  loadIosMissingAttachments: iosReadsMock.missingAttachments,
  loadIosMissingContentBlobs: iosReadsMock.missingBlobs,
  loadIosPdfPageText: iosReadsMock.pdf,
  loadIosSyncIndex: iosReadsMock.index,
  loadIosSyncNodeConflicts: iosReadsMock.conflicts,
  loadIosSyncObjects: iosReadsMock.objects,
  searchIosPdfPageText: iosReadsMock.searchPdf
}));
vi.mock('./companion/runtime/iosCompanionActiveDatabaseWrites', () => ({
  saveIosActiveViewState: iosWritesMock.active,
  saveIosNodeViewState: iosWritesMock.view,
  saveIosOpenState: vi.fn(),
  saveIosReading: iosWritesMock.reading,
  saveIosReview: iosWritesMock.review,
  saveIosSetting: iosWritesMock.setting
}));

const capacitorMock = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platform: vi.fn(() => 'android'),
  plugin: {
    saveSyncPushAcks: vi.fn(async () => ({ saved_client_op_ids: ['op-1'] }))
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.platform,
    isNativePlatform: capacitorMock.isNative
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

function createReadingProfile() {
  return {
    intervalDurationMs: 1,
    intervalGrowthFactor: 1,
    lastHandledAt: '2026-04-25T00:00:00.000Z',
    nextAt: '2026-04-25T00:01:00.000Z',
    priority: 0,
    readingPosition: 0,
    repetitionCount: 1,
    state: 'active' as const
  };
}

function createReviewProfile() {
  return {
    difficulty: 1,
    due: '2026-04-25T00:00:00.000Z',
    elapsedDays: 0,
    lapses: 0,
    lastReviewAt: null,
    reps: 1,
    scheduledDays: 0,
    stability: 1,
    state: 1 as const
  };
}

async function testNativePluginBridge() {
  const api = await import('./companionSyncObjects');
  await expect(api.loadCompanionSyncIndex()).resolves.toEqual([{ object_id: 'one', object_type: 'setting' }]);
  await expect(api.loadCompanionSyncNodeConflicts()).resolves.toEqual([
    { conflict_version_id: 'phone#1', object_id: 'node-1', snapshot: { title: 'Remote' } }
  ]);
  await expect(api.loadCompanionSyncObjects(['one'], ['setting'])).resolves.toEqual([{ object_id: 'one', object_type: 'setting' }]);
  await expect(api.loadCompanionMissingContentBlobHashes(3)).resolves.toEqual(['a'.repeat(64)]);
  await expect(api.loadCompanionMissingContentBlobs(3)).resolves.toEqual([{ hash: 'a'.repeat(64), size_bytes: 1024 }]);
  expect(iosReadsMock.missingBlobs).toHaveBeenCalledWith(3);
  await expect(api.loadCompanionMissingAttachmentResources(4)).resolves.toEqual([
    { attachment_id: 'att-1', content_hash: 'hash-att-1', size_bytes: 2048 }
  ]);
  expect(iosReadsMock.missingAttachments).toHaveBeenCalledWith(4);
  await expect(api.loadCompanionSyncNodeVersions(null)).resolves.toEqual([{ object_id: 'node-1' }]);
  await expect(api.loadCompanionSyncReviewLog(null)).resolves.toEqual([{ op_id: 'op-1' }]);
  await expect(api.loadCompanionPdfPageText('att-1')).resolves.toEqual([
    { page: 1, page_height: 200, page_width: 100, text: 'indexed pdf text' }
  ]);
  expect(iosReadsMock.pdf).toHaveBeenCalledWith('att-1');
  await expect(api.searchCompanionPdfPageText('pdf', 5)).resolves.toEqual([{
    attachment_id: 'att-1',
    excerpt: 'indexed pdf text',
    match_start: 8,
    page: 1,
    page_height: 200,
    page_width: 100,
    text: 'indexed pdf text'
  }]);
  expect(iosReadsMock.searchPdf).toHaveBeenCalledWith('pdf', 5);
  await expectNativeSaveBridge(api);
}

async function expectNativeSaveBridge(api: typeof import('./companionSyncObjects')) {
  await expect(api.saveCompanionSyncSettingRecord({ key: 'one', valueJson: '{}' }))
    .resolves.toEqual({ content_hash: 'hash-setting', object_id: 'setting-1' });
  await expect(api.saveCompanionSyncActiveViewState('node-1'))
    .resolves.toEqual({ content_hash: 'hash-active', object_id: 'active' });
  await expect(api.saveCompanionSyncNodeReadingRecord({
    nodeId: 'node-1',
    reading: createReadingProfile()
  })).resolves.toEqual({ content_hash: 'hash-reading', object_id: 'node-1' });
  expect(iosWritesMock.reading).toHaveBeenCalledWith(expect.objectContaining({
    reading_json: expect.stringContaining('"reading_position"')
  }));
  await expect(api.saveCompanionSyncNodeReviewRecord({
    nodeId: 'node-1',
    review: createReviewProfile(),
    reviewLog: {
      cardAfter: { difficulty: 1.2, due: '2026-04-26T00:00:00.000Z', stability: 2.3 },
      cardBefore: { difficulty: 1, due: '2026-04-25T00:00:00.000Z', stability: 2 },
      grade: 3,
      reviewedAt: '2026-04-25T00:00:00.000Z',
      schedulerVersion: 'ts-fsrs@4'
    }
  })).resolves.toEqual({ content_hash: 'hash-review', object_id: 'node-1' });
  expect(iosWritesMock.review).toHaveBeenCalledWith(expect.objectContaining({
    node_id: 'node-1',
    review_json: expect.stringContaining('"last_review_at"'),
    review_log_json: expect.stringContaining('"reviewedAt"')
  }));
  await expect(api.saveCompanionSyncNodeViewState({ nodeId: 'node-1', scrollTop: 42.8 }))
    .resolves.toEqual({ content_hash: 'hash-view', object_id: 'view' });
  expect(iosWritesMock.view).toHaveBeenCalledWith({
    node_id: 'node-1',
    scroll_top: 42.8
  });
  await expect(api.applyCompanionSyncReviewLog([])).resolves.toEqual([]);
  await expect(api.saveCompanionSyncPushAcks([{
    clientOpId: 'client-op-1',
    identity: { objectId: 'one', objectType: 'setting', scope: 'device' },
    stateSeq: 4,
    status: 'accepted'
  }])).resolves.toEqual(['ios-review-op']);
  expect(writerQueueMock.run).toHaveBeenCalledTimes(6);
}

describe('companion sync objects bridge', () => {
  beforeEach(() => {
    writerQueueMock.run.mockClear();
    writerQueueMock.run.mockImplementation(async <T>(task: () => Promise<T>) => task());
    capacitorMock.isNative.mockReturnValue(true);
    capacitorMock.platform.mockReturnValue('android');
  });

  it('loads and applies generic sync objects through the native plugin', testNativePluginBridge);

  it('loads generic sync object metadata and payloads on iOS', async () => {
    capacitorMock.platform.mockReturnValue('ios');
    const api = await import('./companionSyncObjects');

    await expect(api.loadCompanionSyncIndex()).resolves.toEqual([{ object_id: 'one', object_type: 'setting' }]);
    await expect(api.loadCompanionSyncObjects(['one'], ['setting']))
      .resolves.toEqual([{ object_id: 'one', object_type: 'setting' }]);
    expect(iosReadsMock.index).toHaveBeenCalledWith();
    expect(iosReadsMock.objects).toHaveBeenCalledWith(['one'], ['setting']);
  });

  it('saves iOS push acknowledgements through the SQLite store', async () => {
    capacitorMock.platform.mockReturnValue('ios');
    capacitorMock.plugin.saveSyncPushAcks.mockClear();
    const api = await import('./companionSyncObjects');
    const ack = {
      clientOpId: 'ios-review-op',
      identity: { objectId: 'node-1', objectType: 'node_review' as const, scope: 'workspace' },
      stateSeq: 7,
      status: 'accepted' as const
    };

    await expect(api.saveCompanionSyncPushAcks([ack])).resolves.toEqual(['ios-review-op']);
    expect(iosSyncbackStoreMock.savePushAcks).toHaveBeenCalledWith([ack]);
    expect(capacitorMock.plugin.saveSyncPushAcks).not.toHaveBeenCalled();
  });
});
