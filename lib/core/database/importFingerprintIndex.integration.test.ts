// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { COMPANION_DATABASE_VERSION } from '../../platform/nativeCompanionContract.js';

import { createCompanionDatabase, migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';
import { NODE_IMPORT_FINGERPRINT_INDEX_NAME } from './coreIndexSchemaStatements.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from './migrations.js';
import { MATCHING_IMPORT_CANDIDATES_SQL } from './nodeRestoreConflicts.js';

type Sqlite = InstanceType<typeof Database>;

const hasIndex = (sqlite: Sqlite) => sqlite
  .prepare("SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = ?")
  .pluck().get(NODE_IMPORT_FINGERPRINT_INDEX_NAME) === 1;

const queryPlan = (sqlite: Sqlite) => (sqlite
  .prepare(`EXPLAIN QUERY PLAN ${MATCHING_IMPORT_CANDIDATES_SQL}`)
  .all('source', 'content') as Array<{ detail: string }>).map(row => row.detail).join('\n');

async function openHost(host: string) {
  const sqlite = new Database(':memory:');
  const db = createBetterSqliteDbPort(sqlite);
  if (host === 'desktop') initializeDatabaseSchema(sqlite);
  else await createCompanionDatabase(db, COMPANION_DATABASE_VERSION);
  return { db, sqlite };
}

it.each(['desktop', 'companion'])('serves %s restore duplicate lookups from the fingerprint index', async host => {
  const { sqlite } = await openHost(host);
  try {
    expect(hasIndex(sqlite)).toBe(true);
    const plan = queryPlan(sqlite);
    expect(plan).toContain(`USING INDEX ${NODE_IMPORT_FINGERPRINT_INDEX_NAME}`);
    expect(plan).not.toMatch(/SCAN nodes/);
  } finally { sqlite.close(); }
});

it.each(['desktop', 'companion'])('adds the fingerprint index when upgrading a %s library', async host => {
  const { db, sqlite } = await openHost(host);
  try {
    sqlite.exec(`DROP INDEX ${NODE_IMPORT_FINGERPRINT_INDEX_NAME}`);
    expect(queryPlan(sqlite)).toMatch(/SCAN nodes/);
    if (host === 'desktop') {
      sqlite.pragma('user_version = 196');
      initializeDatabaseSchema(sqlite);
      expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    } else {
      const beforeFingerprintIndex = 123;
      sqlite.pragma(`user_version = ${beforeFingerprintIndex}`);
      await db.transaction(tx => migrateCompanionDatabase(tx, beforeFingerprintIndex, COMPANION_DATABASE_VERSION));
      expect(sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
    }
    expect(hasIndex(sqlite)).toBe(true);
    expect(queryPlan(sqlite)).toContain(`USING INDEX ${NODE_IMPORT_FINGERPRINT_INDEX_NAME}`);
  } finally { sqlite.close(); }
});
