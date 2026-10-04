import { enqueueSyncIdentityResourceScanPage } from '../../../../../lib/core/sync/syncPackResourceArticles.js';
import { loadCompanionMissingContentBlobBatch } from '../../companionContentBlobSync';
import { pullResourceStages } from '../../companionDesktopSyncResourceStages';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { verifyCompanionSyncIdentityBlobBytes } from './syncGroupIdentityBlobIntegrity';

/** Check current resource references even when every identity fingerprint is equal. */
export async function drainCompanionSyncIdentityResources(args: {
  endpointUrl: string; groupId: string; peerId: string;
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
  for (;;) {
    const result = await pullResourceStages(args.endpointUrl, undefined, [], args.peerId);
    if (result.attachmentResourceError || result.contentBlobError ||
        result.remainingAttachmentResourceCount > 0) {
      throw new Error('sync_group_resources_incomplete');
    }
    syncedCount += result.syncedAttachmentIds.length + result.syncedContentBlobHashes.length;
    const missing = await loadCompanionMissingContentBlobBatch(1);
    if (!missing.blobs.length) {
      await verifyCompanionSyncIdentityBlobBytes();
      return { syncedCount };
    }
    if (!result.syncedContentBlobHashes.length) {
      throw new Error('sync_group_resources_incomplete');
    }
  }
}
