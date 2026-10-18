import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { DEPARTED_EXTERNAL_FOLDERS_SQL, retireExternalFolder } from '../../lib/core/database/externalFolderRetirement.js';
import { upsertExternalResourceSyncState } from '../../lib/core/database/externalResourceSyncState.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

export function retireDepartedExternalFolders(driver: DatabaseDriver, groupId: string, now: string) {
  const folders = driver.queryAll<{ config_ref: string }>(DEPARTED_EXTERNAL_FOLDERS_SQL, [groupId]);
  for (const folder of folders) retireExternalFolder(driver, folder.config_ref, now, 'sync-membership');
}

export function retagLocalExternalFolders(driver: DatabaseDriver, previousId: string | null, nextId: string, now: string) {
  if (!previousId || previousId === nextId) return;
  const folders = driver.queryAll<{ config_ref: string; host_name: string }>(`SELECT config_ref, host_name
    FROM desktop_sources WHERE source_type = 'external'
      AND json_extract(type_settings_json, '$.ownerDeviceIdentityKey') = ?`, [previousId]);
  for (const folder of folders) {
    driver.execute(`UPDATE desktop_sources SET type_settings_json = json_set(type_settings_json,
      '$.ownerDeviceIdentityKey', ?), updated_at = ? WHERE source_type = 'external' AND config_ref = ?`,
    [nextId, now, folder.config_ref]);
    const row = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.external_folder, [folder.config_ref]);
    if (row) upsertExternalResourceSyncState(driver, {
      contentHash: computeSyncContentHash('external_folder', JSON.parse(row.payload_json)),
      objectType: 'external_folder', objectId: folder.config_ref, lastModifiedByHostName: folder.host_name,
      syncDirty: true, updatedAt: now
    });
  }
}
