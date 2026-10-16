import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

/** Rebuildable entry digests; invalidated in the same transaction as their source projection. */
export const FRAMED_SYNC_DIGEST_TABLES = [
  `CREATE TABLE IF NOT EXISTS framed_sync_node_digest (
    object_id TEXT PRIMARY KEY, shared_state_hash TEXT NOT NULL, unready INTEGER NOT NULL
  )`
];

function digestTriggers() {
  return [
  ...['INSERT', 'UPDATE', 'DELETE'].map(event => `CREATE TRIGGER IF NOT EXISTS trg_framed_digest_inventory_${event.toLowerCase()}
    AFTER ${event} ON framed_sync_inventory BEGIN
      DELETE FROM framed_sync_node_digest WHERE object_id = ${event === 'DELETE' ? 'OLD' : 'NEW'}.object_id;
      ${event === 'UPDATE' ? 'DELETE FROM framed_sync_node_digest WHERE object_id = OLD.object_id;' : ''}
    END`),
  ...['INSERT', 'UPDATE', 'DELETE'].map(event => `CREATE TRIGGER IF NOT EXISTS trg_framed_digest_version_${event.toLowerCase()}
    AFTER ${event} ON framed_sync_version_summary BEGIN
      DELETE FROM framed_sync_node_digest WHERE object_id = ${event === 'DELETE' ? 'OLD' : 'NEW'}.object_id;
      ${event === 'UPDATE' ? 'DELETE FROM framed_sync_node_digest WHERE object_id = OLD.object_id;' : ''}
    END`)
  ];
}

export const FRAMED_SYNC_DIGEST_SCHEMA = [...FRAMED_SYNC_DIGEST_TABLES, ...digestTriggers()];

export function migrateFramedSyncDigests(db: DatabaseMigrationTarget) {
  for (const sql of FRAMED_SYNC_DIGEST_SCHEMA) db.exec(sql);
}

export async function migrateCompanionFramedSyncDigests(db: DbPort) {
  for (const sql of FRAMED_SYNC_DIGEST_SCHEMA) await db.run(sql);
}
