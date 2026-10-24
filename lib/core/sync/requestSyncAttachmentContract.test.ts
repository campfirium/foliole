import { expect, it } from 'vitest';

import { FRAMED_SYNC_FRAME_TYPES } from './framedSyncContract.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { attachmentMessage, attachmentRequestSchema, assertAttachmentResponse } from './requestSyncAttachmentContract.js';

const requestId = new Uint8Array(16).fill(1);
const storageKey = `${'a'.repeat(64)}.pdf`;
const message = { requestId, storageKey, operation: 'push' as const,
  byteLength: 524289, offset: 524288, data: Uint8Array.of(1) };

it('round-trips the block identity, offset and bytes through the production codec', () => {
  const input = attachmentMessage(message);
  const bytes = encodeValidatedProtocolMessage(input.payloadCase, input.payload);
  const decoded = decodeAndValidateProtocolMessage(bytes, FRAMED_SYNC_FRAME_TYPES.sessionControl);
  const parsed = attachmentRequestSchema.parse(decoded.payload);
  expect(parsed).toMatchObject({ storageKey, operation: 'push', byteLength: 524289, offset: 524288 });
  expect(Array.from(parsed.data)).toEqual([1]);
  expect(Array.from(parsed.requestId)).toEqual(Array.from(requestId));
});

it.each([
  { maxBlocks: 33 }, { maxBlocks: -1 }, { pending: 'true' },
  { storageKey: '../file.pdf' }, { requestId: new Uint8Array(15) }, { offset: -1 },
  { offset: '18446744073709551615' }, { data: new Uint8Array(524289) },
  { operation: 'delete' }, { state: 'accepted' }, { storageKeys: Array(257).fill(storageKey) }
])('rejects invalid attachment request fields %j', invalid => {
  expect(() => encodeValidatedProtocolMessage('request_attachment', { ...message, ...invalid })).toThrow();
});

it('rejects a valid encrypted reply belonging to a different request or attachment', () => {
  const request = attachmentRequestSchema.parse(message);
  for (const changed of [{ requestId: new Uint8Array(16).fill(2) },
    { operation: 'status' as const }, { storageKey: `${'b'.repeat(64)}.pdf` }]) {
    expect(() => assertAttachmentResponse({ ...request, ...changed }, request))
      .toThrow('attachment_response_identity_mismatch');
  }
});

it('round-trips scan continuation and bounded pull windows through the production codec', () => {
  for (const fields of [{ operation: 'needs', pending: true }, { operation: 'pull', maxBlocks: 32 }]) {
    const input = attachmentMessage({ ...message, ...fields, operation: fields.operation as 'needs' | 'pull' });
    const decoded = decodeAndValidateProtocolMessage(encodeValidatedProtocolMessage(input.payloadCase, input.payload),
      FRAMED_SYNC_FRAME_TYPES.sessionControl);
    expect(attachmentRequestSchema.parse(decoded.payload)).toMatchObject(fields);
  }
});
