// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { COMPANION_DATABASE_VERSION } from '../../platform/nativeCompanionContract.js';

import { createCompanionDatabase, migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from './migrations.js';
import { VISIBLE_NODES_CTE_SQL } from './workspaceVisibleNodesSql.js';

type Sqlite = InstanceType<typeof Database>;

// An index led by deleted_at matches nearly every node, and SQLite picked it over the id and parent indexes.
const indexesLedByDeletedAt = (sqlite: Sqlite) => sqlite.prepare(`SELECT i.name FROM pragma_index_list('nodes') i
  JOIN pragma_index_info(i.name) c ON c.seqno = 0 AND c.name = 'deleted_at'`).pluck().all();

const plan = (sqlite: Sqlite, sql: string) => (sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[])
  .map(row => row.detail).join('\n');

async function openHost(host: string) {
  const sqlite = new Database(':memory:');
  const db = createBetterSqliteDbPort(sqlite);
  if (host === 'desktop') initializeDatabaseSchema(sqlite);
  else await createCompanionDatabase(db, COMPANION_DATABASE_VERSION);
  return { db, sqlite };
}

it.each(['desktop', 'companion'])('drops the deleted_at index when upgrading a %s library', async host => {
  const { db, sqlite } = await openHost(host);
  try {
    expect(indexesLedByDeletedAt(sqlite)).toEqual([]);
    const previous = host === 'desktop' ? 203 : 127;
    sqlite.exec(`CREATE INDEX idx_nodes_deleted_at ON nodes (deleted_at); PRAGMA user_version = ${previous}`);
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await db.transaction(tx => migrateCompanionDatabase(tx, previous, COMPANION_DATABASE_VERSION));

    expect(sqlite.pragma('user_version', { simple: true }))
      .toBe(host === 'desktop' ? DATABASE_SCHEMA_VERSION : COMPANION_DATABASE_VERSION);
    expect(indexesLedByDeletedAt(sqlite)).toEqual([]);
    expect(plan(sqlite, `${VISIBLE_NODES_CTE_SQL} SELECT id FROM visible_nodes`)).toContain('idx_nodes_parent_id');
    expect(plan(sqlite, "SELECT id FROM nodes WHERE id IN ('a', 'b') AND deleted_at IS NULL"))
      .toContain('sqlite_autoindex_nodes_1');
  } finally { sqlite.close(); }
});
