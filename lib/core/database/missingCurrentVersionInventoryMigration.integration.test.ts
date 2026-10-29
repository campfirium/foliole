// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { restoreEmptyLegacyDailyFlowSchema } from '../../../electron/database/historicalMigration.test-support.js';
import { branch } from '../../../electron/sync/syncPackStoredVersionDependencies.testSupport.js';
import { readFramedSyncInventory } from '../sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../sync/syncNodeApplyExecutor.js';

import { createCompanionDatabase, migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from './migrations.js';

it.each(['desktop', 'companion'])('rebuilds %s missing-head inventory atomically without changing original facts', async host => {
  const sqlite = new Database(':memory:');
  const db = createBetterSqliteDbPort(sqlite);
  try {
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await createCompanionDatabase(db, 89);
    restoreEmptyLegacyDailyFlowSchema(sqlite);
    await applySyncNodesWithDbPort(db, [branch('current', 'Preserved current text')], { enqueueSearchInvalidations: false });
    sqlite.exec(`DELETE FROM node_sync_versions WHERE version_id = 'current';
      DELETE FROM framed_sync_inventory WHERE object_id = 'node-1';
      INSERT OR REPLACE INTO framed_sync_node_digest VALUES ('node-1', '${'a'.repeat(64)}', 0);`);
    const originals = () => ['nodes', 'node_sync_versions', 'sync_object_state']
      .map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
    const before = originals();
    sqlite.pragma(`user_version = ${host === 'desktop' ? 160 : 89}`);
    const upgrade = async (beforeVersionCommit?: () => void) => {
      if (host === 'desktop') initializeDatabaseSchema(sqlite, beforeVersionCommit ? { beforeVersionCommit } : {});
      else await db.transaction(tx => migrateCompanionDatabase(tx, 89, 90, beforeVersionCommit));
    };
    await expect(upgrade(() => { throw new Error('commit_failed'); })).rejects.toThrow('commit_failed');
    expect(sqlite.prepare('SELECT unready FROM framed_sync_node_digest').pluck().get()).toBe(0);
    expect(originals()).toEqual(before);
    await upgrade();
    expect(originals()).toEqual(before);
    expect(sqlite.prepare('SELECT count(*) FROM framed_sync_node_digest').pluck().get()).toBe(0);
    expect((await readFramedSyncInventory(db)).find(entry => entry.globalId === 'node-1'))
      .toMatchObject({ currentVersionId: 'current', unready: true });
    expect(sqlite.pragma('user_version', { simple: true })).toBe(host === 'desktop' ? DATABASE_SCHEMA_VERSION : 90);
  } finally { sqlite.close(); }
});
