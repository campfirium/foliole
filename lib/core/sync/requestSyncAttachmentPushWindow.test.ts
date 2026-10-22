// @vitest-environment node
import { expect, it } from 'vitest';

import { ATTACHMENT_BLOCK_BYTES as BLOCK, type AttachmentBlockResult } from './attachmentBlockReceiver.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import { attachmentMessage, attachmentRequestSchema, type AttachmentRequest } from './requestSyncAttachmentContract.js';
import { respondRequestSyncAttachments, type RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import { prepareRequestSyncWire, readRequestSyncWire } from './requestSyncWire.js';

const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'a', initiatorLibraryEpoch: 'a-epoch', responderDeviceId: 'b', responderLibraryEpoch: 'b-epoch' } as const;
const groupKey = new Uint8Array(32).fill(7);
const storageKey = `${'a'.repeat(64)}.pdf`;
const byteLength = BLOCK * 10;
const requestId = new Uint8Array(16).fill(3);

function push(offset: number, overrides: Partial<AttachmentRequest> = {}) {
  return attachmentMessage({ requestId, operation: 'push', storageKey, byteLength, offset,
    data: new Uint8Array(BLOCK).fill(offset / BLOCK), ...overrides });
}

async function respond(messages: ReturnType<typeof push>[], receive: (offset: number) => AttachmentBlockResult) {
  const applied: number[] = [];
  const host: RequestSyncAttachmentHost = { needs: async () => [], needsSlice: async () => ({ keys: [], pending: false }),
    status: async () => ({ kind: 'partial', offset: 0 }),
    receive: async (_resource, offset) => { applied.push(offset); return receive(offset); },
    withFile: async () => { throw new Error('unexpected source'); } };
  const stream = await prepareRequestSyncWire({ context, groupKey, messages: async function* () { yield* messages; } });
  try {
    const replies = await respondRequestSyncAttachments(host, { context, groupKey, stream }, async response => {
      const values = [];
      for await (const { message } of readRequestSyncWire({ context, groupKey, ...response })) values.push(attachmentRequestSchema.parse(message.payload));
      return values;
    });
    return { applied, replies };
  } finally { await stream.frames.return(undefined); }
}

it('applies a consecutive push window from one request and replies once', async () => {
  const { applied, replies } = await respond([push(0), push(BLOCK), push(BLOCK * 2)],
    offset => ({ kind: 'partial', offset: offset + BLOCK }));
  expect(applied).toEqual([0, BLOCK, BLOCK * 2]);
  expect(replies).toHaveLength(1);
  expect(replies[0]).toMatchObject({ operation: 'push', state: 'partial', offset: BLOCK * 3 });
});

it('stops at the first block the receiver does not accept', async () => {
  const { applied, replies } = await respond([push(BLOCK), push(BLOCK * 2)], () => ({ kind: 'offset', offset: 0 }));
  expect(applied).toEqual([BLOCK]);
  expect(replies[0]).toMatchObject({ state: 'offset', offset: 0 });
});

it.each([
  ['a gap between blocks', [push(0), push(BLOCK * 2)]],
  ['another file', [push(0), push(BLOCK, { storageKey: `${'b'.repeat(64)}.pdf` })]],
  ['another request', [push(0), push(BLOCK, { requestId: new Uint8Array(16).fill(4) })]],
  ['a non-push window', [push(0, { operation: 'status', data: new Uint8Array() }), push(BLOCK)]],
  ['more than eight blocks', Array.from({ length: 9 }, (_, index) => push(index * BLOCK))]
])('rejects a push window with %s', async (_label, messages) => {
  await expect(respond(messages, offset => ({ kind: 'partial', offset: offset + BLOCK }))).rejects.toThrow();
});
