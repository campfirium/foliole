import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { readRequestSyncAttachmentNeeds, attachmentStatBatches } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { isDesktopAttachmentPresent } from './desktopAttachmentBlockSource.js';

it('bounds reference snapshots and file batches, avoids unchanged writes, and rebuilds demand after file loss or reference changes', async () => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-needs-batch-'));
  let availabilityWrites = 0;
  const sqlite = new Database(path.join(root, 'library.sqlite'), { verbose: sql => {
    if (typeof sql === 'string' && sql.startsWith('INSERT INTO framed_sync_resource_availability')) availabilityWrites++;
  } });
  sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, deleted_at TEXT, body_blob_hash TEXT,
    resource_references TEXT, content TEXT);
    CREATE TABLE framed_sync_resource_availability (hash TEXT PRIMARY KEY, available INTEGER)`);
  const keys = Array.from({ length: 260 }, (_, i) => `${i.toString(16).padStart(64, '0')}.png`);
  const insert = sqlite.prepare('INSERT INTO nodes VALUES (?, NULL, NULL, ?, ?)');
  keys.forEach((key, i) => insert.run(String(i).padStart(4, '0'), '[]', `![image](asset://${key})`));
  const port = createBetterSqliteDbPort(sqlite);
  let snapshots = 0;
  let inSnapshot = false;
  const host = {
    async readSnapshot<T>(read: (db: typeof port) => Promise<T>) {
      snapshots++;
      inSnapshot = true;
      try { return await port.transaction(read); } finally { inSnapshot = false; }
    },
    write: <T>(write: (db: typeof port) => Promise<T>) => write(port)
  };
  const batches: number[] = [];
  const inspect = async (batch: string[]) => {
    expect(inSnapshot).toBe(false);
    expect(batch.length).toBeLessThanOrEqual(64);
    batches.push(batch.length);
    return Promise.all(batch.map(key => isDesktopAttachmentPresent(root, key)));
  };
  try {
    // Use the same reference parser as production for explicit resources and inline images.
    sqlite.prepare('UPDATE nodes SET resource_references = ? WHERE id = ?')
      .run(JSON.stringify(keys.slice(0, 130).map(storage_key => ({ storage_key, role: 'reference', original_name: null }))), '0000');
    expect(new Set(await readRequestSyncAttachmentNeeds(host, inspect))).toEqual(new Set(keys));
    expect(snapshots).toBe(3);
    expect(batches.reduce((a, b) => a + b, 0)).toBe(keys.length);
    expect(availabilityWrites).toBeLessThanOrEqual(6);
    availabilityWrites = 0;
    const before = sqlite.prepare('SELECT total_changes() AS count').get();
    await readRequestSyncAttachmentNeeds(host, inspect);
    expect(availabilityWrites).toBe(0);
    expect(sqlite.prepare('SELECT total_changes() AS count').get()).toEqual(before);
    await writeFile(path.join(root, keys[0]!), 'file presence');
    expect(await readRequestSyncAttachmentNeeds(host, inspect)).not.toContain(keys[0]);
    await rm(path.join(root, keys[0]!));
    expect(await readRequestSyncAttachmentNeeds(host, inspect)).toContain(keys[0]);
    sqlite.exec("UPDATE nodes SET deleted_at = 'removed'");
    expect(await readRequestSyncAttachmentNeeds(host, inspect)).toEqual([]);
  } finally { sqlite.close(); await rm(root, { recursive: true, force: true }); }
});

it('bounds key bytes as well as count and refuses an oversized key', () => {
  const keys = Array.from({ length: 30 }, () => 'a'.repeat(1024));
  expect([...attachmentStatBatches(keys)].map(batch => batch.length)).toEqual([16, 14]);
  expect(() => [...attachmentStatBatches(['a'.repeat(16385)])]).toThrow('attachment_stat_key_too_large');
});
