import { sameFramedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_BATCH_LIMITS } from '../../lib/core/sync/framedSyncBatchLimits.js';
import { retireFramedSyncCompletedPublication } from '../../lib/core/sync/framedSyncCompletedPublication.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { sameFramedSyncContext } from '../../lib/core/sync/framedSyncStagingContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { collectDeliveredParentOrderBodies } from '../../lib/core/sync/parentOrderBodyRetention.js';
import { readFramedSyncPayloadBudget } from '../database/framedSyncPayloadBudgetOwner.js';

import { postDesktopFramedSyncBytes } from './desktopFramedSyncHttp.js';
import type { DesktopFramedSyncBatchItem } from './desktopFramedSyncPreparedBatchItem.js';
import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { spoolDesktopFramedSyncSequence } from './desktopFramedSyncSequenceSpool.js';
import { readFramedSyncStreamSequence } from './desktopFramedSyncStreamSequence.js';

export async function sendDesktopFramedSyncPublishedBatch(input: {
  db: DbPort;
  items: readonly DesktopFramedSyncBatchItem[];
  groupSecret: string;
  peerOrigin: string;
  staging: FramedSyncStagingPort;
}) {
  try {
    const first = assertBatch(input.items);
    const budget = readFramedSyncPayloadBudget(input.db);
    const body = await spoolDesktopFramedSyncSequence({ payloadBudget: budget, lane: 'payload',
      bodies: (async function* () { for (const item of input.items) yield item.body; })() });
    const context = first.published.context;
    const response = await postDesktopFramedSyncBytes({ body, payloadBudget: budget,
      endpointUrl: input.peerOrigin, groupId: context.groupId, localDeviceId: context.senderDeviceId,
      localLibraryEpoch: context.senderLibraryEpoch, pathWithQuery: '/companion/framed-sync',
      remoteDeviceId: context.receiverDeviceId, remoteLibraryEpoch: context.receiverLibraryEpoch,
      secret: input.groupSecret });
    try { await commitBatchReceipts(input, readFramedSyncStreamSequence(response.response, budget)); }
    finally { response.response.destroy(); }
  } catch (error) {
    for (const item of input.items) {
      if (!await input.staging.loadReceipt(item.published.transferId)) {
        await input.staging.abandonOutboundAttempt(item.published.transferId, item.attempt.attemptId);
      }
    }
    throw error;
  } finally { for (const item of input.items) await item.body.dispose?.(); }
}

function assertBatch(items: readonly DesktopFramedSyncBatchItem[]) {
  const first = items[0];
  if (!first || items.length > FRAMED_SYNC_BATCH_LIMITS.maxItems) throw new Error('framed_sync_batch_item_limit_exceeded');
  const identities = new Set<string>();
  let bytes = 0;
  for (const item of items) {
    if (!sameFramedSyncContext(item.published.context, first.published.context)) {
      throw new Error('framed_sync_batch_context_mismatch');
    }
    const id = transferKey(item.published.transferId);
    if (identities.has(id)) throw new Error('framed_sync_batch_duplicate_transfer');
    identities.add(id);
    const size = item.body.uncompressedMessageBytes;
    if (size === undefined || !Number.isSafeInteger(size) || size < 1) throw new Error('framed_sync_batch_size_invalid');
    bytes += size;
  }
  if (bytes > FRAMED_SYNC_BATCH_LIMITS.maxMessageBytes) throw new Error('framed_sync_batch_message_limit_exceeded');
  return first;
}

async function commitBatchReceipts(input: Parameters<typeof sendDesktopFramedSyncPublishedBatch>[0],
  streams: ReturnType<typeof readFramedSyncStreamSequence>) {
  const pending = new Map(input.items.map(item => [transferKey(item.published.transferId), item]));
  for await (const stream of streams) {
    const preamble = decodeFramedSyncPreamble(stream.preamble);
    const id = transferKey(preamble.contextId);
    const item = pending.get(id);
    if (!item) throw new Error('framed_sync_batch_receipt_unexpected');
    const published = item.published;
    const receipt = await readReceipt({ stream, published,
      groupKey: new Uint8Array(Buffer.from(input.groupSecret, 'base64url')) });
    if (item.verifyResourceReceipt &&
        !sameFramedSyncBytes(receipt.appliedStateHash, published.contentId)) throw new Error('framed_sync_resource_receipt_mismatch');
    await input.staging.commitOutboundReceipt(receipt);
    await input.staging.releaseOutboundHolds(published.transferId);
    await collectDeliveredParentOrderBodies(input.db, published.transferId);
    await retireFramedSyncCompletedPublication(input.db, published.transferId);
    pending.delete(id);
  }
  if (pending.size) throw new Error('framed_sync_batch_receipt_missing');
}

function transferKey(bytes: Uint8Array) { return Buffer.from(bytes).toString('hex'); }
