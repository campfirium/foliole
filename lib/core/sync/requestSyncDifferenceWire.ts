import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { decodeFramedSyncDifferenceRequest, projectFramedSyncDifferenceRequestPayload } from './framedSyncDifferenceRequest.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';
import { encodeValidatedProtocolMessage, type ValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';

export async function* requestSyncDifferenceMessages(difference: FramedSyncInventoryDifference): AsyncGenerator<RequestSyncMessage> {
  const payload = projectFramedSyncDifferenceRequestPayload({ difference, roundId: crypto.getRandomValues(new Uint8Array(16)) });
  for (let offset = 0; offset < payload.facts.length;) {
    let count = Math.min(512, payload.facts.length - offset);
    for (;;) {
      const part = { ...payload, facts: payload.facts.slice(offset, offset + count), blobHashes: offset ? [] : payload.blobHashes };
      const encoded = encodeValidatedProtocolMessage('difference_request', part);
      if (encoded.length <= FRAMED_SYNC_LIMITS.maxControlMessageBytes) {
        yield { payloadCase: 'difference_request', payload: part };
        offset += count;
        break;
      }
      if (count === 1) throw new Error('request_sync_difference_frame_limit_exceeded');
      count = Math.max(1, Math.floor(count / 2));
    }
  }
  if (!payload.facts.length) throw new Error('request_sync_object_identity_missing');
}

export async function readRequestSyncDifference(messages: AsyncIterable<ValidatedProtocolMessage>) {
  let request: ReturnType<typeof decodeFramedSyncDifferenceRequest> | undefined;
  const identities = new Set<string>();
  for await (const message of messages) {
    const part = decodeFramedSyncDifferenceRequest(message);
    if (part.resources.length || !part.facts.length) throw new Error('framed_sync_database_request_required');
    const first = request?.facts[0] ?? part.facts[0]!;
    for (const fact of part.facts) {
      if (fact.globalId !== first.globalId || fact.objectType !== first.objectType) throw new Error('request_sync_single_object_required');
      const key = `${fact.kind}\0${fact.factId}`;
      if (identities.has(key)) throw new Error('request_sync_duplicate_fact');
      identities.add(key);
    }
    if (request) {
      if (!equal(request.roundId, part.roundId) || !equal(request.sourceStateHash, part.sourceStateHash) || part.blobHashes.length) {
        throw new Error('request_sync_difference_identity_mismatch');
      }
      request.facts.push(...part.facts);
    } else request = part;
  }
  if (!request) throw new Error('request_sync_object_identity_missing');
  return request;
}

function equal(left?: Uint8Array, right?: Uint8Array) {
  return left !== undefined && right !== undefined && left.length === right.length && left.every((value, index) => right[index] === value);
}
