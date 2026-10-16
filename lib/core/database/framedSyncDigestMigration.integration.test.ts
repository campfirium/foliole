// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { branch } from '../../../electron/sync/syncPackStoredVersionDependencies.testSupport.js';
import { flushRequestSyncInventoryDigests, readRequestSyncInventorySummaries } from '../sync/framedSyncInventoryDigest.js';
import { applySyncNodesWithDbPort } from '../sync/syncNodeApplyExecutor.js';

import { createCompanionDatabase, migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from './migrations.js';

it.each(['desktop', 'companion'])('invalidates only old %s unready digests atomically and preserves original facts', async host => {
  const sqlite = new Database(':memory:');
  const db = createBetterSqliteDbPort(sqlite);
  try {
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await createCompanionDatabase(db, 90);
    await applySyncNodesWithDbPort(db, [branch('current', 'Retained')], { enqueueSearchInvalidations: false });
    sqlite.exec(`UPDATE node_sync_versions SET body_text = NULL, snapshot_json = json_set(snapshot_json, '$.content', NULL);
      INSERT OR REPLACE INTO framed_sync_node_digest VALUES ('node-1', '${'0'.repeat(64)}', 1);
      INSERT OR REPLACE INTO framed_sync_node_digest VALUES ('healthy', '${'a'.repeat(64)}', 0);`);
    const facts = () => ['nodes', 'node_sync_versions', 'sync_object_state'].map(table =>
      sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
    const original = facts();
    sqlite.pragma(`user_version = ${host === 'desktop' ? 161 : 90}`);
    const upgrade = async (beforeVersionCommit?: () => void) => {
      if (host === 'desktop') initializeDatabaseSchema(sqlite, beforeVersionCommit ? { beforeVersionCommit } : {});
      else await db.transaction(tx => migrateCompanionDatabase(tx, 90, 91, beforeVersionCommit));
    };
    await expect(upgrade(() => { throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect(sqlite.prepare("SELECT unready FROM framed_sync_node_digest WHERE object_id = 'node-1'").pluck().get()).toBe(1);
    expect(facts()).toEqual(original);
    await upgrade();
    expect(facts()).toEqual(original);
    expect(sqlite.prepare("SELECT unready FROM framed_sync_node_digest WHERE object_id = 'node-1'").get()).toBeUndefined();
    expect(sqlite.prepare("SELECT unready FROM framed_sync_node_digest WHERE object_id = 'healthy'").pluck().get()).toBe(0);
    await flushRequestSyncInventoryDigests(db);
    const entry = (await readRequestSyncInventorySummaries(db)).find(value => value.globalId === 'node-1');
    expect(entry?.unready).toBe(true);
    expect(entry?.sharedStateHash).not.toEqual(new Uint8Array(32));
  } finally { sqlite.close(); }
});
