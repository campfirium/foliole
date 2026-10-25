import { expect, it } from 'vitest';

import { AttachmentBatchBudget, assertAttachmentBatchQueries } from './attachmentBatchContract.js';
import { AttachmentBatchResponse } from './attachmentBatchResponse.js';
import { ATTACHMENT_BLOCK_BYTES } from './attachmentBlockReceiver.js';
import { attachmentMessage, attachmentRequestSchema, type AttachmentRequest } from './requestSyncAttachmentContract.js';
import { encodeRequestSyncMessage } from './requestSyncObjectMessages.js';

const query = (storageKey = `${'a'.repeat(64)}.png`, offset = 0) => attachmentRequestSchema.parse({
  requestId: new Uint8Array(16).fill(1), operation: 'batch_pull', storageKey, offset
});
const frame = (request: AttachmentRequest, fields: Partial<AttachmentRequest>) => attachmentRequestSchema.parse({ ...request, ...fields });
function accept(receiver: AttachmentBatchResponse, value: AttachmentRequest) {
  return receiver.accept(value, encodeRequestSyncMessage(attachmentMessage(value)).length);
}

it('keeps an overlong unknown partial untouched and permits the next empty file to finish independently', () => {
  const first = query(undefined, 2 * ATTACHMENT_BLOCK_BYTES);
  const empty = query(`${'b'.repeat(64)}.png`);
  const receiver = new AttachmentBatchResponse([first, empty]);
  expect(accept(receiver, frame(first, { state: 'restart', byteLength: 128 * 1024 }))).toMatchObject({
    kind: 'restart', byteLength: 128 * 1024, offset: 2 * ATTACHMENT_BLOCK_BYTES
  });
  expect(accept(receiver, frame(empty, { state: 'description' })).kind).toBe('description');
  expect(accept(receiver, frame(empty, { state: 'file_end' })).kind).toBe('file_end');
  expect(accept(receiver, frame(first, { state: 'batch_end', storageKey: '', offset: 0 })).kind).toBe('batch_end');
  expect(() => receiver.finish()).not.toThrow();
  expect(() => accept(receiver, frame(empty, { state: 'description' }))).toThrow();
});

it.each(['missing-file-end', 'missing-batch-end', 'wrong-key', 'wrong-offset', 'wrong-length', 'duplicate-description'])('rejects %s without declaring a complete batch', fault => {
  const request = query();
  const receiver = new AttachmentBatchResponse([request]);
  const description = frame(request, { state: 'description', byteLength: 3 });
  accept(receiver, description);
  if (fault === 'duplicate-description') expect(() => accept(receiver, description)).toThrow();
  else {
    const data = frame(request, { state: 'block', byteLength: 3, data: Uint8Array.of(1, 2, 3),
      ...(fault === 'wrong-key' ? { storageKey: `${'b'.repeat(64)}.png` } : {}),
      ...(fault === 'wrong-offset' ? { offset: 1 } : {}), ...(fault === 'wrong-length' ? { byteLength: 4 } : {}) });
    if (fault.startsWith('wrong')) expect(() => accept(receiver, data)).toThrow();
    else {
      accept(receiver, data);
      if (fault === 'missing-file-end') expect(() => accept(receiver, frame(request, { state: 'batch_end', storageKey: '', offset: 3 }))).toThrow();
      else accept(receiver, frame(request, { state: 'file_end', byteLength: 3, offset: 3 }));
    }
  }
  expect(() => receiver.finish()).toThrow('attachment_batch_incomplete');
});

it('forbids a second writer for the canonical partial even when the extension differs', () => {
  expect(() => assertAttachmentBatchQueries([query(), query(`${'a'.repeat(64)}.pdf`)])).toThrow();
});

it('requires a short range to be followed by the batch end instead of silently skipping to another file', () => {
  const first = query(), next = query(`${'b'.repeat(64)}.png`);
  const receiver = new AttachmentBatchResponse([first, next]);
  accept(receiver, frame(first, { state: 'description', byteLength: ATTACHMENT_BLOCK_BYTES }));
  expect(accept(receiver, frame(first, { state: 'range_end', byteLength: ATTACHMENT_BLOCK_BYTES })).kind).toBe('range_end');
  expect(() => accept(receiver, frame(next, { state: 'description' }))).toThrow();
});

it('caps actual cross-file payload, frame count, and metadata independently', () => {
  const payload = new AttachmentBatchBudget();
  const data = new Uint8Array(ATTACHMENT_BLOCK_BYTES);
  const block = frame(query(), { state: 'block', byteLength: ATTACHMENT_BLOCK_BYTES, data });
  for (let index = 0; index < 32; index++) payload.account(block);
  expect(() => payload.account(block)).toThrow('attachment_batch_budget_exceeded');
  const metadata = new AttachmentBatchBudget();
  expect(() => metadata.account(query(), 24585)).toThrow('attachment_batch_budget_exceeded');
  const count = new AttachmentBatchBudget();
  for (let index = 0; index < 1024; index++) count.account(query(), 1);
  expect(() => count.account(query(), 1)).toThrow('attachment_batch_budget_exceeded');
});
