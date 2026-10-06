// @vitest-environment node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { inventoryAttachmentDirectory } from '../attachments/attachmentTrashFiles.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { closeLibraries, createPeer, edit, root, startLibraries } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('initializes resource presence once during a real companion upgrade and preserves the discovered bytes after reopen', async () => {
  const source = createPeer('companion-resource-source');
  edit(source, 'Original Node body');
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(128, 1)]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const key = `${hash}.png`;
  source.driver.execute('UPDATE nodes SET resource_references = ?, sync_dirty = 1 WHERE id = ?', [
    JSON.stringify([{ original_name: 'Original.png', role: 'image', storage_key: key }]), 'topic']);
  flushNodeSyncVersionWithDriver(source.driver, 'topic', source.name);
  const record = await loadCurrentSyncNodeRecord(source.port, 'topic');
  if (!record) throw new Error('source_record_missing');
  const file = path.join(root, 'companion.db');
  const assets = path.join(root, 'companion-assets');
  const sqlite = new Database(file);
  const db = createBetterSqliteDbPort(sqlite);
  const request = { allowCreate: true, expectedHostName: 'companion', now: '2026-10-06' };
  try {
    await bootstrapCompanionDatabase(db, request);
    await db.transaction(async (tx) => {
      await upsertTextBodyBlob(tx, record.body_text!, record.updated_at, record.snapshot.body_blob_hash!);
      await applySyncNodesWithDbPort(tx, [record], { enqueueSearchInvalidations: false });
    });
    const before = (await readFramedSyncInventory(db)).find((entry) => entry.globalId === 'topic' && entry.objectType === 'node')!;
    expect(before.resourceHashes.map((value) => Buffer.from(value).toString('hex'))).not.toContain(hash);
    await fs.mkdir(assets);
    await fs.writeFile(path.join(assets, key), bytes);
    for (const row of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_framed_inventory_%'").all() as { name: string }[]) {
      sqlite.exec(`DROP TRIGGER ${row.name}`);
    }
    for (const table of ['framed_sync_inventory', 'framed_sync_fact_summary', 'framed_sync_version_summary', 'framed_sync_resource_availability']) sqlite.exec(`DROP TABLE ${table}`);
    sqlite.pragma('user_version = 70');
    await expect(bootstrapCompanionDatabase(db, { ...request, allowCreate: false,
      inventoryResourceStorageKeys: async () => { throw new Error('file_inventory_unavailable'); }
    })).rejects.toThrow('file_inventory_unavailable');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(70);
    let inventories = 0;
    const upgrade = { ...request, allowCreate: false, inventoryResourceStorageKeys: async () => {
      inventories += 1;
      return inventoryAttachmentDirectory(assets).map((entry) => entry.storageKey);
    } };
    await bootstrapCompanionDatabase(db, upgrade);
    const after = await readFramedSyncInventory(db);
    expect(after.find((entry) => entry.globalId === 'topic' && entry.objectType === 'node')!.resourceHashes
      .map((value) => Buffer.from(value).toString('hex'))).toContain(hash);
    expect((await bootstrapCompanionDatabase(db, upgrade)).created).toBe(false);
    expect(inventories).toBe(1);
    const reopened = new Database(file, { readonly: true });
    try { expect(await readFramedSyncInventory(createBetterSqliteDbPort(reopened))).toEqual(after); }
    finally { reopened.close(); }
    expect(await fs.readFile(path.join(assets, key))).toEqual(bytes);
  } finally { sqlite.close(); }
});
