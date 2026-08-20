import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

import { openDatabaseConnection } from './connection.js';
import { isDesktopSourceExecutable, type DesktopSourceRecord } from './desktopSources.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

export interface ExternalSearchFolderRow extends DatabaseRow {
  attachment_mode: string;
  attachment_root_path: string | null;
  created_at: string;
  document_count: number;
  excluded_dirs_json: string;
  folder_path: string;
  id: string;
  indexed_at: string | null;
  last_error: string | null;
  host_name: string;
  host_platform: string;
  path_flavor: 'posix' | 'windows';
  root_path: string;
  status: string;
  source_ref: string;
  source_type: 'external';
  type_settings_json: string;
  updated_at: string;
}

export function normalizeExcludedDirs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))];
}

export function readExternalSearchFolderRows() {
  return openDatabaseConnection().driver.queryAll<ExternalSearchFolderRow>(
    `SELECT f.id, COALESCE(s.root_path, f.folder_path) AS folder_path, f.attachment_mode,
      f.attachment_root_path, f.excluded_dirs_json, f.status, f.document_count, f.indexed_at,
      f.last_error, s.host_name, s.host_platform, s.root_path, s.path_flavor, s.source_type,
      s.type_settings_json, f.created_at, f.updated_at, f.source_ref
     FROM external_search_folders f JOIN desktop_sources s ON s.source_ref = f.source_ref
     ORDER BY f.created_at ASC`
  );
}

export function toExternalSearchFolder(
  row: ExternalSearchFolderRow,
  enabled: boolean
): NativeExternalSearchFolder {
  const source = row as unknown as DesktopSourceRecord;
  return {
    access_mode: row.host_name === loadOrCreateDesktopHostName() ? 'local' : 'remote_mirror',
    attachment_mode: row.attachment_mode === 'fixed_root' || row.attachment_mode === 'document_relative_first_then_fixed_root'
      ? row.attachment_mode : 'document_relative',
    attachment_root_path: row.attachment_root_path?.trim() || null,
    created_at: row.created_at,
    document_count: Math.max(0, Number(row.document_count ?? 0)),
    excluded_dirs: normalizeExcludedDirs(JSON.parse(row.excluded_dirs_json)),
    folder_path: row.folder_path,
    id: row.id,
    indexed_at: row.indexed_at,
    last_error: row.last_error,
    mirror_enabled: enabled,
    source_executable: isDesktopSourceExecutable(source),
    source_host_name: row.host_name,
    source_host_platform: row.host_platform,
    status: row.status === 'ready' || row.status === 'indexing' || row.status === 'error' ? row.status : 'idle',
    updated_at: row.updated_at
  };
}
