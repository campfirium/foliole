import type { DesktopInstallationIdentity } from '../desktopInstallationIdentity.js';

import { openDatabaseConnection } from './connection.js';

export function loadExternalFolderEnabled(identity: DesktopInstallationIdentity, folderId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ enabled: number }>(
    `SELECT enabled FROM external_folder_device_preferences
     WHERE installation_id = ? AND folder_id = ?`,
    [identity.installationId, folderId]
  );
  return row?.enabled !== 0;
}

export function setExternalFolderEnabled(
  identity: DesktopInstallationIdentity,
  folderId: string,
  enabled: boolean
) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO external_folder_device_preferences (installation_id, folder_id, enabled, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(installation_id, folder_id) DO UPDATE SET
       enabled = excluded.enabled, updated_at = excluded.updated_at`,
    [identity.installationId, folderId, enabled ? 1 : 0, new Date().toISOString()]
  );
}
