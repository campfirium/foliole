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
  updated_at: string;
}

export function normalizeExcludedDirs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))];
}

export function readExternalSearchFolderRows() {
  return openDatabaseConnection().driver.queryAll<ExternalSearchFolderRow>(
    `SELECT id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status,
      document_count, indexed_at, last_error, owner_installation_id, owner_device_name, owner_platform,
      created_at, updated_at
     FROM external_search_folders ORDER BY created_at ASC`
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
