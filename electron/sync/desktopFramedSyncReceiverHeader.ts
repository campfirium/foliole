import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { PublishedTransfer, TransferReceiptStage } from '../../lib/core/sync/framedSyncContract.js';
import type { decodeAndValidateProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import { DesktopFramedSyncInboundBlobSet } from './desktopFramedSyncInboundBlobSet.js';
import { DesktopFramedSyncInboundResourceStore } from './desktopFramedSyncInboundResourceStore.js';
import type { PreparedDesktopFramedSyncInbound } from './desktopFramedSyncPreparedInbound.js';
import { headerFromWire } from './desktopFramedSyncProcessHeader.js';
import { admitDesktopFramedSyncTransfer, stageDesktopFramedSyncBlob, type stageDesktopFramedSyncFact } from './desktopFramedSyncProcessInbound.js';
import { loadDesktopFramedSyncReadyInbound } from './desktopFramedSyncReadyInbound.js';

export type DesktopFramedSyncReceiverState = {
  attemptAdmitted: boolean;
  blobs: DesktopFramedSyncInboundBlobSet | null;
  existingReceipt: TransferReceiptStage | null;
  facts: CanonicalFact[];
  published: PublishedTransfer | null;
  resources: DesktopFramedSyncInboundResourceStore | null;
  ready: PreparedDesktopFramedSyncInbound | null;
};
type HeaderInput = Readonly<{
  db: DbPort;
  decoded: ReturnType<typeof decodeAndValidateProtocolMessage>;
  frame: Parameters<typeof stageDesktopFramedSyncFact>[0]['frame'];
  preambleAttemptId: Uint8Array;
  staging: FramedSyncStagingPort;
  state: DesktopFramedSyncReceiverState;
}>;

export async function handleDesktopFramedSyncReceiverHeader(input: HeaderInput, published: PublishedTransfer) {
  const header = headerFromWire(input.decoded.payload, published);
  input.state.blobs = new DesktopFramedSyncInboundBlobSet(header.blobs);
  input.state.resources = new DesktopFramedSyncInboundResourceStore({
    attemptId: input.preambleAttemptId,
    descriptors: header.blobs,
    staging: input.staging,
    transferId: published.transferId
  });
  input.state.existingReceipt = await input.staging.loadReceipt(published.transferId);
  if (!input.state.existingReceipt) input.state.ready = await loadDesktopFramedSyncReadyInbound({
    db: input.db, published, staging: input.staging
  });
  if (!input.state.existingReceipt && !input.state.ready) await admitDesktopFramedSyncTransfer({
    attemptId: input.preambleAttemptId,
    firstFrame: input.frame,
    header,
    staging: input.staging
  });
  input.state.attemptAdmitted = !input.state.existingReceipt && !input.state.ready;
}

export async function handleDesktopFramedSyncReceiverBlob(input: HeaderInput, sha256: Uint8Array,
  offset: bigint, data: Uint8Array) {
  if (input.state.blobs?.has(sha256)) {
    input.state.blobs.append(sha256, offset, data);
    await stageDesktopFramedSyncBlob({
      data, frame: input.frame, offset, sha256, staging: input.staging
    });
    return;
  }
  if (!input.state.resources?.has(sha256)) throw new Error('framed_sync_blob_content_set_mismatch');
  await input.staging.commitAuthenticatedFrame(input.frame);
  await input.state.resources.append(sha256, offset, data);
}
