import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import { UNIFIED_SYNC_GROUP_SCHEMA_STATEMENTS } from
  '../../../../../lib/core/database/syncGroupUnifiedSchemaStatements';
import { createCapacitorSqliteDbPort } from '../../capacitorSqliteDbPort';

const DATABASE_NAME = 'foliole-t151-lifecycle-member-client';
const CREATED_AT = '2026-08-26T03:00:00.000Z';

export async function openIosSyncGroupLifecycleAcceptanceDatabase() {
  const manager = new SQLiteConnection(CapacitorSQLite);
  const existing = await manager.isConnection(DATABASE_NAME, false).catch(() => ({ result: false }));
  const connection = existing.result
    ? await manager.retrieveConnection(DATABASE_NAME, false)
    : await manager.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false);
  if (!existing.result) await connection.open();
  const db = createCapacitorSqliteDbPort(connection, 'ios');
  const tables = await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_groups'");
  if (!tables.length) {
    for (const statement of UNIFIED_SYNC_GROUP_SCHEMA_STATEMENTS) await db.run(statement);
    await db.run(`INSERT INTO sync_groups
      (group_id, timeline_id, display_name, manager_member_id, roster_revision, state, created_at, updated_at)
      VALUES ('group-lifecycle-acceptance', 'timeline-lifecycle-acceptance', 'Lifecycle acceptance',
        'member-manager-acceptance', 0, 'active', ?, ?)`, [CREATED_AT, CREATED_AT]);
  }
  return { close: () => manager.closeConnection(DATABASE_NAME, false), db, name: DATABASE_NAME };
}
