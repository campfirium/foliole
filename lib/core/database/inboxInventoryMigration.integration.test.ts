// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { branch } from '../../../electron/sync/syncPackStoredVersionDependencies.testSupport.js';
import { readFramedSyncInventory } from '../sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../sync/syncNodeApplyExecutor.js';

import { createCompanionDatabase, migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from './migrations.js';
import { computeNodeSyncHash } from './nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from './nodeSyncSnapshotMetadata.js';

it.each(['desktop', 'companion'])('republishes existing %s Inbox without changing original records', async host => {
  const sqlite = new Database(':memory:');
  const db = createBetterSqliteDbPort(sqlite);
  try {
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await createCompanionDatabase(db, 93);
    const record = branch('inbox-history', '');
    record.object_id = 'special-inbox';
    Object.assign(record.snapshot, { id: 'special-inbox', kind: 'folder', title: 'Inbox' });
    record.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content: '' });
    await applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false });
    sqlite.exec("DELETE FROM framed_sync_inventory WHERE object_id = 'special-inbox'");
    const original = () => ['nodes', 'node_sync_versions', 'sync_object_state']
      .map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
    const before = original();
    sqlite.pragma(`user_version = ${host === 'desktop' ? 165 : 93}`);
    const upgrade = async (beforeVersionCommit?: () => void) => {
      if (host === 'desktop') initializeDatabaseSchema(sqlite, beforeVersionCommit ? { beforeVersionCommit } : {});
      else await db.transaction(tx => migrateCompanionDatabase(tx, 93, 94, beforeVersionCommit));
    };
    await expect(upgrade(() => { throw new Error('commit_failed'); })).rejects.toThrow('commit_failed');
    expect(sqlite.prepare("SELECT * FROM framed_sync_inventory WHERE object_id = 'special-inbox'").get()).toBeUndefined();
    expect(original()).toEqual(before);
    await upgrade();
    expect(original()).toEqual(before);
    expect((await readFramedSyncInventory(db)).find(entry => entry.globalId === 'special-inbox'))
      .toMatchObject({ currentVersionId: 'inbox-history' });
    expect(sqlite.pragma('user_version', { simple: true })).toBe(host === 'desktop' ? DATABASE_SCHEMA_VERSION : 94);
  } finally { sqlite.close(); }
});
