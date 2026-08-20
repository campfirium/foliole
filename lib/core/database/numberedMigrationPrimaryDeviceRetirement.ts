import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { columnExists, tableExists } from './numberedMigrationHelpers.js';

export function retirePrimaryDeviceState(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'sync_peers') ||
      !columnExists(sqlite, 'sync_peers', 'primary_device_epoch')) return;
  sqlite.exec('DROP TABLE IF EXISTS sync_peers_next');
  sqlite.exec(`CREATE TABLE sync_peers_next (
    peer_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'paired',
    last_synced_at TEXT,
    last_seen_version_cursor TEXT,
    updated_at TEXT NOT NULL
  )`);
  sqlite.exec(`INSERT INTO sync_peers_next (
    peer_id, status, last_synced_at, last_seen_version_cursor, updated_at
  ) SELECT peer_id, status, last_synced_at, last_seen_version_cursor, updated_at FROM sync_peers`);
  sqlite.exec('DROP TABLE sync_peers');
  sqlite.exec('ALTER TABLE sync_peers_next RENAME TO sync_peers');
}
