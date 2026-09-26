import type { DbPort } from '../sync/dbPort.js';

import { ROOT_CHILD_ORDER_ID } from './parentChildOrder.js';
import { computeSyncContentHash } from './syncState.js';

const MIGRATED_ORDER_TIME = '1970-01-01T00:00:00.000Z';

export async function migrateCompanionParentChildOrder(db: DbPort) {
  const missing = await db.query<{ id: string }>(
    `SELECT n.id FROM nodes n LEFT JOIN node_order o ON o.node_id = n.id
     WHERE n.deleted_at IS NULL AND o.node_id IS NULL LIMIT 1`
  );
  if (missing[0]) throw new Error(`missing_active_node_order:${missing[0].id}`);
  const rows = await db.query<{ id: string; parent_id: string | null }>(
    `SELECT n.id, n.parent_id FROM node_order o JOIN nodes n ON n.id = o.node_id
     ORDER BY o.position, n.id`
  );
  const byParent = new Map<string, string[]>();
  for (const row of rows) {
    const parentId = row.parent_id ?? ROOT_CHILD_ORDER_ID;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), row.id]);
  }
  for (const [parentId, childIds] of byParent) {
    const childIdsJson = JSON.stringify(childIds);
    await db.run('INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?)',
      [parentId, childIdsJson, MIGRATED_ORDER_TIME]);
    await db.run(
      `INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash,
         last_modified_by_host_name, updated_at, sync_dirty, deleted_at)
       VALUES ('parent_child_order', ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state),
         ?, 'migration', ?, 1, NULL)`,
      [parentId, computeSyncContentHash('parent_child_order', {
        parent_id: parentId, child_ids_json: childIdsJson
      }), MIGRATED_ORDER_TIME]
    );
  }
}
