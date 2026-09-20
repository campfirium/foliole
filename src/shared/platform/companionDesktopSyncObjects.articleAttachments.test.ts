import { beforeEach, expect, it } from 'vitest';

import {
  articleNeedsMock, attachmentResolutionMock, attachmentResourceMock,
  resetCompanionDesktopSyncMocks, syncBridgeMock
} from './companionDesktopSyncObjects.testHarness';

const endpoint = 'http://10.0.2.2:38641/';
const image = { attachment_id: 'a'.repeat(64), content_hash: 'a'.repeat(64), storage_key: `${'a'.repeat(64)}.png` };
beforeEach(resetCompanionDesktopSyncMocks);

it('does not enumerate or request attachments without article events, including resources-only continuation', async () => {
  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  articleNeedsMock.mockResolvedValue([image]);
  syncBridgeMock.applyCompanionDesktopSyncPack.mockResolvedValue({ applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 });
  await syncCompanionObjectsFromDesktop(endpoint);
  await syncCompanionObjectsFromDesktop(endpoint, { resourcesOnly: true });
  expect(articleNeedsMock).not.toHaveBeenCalled();
  expect(attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop).not.toHaveBeenCalled();
  expect(syncBridgeMock.loadCompanionMissingAttachmentResources).not.toHaveBeenCalled();
});

it('checks actual local files instead of requesting every participating reference', async () => {
  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  articleNeedsMock.mockResolvedValue([image]);
  attachmentResolutionMock.resolveRuntimeAttachmentResource.mockResolvedValue({ status: 'ready' });
  const result = await syncCompanionObjectsFromDesktop(endpoint);
  expect(attachmentResolutionMock.resolveRuntimeAttachmentResource).toHaveBeenCalledWith(`asset://${image.storage_key}`, { refresh: true });
  expect(attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop).not.toHaveBeenCalled();
  expect(result.syncedAttachmentIds).toEqual([]);
});

it('retries a missing file only when an article participates again', async () => {
  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  articleNeedsMock.mockResolvedValue([image]);
  attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop.mockResolvedValue([]);
  const first = await syncCompanionObjectsFromDesktop(endpoint);
  expect(first.appliedPackObjectCount).toBe(3);
  expect(first.remainingAttachmentResourceCount).toBe(1);
  await syncCompanionObjectsFromDesktop(endpoint, { resourcesOnly: true });
  expect(attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop).toHaveBeenCalledTimes(1);
  await syncCompanionObjectsFromDesktop(endpoint);
  expect(attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop).toHaveBeenCalledTimes(2);
});
