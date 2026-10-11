import { flushCurrentParentOrderProjectionsWithDbPort } from './currentParentOrderStore.js';
import type { FramedSyncStreamBody } from './framedSyncBinaryStream.js';
import { resolveFramedSyncDifferenceRequest } from './framedSyncDifferenceRequest.js';
import { readFramedSyncInventoryEntry, readRequestSyncInventorySnapshot } from './framedSyncInventoryRead.js';
import { framedSyncInventorySummary } from './framedSyncInventorySummary.js';
import { readRequestSyncDifference } from './requestSyncDifferenceWire.js';
import { decodeRequestSyncInventory, iterateRequestSyncInventory } from './requestSyncInventoryWire.js';
import { receiveRequestSyncObject, sendRequestSyncObject, type RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext, type RequestSyncWireFrame } from './requestSyncWire.js';

export async function respondRequestSyncDatabase<T>(host: RequestSyncDatabaseHost, input: {
  context: RequestSyncAuthenticatedContext;
  groupKey: Uint8Array;
  stream: FramedSyncStreamBody<RequestSyncWireFrame>;
  mode: 'inventory' | 'pull' | 'object';
  signal?: AbortSignal;
  object?: Pick<Parameters<typeof receiveRequestSyncObject>[1], 'expectedObject' | 'peerState'>;
}, consume: (stream: FramedSyncStreamBody) => Promise<T>) {
  const messages = (async function* () {
    for await (const decoded of readRequestSyncWire({ ...input, ...input.stream })) yield decoded.message;
  })();
  if (input.mode === 'pull') {
    const request = await readRequestSyncDifference(messages);
    const key = request?.facts[0];
    if (!request || !key) throw new Error('request_sync_object_identity_missing');
    const difference = await host.readSnapshot(async db => {
      const entry = await readFramedSyncInventoryEntry(db, key);
      if (!entry) throw new Error('request_sync_object_missing');
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
    await host.write(db => db.transaction(flushCurrentParentOrderProjectionsWithDbPort));
    const entries = await host.readSnapshot(readRequestSyncInventorySnapshot, input.signal);
    const selected = request.detailGlobalIds?.length ? entries.filter(entry => entry.objectType === 'node' &&
      request.detailGlobalIds!.includes(entry.globalId)) : request.summaryOnly ? framedSyncInventorySummary(entries) : entries;
    response = iterateRequestSyncInventory({ entries: selected, roundId: request.roundId });
  }
  const body = await prepareRequestSyncWire({ ...input,
    messages: async function* () { yield* response; } });
  try { return await consume(body); }
  finally {
    await body.frames.return(undefined);
  }
}
