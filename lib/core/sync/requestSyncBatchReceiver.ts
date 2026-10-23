import { bytes, unsigned } from './framedSyncDecodedValues.js';
import { decodeFramedSyncPreamble } from './framedSyncFraming.js';
import type { FramedSyncInventoryEntry, FramedSyncInventoryNeed } from './framedSyncInventory.js';
import { applyReceivedRequestSyncBatch, type StagedRequestSyncObject } from './requestSyncBatchApply.js';
import { assertRequestSyncBatchEnd, assertRequestSyncObjectIdentity, readRequestSyncObjectIdentity,
  readRequestSyncObjectResult, REQUEST_SYNC_BATCH_OBJECTS,
  type RequestSyncObjectIdentity, type RequestSyncObjectResult } from './requestSyncBatchContract.js';
import { withRequestSyncFiles } from './requestSyncFiles.js';
import type { RequestSyncDatabaseHost, receiveRequestSyncObject } from './requestSyncObjectEndpoint.js';
import { assertRequestSyncObjectSource } from './requestSyncObjectMessages.js';
import { receiveRequestSyncObjectMessages, type RequestSyncDecodedMessage } from './requestSyncObjectReceiver.js';
import { assertReceivedRequestFacts } from './requestSyncReceivedSelection.js';
import { readRequestSyncWire } from './requestSyncWire.js';

type ReceiveInput = Omit<Parameters<typeof receiveRequestSyncObject>[1], 'expectedObject'> & {
  expected?: readonly (RequestSyncObjectIdentity & { sourceSnapshot?: FramedSyncInventoryEntry; need?: FramedSyncInventoryNeed })[];
  requestId?: Uint8Array;
};

export async function receiveRequestSyncBatch(host: RequestSyncDatabaseHost, input: ReceiveInput) {
  const messages = readRequestSyncWire(input);
  const batch: ReceivingBatch = { host, input, messages, results: [], staged: [], identities: new Set() };
  try { return await receiveNext(batch); }
  finally { await messages.return(undefined); }
}

/** A broken stream still commits the objects that arrived complete before it, as a retry would. */
async function keepCompletedObjects(batch: ReceivingBatch, error: unknown): Promise<never> {
  const staged = batch.staged.splice(0);
  if (staged.length && !batch.input.signal?.aborted) await applyReceivedRequestSyncBatch(batch.host, batch.input, staged);
  throw error;
}

type ReceivingBatch = {
  host: RequestSyncDatabaseHost;
  input: ReceiveInput;
  messages: AsyncIterator<RequestSyncDecodedMessage>;
  results: (RequestSyncObjectResult | null)[];
  staged: (StagedRequestSyncObject & { index: number })[];
  identities: Set<string>;
};

/** Each staged object keeps its files open until the whole batch has been applied. */
async function receiveNext(batch: ReceivingBatch): Promise<{ requestId: Uint8Array; results: RequestSyncObjectResult[] }> {
  try { return await receiveRest(batch); }
  catch (error) { return keepCompletedObjects(batch, error); }
}

async function receiveRest(batch: ReceivingBatch): Promise<{ requestId: Uint8Array; results: RequestSyncObjectResult[] }> {
  const { input, messages, results } = batch;
  for (;;) {
    const next = await messages.next();
    if (next.done) throw new Error('request_sync_batch_end_missing');
    const { message } = next.value;
    if (message.payloadCase === 'request_batch_end') {
      const requestId = input.requestId ?? bytes(message.payload.requestId, 'request_id');
      assertRequestSyncBatchEnd(message, requestId, results.length);
      if (!(await messages.next()).done) throw new Error('request_sync_batch_trailing_data');
      const staged = batch.staged.splice(0);
      const applied = await applyReceivedRequestSyncBatch(batch.host, input, staged);
      staged.forEach((object, position) => { results[object.index] = applied[position]!; });
      return { requestId, results: results as RequestSyncObjectResult[] };
    }
    const identity = readRequestSyncObjectIdentity(message);
    const key = `${identity.objectType}\0${identity.globalId}`;
    if (batch.identities.has(key) || results.length >= REQUEST_SYNC_BATCH_OBJECTS) throw new Error('request_sync_batch_identity_duplicate');
    batch.identities.add(key);
    const expected = input.expected?.[results.length];
    if (input.expected) {
      if (!expected) throw new Error('request_sync_batch_unexpected_object');
      assertRequestSyncObjectIdentity(identity, expected);
    }
    if (message.payloadCase === 'request_object_result') {
      const result = readRequestSyncObjectResult(message);
      if (!result.error) throw new Error('request_sync_batch_object_missing');
      results.push(result);
      continue;
    }
    return withRequestSyncFiles(batch.host.files, async files => {
      const header = await receiveRequestSyncObjectMessages(objectMessages(next.value, messages),
        decodeFramedSyncPreamble(input.preamble).contextId, files);
      assertRequestSyncObjectSource(header, expected?.sourceSnapshot);
      if (expected?.need) await assertReceivedRequestFacts(files, expected.need);
      batch.staged.push({ header, files, index: results.length });
      results.push(null);
      return receiveNext(batch);
    }, input.signal);
  }
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
