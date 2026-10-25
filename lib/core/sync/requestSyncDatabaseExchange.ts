import type { AttachmentReceiveWindow } from './attachmentBlockTransfer.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './framedSyncBinaryStream.js';
import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { differingInventoryBuckets, inventoryBucket, summarizeInventoryBuckets } from './framedSyncInventoryBuckets.js';
import { flushRequestSyncInventoryDigests, readRequestSyncInventorySummaries } from './framedSyncInventoryDigest.js';
import { differingNodeIds } from './framedSyncInventorySummary.js';
import type { AttachmentRequest } from './requestSyncAttachmentContract.js';
import { requestSyncDifferenceMessages } from './requestSyncDifferenceWire.js';
import { mergeRequestSyncNodeDetails, readRequestSyncNodeDetails } from './requestSyncInventoryExpansion.js';
import { decodeRequestSyncInventory, iterateRequestSyncInventory } from './requestSyncInventoryWire.js';
import { receiveRequestSyncObject, sendRequestSyncObject, type RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext } from './requestSyncWire.js';
import { compareSyncFactText } from './syncFactKeyOrder.js';

export interface RequestSyncExchange {
  /** Native execution validates and writes one authorized range; shared code owns publication. */
  receiveAttachment?(query: AttachmentRequest): Promise<AttachmentReceiveWindow>;
  context: RequestSyncAuthenticatedContext;
  groupKey: Uint8Array;
  signal?: AbortSignal;
  request<T>(path: string, body: FramedSyncStreamBody,
    consume: (response: FramedSyncStreamBody<FramedSyncWireFrame>) => Promise<T>): Promise<T>;
}

export async function withControlRequest<T>(exchange: RequestSyncExchange,
  path: string, messages: AsyncIterable<RequestSyncMessage> | Iterable<RequestSyncMessage>,
  consume: (response: FramedSyncStreamBody<FramedSyncWireFrame>) => Promise<T>) {
  const body = await prepareRequestSyncWire({ ...exchange,
    messages: async function* () { yield* messages; } });
  try { return await exchange.request(path, body, consume); }
  finally {
    await body.frames.return(undefined);
  }
}

async function* decodedMessages(exchange: RequestSyncExchange, body: FramedSyncStreamBody<FramedSyncWireFrame>) {
  for await (const decoded of readRequestSyncWire({ ...exchange, ...body })) yield decoded.message;
}

export async function exchangeRequestSyncInventory(host: RequestSyncDatabaseHost, exchange: RequestSyncExchange,
  localInventory?: readonly FramedSyncInventoryEntry[]) {
  exchange.signal?.throwIfAborted();
  if (!localInventory) await host.write(db => db.transaction(flushRequestSyncInventoryDigests));
  let local = localInventory ?? await host.readSnapshot(readRequestSyncInventorySummaries, exchange.signal);
  const buckets = await inventoryRequest(exchange, [], { bucketSummary: true });
  if (!buckets.bucketSummary || buckets.entries.length) throw new Error('inventory_bucket_summary_invalid');
  const selectedBuckets = differingInventoryBuckets(summarizeInventoryBuckets(local), {
    hashes: buckets.bucketHashes, unready: buckets.unreadyBuckets
  });
  if (!selectedBuckets.length) return { local, remote: local, roundId: buckets.roundId };
  const summaries = await inventoryRequest(exchange, [], { selectedBuckets });
  if (summaries.entries.some(entry => !selectedBuckets.includes(inventoryBucket(entry)))) {
    throw new Error('inventory_bucket_selection_invalid');
  }
  summaries.entries.push(...local.filter(entry => !selectedBuckets.includes(inventoryBucket(entry))));
  summaries.entries.sort((a, b) => compareSyncFactText(a.objectType, b.objectType) || compareSyncFactText(a.globalId, b.globalId));
  const ids = differingNodeIds(local, summaries.entries);
  if (!ids.length) return { local, remote: summaries.entries, roundId: summaries.roundId };
  const deferred = new Set<string>();
  if (!localInventory) {
    const details = await host.readSnapshot(db => readRequestSyncNodeDetails(db, ids), exchange.signal);
    local = mergeRequestSyncNodeDetails(local, ids, details, deferred);
  }
  const remoteDetails: FramedSyncInventoryEntry[] = [];
  for (const batch of detailBatches(ids)) {
    const details = await inventoryRequest(exchange, batch);
    if (details.entries.some(entry => entry.objectType !== 'node' || !batch.includes(entry.globalId))) {
      throw new Error('inventory_node_detail_identity_invalid');
    }
    remoteDetails.push(...details.entries);
  }
  const remote = mergeRequestSyncNodeDetails(summaries.entries, ids, remoteDetails, deferred);
  const comparable = (entry: FramedSyncInventoryEntry) => entry.objectType !== 'node' || !deferred.has(entry.globalId);
  return { local: local.filter(comparable), remote: remote.filter(comparable),
    inventoryDeferred: deferred.size, roundId: summaries.roundId };
}

function* detailBatches(ids: readonly string[]) {
  const encoder = new TextEncoder();
  let batch: string[] = [];
  let bytes = 0;
  for (const id of ids) {
    const size = encoder.encode(id).length + 8;
    if (batch.length && (batch.length >= 2048 || bytes + size > FRAMED_SYNC_LIMITS.maxControlMessageBytes / 2)) {
      yield batch; batch = []; bytes = 0;
    }
    batch.push(id); bytes += size;
  }
  if (batch.length) yield batch;
}

async function inventoryRequest(exchange: RequestSyncExchange, detailGlobalIds: readonly string[],
  selection: { bucketSummary?: boolean; selectedBuckets?: number[] } = {}) {
  const roundId = crypto.getRandomValues(new Uint8Array(16));
  const messages = iterateRequestSyncInventory({ entries: [], roundId,
    ...selection, detailGlobalIds, summaryOnly: detailGlobalIds.length === 0 });
  return withControlRequest(exchange, '/companion/framed-sync?request=inventory', messages, async response => {
    const decoded = await decodeRequestSyncInventory(decodedMessages(exchange, response));
    if (!sameBytes(decoded.roundId, roundId)) throw new Error('inventory_round_identity_mismatch');
    return decoded;
  });
}

export async function pushRequestSyncObject(host: RequestSyncDatabaseHost, exchange: RequestSyncExchange,
  difference: FramedSyncInventoryDifference) {
  return sendRequestSyncObject(host, { ...exchange, difference }, stream => {
    const query = new URLSearchParams({ request: 'object', object_type: difference.objectType,
      global_id: difference.globalId });
    return exchange.request(`/companion/framed-sync?${query}`, stream, async response => {
      let acknowledged = false;
      for await (const message of decodedMessages(exchange, response)) {
        const roundId = message.payload.roundId;
        if (acknowledged || message.payloadCase !== 'round_receipt' || !(roundId instanceof Uint8Array) ||
            !sameBytes(roundId, stream.requestId) || message.payload.result !== 1) {
          throw new Error('request_sync_response_invalid');
        }
        acknowledged = true;
      }
      if (!acknowledged) throw new Error('request_sync_response_missing');
      return { committed: true as const };
    });
  });
}

export async function pullRequestSyncObject(host: RequestSyncDatabaseHost, exchange: RequestSyncExchange,
  difference: FramedSyncInventoryDifference,
  options: Pick<Parameters<typeof receiveRequestSyncObject>[1], 'peerState' | 'objectOptions'>) {
  return withControlRequest(exchange, '/companion/framed-sync?request=pull', requestSyncDifferenceMessages(difference), response =>
    receiveRequestSyncObject(host, { ...exchange, ...response, ...options, author: 'responder', expectedObject: difference }));
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((byte, index) => right[index] === byte);
}
