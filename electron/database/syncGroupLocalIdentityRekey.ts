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
    driver.execute(
      `UPDATE settings SET value = ?
       WHERE key IN ('device_id', 'desktop_device_id', 'device_identity_reset_pending') AND value IN (?, ?)`,
      [JSON.stringify(to), JSON.stringify(from), from]
    );
    return { rekeyedVersionCount: 0 };
  });
}
