import type { DbPort } from '../../../../../../lib/core/sync/dbPort';
import { createCapacitorSqliteDbPort } from '../../../capacitorSqliteDbPort';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from '../../../companionSyncNodeVersions';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';

import type { CompanionSyncPackCursorStore } from './companionSyncPackCursorStore';

const SYNC_PACK_CURSOR_KEY = 'sync_pack_cursor';

export function createIosCompanionSyncPackCursorStore(
  manager?: CompanionSqliteConnectionManager
): CompanionSyncPackCursorStore {
  return {
    loadCursor: () => manager ? withConnection(manager, loadCursor) : getIosCompanionDatabaseOwner().read(loadCursor),
    saveCursor: (cursor) => manager
      ? withConnection(manager, (connection) => saveCursor(connection, cursor))
      : getIosCompanionDatabaseOwner().runWriter((db) => saveCursor(db, cursor))
  };
}

async function loadCursor(connection: DbPort) {
  const rows = await connection.query(
    'SELECT value FROM companion_meta WHERE key = ? LIMIT 1',
    [SYNC_PACK_CURSOR_KEY]
  );
  const value = rows[0]?.value;
  if (value === undefined || value === null || value === '') return null;
  const cursor = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('invalid_ios_sync_pack_cursor');
  return cursor;
}

async function saveCursor(
  connection: DbPort,
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
  task: (connection: DbPort) => Promise<T>
) {
  const connection = await openCompanionDatabaseConnection(manager);
  try {
    return await task(createCapacitorSqliteDbPort(connection, 'ios'));
  } finally {
    await closeCompanionDatabaseConnection(manager, connection);
  }
}
