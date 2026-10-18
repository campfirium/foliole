import { buildCanonicalSyncTombstone } from '../sync/canonicalSyncTombstone.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';
import { retireExternalFolderDocuments, retireExternalFolderDocumentsWithDbPort } from './externalFolderDocumentRetirement.js';
import { upsertExternalResourceSyncState } from './externalResourceSyncState.js';
import { computeSyncContentHash } from './syncState.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

export function retireExternalFolder(driver: DatabaseDriver, folderId: string, now: string, hostName: string) {
  retireExternalFolderDocuments(driver, { folderId, deletedAt: now, hostName });
  driver.execute('DELETE FROM external_documents WHERE folder_id = ?', [folderId]);
  driver.execute('DELETE FROM external_folder_host_preferences WHERE folder_id = ?', [folderId]);
  driver.execute('DELETE FROM external_search_folders WHERE id = ?', [folderId]);
  driver.execute("DELETE FROM desktop_sources WHERE source_type = 'external' AND config_ref = ?", [folderId]);
  upsertExternalResourceSyncState(driver, {
    contentHash: computeSyncContentHash('external_folder', buildCanonicalSyncTombstone(folderId)),
    deletedAt: now, lastModifiedByHostName: hostName, objectId: folderId,
    objectType: 'external_folder', syncDirty: true, updatedAt: now
  });
}

export async function removeExternalFolderProjectionWithDbPort(port: DbPort, folderId: string, now: string) {
  await retireExternalFolderDocumentsWithDbPort(port, { folderId, deletedAt: now, hostName: 'sync-membership' });
  await port.run('DELETE FROM external_documents WHERE folder_id = ?', [folderId]);
  await port.run('DELETE FROM external_folder_host_preferences WHERE folder_id = ?', [folderId]);
  await port.run('DELETE FROM external_search_folders WHERE id = ?', [folderId]);
  await port.run("DELETE FROM desktop_sources WHERE source_type = 'external' AND config_ref = ?", [folderId]);
}

export async function retireExternalFolderWithDbPort(port: DbPort, folderId: string, now: string) {
  await removeExternalFolderProjectionWithDbPort(port, folderId, now);
  const [current] = await port.query<{ deleted_at: string | null }>(
    "SELECT deleted_at FROM sync_object_state WHERE object_type = 'external_folder' AND object_id = ?", [folderId]);
  if (current?.deleted_at) return;
  await port.run(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
    VALUES ('external_folder', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, ?, 'sync-membership', ?, ?, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, sync_dirty = 1`,
  [folderId, computeSyncContentHash('external_folder', buildCanonicalSyncTombstone(folderId)), now, now]);
}

export const DEPARTED_EXTERNAL_FOLDERS_SQL = `SELECT source.config_ref FROM desktop_sources source
  JOIN sync_group_devices device ON device.device_identity_key =
    json_extract(source.type_settings_json, '$.ownerDeviceIdentityKey')
  WHERE source.source_type = 'external' AND device.group_id = ? AND device.state = 'left'`;

export async function retireDepartedExternalFoldersWithDbPort(port: DbPort, groupId: string, now: string) {
  const folders = await port.query<{ config_ref: string }>(DEPARTED_EXTERNAL_FOLDERS_SQL, [groupId]);
  for (const folder of folders) await retireExternalFolderWithDbPort(port, folder.config_ref, now);
}
