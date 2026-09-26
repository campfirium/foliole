import type { DbPort } from './dbPort.js';
import { asObject, text } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applyParentChildOrderObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM parent_child_order WHERE parent_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  const parentId = text(payload.parent_id);
  const raw = text(payload.child_ids_json);
  if (parentId !== record.object_id || raw === null) throw new Error('invalid_parent_child_order');
  const childIds: unknown = JSON.parse(raw);
  if (!Array.isArray(childIds) || childIds.some((id) => typeof id !== 'string') ||
      new Set(childIds).size !== childIds.length) throw new Error('invalid_parent_child_order');
  await port.run(
    `INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(parent_id) DO UPDATE SET child_ids_json = excluded.child_ids_json,
       updated_at = excluded.updated_at`,
    [parentId, JSON.stringify(childIds), record.updated_at]
  );
}
