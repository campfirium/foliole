import { openDatabaseConnection } from './connection.js';

export function loadExternalFolderEnabled(folderId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ enabled: number }>(
    `SELECT enabled FROM external_folder_host_preferences
     WHERE folder_id = ? ORDER BY updated_at DESC, host_name LIMIT 1`, [folderId]
  );
  return row?.enabled !== 0;
}

export function setExternalFolderEnabled(folderId: string, enabled: boolean) {
  openDatabaseConnection().driver.transaction(driver => {
    driver.execute('DELETE FROM external_folder_host_preferences WHERE folder_id = ?', [folderId]);
    driver.execute(
      `INSERT INTO external_folder_host_preferences (host_name, folder_id, enabled, updated_at)
       VALUES ('local', ?, ?, ?)`, [folderId, enabled ? 1 : 0, new Date().toISOString()]
    );
  });
}
