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
    loadPosition: () => manager ? withConnection(manager, (db) => loadPosition(db, peerId))
      : getIosCompanionDatabaseOwner().read((db) => loadPosition(db, peerId)),
    loadCursor: () => manager ? withConnection(manager, (db) => loadCursor(db, peerId))
      : getIosCompanionDatabaseOwner().read((db) => loadCursor(db, peerId)),
    loadRestoreCursor: (restoreId) => manager
      ? withConnection(manager, (db) => loadRestoreCursor(db, peerId, restoreId))
      : getIosCompanionDatabaseOwner().read((db) => loadRestoreCursor(db, peerId, restoreId)),
    loadRestorePosition: (restoreId) => manager
      ? withConnection(manager, (db) => loadRestorePosition(db, peerId, restoreId))
      : getIosCompanionDatabaseOwner().read((db) => loadRestorePosition(db, peerId, restoreId)),
    saveCursor: (cursor) => manager
      ? withConnection(manager, (connection) => saveCursor(connection, peerId, cursor))
      : getIosCompanionDatabaseOwner().runWriter((db) => saveCursor(db, peerId, cursor))
  };
}

async function loadCursor(connection: DbPort, peerId: string) {
  const committed = await loadProgress(connection, peerId);
  if (committed) return validCursor(committed.cursor_state_seq);
  const rows = await connection.query<{ value: number | string }>(
    'SELECT cursor_value AS value FROM sync_peer_cursors WHERE peer_id = ? AND stream_name = ? LIMIT 1',
    [peerId, SYNC_PACK_CURSOR_STREAM]
  );
  if (rows[0]?.value !== undefined) validCursor(Number(rows[0].value));
  return 0;
}

async function loadPosition(connection: DbPort, peerId: string) {
  const committed = await loadProgress(connection, peerId);
  if (!committed) return { cursor: await loadCursor(connection, peerId) };
  const cursor = validCursor(committed.cursor_state_seq);
  if (committed.completed) return { cursor };
  if (committed.restore_id) throw new Error('sync_group_restore_event_changed');
  if (!Number.isSafeInteger(committed.frontier_state_seq) ||
      committed.frontier_state_seq < cursor || !committed.source_epoch) {
    throw new Error('invalid_ios_sync_pack_cursor');
  }
  return { cursor, frontierStateSeq: committed.frontier_state_seq,
    sourceEpoch: committed.source_epoch };
}

async function loadRestoreCursor(connection: DbPort, peerId: string, restoreId: string) {
  return (await loadRestorePosition(connection, peerId, restoreId)).cursor;
}

async function loadRestorePosition(connection: DbPort, peerId: string, restoreId: string) {
  const committed = await loadProgress(connection, peerId);
  if (!committed) return { cursor: 0 };
  const cursor = validCursor(committed.cursor_state_seq);
  if (committed.restore_id === restoreId) {
    if (!Number.isSafeInteger(committed.frontier_state_seq) ||
        committed.frontier_state_seq < cursor || !committed.source_epoch) {
      throw new Error('invalid_ios_sync_pack_cursor');
    }
    return { cursor, frontierStateSeq: committed.frontier_state_seq,
      sourceEpoch: committed.source_epoch };
  }
  return { cursor: 0 };
}

async function loadProgress(connection: DbPort, peerId: string) {
  const rows = await connection.query<{
    completed: number; cursor_state_seq: number; frontier_state_seq: number;
    restore_id: string | null; source_epoch: string
  }>(
    `SELECT progress.completed, progress.cursor_state_seq, progress.frontier_state_seq,
       progress.restore_id, progress.source_epoch
     FROM sync_pack_receive_progress progress
     JOIN sync_group_local_state local ON local.group_id = progress.group_id
     WHERE local.singleton_id = 1 AND local.state = 'active' AND progress.peer_id = ?`,
    [peerId]
  );
  return rows[0] ?? null;
}

function validCursor(cursor: number) {
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('invalid_ios_sync_pack_cursor');
  return cursor;
}

async function saveCursor(
  connection: DbPort,
  peerId: string,
  cursor: number | null
) {
  if (cursor === null) {
    await connection.run('DELETE FROM sync_peer_cursors WHERE peer_id = ? AND stream_name = ?',
      [peerId, SYNC_PACK_CURSOR_STREAM]);
    return null;
  }
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('invalid_ios_sync_pack_cursor');
  await connection.run(
    `INSERT INTO sync_peer_cursors (peer_id, stream_name, cursor_value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(peer_id, stream_name) DO UPDATE SET
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
