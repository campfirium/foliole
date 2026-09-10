import {
  normalizeImportManagerSettings
} from '../import/importManagerSettings.js';
import {
  migrateLegacyReadwiseAutoImportPolicy,
  normalizeReadwiseAutoImportPolicy
} from '../import/readwiseAutoImportPolicy.js';
import {
  normalizeReadwiseHostSettings,
  READWISE_HOST_SETTINGS_KEY,
  withoutReadwiseImportManagerFields
} from '../import/readwiseHostSettings.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { installReadwiseHostSettingsVersionGuards } from './readwiseHostSettingsVersionMigration.js';
import { computeSyncContentHash } from './syncState.js';

const IMPORT_MANAGER_SETTINGS_KEY = 'import_manager_settings';
const GUARD_NAMES = [
  'readwise_host_settings_insert_guard',
  'readwise_host_settings_update_guard',
  'readwise_host_setting_record_insert_guard',
  'readwise_host_setting_record_update_guard'
] as const;

interface SettingRecordRow {
  form_factor: string;
  host_name: string;
  key: string;
  platform: string;
  scope: string;
  updated_at: string;
  value_json: string;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error('readwise_auto_import_policy_migration_invalid_json');
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function legacyReaderConfig(value: unknown) {
  return record(record(value).readwiseReaderConfig);
}

function resolvePolicy(importSettings: unknown, hostSettings: unknown) {
  const payload = record(importSettings);
  return payload.readwiseAutoImportPolicy
    ? normalizeReadwiseAutoImportPolicy(payload.readwiseAutoImportPolicy)
    : migrateLegacyReadwiseAutoImportPolicy(legacyReaderConfig(hostSettings));
}

function migrateImportSettings(value: unknown, hostSettings: unknown) {
  const normalized = normalizeImportManagerSettings({
    ...record(value),
    readwiseAutoImportPolicy: resolvePolicy(value, hostSettings)
  });
  return withoutReadwiseImportManagerFields(normalized);
}

function updateSyncState(sqlite: DatabaseMigrationTarget, row: SettingRecordRow, valueJson: string) {
  if (!tableExists(sqlite, 'sync_object_state')) return;
  const contentHash = computeSyncContentHash('setting', {
    form_factor: row.form_factor,
    host_name: row.host_name,
    key: row.key,
    platform: row.platform,
    scope: row.scope,
    value_json: valueJson
  });
  const objectId = `${row.scope}:${row.platform}:${row.form_factor}:${row.host_name}:${row.key}`;
  sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, current_version_id, content_hash,
      last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
    VALUES ('setting', ?, COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1),
      NULL, ?, ?, ?, NULL, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET
      state_seq = excluded.state_seq, content_hash = excluded.content_hash,
      last_modified_by_host_name = excluded.last_modified_by_host_name,
      updated_at = excluded.updated_at, deleted_at = NULL, sync_dirty = 1`)
    .run(objectId, contentHash, row.host_name, row.updated_at);
  sqlite.prepare(`UPDATE setting_records SET content_hash = ?
    WHERE key = ? AND scope = ? AND platform = ? AND form_factor = ? AND host_name = ?`)
    .run(contentHash, row.key, row.scope, row.platform, row.form_factor, row.host_name);
}

function migrateProjection(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'settings')) return null;
  const rows = sqlite.prepare(`SELECT key, value FROM settings
    WHERE key IN (?, ?)`).all(IMPORT_MANAGER_SETTINGS_KEY, READWISE_HOST_SETTINGS_KEY) as Array<{
      key: string;
      value: string;
    }>;
  const byKey = new Map(rows.map((row) => [row.key, parseJson(row.value)]));
  const host = byKey.get(READWISE_HOST_SETTINGS_KEY);
  const imports = byKey.get(IMPORT_MANAGER_SETTINGS_KEY);
  if (imports && host) {
    sqlite.prepare('UPDATE settings SET value = ? WHERE key = ?')
      .run(JSON.stringify(migrateImportSettings(imports, host)), IMPORT_MANAGER_SETTINGS_KEY);
  }
  if (host) {
    sqlite.prepare('UPDATE settings SET value = ? WHERE key = ?')
      .run(JSON.stringify(normalizeReadwiseHostSettings(host)), READWISE_HOST_SETTINGS_KEY);
  }
  return host ?? null;
}

function migrateCanonical(sqlite: DatabaseMigrationTarget, projectedLegacyHost: unknown) {
  if (!tableExists(sqlite, 'setting_records')) return;
  const rows = sqlite.prepare(`SELECT key, scope, platform, form_factor, host_name, value_json, updated_at
    FROM setting_records WHERE key IN (?, ?)`).all(
      IMPORT_MANAGER_SETTINGS_KEY,
      READWISE_HOST_SETTINGS_KEY
    ) as SettingRecordRow[];
  const host = rows
    .filter((row) => row.key === READWISE_HOST_SETTINGS_KEY)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at)
      || left.host_name.localeCompare(right.host_name))[0];
  const hostValue = projectedLegacyHost ?? (host ? parseJson(host.value_json) : null);
  for (const row of rows) {
    const parsed = parseJson(row.value_json);
    const next = row.key === READWISE_HOST_SETTINGS_KEY
      ? normalizeReadwiseHostSettings(parsed)
      : migrateImportSettings(parsed, hostValue);
    const valueJson = JSON.stringify(next);
    sqlite.prepare(`UPDATE setting_records SET value_json = ?
      WHERE key = ? AND scope = ? AND platform = ? AND form_factor = ? AND host_name = ?`)
      .run(valueJson, row.key, row.scope, row.platform, row.form_factor, row.host_name);
    updateSyncState(sqlite, row, valueJson);
  }
}

export function migrateReadwiseAutoImportPolicy(sqlite: DatabaseMigrationTarget) {
  for (const name of GUARD_NAMES) sqlite.exec(`DROP TRIGGER IF EXISTS ${name}`);
  const projectedLegacyHost = migrateProjection(sqlite);
  migrateCanonical(sqlite, projectedLegacyHost);
  installReadwiseHostSettingsVersionGuards(sqlite);
}
