import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { VIRTUAL_ROOT_NODE_ID } from './specialNodeIds.js';

/**
 * Local work queue of nodes whose current version may lack a node sync state row.
 * Invariant: it holds every node the full scan in `NODE_SYNC_STATE_MISSING_SQL` would find;
 * it may hold more, which the consumer prunes. It is device-local, never synced.
 */
const enqueue = 'INSERT INTO node_sync_state_backfill (node_id)';
const ROOT = `'${VIRTUAL_ROOT_NODE_ID}'`;
const noState = (id: string) =>
  `NOT EXISTS (SELECT 1 FROM sync_object_state s WHERE s.object_type = 'node' AND s.object_id = ${id})`;
const candidate = (id: string) => `${id} <> ${ROOT} AND ${noState(id)}`;
const enqueueNode = (id: string) => `${enqueue} SELECT n.id FROM nodes n
  WHERE n.id = ${id} AND n.current_version_id IS NOT NULL AND ${candidate('n.id')}
  ON CONFLICT(node_id) DO NOTHING;`;

/** The membership the queue stands in for: the original whole-table scan. */
export const NODE_SYNC_STATE_MISSING_SQL = `SELECT n.id FROM nodes n
  INNER JOIN node_sync_versions v ON v.version_id = n.current_version_id
  WHERE n.id <> ${ROOT} AND n.current_version_id IS NOT NULL AND ${noState('n.id')}`;

export const NODE_SYNC_STATE_BACKFILL_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS node_sync_state_backfill (node_id TEXT PRIMARY KEY) WITHOUT ROWID',
  `CREATE TRIGGER IF NOT EXISTS node_sync_state_backfill_node_insert AFTER INSERT ON nodes
    WHEN NEW.current_version_id IS NOT NULL AND ${candidate('NEW.id')}
    BEGIN ${enqueue} VALUES (NEW.id) ON CONFLICT(node_id) DO NOTHING; END`,
  `CREATE TRIGGER IF NOT EXISTS node_sync_state_backfill_node_version AFTER UPDATE OF id, current_version_id ON nodes
    WHEN NEW.current_version_id IS NOT NULL AND ${candidate('NEW.id')}
    BEGIN ${enqueue} VALUES (NEW.id) ON CONFLICT(node_id) DO NOTHING; END`,
  `CREATE TRIGGER IF NOT EXISTS node_sync_state_backfill_node_delete AFTER DELETE ON nodes
    BEGIN DELETE FROM node_sync_state_backfill WHERE node_id = OLD.id; END`,
  // A node may point at its version before the version row lands.
  ...['INSERT', 'UPDATE OF version_id'].map((event, index) => `CREATE TRIGGER IF NOT EXISTS
    node_sync_state_backfill_version_${index ? 'update' : 'insert'} AFTER ${event} ON node_sync_versions
    BEGIN ${enqueue} SELECT n.id FROM nodes n WHERE n.current_version_id = NEW.version_id AND ${candidate('n.id')}
      ON CONFLICT(node_id) DO NOTHING; END`),
  `CREATE TRIGGER IF NOT EXISTS node_sync_state_backfill_state_insert AFTER INSERT ON sync_object_state
    WHEN NEW.object_type = 'node'
    BEGIN DELETE FROM node_sync_state_backfill WHERE node_id = NEW.object_id; END`,
  `CREATE TRIGGER IF NOT EXISTS node_sync_state_backfill_state_delete AFTER DELETE ON sync_object_state
    WHEN OLD.object_type = 'node' BEGIN ${enqueueNode('OLD.object_id')} END`,
  `CREATE TRIGGER IF NOT EXISTS node_sync_state_backfill_state_update AFTER UPDATE OF object_type, object_id ON sync_object_state
    WHEN OLD.object_type IS NOT NEW.object_type OR OLD.object_id IS NOT NEW.object_id
    BEGIN
      ${enqueueNode("CASE WHEN OLD.object_type = 'node' THEN OLD.object_id END")}
      DELETE FROM node_sync_state_backfill WHERE NEW.object_type = 'node' AND node_id = NEW.object_id;
    END`
] as const;

export function migrateNodeSyncStateBackfill(sqlite: DatabaseMigrationTarget) {
  for (const sql of NODE_SYNC_STATE_BACKFILL_SCHEMA) sqlite.exec(sql);
  sqlite.exec(`${enqueue} ${NODE_SYNC_STATE_MISSING_SQL} ON CONFLICT(node_id) DO NOTHING`);
}
