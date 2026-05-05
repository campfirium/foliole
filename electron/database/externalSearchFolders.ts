import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

import { openDatabaseConnection } from './connection.js';

interface ExternalSearchFolderRow extends DatabaseRow {
  attachment_mode: string;
  attachment_root_path: string | null;
  created_at: string;
  document_count: number;
  excluded_dirs_json: string;
  folder_path: string;
  id: string;
  indexed_at: string | null;
  last_error: string | null;
  status: string;
  updated_at: string;
}

type SaveFolderInput = Pick<
  NativeExternalSearchFolder,
  'attachment_mode' | 'attachment_root_path' | 'excluded_dirs' | 'folder_path' | 'id'
>;

function normalizeExcludedDirs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))];
}

function toFolder(row: ExternalSearchFolderRow): NativeExternalSearchFolder {
  return {
    attachment_mode:
      row.attachment_mode === 'fixed_root' || row.attachment_mode === 'document_relative_first_then_fixed_root'
        ? row.attachment_mode
        : 'document_relative',
    attachment_root_path: row.attachment_root_path?.trim() || null,
    created_at: row.created_at,
    document_count: Math.max(0, Number(row.document_count ?? 0)),
    excluded_dirs: normalizeExcludedDirs(JSON.parse(row.excluded_dirs_json)),
    folder_path: row.folder_path,
    id: row.id,
    indexed_at: row.indexed_at,
    last_error: row.last_error,
    status: row.status === 'ready' || row.status === 'indexing' || row.status === 'error' ? row.status : 'idle',
    updated_at: row.updated_at
  };
}

function readRows() {
  return openDatabaseConnection().driver.queryAll<ExternalSearchFolderRow>(
    `SELECT
      id,
      folder_path,
      attachment_mode,
      attachment_root_path,
      excluded_dirs_json,
      status,
      document_count,
      indexed_at,
      last_error,
      created_at,
      updated_at
     FROM external_search_folders
     ORDER BY created_at ASC`
  );
}

export function loadExternalSearchFolders() {
  return readRows().map((row) => toFolder(row));
}

function normalizeFolders(folders: SaveFolderInput[]) {
  return folders
    .map((folder) => ({
      attachmentMode: 'document_relative_first_then_fixed_root' as const,
      attachmentRootPath: folder.attachment_root_path?.trim() || null,
      excludedDirs: normalizeExcludedDirs(folder.excluded_dirs),
      folderPath: folder.folder_path.trim(),
      id: folder.id.trim()
    }))
    .filter((folder) => folder.id && folder.folderPath);
}

function upsertExternalSearchFolders(
  normalizedFolders: ReturnType<typeof normalizeFolders>,
  now: string,
  existingById: Map<string, ExternalSearchFolderRow>
) {
  const driver = openDatabaseConnection().driver;
  normalizedFolders.forEach((folder) => {
    const existing = existingById.get(folder.id);
    driver.execute(
      `INSERT INTO external_search_folders (
        id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status, document_count, indexed_at, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        folder_path = excluded.folder_path,
        attachment_mode = excluded.attachment_mode,
        attachment_root_path = excluded.attachment_root_path,
        excluded_dirs_json = excluded.excluded_dirs_json,
        status = 'idle',
        updated_at = excluded.updated_at`,
      [
        folder.id,
        folder.folderPath,
        folder.attachmentMode,
        folder.attachmentRootPath,
        JSON.stringify(folder.excludedDirs),
        existing?.status ?? 'idle',
        existing?.document_count ?? 0,
        existing?.indexed_at ?? null,
        existing?.last_error ?? null,
        existing?.created_at ?? now,
        now
      ]
    );
  });
}

export function saveExternalSearchFolders(folders: SaveFolderInput[]) {
  const driver = openDatabaseConnection().driver;
  const now = new Date().toISOString();
  const normalizedFolders = normalizeFolders(folders);

  driver.transaction(() => {
    const existingRows = readRows();
    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    driver.execute(
      `DELETE FROM external_search_folders
       WHERE id NOT IN (${normalizedFolders.map(() => '?').join(', ') || "''"})`,
      normalizedFolders.map((folder) => folder.id)
    );
    upsertExternalSearchFolders(normalizedFolders, now, existingById);
    if (!normalizedFolders.length) driver.execute('DELETE FROM external_search_folders');
  });
  return loadExternalSearchFolders();
}

export function updateExternalSearchFolderIndexState(args: {
  documentCount: number;
  folderId: string;
  indexedAt: string | null;
  lastError: string | null;
  status: NativeExternalSearchFolder['status'];
}) {
  openDatabaseConnection().driver.execute(
    `UPDATE external_search_folders
     SET status = ?, document_count = ?, indexed_at = ?, last_error = ?, updated_at = ?
     WHERE id = ?`,
    [args.status, args.documentCount, args.indexedAt, args.lastError, new Date().toISOString(), args.folderId]
  );
}
