import { enqueueSyncIdentityResourceScanPage } from '../../../../../lib/core/sync/syncPackResourceArticles.js';
import { loadCompanionMissingContentBlobBatch } from '../../companionContentBlobSync';
import { createEmptyResourceStages, pullResourceStages } from '../../companionDesktopSyncResourceStages';
import type { CompanionDesktopSyncOptions } from '../../companionDesktopSyncTypes';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { verifyCompanionSyncIdentityBlobBytes } from './syncGroupIdentityBlobIntegrity';

/** Check current resource references even when every identity fingerprint is equal. */
export async function drainCompanionSyncIdentityResources(args: {
  endpointUrl: string; groupId: string; peerId: string;
  onProgress?: CompanionDesktopSyncOptions['onProgress'];
}) {
  let afterId = '';
  for (;;) {
    const next = await runCompanionSyncWriterTask(() =>
      getIosCompanionDatabaseOwner().runWriter((port) =>
        enqueueSyncIdentityResourceScanPage(port, {
          groupId: args.groupId, peerId: args.peerId, afterId })));
    if (!next) break;
    afterId = next;
  }
  let syncedCount = 0;
  let stages: Awaited<ReturnType<typeof pullResourceStages>> = createEmptyResourceStages();
  for (;;) {
    const result = await pullResourceStages(args.endpointUrl, args.onProgress, [], args.peerId);
    if (result.attachmentResourceError || result.contentBlobError ||
        result.remainingAttachmentResourceCount > 0) {
      throw new Error('sync_group_resources_incomplete');
    }
    syncedCount += result.syncedAttachmentIds.length + result.syncedContentBlobHashes.length;
    stages = mergeCompanionIdentityResourceStages(stages, result);
    const missing = await loadCompanionMissingContentBlobBatch(1);
    if (!missing.blobs.length) {
      await verifyCompanionSyncIdentityBlobBytes();
      return { syncedCount, stages };
    }
    if (!result.syncedContentBlobHashes.length) {
      throw new Error('sync_group_resources_incomplete');
    }
  }
}

export function mergeCompanionIdentityResourceStages(
  previous: Awaited<ReturnType<typeof pullResourceStages>>,
  current: Awaited<ReturnType<typeof pullResourceStages>>
) {
  return { ...current,
    syncedAttachmentIds: [...previous.syncedAttachmentIds, ...current.syncedAttachmentIds],
    syncedContentBlobHashes: [...previous.syncedContentBlobHashes, ...current.syncedContentBlobHashes],
    syncedAttachmentResourceBytes: previous.syncedAttachmentResourceBytes + current.syncedAttachmentResourceBytes,
    syncedContentBlobBytes: previous.syncedContentBlobBytes + current.syncedContentBlobBytes,
    syncedAttachmentResourceElapsedMs: previous.syncedAttachmentResourceElapsedMs + current.syncedAttachmentResourceElapsedMs,
    syncedContentBlobElapsedMs: previous.syncedContentBlobElapsedMs + current.syncedContentBlobElapsedMs,
    syncedResourceElapsedMs: previous.syncedResourceElapsedMs + current.syncedResourceElapsedMs
  };
}
