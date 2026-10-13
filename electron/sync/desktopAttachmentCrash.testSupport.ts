import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../lib/core/sync/attachmentBlockReceiver.js';

export async function createLargeCrashFixture(mebibytes: number) {
  const directory = path.resolve('.tmp/artifacts');
  await fs.mkdir(directory, { recursive: true });
  const root = await fs.mkdtemp(path.join(directory, 'attachment-crash-large-'));
  const assetsDir = path.join(root, 'Assets');
  await fs.mkdir(assetsDir);
  const sourcePath = path.join(root, 'source');
  const byteLength = mebibytes * 1024 * 1024 + 17;
  const source = await fs.open(sourcePath, 'wx');
  const digest = createHash('sha256');
  const chunk = Buffer.alloc(BLOCK, 0x79);
  try {
    for (let offset = 0; offset < byteLength; offset += BLOCK) {
      const bytes = chunk.subarray(0, Math.min(BLOCK, byteLength - offset));
      await source.writeFile(bytes);
      digest.update(bytes);
    }
    await source.sync();
  } finally { await source.close(); }
  const hash = digest.digest('hex');
  const resource = { storageKey: `${hash}.pdf`, byteLength };
  const db = new Database(path.join(root, 'availability-test.sqlite'));
  db.exec('CREATE TABLE framed_sync_resource_availability (hash TEXT PRIMARY KEY, available INTEGER NOT NULL)');
  return { root, sourcePath, resource, hash,
    partial: path.join(assetsDir, `.attachment-${hash}.partial`),
    final: path.join(assetsDir, resource.storageKey),
    available: () => db.prepare('SELECT available FROM framed_sync_resource_availability WHERE hash = ?').pluck().get(hash),
    async close() { db.close(); await fs.rm(root, { recursive: true, force: true }); }
  };
}
