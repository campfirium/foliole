// @vitest-environment node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { beforeAll, expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/databaseSchemaVersion.js';
import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS as legacyTriggers } from '../../lib/core/database/preNodeChildInventorySchema.js';
import { completeAttachmentDemand } from '../../lib/core/sync/attachmentDemandQueue.js';
import { flushRequestSyncInventoryDigests } from '../../lib/core/sync/framedSyncInventoryDigest.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';
import { openDesktopAttachmentBlockReceiver } from '../sync/desktopAttachmentBlockFiles.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch } from './topicTextState.testSupport.js';

beforeAll(async () => { await fs.mkdir(path.resolve('.tmp/artifacts'), { recursive: true }); });

it.each([false, true])('receives a listed attachment without rebuilding node inventories, companion=%s', async companion => {
  const root = await fs.mkdtemp(path.resolve('.tmp/artifacts/attachment-receipt-'));
  const file = path.join(root, 'library.db');
  const sqlite = new Database(file);
  const db = createBetterSqliteDbPort(sqlite);
  try {
    if (companion) await bootstrapCompanionDatabase(db, { allowCreate: true, expectedHostName: 'test', now: '2026-10-25' });
    else initializeDatabaseSchema(sqlite);
    const bytes = Buffer.from('Verified attachment bytes');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const key = `${hash}.png`;
    const record = textBranch('version', `![image](asset://${key})`);
    record.snapshot.resource_references = JSON.stringify([{ storage_key: key, original_name: 'image.png', role: 'image' }]);
    await applyConvergentSyncNodesWithDbPort(db, [record]);
    await db.run(`INSERT INTO attachment_pending(article_id, source, storage_key, registered_at)
      VALUES ('topic', 'body', ?, 'now')`, [key]);
    await flushRequestSyncInventoryDigests(db);
    const inventory = sqlite.prepare('SELECT * FROM framed_sync_inventory ORDER BY object_id').all();
    const digests = sqlite.prepare('SELECT * FROM framed_sync_node_digest ORDER BY object_id').all();
    const receiver = await openDesktopAttachmentBlockReceiver({ libraryRoot: root, assetsDir: path.join(root, 'Assets'),
      availability: (value, available) => recordFramedSyncResourceAvailability(db, [value], available) });
    if (receiver.kind !== 'acquired') throw new Error('test_receiver_busy');
    try {
      expect(await receiver.receive({ storageKey: key, byteLength: bytes.length }, 0, bytes)).toEqual({
        kind: 'complete', offset: bytes.length
      });
      await completeAttachmentDemand(db, key);
    } finally { await receiver.close(); }
    expect(await fs.readFile(path.join(root, 'Assets', key))).toEqual(bytes);
    expect(sqlite.prepare('SELECT available FROM framed_sync_resource_availability WHERE hash = ?').pluck().get(hash)).toBe(1);
    expect(sqlite.prepare('SELECT * FROM attachment_pending').all()).toEqual([]);
    expect(sqlite.prepare('SELECT * FROM framed_sync_inventory ORDER BY object_id').all()).toEqual(inventory);
    expect(sqlite.prepare('SELECT * FROM framed_sync_node_digest ORDER BY object_id').all()).toEqual(digests);
    sqlite.close();
    const reopened = new Database(file, { readonly: true });
    try {
      expect(reopened.prepare('SELECT * FROM attachment_pending').all()).toEqual([]);
      expect(reopened.prepare('SELECT available FROM framed_sync_resource_availability WHERE hash = ?').pluck().get(hash)).toBe(1);
    } finally { reopened.close(); }
  } finally {
    if (sqlite.open) sqlite.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

it.each([false, true])('upgrades the old presence triggers without changing pending transfers, companion=%s', async companion => {
  const root = await fs.mkdtemp(path.resolve('.tmp/artifacts/attachment-upgrade-'));
  const sqlite = new Database(path.join(root, 'library.db'));
  const db = createBetterSqliteDbPort(sqlite);
  const upgrade = async () => {
    if (companion) await bootstrapCompanionDatabase(db, { allowCreate: true, expectedHostName: 'test', now: '2026-10-25' });
    else initializeDatabaseSchema(sqlite);
  };
  try {
    await upgrade();
    const key = `${'a'.repeat(64)}.png`;
    const record = textBranch('version', `![image](asset://${key})`);
    record.snapshot.resource_references = JSON.stringify([{ storage_key: key, original_name: 'image.png', role: 'image' }]);
    await applyConvergentSyncNodesWithDbPort(db, [record]);
    await db.run(`INSERT INTO attachment_pending(article_id, source, storage_key, registered_at)
      VALUES ('topic', 'body', ?, 'now')`, [key]);
    for (const sql of legacyTriggers.filter(sql => sql.includes('AFTER') && sql.includes('ON framed_sync_resource_availability'))) {
      sqlite.exec(sql);
    }
    await recordFramedSyncResourceAvailability(db, ['a'.repeat(64)], true);
    sqlite.pragma(`user_version = ${companion ? 97 : 170}`);
    await upgrade();
    await flushRequestSyncInventoryDigests(db);
    const inventory = sqlite.prepare('SELECT * FROM framed_sync_inventory ORDER BY object_id').all();
    const digests = sqlite.prepare('SELECT * FROM framed_sync_node_digest ORDER BY object_id').all();
    await recordFramedSyncResourceAvailability(db, ['a'.repeat(64)], false);
    await recordFramedSyncResourceAvailability(db, ['a'.repeat(64)], true);
    expect(sqlite.prepare('SELECT storage_key FROM attachment_pending').pluck().all()).toEqual([key]);
    expect(sqlite.prepare('SELECT * FROM framed_sync_inventory ORDER BY object_id').all()).toEqual(inventory);
    expect(sqlite.prepare('SELECT * FROM framed_sync_node_digest ORDER BY object_id').all()).toEqual(digests);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(companion ? COMPANION_DATABASE_VERSION : DATABASE_SCHEMA_VERSION);
  } finally {
    sqlite.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
