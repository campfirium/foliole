import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../lib/core/sync/attachmentBlockReceiver.js';

import { openDesktopAttachmentBlockReceiver } from './desktopAttachmentBlockFiles.js';

const [root, key, mode = 'partial', size, sourcePath] = process.argv.slice(2);
if (!root || !key || !process.send) throw new Error('attachment_crash_fixture_invalid');
const assetsDir = path.join(root, 'Assets');
const db = mode === 'resume' ? new Database(path.join(root, 'availability-test.sqlite')) : null;
const receiver = await openDesktopAttachmentBlockReceiver({ libraryRoot: root, assetsDir,
  availability: async (hash, available) => {
    db?.prepare('INSERT OR REPLACE INTO framed_sync_resource_availability VALUES (?, ?)').run(hash, Number(available));
    if (mode === 'published' && available) {
      process.send?.('published-before-index');
      await new Promise<void>(() => { process.on('message', () => {}); });
    }
  } });
if (receiver.kind !== 'acquired') throw new Error('attachment_crash_fixture_busy');
const resource = { storageKey: key, byteLength: size ? Number(size) : 3 * BLOCK + 19 };
if (mode === 'resume') {
  if (!sourcePath) throw new Error('attachment_crash_source_missing');
  await resume(sourcePath);
  await receiver.close();
  db?.close();
  process.disconnect?.();
} else {
  await receiver.receive(resource, 0, new Uint8Array(BLOCK).fill(0x79));
  await receiver.receive(resource, BLOCK, new Uint8Array(BLOCK).fill(0x79));
  if (mode === 'published') {
    await receiver.receive(resource, 2 * BLOCK, new Uint8Array(BLOCK).fill(0x79));
    await receiver.receive(resource, 3 * BLOCK, new Uint8Array(19).fill(0x79));
  } else {
    // Leave the observable bytes of a process interrupted partway through its third write.
    const partial = path.join(assetsDir, `.attachment-${key.slice(0, 64)}.partial`);
    if (mode === 'partial' || mode === 'tail') await fs.appendFile(partial, new Uint8Array(31).fill(0x79));
    if (mode === 'aligned') await fs.appendFile(partial, new Uint8Array(BLOCK).fill(0x52));
    if (mode === 'short') await fs.truncate(partial, BLOCK);
    process.send('partial-written');
    process.on('message', () => {});
  }
}

async function resume(filePath: string) {
  if (receiver.kind !== 'acquired') throw new Error('attachment_crash_fixture_busy');
  const startingRss = process.memoryUsage().rss;
  let peakRss = startingRss;
  const status = await receiver.status(resource);
  const offsets: number[] = [];
  const source = await fs.open(filePath, 'r');
  try {
    const chunk = Buffer.alloc(BLOCK);
    for (let offset = status.offset; offset < resource.byteLength; offset += BLOCK) {
      const length = Math.min(BLOCK, resource.byteLength - offset);
      const { bytesRead } = await source.read(chunk, 0, length, offset);
      if (bytesRead !== length) throw new Error('attachment_crash_source_truncated');
      await receiver.receive(resource, offset, chunk.subarray(0, bytesRead));
      offsets.push(offset);
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }
  } finally { await source.close(); }
  process.send?.({ initialOffset: status.offset, offsets, startingRss, peakRss, finalRss: process.memoryUsage().rss });
}
