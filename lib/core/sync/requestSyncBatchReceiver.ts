import { bytes, unsigned } from './framedSyncDecodedValues.js';
import { decodeFramedSyncPreamble } from './framedSyncFraming.js';
import { assertRequestSyncBatchEnd, assertRequestSyncObjectIdentity, readRequestSyncObjectIdentity,
  readRequestSyncObjectResult, REQUEST_SYNC_BATCH_OBJECTS,
  type RequestSyncObjectIdentity, type RequestSyncObjectResult } from './requestSyncBatchContract.js';
import { withRequestSyncFiles } from './requestSyncFiles.js';
import { applyReceivedRequestSyncObject, type RequestSyncDatabaseHost, type receiveRequestSyncObject } from './requestSyncObjectEndpoint.js';
import { receiveRequestSyncObjectMessages, type RequestSyncDecodedMessage } from './requestSyncObjectReceiver.js';
import { readRequestSyncWire } from './requestSyncWire.js';

type ReceiveInput = Omit<Parameters<typeof receiveRequestSyncObject>[1], 'expectedObject'> & {
  expected?: readonly RequestSyncObjectIdentity[];
  requestId?: Uint8Array;
};

export async function receiveRequestSyncBatch(host: RequestSyncDatabaseHost, input: ReceiveInput) {
  const messages = readRequestSyncWire(input);
  const results: RequestSyncObjectResult[] = [];
  const identities = new Set<string>();
  try {
    for (;;) {
      const next = await messages.next();
      if (next.done) throw new Error('request_sync_batch_end_missing');
      const { message } = next.value;
      if (message.payloadCase === 'request_batch_end') {
        const requestId = input.requestId ?? bytes(message.payload.requestId, 'request_id');
        assertRequestSyncBatchEnd(message, requestId, results.length);
        if (!(await messages.next()).done) throw new Error('request_sync_batch_trailing_data');
        return { requestId, results };
      }
      const identity = readRequestSyncObjectIdentity(message);
      const key = `${identity.objectType}\0${identity.globalId}`;
      if (identities.has(key) || results.length >= REQUEST_SYNC_BATCH_OBJECTS) throw new Error('request_sync_batch_identity_duplicate');
      identities.add(key);
      if (input.expected) {
        const expected = input.expected[results.length];
        if (!expected) throw new Error('request_sync_batch_unexpected_object');
        assertRequestSyncObjectIdentity(identity, expected);
      }
      if (message.payloadCase === 'request_object_result') {
        const result = readRequestSyncObjectResult(message);
        if (!result.error) throw new Error('request_sync_batch_object_missing');
        results.push(result);
      } else results.push(await receiveObject(host, input, next.value, messages));
    }
  } finally { await messages.return(undefined); }
}

async function receiveObject(host: RequestSyncDatabaseHost, input: ReceiveInput,
  first: RequestSyncDecodedMessage, messages: AsyncIterator<RequestSyncDecodedMessage>) {
  return withRequestSyncFiles(host.files, async files => {
    const header = await receiveRequestSyncObjectMessages(objectMessages(first, messages),
      decodeFramedSyncPreamble(input.preamble).contextId, files);
    try {
      await applyReceivedRequestSyncObject(host, input, header, files);
      return { ...header, error: '' };
    } catch (error) {
      input.signal?.throwIfAborted();
      return { ...header, error: error instanceof Error ? error.message : String(error) };
    }
  }, input.signal);
}

async function* objectMessages(first: RequestSyncDecodedMessage, messages: AsyncIterator<RequestSyncDecodedMessage>) {
  yield first;
  for (;;) {
    const next = await messages.next();
    if (next.done) throw new Error('request_sync_object_incomplete');
    yield next.value;
    if (next.value.message.payloadCase === 'request_object_end') return;
  }
}

export async function readRequestSyncBatchResults(input: Parameters<typeof readRequestSyncWire>[0],
  requestId: Uint8Array, expected: readonly RequestSyncObjectIdentity[]) {
  const results: RequestSyncObjectResult[] = [];
  let ended = false;
  for await (const { message } of readRequestSyncWire(input)) {
    if (ended) throw new Error('request_sync_batch_trailing_data');
    if (message.payloadCase === 'request_batch_end') {
      assertRequestSyncBatchEnd(message, requestId, results.length);
      if (unsigned(message.payload.objectCount, 'object_count') !== BigInt(expected.length)) throw new Error('request_sync_batch_results_missing');
      ended = true;
    } else {
      const result = readRequestSyncObjectResult(message);
      const identity = expected[results.length];
      if (!identity) throw new Error('request_sync_batch_unexpected_result');
      assertRequestSyncObjectIdentity(result, identity);
      results.push(result);
    }
  }
  if (!ended) throw new Error('request_sync_batch_end_missing');
  return results;
}
