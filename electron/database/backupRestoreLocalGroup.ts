import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

export function readBackupRestoreLocalGroup(driver: DatabaseDriver): DatabaseRow | undefined {
  const columns = new Set(driver.queryAll<{ name: string }>(
    'PRAGMA table_info(sync_group_local_state)').map((column) => column.name));
  if (columns.size === 0) return undefined;
  // Migration 78 retires member-based groups instead of converting their identities.
  if (columns.has('member_state') &&
      (columns.has('local_device_id') || columns.has('local_host_name'))) return undefined;
  if (!columns.has('state') || !columns.has('local_device_identity_key')) {
    throw new Error('backup_restore_sync_schema_unsupported');
  }
  return driver.queryOne<DatabaseRow>(`SELECT * FROM sync_group_local_state
    WHERE singleton_id = 1 AND state = 'active'`);
}
