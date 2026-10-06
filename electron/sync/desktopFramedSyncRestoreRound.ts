import {
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext,
  type TransferReceiptStage
} from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';

import { applyPreparedDesktopFramedSyncInbound } from './desktopFramedSyncApplyPrepared.js';
import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import {
  exchangeDesktopFramedSyncInventoryHttp,
  requestDesktopFramedSyncDifferenceHttp
} from './desktopFramedSyncInventoryHttp.js';
import type { InboundRound } from './desktopFramedSyncInventoryRound.js';
import type { PreparedDesktopFramedSyncInbound } from './desktopFramedSyncPreparedInbound.js';
import { buildReceiptStream, readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { stageDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { preserveDesktopIdentityRestore } from './preserveDesktopGroupRestore.js';

export async function runDesktopFramedSyncRestoreRound(input: {
  exchange: Parameters<typeof exchangeDesktopFramedSyncInventoryHttp>[0];
  inbound: InboundRound;
  inventories: Awaited<ReturnType<typeof exchangeDesktopFramedSyncInventoryHttp>>;
  restoreId: string;
}) {
  const differences = compareFramedSyncInventories({
    local: [], remote: input.inventories.remote
  });
  const prepared: PreparedDesktopFramedSyncInbound[] = [];
  for (const difference of differences) {
    const stream = await requestDesktopFramedSyncDifferenceHttp({
      ...input.inbound, difference
    });
    prepared.push(await stageDesktopFramedSyncTransfer({
      context: reverseTransferContext(input.inbound.context),
      db: input.inbound.db,
      groupKey: input.inbound.groupKey,
      staging: input.inbound.staging,
      stream
    }));
  }
  const confirmed = await exchangeDesktopFramedSyncInventoryHttp(input.exchange);
  if (compareFramedSyncInventories({
    local: input.inventories.remote,
    remote: confirmed.remote
  }).length !== 0) throw new Error('framed_sync_source_changed');
  await preserveDesktopIdentityRestore(input.inbound.context.groupId, input.restoreId);
  const receipts = await applyPreparedDesktopFramedSyncInbound({
    db: input.inbound.db,
    restore: { groupId: input.inbound.context.groupId, restoreId: input.restoreId },
    transfers: prepared
  });
  for (const [index, transfer] of prepared.entries()) {
    await postReceipt(input.inbound, transfer.context, receipts[index]!);
  }
  return { complete: true, pending: 0, transferred: prepared.length };
}

async function postReceipt(
  input: InboundRound,
  context: FramedSyncContext,
  receipt: TransferReceiptStage
) {
  const body = await buildReceiptStream({
    db: input.db, groupKey: input.groupKey, receipt, staging: input.staging
  });
  const response = await postDesktopFramedSync({
    body,
    endpointUrl: input.endpointUrl,
    groupId: input.context.groupId,
    localDeviceId: input.context.initiatorDeviceId,
    localLibraryEpoch: input.context.initiatorLibraryEpoch,
    pathWithQuery: '/companion/framed-sync',
    remoteDeviceId: input.context.responderDeviceId,
    remoteLibraryEpoch: input.context.responderLibraryEpoch,
    secret: input.groupSecret
  });
  const acknowledged = await readReceipt({
    groupKey: input.groupKey,
    published: receiptPublication(context, receipt),
    stream: response.stream
  });
  if (!sameBytes(acknowledged.appliedStateHash, receipt.appliedStateHash)) {
    throw new Error('framed_sync_receipt_ack_mismatch');
  }
}

function reverseTransferContext(context: InboundRound['context']): FramedSyncContext {
  return {
    groupId: context.groupId,
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: context.initiatorDeviceId,
    receiverLibraryEpoch: context.initiatorLibraryEpoch,
    senderDeviceId: context.responderDeviceId,
    senderLibraryEpoch: context.responderLibraryEpoch
  };
}

function receiptPublication(context: FramedSyncContext, receipt: TransferReceiptStage) {
  return {
    blobCount: 0n, contentId: receipt.contentId, context, factCount: 0n,
    manifestHash: receipt.contentId, totalBlobBytes: 0n, transferId: receipt.transferId
  };
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index]);
}
