import { NEXT_SYNC_STATE_SEQ_SQL } from '../../../../../../lib/core/database/syncStateSequenceSchemaStatements';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort';
import {
  iosCompanionContentHash, iosCompanionHostName, markIosCompanionMutation
} from '../../runtime/iosCompanionMutationState';

export async function rekeyParentChildOrders(port: DbPort, sourceId: string, canonicalId: string) {
  const rows = await port.query<{ parent_id: string; child_ids_json: string }>(
    'SELECT parent_id, child_ids_json FROM parent_child_order'
  );
  const original = new Map(rows.map((row) => [row.parent_id, JSON.parse(row.child_ids_json) as string[]]));
  const next = new Map<string, string[]>();
  for (const [parentId, ids] of original) {
    const destination = parentId === sourceId ? canonicalId : parentId;
    const merged = next.get(destination) ?? [];
    for (const id of ids) {
      if (!merged.includes(id)) merged.push(id);
      if (id === sourceId && !merged.includes(canonicalId)) merged.push(canonicalId);
    }
    next.set(destination, merged);
  }
  const changed = [...next].filter(([id, ids]) => JSON.stringify(ids) !== JSON.stringify(original.get(id)));
  if (changed.length === 0 && !original.has(sourceId)) return;
  const now = new Date().toISOString();
  const hostName = await iosCompanionHostName(port);
  if (original.has(sourceId)) {
    await port.run('DELETE FROM parent_child_order WHERE parent_id = ?', [sourceId]);
    const oldJson = JSON.stringify(original.get(sourceId));
    await port.run(
      `INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash,
         last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
       VALUES ('parent_child_order', ?, ${NEXT_SYNC_STATE_SEQ_SQL},
         ?, ?, ?, ?, 1)
       ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
         last_modified_by_host_name = excluded.last_modified_by_host_name,
         updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, sync_dirty = 1`,
      [sourceId, await iosCompanionContentHash({ parent_id: sourceId, child_ids_json: oldJson }), hostName, now, now]
    );
  }
  for (const [parentId, ids] of changed) {
    const childIdsJson = JSON.stringify(ids);
    await port.run(
      `INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(parent_id) DO UPDATE SET child_ids_json = excluded.child_ids_json,
         updated_at = excluded.updated_at`, [parentId, childIdsJson, now]
    );
    await markIosCompanionMutation({
      db: port, objectType: 'parent_child_order', objectId: parentId, hostName, updatedAt: now,
      contentHash: await iosCompanionContentHash({ parent_id: parentId, child_ids_json: childIdsJson })
    });
  }
}
