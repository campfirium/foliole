import type { DbPort } from '../../../../../../lib/core/sync/dbPort';
import { createCapacitorSqliteDbPort } from '../../../capacitorSqliteDbPort';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from '../../../companionSyncNodeVersions';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';

import type { CompanionSyncPackCursorStore } from './companionSyncPackCursorStore';

const SYNC_PACK_CURSOR_STREAM = 'sync-pack-receive';

export function createIosCompanionSyncPackCursorStore(
  manager?: CompanionSqliteConnectionManager,
  peerId = 'legacy-peer'
): CompanionSyncPackCursorStore {
  return {
    loadCursor: () => manager ? withConnection(manager, (db) => loadCursor(db, peerId))
      : getIosCompanionDatabaseOwner().read((db) => loadCursor(db, peerId)),
    saveCursor: (cursor) => manager
      ? withConnection(manager, (connection) => saveCursor(connection, peerId, cursor))
      : getIosCompanionDatabaseOwner().runWriter((db) => saveCursor(db, peerId, cursor))
  };
}

async function loadCursor(connection: DbPort, peerId: string) {
  const rows = await connection.query(
    'SELECT cursor_value AS value FROM sync_peer_cursors WHERE authorization_id = ? AND stream_name = ? LIMIT 1',
    [peerId, SYNC_PACK_CURSOR_STREAM]
  );
  const value = rows[0]?.value;
  if (value === undefined || value === null || value === '') return null;
  const cursor = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('invalid_ios_sync_pack_cursor');
  return cursor;
}

async function saveCursor(
  connection: DbPort,
  peerId: string,
  cursor: number | null
) {
  if (cursor === null) {
    await connection.run('DELETE FROM sync_peer_cursors WHERE authorization_id = ? AND stream_name = ?',
      [peerId, SYNC_PACK_CURSOR_STREAM]);
    return null;
  }
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('invalid_ios_sync_pack_cursor');
  await connection.run(
    `INSERT INTO sync_peer_cursors (authorization_id, stream_name, cursor_value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(authorization_id, stream_name) DO UPDATE SET
       cursor_value = excluded.cursor_value, updated_at = excluded.updated_at`,
    [peerId, SYNC_PACK_CURSOR_STREAM, String(cursor), new Date().toISOString()]
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
