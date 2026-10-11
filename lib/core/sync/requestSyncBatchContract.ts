import { bytesToHex } from '@noble/hashes/utils.js';

import { bytes, text, unsigned } from './framedSyncDecodedValues.js';
import type { ValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';

export const REQUEST_SYNC_BATCH_OBJECTS = 128;
export const REQUEST_SYNC_BATCH_BYTES = 1024 * 1024;

export type RequestSyncObjectIdentity = { requestId: Uint8Array; objectType: string; globalId: string };
export type RequestSyncObjectResult = RequestSyncObjectIdentity & { error: string };

export function sameRequestId(left: Uint8Array, right: Uint8Array) {
  return bytesToHex(left) === bytesToHex(right);
}

export function readRequestSyncObjectIdentity(message: ValidatedProtocolMessage): RequestSyncObjectIdentity {
  return { requestId: bytes(message.payload.requestId, 'request_id'),
    objectType: text(message.payload.objectType, 'object_type'), globalId: text(message.payload.globalId, 'global_id') };
}

export function readRequestSyncObjectResult(message: ValidatedProtocolMessage): RequestSyncObjectResult {
  if (message.payloadCase !== 'request_object_result' || typeof message.payload.error !== 'string') {
    throw new Error('request_sync_batch_result_invalid');
  }
  return { ...readRequestSyncObjectIdentity(message), error: message.payload.error };
}

export function requestSyncBatchEnd(requestId: Uint8Array, objectCount: number): RequestSyncMessage {
  return { payloadCase: 'request_batch_end', payload: { requestId, objectCount } };
}

export function assertRequestSyncBatchEnd(message: ValidatedProtocolMessage, requestId: Uint8Array, count: number) {
  if (message.payloadCase !== 'request_batch_end' || !sameRequestId(bytes(message.payload.requestId, 'request_id'), requestId) ||
      unsigned(message.payload.objectCount, 'object_count') !== BigInt(count) || !count || count > REQUEST_SYNC_BATCH_OBJECTS) {
    throw new Error('request_sync_batch_end_invalid');
  }
}

export function assertRequestSyncObjectIdentity(actual: RequestSyncObjectIdentity, expected: RequestSyncObjectIdentity) {
  if (!sameRequestId(actual.requestId, expected.requestId) || actual.objectType !== expected.objectType || actual.globalId !== expected.globalId) {
    throw new Error('request_sync_batch_identity_mismatch');
  }
}
