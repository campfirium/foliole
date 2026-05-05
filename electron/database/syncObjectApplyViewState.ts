import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';
import { normalizeNodeViewStateWriteSource } from '../../lib/platform/persistedNodeViewState.js';

import { asObject, integer, numberOrNull, text } from './syncObjectPayloadValues.js';

export function applyViewState(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  const payload = asObject(record);
  const objectIdParts = record.object_id.split(':');
  const deviceId = text(payload.device_id) ?? objectIdParts[3] ?? '*';
  const key = objectIdParts.slice(4).join(':');
  if (record.deleted_at) {
    if (key === 'active_node') driver.execute("DELETE FROM workspace_meta WHERE key = 'active_node_id'");
    if (key.startsWith('node:')) {
      driver.execute('DELETE FROM node_view_state WHERE node_id = ? AND device_id = ?', [key.slice(5), deviceId]);
    }
    return;
  }
  if (key === 'active_node') {
    driver.execute(
      `INSERT INTO workspace_meta (key, value, updated_at) VALUES ('active_node_id', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [text(payload.active_node_id) ?? '', record.updated_at]
    );
    return;
  }
  if (key.startsWith('node:')) {
    applyNodeViewState(driver, record, key.slice(5), deviceId, payload);
  }
}

function applyNodeViewState(
  driver: DatabaseDriver,
  record: NativeSyncObjectRecord,
  nodeId: string,
  deviceId: string,
  payload: Record<string, unknown>
) {
  const source = payload.source === undefined ? normalizeNodeViewStateWriteSource(payload.source) : 'sync-apply';
  driver.execute(
    `INSERT INTO node_view_state (node_id, device_id, scroll_top, selection_from, selection_to, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(node_id, device_id) DO UPDATE SET scroll_top = excluded.scroll_top,
       selection_from = excluded.selection_from, selection_to = excluded.selection_to,
       source = excluded.source, updated_at = excluded.updated_at`,
    [nodeId, deviceId, integer(payload.scroll_top),
      numberOrNull(payload.selection_from), numberOrNull(payload.selection_to),
      source, record.updated_at]
  );
}
