import path from 'node:path';

import { DESKTOP_SOURCE_SCHEMA_STATEMENTS } from './desktopSourceSchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import {
  addColumnIfMissing,
  columnExists,
  execOptionalIndex,
  tableExists
} from './numberedMigrationHelpers.js';

interface StoredSetting { value: string }

function readSetting(sqlite: DatabaseMigrationTarget, key: string) {
  if (!tableExists(sqlite, 'settings')) return null;
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').all(key)[0] as StoredSetting | undefined;
  if (!row) return null;
  try { return JSON.parse(row.value) as unknown; } catch { return row.value; }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pathFlavor(rootPath: string) {
  return /^[A-Za-z]:[\\/]/u.test(rootPath) || rootPath.includes('\\') ? 'windows' : 'posix';
}

function hostName(value: unknown) {
  return String(value ?? 'unknown-host').trim().replace(/\.local$/iu, '') || 'unknown-host';
}

function localHost(sqlite: DatabaseMigrationTarget) {
  const hasGroups = tableExists(sqlite, 'sync_group_local_state')
    && tableExists(sqlite, 'sync_group_members');
  const hostSchema = hasGroups && columnExists(sqlite, 'sync_group_members', 'host_name');
  const query = hostSchema
    ? `SELECT m.host_name AS name, m.host_platform AS platform FROM sync_group_local_state l
       JOIN sync_group_members m ON m.group_id = l.group_id AND m.host_name = l.local_host_name
       WHERE l.singleton_id = 1 AND l.member_state = 'active' AND m.state = 'active' LIMIT 1`
    : `SELECT m.device_name AS name, m.device_kind AS platform FROM sync_group_local_state l
       JOIN sync_group_members m ON m.group_id = l.group_id AND m.device_id = l.local_device_id
       WHERE l.singleton_id = 1 AND l.member_state = 'active' AND m.state = 'active' LIMIT 1`;
  const active = hasGroups
    ? sqlite.prepare(query).all()[0] as { name: string; platform: string } | undefined
    : undefined;
  const stored = readSetting(sqlite, 'device_id');
  const fallback = typeof stored === 'string' && stored.trim() ? stored.trim() : 'unknown-host';
  return { name: active?.name ?? fallback, platform: active?.platform ?? process.platform };
}

function upsertSource(sqlite: DatabaseMigrationTarget, input: {
  configRef: string; hostName: string; hostPlatform: string; rootPath: string;
  sourceRef: string; sourceType: 'external' | 'readwise' | 'watched'; updatedAt: string;
}) {
  sqlite.prepare(
    `INSERT OR IGNORE INTO desktop_sources (
       source_ref, source_type, config_ref, host_name, host_platform, root_path,
       path_flavor, type_settings_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`
  ).run(input.sourceRef, input.sourceType, input.configRef, input.hostName, input.hostPlatform,
    input.rootPath, pathFlavor(input.rootPath), input.updatedAt, input.updatedAt);
}

function migrateExternalSources(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'external_search_folders')) return;
  addColumnIfMissing(sqlite, 'external_search_folders', 'source_ref', 'TEXT');
  const rows = sqlite.prepare(`SELECT id, folder_path, owner_device_name, owner_platform, updated_at
    FROM external_search_folders`).all() as Array<Record<string, unknown>>;
  for (const row of rows) {
    const sourceRef = `external:${String(row.id)}`;
    upsertSource(sqlite, {
      configRef: String(row.id), hostName: hostName(row.owner_device_name),
      hostPlatform: String(row.owner_platform ?? process.platform), rootPath: String(row.folder_path),
      sourceRef, sourceType: 'external', updatedAt: String(row.updated_at)
    });
    sqlite.prepare('UPDATE external_search_folders SET source_ref = ? WHERE id = ?').run(sourceRef, row.id);
  }
}

function migrateConfiguredSources(sqlite: DatabaseMigrationTarget) {
  const host = localHost(sqlite);
  const settings = asRecord(readSetting(sqlite, 'import_manager_settings'));
  const updatedAt = typeof settings.updatedAt === 'string' ? settings.updatedAt : new Date(0).toISOString();
  for (const sourceType of ['watched', 'readwise'] as const) {
    const key = sourceType === 'watched' ? 'sources' : 'readwiseSources';
    const rows = Array.isArray(settings[key]) ? settings[key] : [];
    for (const value of rows) {
      const row = asRecord(value);
      const configRef = typeof row.id === 'string' ? row.id.trim() : '';
      const rootPath = typeof row.primaryPath === 'string' ? row.primaryPath.trim() : '';
      if (!configRef || !rootPath) continue;
      upsertSource(sqlite, {
        configRef, hostName: host.name, hostPlatform: host.platform, rootPath,
        sourceRef: `${sourceType}:${configRef}`, sourceType, updatedAt
      });
    }
  }
}

function migrateWatchedBindings(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'watched_folder_bindings')) return;
  addColumnIfMissing(sqlite, 'watched_folder_bindings', 'source_ref', 'TEXT');
  if (!columnExists(sqlite, 'watched_folder_bindings', 'connected_device_name')) return;
  const rows = sqlite.prepare(`SELECT binding_id, connected_device_name, connected_platform,
    primary_path, created_at, updated_at FROM watched_folder_bindings`).all() as Array<Record<string, unknown>>;
  for (const row of rows) {
    const configRef = String(row.binding_id);
    const sourceRef = `watched:${configRef}`;
    upsertSource(sqlite, {
      configRef, hostName: hostName(row.connected_device_name),
      hostPlatform: String(row.connected_platform ?? process.platform), rootPath: String(row.primary_path),
      sourceRef, sourceType: 'watched', updatedAt: String(row.updated_at ?? row.created_at)
    });
    sqlite.prepare('UPDATE watched_folder_bindings SET source_ref = ? WHERE binding_id = ?').run(sourceRef, configRef);
  }
}

function migrateLocations(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'import_sources')) return;
  addColumnIfMissing(sqlite, 'import_sources', 'watched_binding_id', 'TEXT');
  addColumnIfMissing(sqlite, 'import_sources', 'watched_relative_path', 'TEXT');
  addColumnIfMissing(sqlite, 'import_sources', 'source_ref', 'TEXT');
  addColumnIfMissing(sqlite, 'import_sources', 'source_location', 'TEXT');
  execOptionalIndex(sqlite, `CREATE INDEX IF NOT EXISTS idx_import_sources_watched_relative
    ON import_sources (watched_binding_id, watched_relative_path)`);
  execOptionalIndex(sqlite, `CREATE INDEX IF NOT EXISTS idx_import_sources_location
    ON import_sources (source_ref, source_location)`);
  if (!tableExists(sqlite, 'keep_import_items')) return;
  const rows = sqlite.prepare(`SELECT p.source_fingerprint, i.source_path, s.source_ref, s.root_path, s.path_flavor
    FROM import_sources p JOIN keep_import_items i ON i.last_node_id = p.latest_node_id
    JOIN desktop_sources s ON s.config_ref = i.rule_id
    ORDER BY i.last_seen_at DESC`).all() as Array<Record<string, unknown>>;
  const mapped = new Set<string>();
  for (const row of rows) {
    const fingerprint = String(row.source_fingerprint);
    if (mapped.has(fingerprint)) continue;
    const location = normalizeLocation(String(row.root_path), String(row.source_path), String(row.path_flavor));
    if (!location) continue;
    sqlite.prepare('UPDATE import_sources SET source_ref = ?, source_location = ? WHERE source_fingerprint = ?')
      .run(row.source_ref, location, fingerprint);
    mapped.add(fingerprint);
  }
  sqlite.exec(`UPDATE import_sources SET source_ref = (
      SELECT source_ref FROM watched_folder_bindings b WHERE b.binding_id = import_sources.watched_binding_id
    ), source_location = watched_relative_path
    WHERE watched_binding_id IS NOT NULL AND watched_relative_path IS NOT NULL`);
}

function normalizeLocation(rootPath: string, candidate: string, flavor: string) {
  const pathApi = flavor === 'windows' ? path.win32 : path.posix;
  const relative = pathApi.isAbsolute(candidate) ? pathApi.relative(rootPath, candidate) : candidate;
  const normalized = relative.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!normalized || normalized === '..' || normalized.startsWith('../') || pathApi.isAbsolute(normalized)) return null;
  return normalized;
}

export function migrateDesktopSources(sqlite: DatabaseMigrationTarget) {
  for (const statement of DESKTOP_SOURCE_SCHEMA_STATEMENTS) sqlite.exec(statement);
  migrateExternalSources(sqlite);
  migrateWatchedBindings(sqlite);
  migrateConfiguredSources(sqlite);
  migrateLocations(sqlite);
}
