import { beforeEach, describe, expect, it, vi } from 'vitest';

const writerQueueMock = vi.hoisted(() => ({
  run: vi.fn(async <T>(task: () => Promise<T>) => task())
}));

vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: writerQueueMock.run
}));

function createApplyPluginMocks() {
  return {
    applySyncObjects: vi.fn(async () => ({ applied_object_ids: ['setting:one'] })),
    applySyncReviewLog: vi.fn(async () => ({ applied_op_ids: ['op-1'] })),
    saveSyncPushAcks: vi.fn(async () => ({ saved_client_op_ids: ['op-1'] }))
  };
}
function createReadPluginMocks() {
  return {
    loadSyncIndex: vi.fn(async () => ({ entries: [{ object_id: 'one', object_type: 'setting' }] })),
    loadSyncNodeConflicts: vi.fn(async () => ({
      conflicts: [{ conflict_version_id: 'phone#1', object_id: 'node-1', snapshot: { title: 'Remote' } }]
    })),
    loadSyncObjects: vi.fn(async () => ({ objects: [{ object_id: 'one', object_type: 'setting' }] })),
    loadMissingContentBlobHashes: vi.fn(async () => ({
      blobs: [{ hash: 'a'.repeat(64), size_bytes: 1024 }],
      hashes: ['a'.repeat(64)]
    })),
    loadMissingAttachmentResources: vi.fn(async () => ({
      resources: [{ attachment_id: 'att-1', content_hash: 'hash-att-1', size_bytes: 2048 }]
    })),
    loadSyncNodeVersions: vi.fn(async () => ({ nodes: [{ object_id: 'node-1' }] })),
    loadSyncReviewLog: vi.fn(async () => ({ reviews: [{ op_id: 'op-1' }] }))
  };
}

function createSearchPluginMocks() {
  return {
    loadPdfPageText: vi.fn(async () => ({
      attachment_id: 'att-1',
      pages: [{ page: 1, page_height: 200, page_width: 100, text: 'indexed pdf text' }]
    })),
    searchPdfPageText: vi.fn(async () => ({
      query: 'pdf',
      results: [{
        attachment_id: 'att-1', excerpt: 'indexed pdf text', match_start: 8, page: 1,
        page_height: 200, page_width: 100, text: 'indexed pdf text'
      }]
    }))
  };
}

function createWritePluginMocks() {
  return {
    saveSyncActiveViewState: vi.fn(async () => ({ content_hash: 'hash-active', object_id: 'active' })),
    saveSyncNodeReadingRecord: vi.fn(async () => ({ content_hash: 'hash-reading', object_id: 'node-1' })),
    saveSyncNodeReviewRecord: vi.fn(async () => ({ content_hash: 'hash-review', object_id: 'node-1' })),
    saveSyncNodeViewState: vi.fn(async () => ({ content_hash: 'hash-view', object_id: 'view' })),
    saveSyncSettingRecord: vi.fn(async () => ({ content_hash: 'hash-setting', object_id: 'setting-1' })),
    syncContentBlob: vi.fn(async ({ hash }) => ({ availability: 'cached', hash })),
    syncAttachmentResource: vi.fn(async () => ({ attachment_id: 'att-1', availability: 'cached' }))
  };
}

const capacitorMock = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platform: vi.fn(() => 'android'),
  plugin: {
    ...createApplyPluginMocks(),
    ...createReadPluginMocks(),
    ...createSearchPluginMocks(),
    ...createWritePluginMocks()
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
  expect(capacitorMock.plugin.loadMissingContentBlobHashes).toHaveBeenCalledWith({ limit: 3 });
  await expect(api.loadCompanionMissingAttachmentResources(4)).resolves.toEqual([
    { attachment_id: 'att-1', content_hash: 'hash-att-1', size_bytes: 2048 }
  ]);
  expect(capacitorMock.plugin.loadMissingAttachmentResources).toHaveBeenCalledWith({ limit: 4 });
  await expect(api.syncCompanionContentBlob({
    hash: 'a'.repeat(64),
    headers: { 'X-Device-Id': 'android' },
    url: 'http://desktop/companion/content-blob?hash=a'
  })).resolves.toEqual({ availability: 'cached', hash: 'a'.repeat(64) });
  expect(capacitorMock.plugin.syncContentBlob).toHaveBeenCalledWith({
    hash: 'a'.repeat(64),
    headers: { 'X-Device-Id': 'android' },
    url: 'http://desktop/companion/content-blob?hash=a'
  });
  await expect(api.loadCompanionSyncNodeVersions(null)).resolves.toEqual([{ object_id: 'node-1' }]);
  await expect(api.loadCompanionSyncReviewLog(null)).resolves.toEqual([{ op_id: 'op-1' }]);
  await expect(api.loadCompanionPdfPageText('att-1')).resolves.toEqual([
    { page: 1, page_height: 200, page_width: 100, text: 'indexed pdf text' }
  ]);
  expect(capacitorMock.plugin.loadPdfPageText).toHaveBeenCalledWith({ attachment_id: 'att-1' });
  await expect(api.searchCompanionPdfPageText('pdf', 5)).resolves.toEqual([{
    attachment_id: 'att-1',
    excerpt: 'indexed pdf text',
    match_start: 8,
    page: 1,
    page_height: 200,
    page_width: 100,
    text: 'indexed pdf text'
  }]);
  expect(capacitorMock.plugin.searchPdfPageText).toHaveBeenCalledWith({ limit: 5, query: 'pdf' });
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
  expect(capacitorMock.plugin.saveSyncNodeReadingRecord).toHaveBeenCalledWith(expect.objectContaining({
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
  expect(capacitorMock.plugin.saveSyncNodeReviewRecord).toHaveBeenCalledWith(expect.objectContaining({
    node_id: 'node-1',
    review_json: expect.stringContaining('"last_review_at"'),
    review_log_json: expect.stringContaining('"reviewedAt"')
  }));
  await expect(api.saveCompanionSyncNodeViewState({ nodeId: 'node-1', scrollTop: 42.8 }))
    .resolves.toEqual({ content_hash: 'hash-view', object_id: 'view' });
  expect(capacitorMock.plugin.saveSyncNodeViewState).toHaveBeenCalledWith({
    node_id: 'node-1',
    scroll_top: 42,
    source: 'user-scroll'
  });
  await expect(api.applyCompanionSyncObjects([{
    content_hash: 'hash',
    deleted_at: null,
    object_id: 'one',
    object_type: 'setting',
    payload_json: '{}',
    updated_at: '2026-04-25T00:00:00.000Z'
  }])).resolves.toEqual(['setting:one']);
  await expect(api.applyCompanionSyncReviewLog([])).resolves.toEqual(['op-1']);
  await expect(api.saveCompanionSyncPushAcks([{
    clientOpId: 'client-op-1',
    identity: { objectId: 'one', objectType: 'setting', scope: 'device' },
    stateSeq: 4,
    status: 'accepted'
  }])).resolves.toEqual(['op-1']);
  expect(writerQueueMock.run).toHaveBeenCalledTimes(9);
}

describe('companion sync objects bridge', () => {
  beforeEach(() => {
    writerQueueMock.run.mockClear();
    writerQueueMock.run.mockImplementation(async <T>(task: () => Promise<T>) => task());
    capacitorMock.isNative.mockReturnValue(true);
    capacitorMock.platform.mockReturnValue('android');
  });

  it('loads and applies generic sync objects through the native plugin', testNativePluginBridge);
});
