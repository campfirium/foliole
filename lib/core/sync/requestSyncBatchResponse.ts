import type { FramedSyncStreamBody } from './framedSyncBinaryStream.js';
import { resolveFramedSyncDifferenceRequest } from './framedSyncDifferenceRequest.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';
import { requestSyncBatchEnd } from './requestSyncBatchContract.js';
import { readRequestSyncBatchDifferences } from './requestSyncBatchDifference.js';
import { receiveRequestSyncBatch } from './requestSyncBatchReceiver.js';
import { requestSyncBatchMessages, withRequestSyncBatchSnapshot } from './requestSyncBatchSnapshot.js';
import type { RequestSyncDatabaseResponseInput } from './requestSyncDatabaseResponse.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';
import { prepareRequestSyncWire, readRequestSyncWire } from './requestSyncWire.js';

export async function respondRequestSyncBatch<T>(host: RequestSyncDatabaseHost,
  input: RequestSyncDatabaseResponseInput, consume: (stream: FramedSyncStreamBody) => Promise<T>): Promise<T> {
  if (input.mode === 'pulls') {
    const { requestId, requests } = await readRequestSyncBatchDifferences((async function* () {
      for await (const decoded of readRequestSyncWire({ ...input, ...input.stream })) yield decoded.message;
    })());
    const selections = requests.map(request => ({ requestId: request.roundId,
      objectType: request.facts[0]!.objectType, globalId: request.facts[0]!.globalId,
      resolve: async (db: Parameters<typeof readFramedSyncInventoryEntry>[0]) => {
        const entry = await readFramedSyncInventoryEntry(db, request.facts[0]!);
        if (!entry) throw new Error('request_sync_object_missing');
        return resolveFramedSyncDifferenceRequest(entry, request);
      } }));
    return withRequestSyncBatchSnapshot(host, selections, input.signal, objects =>
      send(input, contextId => requestSyncBatchMessages(objects, contextId, requestId), consume));
  }
  if (!input.batch) throw new Error('request_sync_peer_state_missing');
  const result = await receiveRequestSyncBatch(host, { ...input, ...input.stream, ...input.batch, author: 'initiator' });
  return send(input, async function* () {
    for (const object of result.results) yield { payloadCase: 'request_object_result', payload: object };
    yield requestSyncBatchEnd(result.requestId, result.results.length);
  }, consume);
}

async function send<T>(input: RequestSyncDatabaseResponseInput,
  messages: (contextId: Uint8Array) => AsyncIterable<RequestSyncMessage>, consume: (stream: FramedSyncStreamBody) => Promise<T>): Promise<T> {
  const stream = await prepareRequestSyncWire({ ...input, messages });
  try { return await consume(stream); }
  finally { await stream.frames.return(undefined); }
}
