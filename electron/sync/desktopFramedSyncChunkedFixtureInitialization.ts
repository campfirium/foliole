import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { migrateFramedSyncAvailableBlobs } from '../../lib/core/database/framedSyncAvailableBlobMigration.js';
import { migrateVerifiedBodyInventory } from '../../lib/core/database/verifiedBodyInventoryMigration.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { markDesktopSyncGroupMemberStateReady } from './desktopSyncGroupMemberStateReadiness.js';

export function fixtureBodyStorage() {
  const value = process.env.FOLIOLE_FRAMED_SYNC_FIXTURE_BODY_STORAGE ?? 'continuous';
  if (value !== 'continuous' && value !== 'chunked') throw new Error('fixture_body_storage_invalid');
  return value;
}

export function fixtureInitializationPhase() {
  const value = process.env.FOLIOLE_FRAMED_SYNC_FIXTURE_INIT_PHASE ?? 'fresh';
  if (value !== 'fresh' && value !== 'reopen') throw new Error('fixture_initialization_phase_invalid');
  return value;
}

/** Only the parent fixture's explicit fresh phase may transform its disposable library. */
async function initializeChunkedFixtureBodies() {
  const connection = openDatabaseConnection();
  await createBetterSqliteDbPort(connection.sqlite).transaction(async (tx) => {
    await migrateBodyContentStorage(tx);
    await migrateBodyContentOwners(tx, 'desktop');
    await migrateFramedSyncAvailableBlobs(tx, 'desktop');
    await migrateVerifiedBodyInventory(tx);
    await tx.run('DROP TABLE content_blob_data');
  });
}

export async function initializeFixtureDatabase(bodyStorage: 'continuous' | 'chunked',
  phase: 'fresh' | 'reopen', deviceId: string) {
  if (bodyStorage === 'chunked' && phase === 'reopen') openDatabaseConnection();
  else initializeDatabase(undefined, { deferSearchIndex: true, recovery: 'fail' });
  initializeSyncGroup(deviceId);
  if (bodyStorage === 'chunked' && phase === 'fresh') await initializeChunkedFixtureBodies();
}

function initializeSyncGroup(deviceId: string) {
  const driver = openDatabaseConnection().driver;
  const now = '2026-10-05T00:00:00.000Z';
  const groupKey = Buffer.alloc(32, 7).toString('base64url');
  driver.execute(`INSERT OR IGNORE INTO sync_groups VALUES ('t326-group', 'T326', ?, ?, ?)`,
    [groupKey, now, now]);
  for (const memberId of ['desktop-a', 'desktop-b']) {
    driver.execute(`INSERT OR IGNORE INTO sync_group_devices VALUES
      ('t326-group', ?, ?, ?, ?, 'desktop', 'active', ?, NULL, ?, ?)`,
    [memberId, `${memberId}-anchor`, `/t326/${memberId}`, memberId, now, now, now]);
  }
  driver.execute(`INSERT OR IGNORE INTO sync_group_local_state VALUES (1, 't326-group', ?, 'active', ?)`,
    [deviceId, now]);
  markDesktopSyncGroupMemberStateReady(deviceId === 'desktop-a' ? 'desktop-b' : 'desktop-a');
}
