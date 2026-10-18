import { retireExternalFolder } from '../../lib/core/database/externalFolderRetirement.js';

import { openDatabaseConnection } from './connection.js';
import { isLocalExternalFolder } from './externalSearchFolderIdentity.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

export function removeExternalSearchFolder(folderId: string) {
  const id = folderId.trim();
  if (!id) throw new Error('external_folder_id_required');
  const driver = openDatabaseConnection().driver;
  const existing = driver.queryOne<{ type_settings_json: string; id: string; source_ref: string }>(
    `SELECT folder.id, folder.source_ref, source.type_settings_json FROM external_search_folders folder
     JOIN desktop_sources source ON source.source_ref = folder.source_ref WHERE folder.id = ?`, [id]
  );
  if (!existing) throw new Error('external_folder_not_found');
  const removedAt = new Date().toISOString();
  const hostName = loadOrCreateDesktopHostName(removedAt);
  if (!isLocalExternalFolder(existing)) throw new Error('external_folder_not_local');
  driver.transaction((tx) => retireExternalFolder(tx, id, removedAt, hostName));
}
