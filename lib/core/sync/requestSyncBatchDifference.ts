import { bytes } from './framedSyncDecodedValues.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';
import type { ValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { assertRequestSyncBatchEnd, REQUEST_SYNC_BATCH_OBJECTS, requestSyncBatchEnd, sameRequestId } from './requestSyncBatchContract.js';
import { readRequestSyncDifference, requestSyncDifferenceMessages } from './requestSyncDifferenceWire.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';

export async function* requestSyncBatchDifferences(differences: readonly FramedSyncInventoryDifference[],
  identities: readonly Uint8Array[], requestId: Uint8Array): AsyncGenerator<RequestSyncMessage> {
  for (const [index, difference] of differences.entries()) {
    yield* requestSyncDifferenceMessages(difference, identities[index]);
  }
  yield requestSyncBatchEnd(requestId, differences.length);
}

export async function readRequestSyncBatchDifferences(messages: AsyncIterable<ValidatedProtocolMessage>) {
  const requests: Awaited<ReturnType<typeof readRequestSyncDifference>>[] = [];
  let parts: ValidatedProtocolMessage[] = [];
  let currentId: Uint8Array | undefined;
  let requestId: Uint8Array | undefined;
  const finishObject = async () => {
    if (!parts.length) return;
    if (requests.length >= REQUEST_SYNC_BATCH_OBJECTS) throw new Error('request_sync_batch_size_invalid');
    requests.push(await readRequestSyncDifference((async function* () { yield* parts; })()));
    parts = [];
  };
  for await (const message of messages) {
    if (requestId) throw new Error('request_sync_batch_trailing_data');
    if (message.payloadCase === 'request_batch_end') {
      await finishObject();
      requestId = bytes(message.payload.requestId, 'request_id');
      assertRequestSyncBatchEnd(message, requestId, requests.length);
    } else {
      if (message.payloadCase !== 'difference_request') throw new Error('framed_sync_difference_request_required');
      const id = bytes(message.payload.roundId, 'round_id');
      if (currentId && !sameRequestId(currentId, id)) await finishObject();
      currentId = id;
      parts.push(message);
    }
  }
  if (!requestId) throw new Error('request_sync_batch_end_missing');
  const unique = new Set(requests.map(request => `${request.objectType}\0${request.globalId}`));
  if (unique.size !== requests.length) throw new Error('request_sync_batch_identity_duplicate');
  return { requestId, requests };
}
