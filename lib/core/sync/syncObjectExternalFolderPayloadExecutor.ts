import { hasCanonicalExternalResourceContentHash } from './canonicalExternalResourceContentHash.js';
import type { DbPort } from './dbPort.js';
import { asObject, text } from './syncObjectPayloadValues.js';
import { writeSourceHostProjection } from './syncObjectSourcePayload.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applyExternalFolderObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (!hasCanonicalExternalResourceContentHash(record)) {
    throw new Error('sync_content_hash_mismatch:external_folder');
  }
  if (record.deleted_at) {
    await port.run('DELETE FROM external_documents WHERE folder_id = ?', [record.object_id]);
    await port.run('DELETE FROM external_search_folders WHERE id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  const sourceRef = text(payload.source_ref) ?? '';
  const hostName = text(payload.host_name) ?? '';
  const hostPlatform = text(payload.host_platform) ?? '';
  const attachmentMode = text(payload.attachment_mode) ?? 'document_relative_first_then_fixed_root';
  const excludedDirsJson = text(payload.excluded_dirs_json) ?? '[]';
  await writeSourceHostProjection(port, {
    hostName, hostPlatform, sourceRef,
    configRef: record.object_id,
    createdAt: record.updated_at,
    preserveLocalPaths: true,
    rootPath: '',
    sourceType: 'external',
    typeSettingsJson: JSON.stringify({ attachmentMode, attachmentRootPath: null,
      connectionStatus: 'needs-folder', excludedDirs: JSON.parse(excludedDirsJson) }),
    updatedAt: record.updated_at
  });
  await port.run(
    `INSERT INTO external_search_folders (id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status,
       document_count, indexed_at, last_error, created_at, updated_at, source_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET attachment_mode = excluded.attachment_mode,
       excluded_dirs_json = excluded.excluded_dirs_json,
       updated_at = excluded.updated_at, source_ref = excluded.source_ref`,
    [record.object_id, '', attachmentMode, null, excludedDirsJson, 'idle', 0, null, null,
      record.updated_at, record.updated_at, sourceRef]
  );
}
