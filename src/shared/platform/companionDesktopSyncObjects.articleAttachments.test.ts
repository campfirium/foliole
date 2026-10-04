import { beforeEach, expect, it } from 'vitest';

import {
  articleNeedsMock, articleUnreadableMock, attachmentResolutionMock, attachmentResourceMock,
  resetCompanionDesktopSyncMocks, resourceArticleQueueMock
} from './companionDesktopSyncObjects.testHarness';

const endpoint = 'http://10.0.2.2:38641/';
const image = { attachment_id: 'a'.repeat(64), content_hash: 'a'.repeat(64), storage_key: `${'a'.repeat(64)}.png` };
beforeEach(resetCompanionDesktopSyncMocks);

it('does not enumerate or request attachments without queued article demand', async () => {
  const { pullResourceStages } = await import('./companionDesktopSyncResourceStages');
  resourceArticleQueueMock.pending = [];
  articleNeedsMock.mockResolvedValue([image]);
  await pullResourceStages(endpoint, undefined, [], 'desktop-test-device');
  await pullResourceStages(endpoint, undefined, [], 'desktop-test-device');
  expect(articleNeedsMock).not.toHaveBeenCalled();
  expect(attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop).not.toHaveBeenCalled();
});

it('checks actual local files instead of requesting every participating reference', async () => {
  const { pullResourceStages } = await import('./companionDesktopSyncResourceStages');
  articleNeedsMock.mockResolvedValue([image]);
  attachmentResolutionMock.resolveRuntimeAttachmentResource.mockResolvedValue({ status: 'ready' });
  const result = await pullResourceStages(endpoint, undefined, [], 'desktop-test-device');
  expect(attachmentResolutionMock.resolveRuntimeAttachmentResource).toHaveBeenCalledWith(`asset://${image.storage_key}`, { refresh: true });
  expect(attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop).not.toHaveBeenCalled();
  expect(result.syncedAttachmentIds).toEqual([]);
});

it('retries a missing file from the retained article queue across resource passes', async () => {
  const { pullResourceStages } = await import('./companionDesktopSyncResourceStages');
  articleNeedsMock.mockResolvedValue([image]);
  attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop.mockResolvedValue([]);
  const first = await pullResourceStages(endpoint, undefined, [], 'desktop-test-device');
  expect(resourceArticleQueueMock.pending).toEqual(['article']);
  expect(first.remainingAttachmentResourceCount).toBe(1);
  await pullResourceStages(endpoint, undefined, [], 'desktop-test-device');
  expect(attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop).toHaveBeenCalledTimes(2);
  await pullResourceStages(endpoint, undefined, [], 'desktop-test-device');
  expect(attachmentResourceMock.syncCompanionAttachmentResourceRequestsFromDesktop).toHaveBeenCalledTimes(3);
});

it('retains an article until its body can be read for attachment discovery', async () => {
  const { pullResourceStages } = await import('./companionDesktopSyncResourceStages');
  articleUnreadableMock.mockResolvedValueOnce(['article']);
  const first = await pullResourceStages(endpoint, undefined, [], 'desktop-test-device');
  expect(first.remainingAttachmentResourceCount).toBe(1);
  expect(resourceArticleQueueMock.pending).toEqual(['article']);

  await pullResourceStages(endpoint, undefined, [], 'desktop-test-device');
  expect(resourceArticleQueueMock.pending).toEqual([]);
});
