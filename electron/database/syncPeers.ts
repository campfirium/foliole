import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeSyncPeer } from '../../lib/platform/nativeStorageContract.js';

import { openDatabaseConnection } from './connection.js';

interface SyncPeerRow extends DatabaseRow {
  last_seen_version_cursor: string | null;
  last_synced_at: string | null;
  peer_id: string;
  status: string;
  updated_at: string;
}

type SaveSyncPeerInput = Pick<NativeSyncPeer, 'last_seen_version_cursor' | 'last_synced_at' | 'peer_id' | 'status'>;

function normalizePeerStatus(value: unknown): NativeSyncPeer['status'] {
  return value === 'paired' || value === 'stale' || value === 'revoked' ? value : 'paired';
}

function normalizeSyncPeers(peers: SaveSyncPeerInput[]) {
  return peers
    .map((peer) => ({
      lastSeenVersionCursor:
        typeof peer.last_seen_version_cursor === 'string' && peer.last_seen_version_cursor.trim()
          ? peer.last_seen_version_cursor.trim()
          : null,
      lastSyncedAt:
        typeof peer.last_synced_at === 'string' && peer.last_synced_at.trim() ? peer.last_synced_at.trim() : null,
      peerId: peer.peer_id.trim(),
      status: normalizePeerStatus(peer.status)
    }))
    .filter((peer) => peer.peerId);
}

function readRows() {
  return openDatabaseConnection().driver.queryAll<SyncPeerRow>(
    `SELECT
       peer_id,
       status,
       last_synced_at,
       last_seen_version_cursor,
       updated_at
     FROM sync_peers
     ORDER BY updated_at DESC, peer_id ASC`
  );
}

function toNativeSyncPeer(row: SyncPeerRow): NativeSyncPeer {
  return {
    last_seen_version_cursor: row.last_seen_version_cursor,
    last_synced_at: row.last_synced_at,
    peer_id: row.peer_id,
    status: normalizePeerStatus(row.status),
    updated_at: row.updated_at
  };
}

export function loadSyncPeers() {
  return readRows().map((row) => toNativeSyncPeer(row));
}

export function saveSyncPeers(peers: SaveSyncPeerInput[]) {
  const driver = openDatabaseConnection().driver;
  const now = new Date().toISOString();
  const normalizedPeers = normalizeSyncPeers(peers);

  driver.transaction(() => {
    driver.execute(
      `DELETE FROM sync_peers
       WHERE peer_id NOT IN (${normalizedPeers.map(() => '?').join(', ') || "''"})`,
      normalizedPeers.map((peer) => peer.peerId)
    );

    for (const peer of normalizedPeers) {
      driver.execute(
        `INSERT INTO sync_peers (
           peer_id,
           status,
           last_synced_at,
           last_seen_version_cursor,
           updated_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(peer_id) DO UPDATE SET
           status = excluded.status,
           last_synced_at = excluded.last_synced_at,
           last_seen_version_cursor = excluded.last_seen_version_cursor,
           updated_at = excluded.updated_at`,
        [peer.peerId, peer.status, peer.lastSyncedAt, peer.lastSeenVersionCursor, now]
      );
    }

    if (!normalizedPeers.length) {
      driver.execute('DELETE FROM sync_peers');
    }
  });

  return loadSyncPeers();
}
