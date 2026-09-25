import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

interface LocalWatchedBinding extends DatabaseRow {
  binding_id: string;
  host_name: string;
}

export function loadStandaloneWatchedDeviceId(driver: DatabaseDriver) {
  const hasTable = driver.queryOne<{ present: number }>(`SELECT 1 AS present FROM sqlite_master
    WHERE type = 'table' AND name = 'settings'`);
  if (!hasTable) return null;
  const row = driver.queryOne<{ value: string }>(`SELECT value FROM settings
    WHERE key IN ('device_id', 'desktop_device_id') ORDER BY key = 'device_id' DESC LIMIT 1`);
  if (!row) return null;
  try {
    const value = JSON.parse(row.value) as unknown;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return row.value.trim() || null;
  }
}

export function retagLocalWatchedFolderBindings(driver: DatabaseDriver, previousId: string | null,
  nextId: string, updatedAt: string) {
  if (!previousId || previousId === nextId) return;
  const hasTable = driver.queryOne<{ present: number }>(`SELECT 1 AS present FROM sqlite_master
    WHERE type = 'table' AND name = 'watched_folder_bindings'`);
  if (!hasTable) return;
  const bindings = driver.queryAll<LocalWatchedBinding>(`SELECT b.binding_id, s.host_name
    FROM watched_folder_bindings b JOIN desktop_sources s ON s.source_ref = b.source_ref
    WHERE b.deleted_at IS NULL AND b.local_rule_id IS NOT NULL
      AND b.owner_device_identity_key = ?`, [previousId]);
  for (const binding of bindings) {
    driver.execute(`UPDATE watched_folder_bindings SET owner_device_identity_key = ?, updated_at = ?
      WHERE binding_id = ?`, [nextId, updatedAt, binding.binding_id]);
    const row = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.watched_folder,
      [binding.binding_id]);
    if (!row) throw new Error('watched_group_ownership_payload_missing');
    upsertSyncObjectState(driver, {
      contentHash: computeSyncContentHash('watched_folder',
        JSON.parse(row.payload_json) as Parameters<typeof computeSyncContentHash>[1]),
      deletedAt: null,
      lastModifiedByHostName: binding.host_name,
      objectId: binding.binding_id,
      objectType: 'watched_folder',
      syncDirty: true,
      updatedAt
    });
  }
}
