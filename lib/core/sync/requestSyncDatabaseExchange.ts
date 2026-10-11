import { flushCurrentParentOrderProjectionsWithDbPort } from './currentParentOrderStore.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './framedSyncBinaryStream.js';
import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from './framedSyncInventoryRead.js';
import { differingNodeIds, framedSyncInventorySummary } from './framedSyncInventorySummary.js';
import { requestSyncDifferenceMessages } from './requestSyncDifferenceWire.js';
import { decodeRequestSyncInventory, iterateRequestSyncInventory } from './requestSyncInventoryWire.js';
import { receiveRequestSyncObject, sendRequestSyncObject, type RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext } from './requestSyncWire.js';

export interface RequestSyncExchange {
  context: RequestSyncAuthenticatedContext;
  groupKey: Uint8Array;
  signal?: AbortSignal;
  request<T>(path: string, body: FramedSyncStreamBody,
    consume: (response: FramedSyncStreamBody<FramedSyncWireFrame>) => Promise<T>): Promise<T>;
}

async function withControlRequest<T>(host: RequestSyncDatabaseHost, exchange: RequestSyncExchange,
  path: string, messages: AsyncIterable<RequestSyncMessage> | Iterable<RequestSyncMessage>,
  consume: (response: FramedSyncStreamBody<FramedSyncWireFrame>) => Promise<T>) {
  const body = await prepareRequestSyncWire({ ...exchange, noncePort: host.noncePort,
    messages: async function* () { yield* messages; } });
  try { return await exchange.request(path, body, consume); }
  finally {
    try { await body.frames.return(undefined); }
    finally { await body.dispose(); }
  }
}

async function* decodedMessages(exchange: RequestSyncExchange, body: FramedSyncStreamBody<FramedSyncWireFrame>) {
  for await (const decoded of readRequestSyncWire({ ...exchange, ...body })) yield decoded.message;
}

export async function exchangeRequestSyncInventory(host: RequestSyncDatabaseHost, exchange: RequestSyncExchange,
  localInventory?: readonly FramedSyncInventoryEntry[]) {
  exchange.signal?.throwIfAborted();
  if (!localInventory) await host.write(db => db.transaction(flushCurrentParentOrderProjectionsWithDbPort));
  const local = localInventory ?? await host.readSnapshot(readRequestSyncInventorySnapshot, exchange.signal);
  const summaries = await inventoryRequest(host, exchange, local, []);
  const ids = differingNodeIds(local, summaries.entries);
  if (!ids.length) return { local, remote: summaries.entries, roundId: summaries.roundId };
  const byId = new Map<string, FramedSyncInventoryEntry>();
  for (const batch of detailBatches(ids)) {
    const details = await inventoryRequest(host, exchange, [], batch);
    for (const entry of details.entries) byId.set(entry.globalId, entry);
  }
  return { local, remote: summaries.entries.map(entry => entry.objectType === 'node'
    ? byId.get(entry.globalId) ?? entry : entry), roundId: summaries.roundId };
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

async function inventoryRequest(host: RequestSyncDatabaseHost, exchange: RequestSyncExchange,
  local: readonly FramedSyncInventoryEntry[], detailGlobalIds: readonly string[]) {
  const roundId = crypto.getRandomValues(new Uint8Array(16));
  const messages = iterateRequestSyncInventory({ entries: framedSyncInventorySummary(local), roundId,
    detailGlobalIds, summaryOnly: true });
  return withControlRequest(host, exchange, '/companion/framed-sync?request=inventory', messages, async response => {
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
  return withControlRequest(host, exchange, '/companion/framed-sync?request=pull', requestSyncDifferenceMessages(difference), response =>
    receiveRequestSyncObject(host, { ...exchange, ...response, ...options, author: 'responder', expectedObject: difference }));
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((byte, index) => right[index] === byte);
}
