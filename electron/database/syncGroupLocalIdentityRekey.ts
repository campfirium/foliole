import type { DatabaseDriver } from '../../lib/core/database/driver.js';

export function rekeyLocalSyncHistory(
  driver: DatabaseDriver,
  previousDeviceId: string,
  assignedDeviceId: string
) {
  const from = previousDeviceId.trim();
  const to = assignedDeviceId.trim();
  if (!from || !to) throw new Error('sync_group_local_identity_invalid');
  if (from === to) return { rekeyedVersionCount: 0 };
  if (driver.queryOne('SELECT 1 AS present FROM sync_group_local_state LIMIT 1')) {
    throw new Error('sync_group_identity_mismatch');
  }
  return driver.transaction(() => {
    rekeyFrozenAuthorAttribution(driver, from, to);
    driver.execute(
      `UPDATE settings SET value = ?
       WHERE key IN ('device_id', 'desktop_device_id', 'device_identity_reset_pending') AND value IN (?, ?)`,
      [JSON.stringify(to), JSON.stringify(from), from]
    );
    return { rekeyedVersionCount: 0 };
  });
}

function rekeyFrozenAuthorAttribution(driver: DatabaseDriver, from: string, to: string) {
  const columns = [
    ['nodes', 'last_modified_by_device_id'], ['sync_object_state', 'last_modified_by_device_id'],
    ['sync_change_log', 'device_id'], ['node_sync_versions', 'device_id'],
    ['node_sync_tombstones', 'device_id'], ['node_sync_conflicts', 'device_id'],
    ['node_text_alternatives', 'source_device_id'], ['review_log', 'device_id'],
    ['attachment_blobs', 'source_device_id'], ['content_blobs', 'source_device_id']
  ] as const;
  for (const [table, column] of columns) {
    driver.execute(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [to, from]);
  }
}
