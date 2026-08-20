import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';
import { assertNoUnsafePathOverlap } from '../libraryPathSafety.js';
import { loadManagedPathCandidates } from '../managedPathSafety.js';

import { openDatabaseConnection } from './connection.js';
import { isDesktopSourceConnected, type DesktopSourceRecord, upsertDesktopSource } from './desktopSources.js';
import { loadExternalFolderEnabled } from './externalFolderHostPreferences.js';
import {
  type ExternalSearchFolderRow,
  normalizeExcludedDirs,
  readExternalSearchFolderRows,
  toExternalSearchFolder
} from './externalSearchFolderRows.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

type SaveFolderInput = Pick<NativeExternalSearchFolder,
  'attachment_mode' | 'attachment_root_path' | 'excluded_dirs' | 'folder_path' | 'id'>;

function normalizedInput(folders: SaveFolderInput[]) {
  const result = folders.map((folder) => ({
    attachmentMode: 'document_relative_first_then_fixed_root' as const,
    attachmentRootPath: folder.attachment_root_path?.trim() || null,
    excludedDirs: normalizeExcludedDirs(folder.excluded_dirs),
    folderPath: folder.folder_path.trim(), id: folder.id.trim()
  })).filter((folder) => folder.id && folder.folderPath);
  assertNoUnsafePathOverlap([...loadManagedPathCandidates(), ...result.map((folder, index) => ({
    label: `External source ${index + 1}`, path: folder.folderPath
  }))]);
  return result;
}

export function loadExternalSearchFolders() {
  return readExternalSearchFolderRows().map((row) => toExternalSearchFolder(row, loadExternalFolderEnabled(row.id)));
}

export function loadRefreshableExternalSearchFolders() {
  return readExternalSearchFolderRows()
    .filter((row) => isDesktopSourceConnected(row as unknown as DesktopSourceRecord))
    .map((row) => toExternalSearchFolder(row, loadExternalFolderEnabled(row.id)));
}

function recordSync(folder: ReturnType<typeof normalizedInput>[number], now: string, hostName: string, deletedAt?: string) {
  const driver = openDatabaseConnection().driver;
  const row = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.external_folder, [folder.id]);
  upsertSyncObjectState(driver, {
    objectType: 'external_folder', objectId: folder.id,
    contentHash: computeSyncContentHash('external_folder', deletedAt
      ? { deleted_at: deletedAt, folder_id: folder.id }
      : JSON.parse(row?.payload_json ?? '{}')),
    deletedAt: deletedAt ?? null, lastModifiedByHostName: hostName, updatedAt: now, syncDirty: true
  });
}

function resolveLocalId(input: ReturnType<typeof normalizedInput>[number], rows: ExternalSearchFolderRow[]) {
  const currentHostName = loadOrCreateDesktopHostName();
  const byId = rows.find((row) => row.id === input.id);
  if (byId && byId.host_name !== currentHostName) return null;
  return input.id;
}

function upsertLocalFolder(input: ReturnType<typeof normalizedInput>[number], id: string, rows: ExternalSearchFolderRow[], now: string) {
  const driver = openDatabaseConnection().driver;
  const existing = rows.find((row) => row.id === id);
  const source = upsertDesktopSource({
    configRef: id,
    rootPath: input.folderPath,
    sourceType: 'external',
    typeSettings: {
      attachmentMode: input.attachmentMode,
      attachmentRootPath: input.attachmentRootPath,
      connectionStatus: 'connected', excludedDirs: input.excludedDirs
    },
    updatedAt: now
  });
  driver.execute(
    `INSERT INTO external_search_folders (id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json,
      status, document_count, indexed_at, last_error, created_at, updated_at, source_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET folder_path = excluded.folder_path, attachment_mode = excluded.attachment_mode,
      attachment_root_path = excluded.attachment_root_path, excluded_dirs_json = excluded.excluded_dirs_json,
      status = 'idle', updated_at = excluded.updated_at,
      source_ref = excluded.source_ref`,
    [id, input.folderPath, input.attachmentMode, input.attachmentRootPath, JSON.stringify(input.excludedDirs),
      existing?.status ?? 'idle', existing?.document_count ?? 0, existing?.indexed_at ?? null,
      existing?.last_error ?? null, existing?.created_at ?? now, now, source.source_ref]
  );
}

export function saveExternalSearchFolders(folders: SaveFolderInput[]) {
  const driver = openDatabaseConnection().driver;
  const now = new Date().toISOString();
  const hostName = loadOrCreateDesktopHostName(now);
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
      recordSync(input, now, hostName);
    }
  });
  return loadExternalSearchFolders();
}

export function updateExternalSearchFolderIndexState(args: {
  documentCount: number; folderId: string; indexedAt: string | null; lastError: string | null;
  status: NativeExternalSearchFolder['status'];
}) {
  const hostName = loadOrCreateDesktopHostName();
  openDatabaseConnection().driver.execute(
    `UPDATE external_search_folders SET status = ?, document_count = ?, indexed_at = ?, last_error = ?, updated_at = ?
     WHERE id = ? AND source_ref IN (SELECT source_ref FROM desktop_sources WHERE host_name = ?)`,
    [args.status, args.documentCount, args.indexedAt, args.lastError, new Date().toISOString(),
      args.folderId, hostName]
  );
}
