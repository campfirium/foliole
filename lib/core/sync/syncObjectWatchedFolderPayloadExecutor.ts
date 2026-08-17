import type { DbPort, DbRow } from './dbPort.js';
import { asObject, integer, text } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

interface CurrentOwnerRow extends DbRow {
  owner_installation_id: string | null;
}

export async function applyWatchedFolderObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('UPDATE watched_folder_bindings SET deleted_at = ?, enabled = 0 WHERE binding_id = ?', [
      record.deleted_at, record.object_id
    ]);
    return;
  }
  const payload = asObject(record);
  const incomingOwner = text(payload.owner_installation_id);
  const current = (await port.query<CurrentOwnerRow>(
    'SELECT owner_installation_id FROM watched_folder_bindings WHERE binding_id = ?', [record.object_id]
  ))[0];
  if (current && current.owner_installation_id !== incomingOwner) {
    throw new Error('Watched folder owner is immutable');
  }
  await port.run(
    `INSERT INTO watched_folder_bindings (
       binding_id, owner_installation_id, owner_device_name, owner_platform,
       action_mode, archive_path, highlight_mode, highlight_path, keep_preview_json, primary_path,
       enabled, availability, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(binding_id) DO UPDATE SET owner_device_name = excluded.owner_device_name,
       owner_platform = excluded.owner_platform, action_mode = excluded.action_mode,
       archive_path = excluded.archive_path, highlight_mode = excluded.highlight_mode,
       highlight_path = excluded.highlight_path, keep_preview_json = excluded.keep_preview_json,
       primary_path = excluded.primary_path, enabled = excluded.enabled,
       availability = excluded.availability, updated_at = excluded.updated_at, deleted_at = NULL`,
    [record.object_id, incomingOwner, text(payload.owner_device_name), text(payload.owner_platform),
      text(payload.action_mode) ?? 'archive', text(payload.archive_path) ?? '',
      text(payload.highlight_mode) ?? 'off', text(payload.highlight_path) ?? '',
      text(payload.keep_preview_json), text(payload.primary_path) ?? '',
      incomingOwner && integer(payload.enabled) === 1 ? 1 : 0,
      text(payload.availability) ?? 'unknown', text(payload.created_at) ?? record.updated_at, record.updated_at]
  );
}
