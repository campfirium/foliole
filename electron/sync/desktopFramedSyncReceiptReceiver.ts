import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { PublishedTransfer } from '../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import { buildReceiptStream, readReceipt } from './desktopFramedSyncProcessReceipt.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';

export async function receiveDesktopFramedSyncReceipt(input: {
  db: DbPort;
  groupKey: Uint8Array;
  staging: FramedSyncStagingPort;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
  transferId: Uint8Array;
}) {
  const publication = await input.staging.loadOutboundPublication(input.transferId);
  if (!publication) throw new Error('framed_sync_outbound_publication_missing');
  const published: PublishedTransfer = {
    blobCount: BigInt(publication.manifest.blobs.length),
    contentId: publication.contentId,
    context: publication.context,
    factCount: BigInt(publication.manifest.facts.length),
    manifestHash: publication.manifestHash,
    totalBlobBytes: publication.manifest.blobs.reduce(
      (total, blob) => total + blob.byteLength, 0n
    ),
    transferId: publication.transferId
  };
  const receipt = await readReceipt({
    groupKey: input.groupKey, published, stream: input.stream
  });
  await input.staging.commitOutboundReceipt(receipt);
  await input.staging.releaseOutboundHolds(input.transferId);
  return buildReceiptStream({
    db: input.db, groupKey: input.groupKey, receipt, staging: input.staging
  });
}
