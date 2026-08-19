import fs from 'node:fs';
import path from 'node:path';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';
import type { ImportManagerSourceDraft } from '../../lib/core/import/importManagerSettings.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';

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

function currentHost() {
  const driver = openDatabaseConnection().driver;
  const deviceId = loadOrCreateDesktopDeviceId();
  const member = driver.queryOne<{ device_kind: string; device_name: string }>(
    `SELECT m.device_kind, m.device_name FROM sync_group_local_state l
     JOIN sync_group_members m ON m.group_id = l.group_id AND m.device_id = l.local_device_id
     WHERE l.singleton_id = 1 AND l.member_state = 'active' AND m.state = 'active' LIMIT 1`
  );
  return { name: member?.device_name ?? deviceId, platform: member?.device_kind ?? process.platform };
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
  const host = currentHost();
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

export function upsertImportManagerSources(input: {
  readwiseSources: ImportManagerSourceDraft[]; sources: ImportManagerSourceDraft[]; updatedAt: string;
}) {
  for (const [sourceType, sources] of [['watched', input.sources], ['readwise', input.readwiseSources]] as const) {
    for (const source of sources) {
      if (!source.id.trim() || !source.primaryPath.trim()) continue;
      upsertDesktopSource({
        configRef: source.id, rootPath: source.primaryPath, sourceType,
        typeSettings: { archivePath: source.archivePath, highlightPath: source.highlightPath, kind: source.kind ?? null },
        updatedAt: input.updatedAt
      });
    }
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

export function hydrateImportManagerSources<T extends {
  readwiseSources: ImportManagerSourceDraft[]; sources: ImportManagerSourceDraft[];
}>(settings: T): T {
  return {
    ...settings,
    readwiseSources: settings.readwiseSources.map((source) => hydrateSource('readwise', source)),
    sources: settings.sources.map((source) => hydrateSource('watched', source))
  };
}

export function resolveDesktopSourceAddress(sourceRef: string, location: string) {
  const source = loadDesktopSource(sourceRef);
  if (!source || source.host_name !== currentHost().name || !fs.existsSync(source.root_path)) return null;
  const pathApi = source.path_flavor === 'windows' ? path.win32 : path.posix;
  const normalized = location.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!normalized || normalized === '..' || normalized.startsWith('../') || pathApi.isAbsolute(normalized)) return null;
  const resolved = pathApi.resolve(source.root_path, normalized);
  const relative = pathApi.relative(pathApi.resolve(source.root_path), resolved);
  return relative === '..' || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative) ? null : resolved;
}

export function updateLocalDesktopSourceHosts(input: {
  currentHostName: string; driver: DatabaseDriver;
  installationRef: string; previousHostName: string | null; updatedAt: string;
}) {
  const { driver } = input;
  if (!driver.queryOne("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'desktop_sources'")) return;
  driver.execute(
    `UPDATE desktop_sources SET host_name = ?, updated_at = ? WHERE
       (source_type = 'external' AND source_ref IN (
         SELECT source_ref FROM external_search_folders WHERE owner_installation_id = ?
       )) OR (source_type = 'watched' AND source_ref IN (
         SELECT source_ref FROM watched_folder_bindings WHERE connected_device_id IN (?, ?)
       )) OR source_type = 'readwise'`,
    [input.currentHostName, input.updatedAt, input.installationRef, input.currentHostName,
      input.previousHostName]
  );
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
