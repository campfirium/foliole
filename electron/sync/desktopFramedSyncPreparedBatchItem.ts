import type { PublishedTransfer } from '../../lib/core/sync/framedSyncContract.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND } from '../../lib/core/sync/framedSyncResourceFact.js';
import type { OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';

import type { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';

export type DesktopFramedSyncBatchItem = Readonly<{
  published: PublishedTransfer;
  verifyResourceReceipt: boolean;
  attempt: Parameters<typeof loadDesktopFramedSyncPreparedTransferBody>[0]['attempt'];
  body: Awaited<ReturnType<typeof loadDesktopFramedSyncPreparedTransferBody>>;
}>;

/** A sealed body only needs original transfer identity and receipt requirements in memory. */
export function desktopFramedSyncPreparedBatchItem(publication: OutboundPublishInput,
  delivery: Pick<DesktopFramedSyncBatchItem, 'attempt' | 'body'>): DesktopFramedSyncBatchItem {
  return {
    published: {
      blobCount: BigInt(publication.manifest.blobs.length),
      contentId: publication.contentId,
      context: publication.context,
      factCount: BigInt(publication.manifest.facts.length),
      manifestHash: publication.manifestHash,
      totalBlobBytes: publication.manifest.blobs.reduce((sum, blob) => sum + blob.byteLength, 0n),
      transferId: publication.transferId
    },
    verifyResourceReceipt: publication.manifest.facts.some(fact => fact.kind === FRAMED_SYNC_RESOURCE_FACT_KIND),
    attempt: delivery.attempt,
    body: delivery.body
  };
}
