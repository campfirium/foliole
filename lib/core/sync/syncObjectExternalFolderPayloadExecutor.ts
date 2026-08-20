import type { DbPort } from './dbPort.js';
import { asObject, integer, text } from './syncObjectPayloadValues.js';
import { requireSourceHostPayload, writeSourceHostProjection } from './syncObjectSourcePayload.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applyExternalFolderObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM external_documents WHERE folder_id = ?', [record.object_id]);
    await port.run('DELETE FROM external_search_folders WHERE id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  const source = requireSourceHostPayload(payload);
  const rootPath = text(payload.folder_path) ?? '';
  await writeSourceHostProjection(port, {
    ...source,
    configRef: record.object_id,
    createdAt: text(payload.created_at) ?? record.updated_at,
    rootPath,
    sourceType: 'external',
    updatedAt: record.updated_at
  });
  await port.run(
    `INSERT INTO external_search_folders (id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status,
       document_count, indexed_at, last_error, created_at, updated_at, source_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET folder_path = excluded.folder_path, attachment_mode = excluded.attachment_mode,
       attachment_root_path = excluded.attachment_root_path, excluded_dirs_json = excluded.excluded_dirs_json,
       status = excluded.status, document_count = excluded.document_count, indexed_at = excluded.indexed_at,
       last_error = excluded.last_error, updated_at = excluded.updated_at, source_ref = excluded.source_ref`,
    [record.object_id, rootPath, text(payload.attachment_mode) ?? 'document_relative_first_then_fixed_root',
      text(payload.attachment_root_path), text(payload.excluded_dirs_json) ?? '[]', text(payload.status) ?? 'idle',
      integer(payload.document_count), text(payload.indexed_at), text(payload.last_error),
      text(payload.created_at) ?? record.updated_at, record.updated_at, source.sourceRef]
  );
}
