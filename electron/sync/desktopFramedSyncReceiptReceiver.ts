import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { retireFramedSyncCompletedPublication } from '../../lib/core/sync/framedSyncCompletedPublication.js';
import type {
  FramedSyncContext,
  PublishedTransfer
} from '../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncFilePort } from '../../lib/core/sync/framedSyncFilePort.js';
import { loadFramedSyncFileTask } from '../../lib/core/sync/framedSyncFilePublication.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import { buildReceiptStream, readReceipt } from './desktopFramedSyncProcessReceipt.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';

export async function receiveDesktopFramedSyncReceipt(input: {
  files?: FramedSyncFilePort;
  context: FramedSyncContext;
  db: DbPort;
  groupKey: Uint8Array;
  staging: FramedSyncStagingPort;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
  transferId: Uint8Array;
}) {
  return input.files ? input.files.exclusive(`receiver/${bytesToHex(input.transferId)}`,
    () => receiveOwnedReceipt(input)) : receiveOwnedReceipt(input);
}

async function receiveOwnedReceipt(input: Parameters<typeof receiveDesktopFramedSyncReceipt>[0]) {
  const stored = await input.staging.loadOutboundPublication(input.transferId);
  const retired = !stored && input.files ? await loadFramedSyncFileTask(input.files, input.transferId) : null;
  const publication = stored ?? (retired?.receipt ? { ...retired, manifest: { facts: [], blobs: [] } } : null);
  if (!publication) throw new Error('framed_sync_outbound_publication_missing');
  assertReceiptRequestContext(publication.context, input.context);
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
  if (!input.files) await retireFramedSyncCompletedPublication(input.db, input.transferId);
  return buildReceiptStream({
    ...(input.files ? { files: input.files } : {}),
    db: input.db, groupKey: input.groupKey, receipt, staging: input.staging
  });
}

function assertReceiptRequestContext(published: FramedSyncContext, request: FramedSyncContext) {
  if (published.groupId !== request.groupId ||
      published.senderDeviceId !== request.receiverDeviceId ||
      published.senderLibraryEpoch !== request.receiverLibraryEpoch ||
      published.receiverDeviceId !== request.senderDeviceId ||
      published.receiverLibraryEpoch !== request.senderLibraryEpoch) {
    throw new Error('framed_sync_receipt_request_context_mismatch');
  }
}
