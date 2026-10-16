// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS as legacyTriggers } from '../../lib/core/database/preNodeChildInventorySchema.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch } from './topicTextState.testSupport.js';

it.each([false, true])('upgrades child inventory atomically, preserving business rows, companion=%s', async companion => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-child-migration-'));
  const sqlite = new Database(path.join(root, 'library.db'));
  const db = createBetterSqliteDbPort(sqlite);
  const request = { allowCreate: true, expectedHostName: 'mobile', now: '2026-10-16' };
  const upgrade = async (interrupt = false) => {
    const options = { beforeVersionCommit() { if (interrupt) throw new Error('interrupted'); } };
    if (companion) await bootstrapCompanionDatabase(db, { ...request, ...options });
    else initializeDatabaseSchema(sqlite, options);
  };
  try {
    await upgrade();
    await applyConvergentSyncNodesWithDbPort(db, [textBranch('base', 'Original')]);
    await applySyncObjectInTransaction(db, { object_type: 'import_source', object_id: 'source',
      content_hash: 'c'.repeat(64), deleted_at: null, updated_at: '2026-10-16',
      payload_json: JSON.stringify({ source_fingerprint: 'source', latest_node_id: 'topic' }) });
    const before = businessRows(sqlite);
    const names = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_framed_inventory_%'")
      .pluck().all();
    for (const name of names) sqlite.exec(`DROP TRIGGER ${name}`);
    sqlite.exec('DROP TABLE sync_node_child_owners; DROP INDEX idx_sync_topic_daily_owner');
    for (const sql of legacyTriggers) sqlite.exec(sql);
    sqlite.pragma(`user_version = ${companion ? 84 : 155}`);
    await expect(upgrade(true)).rejects.toThrow('interrupted');
    expect(businessRows(sqlite)).toEqual(before);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'sync_node_child_owners'").get()).toBeUndefined();
    await upgrade();
    expect(businessRows(sqlite)).toEqual(before);
    const entries = await readFramedSyncInventory(db);
    expect(entries.find(entry => entry.objectType === 'import_source')).toBeUndefined();
    expect(entries.find(entry => entry.objectType === 'node' && entry.globalId === 'topic')?.stateFactIds)
      .toContain(JSON.stringify(['import_source', 'source', 'c'.repeat(64)]));
    await upgrade();
    expect(await readFramedSyncInventory(db)).toEqual(entries);
  } finally { sqlite.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

function businessRows(sqlite: Database.Database) {
  return ['nodes', 'node_sync_versions', 'sync_object_state', 'import_sources'].map(table =>
    sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}
