import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachmentResourceMock,
  resetCompanionDesktopSyncMocks,
  syncBridgeMock
} from './companionDesktopSyncObjects.testHarness';

async function testContinuesContentBatchAfterSingleBodyFailure() {
  const failedHash = 'c'.repeat(64);
  const cachedHash = 'd'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([
      { hash: failedHash, size_bytes: 1024 },
      { hash: cachedHash, size_bytes: 2048 }
    ])
    .mockResolvedValueOnce([]);
  syncBridgeMock.syncCompanionContentBlob.mockImplementation(async ({ hash }: { hash: string }) => {
    if (hash === failedHash) throw new Error('Desktop returned 404.');
    return { availability: 'cached', hash };
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: [cachedHash], status: 'ok' }), { status: 200 })));

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.contentBlobError).toBeNull();
  expect(result.syncedContentBlobHashes).toEqual([cachedHash]);
  expect(fetch).toHaveBeenCalledWith('http://10.0.2.2:38641/companion/content-blob/ack', expect.any(Object));
}

async function testKeepsEarlierContentWhenLaterBatchFails() {
  const { CONTENT_BLOB_BATCH_LIMIT, syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const cachedHashes = Array.from({ length: CONTENT_BLOB_BATCH_LIMIT }, (_, index) => `${index}`.padStart(64, '0'));
  const failedHash = 'f'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce(cachedHashes.map((hash) => ({ hash, size_bytes: 1 })))
    .mockResolvedValueOnce([{ hash: failedHash, size_bytes: 1024 }]);
  syncBridgeMock.syncCompanionContentBlob.mockImplementation(async ({ hash }: { hash: string }) => {
    if (hash === failedHash) throw new Error('Desktop returned 404.');
    return { availability: 'cached', hash };
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: cachedHashes, status: 'ok' }), { status: 200 })));

  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.contentBlobError).toBeNull();
  expect(result.syncedContentBlobHashes).toEqual(cachedHashes);
  expect(result.syncedContentBlobBytes).toBe(CONTENT_BLOB_BATCH_LIMIT);
}

async function testAcknowledgesContentBodyBatchOnce() {
  const firstHash = '1'.repeat(64);
  const secondHash = '2'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([
      { hash: firstHash, size_bytes: 1024 },
      { hash: secondHash, size_bytes: 2048 }
    ])
    .mockResolvedValueOnce([]);
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ acked_hashes: [firstHash, secondHash], status: 'ok' }), { status: 200 })
  );
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.syncedContentBlobHashes).toEqual([firstHash, secondHash]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ hashes: [firstHash, secondHash] });
}

async function testKeepsDownloadedContentWhenAckFails() {
  const bodyHash = '3'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([{ hash: bodyHash, size_bytes: 1024 }])
    .mockResolvedValueOnce([]);
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('Desktop ack failed.');
  }));

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.contentBlobError).toBeNull();
  expect(result.syncedContentBlobHashes).toEqual([bodyHash]);
  expect(result.syncedContentBlobBytes).toBe(1024);
}

async function testFailsContentStageWhenWholeBodyBatchFails() {
  const failedHash = 'f'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs.mockResolvedValueOnce([{ hash: failedHash, size_bytes: 1024 }]);
  syncBridgeMock.syncCompanionContentBlob.mockRejectedValue(new Error('Desktop returned 404.'));

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.contentBlobError).toBe('Topic body batch could not download any requested body.');
  expect(result.syncedContentBlobHashes).toEqual([]);
}

async function testKeepsEarlierAttachmentsWhenLaterBatchFails() {
  const { ATTACHMENT_RESOURCE_BATCH_LIMIT, syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const resources = Array.from({ length: ATTACHMENT_RESOURCE_BATCH_LIMIT }, (_, index) => ({
    attachment_id: `att-${index}`,
    content_hash: `hash-att-${index}`,
    size_bytes: 1
  }));
  syncBridgeMock.loadCompanionMissingAttachmentResources
    .mockResolvedValueOnce(resources)
    .mockResolvedValueOnce([{ attachment_id: 'att-fail', content_hash: 'hash-fail', size_bytes: 1024 }]);
  attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop.mockImplementation(async (
    _endpointUrl: string,
    requests: Array<{ attachmentId: string }>,
    onSyncedChunk?: (attachmentIds: string[]) => void
  ) => {
    if (requests[0]?.attachmentId === 'att-fail') throw new Error('Attachment batch could not download any requested file.');
    const syncedIds = requests.map((request) => request.attachmentId);
    onSyncedChunk?.(syncedIds);
    return syncedIds;
  });

  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.attachmentResourceError).toBeNull();
  expect(result.syncedAttachmentIds).toHaveLength(ATTACHMENT_RESOURCE_BATCH_LIMIT);
  expect(result.syncedAttachmentResourceBytes).toBe(ATTACHMENT_RESOURCE_BATCH_LIMIT);
}

async function testFailsAttachmentStageWhenWholeBatchReturnsEmpty() {
  syncBridgeMock.loadCompanionMissingAttachmentResources.mockResolvedValueOnce([
    { attachment_id: 'att-fail', content_hash: 'hash-fail', size_bytes: 1024 }
  ]);
  attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop.mockResolvedValue([]);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.attachmentResourceError).toBe('Attachment file batch could not download any requested file.');
  expect(result.syncedAttachmentIds).toEqual([]);
}

describe('companion desktop sync resource failures', () => {
  beforeEach(() => {
    resetCompanionDesktopSyncMocks();
    syncBridgeMock.syncCompanionContentBlobs.mockRejectedValue(new Error('Batch endpoint unavailable.'));
  });

  it('continues a content body batch after one body fails', testContinuesContentBatchAfterSingleBodyFailure);
  it('keeps earlier content bodies when a later batch fails', testKeepsEarlierContentWhenLaterBatchFails);
  it('acknowledges a content body batch with one desktop request', testAcknowledgesContentBodyBatchOnce);
  it('keeps downloaded content bodies when the ack request fails', testKeepsDownloadedContentWhenAckFails);
  it('fails the content body stage when a whole batch cannot cache anything', testFailsContentStageWhenWholeBodyBatchFails);
  it('keeps earlier attachments when a later batch fails', testKeepsEarlierAttachmentsWhenLaterBatchFails);
  it('fails the attachment stage when a whole batch returns empty', testFailsAttachmentStageWhenWholeBatchReturnsEmpty);
});
