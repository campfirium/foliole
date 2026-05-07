import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachmentResourceMock,
  resetCompanionDesktopSyncMocks,
  syncBridgeMock
} from './companionDesktopSyncObjects.testHarness';

async function testStopsContentPassAtResourceBudget() {
  const { COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS } = await import('./companionDesktopSyncResources');
  const { CONTENT_BLOB_BATCH_LIMIT, syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const hashes = Array.from({ length: CONTENT_BLOB_BATCH_LIMIT }, (_, index) => `${index}`.padStart(64, '0'));
  let now = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  syncBridgeMock.loadCompanionMissingContentBlobs.mockResolvedValue(hashes.map((hash) => ({ hash, size_bytes: 1 })));
  syncBridgeMock.syncCompanionContentBlobs.mockImplementation(async ({ body }: { body: string }) => {
    now = COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS + 1;
    return { synced_hashes: JSON.parse(body).hashes as string[] };
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: hashes, status: 'ok' }), { status: 200 })));

  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.contentBlobError).toBeNull();
  expect(result.syncedContentBlobHashes).toHaveLength(CONTENT_BLOB_BATCH_LIMIT);
  expect(syncBridgeMock.loadCompanionMissingContentBlobs).toHaveBeenCalledTimes(2);
  expect(syncBridgeMock.loadCompanionMissingAttachmentResources).not.toHaveBeenCalled();
}

async function testDefersAttachmentsUntilContentBacklogClears() {
  const { COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS } = await import('./companionDesktopSyncResources');
  const { CONTENT_BLOB_BATCH_LIMIT, syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const hashes = Array.from({ length: CONTENT_BLOB_BATCH_LIMIT }, (_, index) => `${index}`.padStart(64, '0'));
  let now = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  syncBridgeMock.loadCompanionMissingContentBlobs.mockResolvedValue(hashes.map((hash) => ({ hash, size_bytes: 1 })));
  syncBridgeMock.syncCompanionContentBlobs.mockImplementation(async ({ body }: { body: string }) => {
    now = COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS + 1;
    return { synced_hashes: JSON.parse(body).hashes as string[] };
  });
  syncBridgeMock.loadCompanionMissingAttachmentResources.mockResolvedValueOnce([
    { attachment_id: 'att-1', content_hash: 'hash-att-1', size_bytes: 2048 }
  ]);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: hashes, status: 'ok' }), { status: 200 })));

  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.syncedContentBlobHashes).toHaveLength(CONTENT_BLOB_BATCH_LIMIT);
  expect(result.syncedAttachmentIds).toEqual([]);
  expect(result.attachmentResourceError).toBeNull();
  expect(syncBridgeMock.loadCompanionMissingAttachmentResources).not.toHaveBeenCalled();
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
    requests: Array<{ attachmentId: string }>,
    onSyncedChunk?: (attachmentIds: string[]) => void
  ) => {
    now = COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS + 1;
    const syncedIds = requests.map((request) => request.attachmentId);
    onSyncedChunk?.(syncedIds);
    return syncedIds;
  });

  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.attachmentResourceError).toBeNull();
  expect(result.syncedAttachmentIds).toHaveLength(ATTACHMENT_RESOURCE_BATCH_LIMIT);
  expect(syncBridgeMock.loadCompanionMissingAttachmentResources).toHaveBeenCalledTimes(1);
}

describe('companion desktop sync resource stages', () => {
  beforeEach(resetCompanionDesktopSyncMocks);

  it('stops a content body pass at the resource time budget without failing sync', testStopsContentPassAtResourceBudget);

  it('defers attachment resources while the topic body backlog remains', testDefersAttachmentsUntilContentBacklogClears);

  it('stops an attachment pass at the resource time budget without failing sync', testStopsAttachmentPassAtResourceBudget);
});
