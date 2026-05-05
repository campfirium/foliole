import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachmentResourceMock,
  resetCompanionDesktopSyncMocks,
  syncBridgeMock
} from './companionDesktopSyncObjects.testHarness';

async function testReportsContentProgressAfterEachConcurrentChunk() {
  const { CONTENT_BLOB_CONCURRENT_FETCH_LIMIT } = await import('./companionDesktopSyncResources');
  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const hashes = Array.from({ length: CONTENT_BLOB_CONCURRENT_FETCH_LIMIT + 1 }, (_, index) => `${index}`.padStart(64, '0'));
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce(hashes.map((hash) => ({ hash, size_bytes: 2 })))
    .mockResolvedValueOnce([]);
  syncBridgeMock.syncCompanionContentBlobs.mockRejectedValueOnce(new Error('batch unavailable'));
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

async function testReportsAttachmentProgressAfterEachConcurrentChunk() {
  const { ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT } = await import('./companionDesktopAttachmentResources');
  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const resources = Array.from({ length: ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT + 1 }, (_, index) => ({
    attachment_id: `att-${index}`,
    content_hash: `hash-att-${index}`,
    size_bytes: 3
  }));
  syncBridgeMock.loadCompanionMissingAttachmentResources
    .mockResolvedValueOnce(resources)
    .mockResolvedValueOnce([]);
  attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop.mockImplementationOnce(async (
    _endpointUrl: string,
    requests: Array<{ attachmentId: string }>,
    onSyncedChunk?: (attachmentIds: string[]) => void
  ) => {
    const firstChunk = requests.slice(0, ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT).map((request) => request.attachmentId);
    const secondChunk = requests.slice(ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT).map((request) => request.attachmentId);
    onSyncedChunk?.(firstChunk);
    onSyncedChunk?.(secondChunk);
    return [...firstChunk, ...secondChunk];
  });
  const onProgress = vi.fn();

  await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', { onProgress });

  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
    completed: ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT,
    completedBytes: ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT * 3,
    phase: 'attachment'
  }));
  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
    completed: ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT + 1,
    completedBytes: (ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT + 1) * 3,
    phase: 'attachment'
  }));
}

describe('companion desktop sync resource progress', () => {
  beforeEach(resetCompanionDesktopSyncMocks);

  it('reports missing content blob progress after each concurrent chunk', testReportsContentProgressAfterEachConcurrentChunk);

  it('reports missing attachment resource progress after each concurrent chunk', testReportsAttachmentProgressAfterEachConcurrentChunk);
});
