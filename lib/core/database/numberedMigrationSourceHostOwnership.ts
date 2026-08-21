import { repairDeployedWatchedSourceOwnership } from './deployedWatchedSourceOwnershipRepair.js';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from './desktopResourceSchemaStatements.js';
import { WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS } from './desktopSourceConnectionSchemaStatements.js';
import { DESKTOP_SOURCE_SCHEMA_STATEMENTS } from './desktopSourceSchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { migrateSourceHostTypeSettings } from './sourceHostTypeSettingsMigration.js';
import { computeSyncContentHash } from './syncState.js';

const LEGACY_READWISE_KEY = 'readwise_active_device';
const READWISE_HOST_KEY = 'readwise_active_host';

export function migrateSourceHostOwnership(sqlite: DatabaseMigrationTarget) {
  repairDeployedWatchedSourceOwnership(sqlite, currentHostName(sqlite));
  rebuildDesktopSources(sqlite);
  migrateExternalHostPreferences(sqlite);
  rebuildExternalFolders(sqlite);
  rebuildWatchedBindings(sqlite);
  migrateSourceHostTypeSettings(sqlite);
  migrateReadwiseActiveHost(sqlite);
  rehashSourceObjects(sqlite);
}

function rebuildDesktopSources(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'desktop_sources')) {
    for (const statement of DESKTOP_SOURCE_SCHEMA_STATEMENTS) sqlite.exec(statement);
    return;
  }
  assertNoRows(sqlite, `SELECT source_ref FROM desktop_sources
    WHERE TRIM(host_name) = '' OR host_name IS NULL`, 'source_host_missing');
  sqlite.exec(`CREATE TABLE desktop_sources_next (
    source_ref TEXT PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('external', 'watched', 'readwise')),
    config_ref TEXT NOT NULL, host_name TEXT NOT NULL, host_platform TEXT NOT NULL,
    root_path TEXT NOT NULL, path_flavor TEXT NOT NULL CHECK (path_flavor IN ('posix', 'windows')),
    type_settings_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE (source_type, config_ref)
  );
  INSERT INTO desktop_sources_next SELECT source_ref, source_type, config_ref, host_name,
    host_platform, root_path, path_flavor, type_settings_json, created_at, updated_at FROM desktop_sources;
  DROP TABLE desktop_sources;
  ALTER TABLE desktop_sources_next RENAME TO desktop_sources`);
  for (const statement of DESKTOP_SOURCE_SCHEMA_STATEMENTS.slice(1)) sqlite.exec(statement);
}

function rebuildExternalFolders(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'external_search_folders')) return;
  assertNoRows(sqlite, `SELECT folder.id FROM external_search_folders folder
    LEFT JOIN desktop_sources source ON source.source_ref = folder.source_ref AND source.source_type = 'external'
    WHERE source.source_ref IS NULL`, 'external_source_host_missing');
  sqlite.exec(`CREATE TABLE external_search_folders_next (
    id TEXT PRIMARY KEY, folder_path TEXT NOT NULL, attachment_mode TEXT NOT NULL,
    attachment_root_path TEXT, excluded_dirs_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'idle', document_count INTEGER NOT NULL DEFAULT 0,
    indexed_at TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    source_ref TEXT NOT NULL
  );
  INSERT INTO external_search_folders_next SELECT id, folder_path, attachment_mode,
    attachment_root_path, excluded_dirs_json, status, document_count, indexed_at, last_error,
    created_at, updated_at, source_ref FROM external_search_folders;
  DROP TABLE external_search_folders;
  ALTER TABLE external_search_folders_next RENAME TO external_search_folders`);
}

function rebuildWatchedBindings(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'watched_folder_bindings')) {
    for (const statement of WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS) sqlite.exec(statement);
    return;
  }
  assertNoRows(sqlite, `SELECT binding.binding_id FROM watched_folder_bindings binding
    LEFT JOIN desktop_sources source ON source.source_ref = binding.source_ref AND source.source_type = 'watched'
    WHERE source.source_ref IS NULL`, 'watched_source_host_missing');
  sqlite.exec(`CREATE TABLE watched_folder_bindings_next (
    binding_id TEXT PRIMARY KEY, connection_status TEXT NOT NULL DEFAULT 'needs-folder'
      CHECK (connection_status IN ('connected', 'needs-folder')),
    action_mode TEXT NOT NULL, archive_path TEXT NOT NULL DEFAULT '', highlight_mode TEXT NOT NULL,
    highlight_path TEXT NOT NULL DEFAULT '', primary_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, source_ref TEXT NOT NULL
  );
  INSERT INTO watched_folder_bindings_next SELECT binding_id, connection_status, action_mode,
    archive_path, highlight_mode, highlight_path, primary_path, created_at, updated_at, deleted_at,
    source_ref FROM watched_folder_bindings;
  DROP TABLE watched_folder_bindings;
  ALTER TABLE watched_folder_bindings_next RENAME TO watched_folder_bindings`);
  for (const statement of WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS.slice(1)) sqlite.exec(statement);
}

function migrateExternalHostPreferences(sqlite: DatabaseMigrationTarget) {
  sqlite.exec(DESKTOP_RESOURCE_SCHEMA_STATEMENTS.find((statement) =>
    statement.includes('external_folder_host_preferences'))!);
  if (!tableExists(sqlite, 'external_folder_device_preferences')) return;
  const hostName = currentHostName(sqlite);
  const rows = sqlite.prepare(`SELECT preference.folder_id, preference.enabled, preference.updated_at
    FROM external_folder_device_preferences preference
    JOIN external_search_folders folder ON folder.id = preference.folder_id
    ORDER BY preference.updated_at, preference.folder_id`).all() as Array<{
      enabled: number; folder_id: string; updated_at: string;
    }>;
  const insert = sqlite.prepare(`INSERT INTO external_folder_host_preferences
    (host_name, folder_id, enabled, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(host_name, folder_id) DO UPDATE SET enabled = excluded.enabled,
      updated_at = excluded.updated_at`);
  const preferenceCount = sqlite.prepare('SELECT COUNT(*) count FROM external_folder_device_preferences')
    .all()[0] as { count: number };
  if (rows.length !== preferenceCount.count) throw new Error('external_source_host_preference_missing');
  if (rows.length && !hostName) throw new Error('external_source_host_preference_host_missing');
  for (const row of rows) insert.run(hostName, row.folder_id, row.enabled, row.updated_at);
  sqlite.exec('DROP TABLE external_folder_device_preferences');
}

function currentHostName(sqlite: DatabaseMigrationTarget) {
  if (tableExists(sqlite, 'sync_group_local_state') && tableExists(sqlite, 'sync_group_members')) {
    const active = sqlite.prepare(`SELECT member.host_name FROM sync_group_local_state local
      JOIN sync_group_members member ON member.group_id = local.group_id
        AND member.host_name = local.local_host_name
      WHERE local.singleton_id = 1 AND local.member_state = 'active'
        AND member.state = 'active' LIMIT 1`).all()[0] as { host_name?: string } | undefined;
    if (active?.host_name?.trim()) return active.host_name.trim();
  }
  if (!tableExists(sqlite, 'settings')) return null;
  for (const key of ['host_name', 'device_id', 'desktop_device_id']) {
    const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').all(key)[0] as
      { value?: string } | undefined;
    const value = parseHostName(row?.value);
    if (value) return value;
  }
  return null;
}

function parseHostName(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
  } catch {
    return value.trim() || null;
  }
}

function migrateReadwiseActiveHost(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'settings')) return;
  const projection = sqlite.prepare('SELECT value, updated_at FROM settings WHERE key = ?')
    .all(LEGACY_READWISE_KEY)[0] as { updated_at: string; value: string } | undefined;
  if (projection) {
    const value = readwiseHostValue(projection.value);
    sqlite.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(READWISE_HOST_KEY, value, projection.updated_at);
    sqlite.prepare('DELETE FROM settings WHERE key = ?').run(LEGACY_READWISE_KEY);
  }
  migrateReadwiseSettingRecord(sqlite);
}

function migrateReadwiseSettingRecord(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'setting_records')) return;
  const row = sqlite.prepare(`SELECT scope, platform, form_factor, host_name, value_json, updated_at
    FROM setting_records WHERE key = ?`).all(LEGACY_READWISE_KEY)[0] as ReadwiseSettingRow | undefined;
  if (!row) return;
  const valueJson = readwiseHostValue(row.value_json);
  const payload = { form_factor: row.form_factor, host_name: row.host_name, key: READWISE_HOST_KEY,
    platform: row.platform, scope: row.scope, value_json: valueJson };
  const hash = computeSyncContentHash('setting', payload);
  sqlite.prepare(`INSERT INTO setting_records
    (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
    .run(READWISE_HOST_KEY, row.scope, row.platform, row.form_factor, row.host_name,
      valueJson, hash, row.updated_at);
  sqlite.prepare('DELETE FROM setting_records WHERE key = ?').run(LEGACY_READWISE_KEY);
  if (!tableExists(sqlite, 'sync_object_state')) return;
  const oldId = `${row.scope}:${row.platform}:${row.form_factor}:${row.host_name}:${LEGACY_READWISE_KEY}`;
  const newId = `${row.scope}:${row.platform}:${row.form_factor}:${row.host_name}:${READWISE_HOST_KEY}`;
  sqlite.prepare(`UPDATE sync_object_state SET object_id = ?, content_hash = ?,
    state_seq = COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1), sync_dirty = 1
    WHERE object_type = 'setting' AND object_id = ?`).run(newId, hash, oldId);
}

interface ReadwiseSettingRow {
  form_factor: string; host_name: string; platform: string; scope: string; updated_at: string; value_json: string;
}

function rehashSourceObjects(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'sync_object_state')) return;
  const rows = sqlite.prepare(`SELECT state.object_type, state.object_id, state.updated_at,
      source.host_name, source.host_platform, source.source_ref,
      CASE state.object_type WHEN 'external_folder' THEN json_object(
        'id', folder.id, 'folder_path', folder.folder_path, 'attachment_mode', folder.attachment_mode,
        'attachment_root_path', folder.attachment_root_path, 'excluded_dirs_json', folder.excluded_dirs_json,
        'status', folder.status, 'document_count', folder.document_count, 'indexed_at', folder.indexed_at,
        'last_error', folder.last_error, 'host_name', source.host_name, 'host_platform', source.host_platform,
        'type_settings_json', source.type_settings_json, 'created_at', folder.created_at,
        'updated_at', folder.updated_at, 'source_ref', source.source_ref)
      ELSE json_object('binding_id', binding.binding_id, 'host_name', source.host_name,
        'host_platform', source.host_platform, 'type_settings_json', source.type_settings_json,
        'connection_status', binding.connection_status,
        'action_mode', binding.action_mode, 'archive_path', binding.archive_path,
        'highlight_mode', binding.highlight_mode, 'highlight_path', binding.highlight_path,
        'primary_path', binding.primary_path, 'created_at', binding.created_at,
        'updated_at', binding.updated_at, 'source_ref', source.source_ref) END payload_json
    FROM sync_object_state state
    LEFT JOIN external_search_folders folder ON state.object_type = 'external_folder' AND folder.id = state.object_id
    LEFT JOIN watched_folder_bindings binding ON state.object_type = 'watched_folder' AND binding.binding_id = state.object_id
    JOIN desktop_sources source ON source.source_ref = COALESCE(folder.source_ref, binding.source_ref)
    WHERE state.object_type IN ('external_folder', 'watched_folder') AND state.deleted_at IS NULL`).all() as Array<{
      object_id: string; object_type: 'external_folder' | 'watched_folder'; payload_json: string;
    }>;
  for (const row of rows) {
    const hash = computeSyncContentHash(row.object_type, JSON.parse(row.payload_json));
    sqlite.prepare(`UPDATE sync_object_state SET content_hash = ?,
      state_seq = COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1), sync_dirty = 1
      WHERE object_type = ? AND object_id = ?`).run(hash, row.object_type, row.object_id);
  }
}

function readwiseHostValue(value: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('readwise_active_host_invalid'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return JSON.stringify({ host_name: null });
  const hostName = (parsed as Record<string, unknown>).device_id;
  return JSON.stringify({ host_name: typeof hostName === 'string' && hostName.trim() ? hostName.trim() : null });
}

function assertNoRows(sqlite: DatabaseMigrationTarget, sql: string, message: string) {
  if (sqlite.prepare(sql).all().length) throw new Error(message);
}
