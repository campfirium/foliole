// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { exchangeAttachmentBlocks, transferAttachmentBlocks } from '../../lib/core/sync/attachmentBlockTransfer.js';
import { withAttachmentFileLease } from '../attachments/attachmentFileLease.js';

import { createBlockReceiverFixture } from './desktopAttachmentBlockReceiver.testSupport.js';
import { createDesktopAttachmentBlockSource } from './desktopAttachmentBlockSource.js';

const fixtures: Array<Awaited<ReturnType<typeof createBlockReceiverFixture>>> = [];
async function setup(bytes: Uint8Array) {
  const fixture = await createBlockReceiverFixture(bytes);
  fixtures.push(fixture);
  const receiver = await fixture.open();
  return { ...fixture, ...receiver, ...createDesktopAttachmentBlockSource(fixture.assetsDir) };
}
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

it('lets the initiator transfer missing attachments in both directions', async () => {
  const leftBytes = Buffer.alloc(2 * BLOCK + 11, 0x61);
  const rightBytes = Buffer.alloc(BLOCK + 3, 0x62);
  const left = await setup(leftBytes);
  const right = await setup(rightBytes);
  await fs.writeFile(left.final, leftBytes);
  await fs.writeFile(right.final, rightBytes);
  expect(await exchangeAttachmentBlocks({ local: left, remote: right,
    localNeeds: [right.resource.storageKey], remoteNeeds: [left.resource.storageKey] }))
    .toEqual({ received: 1, sent: 1 });
  expect(await fs.readFile(path.join(left.assetsDir, right.resource.storageKey))).toEqual(rightBytes);
  expect(await fs.readFile(path.join(right.assetsDir, left.resource.storageKey))).toEqual(leftBytes);
});

it('continues after a lost block response by querying actual receiver progress', async () => {
  const bytes = Buffer.alloc(2 * BLOCK + 7, 0x63);
  const source = await setup(bytes);
  const destination = await setup(bytes);
  await fs.writeFile(source.final, bytes);
  let lost = false;
  const receive: typeof destination.receive = async (...args) => {
    const result = await destination.receive(...args);
    if (!lost) { lost = true; throw new Error('response_lost'); }
    return result;
  };
  await transferAttachmentBlocks({ storageKey: source.resource.storageKey, source,
    destination: { status: destination.status, receive } });
  expect(lost).toBe(true);
  expect(await fs.readFile(destination.final)).toEqual(bytes);
});

it('keeps a removal behind an active send lease and reports a missing source afterwards', async () => {
  const bytes = Buffer.alloc(BLOCK + 9, 0x64);
  const source = await setup(bytes);
  await fs.writeFile(source.final, bytes);
  let removed = false;
  let removal: Promise<void> | undefined;
  await source.withFile(source.resource.storageKey, async file => {
    removal = withAttachmentFileLease(source.final, async () => {
      await fs.unlink(source.final);
      removed = true;
    });
    expect(Buffer.from(await file.read(0, BLOCK))).toEqual(bytes.subarray(0, BLOCK));
    expect(Buffer.from(await file.read(BLOCK, 9))).toEqual(bytes.subarray(BLOCK));
    expect(removed).toBe(false);
  });
  await removal;
  expect(removed).toBe(true);
  await expect(source.withFile(source.resource.storageKey, async () => {}))
    .rejects.toMatchObject({ code: 'ENOENT' });
});

it('stops on a failed write with no receiver progress instead of spinning', async () => {
  const source = await setup(Buffer.alloc(BLOCK, 0x65));
  const destination = await setup(Buffer.alloc(BLOCK, 0x65));
  await fs.writeFile(source.final, Buffer.alloc(BLOCK, 0x65));
  let attempts = 0;
  await expect(transferAttachmentBlocks({ storageKey: source.resource.storageKey, source,
    destination: { status: destination.status, async receive() { attempts++; throw new Error('write_failed'); } } }))
    .rejects.toThrow('write_failed');
  expect(attempts).toBe(1);
});
