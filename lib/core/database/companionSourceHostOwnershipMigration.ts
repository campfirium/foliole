import type { DbPort, DbRow } from '../sync/dbPort.js';

import { computeCompanionContentHash } from './companionHostStateHashes.js';

const LEGACY_READWISE_KEY = 'readwise_active_device';
const READWISE_HOST_KEY = 'readwise_active_host';

export const COMPANION_SOURCE_HOST_OWNERSHIP_ACTION_TYPES = {
  migrateSourceHostOwnership: 'migrateSourceHostOwnership'
} as const;

export const COMPANION_SOURCE_HOST_OWNERSHIP_PLAN_STEP = {
  actions: [{ type: 'migrateSourceHostOwnership' }],
  beforeVersion: 32
} as const;

export async function migrateCompanionSourceHostOwnership(db: DbPort) {
  await prepareLegacySourceLinks(db);
  await assertSourceLinks(db, 'external_search_folders', 'external');
  await assertSourceLinks(db, 'watched_folder_bindings', 'watched');
  await rebuildDesktopSources(db);
  await rebuildExternalFolders(db);
  await rebuildWatchedBindings(db);
  await migrateReadwiseSetting(db);
  await rehashCompanionSources(db);
}

async function prepareLegacySourceLinks(db: DbPort) {
  await db.run(`CREATE TABLE IF NOT EXISTS desktop_sources (
    source_ref TEXT PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('external', 'watched', 'readwise')),
    config_ref TEXT NOT NULL, host_name TEXT NOT NULL, host_platform TEXT NOT NULL,
    owner_installation_id TEXT, root_path TEXT NOT NULL,
    path_flavor TEXT NOT NULL CHECK (path_flavor IN ('posix', 'windows')),
    type_settings_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE (source_type, config_ref)
  )`);
  await ensureColumn(db, 'external_search_folders', 'source_ref', 'TEXT');
  await ensureColumn(db, 'watched_folder_bindings', 'source_ref', 'TEXT');
  await backfillExternalSourceLinks(db);
  await backfillWatchedSourceLinks(db);
}

async function backfillExternalSourceLinks(db: DbPort) {
  if (!await columnExists(db, 'external_search_folders', 'owner_device_name')) return;
  const rows = await db.query<LegacySourceRow>(`SELECT id config_ref, folder_path root_path,
    owner_device_name host_name, owner_platform host_platform, created_at, updated_at
    FROM external_search_folders WHERE source_ref IS NULL AND owner_device_name IS NOT NULL`);
  for (const row of rows) await insertLegacySource(db, 'external', row, { connectionStatus: 'connected' });
}

async function backfillWatchedSourceLinks(db: DbPort) {
  if (!await columnExists(db, 'watched_folder_bindings', 'connected_device_name')) return;
  const rows = await db.query<LegacySourceRow>(`SELECT binding_id config_ref, primary_path root_path,
    connected_device_name host_name, connected_platform host_platform, created_at, updated_at,
    archive_path, highlight_path FROM watched_folder_bindings
    WHERE source_ref IS NULL AND connected_device_name IS NOT NULL`);
  for (const row of rows) await insertLegacySource(db, 'watched', row, {
    archivePath: row.archive_path ?? '', highlightPath: row.highlight_path ?? ''
  });
}

async function insertLegacySource(
  db: DbPort,
  sourceType: 'external' | 'watched',
  row: LegacySourceRow,
  typeSettings: unknown
) {
  const sourceRef = `${sourceType}:${row.config_ref}`;
  const rootPath = row.root_path ?? '';
  const pathFlavor = /^[A-Za-z]:[\\/]/u.test(rootPath) || rootPath.includes('\\') ? 'windows' : 'posix';
  await db.run(`INSERT OR IGNORE INTO desktop_sources (source_ref, source_type, config_ref,
    host_name, host_platform, root_path, path_flavor, type_settings_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [sourceRef, sourceType, row.config_ref,
    row.host_name, row.host_platform ?? 'unknown', rootPath, pathFlavor, JSON.stringify(typeSettings),
    row.created_at, row.updated_at]);
  const table = sourceType === 'external' ? 'external_search_folders' : 'watched_folder_bindings';
  const id = sourceType === 'external' ? 'id' : 'binding_id';
  await db.run(`UPDATE ${table} SET source_ref = ? WHERE ${id} = ?`, [sourceRef, row.config_ref]);
}

async function ensureColumn(db: DbPort, table: string, column: string, type: string) {
  if (!await columnExists(db, table, column)) await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

async function columnExists(db: DbPort, table: string, column: string) {
  const rows = await db.query<DbRow>(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}

async function assertSourceLinks(db: DbPort, table: string, sourceType: string) {
  const id = table === 'external_search_folders' ? 'id' : 'binding_id';
  const rows = await db.query(`SELECT item.${id} FROM ${table} item
    LEFT JOIN desktop_sources source ON source.source_ref = item.source_ref AND source.source_type = ?
    WHERE source.source_ref IS NULL LIMIT 1`, [sourceType]);
  if (rows.length) throw new Error(`${sourceType}_source_host_missing`);
}

async function rebuildDesktopSources(db: DbPort) {
  await db.run(`CREATE TABLE desktop_sources_next (
    source_ref TEXT PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('external', 'watched', 'readwise')),
    config_ref TEXT NOT NULL, host_name TEXT NOT NULL, host_platform TEXT NOT NULL,
    root_path TEXT NOT NULL, path_flavor TEXT NOT NULL CHECK (path_flavor IN ('posix', 'windows')),
    type_settings_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE (source_type, config_ref)
  )`);
  await db.run(`INSERT INTO desktop_sources_next SELECT source_ref, source_type, config_ref,
    host_name, host_platform, root_path, path_flavor, type_settings_json, created_at, updated_at
    FROM desktop_sources`);
  await replaceTable(db, 'desktop_sources');
  await db.run('CREATE INDEX idx_desktop_sources_host ON desktop_sources (host_name, source_type, updated_at)');
}

async function rebuildExternalFolders(db: DbPort) {
  await db.run(`CREATE TABLE external_search_folders_next (
    id TEXT PRIMARY KEY, folder_path TEXT NOT NULL, attachment_mode TEXT NOT NULL,
    attachment_root_path TEXT, excluded_dirs_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'idle', document_count INTEGER NOT NULL DEFAULT 0,
    indexed_at TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    source_ref TEXT NOT NULL
  )`);
  await db.run(`INSERT INTO external_search_folders_next SELECT id, folder_path, attachment_mode,
    attachment_root_path, excluded_dirs_json, status, document_count, indexed_at, last_error,
    created_at, updated_at, source_ref FROM external_search_folders`);
  await replaceTable(db, 'external_search_folders');
}

async function rebuildWatchedBindings(db: DbPort) {
  await db.run(`CREATE TABLE watched_folder_bindings_next (
    binding_id TEXT PRIMARY KEY, connection_status TEXT NOT NULL DEFAULT 'needs-folder'
      CHECK (connection_status IN ('connected', 'needs-folder')),
    action_mode TEXT NOT NULL, archive_path TEXT NOT NULL DEFAULT '', highlight_mode TEXT NOT NULL,
    highlight_path TEXT NOT NULL DEFAULT '', primary_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, source_ref TEXT NOT NULL
  )`);
  await db.run(`INSERT INTO watched_folder_bindings_next SELECT binding_id, connection_status,
    action_mode, archive_path, highlight_mode, highlight_path, primary_path,
    created_at, updated_at, deleted_at, source_ref FROM watched_folder_bindings`);
  await replaceTable(db, 'watched_folder_bindings');
  await db.run(`CREATE INDEX idx_watched_folder_bindings_source
    ON watched_folder_bindings (source_ref, updated_at)`);
}

async function replaceTable(db: DbPort, table: string) {
  await db.run(`DROP TABLE ${table}`);
  await db.run(`ALTER TABLE ${table}_next RENAME TO ${table}`);
}

async function migrateReadwiseSetting(db: DbPort) {
  const rows = await db.query<SettingRow>(`SELECT scope, platform, form_factor, host_name,
    value_json, updated_at FROM setting_records WHERE key = ?`, [LEGACY_READWISE_KEY]);
  for (const row of rows) {
    const valueJson = readwiseHostValue(row.value_json);
    const payload = { form_factor: row.form_factor, host_name: row.host_name,
      key: READWISE_HOST_KEY, platform: row.platform, scope: row.scope, value_json: valueJson };
    const hash = computeCompanionContentHash(payload);
    await db.run(`INSERT OR REPLACE INTO setting_records
      (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`, [READWISE_HOST_KEY, row.scope, row.platform,
      row.form_factor, row.host_name, valueJson, hash, row.updated_at]);
    const oldId = settingId(row, LEGACY_READWISE_KEY);
    const newId = settingId(row, READWISE_HOST_KEY);
    await db.run(`DELETE FROM sync_object_state
      WHERE object_type = 'setting' AND object_id = ?`, [newId]);
    await db.run(`UPDATE sync_object_state SET object_id = ?, content_hash = ?, sync_dirty = 1
      WHERE object_type = 'setting' AND object_id = ?`, [newId, hash, oldId]);
  }
  await db.run('DELETE FROM setting_records WHERE key = ?', [LEGACY_READWISE_KEY]);
}

export async function rehashCompanionSources(db: DbPort) {
  for (const objectType of ['external_folder', 'watched_folder'] as const) {
    const rows = await db.query<{ object_id: string; payload_json: string }>(sourcePayloadSql(objectType));
    for (const row of rows) {
      const hash = computeCompanionContentHash(JSON.parse(row.payload_json));
      await db.run(`UPDATE sync_object_state SET content_hash = ?, sync_dirty = 1
        WHERE object_type = ? AND object_id = ?`, [hash, objectType, row.object_id]);
    }
  }
}

export async function transferCompanionSourceHosts(db: DbPort, previous: string, current: string) {
  if (previous === current) return;
  await db.run('UPDATE desktop_sources SET host_name = ? WHERE host_name = ?', [current, previous]);
  const activeValue = JSON.stringify({ host_name: current });
  await db.run(`UPDATE setting_records SET value_json = ?
    WHERE key = ? AND json_extract(value_json, '$.host_name') = ?`,
  [activeValue, READWISE_HOST_KEY, previous]);
  await rehashCompanionSources(db);
}

function sourcePayloadSql(type: 'external_folder' | 'watched_folder') {
  if (type === 'external_folder') return `SELECT state.object_id, json_object(
    'id', f.id, 'folder_path', f.folder_path, 'attachment_mode', f.attachment_mode,
    'attachment_root_path', f.attachment_root_path, 'excluded_dirs_json', f.excluded_dirs_json,
    'status', f.status, 'document_count', f.document_count, 'indexed_at', f.indexed_at,
    'last_error', f.last_error, 'host_name', s.host_name, 'host_platform', s.host_platform,
    'type_settings_json', s.type_settings_json, 'created_at', f.created_at, 'updated_at', f.updated_at,
    'source_ref', f.source_ref) payload_json FROM sync_object_state state
    JOIN external_search_folders f ON f.id = state.object_id
    JOIN desktop_sources s ON s.source_ref = f.source_ref
    WHERE state.object_type = 'external_folder' AND state.deleted_at IS NULL`;
  return `SELECT state.object_id, json_object('binding_id', b.binding_id,
    'host_name', s.host_name, 'host_platform', s.host_platform, 'type_settings_json', s.type_settings_json,
    'connection_status', b.connection_status, 'action_mode', b.action_mode,
    'archive_path', b.archive_path, 'highlight_mode', b.highlight_mode,
    'highlight_path', b.highlight_path, 'primary_path', b.primary_path,
    'created_at', b.created_at, 'updated_at', b.updated_at, 'source_ref', b.source_ref) payload_json
    FROM sync_object_state state JOIN watched_folder_bindings b ON b.binding_id = state.object_id
    JOIN desktop_sources s ON s.source_ref = b.source_ref
    WHERE state.object_type = 'watched_folder' AND state.deleted_at IS NULL`;
}

function readwiseHostValue(value: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('readwise_active_host_invalid'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return JSON.stringify({ host_name: null });
  const hostName = (parsed as Record<string, unknown>).device_id;
  return JSON.stringify({ host_name: typeof hostName === 'string' && hostName.trim() ? hostName.trim() : null });
}

function settingId(row: SettingRow, key: string) {
  return `${row.scope}:${row.platform}:${row.form_factor}:${row.host_name}:${key}`;
}

interface SettingRow extends DbRow {
  form_factor: string; host_name: string; platform: string; scope: string; updated_at: string; value_json: string;
}

interface LegacySourceRow extends DbRow {
  archive_path?: string; config_ref: string; created_at: string; highlight_path?: string;
  host_name: string; host_platform: string | null; root_path: string; updated_at: string;
}
