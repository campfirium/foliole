// @vitest-environment node
import { appendFile, readFile, stat, writeFile } from 'node:fs/promises';

import { expect, it, vi } from 'vitest';

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { AttachmentReceivePaused } from '../../lib/core/sync/attachmentBlockTransfer.js';
import { encodeFramedSyncStream, readFramedSyncStream } from '../../lib/core/sync/framedSyncBinaryStream.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { attachmentMessage, attachmentRequestSchema, type AttachmentRequest } from '../../lib/core/sync/requestSyncAttachmentContract.js';
import { pullRequestSyncAttachmentWindows } from '../../lib/core/sync/requestSyncAttachmentPull.js';
import type { RequestSyncAttachmentHost } from '../../lib/core/sync/requestSyncAttachmentResponse.js';
import type { RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { prepareRequestSyncWire, readRequestSyncWire } from '../../lib/core/sync/requestSyncWire.js';

import { createBlockReceiverFixture } from './desktopAttachmentBlockReceiver.testSupport.js';

it('publishes only after the authorized native window exits and the complete hash passes', async () => {
  const bytes = Buffer.alloc(BLOCK * 3 + 17, 0x58);
  const f = await createBlockReceiverFixture(bytes);
  const receiver = await f.open();
  try {
    const result = await receiver.receiveWindow(f.resource, 0, async () => {
      await appendFile(f.partial, bytes);
      expect(f.available()).toBe(0);
      await expect(stat(f.final)).rejects.toMatchObject({ code: 'ENOENT' });
      return { offset: bytes.length, blocks: 4, pending: false };
    });
    expect(result.offset).toBe(bytes.length); expect(f.available()).toBe(1);
    expect(await readFile(f.final)).toEqual(bytes);
  } finally { await f.close(); }
});

it('recovers a lost native result with an incomplete tail, without trusting progress or repeating an append', async () => {
  const bytes = Buffer.alloc(BLOCK * 3 + 17, 0x59);
  const f = await createBlockReceiverFixture(bytes); const receiver = await f.open();
  try {
    await expect(receiver.receiveWindow(f.resource, 0, async () => {
      await appendFile(f.partial, bytes.subarray(0, BLOCK * 2 + 31));
      throw new Error('lost_native_result');
    })).rejects.toThrow('lost_native_result');
    expect(await receiver.status(f.resource)).toEqual({ kind: 'partial', offset: BLOCK });
    const wrong = vi.fn();
    await expect(receiver.receiveWindow(f.resource, 0, wrong)).rejects.toThrow('attachment_pull_receiver_changed');
    expect(wrong).not.toHaveBeenCalled();
    expect((await receiver.status(f.resource)).offset).toBe(0);
    await receiver.receiveWindow(f.resource, 0, async () => {
      await appendFile(f.partial, bytes); return { offset: bytes.length, blocks: 4, pending: false };
    });
    expect(await readFile(f.final)).toEqual(bytes);
  } finally { await f.close(); }
});

it('retains the published original on hash failure and repairs a valid replacement', async () => {
  const bytes = Buffer.alloc(BLOCK + 17, 0x5a);
  const f = await createBlockReceiverFixture(bytes); const receiver = await f.open();
  try {
    const original = Buffer.from('original'); await writeFile(f.final, original);
    await expect(receiver.receiveWindow(f.resource, 0, async () => {
      await appendFile(f.partial, Buffer.alloc(bytes.length, 0xff));
      return { offset: bytes.length, blocks: 2, pending: false };
    })).rejects.toThrow('attachment_checksum_mismatch');
    expect(await readFile(f.final)).toEqual(original); expect(f.available()).toBe(0);
    await receiver.receiveWindow(f.resource, 0, async () => {
      await appendFile(f.partial, bytes); return { offset: bytes.length, blocks: 2, pending: false };
    });
    expect(await readFile(f.final)).toEqual(bytes); expect(f.available()).toBe(1);
  } finally { await f.close(); }
});

it('holds the receiver owner until the native operation has stopped, including close requests', async () => {
  const bytes = Buffer.alloc(BLOCK * 2, 0x5b);
  const f = await createBlockReceiverFixture(bytes); const receiver = await f.open();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const began = new Promise<void>(resolve => { started = resolve; });
  const receiving = receiver.receiveWindow(f.resource, 0, async () => {
    started(); await gate; await appendFile(f.partial, bytes.subarray(0, BLOCK));
    return { offset: BLOCK, blocks: 1, pending: false };
  });
  try {
    await began; const closing = receiver.close();
    await expect(f.open()).rejects.toThrow('attachment_receiver_busy');
    release(); await receiving; await closing;
    expect(await (await f.open()).status(f.resource)).toEqual({ kind: 'partial', offset: 0 });
  } finally { release(); await receiving.catch(() => {}); await f.close(); }
});

it('treats data-work cancellation as a pause and resumes only after native exit and conservative recovery', async () => {
  const bytes = Buffer.alloc(3 * BLOCK + 17, 0x5c);
  const f = await createBlockReceiverFixture(bytes); const receiver = await f.open();
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: 'a', initiatorLibraryEpoch: 'a-epoch', responderDeviceId: 'b', responderLibraryEpoch: 'b-epoch' } as const;
  const groupKey = new Uint8Array(32).fill(7);
  const host: RequestSyncAttachmentHost = { ...receiver, needs: async () => [], needsSlice: async () => ({ keys: [], pending: false }),
    withFile: async () => { throw new Error('unexpected_source'); } };
  let paused = false;
  const exchange: RequestSyncExchange = { context, groupKey, async request(_path, body, consume) {
    const queries: AttachmentRequest[] = [];
    for await (const decoded of readRequestSyncWire({ context, groupKey, ...body })) queries.push(attachmentRequestSchema.parse(decoded.message.payload));
    const reply = await prepareRequestSyncWire({ context, groupKey, messages: async function* () {
      yield attachmentMessage({ ...queries[0]!, state: 'complete', byteLength: bytes.length });
    } });
    try { return await consume(await readFramedSyncStream(encodeFramedSyncStream(reply))); }
    finally { await reply.frames.return(undefined); }
  }, async receiveAttachment(query) {
    if (!paused) {
      paused = true; await appendFile(f.partial, bytes.subarray(0, 2 * BLOCK + 31));
      throw new AttachmentReceivePaused();
    }
    expect(query.offset).toBe(BLOCK);
    await appendFile(f.partial, bytes.subarray(query.offset));
    return { offset: bytes.length, blocks: 3, pending: false };
  } };
  try {
    expect(await pullRequestSyncAttachmentWindows(host, exchange, f.resource.storageKey, () => false)).toEqual({ complete: false, blocks: 0 });
    expect((await stat(f.partial)).size).toBe(BLOCK); expect(f.available()).toBe(0);
    expect(await pullRequestSyncAttachmentWindows(host, exchange, f.resource.storageKey, () => false)).toEqual({ complete: true, blocks: 3 });
    expect(await readFile(f.final)).toEqual(bytes); expect(f.available()).toBe(1);
  } finally { await f.close(); }
});
