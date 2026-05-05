import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncBridgeMock = vi.hoisted(() => ({
  applyCompanionDesktopSyncPack: vi.fn(async () => ({ applied_blob_count: 2, applied_object_count: 3, to_state_seq: 8 })),
  loadCompanionMissingContentBlobHashes: vi.fn(async () => [] as string[]),
  loadCompanionSyncPackCursor: vi.fn(async (): Promise<number | null> => null),
  saveCompanionSyncPackCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncPushAcks: vi.fn(async () => [] as string[]),
  syncCompanionContentBlob: vi.fn(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash }))
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
  syncBridgeMock.loadCompanionMissingContentBlobHashes
    .mockResolvedValueOnce([bodyHash])
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

async function testRefreshesStructureBeforeContentBatchCompletes() {
  const hashes = Array.from({ length: 32 }, (_, index) => `${String(index % 10)}`.repeat(64));
  syncBridgeMock.loadCompanionMissingContentBlobHashes
    .mockResolvedValueOnce(hashes)
    .mockResolvedValueOnce([]);
  const onStructureSynced = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: [], status: 'ok' }), { status: 200 })));

  const { CONTENT_BLOB_BATCH_LIMIT, syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', { onStructureSynced });

  expect(onStructureSynced.mock.invocationCallOrder[0])
    .toBeLessThan(syncBridgeMock.loadCompanionMissingContentBlobHashes.mock.invocationCallOrder[0]);
  expect(syncBridgeMock.loadCompanionMissingContentBlobHashes).toHaveBeenCalledWith(CONTENT_BLOB_BATCH_LIMIT);
  expect(syncBridgeMock.syncCompanionContentBlob).toHaveBeenCalledTimes(hashes.length);
}

async function testContinuesContentCachingAcrossBoundedBatches() {
  const firstBatch = Array.from({ length: 64 }, (_, index) => index.toString(16).padStart(2, '0').repeat(32));
  const secondBatch = ['b'.repeat(64), 'c'.repeat(64)];
  syncBridgeMock.loadCompanionMissingContentBlobHashes
    .mockResolvedValueOnce(firstBatch)
    .mockResolvedValueOnce(secondBatch);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: [], status: 'ok' }), { status: 200 })));

  const { CONTENT_BLOB_BATCH_LIMIT, syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(syncBridgeMock.loadCompanionMissingContentBlobHashes).toHaveBeenCalledTimes(2);
  expect(syncBridgeMock.loadCompanionMissingContentBlobHashes).toHaveBeenCalledWith(CONTENT_BLOB_BATCH_LIMIT);
  expect(syncBridgeMock.syncCompanionContentBlob).toHaveBeenCalledTimes(66);
  expect(result.syncedContentBlobHashes).toHaveLength(66);
}

async function testKeepsStructureSyncSuccessfulWhenContentBatchFails() {
  const bodyHash = 'c'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobHashes.mockResolvedValueOnce([bodyHash]);
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
  syncBridgeMock.loadCompanionMissingContentBlobHashes
    .mockResolvedValueOnce([bodyHash])
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
    syncBridgeMock.loadCompanionSyncPackCursor.mockResolvedValue(null);
    syncBridgeMock.saveCompanionSyncPackCursor.mockImplementation(async (cursor: number | null) => cursor);
    syncBridgeMock.syncCompanionContentBlob.mockImplementation(async ({ hash }: { hash: string }) => ({
      availability: 'cached',
      hash
    }));
    pairingMock.createSignedRequestHeaders.mockImplementation(async ({ pathWithQuery }: { pathWithQuery: string }) => ({
      'X-Device-Id': 'android-test-device',
      'X-Signature': `signed:${pathWithQuery}`
    }));
  });

  it('pulls the structure pack and missing content blobs from desktop', testPullsStructurePackAndContentBlobs);

  it('refreshes structure before running bounded content blob batches', testRefreshesStructureBeforeContentBatchCompletes);

  it('continues content caching across bounded batches', testContinuesContentCachingAcrossBoundedBatches);

  it('keeps structure sync successful when content blob caching fails', testKeepsStructureSyncSuccessfulWhenContentBatchFails);

  it('routes content blob acknowledgements through native desktop HTTP on Android', testRoutesAckThroughNativeDesktopHttp);

  it('does not run legacy JSON state, topic, or review streams on the normal pull path', testNoLegacyJsonStreams);

  it('fails instead of staying in sync when a desktop sync stage never returns', testFailsWhenStageNeverReturns);
});
