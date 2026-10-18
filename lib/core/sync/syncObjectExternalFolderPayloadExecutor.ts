import { removeExternalFolderProjectionWithDbPort, retireExternalFolderWithDbPort } from '../database/externalFolderRetirement.js';

import { hasCanonicalExternalResourceContentHash } from './canonicalExternalResourceContentHash.js';
import type { DbPort } from './dbPort.js';
import { asObject, text } from './syncObjectPayloadValues.js';
import type { SyncObjectRecord } from './syncObjectRecord.js';
import { writeSourceHostProjection } from './syncObjectSourcePayload.js';


export async function applyExternalFolderObject(port: DbPort, record: SyncObjectRecord) {
  if (!hasCanonicalExternalResourceContentHash(record)) {
    throw new Error('sync_content_hash_mismatch:external_folder');
  }
  if (record.deleted_at) {
    await removeExternalFolderProjectionWithDbPort(port, record.object_id, record.deleted_at);
    return;
  }
  const [retired] = await port.query<{ deleted_at: string | null }>(
    "SELECT deleted_at FROM sync_object_state WHERE object_type = 'external_folder' AND object_id = ?", [record.object_id]);
  if (retired?.deleted_at) return false;
  const payload = asObject(record);
  const owner = text(payload.owner_device_identity_key);
  if (owner && (await port.query(
    "SELECT 1 FROM sync_group_devices WHERE device_identity_key = ? AND state = 'left'", [owner])).length) {
    await retireExternalFolderWithDbPort(port, record.object_id, record.updated_at);
    return false;
  }
  const sourceRef = text(payload.source_ref) ?? '';
  const [existing] = await port.query<{ owner: string | null }>(
    "SELECT json_extract(type_settings_json, '$.ownerDeviceIdentityKey') AS owner FROM desktop_sources WHERE source_ref = ?", [sourceRef]);
  if (existing?.owner && existing.owner !== owner) throw new Error('external_folder_owner_conflict');
  const hostName = text(payload.host_name) ?? '';
  const hostPlatform = text(payload.host_platform) ?? '';
  const attachmentMode = text(payload.attachment_mode) ?? 'document_relative_first_then_fixed_root';
  const excludedDirsJson = text(payload.excluded_dirs_json) ?? '[]';
  await writeSourceHostProjection(port, {
    hostName, hostPlatform, sourceRef,
    configRef: record.object_id,
    createdAt: record.updated_at,
    preserveLocalPaths: Boolean(owner && existing?.owner === owner),
    rootPath: '',
    sourceType: 'external',
    typeSettingsJson: JSON.stringify({ attachmentMode, attachmentRootPath: null,
      ownerDeviceIdentityKey: text(payload.owner_device_identity_key),
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
