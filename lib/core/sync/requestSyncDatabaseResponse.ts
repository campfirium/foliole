import type { FramedSyncStreamBody } from './framedSyncBinaryStream.js';
import { resolveFramedSyncDifferenceRequest } from './framedSyncDifferenceRequest.js';
import { inventoryBucket, summarizeInventoryBuckets } from './framedSyncInventoryBuckets.js';
import { expandRequestSyncNodeSummaries, flushRequestSyncInventoryDigests, readRequestSyncInventorySummaries } from './framedSyncInventoryDigest.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';
import { framedSyncInventorySummary } from './framedSyncInventorySummary.js';
import { respondRequestSyncBatch } from './requestSyncBatchResponse.js';
import { readRequestSyncDifference } from './requestSyncDifferenceWire.js';
import { decodeRequestSyncInventory, iterateRequestSyncInventory } from './requestSyncInventoryWire.js';
import { receiveRequestSyncObject, sendRequestSyncObject, type RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext, type RequestSyncWireFrame } from './requestSyncWire.js';

export type RequestSyncDatabaseResponseInput = {
  context: RequestSyncAuthenticatedContext;
  groupKey: Uint8Array;
  stream: FramedSyncStreamBody<RequestSyncWireFrame>;
  mode: 'inventory' | 'pull' | 'object' | 'pulls' | 'objects';
  batch?: Pick<Parameters<typeof receiveRequestSyncObject>[1], 'peerState'>;
  signal?: AbortSignal;
  object?: Pick<Parameters<typeof receiveRequestSyncObject>[1], 'expectedObject' | 'peerState'>;
};

export async function respondRequestSyncDatabase<T>(host: RequestSyncDatabaseHost, input: RequestSyncDatabaseResponseInput,
  consume: (stream: FramedSyncStreamBody) => Promise<T>): Promise<T> {
  if (input.mode === 'pulls' || input.mode === 'objects') return respondRequestSyncBatch(host, input, consume);
  const messages = (async function* () {
    for await (const decoded of readRequestSyncWire({ ...input, ...input.stream })) yield decoded.message;
  })();
  if (input.mode === 'pull') {
    const request = await readRequestSyncDifference(messages);
    const key = request;
    if (!request || !key) throw new Error('request_sync_object_identity_missing');
    const difference = await host.readSnapshot(async db => {
      const entry = await readFramedSyncInventoryEntry(db, key);
      if (!entry) throw new Error('framed_sync_difference_request_source_changed');
      return resolveFramedSyncDifferenceRequest(entry, request);
    }, input.signal);
    return sendRequestSyncObject(host, { ...input, difference }, consume);
  }
  let response: Iterable<RequestSyncMessage>;
  if (input.mode === 'object') {
    if (!input.object) throw new Error('request_sync_object_identity_missing');
    const result = await receiveRequestSyncObject(host, { ...input, ...input.stream, ...input.object, author: 'initiator' });
    response = [{ payloadCase: 'round_receipt', payload: { roundId: result.requestId, result: 1, deferredFacts: [] } }];
  } else {
    const request = await decodeRequestSyncInventory(messages, { retainEntries: false });
    const nodeIds = !request.bucketSummary && request.detailGlobalIds.length ? request.detailGlobalIds : undefined;
    await host.write(db => db.transaction(tx => flushRequestSyncInventoryDigests(tx, nodeIds)));
    const entries = await host.readSnapshot(async db => {
      const summaries = await readRequestSyncInventorySummaries(db, nodeIds);
      return request.detailGlobalIds.length ? expandRequestSyncNodeSummaries(db, summaries, request.detailGlobalIds) : summaries;
    }, input.signal);
    if (request.bucketSummary) {
      const summary = summarizeInventoryBuckets(entries);
      response = iterateRequestSyncInventory({ entries: [], roundId: request.roundId,
        bucketHashes: summary.hashes, unreadyBuckets: summary.unready, bucketSummary: true });
    } else {
      const selected = request.detailGlobalIds.length ? entries.filter(entry => entry.objectType === 'node' &&
        request.detailGlobalIds.includes(entry.globalId)) : request.selectedBuckets.length
        ? entries.filter(entry => request.selectedBuckets.includes(inventoryBucket(entry))) : entries;
      response = iterateRequestSyncInventory({ entries: request.summaryOnly ? framedSyncInventorySummary(selected) : selected,
        roundId: request.roundId });
    }
  }
  const body = await prepareRequestSyncWire({ ...input,
    messages: async function* () { yield* response; } });
  try { return await consume(body); }
  finally {
    await body.frames.return(undefined);
  }
}
