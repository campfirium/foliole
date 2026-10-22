// @vitest-environment node
import { bytesToHex } from '@noble/hashes/utils.js';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { branch } from '../../../electron/sync/syncPackStoredVersionDependencies.testSupport.js';
import { flushRequestSyncInventoryDigests } from '../sync/framedSyncInventoryDigest.js';
import { readFramedSyncInventoryEntry } from '../sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../sync/syncNodeApplyExecutor.js';

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
