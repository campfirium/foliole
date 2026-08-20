import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

export function loadExternalFolderEnabled(folderId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ enabled: number }>(
    `SELECT enabled FROM external_folder_host_preferences
     WHERE host_name = ? AND folder_id = ?`,
    [loadOrCreateDesktopHostName(), folderId]
  );
  return row?.enabled !== 0;
}

export function setExternalFolderEnabled(folderId: string, enabled: boolean) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO external_folder_host_preferences (host_name, folder_id, enabled, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(host_name, folder_id) DO UPDATE SET
       enabled = excluded.enabled, updated_at = excluded.updated_at`,
    [loadOrCreateDesktopHostName(), folderId, enabled ? 1 : 0, new Date().toISOString()]
  );
}
