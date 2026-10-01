import type { DbPort } from '../sync/dbPort.js';

import { computeCompanionContentHash } from './companionHostStateHashes.js';
import { ROOT_CHILD_ORDER_ID } from './parentChildOrder.js';

const MIGRATED_ORDER_TIME = '1970-01-01T00:00:00.000Z';

export async function migrateCompanionParentChildOrder(db: DbPort) {
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
      [parentId, computeCompanionContentHash({
        parent_id: parentId, child_ids_json: childIdsJson
      }), MIGRATED_ORDER_TIME]
    );
  }
}
