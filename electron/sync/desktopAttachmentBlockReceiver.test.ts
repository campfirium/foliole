// @vitest-environment node
import { promises as fs } from 'node:fs';

import { afterEach, expect, it, vi } from 'vitest';

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../lib/core/sync/attachmentBlockReceiver.js';

import { createBlockReceiverFixture, deliverBlocks } from './desktopAttachmentBlockReceiver.testSupport.js';

const fixtures: Array<Awaited<ReturnType<typeof createBlockReceiverFixture>>> = [];
async function setup(bytes: Uint8Array) {
  const fixture = await createBlockReceiverFixture(bytes);
  fixtures.push(fixture);
  return fixture;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

it('recovers a non-aligned partial once per owner and completes the tail', async () => {
  const bytes = Buffer.alloc(3 * BLOCK + 17, 0x41);
  const f = await setup(bytes);
  const first = await f.open();
  await deliverBlocks(first, f.resource, bytes.subarray(0, 2 * BLOCK));
  await first.close();
  await fs.appendFile(f.partial, Buffer.alloc(13, 0xff));
  const next = await f.open();
  expect(await next.status(f.resource)).toEqual({ kind: 'partial', offset: BLOCK });
  expect(await next.status(f.resource)).toEqual({ kind: 'partial', offset: BLOCK });
  await deliverBlocks(next, f.resource, bytes, BLOCK);
  expect(await fs.readFile(f.final)).toEqual(bytes);
  expect(f.available()).toBe(1);
  await expect(fs.stat(f.partial)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('queries acknowledged length after a lost response and rejects duplicate offsets', async () => {
  const bytes = Buffer.alloc(2 * BLOCK + 3, 0x42);
  const f = await setup(bytes);
  const receiver = await f.open();
  await receiver.receive(f.resource, 0, bytes.subarray(0, BLOCK));
  expect(await receiver.status(f.resource)).toEqual({ kind: 'partial', offset: BLOCK });
  expect(await receiver.receive(f.resource, 0, bytes.subarray(0, BLOCK)))
    .toEqual({ kind: 'offset', offset: BLOCK });
  expect(await receiver.receive(f.resource, 0, Buffer.alloc(BLOCK, 0xff)))
    .toEqual({ kind: 'offset', offset: BLOCK });
  expect(await fs.readFile(f.partial)).toEqual(bytes.subarray(0, BLOCK));
  await deliverBlocks(receiver, f.resource, bytes, BLOCK);
  expect(await receiver.status(f.resource)).toEqual({ kind: 'complete', offset: bytes.length });
  expect(await fs.readFile(f.final)).toEqual(bytes);
});

it('serializes simultaneous sources for one hash without appending a block twice', async () => {
  const bytes = Buffer.alloc(2 * BLOCK, 0x43);
  const f = await setup(bytes);
  const receiver = await f.open();
  const results = await Promise.all([0, 1].map(() => receiver.receive(f.resource, 0, bytes.subarray(0, BLOCK))));
  expect(results.map(result => result.kind).sort()).toEqual(['offset', 'partial']);
  expect((await fs.stat(f.partial)).size).toBe(BLOCK);
  await deliverBlocks(receiver, f.resource, bytes, BLOCK);
  expect(await fs.readFile(f.final)).toEqual(bytes);
});

it('discards a corrupt partial on final hash failure and can redownload it', async () => {
  const bytes = Buffer.alloc(4 * BLOCK + 1, 0x44);
  const f = await setup(bytes);
  const first = await f.open();
  await deliverBlocks(first, f.resource, bytes.subarray(0, 2 * BLOCK));
  await first.close();
  const file = await fs.open(f.partial, 'r+');
  await file.write(Buffer.from([0xff]), 0, 1, 0);
  await file.close();
  const next = await f.open();
  expect(await next.status(f.resource)).toMatchObject({ offset: BLOCK });
  await expect(deliverBlocks(next, f.resource, bytes, BLOCK)).rejects.toThrow('attachment_checksum_mismatch');
  expect(f.available()).toBe(0);
  await expect(fs.stat(f.partial)).rejects.toMatchObject({ code: 'ENOENT' });
  await deliverBlocks(next, f.resource, bytes);
  expect(await fs.readFile(f.final)).toEqual(bytes);
});

it('repairs availability after publication succeeded but index writing failed', async () => {
  const bytes = Buffer.from('index recovery');
  const f = await setup(bytes);
  const receiver = await f.open();
  f.failNextIndex();
  await expect(receiver.receive(f.resource, 0, bytes)).rejects.toThrow('injected_index_failure');
  expect(await fs.readFile(f.final)).toEqual(bytes);
  expect(f.available()).toBe(0);
  expect(await receiver.status(f.resource)).toEqual({ kind: 'complete', offset: bytes.length });
  expect(f.available()).toBe(1);
});

it('publishes an empty attachment after checking the whole-file hash', async () => {
  const f = await setup(Buffer.alloc(0));
  const receiver = await f.open();
  expect(await receiver.status(f.resource)).toEqual({ kind: 'complete', offset: 0 });
  expect((await fs.stat(f.final)).size).toBe(0);
  expect(f.available()).toBe(1);
});

it('rejects incomplete blocks and disallows operations after owner close', async () => {
  const f = await setup(Buffer.alloc(2 * BLOCK));
  const receiver = await f.open();
  await expect(receiver.receive(f.resource, 0, Buffer.alloc(13))).rejects.toThrow('attachment_block_range_invalid');
  expect((await fs.stat(f.partial)).size).toBe(0);
  await receiver.close();
  await expect(receiver.status(f.resource)).rejects.toThrow('attachment_receiver_closed');
});

it('receives without hard-link support', async () => {
  vi.spyOn(fs, 'link').mockRejectedValue(Object.assign(new Error('Unsupported'), { code: 'ENOTSUP' }));
  const bytes = Buffer.alloc(5 * BLOCK + 19, 0x48);
  const f = await setup(bytes);
  const receiver = await f.open();
  await receiver.status(f.resource);
  await deliverBlocks(receiver, f.resource, bytes);
  await receiver.status(f.resource);
  expect(await fs.readFile(f.final)).toEqual(bytes);

});

it('writes availability only at transitions, including deletion after completion', async () => {
  const bytes = Buffer.alloc(3 * BLOCK + 19, 0x49);
  const f = await setup(bytes);
  const receiver = await f.open();
  await receiver.status(f.resource);
  await deliverBlocks(receiver, f.resource, bytes);
  await receiver.status(f.resource);
  expect(f.writes).toEqual([false, true]);
  await fs.unlink(f.final);
  await receiver.status(f.resource);
  expect(f.writes).toEqual([false, true, false]);
  await deliverBlocks(receiver, f.resource, bytes);
  expect(await fs.readFile(f.final)).toEqual(bytes);
  expect(f.writes).toEqual([false, true, false, true]);
});

it('keeps a corrupt published file until a complete verified replacement is ready', async () => {
  const bytes = Buffer.alloc(BLOCK + 19, 0x53);
  const f = await setup(bytes);
  const receiver = await f.open();
  const corrupted = Buffer.alloc(bytes.length, 0x52);
  await fs.writeFile(f.final, corrupted);
  expect(await receiver.status(f.resource)).toEqual({ kind: 'partial', offset: 0 });
  expect(f.available()).toBe(0);
  await receiver.receive(f.resource, 0, corrupted.subarray(0, BLOCK));
  expect(await fs.readFile(f.final)).toEqual(corrupted);
  await expect(receiver.receive(f.resource, BLOCK, bytes.subarray(BLOCK)))
    .rejects.toThrow('attachment_checksum_mismatch');
  expect(await fs.readFile(f.final)).toEqual(corrupted);
  expect(f.available()).toBe(0);
  await expect(fs.stat(f.partial)).rejects.toMatchObject({ code: 'ENOENT' });
  await receiver.receive(f.resource, 0, bytes.subarray(0, BLOCK));
  expect(await fs.readFile(f.final)).toEqual(corrupted);
  await receiver.receive(f.resource, BLOCK, bytes.subarray(BLOCK));
  expect(await fs.readFile(f.final)).toEqual(bytes);
  expect(f.available()).toBe(1);
});
