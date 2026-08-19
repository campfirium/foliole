import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';
import { loadOrCreateDesktopInstallationIdentity } from '../desktopInstallationIdentity.js';
import { assertNoUnsafePathOverlap } from '../libraryPathSafety.js';
import { loadManagedPathCandidates } from '../managedPathSafety.js';

import { openDatabaseConnection } from './connection.js';
import { upsertDesktopSource } from './desktopSources.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { loadExternalFolderEnabled } from './externalFolderDevicePreferences.js';
import {
  type ExternalSearchFolderRow,
  normalizeExcludedDirs,
  readExternalSearchFolderRows,
  toExternalSearchFolder
} from './externalSearchFolderRows.js';

type SaveFolderInput = Pick<NativeExternalSearchFolder,
  'attachment_mode' | 'attachment_root_path' | 'excluded_dirs' | 'folder_path' | 'id'> & { claim_unowned?: boolean };

function normalizedInput(folders: SaveFolderInput[]) {
  const result = folders.map((folder) => ({
    attachmentMode: 'document_relative_first_then_fixed_root' as const,
    attachmentRootPath: folder.attachment_root_path?.trim() || null,
    claimUnowned: folder.claim_unowned === true,
    excludedDirs: normalizeExcludedDirs(folder.excluded_dirs),
    folderPath: folder.folder_path.trim(), id: folder.id.trim()
  })).filter((folder) => folder.id && folder.folderPath);
  assertNoUnsafePathOverlap([...loadManagedPathCandidates(), ...result.map((folder, index) => ({
    label: `External source ${index + 1}`, path: folder.folderPath
  }))]);
  return result;
}

export function loadExternalSearchFolders() {
  const identity = loadOrCreateDesktopInstallationIdentity();
  return readExternalSearchFolderRows().map((row) => toExternalSearchFolder(
    row, identity, loadExternalFolderEnabled(identity, row.id)
  ));
}

function recordSync(folder: ReturnType<typeof normalizedInput>[number], now: string, deviceId: string, deletedAt?: string) {
  const driver = openDatabaseConnection().driver;
  const identity = loadOrCreateDesktopInstallationIdentity();
  upsertSyncObjectState(driver, {
    objectType: 'external_folder', objectId: folder.id,
    contentHash: computeSyncContentHash('external_folder', deletedAt ? { deleted_at: deletedAt, folder_id: folder.id } : {
      attachment_mode: folder.attachmentMode, attachment_root_path: folder.attachmentRootPath,
      excluded_dirs: folder.excludedDirs, folder_path: folder.folderPath, id: folder.id,
      owner_device_name: identity.deviceName, owner_installation_id: identity.installationId,
      owner_platform: identity.platform
    }),
    deletedAt: deletedAt ?? null, lastModifiedByDeviceId: deviceId, updatedAt: now, syncDirty: true
  });
}

function resolveLocalId(input: ReturnType<typeof normalizedInput>[number], rows: ExternalSearchFolderRow[]) {
  const identity = loadOrCreateDesktopInstallationIdentity();
  const byId = rows.find((row) => row.id === input.id);
  if (byId?.owner_installation_id && byId.owner_installation_id !== identity.installationId) return null;
  if (byId && !byId.owner_installation_id && !input.claimUnowned) return null;
  const claim = input.claimUnowned
    ? rows.find((row) => !row.owner_installation_id && row.folder_path === input.folderPath)
    : null;
  return claim?.id ?? input.id;
}

function upsertLocalFolder(input: ReturnType<typeof normalizedInput>[number], id: string, rows: ExternalSearchFolderRow[], now: string) {
  const driver = openDatabaseConnection().driver;
  const identity = loadOrCreateDesktopInstallationIdentity();
  const existing = rows.find((row) => row.id === id);
  const source = upsertDesktopSource({
    configRef: id,
    rootPath: input.folderPath,
    sourceType: 'external',
    typeSettings: {
      attachmentMode: input.attachmentMode,
      attachmentRootPath: input.attachmentRootPath,
      excludedDirs: input.excludedDirs
    },
    updatedAt: now
  });
  driver.execute(
    `INSERT INTO external_search_folders (id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json,
      status, document_count, indexed_at, last_error, owner_installation_id, owner_device_name, owner_platform,
      created_at, updated_at, source_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET folder_path = excluded.folder_path, attachment_mode = excluded.attachment_mode,
      attachment_root_path = excluded.attachment_root_path, excluded_dirs_json = excluded.excluded_dirs_json,
      owner_installation_id = excluded.owner_installation_id, owner_device_name = excluded.owner_device_name,
      owner_platform = excluded.owner_platform, status = 'idle', updated_at = excluded.updated_at,
      source_ref = excluded.source_ref`,
    [id, input.folderPath, input.attachmentMode, input.attachmentRootPath, JSON.stringify(input.excludedDirs),
      existing?.status ?? 'idle', existing?.document_count ?? 0, existing?.indexed_at ?? null,
      existing?.last_error ?? null, identity.installationId, identity.deviceName, identity.platform,
      existing?.created_at ?? now, now, source.source_ref]
  );
}

export function saveExternalSearchFolders(folders: SaveFolderInput[]) {
  const driver = openDatabaseConnection().driver;
  const now = new Date().toISOString();
  const deviceId = loadOrCreateDesktopDeviceId(now);
  const inputs = normalizedInput(folders);
  driver.transaction(() => {
    const rows = readExternalSearchFolderRows();
    const resolved: Array<{ input: (typeof inputs)[number]; id: string }> = [];
    for (const input of inputs) {
      const id = resolveLocalId(input, rows);
      if (id) resolved.push({ id, input });
    }
    for (const item of resolved) {
      const input = { ...item.input, id: item.id };
      upsertLocalFolder(input, item.id, rows, now);
      recordSync(input, now, deviceId);
    }
  });
  return loadExternalSearchFolders();
}

export function updateExternalSearchFolderIndexState(args: {
  documentCount: number; folderId: string; indexedAt: string | null; lastError: string | null;
  status: NativeExternalSearchFolder['status'];
}) {
  const identity = loadOrCreateDesktopInstallationIdentity();
  openDatabaseConnection().driver.execute(
    `UPDATE external_search_folders SET status = ?, document_count = ?, indexed_at = ?, last_error = ?, updated_at = ?
     WHERE id = ? AND owner_installation_id = ?`,
    [args.status, args.documentCount, args.indexedAt, args.lastError, new Date().toISOString(),
      args.folderId, identity.installationId]
  );
}
