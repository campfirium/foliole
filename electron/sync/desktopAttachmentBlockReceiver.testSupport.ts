import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';

import { openDesktopAttachmentBlockReceiver } from './desktopAttachmentBlockFiles.js';

export async function createBlockReceiverFixture(bytes: Uint8Array) {
  const directory = path.resolve('.tmp/artifacts');
  await fs.mkdir(directory, { recursive: true });
  const root = await fs.mkdtemp(path.join(directory, 'attachment-blocks-'));
  const assetsDir = path.join(root, 'Assets');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const resource = { storageKey: `${hash}.pdf`, byteLength: bytes.length };
  const db = new Database(path.join(root, 'availability-test.sqlite'));
  db.exec('CREATE TABLE framed_sync_resource_availability (hash TEXT PRIMARY KEY, available INTEGER NOT NULL)');
  const owners: Array<{ close(): Promise<void> }> = [];
  let failIndex = false;
  const writes: boolean[] = [];
  async function open() {
    const owner = await openDesktopAttachmentBlockReceiver({ libraryRoot: root, assetsDir,
      availability: async (key, available) => {
        if (available && failIndex) { failIndex = false; throw new Error('injected_index_failure'); }
        writes.push(available);
        db.prepare(FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL).run(key, Number(available));
      } });
    if (owner.kind !== 'acquired') throw new Error('attachment_receiver_busy');
    owners.push(owner);
    return owner;
  }
  return {
    root, assetsDir, resource, open, writes,
    partial: path.join(assetsDir, `.attachment-${hash}.partial`),
    final: path.join(assetsDir, resource.storageKey),
    failNextIndex() { failIndex = true; },
    available() { return db.prepare('SELECT available FROM framed_sync_resource_availability WHERE hash = ?').pluck().get(hash); },
    async close() {
      for (const owner of owners) await owner.close();
      db.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  };
}

export async function deliverBlocks(receiver: Awaited<ReturnType<Awaited<ReturnType<typeof createBlockReceiverFixture>>['open']>>,
  resource: { storageKey: string; byteLength: number }, bytes: Uint8Array, from = 0) {
  for (let offset = from; offset < bytes.length; offset += ATTACHMENT_BLOCK_BYTES) {
    await receiver.receive(resource, offset, bytes.subarray(offset, offset + ATTACHMENT_BLOCK_BYTES));
  }
}
