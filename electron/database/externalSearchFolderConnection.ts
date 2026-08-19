import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type { NativeExternalSearchReconnectPreview } from '../../lib/platform/nativeExternalSearchContract.js';
import { loadOrCreateDesktopInstallationIdentity } from '../desktopInstallationIdentity.js';
import { assertNoUnsafePathOverlap } from '../libraryPathSafety.js';
import { loadManagedPathCandidates } from '../managedPathSafety.js';

import { openDatabaseConnection } from './connection.js';
import { upsertDesktopSource } from './desktopSources.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { scanFolderEntries, type ScannedDocumentEntry } from './externalSearchCacheSupport.js';
import { readExternalSearchFolderRows } from './externalSearchFolderRows.js';
import { loadExternalSearchFolders } from './externalSearchFolders.js';

function requireFolder(folderId: string) {
  const row = readExternalSearchFolderRows().find((item) => item.id === folderId);
  if (!row) throw new Error('external_folder_not_found');
  return row;
}

function recordConnectionSync(folderId: string, now: string) {
  const row = requireFolder(folderId);
  upsertSyncObjectState(openDatabaseConnection().driver, {
    contentHash: computeSyncContentHash('external_folder', {
      attachment_mode: row.attachment_mode,
      attachment_root_path: row.attachment_root_path,
      excluded_dirs: JSON.parse(row.excluded_dirs_json) as string[],
      folder_path: row.folder_path,
      id: row.id,
      owner_device_name: row.owner_device_name,
      owner_installation_id: row.owner_installation_id,
      owner_platform: row.owner_platform
    }),
    lastModifiedByDeviceId: loadOrCreateDesktopDeviceId(now),
    objectId: folderId,
    objectType: 'external_folder',
    syncDirty: true,
    updatedAt: now
  });
}

export function disconnectExternalSearchFolder(folderId: string) {
  const row = requireFolder(folderId);
  const identity = loadOrCreateDesktopInstallationIdentity();
  if (row.owner_installation_id !== identity.installationId) throw new Error('external_folder_not_local');
  const now = new Date().toISOString();
  openDatabaseConnection().driver.execute(
    `UPDATE external_search_folders SET owner_installation_id = NULL, status = 'idle', updated_at = ? WHERE id = ?`,
    [now, folderId]
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
  const identity = loadOrCreateDesktopInstallationIdentity();
  const now = new Date().toISOString();
  openDatabaseConnection().driver.execute(
    `UPDATE external_search_folders SET folder_path = ?, owner_installation_id = ?, owner_device_name = ?,
       owner_platform = ?, status = 'idle', updated_at = ? WHERE id = ?`,
    [preview.folder_path, identity.installationId, identity.deviceName, identity.platform, now, folderId]
  );
  const row = requireFolder(folderId);
  upsertDesktopSource({
    configRef: folderId,
    rootPath: preview.folder_path,
    sourceType: 'external',
    typeSettings: { attachmentMode: row.attachment_mode, attachmentRootPath: row.attachment_root_path },
    updatedAt: now
  });
  recordConnectionSync(folderId, now);
  return loadExternalSearchFolders();
}
