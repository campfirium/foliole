import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncBridgeMock = vi.hoisted(() => ({
  applyCompanionDesktopSyncPack: vi.fn(async () => ({ applied_blob_count: 2, applied_object_count: 3, to_state_seq: 8 })),
  loadCompanionMissingAttachmentResources: vi.fn(async () => [] as Array<{ attachment_id: string; content_hash: string; size_bytes?: number }>),
  loadCompanionMissingContentBlobs: vi.fn(async () => [] as Array<{ hash: string; size_bytes?: number }>),
  loadCompanionMissingContentBlobHashes: vi.fn(async () => [] as string[]),
  loadCompanionSyncPackCursor: vi.fn(async (): Promise<number | null> => null),
  saveCompanionSyncPackCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncPushAcks: vi.fn(async () => [] as string[]),
  syncCompanionContentBlob: vi.fn(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash }))
}));

const attachmentResourceMock = vi.hoisted(() => ({
  syncCompanionAttachmentResourceRequestsFromDesktop: vi.fn(async (
    _endpointUrl: string,
    requests: Array<{ attachmentId: string }>
  ) => requests.map((request) => request.attachmentId))
}));

const pairingMock = vi.hoisted(() => ({
  createSignedRequestHeaders: vi.fn(async ({ pathWithQuery }: { pathWithQuery: string }) => ({
    'X-Device-Id': 'android-test-device',
    'X-Signature': `signed:${pathWithQuery}`
  }))
}));

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
    desktopHttpRequest: vi.fn()
  }
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionDesktopAttachmentResources', () => attachmentResourceMock);
vi.mock('./companionWorkspacePairing', () => pairingMock);
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

async function testPullsStructurePackAndContentBlobs() {
  const bodyHash = 'a'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([{ hash: bodyHash, size_bytes: 1024 }])
    .mockResolvedValueOnce([]);
  const fetchMock = vi.fn(async () => ({ ok: true }));
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ acked_hashes: [bodyHash], status: 'ok' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result).toMatchObject({
    appliedPackBlobCount: 2,
    appliedPackObjectCount: 3,
    syncedContentBlobHashes: [bodyHash]
  });
  expect(syncBridgeMock.applyCompanionDesktopSyncPack).toHaveBeenCalledWith({
    headers: {
      'X-Device-Id': 'android-test-device',
      'X-Signature': 'signed:/companion/sync-pack?after_state_seq=0'
    },
    url: 'http://10.0.2.2:38641/companion/sync-pack?after_state_seq=0'
  });
  expect(syncBridgeMock.saveCompanionSyncPackCursor).toHaveBeenCalledWith(8);
  expect(syncBridgeMock.syncCompanionContentBlob).toHaveBeenCalledWith({
    hash: bodyHash,
    headers: {
      'X-Device-Id': 'android-test-device',
      'X-Signature': `signed:/companion/content-blob?hash=${bodyHash}`
    },
    url: `http://10.0.2.2:38641/companion/content-blob?hash=${bodyHash}`
  });
  expect(fetchMock).toHaveBeenCalledWith('http://10.0.2.2:38641/companion/content-blob/ack', {
    body: JSON.stringify({ hashes: [bodyHash] }),
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': 'android-test-device',
      'X-Signature': 'signed:/companion/content-blob/ack'
    },
    method: 'POST'
  });
}

async function testPullsMissingAttachmentResourcesAfterStructurePack() {
  syncBridgeMock.loadCompanionMissingAttachmentResources.mockResolvedValueOnce([
    { attachment_id: 'att-1', content_hash: 'hash-att-1', size_bytes: 2048 }
  ]);

  const { ATTACHMENT_RESOURCE_BATCH_LIMIT, syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const onProgress = vi.fn();
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', { onProgress });

  expect(syncBridgeMock.loadCompanionMissingAttachmentResources).toHaveBeenCalledWith(ATTACHMENT_RESOURCE_BATCH_LIMIT);
  expect(attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop).toHaveBeenCalledWith(
    'http://10.0.2.2:38641/',
    [{ attachmentId: 'att-1', contentHash: 'hash-att-1' }]
  );
  expect(result.syncedAttachmentIds).toEqual(['att-1']);
  expect(onProgress).toHaveBeenCalledWith({ completed: 0, completedBytes: 0, phase: 'attachment', total: null, totalBytes: null });
  expect(onProgress).toHaveBeenCalledWith({ completed: 1, completedBytes: 2048, phase: 'attachment', total: null, totalBytes: null });
}

async function testContinuesAttachmentCachingAcrossBoundedBatches() {
  const firstBatch = Array.from({ length: 64 }, (_, index) => ({
    attachment_id: `att-${index}`,
    content_hash: `hash-att-${index}`
  }));
  const secondBatch = [
    { attachment_id: 'att-64', content_hash: 'hash-att-64' },
    { attachment_id: 'att-65', content_hash: 'hash-att-65' }
  ];
  syncBridgeMock.loadCompanionMissingAttachmentResources
    .mockResolvedValueOnce(firstBatch)
    .mockResolvedValueOnce(secondBatch);

  const { ATTACHMENT_RESOURCE_BATCH_LIMIT, syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(syncBridgeMock.loadCompanionMissingAttachmentResources).toHaveBeenCalledTimes(2);
  expect(syncBridgeMock.loadCompanionMissingAttachmentResources).toHaveBeenCalledWith(ATTACHMENT_RESOURCE_BATCH_LIMIT);
  expect(attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop).toHaveBeenCalledTimes(2);
  expect(result.syncedAttachmentIds).toHaveLength(66);
}

async function testKeepsStructureSyncSuccessfulWhenAttachmentBatchFails() {
  syncBridgeMock.loadCompanionMissingAttachmentResources.mockResolvedValueOnce([
    { attachment_id: 'att-1', content_hash: 'hash-att-1', size_bytes: 2048 }
  ]);
  attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop.mockRejectedValueOnce(new Error('attachment unavailable'));

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.appliedPackObjectCount).toBe(3);
  expect(result.attachmentResourceError).toBe('attachment unavailable');
  expect(result.contentBlobError).toBeNull();
  expect(result.syncedAttachmentIds).toEqual([]);
}

async function testPullsTopicBodiesBeforeAttachmentResources() {
  const bodyHash = 'e'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([{ hash: bodyHash, size_bytes: 1024 }])
    .mockResolvedValueOnce([]);
  syncBridgeMock.loadCompanionMissingAttachmentResources.mockResolvedValueOnce([
    { attachment_id: 'att-1', content_hash: 'hash-att-1', size_bytes: 2048 }
  ]);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: [bodyHash], status: 'ok' }), { status: 200 })));

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(syncBridgeMock.loadCompanionMissingContentBlobs.mock.invocationCallOrder[0])
    .toBeLessThan(syncBridgeMock.loadCompanionMissingAttachmentResources.mock.invocationCallOrder[0]);
}

async function testRefreshesStructureBeforeContentBatchCompletes() {
  const hashes = Array.from({ length: 32 }, (_, index) => `${String(index % 10)}`.repeat(64));
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce(hashes.map((hash) => ({ hash })))
    .mockResolvedValueOnce([]);
  const onStructureSynced = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: [], status: 'ok' }), { status: 200 })));

  const { CONTENT_BLOB_BATCH_LIMIT, syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', { onStructureSynced });

  expect(onStructureSynced.mock.invocationCallOrder[0])
    .toBeLessThan(syncBridgeMock.loadCompanionMissingContentBlobs.mock.invocationCallOrder[0]);
  expect(syncBridgeMock.loadCompanionMissingContentBlobs).toHaveBeenCalledWith(CONTENT_BLOB_BATCH_LIMIT);
  expect(syncBridgeMock.syncCompanionContentBlob).toHaveBeenCalledTimes(hashes.length);
}

async function testContinuesContentCachingAcrossBoundedBatches() {
  const firstBatch = Array.from({ length: 64 }, (_, index) => index.toString(16).padStart(2, '0').repeat(32));
  const secondBatch = ['b'.repeat(64), 'c'.repeat(64)];
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce(firstBatch.map((hash) => ({ hash })))
    .mockResolvedValueOnce(secondBatch.map((hash) => ({ hash })));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: [], status: 'ok' }), { status: 200 })));

  const { CONTENT_BLOB_BATCH_LIMIT, syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(syncBridgeMock.loadCompanionMissingContentBlobs).toHaveBeenCalledTimes(2);
  expect(syncBridgeMock.loadCompanionMissingContentBlobs).toHaveBeenCalledWith(CONTENT_BLOB_BATCH_LIMIT);
  expect(syncBridgeMock.syncCompanionContentBlob).toHaveBeenCalledTimes(66);
  expect(result.syncedContentBlobHashes).toHaveLength(66);
}

async function testKeepsStructureSyncSuccessfulWhenContentBatchFails() {
  const bodyHash = 'c'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs.mockResolvedValueOnce([{ hash: bodyHash, size_bytes: 1024 }]);
  syncBridgeMock.syncCompanionContentBlob.mockRejectedValueOnce(new Error('blob unavailable'));
  vi.stubGlobal('fetch', vi.fn());

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.appliedPackObjectCount).toBe(3);
  expect(result.contentBlobError).toBe('blob unavailable');
  expect(result.syncedContentBlobHashes).toEqual([]);
}

async function testRoutesAckThroughNativeDesktopHttp() {
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  const bodyHash = 'b'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([{ hash: bodyHash, size_bytes: 1024 }])
    .mockResolvedValueOnce([]);
  capacitorMock.plugin.desktopHttpRequest.mockResolvedValue({
    body: JSON.stringify({ acked_hashes: [bodyHash], status: 'ok' }),
    status: 200
  });
  vi.stubGlobal('fetch', vi.fn());

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  await expect(syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/')).resolves.toMatchObject({
    syncedContentBlobHashes: [bodyHash]
  });

  expect(fetch).not.toHaveBeenCalled();
  expect(capacitorMock.plugin.desktopHttpRequest).toHaveBeenCalledWith({
    body: JSON.stringify({ hashes: [bodyHash] }),
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': 'android-test-device',
      'X-Signature': 'signed:/companion/content-blob/ack'
    },
    method: 'POST',
    url: 'http://10.0.2.2:38641/companion/content-blob/ack'
  });
}

async function testNoLegacyJsonStreams() {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result).toMatchObject({
    appliedNodeIds: [],
    appliedObjectIds: [],
    appliedReviewOpIds: [],
    changedObjectIds: [],
    pushedNodeIds: [],
    pushedObjectIds: [],
    pushedReviewOpIds: [],
    syncedAttachmentIds: []
  });
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-state'), expect.any(Object));
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-node-versions'), expect.any(Object));
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-review-log'), expect.any(Object));
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-objects'), expect.any(Object));
}

async function testFailsWhenStageNeverReturns() {
  vi.useFakeTimers();
  syncBridgeMock.applyCompanionDesktopSyncPack.mockReturnValue(new Promise(() => undefined));

  const {
    COMPANION_DESKTOP_SYNC_STEP_TIMEOUT_MS,
    syncCompanionObjectsFromDesktop
  } = await import('./companionDesktopSyncObjects');
  const sync = syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');
  const assertion = expect(sync).rejects.toThrow('Desktop sync timed out while applying the structure pack.');
  await vi.advanceTimersByTimeAsync(COMPANION_DESKTOP_SYNC_STEP_TIMEOUT_MS);

  await assertion;
  vi.useRealTimers();
}

async function testAllowsLongerContentCachingPass() {
  vi.useFakeTimers();
  const bodyHash = 'd'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([{ hash: bodyHash, size_bytes: 1024 }])
    .mockResolvedValueOnce([]);
  syncBridgeMock.syncCompanionContentBlob.mockImplementation(async ({ hash }: { hash: string }) => {
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    return { availability: 'cached', hash };
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: [bodyHash], status: 'ok' }), { status: 200 })));

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const sync = syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');
  await vi.advanceTimersByTimeAsync(61_000);

  await expect(sync).resolves.toMatchObject({
    contentBlobError: null,
    syncedContentBlobHashes: [bodyHash]
  });
  vi.useRealTimers();
}

describe('companion desktop sync objects', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    capacitorMock.getPlatform.mockReturnValue('web');
    capacitorMock.isNativePlatform.mockReturnValue(false);
    capacitorMock.plugin.desktopHttpRequest.mockReset();
    syncBridgeMock.applyCompanionDesktopSyncPack.mockResolvedValue({
      applied_blob_count: 2,
      applied_object_count: 3,
      to_state_seq: 8
    });
    syncBridgeMock.loadCompanionMissingContentBlobHashes.mockResolvedValue([]);
    syncBridgeMock.loadCompanionMissingContentBlobs.mockResolvedValue([]);
    syncBridgeMock.loadCompanionMissingAttachmentResources.mockResolvedValue([]);
    syncBridgeMock.loadCompanionSyncPackCursor.mockResolvedValue(null);
    syncBridgeMock.saveCompanionSyncPackCursor.mockImplementation(async (cursor: number | null) => cursor);
    syncBridgeMock.syncCompanionContentBlob.mockImplementation(async ({ hash }: { hash: string }) => ({
      availability: 'cached',
      hash
    }));
    attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop.mockImplementation(async (
      _endpointUrl: string,
      requests: Array<{ attachmentId: string }>
    ) => requests.map((request) => request.attachmentId));
    pairingMock.createSignedRequestHeaders.mockImplementation(async ({ pathWithQuery }: { pathWithQuery: string }) => ({
      'X-Device-Id': 'android-test-device',
      'X-Signature': `signed:${pathWithQuery}`
    }));
  });

  it('pulls the structure pack and missing content blobs from desktop', testPullsStructurePackAndContentBlobs);

  it('pulls missing attachment resources from desktop after structure sync', testPullsMissingAttachmentResourcesAfterStructurePack);

  it('continues attachment resource caching across bounded batches', testContinuesAttachmentCachingAcrossBoundedBatches);

  it('keeps structure sync successful when attachment resource caching fails', testKeepsStructureSyncSuccessfulWhenAttachmentBatchFails);

  it('pulls topic bodies before attachment resources', testPullsTopicBodiesBeforeAttachmentResources);

  it('refreshes structure before running bounded content blob batches', testRefreshesStructureBeforeContentBatchCompletes);

  it('continues content caching across bounded batches', testContinuesContentCachingAcrossBoundedBatches);

  it('keeps structure sync successful when content blob caching fails', testKeepsStructureSyncSuccessfulWhenContentBatchFails);

  it('routes content blob acknowledgements through native desktop HTTP on Android', testRoutesAckThroughNativeDesktopHttp);

  it('does not run legacy JSON state, topic, or review streams on the normal pull path', testNoLegacyJsonStreams);

  it('fails instead of staying in sync when a desktop sync stage never returns', testFailsWhenStageNeverReturns);

  it('allows a resource caching pass to run longer than the structure timeout', testAllowsLongerContentCachingPass);
});
