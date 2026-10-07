import {
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext,
  type TransferReceiptStage
} from '../../lib/core/sync/framedSyncContract.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { deliverFramedSyncDifferencesInDependencyOrder, framedSyncOrderBodyDependencies } from '../../lib/core/sync/framedSyncInventoryRoundDelivery.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import {
  exchangeDesktopFramedSyncInventoryHttp,
  requestDesktopFramedSyncDifferenceHttp
} from './desktopFramedSyncInventoryHttp.js';
import { resumeDesktopFramedSyncPendingPublications } from './desktopFramedSyncPendingPublications.js';
import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { buildReceiptStream } from './desktopFramedSyncProcessReceipt.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { runDesktopFramedSyncRestoreRound } from './desktopFramedSyncRestoreRound.js';
import { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';
import { loadRoundRuntime } from './desktopFramedSyncRoundRuntime.js';
import { receiveVerifiedDesktopFramedSyncTransfer } from './desktopFramedSyncVerifiedReceiver.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

export async function runDesktopFramedSyncInventoryRound(args: {
  bodyStorage?: 'continuous' | 'chunked';
  localLibraryEpoch: string;
  peer: DesktopSyncGroupPeer;
  remoteLibraryEpoch: string;
  restoreId?: string;
}) {
  const bodyStorage = args.bodyStorage ?? 'continuous';
  const runtime = await loadRoundRuntime(args.peer, bodyStorage);
  const { adoption } = runtime;
  const local = { deviceId: args.peer.local_device_id, libraryEpoch: args.localLibraryEpoch };
  const remote = { deviceId: args.peer.peer_device_id, libraryEpoch: args.remoteLibraryEpoch };
  if (!args.restoreId && !adoption) await resumeDesktopFramedSyncPendingPublications({
    bodyStorage,
    db: runtime.db, groupId: args.peer.group_id, groupSecret: runtime.groupSecret,
    local, peer: remote, peerOrigin: args.peer.endpoint_url, staging: runtime.staging
  });
  const context = roundContext(args.peer.group_id, local, remote);
  const inventories = await exchangeDesktopFramedSyncInventoryHttp({
    bodyStorage,
    context,
    db: runtime.db,
    endpointUrl: args.peer.endpoint_url,
    groupKey: runtime.groupKey,
    groupSecret: runtime.groupSecret,
    noncePort: runtime.noncePort
  });
  const inbound = {
    bodyStorage,
    context,
    db: runtime.db,
    endpointUrl: args.peer.endpoint_url,
    groupKey: runtime.groupKey,
    groupSecret: runtime.groupSecret,
    noncePort: runtime.noncePort,
    roundId: inventories.roundId,
    staging: runtime.staging
  };
  if (args.restoreId || adoption) {
    return runDesktopFramedSyncRestoreRound({
      ...(adoption ? { adoption } : {}),
      ...(args.restoreId && !adoption ? { restoreId: args.restoreId } : {}),
      inventories,
      inbound,
      exchange: {
        bodyStorage,
        context, db: runtime.db, endpointUrl: args.peer.endpoint_url,
        groupKey: runtime.groupKey, groupSecret: runtime.groupSecret,
        noncePort: runtime.noncePort
      }
    });
  }
  const differences = compareFramedSyncInventories(inventories);
  const endpoint = createDesktopFramedSyncRoundEndpoint({
    bodyStorage,
    db: runtime.db, groupId: args.peer.group_id, groupSecret: runtime.groupSecret,
    local, peer: remote, peerOrigin: args.peer.endpoint_url, staging: runtime.staging
  });
  return transferDifferences(differences, endpoint, inbound, framedSyncOrderBodyDependencies(inventories));
}

async function transferDifferences(
  differences: ReturnType<typeof compareFramedSyncInventories>,
  endpoint: ReturnType<typeof createDesktopFramedSyncRoundEndpoint>,
  inbound: InboundRound,
  dependencies: ReturnType<typeof framedSyncOrderBodyDependencies>
) {
  let transferred = 0;
  const deferred = await deliverFramedSyncDifferencesInDependencyOrder(differences, async (difference) => {
    if (difference.direction === 'remote_to_local') {
      const state = await receiveRemoteDifference(difference, inbound);
      if (state === 'pending') return 'deferred';
      transferred += 1;
      return 'delivered';
    }
    const selection = await endpoint.selectOutbound(difference);
    if (selection.kind === 'deferred') return 'deferred';
    await endpoint.staging.publishOutbound(selection.publication);
    const state = await endpoint.sendPublishedTransfer({
      difference,
      publication: selection.publication,
      receiver: 'remote'
    });
    transferred += 1;
    return state === 'pending' ? 'deferred' : 'delivered';
  }, dependencies);
  return { complete: deferred.length === 0, pending: deferred.length, transferred };
}

export type InboundRound = Readonly<{
  bodyStorage?: 'continuous' | 'chunked';
  context: Parameters<typeof requestDesktopFramedSyncDifferenceHttp>[0]['context'];
  db: Awaited<ReturnType<typeof loadRoundRuntime>>['db'];
  endpointUrl: string;
  groupKey: Uint8Array;
  groupSecret: string;
  noncePort: Awaited<ReturnType<typeof loadRoundRuntime>>['noncePort'];
  roundId: Uint8Array;
  staging: Awaited<ReturnType<typeof loadRoundRuntime>>['staging'];
}>;

async function receiveRemoteDifference(
  difference: Parameters<typeof requestDesktopFramedSyncDifferenceHttp>[0]['difference'],
  input: InboundRound
) {
  try {
    const stream = await requestDesktopFramedSyncDifferenceHttp({ ...input, difference });
    const context = reverseTransferContext(input.context);
    const receive = input.bodyStorage === 'chunked'
      ? receiveVerifiedDesktopFramedSyncTransfer : receiveDesktopFramedSyncTransfer;
    const receiptBody = await receive({
      context, db: input.db, groupKey: input.groupKey, staging: input.staging, stream
    });
    const transferId = decodeFramedSyncPreamble(receiptBody.preamble).contextId;
    const receipt = await input.staging.loadReceipt(transferId);
    if (!receipt) throw new Error('framed_sync_inbound_receipt_missing');
    await postInboundReceipt(input, context, receipt, receiptBody);
    return receiptBody.generatedChanges ? 'pending' as const : 'committed' as const;
  } catch (error) {
    if (isRetryableInboundRace(error)) return 'pending' as const;
    throw error;
  }
}

function isRetryableInboundRace(error: unknown) {
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

function roundContext(groupId: string, local: { deviceId: string; libraryEpoch: string },
  remote: { deviceId: string; libraryEpoch: string }): InboundRound['context'] {
  return { groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: local.deviceId, initiatorLibraryEpoch: local.libraryEpoch,
    responderDeviceId: remote.deviceId, responderLibraryEpoch: remote.libraryEpoch };
}
