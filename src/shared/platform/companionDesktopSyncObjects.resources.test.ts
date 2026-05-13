import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachmentResolutionMock,
  attachmentResourceMock,
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
  expect(syncBridgeMock.syncCompanionContentBlobs).toHaveBeenCalledWith({
    body: JSON.stringify({ hashes: [bodyHash] }),
    headers: {
      'X-Device-Id': 'android-test-device',
      'X-Signature': 'signed:/companion/content-blobs'
    },
    url: 'http://10.0.2.2:38641/companion/content-blobs'
  });
  expect(fetchMock).toHaveBeenCalledWith('http://10.0.2.2:38641/companion/content-blob/ack', expect.any(Object));
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
    [{ attachmentId: 'att-1', contentHash: 'hash-att-1' }],
    expect.any(Function)
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

async function testReportsContentBreakdown() {
  const bodyHash = 'b'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([{ hash: bodyHash, size_bytes: 1024 }])
    .mockResolvedValueOnce([]);
  diagnosticsMock.loadLocalSyncDiagnostics
    .mockResolvedValueOnce({
      content: {
        missing_active_topic_body_count: 1,
        missing_content_blob_bytes: 3072,
        missing_content_blob_count: 3,
        missing_due_review_body_count: 1,
        missing_external_document_body_count: 1,
        missing_nested_topic_body_count: 1,
        missing_top_level_topic_body_count: 1,
        missing_topic_body_count: 2
      },
      sync_state: { local_dirty_count: 0, pending_ack_count: 0, push_issue_count: 0 }
    })
    .mockResolvedValueOnce(null);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: [bodyHash], status: 'ok' }), { status: 200 })));

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const onProgress = vi.fn();
  await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', { onProgress });

  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
    contentBreakdown: {
      activeTopicBodies: 1,
      dueReviewBodies: 1,
      externalDocumentBodies: 1,
      nestedTopicBodies: 1,
      topLevelTopicBodies: 1,
      topicBodies: 2
    },
    completed: 0,
    completedBytes: 0,
    phase: 'content',
    total: 3,
    totalBytes: 3072
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

  expect(syncBridgeMock.loadCompanionMissingContentBlobs.mock.invocationCallOrder[0]!)
    .toBeLessThan(syncBridgeMock.loadCompanionMissingAttachmentResources.mock.invocationCallOrder[0]!);
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

  expect(onStructureSynced.mock.invocationCallOrder[0]!)
    .toBeLessThan(syncBridgeMock.loadCompanionMissingContentBlobs.mock.invocationCallOrder[0]!);
  expect(syncBridgeMock.loadCompanionMissingContentBlobs).toHaveBeenCalledWith(CONTENT_BLOB_BATCH_LIMIT);
}

describe('companion desktop sync resources', () => {
  beforeEach(resetCompanionDesktopSyncMocks);

  it('pulls missing content blobs from desktop', testPullsContentBlobs);

  it('pulls missing attachment resources after structure sync', testPullsAttachmentResources);

  it('reports attachment resource breakdown in sync progress', testReportsAttachmentBreakdown);

  it('reports topic and external document body breakdown in sync progress', testReportsContentBreakdown);

  it('starts topic body resource work before attachment resource work', testPullsBodiesBeforeAttachments);

  it('refreshes structure before running bounded content blob batches', testRefreshesStructureBeforeContentBatch);

});
