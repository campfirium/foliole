import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from '../../../companionSyncNodeVersions';

import type { CompanionSyncPackCursorStore } from './companionSyncPackCursorStore';

const SYNC_PACK_CURSOR_KEY = 'sync_pack_cursor';

export function createIosCompanionSyncPackCursorStore(
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
): CompanionSyncPackCursorStore {
  return {
    loadCursor: () => withConnection(manager, loadCursor),
    saveCursor: (cursor) => withConnection(manager, (connection) => saveCursor(connection, cursor))
  };
}

async function loadCursor(connection: Awaited<ReturnType<typeof openCompanionDatabaseConnection>>) {
  const result = await connection.query(
    'SELECT value FROM companion_meta WHERE key = ? LIMIT 1',
    [SYNC_PACK_CURSOR_KEY]
  );
  const value = result.values?.[0]?.value;
  if (value === undefined || value === null || value === '') return null;
  const cursor = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('invalid_ios_sync_pack_cursor');
  return cursor;
}

async function saveCursor(
  connection: Awaited<ReturnType<typeof openCompanionDatabaseConnection>>,
  cursor: number | null
) {
  if (cursor === null) {
    await connection.run('DELETE FROM companion_meta WHERE key = ?', [SYNC_PACK_CURSOR_KEY]);
    return null;
  }
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('invalid_ios_sync_pack_cursor');
  await connection.run(
    `INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [SYNC_PACK_CURSOR_KEY, String(cursor), new Date().toISOString()]
  );
  return cursor;
}

async function withConnection<T>(
  manager: CompanionSqliteConnectionManager,
  task: (connection: Awaited<ReturnType<typeof openCompanionDatabaseConnection>>) => Promise<T>
) {
  const connection = await openCompanionDatabaseConnection(manager);
  try {
    return await task(connection);
  } finally {
    await closeCompanionDatabaseConnection(manager, connection);
  }
}
