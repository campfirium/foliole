import { normalizeImportManagerSettings } from '../import/importManagerSettings.js';
import {
  readwiseHostSettingsFromImportManager,
  READWISE_HOST_SETTINGS_KEY,
  withoutReadwiseImportManagerFields
} from '../import/readwiseHostSettings.js';
import { readwiseSourceTypeSettings } from '../import/readwiseSourceSettings.js';

import { DESKTOP_SETTING_FORM_FACTOR, DESKTOP_SETTING_PLATFORM } from './desktopSettingPolicy.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { computeSyncContentHash } from './syncState.js';

const GLOBAL_KEY = 'import_manager_settings';
const ACTIVE_HOST_KEY = 'readwise_active_host';

interface SettingProjection { updated_at: string; value: string }
interface SourceRow { config_ref: string; host_name: string; source_ref: string; type_settings_json: string }

function parseRecord(value: string | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    throw new Error('readwise_host_settings_migration_invalid_json');
  }
}

function readProjection(sqlite: DatabaseMigrationTarget, key: string) {
  if (!tableExists(sqlite, 'settings')) return undefined;
  return sqlite.prepare('SELECT value, updated_at FROM settings WHERE key = ?').all(key)[0] as
    SettingProjection | undefined;
}

function readHostName(value: string | undefined) {
  const payload = parseRecord(value);
  const hostName = payload.host_name;
  return typeof hostName === 'string' && hostName.trim() ? hostName.trim() : null;
}

function currentHostName(sqlite: DatabaseMigrationTarget) {
  const local = tableExists(sqlite, 'sync_group_local_state') && tableExists(sqlite, 'sync_group_members')
    ? sqlite.prepare(`SELECT member.host_name FROM sync_group_local_state local
        JOIN sync_group_members member ON member.group_id = local.group_id
          AND member.host_name = local.local_host_name
        WHERE local.singleton_id = 1 AND local.member_state = 'active'
          AND member.state = 'active' LIMIT 1`).all()[0] as { host_name?: string } | undefined
    : undefined;
  if (local?.host_name?.trim()) return local.host_name.trim();
  const value = readProjection(sqlite, 'host_name')?.value;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
  } catch {
    return value.trim() || null;
  }
}

function readSources(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'desktop_sources')) return [];
  return sqlite.prepare(`SELECT source_ref, config_ref, host_name, type_settings_json
    FROM desktop_sources WHERE source_type = 'readwise' ORDER BY source_ref`).all() as SourceRow[];
}

function resolveOwner(sqlite: DatabaseMigrationTarget, sources: SourceRow[]) {
  const sourceHosts = [...new Set(sources.map((source) => source.host_name.trim()).filter(Boolean))];
  if (sourceHosts.length > 1) throw new Error('readwise_host_settings_owner_ambiguous');
  return sourceHosts[0]
    ?? readHostName(readProjection(sqlite, ACTIVE_HOST_KEY)?.value)
    ?? currentHostName(sqlite);
}

function enrichSources(sqlite: DatabaseMigrationTarget, raw: unknown, sources: SourceRow[]) {
  const drafts = normalizeImportManagerSettings(raw).readwiseSources;
  const kinds = new Set<string>();
  for (const source of sources) {
    const existing = parseRecord(source.type_settings_json);
    const draft = drafts.find((candidate) => candidate.id === source.config_ref);
    const kind = draft?.kind ?? existing.kind;
    if (typeof kind !== 'string' || kinds.has(kind)) throw new Error('readwise_source_kind_ambiguous');
    kinds.add(kind);
    if (!draft) continue;
    sqlite.prepare(`UPDATE desktop_sources SET type_settings_json = ? WHERE source_ref = ?`)
      .run(JSON.stringify(readwiseSourceTypeSettings(draft)), source.source_ref);
  }
}

function nextStateSequence(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'sync_object_state')) return 1;
  const row = sqlite.prepare('SELECT COALESCE(MAX(state_seq), 0) + 1 AS next FROM sync_object_state').all()[0] as
    { next: number };
  return row.next;
}

function writeCanonicalSetting(sqlite: DatabaseMigrationTarget, input: {
  hostName: string; key: string; scope: 'host' | 'user_space'; updatedAt: string; value: unknown;
}) {
  const valueJson = JSON.stringify(input.value);
  const payload = {
    form_factor: DESKTOP_SETTING_FORM_FACTOR,
    host_name: input.hostName,
    key: input.key,
    platform: DESKTOP_SETTING_PLATFORM,
    scope: input.scope,
    value_json: valueJson
  };
  const hash = computeSyncContentHash('setting', payload);
  sqlite.prepare(`INSERT INTO setting_records
    (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(key, scope, platform, form_factor, host_name) DO UPDATE SET
      value_json = excluded.value_json, content_hash = excluded.content_hash,
      updated_at = excluded.updated_at, deleted_at = NULL`)
    .run(input.key, input.scope, DESKTOP_SETTING_PLATFORM, DESKTOP_SETTING_FORM_FACTOR,
      input.hostName, valueJson, hash, input.updatedAt);
  if (!tableExists(sqlite, 'sync_object_state')) return;
  const objectId = `${input.scope}:${DESKTOP_SETTING_PLATFORM}:${DESKTOP_SETTING_FORM_FACTOR}:${input.hostName}:${input.key}`;
  sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, current_version_id, content_hash,
      last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
    VALUES ('setting', ?, ?, NULL, ?, ?, ?, NULL, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, last_modified_by_host_name = excluded.last_modified_by_host_name,
      updated_at = excluded.updated_at, deleted_at = NULL, sync_dirty = 1`)
    .run(objectId, nextStateSequence(sqlite), hash, input.hostName, input.updatedAt);
}

export function migrateReadwiseHostSettings(sqlite: DatabaseMigrationTarget) {
  const projection = readProjection(sqlite, GLOBAL_KEY);
  const raw = parseRecord(projection?.value);
  const sources = readSources(sqlite);
  const hasLegacyState = Boolean(projection && (
    'readwiseReaderConfig' in raw || 'readwiseRootPath' in raw || 'readwiseSources' in raw
  ) || sources.length > 0);
  const owner = hasLegacyState ? resolveOwner(sqlite, sources) : null;
  if (hasLegacyState && !owner) throw new Error('readwise_host_settings_owner_missing');
  enrichSources(sqlite, raw, sources);
  const updatedAt = projection?.updated_at ?? new Date(0).toISOString();
  const globalValue = withoutReadwiseImportManagerFields(raw);
  writeCanonicalSetting(sqlite, {
    hostName: '*', key: GLOBAL_KEY, scope: 'user_space', updatedAt, value: globalValue
  });
  sqlite.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(GLOBAL_KEY, JSON.stringify(globalValue), updatedAt);
  if (!owner) return;
  const hostValue = readwiseHostSettingsFromImportManager(raw);
  writeCanonicalSetting(sqlite, {
    hostName: owner, key: READWISE_HOST_SETTINGS_KEY, scope: 'host', updatedAt, value: hostValue
  });
  if (owner === currentHostName(sqlite)) {
    sqlite.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(READWISE_HOST_SETTINGS_KEY, JSON.stringify(hostValue), updatedAt);
  }
}
