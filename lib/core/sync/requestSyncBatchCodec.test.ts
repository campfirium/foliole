import { expect, it } from 'vitest';

import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { bytes } from './framedSyncDecodedValues.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { frameTypeForPayload } from './framedSyncReceiver.js';

const requestId = new Uint8Array(16).fill(7);
const result = { requestId, objectType: 'node', globalId: 'node-1', error: '' };

it.each(['', 'node_version_missing_parents:version-1'])('round trips each object result with error %j', error => {
  const payload = { ...result, error };
  const encoded = encodeValidatedProtocolMessage('request_object_result', payload);
  const decoded = decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.sessionControl);
  expect(decoded.payloadCase).toBe('request_object_result');
  expect({ ...decoded.payload, requestId: Uint8Array.from(bytes(decoded.payload.requestId, 'request_id')) }).toEqual(payload);
  expect(frameTypeForPayload(decoded.payloadCase)).toBe(FRAMED_SYNC_FRAME_TYPES.sessionControl);
});

it.each([0, 1, 128, 0xffff_ffff])('round trips the authenticated batch count %i', objectCount => {
  const payload = { requestId, objectCount };
  const encoded = encodeValidatedProtocolMessage('request_batch_end', payload);
  const decoded = decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.sessionControl);
  expect(decoded.payloadCase).toBe('request_batch_end');
  expect({ ...decoded.payload, requestId: Uint8Array.from(bytes(decoded.payload.requestId, 'request_id')) }).toEqual(payload);
  expect(frameTypeForPayload(decoded.payloadCase)).toBe(FRAMED_SYNC_FRAME_TYPES.sessionControl);
  expect(() => decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.fact))
    .toThrow('frame_payload_type_mismatch');
});

it.each([-1, 1.5, 0x1_0000_0000])('rejects an invalid batch count %s before protobuf truncation', objectCount => {
  expect(() => encodeValidatedProtocolMessage('request_batch_end', { requestId, objectCount })).toThrow();
});

it.each(['request_object_result', 'request_batch_end'] as const)('requires a 16-byte correlation id for %s', payloadCase => {
  expect(() => encodeValidatedProtocolMessage(payloadCase, { ...result, objectCount: 1, requestId: new Uint8Array(15) }))
    .toThrow('request_id_length_invalid');
});

it('rejects missing object identity, non-string errors and oversized errors', () => {
  for (const invalid of [{ globalId: '' }, { objectType: '' }, { error: 1 },
    { error: 'x'.repeat(FRAMED_SYNC_LIMITS.maxProtocolStringBytes + 1) }]) {
    expect(() => encodeValidatedProtocolMessage('request_object_result', { ...result, ...invalid })).toThrow();
  }
});
