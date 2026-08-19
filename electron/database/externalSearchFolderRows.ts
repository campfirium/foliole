import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';
import type { DesktopInstallationIdentity } from '../desktopInstallationIdentity.js';

import { openDatabaseConnection } from './connection.js';

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
  owner_device_name: string | null;
  owner_installation_id: string | null;
  owner_platform: string | null;
  status: string;
  source_ref: string | null;
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
      f.last_error, f.owner_installation_id, COALESCE(s.host_name, f.owner_device_name) AS owner_device_name,
      COALESCE(s.host_platform, f.owner_platform) AS owner_platform, f.created_at, f.updated_at, f.source_ref
     FROM external_search_folders f LEFT JOIN desktop_sources s ON s.source_ref = f.source_ref
     ORDER BY f.created_at ASC`
  );
}

function accessMode(row: ExternalSearchFolderRow, identity: DesktopInstallationIdentity) {
  if (!row.owner_installation_id) return 'unowned' as const;
  return row.owner_installation_id === identity.installationId ? 'local' as const : 'remote_mirror' as const;
}

export function toExternalSearchFolder(
  row: ExternalSearchFolderRow,
  identity: DesktopInstallationIdentity,
  enabled: boolean
): NativeExternalSearchFolder {
  return {
    access_mode: accessMode(row, identity),
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
    owner_device_name: row.owner_device_name,
    owner_installation_id: row.owner_installation_id,
    owner_platform: row.owner_platform,
    status: row.status === 'ready' || row.status === 'indexing' || row.status === 'error' ? row.status : 'idle',
    updated_at: row.updated_at
  };
}
