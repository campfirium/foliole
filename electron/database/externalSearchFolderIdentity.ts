import path from 'node:path';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { upsertExternalResourceSyncState } from '../../lib/core/database/externalResourceSyncState.js';
import { loadDatabaseDeviceId } from '../../lib/core/database/syncDeviceIdentity.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';
import { normalizeDesktopSyncGroupPlatform } from '../../lib/platform/syncGroupPlatform.js';

import { loadDesktopDeviceId } from './deviceIdentity.js';

export function isLocalExternalFolder(source: { type_settings_json: string }) {
  const localId = loadDesktopDeviceId();
  if (!localId) return false;
  try {
    const settings: unknown = JSON.parse(source.type_settings_json);
    return Boolean(settings && typeof settings === 'object' &&
      'ownerDeviceIdentityKey' in settings && settings.ownerDeviceIdentityKey === localId);
  } catch {
    return false;
  }
}

export function migrateLegacyExternalFolderIdentity(
  driver: DatabaseDriver, hostName: string, now: string, previousDeviceId?: string
) {
  const owner = previousDeviceId ?? loadDatabaseDeviceId(driver);
  if (!owner) return;
  driver.transaction((tx) => {
    const folders = tx.queryAll<{ id: string; source_ref: string; host_platform: string;
      root_path: string; sync_updated_at: string | null }>(
      `SELECT f.id, s.source_ref, s.host_platform, s.root_path, state.updated_at AS sync_updated_at
       FROM desktop_sources s JOIN external_search_folders f ON f.source_ref = s.source_ref
       LEFT JOIN sync_object_state state ON state.object_type = 'external_folder' AND state.object_id = f.id
       WHERE s.source_type = 'external' AND s.host_name = ? AND state.deleted_at IS NULL
         AND s.root_path = f.folder_path AND CASE WHEN json_valid(s.type_settings_json) THEN
           json_type(s.type_settings_json, '$.ownerDeviceIdentityKey') IS NULL
           AND json_extract(s.type_settings_json, '$.connectionStatus') = 'connected' ELSE 0 END`, [hostName]);
    for (const folder of folders) {
      if (normalizeDesktopSyncGroupPlatform(folder.host_platform) !== process.platform ||
          !path.isAbsolute(folder.root_path)) continue;
      const previousTime = Date.parse(folder.sync_updated_at ?? '');
      const updatedAt = previousTime >= Date.parse(now) ? new Date(previousTime + 1).toISOString() : now;
      tx.execute(`UPDATE desktop_sources SET type_settings_json = json_set(type_settings_json,
        '$.ownerDeviceIdentityKey', ?), updated_at = ? WHERE source_ref = ?`, [owner, updatedAt, folder.source_ref]);
      const row = tx.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.external_folder, [folder.id]);
      if (!row) throw new Error('external_folder_payload_missing');
      upsertExternalResourceSyncState(tx, {
        objectType: 'external_folder', objectId: folder.id,
        contentHash: computeSyncContentHash('external_folder', JSON.parse(row.payload_json)),
        lastModifiedByHostName: hostName, updatedAt, syncDirty: true
      });
    }
  });
}
