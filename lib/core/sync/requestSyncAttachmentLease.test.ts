// @vitest-environment node
import { createHash } from 'node:crypto';

import { afterEach, expect, it, vi } from 'vitest';

import { ATTACHMENT_BLOCK_BYTES } from './attachmentBlockReceiver.js';
import { requestAttachmentWorkYield } from './attachmentWorkBudget.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import { attachmentMessage, attachmentRequestSchema } from './requestSyncAttachmentContract.js';
import { respondRequestSyncAttachments, type RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import { prepareRequestSyncWire, readRequestSyncWire } from './requestSyncWire.js';
import { createSyncPeerRoundOwnership } from './syncPeerRoundOwnership.js';

afterEach(() => vi.useRealTimers());

it.each([{ maxBlocks: 1, expected: 1, interrupt: false }, { maxBlocks: 8, expected: 2, interrupt: false },
  { maxBlocks: 8, expected: 1, interrupt: true }])('bounds an encrypted pull window and renews its lease: %j', async ({ maxBlocks, expected, interrupt }) => {
  vi.useFakeTimers();
  const owner = createSyncPeerRoundOwnership(200);
  const lease = owner.acceptInbound('peer', 'round', true);
  const bytes = new Uint8Array(ATTACHMENT_BLOCK_BYTES * 4).fill(7);
  const storageKey = `${createHash('sha256').update(bytes).digest('hex')}.png`;
  const starts = Array.from({ length: 4 }, () => deferred());
  const releases = Array.from({ length: 4 }, () => deferred());
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: 'a', initiatorLibraryEpoch: 'a-epoch', responderDeviceId: 'b', responderLibraryEpoch: 'b-epoch' } as const;
  const groupKey = new Uint8Array(32).fill(7);
  const stream = await prepareRequestSyncWire({ context, groupKey, messages: async function* () {
    yield attachmentMessage({ operation: 'pull', requestId: new Uint8Array(16), storageKey, byteLength: bytes.length, maxBlocks });
  } });
  const host: RequestSyncAttachmentHost = { needs: async () => [], needsSlice: async () => ({ keys: [], pending: false }),
    status: async () => { throw new Error('unexpected status'); },
    receive: async () => { throw new Error('unexpected receive'); },
    withFile: async (_key, consume) => consume({ resource: { storageKey, byteLength: bytes.length },
      read: async (offset, length) => {
        const index = offset / ATTACHMENT_BLOCK_BYTES;
        starts[index]!.resolve();
        await releases[index]!.promise;
        if (interrupt) requestAttachmentWorkYield();
        return bytes.subarray(offset, offset + length);
      } }) };
  const work = respondRequestSyncAttachments(host, { context, groupKey, stream, signal: lease.signal,
    onProgress: () => lease.touch() }, async response => {
      let received = 0;
      for await (const { message } of readRequestSyncWire({ context, groupKey, ...response, signal: lease.signal })) {
        const value = attachmentRequestSchema.parse(message.payload);
        if (value.state === 'block') received += value.data.length;
      }
      return received;
    }).then(value => ({ ok: true, value }), error => ({ ok: false, error }));
  try {
    for (let index = 0; index < 4; index++) {
      const stage = await Promise.race([starts[index]!.promise.then(() => 'read'), work.then(() => 'finished')]);
      if (stage === 'finished') break;
      await vi.advanceTimersByTimeAsync(125);
      releases[index]!.resolve();
    }
    expect(await work).toEqual({ ok: true, value: ATTACHMENT_BLOCK_BYTES * expected });
    expect(lease.signal.aborted).toBe(false);
  } finally { owner.close(); await stream.frames.return(undefined); }
});

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(finish => { resolve = finish; });
  return { promise, resolve };
}
