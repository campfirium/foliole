import fs from 'node:fs';
import path from 'node:path';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';
import { loadOrCreateDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type { ImportManagerSourceDraft } from '../../lib/core/import/importManagerSettings.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

import { openDatabaseConnection } from './connection.js';

export type DesktopSourceType = 'external' | 'readwise' | 'watched';

export interface DesktopSourceRecord extends DatabaseRow {
  config_ref: string;
  host_name: string;
  host_platform: string;
  path_flavor: 'posix' | 'windows';
  root_path: string;
  source_ref: string;
  source_type: DesktopSourceType;
  type_settings_json: string;
  updated_at: string;
}

export function loadCurrentDesktopHost() {
  const driver = openDatabaseConnection().driver;
  const hostName = loadOrCreateDatabaseHostName(driver, new Date().toISOString());
  const member = driver.queryOne<{ host_name: string; host_platform: string }>(
    `SELECT m.host_name, m.host_platform FROM sync_group_local_state l
     JOIN sync_group_members m ON m.group_id = l.group_id AND m.host_name = l.local_host_name
     WHERE l.singleton_id = 1 AND l.member_state = 'active' AND m.state = 'active' LIMIT 1`
  );
  return { name: member?.host_name ?? hostName, platform: member?.host_platform ?? process.platform };
}

function pathFlavor(rootPath: string): DesktopSourceRecord['path_flavor'] {
  return /^[A-Za-z]:[\\/]/u.test(rootPath) || rootPath.includes('\\') ? 'windows' : 'posix';
}

export function loadDesktopSource(sourceRef: string) {
  return openDatabaseConnection().driver.queryOne<DesktopSourceRecord>(
    `SELECT source_ref, source_type, config_ref, host_name, host_platform, root_path,
       path_flavor, type_settings_json, updated_at FROM desktop_sources WHERE source_ref = ?`,
    [sourceRef]
  ) ?? null;
}

export function loadDesktopSourceByConfig(sourceType: DesktopSourceType, configRef: string) {
  return openDatabaseConnection().driver.queryOne<DesktopSourceRecord>(
    `SELECT source_ref, source_type, config_ref, host_name, host_platform, root_path,
       path_flavor, type_settings_json, updated_at FROM desktop_sources
     WHERE source_type = ? AND config_ref = ?`, [sourceType, configRef]
  ) ?? null;
}

export function upsertDesktopSource(input: {
  configRef: string; hostName?: string; hostPlatform?: string; rootPath: string;
  sourceRef?: string; sourceType: DesktopSourceType; typeSettings?: unknown; updatedAt: string;
}) {
  const host = loadCurrentDesktopHost();
  const sourceRef = input.sourceRef ?? `${input.sourceType}:${input.configRef}`;
  openDatabaseConnection().driver.execute(
    `INSERT INTO desktop_sources (source_ref, source_type, config_ref, host_name, host_platform,
       root_path, path_flavor, type_settings_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_type, config_ref) DO UPDATE SET host_name = excluded.host_name,
       host_platform = excluded.host_platform, root_path = excluded.root_path,
       path_flavor = excluded.path_flavor, type_settings_json = excluded.type_settings_json,
       updated_at = excluded.updated_at`,
    [sourceRef, input.sourceType, input.configRef, input.hostName ?? host.name,
      input.hostPlatform ?? host.platform, input.rootPath.trim(), pathFlavor(input.rootPath),
      JSON.stringify(input.typeSettings ?? {}), input.updatedAt, input.updatedAt]
  );
  return loadDesktopSourceByConfig(input.sourceType, input.configRef)!;
}

export function upsertWatchedImportManagerSources(input: {
  sources: ImportManagerSourceDraft[]; updatedAt: string;
}) {
  for (const source of input.sources) {
    if (!source.id.trim() || !source.primaryPath.trim()) continue;
    upsertDesktopSource({
      configRef: source.id, rootPath: source.primaryPath, sourceType: 'watched',
      typeSettings: { archivePath: source.archivePath, highlightPath: source.highlightPath },
      updatedAt: input.updatedAt
    });
  }
}

function hydrateSource(sourceType: 'readwise' | 'watched', source: ImportManagerSourceDraft) {
  const persisted = loadDesktopSourceByConfig(sourceType, source.id);
  if (!persisted) return source;
  let settings: Record<string, unknown> = {};
  try { settings = JSON.parse(persisted.type_settings_json) as Record<string, unknown>; } catch { /* history only */ }
  return {
    ...source,
    archivePath: typeof settings.archivePath === 'string' ? settings.archivePath : source.archivePath,
    highlightPath: typeof settings.highlightPath === 'string' ? settings.highlightPath : source.highlightPath,
    primaryPath: persisted.root_path
  };
}

export function hydrateWatchedImportManagerSources<T extends { sources: ImportManagerSourceDraft[] }>(settings: T): T {
  return {
    ...settings,
    sources: settings.sources.map((source) => hydrateSource('watched', source))
  };
}

export function loadCurrentHostDesktopSources(sourceType: DesktopSourceType) {
  const host = loadCurrentDesktopHost();
  return openDatabaseConnection().driver.queryAll<DesktopSourceRecord>(
    `SELECT source_ref, source_type, config_ref, host_name, host_platform, root_path,
       path_flavor, type_settings_json, updated_at FROM desktop_sources
     WHERE source_type = ? AND host_name = ? ORDER BY updated_at, source_ref`,
    [sourceType, host.name]
  );
}

export function resolveDesktopSourceAddress(
  sourceRef: string,
  location: string,
  options: { requireAvailableRoot?: boolean } = {}
) {
  const source = loadDesktopSource(sourceRef);
  if (!source || (options.requireAvailableRoot === false
    ? !isDesktopSourceConnected(source)
    : !isDesktopSourceExecutable(source))) return null;
  const pathApi = source.path_flavor === 'windows' ? path.win32 : path.posix;
  const normalized = location.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!normalized || normalized === '..' || normalized.startsWith('../') || pathApi.isAbsolute(normalized)) return null;
  const resolved = pathApi.resolve(source.root_path, normalized);
  const relative = pathApi.relative(pathApi.resolve(source.root_path), resolved);
  return relative === '..' || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative) ? null : resolved;
}

export function isDesktopSourceExecutable(source: DesktopSourceRecord) {
  return isDesktopSourceConnected(source) && fs.existsSync(source.root_path);
}

export function isDesktopSourceConnected(source: DesktopSourceRecord) {
  if (source.host_name !== loadCurrentDesktopHost().name || !source.root_path.trim()) return false;
  try {
    const settings = JSON.parse(source.type_settings_json) as Record<string, unknown>;
    return settings.connectionStatus !== 'needs-folder';
  } catch {
    return false;
  }
}

export function updateLocalDesktopSourceHosts(input: {
  currentHostName: string; currentHostPlatform: string; driver: DatabaseDriver;
  previousHostName: string; updatedAt: string;
}) {
  const { driver } = input;
  if (!driver.queryOne("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'desktop_sources'")) return;
  driver.transaction((tx) => {
    const changed = tx.queryAll<{ object_id: string; source_type: DesktopSourceType }>(
      `SELECT source_type, CASE source_type
         WHEN 'external' THEN COALESCE((SELECT id FROM external_search_folders WHERE source_ref = source.source_ref), config_ref)
         WHEN 'watched' THEN COALESCE((SELECT binding_id FROM watched_folder_bindings WHERE source_ref = source.source_ref), config_ref)
         ELSE config_ref END object_id
       FROM desktop_sources source WHERE host_name = ?
         AND (host_name IS NOT ? OR host_platform IS NOT ?)`,
      [input.previousHostName, input.currentHostName, input.currentHostPlatform]
    );
    if (!changed.length) return;
    tx.execute(`UPDATE desktop_sources SET host_name = ?, host_platform = ?, updated_at = ?
      WHERE host_name = ?`, [input.currentHostName, input.currentHostPlatform,
      input.updatedAt, input.previousHostName]);
    transferReadwiseActiveHost(tx, input.previousHostName, input.currentHostName, input.updatedAt);
    for (const source of changed) recordHostProjectionSync(tx, source, input);
  });
}

function transferReadwiseActiveHost(
  driver: DatabaseDriver,
  previousHostName: string,
  currentHostName: string,
  updatedAt: string
) {
  const valueJson = JSON.stringify({ host_name: currentHostName });
  driver.execute(`UPDATE settings SET value = ?, updated_at = ? WHERE key = 'readwise_active_host'
    AND json_extract(value, '$.host_name') = ?`, [valueJson, updatedAt, previousHostName]);
  driver.execute(`UPDATE setting_records SET value_json = ?, updated_at = ? WHERE key = 'readwise_active_host'
    AND json_extract(value_json, '$.host_name') = ?`, [valueJson, updatedAt, previousHostName]);
}

function recordHostProjectionSync(
  driver: DatabaseDriver,
  source: { object_id: string; source_type: DesktopSourceType },
  input: { currentHostName: string; updatedAt: string }
) {
  if (source.source_type === 'readwise') return;
  const objectType = source.source_type === 'external' ? 'external_folder' : 'watched_folder';
  const row = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE[objectType], [source.object_id]);
  if (!row) return;
  upsertSyncObjectState(driver, {
    contentHash: computeSyncContentHash(objectType, JSON.parse(row.payload_json)),
    lastModifiedByHostName: input.currentHostName,
    objectId: source.object_id,
    objectType,
    syncDirty: true,
    updatedAt: input.updatedAt
  });
}

export function recordDesktopImportLocation(input: {
  configRef: string; location: string; sourceFingerprint: string;
  sourceType: DesktopSourceType; updatedAt: string;
}) {
  const source = loadDesktopSourceByConfig(input.sourceType, input.configRef);
  if (!source) return;
  const location = input.location.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!location || location === '..' || location.startsWith('../')) return;
  const driver = openDatabaseConnection().driver;
  driver.execute(
    'UPDATE import_sources SET source_ref = ?, source_location = ? WHERE source_fingerprint = ?',
    [source.source_ref, location, input.sourceFingerprint]
  );
  recordImportSourceSync(driver, input.sourceFingerprint, input.updatedAt);
}
