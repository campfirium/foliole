import { z } from 'zod';

import { ATTACHMENT_BLOCK_BYTES, attachmentBlockResourceSchema } from './attachmentBlockReceiver.js';
import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { bytes } from './framedSyncDecodedValues.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';

/** Pull responses and push requests each carry at most this many consecutive blocks (4 MiB). */
export const ATTACHMENT_WINDOW_BLOCKS = 8;
const integer = z.union([z.number(), z.string().regex(/^\d+$/u).transform(Number)])
  .pipe(z.number().int().nonnegative().max(FRAMED_SYNC_LIMITS.maxBlobBytes));
const key = attachmentBlockResourceSchema.shape.storageKey;
const binary = z.unknown().transform(value => bytes(value, 'attachment'));
/** Pull and push windows retain individually authenticated blocks and a resumable end offset. */
export const attachmentRequestSchema = z.object({
  requestId: binary.refine(bytes => bytes.length === 16),
  derive: z.enum(['', 'pdf_text']).default(''),
  extractorVersion: z.number().int().nonnegative().default(0),
  operation: z.enum(['needs', 'describe', 'pull', 'status', 'push']),
  storageKey: z.union([key, z.literal('')]).default(''),
  byteLength: integer.default(0),
  offset: integer.default(0),
  data: binary.refine(bytes => bytes.length <= ATTACHMENT_BLOCK_BYTES)
    .default(() => new Uint8Array()),
  storageKeys: z.array(key).max(256).default([]),
  pending: z.boolean().default(false),
  parsingPending: z.boolean().default(false),
  maxBlocks: z.number().int().min(0).max(ATTACHMENT_WINDOW_BLOCKS).transform(value => value || 1).default(1),
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

/** A push window is consecutive blocks of one file under one request ID; any other multi-message request is invalid. */
export function assertAttachmentPushWindow(messages: readonly AttachmentRequest[]) {
  const [first] = messages;
  if (!first || messages.length > ATTACHMENT_WINDOW_BLOCKS) throw new Error('attachment_push_window_invalid');
  if (messages.length === 1) return;
  let next = first.offset;
  for (const message of messages) {
    if (message.operation !== 'push' || message.derive || message.state || message.offset !== next ||
        message.storageKey !== first.storageKey || message.byteLength !== first.byteLength ||
        !message.requestId.every((byte, index) => first.requestId[index] === byte)) throw new Error('attachment_push_window_invalid');
    next += message.data.length;
  }
}
