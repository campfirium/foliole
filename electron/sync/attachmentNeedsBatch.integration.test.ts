import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { ATTACHMENT_DEMAND_SCHEMA } from '../../lib/core/database/attachmentDemandSchema.js';
import { recordAttachmentDemandAttempt } from '../../lib/core/sync/attachmentDemandQueue.js';
import { readRequestSyncAttachmentNeeds, attachmentStatBatches } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { isDesktopAttachmentPresent } from './desktopAttachmentBlockSource.js';

it('bounds incremental reference and file batches, avoids unchanged availability writes, and retries after reference changes', async () => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-needs-batch-'));
  let availabilityWrites = 0;
  const sqlite = new Database(path.join(root, 'library.sqlite'), { verbose: sql => {
    if (typeof sql === 'string' && sql.startsWith('INSERT INTO framed_sync_resource_availability')) availabilityWrites++;
  } });
  sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, deleted_at TEXT, body_blob_hash TEXT,
    resource_references TEXT, content TEXT, current_version_id TEXT);
    CREATE TABLE framed_sync_resource_availability (hash TEXT PRIMARY KEY, available INTEGER)`);
  for (const sql of ATTACHMENT_DEMAND_SCHEMA) sqlite.exec(sql);
  const keys = Array.from({ length: 260 }, (_, i) => `${i.toString(16).padStart(64, '0')}.png`);
  const insert = sqlite.prepare('INSERT INTO nodes(id, deleted_at, body_blob_hash, resource_references, content) VALUES (?, NULL, NULL, ?, ?)');
  keys.forEach((key, i) => insert.run(String(i).padStart(4, '0'), '[]', `![image](asset://${key})`));
  const port = createBetterSqliteDbPort(sqlite);
  let inSnapshot = false;
  const host = {
    async readSnapshot<T>(read: (db: typeof port) => Promise<T>) {
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
  const requestMissing = async () => {
    const missing = await readRequestSyncAttachmentNeeds(host, inspect);
    for (const key of missing) await recordAttachmentDemandAttempt(port, key);
    return missing;
  };
  try {
    // Use the same reference parser as production for explicit resources and inline images.
    sqlite.prepare('UPDATE nodes SET resource_references = ? WHERE id = ?')
      .run(JSON.stringify(keys.slice(0, 130).map(storage_key => ({ storage_key, role: 'reference', original_name: null }))), '0000');
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) (await requestMissing()).forEach(key => seen.add(key));
    expect(seen).toEqual(new Set(keys));
    expect(Math.max(...batches)).toBeLessThanOrEqual(64);
    availabilityWrites = 0;
    await requestMissing();
    expect(availabilityWrites).toBe(0);
    await writeFile(path.join(root, keys[0]!), 'file presence');
    for (let i = 0; i < 8; i++) await requestMissing();
    expect(sqlite.prepare('SELECT 1 FROM attachment_pending WHERE storage_key = ?').get(keys[0])).toBeUndefined();
    await rm(path.join(root, keys[0]!));
    for (let i = 0; i < 8; i++) expect(await requestMissing()).not.toContain(keys[0]);
    sqlite.prepare('UPDATE nodes SET content = content || ? WHERE id = ?').run(' changed', '0000');
    expect(await requestMissing()).toContain(keys[0]);
    sqlite.exec("UPDATE nodes SET deleted_at = 'removed'");
    for (let i = 0; i < 8; i++) await requestMissing();
    expect(await requestMissing()).toEqual([]);
  } finally { sqlite.close(); await rm(root, { recursive: true, force: true }); }
});

it('bounds key bytes as well as count and refuses an oversized key', () => {
  const keys = Array.from({ length: 30 }, () => 'a'.repeat(1024));
  expect([...attachmentStatBatches(keys)].map(batch => batch.length)).toEqual([16, 14]);
  expect(() => [...attachmentStatBatches(['a'.repeat(16385)])]).toThrow('attachment_stat_key_too_large');
});
