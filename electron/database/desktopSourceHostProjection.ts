import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { upsertExternalResourceSyncState } from '../../lib/core/database/externalResourceSyncState.js';
import { loadDatabaseDeviceId } from '../../lib/core/database/syncDeviceIdentity.js';
import { computeSyncContentHash, type SyncObjectStateInput, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

import type { DesktopSourceType } from './desktopSources.js';

export function updateLocalDesktopSourceHosts(input: {
  currentHostName: string; currentHostPlatform: string; driver: DatabaseDriver;
  previousHostName: string; updatedAt: string;
}) {
  const { driver } = input;
  const localId = loadDatabaseDeviceId(driver);
  if (!driver.queryOne("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'desktop_sources'")) return;
  driver.transaction((tx) => {
    const changed = tx.queryAll<{ object_id: string; source_type: DesktopSourceType }>(
      `SELECT source_type, CASE source_type
         WHEN 'external' THEN COALESCE((SELECT id FROM external_search_folders WHERE source_ref = source.source_ref), config_ref)
         WHEN 'watched' THEN COALESCE((SELECT binding_id FROM watched_folder_bindings WHERE source_ref = source.source_ref), config_ref)
         ELSE config_ref END object_id
       FROM desktop_sources source WHERE host_name = ?
         AND (host_name IS NOT ? OR host_platform IS NOT ?)
         AND (source_type <> 'readwise' OR json_extract(type_settings_json, '$.ownerDeviceIdentityKey') = ?)
         AND (source_type <> 'watched' OR EXISTS (
           SELECT 1 FROM watched_folder_bindings binding WHERE binding.source_ref = source.source_ref
             AND binding.owner_device_identity_key = ?))`,
      [input.previousHostName, input.currentHostName, input.currentHostPlatform, localId, localId]
    );
    if (!changed.length) return;
    tx.execute(`UPDATE desktop_sources SET host_name = ?, host_platform = ?, updated_at = ?
      WHERE host_name = ? AND (source_type <> 'readwise' OR json_extract(type_settings_json, '$.ownerDeviceIdentityKey') = ?)
        AND (source_type <> 'watched' OR EXISTS (
        SELECT 1 FROM watched_folder_bindings binding WHERE binding.source_ref = desktop_sources.source_ref
          AND binding.owner_device_identity_key = ?))`, [input.currentHostName, input.currentHostPlatform,
      input.updatedAt, input.previousHostName, localId, localId]);
    transferReadwiseActiveHost(tx, input.previousHostName, input.currentHostName, input.updatedAt);
    for (const source of changed) recordHostProjectionSync(tx, source, input);
  });
}

function transferReadwiseActiveHost(
  driver: DatabaseDriver,
  previousHostName: string,
  currentHostName: string,
  updatedAt: string
) {
  driver.execute(`UPDATE settings SET value = json_set(value, '$.host_name', ?), updated_at = ?
    WHERE key = 'readwise_active_host' AND json_extract(value, '$.host_name') = ?`,
  [currentHostName, updatedAt, previousHostName]);
  driver.execute(`UPDATE setting_records SET value_json = json_set(value_json, '$.host_name', ?), updated_at = ?
    WHERE key = 'readwise_active_host' AND json_extract(value_json, '$.host_name') = ?`,
  [currentHostName, updatedAt, previousHostName]);
}

function recordHostProjectionSync(
  driver: DatabaseDriver,
  source: { object_id: string; source_type: DesktopSourceType },
  input: { currentHostName: string; updatedAt: string }
) {
  if (source.source_type === 'readwise') return;
  const objectType = source.source_type === 'external' ? 'external_folder' : 'watched_folder';
  const row = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE[objectType], [source.object_id]);
  if (!row) return;
  const state: SyncObjectStateInput = {
    contentHash: computeSyncContentHash(objectType, JSON.parse(row.payload_json)),
    lastModifiedByHostName: input.currentHostName,
    objectId: source.object_id,
    objectType,
    syncDirty: true,
    updatedAt: input.updatedAt
  };
  if (objectType === 'external_folder') upsertExternalResourceSyncState(driver, {
    ...state, objectType
  });
  else upsertSyncObjectState(driver, state);
}
