import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';
import { REQUEST_SYNC_BATCH_OBJECTS, type RequestSyncObjectResult } from './requestSyncBatchContract.js';
import { requestSyncBatchDifferences } from './requestSyncBatchDifference.js';
import { readRequestSyncBatchResults, receiveRequestSyncBatch } from './requestSyncBatchReceiver.js';
import { requestSyncBatchMessages, withRequestSyncBatchSnapshot } from './requestSyncBatchSnapshot.js';
import { withControlRequest, type RequestSyncExchange } from './requestSyncDatabaseExchange.js';
import type { RequestSyncDatabaseHost, receiveRequestSyncObject } from './requestSyncObjectEndpoint.js';
import { prepareRequestSyncWire } from './requestSyncWire.js';

export async function transferRequestSyncBatch(host: RequestSyncDatabaseHost, exchange: RequestSyncExchange,
  differences: readonly FramedSyncInventoryDifference[],
  options: Pick<Parameters<typeof receiveRequestSyncObject>[1], 'peerState' | 'objectOptions'>) {
  const results: RequestSyncObjectResult[] = [];
  for (let offset = 0; offset < differences.length;) {
    exchange.signal?.throwIfAborted();
    const direction = differences[offset]!.direction;
    const batch: FramedSyncInventoryDifference[] = [];
    for (const difference of differences.slice(offset, offset + REQUEST_SYNC_BATCH_OBJECTS)) {
      if (difference.direction !== direction) break;
      batch.push(difference);
    }
    const next = direction === 'local_to_remote' ? await pushBatch(host, exchange, batch)
      : await pullBatch(host, exchange, batch, options);
    results.push(...next);
    offset += next.length;
  }
  return results;
}

async function pushBatch(host: RequestSyncDatabaseHost, exchange: RequestSyncExchange,
  differences: readonly FramedSyncInventoryDifference[]) {
  const requestId = crypto.getRandomValues(new Uint8Array(16));
  const selections = differences.map(difference => ({ requestId: crypto.getRandomValues(new Uint8Array(16)),
    objectType: difference.objectType, globalId: difference.globalId, resolve: async () => difference }));
  return withRequestSyncBatchSnapshot(host, selections, exchange.signal, async objects => {
    const body = await prepareRequestSyncWire({ ...exchange,
      messages: contextId => requestSyncBatchMessages(objects, contextId, requestId) });
    try {
      return await exchange.request('/companion/framed-sync?request=objects', body, response =>
        readRequestSyncBatchResults({ ...exchange, ...response }, requestId, selections.slice(0, objects.length)));
    } finally { await body.frames.return(undefined); }
  });
}

async function pullBatch(host: RequestSyncDatabaseHost, exchange: RequestSyncExchange,
  differences: readonly FramedSyncInventoryDifference[],
  options: Pick<Parameters<typeof receiveRequestSyncObject>[1], 'peerState' | 'objectOptions'>) {
  const requestId = crypto.getRandomValues(new Uint8Array(16));
  const expected = differences.map(difference => ({ requestId: crypto.getRandomValues(new Uint8Array(16)),
    objectType: difference.objectType, globalId: difference.globalId, sourceSnapshot: difference.sourceSnapshot }));
  return withControlRequest(exchange, '/companion/framed-sync?request=pulls',
    requestSyncBatchDifferences(differences, expected.map(identity => identity.requestId), requestId), async response => {
      const result = await receiveRequestSyncBatch(host, { ...exchange, ...response, ...options,
        author: 'responder', expected, requestId });
      return result.results;
    });
}
