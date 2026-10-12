import { z } from 'zod';

import { ATTACHMENT_BLOCK_BYTES, attachmentBlockResourceSchema } from './attachmentBlockReceiver.js';
import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { bytes } from './framedSyncDecodedValues.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';

const integer = z.union([z.number(), z.string().regex(/^\d+$/u).transform(Number)])
  .pipe(z.number().int().nonnegative().max(FRAMED_SYNC_LIMITS.maxBlobBytes));
const key = attachmentBlockResourceSchema.shape.storageKey;
const binary = z.unknown().transform(value => bytes(value, 'attachment'));
export const attachmentRequestSchema = z.object({
  requestId: binary.refine(bytes => bytes.length === 16),
  operation: z.enum(['needs', 'describe', 'pull', 'status', 'push']),
  storageKey: z.union([key, z.literal('')]).default(''),
  byteLength: integer.default(0),
  offset: integer.default(0),
  data: binary.refine(bytes => bytes.length <= ATTACHMENT_BLOCK_BYTES)
    .default(() => new Uint8Array()),
  storageKeys: z.array(key).max(256).default([]),
  state: z.enum(['', 'partial', 'complete', 'offset', 'block', 'end']).default('')
});
export type AttachmentRequest = z.infer<typeof attachmentRequestSchema>;

export function attachmentMessage(input: z.input<typeof attachmentRequestSchema>): RequestSyncMessage {
  return { payloadCase: 'request_attachment', payload: attachmentRequestSchema.parse(input) };
}

export function assertAttachmentResponse(message: AttachmentRequest, request: AttachmentRequest) {
  if (message.operation !== request.operation || message.storageKey !== request.storageKey ||
      !message.requestId.every((byte, index) => request.requestId[index] === byte)) {
    throw new Error('attachment_response_identity_mismatch');
  }
}
