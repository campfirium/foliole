import type { DbPort } from './dbPort.js';
import { asObject, text } from './syncObjectPayloadValues.js';
import { requireSourceHostPayload, writeSourceHostProjection } from './syncObjectSourcePayload.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applyWatchedFolderObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM watched_folder_bindings WHERE binding_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  if (['root_path', 'path_flavor', 'primary_path', 'highlight_path', 'archive_path', 'type_settings_json']
    .some((key) => key in payload) || !('owner_device_identity_key' in payload)) {
    throw new Error('invalid_watched_folder_payload');
  }
  const source = requireSourceHostPayload({ ...payload, type_settings_json: '{}' });
  const ownerId = text(payload.owner_device_identity_key);
  const reportedPath = text(payload.reported_path);
  if (payload.owner_device_identity_key !== null && !ownerId) throw new Error('invalid_watched_folder_owner');
  if (reportedPath === null) throw new Error('invalid_watched_folder_display_path');
  await writeSourceHostProjection(port, {
    ...source,
    configRef: record.object_id,
    createdAt: text(payload.created_at) ?? record.updated_at,
    preserveLocalPaths: true,
    rootPath: '',
    sourceType: 'watched',
    updatedAt: record.updated_at
  });
  await port.run(
    `INSERT INTO watched_folder_bindings (
       binding_id, connection_status, action_mode, highlight_mode,
       created_at, updated_at, deleted_at, source_ref, owner_device_identity_key, reported_path
     ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
     ON CONFLICT(binding_id) DO UPDATE SET
       connection_status = excluded.connection_status,
       action_mode = excluded.action_mode,
       highlight_mode = excluded.highlight_mode,
       updated_at = excluded.updated_at,
       deleted_at = NULL,
       source_ref = excluded.source_ref,
       owner_device_identity_key = excluded.owner_device_identity_key,
       reported_path = excluded.reported_path`,
    [record.object_id, text(payload.connection_status) ?? 'needs-folder',
      text(payload.action_mode) ?? 'keep', text(payload.highlight_mode) ?? 'merged',
      text(payload.created_at) ?? record.updated_at, record.updated_at, source.sourceRef, ownerId,
      reportedPath]
  );
}
