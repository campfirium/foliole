import { buildCanonicalSyncTombstone } from '../sync/canonicalSyncTombstone.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';
import { retireExternalFolderDocuments, retireExternalFolderDocumentsWithDbPort } from './externalFolderDocumentRetirement.js';
import { externalDepartureCutoff } from './externalFolderMembershipVisibility.js';
import { upsertExternalResourceSyncState } from './externalResourceSyncState.js';
import { computeSyncContentHash } from './syncState.js';

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
  const [desktopPreferences] = await port.query(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'external_folder_host_preferences'");
  if (desktopPreferences) await port.run('DELETE FROM external_folder_host_preferences WHERE folder_id = ?', [folderId]);
  await port.run('DELETE FROM external_search_folders WHERE id = ?', [folderId]);
  await port.run("DELETE FROM desktop_sources WHERE source_type = 'external' AND config_ref = ?", [folderId]);
}

const EXPIRED_DEPARTED_EXTERNAL_FOLDERS_SQL = `SELECT source.config_ref FROM desktop_sources source
  JOIN sync_group_devices device ON device.device_identity_key =
    json_extract(source.type_settings_json, '$.ownerDeviceIdentityKey')
  WHERE source.source_type = 'external' AND device.group_id = ? AND device.state = 'left'
    AND COALESCE(device.left_at, device.updated_at) <= ?`;

// Local data of a departed member's libraries is dropped after the grace period, without deletion records.
const FORGET_EXTERNAL_FOLDER_SQL = [
  `DELETE FROM sync_object_state WHERE object_type = 'external_document'
    AND object_id IN (SELECT document_id FROM external_documents WHERE folder_id = ?)`,
  "DELETE FROM external_documents WHERE folder_id = ?",
  "DELETE FROM external_search_folders WHERE id = ?",
  "DELETE FROM desktop_sources WHERE source_type = 'external' AND config_ref = ?",
  "DELETE FROM sync_object_state WHERE object_type = 'external_folder' AND object_id = ?"
];

export function forgetDepartedExternalFolders(driver: DatabaseDriver, groupId: string, now: string) {
  const expired = driver.queryAll<{ config_ref: string }>(EXPIRED_DEPARTED_EXTERNAL_FOLDERS_SQL,
    [groupId, externalDepartureCutoff(now)]);
  for (const folder of expired) {
    forgetExternalFolder(driver, folder.config_ref);
  }
}

function forgetExternalFolder(driver: DatabaseDriver, folderId: string) {
  driver.execute('DELETE FROM external_folder_host_preferences WHERE folder_id = ?', [folderId]);
  for (const sql of FORGET_EXTERNAL_FOLDER_SQL) driver.execute(sql, [folderId]);
}

export async function forgetDepartedExternalFoldersWithDbPort(port: DbPort, groupId: string, now: string) {
  const folders = await port.query<{ config_ref: string }>(EXPIRED_DEPARTED_EXTERNAL_FOLDERS_SQL,
    [groupId, externalDepartureCutoff(now)]);
  for (const folder of folders) await forgetExternalFolderWithDbPort(port, folder.config_ref);
}

export async function forgetExternalFolderWithDbPort(port: DbPort, folderId: string) {
  const [desktopPreferences] = await port.query(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'external_folder_host_preferences'");
  if (desktopPreferences) await port.run('DELETE FROM external_folder_host_preferences WHERE folder_id = ?', [folderId]);
  for (const sql of FORGET_EXTERNAL_FOLDER_SQL) await port.run(sql, [folderId]);
}
