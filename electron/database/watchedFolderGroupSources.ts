import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { WatchedFolderGroupSource } from '../../lib/platform/watchedFolderConflictContract.js';
import { parseWatchedFolderGroupSource } from '../../lib/platform/watchedFolderConflictContract.js';

import { openDatabaseConnection } from './connection.js';

interface SourceRow extends DatabaseRow, WatchedFolderGroupSource {}

function activeGroup() {
  return openDatabaseConnection().driver.queryOne<{ group_id: string; local_device_identity_key: string }>(
    `SELECT group_id, local_device_identity_key FROM sync_group_local_state
     WHERE singleton_id = 1 AND state = 'active'`
  ) ?? null;
}

export function loadWatchedFolderGroupSources(localOnly = false): WatchedFolderGroupSource[] {
  const group = activeGroup();
  if (!group) return [];
  const driver = openDatabaseConnection().driver;
  return driver.queryAll<SourceRow>(
    `SELECT b.binding_id, b.owner_device_identity_key, b.connection_status, b.action_mode,
       b.highlight_mode, b.reported_path, b.created_at, b.updated_at, b.source_ref,
       s.host_name, s.host_platform
     FROM watched_folder_bindings b JOIN desktop_sources s ON s.source_ref = b.source_ref
     JOIN sync_group_devices d ON d.device_identity_key = b.owner_device_identity_key
       AND d.group_id = ? AND d.state = 'active'
     WHERE b.deleted_at IS NULL AND (? = 0 OR b.owner_device_identity_key = ?)
     ORDER BY b.created_at, b.binding_id`,
    [group.group_id, localOnly ? 1 : 0, group.local_device_identity_key]
  );
}

export function applyRemoteWatchedFolderGroupSources(values: unknown[], senderDeviceId: string) {
  const group = activeGroup();
  if (!group) {
    throw new Error('watched_source_sender_invalid');
  }
  const sources = values.map(parseWatchedFolderGroupSource);
  if (senderDeviceId === group.local_device_identity_key) {
    if (sources.length) throw new Error('watched_source_sender_invalid');
    return;
  }
  const driver = openDatabaseConnection().driver;
  for (const source of sources) {
    if (source.owner_device_identity_key !== senderDeviceId ||
        source.source_ref !== `watched:${source.binding_id}`) {
      throw new Error('watched_source_owner_invalid');
    }
    const existing = driver.queryOne<{ owner_device_identity_key: string | null; source_ref: string }>(
      'SELECT owner_device_identity_key, source_ref FROM watched_folder_bindings WHERE binding_id = ?',
      [source.binding_id]
    );
    if (existing && (existing.owner_device_identity_key !== senderDeviceId ||
        existing.source_ref !== source.source_ref)) throw new Error('watched_source_identity_conflict');
  }
  for (const source of sources) upsertRemoteSource(source);
}

function upsertRemoteSource(source: WatchedFolderGroupSource) {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO desktop_sources (source_ref, source_type, config_ref, host_name,
       host_platform, root_path, path_flavor, type_settings_json, created_at, updated_at)
     VALUES (?, 'watched', ?, ?, ?, '', 'posix', '{}', ?, ?)
     ON CONFLICT(source_ref) DO UPDATE SET host_name = excluded.host_name,
       host_platform = excluded.host_platform, updated_at = excluded.updated_at
     WHERE desktop_sources.updated_at <= excluded.updated_at`,
    [source.source_ref, source.binding_id, source.host_name, source.host_platform,
      source.created_at, source.updated_at]
  );
  driver.execute(
    `INSERT INTO watched_folder_bindings (binding_id, connection_status, action_mode,
       highlight_mode, created_at, updated_at, source_ref, owner_device_identity_key, reported_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(binding_id) DO UPDATE SET connection_status = excluded.connection_status,
       action_mode = excluded.action_mode, highlight_mode = excluded.highlight_mode,
       updated_at = excluded.updated_at, reported_path = excluded.reported_path
     WHERE watched_folder_bindings.updated_at <= excluded.updated_at`,
    [source.binding_id, source.connection_status, source.action_mode,
      source.highlight_mode, source.created_at, source.updated_at,
      source.source_ref, source.owner_device_identity_key, source.reported_path]
  );
}
