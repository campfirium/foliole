import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';
import type { NativeExternalSearchReconnectPreview } from '../../lib/platform/nativeExternalSearchContract.js';
import { assertNoUnsafePathOverlap } from '../libraryPathSafety.js';
import { loadManagedPathCandidates } from '../managedPathSafety.js';

import { openDatabaseConnection } from './connection.js';
import { upsertDesktopSource } from './desktopSources.js';
import { scanFolderEntries, type ScannedDocumentEntry } from './externalSearchCacheSupport.js';
import { readExternalSearchFolderRows } from './externalSearchFolderRows.js';
import { loadExternalSearchFolders } from './externalSearchFolders.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

function requireFolder(folderId: string) {
  const row = readExternalSearchFolderRows().find((item) => item.id === folderId);
  if (!row) throw new Error('external_folder_not_found');
  return row;
}

function recordConnectionSync(folderId: string, now: string) {
  const driver = openDatabaseConnection().driver;
  const row = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.external_folder, [folderId]);
  if (!row) throw new Error('external_folder_not_found');
  upsertSyncObjectState(openDatabaseConnection().driver, {
    contentHash: computeSyncContentHash('external_folder', JSON.parse(row.payload_json)),
    lastModifiedByHostName: loadOrCreateDesktopHostName(now),
    objectId: folderId,
    objectType: 'external_folder',
    syncDirty: true,
    updatedAt: now
  });
}

export function disconnectExternalSearchFolder(folderId: string) {
  const row = requireFolder(folderId);
  if (row.host_name !== loadOrCreateDesktopHostName()) throw new Error('external_folder_not_local');
  const now = new Date().toISOString();
  openDatabaseConnection().driver.execute(
    `UPDATE desktop_sources SET type_settings_json = json_set(type_settings_json, '$.connectionStatus', 'needs-folder'),
       updated_at = ? WHERE source_ref = ?`, [now, row.source_ref]
  );
  recordConnectionSync(folderId, now);
  return loadExternalSearchFolders();
}

export async function previewExternalSearchFolderReconnect(
  folderId: string,
  folderPath: string
): Promise<NativeExternalSearchReconnectPreview> {
  const row = requireFolder(folderId);
  const normalizedPath = folderPath.trim();
  assertNoUnsafePathOverlap([...loadManagedPathCandidates(), { label: 'External source', path: normalizedPath }]);
  const entries: ScannedDocumentEntry[] = [];
  await scanFolderEntries(
    { ...loadExternalSearchFolders().find((item) => item.id === folderId)!, folder_path: normalizedPath },
    normalizedPath,
    normalizedPath,
    new Set(['.git', '.obsidian', '.trash', 'node_modules']),
    entries
  );
  const candidates = new Set(entries.map((item) => item.relativePath));
  const existing = new Set(openDatabaseConnection().driver.queryAll<{ relative_path: string }>(
    'SELECT relative_path FROM external_documents WHERE folder_id = ?', [row.id]
  ).map((item) => item.relative_path));
  const matched = [...existing].filter((relativePath) => candidates.has(relativePath)).length;
  return {
    checked_at: new Date().toISOString(), folder_id: folderId, folder_path: normalizedPath,
    matched_count: matched, missing_count: existing.size - matched,
    new_count: [...candidates].filter((relativePath) => !existing.has(relativePath)).length
  };
}

export async function reconnectExternalSearchFolder(folderId: string, folderPath: string) {
  const preview = await previewExternalSearchFolderReconnect(folderId, folderPath);
  const now = new Date().toISOString();
  const row = requireFolder(folderId);
  openDatabaseConnection().driver.transaction(() => {
    upsertDesktopSource({
      configRef: folderId,
      rootPath: preview.folder_path,
      sourceRef: row.source_ref,
      sourceType: 'external',
      typeSettings: { attachmentMode: row.attachment_mode, attachmentRootPath: row.attachment_root_path,
        connectionStatus: 'connected' },
      updatedAt: now
    });
    openDatabaseConnection().driver.execute(
      `UPDATE external_search_folders SET folder_path = ?, status = 'idle', updated_at = ? WHERE id = ?`,
      [preview.folder_path, now, folderId]
    );
    recordConnectionSync(folderId, now);
  });
  return loadExternalSearchFolders();
}
