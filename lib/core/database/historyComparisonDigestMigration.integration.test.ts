// @vitest-environment node
import { bytesToHex } from '@noble/hashes/utils.js';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { restoreEmptyLegacyDailyFlowSchema, restoreLegacyParentOrderTable } from '../../../electron/database/historicalMigration.test-support.js';
import { branch } from '../../../electron/sync/syncPackStoredVersionDependencies.testSupport.js';
import { flushRequestSyncInventoryDigests, readRequestSyncInventorySummaries } from '../sync/framedSyncInventoryDigest.js';
import { readFramedSyncInventoryEntry } from '../sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../sync/syncNodeApplyExecutor.js';
import { applyRemoteNodeTombstone } from '../sync/syncNodeTombstoneApply.js';

import { createCompanionDatabase, migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from './migrations.js';

const STALE = '00'.repeat(32);
/** The migrations that dropped every cached digest once history left the comparison hash. */
const DIGEST_RESET_VERSION = { companion: 95, desktop: 167 } as const;

it.each(['desktop', 'companion'])('rebuilds %s node digests cached before history left the comparison hash', async host => {
  const sqlite = new Database(':memory:');
  const db = createBetterSqliteDbPort(sqlite);
  const previous = DIGEST_RESET_VERSION[host as keyof typeof DIGEST_RESET_VERSION] - 1;
  try {
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await createCompanionDatabase(db, previous);
    restoreEmptyLegacyDailyFlowSchema(sqlite);
    if (host === 'desktop') restoreLegacyParentOrderTable(sqlite);
    const root = branch('root', 'Original');
    await applySyncNodesWithDbPort(db, [root, branch('head', 'Current', root)], { enqueueSearchInvalidations: false });
    await db.transaction(tx => flushRequestSyncInventoryDigests(tx));
    sqlite.prepare("UPDATE framed_sync_node_digest SET shared_state_hash = ? WHERE object_id = 'node-1'").run(STALE);
    const cached = () => sqlite.prepare("SELECT shared_state_hash FROM framed_sync_node_digest WHERE object_id = 'node-1'").pluck().get();
    sqlite.pragma(`user_version = ${previous}`);
    const upgrade = async (beforeVersionCommit?: () => void) => {
      if (host === 'desktop') initializeDatabaseSchema(sqlite, beforeVersionCommit ? { beforeVersionCommit } : {});
      else await db.transaction(tx => migrateCompanionDatabase(tx, previous, previous + 1, beforeVersionCommit));
    };
    await expect(upgrade(() => { throw new Error('commit_failed'); })).rejects.toThrow('commit_failed');
    expect(cached()).toBe(STALE);
    await upgrade();
    expect(cached()).toBeUndefined();
    await db.transaction(tx => flushRequestSyncInventoryDigests(tx));
    const entry = await readFramedSyncInventoryEntry(db, { globalId: 'node-1', objectType: 'node' });
    expect(cached()).toBe(bytesToHex(entry!.sharedStateHash));
    expect(sqlite.pragma('user_version', { simple: true })).toBe(host === 'desktop' ? DATABASE_SCHEMA_VERSION : previous + 1);
  } finally { sqlite.close(); }
});

it.each(['desktop', 'companion'])('rebuilds %s deletion digests from the durable tombstone after upgrade', async host => {
  const sqlite = new Database(':memory:');
  const db = createBetterSqliteDbPort(sqlite);
  const previous = host === 'desktop' ? 192 : 119;
  try {
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await createCompanionDatabase(db, previous);
    const root = branch('root', 'Original');
    await applySyncNodesWithDbPort(db, [root], { enqueueSearchInvalidations: false });
    await applyRemoteNodeTombstone(db, {
      ...root, is_tombstone: true, snapshot: { ...root.snapshot, deleted_at: '2026-10-02T00:00:00.000Z' }
    }, false);
    const key = { globalId: 'node-1', objectType: 'node' };
    sqlite.prepare('INSERT OR REPLACE INTO framed_sync_node_digest VALUES (?, ?, 1)').run(key.globalId, STALE);
    sqlite.pragma(`user_version = ${previous}`);
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await db.transaction(tx => migrateCompanionDatabase(tx, previous, previous + 1));
    const read = () => readRequestSyncInventorySummaries(db, [key.globalId]);
    const entry = (await read())[0];
    expect(entry?.unready).toBe(false);
    expect(bytesToHex(entry!.sharedStateHash)).not.toBe(STALE);
    await db.transaction(tx => flushRequestSyncInventoryDigests(tx));
    expect(await read()).toEqual([entry]);
  } finally { sqlite.close(); }
});

it.each(['desktop', 'companion'])('retains only meaningful deletion facts after %s child state upgrade', async host => {
  const sqlite = new Database(':memory:');
  const db = createBetterSqliteDbPort(sqlite);
  const previous = host === 'desktop' ? 193 : 120;
  try {
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await createCompanionDatabase(db, previous);
    const root = branch('root', 'Original');
    await applySyncNodesWithDbPort(db, [root], { enqueueSearchInvalidations: false });
    await applyRemoteNodeTombstone(db, {
      ...root, is_tombstone: true, snapshot: { ...root.snapshot, deleted_at: '2026-10-02T00:00:00.000Z' }
    }, false);
    sqlite.exec(`INSERT INTO parent_order_sources VALUES ('node-1','old',1,'[]'), ('live','old',1,'[]');
      INSERT INTO sync_node_child_owners VALUES
        ('node_text_alternative','old-choice','node-1'), ('node_text_alternative','live-choice','live');
      INSERT INTO sync_object_state
        (object_type,object_id,state_seq,content_hash,last_modified_by_host_name,updated_at,deleted_at)
      VALUES ('parent_child_order','node-1',10,'hash','old','now',NULL),
        ('node_reading','node-1',11,'hash','old','now','now'),
        ('node_text_alternative','old-choice',12,'hash','old','now','now'),
        ('node_text_alternative','live-choice',13,'hash','old','now','now');`);
    sqlite.pragma(`user_version = ${previous}`);
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await db.transaction(tx => migrateCompanionDatabase(tx, previous, previous + 1));
    const entry = await readFramedSyncInventoryEntry(db, { globalId: 'node-1', objectType: 'node' });
    expect(entry).toMatchObject({ permanentlyDeleted: true, stateFactIds: [] });
    expect(sqlite.prepare("SELECT object_id FROM sync_object_state WHERE object_type <> 'node'").pluck().all())
      .toEqual(['live-choice']);
    expect(sqlite.prepare('SELECT parent_id FROM parent_order_sources').pluck().all()).toEqual(['live']);
    expect(sqlite.prepare('SELECT object_id FROM sync_node_child_owners').pluck().all()).toEqual(['live-choice']);
  } finally { sqlite.close(); }
});
