import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext, type TransferReceiptStage } from '../../lib/core/sync/framedSyncContract.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { assertFramedSyncRequestedTransferFacts } from '../../lib/core/sync/framedSyncRequestedTransferFacts.js';
import type { FramedSyncSessionNoncePort } from '../../lib/core/sync/framedSyncSession.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { readFramedSyncPayloadBudget } from '../database/framedSyncPayloadBudgetOwner.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { requestDesktopFramedSyncDifferenceHttp } from './desktopFramedSyncInventoryHttp.js';
import { buildReceiptStream, readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';

export type InboundRound = Readonly<{
  context: Parameters<typeof requestDesktopFramedSyncDifferenceHttp>[0]['context'];
  db: DbPort;
  endpointUrl: string;
  groupKey: Uint8Array;
  groupSecret: string;
  noncePort: FramedSyncSessionNoncePort;
  roundId: Uint8Array;
  staging: FramedSyncStagingPort;
}>;

export async function receiveRemoteDifference(
  difference: Parameters<typeof requestDesktopFramedSyncDifferenceHttp>[0]['difference'],
  input: InboundRound
) {
  try {
    const stream = await requestDesktopFramedSyncDifferenceHttp({ ...input, difference });
    return await receiveDesktopFramedSyncRoundStream(input, stream);
  } catch (error) {
    if (isRetryableInboundRace(error)) return 'pending' as const;
    throw error;
  }
}

export async function receiveDesktopFramedSyncRoundStream(input: InboundRound,
  stream: FramedSyncStreamBody<FramedSyncWireFrame>,
  difference?: Parameters<typeof requestDesktopFramedSyncDifferenceHttp>[0]['difference']) {
  const context = reverseTransferContext(input.context);
  const receiptBody = await receiveDesktopFramedSyncTransfer({
    context, db: input.db, groupKey: input.groupKey, staging: input.staging, stream,
    ...(difference ? { acceptHeader: header => assertFramedSyncRequestedTransferFacts(difference, header.facts) } : {})
  });
  const transferId = decodeFramedSyncPreamble(receiptBody.preamble).contextId;
  const receipt = await input.staging.loadReceipt(transferId);
  if (!receipt) throw new Error('framed_sync_inbound_receipt_missing');
  await postInboundReceipt(input, context, receipt, receiptBody);
  return receiptBody.generatedChanges ? 'pending' as const : 'committed' as const;
}

export function isRetryableInboundRace(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return ['framed_sync_difference_request_source_changed', 'framed_sync_source_changed',
    'inbound_header_conflict'].some((code) => message.includes(code));
}

async function postInboundReceipt(
  input: InboundRound,
  context: FramedSyncContext,
  receipt: TransferReceiptStage,
  body?: Awaited<ReturnType<typeof buildReceiptStream>>
) {
  const receiptBody = body ?? await buildReceiptStream({
    db: input.db, groupKey: input.groupKey, receipt, staging: input.staging
  });
  const response = await postDesktopFramedSync({
    body: receiptBody,
    payloadBudget: readFramedSyncPayloadBudget(input.db),
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

function reverseTransferContext(
  context: InboundRound['context']
): FramedSyncContext {
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
    blobCount: 0n,
    contentId: receipt.contentId,
    context,
    factCount: 0n,
    manifestHash: receipt.contentId,
    totalBlobBytes: 0n,
    transferId: receipt.transferId
  };
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index]);
}
