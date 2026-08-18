import type { DbPort } from './dbPort.js';
import { asObject, text } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applyWatchedFolderObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM watched_folder_bindings WHERE binding_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO watched_folder_bindings (
       binding_id, connected_device_id, connected_device_name, connected_platform, connection_status,
       action_mode, archive_path, highlight_mode, highlight_path, primary_path, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(binding_id) DO UPDATE SET
       connected_device_id = excluded.connected_device_id,
       connected_device_name = excluded.connected_device_name,
       connected_platform = excluded.connected_platform,
       connection_status = excluded.connection_status,
       action_mode = excluded.action_mode,
       archive_path = excluded.archive_path,
       highlight_mode = excluded.highlight_mode,
       highlight_path = excluded.highlight_path,
       primary_path = excluded.primary_path,
       updated_at = excluded.updated_at,
       deleted_at = NULL`,
    [record.object_id, text(payload.connected_device_id), text(payload.connected_device_name),
      text(payload.connected_platform), text(payload.connection_status) ?? 'needs-folder',
      text(payload.action_mode) ?? 'keep', text(payload.archive_path) ?? '',
      text(payload.highlight_mode) ?? 'merged', text(payload.highlight_path) ?? '',
      text(payload.primary_path) ?? '', text(payload.created_at) ?? record.updated_at, record.updated_at]
  );
}
