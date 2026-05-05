import type { DbPort } from './dbPort.js';
import { asObject, integer, text } from './syncObjectPayloadValues.js';
import {
  loadSyncPackSyncObjectsWithDbPort,
  type SyncPackSyncObjectRecord,
  type SyncPackSyncObjectsOptions
} from './syncPackSyncObjectsExecutor.js';

export async function applySyncPackViewStateObjectsWithDbPort(
  port: DbPort,
  options: SyncPackSyncObjectsOptions
) {
  const records = (await loadSyncPackSyncObjectsWithDbPort(port, options))
    .filter((record) => record.object_type === 'view_state');
  for (const record of records) {
    await applyViewStateObject(port, record);
  }
  return records.length;
}

async function applyViewStateObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  const { deviceId, key } = parseViewStateObjectId(record.object_id);
  if (record.deleted_at) {
    if (key === 'active_node') {
      await port.run("DELETE FROM workspace_meta WHERE key = 'active_node_id'");
    } else if (key.startsWith('node:')) {
      await port.run('DELETE FROM node_view_state WHERE node_id = ? AND device_id = ?', [key.slice(5), deviceId]);
    }
    return;
  }
  const payload = asObject(record);
  if (key === 'active_node') {
    await port.run(
      `INSERT INTO workspace_meta (key, value, updated_at) VALUES ('active_node_id', ?, ?) ` +
      `ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [text(payload.active_node_id) ?? '', record.updated_at]
    );
  } else if (key.startsWith('node:')) {
    await port.run(
      `INSERT INTO node_view_state (node_id, device_id, scroll_top, selection_from, selection_to, source, updated_at) ` +
      `VALUES (?, ?, ?, NULL, NULL, ?, ?) ` +
      `ON CONFLICT(node_id, device_id) DO UPDATE SET ` +
      `scroll_top = excluded.scroll_top, selection_from = excluded.selection_from, ` +
      `selection_to = excluded.selection_to, source = excluded.source, updated_at = excluded.updated_at`,
      [key.slice(5), deviceId, Math.max(0, integer(payload.scroll_top)), Object.hasOwn(payload, 'source') ? 'sync-apply' : 'user-scroll', record.updated_at]
    );
  }
}

function parseViewStateObjectId(objectId: string) {
  const parts = objectId.split(':');
  return {
    deviceId: parts.length >= 5 ? parts[3] : '*',
    key: parts.length >= 5 ? parts.slice(4).join(':') : objectId
  };
}
