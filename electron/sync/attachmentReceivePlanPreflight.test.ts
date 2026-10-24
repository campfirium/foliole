// @vitest-environment node
import { readFile, stat } from 'node:fs/promises';

import { expect, it } from 'vitest';

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { encodeFramedSyncStream, readFramedSyncStream } from '../../lib/core/sync/framedSyncBinaryStream.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { attachmentMessage, attachmentRequestSchema, type AttachmentRequest } from '../../lib/core/sync/requestSyncAttachmentContract.js';
import { pullRequestSyncAttachmentWindows } from '../../lib/core/sync/requestSyncAttachmentPull.js';
import type { RequestSyncAttachmentHost } from '../../lib/core/sync/requestSyncAttachmentResponse.js';
import type { RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { prepareRequestSyncWire, readRequestSyncWire } from '../../lib/core/sync/requestSyncWire.js';

import { createBlockReceiverFixture } from './desktopAttachmentBlockReceiver.testSupport.js';

const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'a', initiatorLibraryEpoch: 'a-epoch', responderDeviceId: 'b', responderLibraryEpoch: 'b-epoch' } as const;
const groupKey = new Uint8Array(32).fill(7);
type Fault = 'none' | 'storageKey' | 'requestId' | 'offset' | 'byteLength' | 'ciphertext';

function exchangeFor(data: Uint8Array, fault: Fault): RequestSyncExchange {
  return { context, groupKey, async request(_path, body, consume) {
    const queries: AttachmentRequest[] = [];
    for await (const decoded of readRequestSyncWire({ context, groupKey, ...body })) queries.push(attachmentRequestSchema.parse(decoded.message.payload));
    const query = queries[0]!;
    const response = await prepareRequestSyncWire({ context, groupKey, messages: async function* () {
      if (query.operation === 'describe') { yield attachmentMessage({ ...query, byteLength: data.length, state: 'complete' }); return; }
      for (let offset = query.offset; offset < data.length; offset += BLOCK) {
        const block = { ...query, offset, data: data.subarray(offset, offset + BLOCK), state: 'block' as const };
        if (offset === query.offset) {
          if (fault === 'storageKey') block.storageKey = `${'a'.repeat(64)}.pdf`;
          if (fault === 'requestId') block.requestId = new Uint8Array(16).fill(255);
          if (fault === 'offset') block.offset += BLOCK;
          if (fault === 'byteLength') block.byteLength++;
        }
        yield attachmentMessage(block);
      }
      yield attachmentMessage({ ...query, offset: data.length, state: 'end' });
    } });
    try {
      const frames = (async function* () {
        for await (const frame of response.frames) {
          const ciphertext = frame.ciphertext.slice();
          if (fault === 'ciphertext' && query.operation === 'pull') ciphertext[0]! ^= 1;
          yield { ...frame, ciphertext };
        }
      })();
      return await consume(await readFramedSyncStream(encodeFramedSyncStream({ ...response, frames })));
    } finally { await response.frames.return(undefined); }
  } };
}

it.each<Fault>(['none', 'storageKey', 'requestId', 'offset', 'byteLength', 'ciphertext'])(
  'binds authenticated attachment data to the authorized file and range before writing (%s)', async fault => {
    const bytes = Buffer.alloc(2 * BLOCK + 17, 0x57);
    const fixture = await createBlockReceiverFixture(bytes);
    const receiver = await fixture.open();
    const host: RequestSyncAttachmentHost = { ...receiver, needs: async () => [],
      needsSlice: async () => ({ keys: [], pending: false }), withFile: async () => { throw new Error('unexpected_source'); } };
    try {
      const receiving = pullRequestSyncAttachmentWindows(host, exchangeFor(bytes, fault), fixture.resource.storageKey, () => false);
      if (fault === 'none') {
        expect(await receiving).toEqual({ complete: true, blocks: 3 });
        expect(await readFile(fixture.final)).toEqual(bytes);
        expect(fixture.available()).toBe(1);
      } else {
        await expect(receiving).rejects.toThrow(fault === 'ciphertext' ? 'frame_authentication_failed'
          : ['storageKey', 'requestId'].includes(fault) ? 'attachment_response_identity_mismatch' : 'attachment_pull_offset_invalid');
        expect((await stat(fixture.partial)).size).toBe(0);
        expect(fixture.available()).toBe(0);
        await expect(stat(fixture.final)).rejects.toMatchObject({ code: 'ENOENT' });
      }
    } finally { await fixture.close(); }
  });
