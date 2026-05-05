import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachmentResolutionMock,
  attachmentResourceMock,
  capacitorMock,
  diagnosticsMock,
  resetCompanionDesktopSyncMocks,
  syncBridgeMock
} from './companionDesktopSyncObjects.testHarness';

async function testPullsContentBlobs() {
  const bodyHash = 'a'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([{ hash: bodyHash, size_bytes: 1024 }])
    .mockResolvedValueOnce([]);
  const fetchMock = vi.fn(async () => ({ ok: true }));
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ acked_hashes: [bodyHash], status: 'ok' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.syncedContentBlobHashes).toEqual([bodyHash]);
  expect(syncBridgeMock.syncCompanionContentBlob).toHaveBeenCalledWith({
    hash: bodyHash,
    headers: {
      'X-Device-Id': 'android-test-device',
      'X-Signature': `signed:/companion/content-blob?hash=${bodyHash}`
    },
    url: `http://10.0.2.2:38641/companion/content-blob?hash=${bodyHash}`
  });
  expect(fetchMock).toHaveBeenCalledWith('http://10.0.2.2:38641/companion/content-blob/ack', expect.any(Object));
}

async function testReportsContentProgressAfterEachConcurrentChunk() {
  const { CONTENT_BLOB_CONCURRENT_FETCH_LIMIT } = await import('./companionDesktopSyncResources');
  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const hashes = Array.from({ length: CONTENT_BLOB_CONCURRENT_FETCH_LIMIT + 1 }, (_, index) => `${index}`.padStart(64, '0'));
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce(hashes.map((hash) => ({ hash, size_bytes: 2 })))
    .mockResolvedValueOnce([]);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: hashes, status: 'ok' }), { status: 200 })));
  const onProgress = vi.fn();

  await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', { onProgress });

  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
    completed: CONTENT_BLOB_CONCURRENT_FETCH_LIMIT,
    completedBytes: CONTENT_BLOB_CONCURRENT_FETCH_LIMIT * 2,
    phase: 'content'
  }));
  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
    completed: CONTENT_BLOB_CONCURRENT_FETCH_LIMIT + 1,
    completedBytes: (CONTENT_BLOB_CONCURRENT_FETCH_LIMIT + 1) * 2,
    phase: 'content'
  }));
}

async function testPullsAttachmentResources() {
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
  expect(attachmentResolutionMock.invalidateAttachmentResourceResolution).toHaveBeenCalledWith('att-1');
  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
    completed: 1,
    completedBytes: 2048,
    phase: 'attachment',
    total: null,
    totalBytes: null
  }));
}

async function testReportsAttachmentBreakdown() {
  syncBridgeMock.loadCompanionMissingAttachmentResources.mockResolvedValueOnce([
    { attachment_id: 'att-1', content_hash: 'hash-att-1', size_bytes: 2048 }
  ]);
  diagnosticsMock.loadLocalSyncDiagnostics
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
      content: {
        missing_active_topic_attachment_resource_count: 1,
        missing_attachment_resource_bytes: 8192,
        missing_attachment_resource_count: 4,
        missing_due_review_attachment_resource_count: 2,
        missing_image_attachment_resource_bytes: 2048,
        missing_image_attachment_resource_count: 1,
        missing_other_attachment_resource_bytes: 4096,
        missing_other_attachment_resource_count: 2,
        missing_pdf_attachment_resource_bytes: 2048,
        missing_pdf_attachment_resource_count: 1
      },
      sync_state: { local_dirty_count: 0, pending_ack_count: 0, push_issue_count: 0 }
    })
    .mockResolvedValueOnce(null);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const onProgress = vi.fn();
  await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', { onProgress });

  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
    attachmentBreakdown: {
      activeTopicAttachments: 1,
      dueReviewAttachments: 2,
      imageAttachments: 1,
      imageBytes: 2048,
      otherAttachments: 2,
      otherBytes: 4096,
      pdfAttachments: 1,
      pdfBytes: 2048
    },
    completed: 0,
    completedBytes: 0,
    phase: 'attachment',
    total: 4,
    totalBytes: 8192
  }));
}

async function testPullsBodiesBeforeAttachments() {
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

async function testRefreshesStructureBeforeContentBatch() {
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
}

async function testStopsContentPassAtResourceBudget() {
  const { COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS } = await import('./companionDesktopSyncResources');
  const { CONTENT_BLOB_BATCH_LIMIT, syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const hashes = Array.from({ length: CONTENT_BLOB_BATCH_LIMIT }, (_, index) => `${index}`.padStart(64, '0'));
  let now = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  syncBridgeMock.loadCompanionMissingContentBlobs.mockResolvedValue(hashes.map((hash) => ({ hash, size_bytes: 1 })));
  syncBridgeMock.syncCompanionContentBlob.mockImplementation(async ({ hash }: { hash: string }) => {
    now = COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS + 1;
    return { availability: 'cached', hash };
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: hashes, status: 'ok' }), { status: 200 })));

  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.contentBlobError).toBeNull();
  expect(result.syncedContentBlobHashes).toHaveLength(CONTENT_BLOB_BATCH_LIMIT);
  expect(syncBridgeMock.loadCompanionMissingContentBlobs).toHaveBeenCalledTimes(1);
}

async function testStopsAttachmentPassAtResourceBudget() {
  const { COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS } = await import('./companionDesktopSyncResources');
  const { ATTACHMENT_RESOURCE_BATCH_LIMIT, syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const resources = Array.from({ length: ATTACHMENT_RESOURCE_BATCH_LIMIT }, (_, index) => ({
    attachment_id: `att-${index}`,
    content_hash: `hash-att-${index}`,
    size_bytes: 1
  }));
  let now = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  syncBridgeMock.loadCompanionMissingAttachmentResources.mockResolvedValue(resources);
  attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop.mockImplementation(async (
    _endpointUrl: string,
    requests: Array<{ attachmentId: string }>
  ) => {
    now = COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS + 1;
    return requests.map((request) => request.attachmentId);
  });

  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.attachmentResourceError).toBeNull();
  expect(result.syncedAttachmentIds).toHaveLength(ATTACHMENT_RESOURCE_BATCH_LIMIT);
  expect(syncBridgeMock.loadCompanionMissingAttachmentResources).toHaveBeenCalledTimes(1);
}

async function testRoutesAckThroughNativeHttp() {
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
  expect(capacitorMock.plugin.desktopHttpRequest).toHaveBeenCalledWith(expect.objectContaining({
    method: 'POST',
    url: 'http://10.0.2.2:38641/companion/content-blob/ack'
  }));
}

describe('companion desktop sync resources', () => {
  beforeEach(resetCompanionDesktopSyncMocks);

  it('pulls missing content blobs from desktop', testPullsContentBlobs);

  it('reports missing content blob progress after each concurrent chunk', testReportsContentProgressAfterEachConcurrentChunk);

  it('pulls missing attachment resources after structure sync', testPullsAttachmentResources);

  it('reports attachment resource breakdown in sync progress', testReportsAttachmentBreakdown);

  it('pulls topic bodies before attachment resources', testPullsBodiesBeforeAttachments);

  it('refreshes structure before running bounded content blob batches', testRefreshesStructureBeforeContentBatch);

  it('stops a content body pass at the resource time budget without failing sync', testStopsContentPassAtResourceBudget);

  it('stops an attachment pass at the resource time budget without failing sync', testStopsAttachmentPassAtResourceBudget);

  it('routes content blob acknowledgements through native desktop HTTP on Android', testRoutesAckThroughNativeHttp);
});
