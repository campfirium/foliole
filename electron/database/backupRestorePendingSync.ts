import type { DatabaseDriver } from '../../lib/core/database/driver.js';

import { openDatabaseConnection } from './connection.js';

const PENDING_KEY = 'backup_restore_pending_sync';
export interface BackupRestorePendingSync {
  groupId: string;
  restoreId: string;
  restoredAt: string;
}

export function loadBackupRestorePendingSync(driver = openDatabaseConnection().driver) {
  const row = driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [PENDING_KEY]);
  if (!row) return null;
  const pending = JSON.parse(row.value) as BackupRestorePendingSync;
  if (!pending.groupId || !pending.restoreId || !pending.restoredAt) {
    throw new Error('backup_restore_pending_sync_invalid');
  }
  return pending;
}

export function saveBackupRestorePendingSync(driver: DatabaseDriver, pending: BackupRestorePendingSync | null) {
  if (!pending) {
    driver.execute('DELETE FROM settings WHERE key = ?', [PENDING_KEY]);
    return;
  }
  driver.execute(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  [PENDING_KEY, JSON.stringify(pending), pending.restoredAt]);
}
