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
  const source = requireSourceHostPayload(payload);
  const rootPath = text(payload.primary_path) ?? '';
  await writeSourceHostProjection(port, {
    ...source,
    configRef: record.object_id,
    createdAt: text(payload.created_at) ?? record.updated_at,
    rootPath,
    sourceType: 'watched',
    updatedAt: record.updated_at
  });
  await port.run(
    `INSERT INTO watched_folder_bindings (
       binding_id, connection_status, action_mode, archive_path, highlight_mode, highlight_path,
       primary_path, created_at, updated_at, deleted_at, source_ref
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(binding_id) DO UPDATE SET
       connection_status = excluded.connection_status,
       action_mode = excluded.action_mode,
       archive_path = excluded.archive_path,
       highlight_mode = excluded.highlight_mode,
       highlight_path = excluded.highlight_path,
       primary_path = excluded.primary_path,
       updated_at = excluded.updated_at,
       deleted_at = NULL,
       source_ref = excluded.source_ref`,
    [record.object_id, text(payload.connection_status) ?? 'needs-folder',
      text(payload.action_mode) ?? 'keep', text(payload.archive_path) ?? '',
      text(payload.highlight_mode) ?? 'merged', text(payload.highlight_path) ?? '',
      rootPath, text(payload.created_at) ?? record.updated_at, record.updated_at, source.sourceRef]
  );
}
