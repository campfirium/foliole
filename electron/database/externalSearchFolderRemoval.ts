import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

export function removeExternalSearchFolder(folderId: string) {
  const id = folderId.trim();
  if (!id) throw new Error('external_folder_id_required');
  const driver = openDatabaseConnection().driver;
  const existing = driver.queryOne<{ id: string }>('SELECT id FROM external_search_folders WHERE id = ?', [id]);
  if (!existing) throw new Error('external_folder_not_found');
  const removedAt = new Date().toISOString();
  const hostName = loadOrCreateDesktopHostName(removedAt);
  driver.transaction((tx) => {
    tx.execute('DELETE FROM external_documents WHERE folder_id = ?', [id]);
    tx.execute('DELETE FROM external_folder_device_preferences WHERE folder_id = ?', [id]);
    tx.execute('DELETE FROM external_search_folders WHERE id = ?', [id]);
    upsertSyncObjectState(tx, {
      contentHash: computeSyncContentHash('external_folder', { deleted_at: removedAt, folder_id: id }),
      deletedAt: removedAt,
      lastModifiedByHostName: hostName,
      objectId: id,
      objectType: 'external_folder',
      syncDirty: true,
      updatedAt: removedAt
    });
  });
}
