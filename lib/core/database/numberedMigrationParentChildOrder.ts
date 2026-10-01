import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { ROOT_CHILD_ORDER_ID } from './parentChildOrder.js';
import { computeSyncContentHash } from './syncState.js';

const MIGRATED_ORDER_TIME = '1970-01-01T00:00:00.000Z';

interface OldOrderRow {
  id: string;
  parent_id: string | null;
  position: number;
}

export const PARENT_CHILD_ORDER_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS parent_child_order (
  parent_id TEXT PRIMARY KEY,
  child_ids_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

export function migrateParentChildOrder(sqlite: DatabaseMigrationTarget) {
  sqlite.exec(PARENT_CHILD_ORDER_SCHEMA_SQL);
  const rows = sqlite.prepare(
    `SELECT n.id, n.parent_id, o.position FROM node_order o
     JOIN nodes n ON n.id = o.node_id ORDER BY o.position, n.id`
  ).all() as OldOrderRow[];
  const childrenByParent = new Map<string, string[]>();
  for (const row of rows) {
    const parentId = row.parent_id ?? ROOT_CHILD_ORDER_ID;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(row.id);
    childrenByParent.set(parentId, children);
  }
  const insert = sqlite.prepare(
    'INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?)'
  );
  const state = sqlite.prepare(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name,
       updated_at, sync_dirty, deleted_at
     ) VALUES ('parent_child_order', ?,
       COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1), ?, 'migration', ?, 1, NULL)`
  );
  for (const [parentId, childIds] of childrenByParent) {
    const childIdsJson = JSON.stringify(childIds);
    insert.run(parentId, childIdsJson, MIGRATED_ORDER_TIME);
    state.run(parentId, computeSyncContentHash('parent_child_order', {
      parent_id: parentId, child_ids_json: childIdsJson
    }), MIGRATED_ORDER_TIME);
  }
}
