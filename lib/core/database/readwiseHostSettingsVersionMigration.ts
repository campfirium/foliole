import {
  normalizeReadwiseHostSettings,
  READWISE_HOST_SETTINGS_KEY,
  READWISE_HOST_SETTINGS_VERSION
} from '../import/readwiseHostSettings.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { computeSyncContentHash } from './syncState.js';

interface SettingRecordRow {
  form_factor: string;
  host_name: string;
  key: string;
  platform: string;
  scope: string;
  updated_at: string;
  value_json: string;
}

const GUARD_ERROR = 'readwise_host_settings_version_unsupported';

const READWISE_HOST_SETTINGS_PROJECTION_GUARDS = [
  `CREATE TRIGGER IF NOT EXISTS readwise_host_settings_insert_guard
   BEFORE INSERT ON settings WHEN NEW.key = '${READWISE_HOST_SETTINGS_KEY}'
     AND (json_valid(NEW.value) = 0 OR COALESCE(json_extract(NEW.value, '$.version'), 0) < ${READWISE_HOST_SETTINGS_VERSION})
   BEGIN SELECT RAISE(ABORT, '${GUARD_ERROR}'); END`,
  `CREATE TRIGGER IF NOT EXISTS readwise_host_settings_update_guard
   BEFORE UPDATE OF value ON settings WHEN NEW.key = '${READWISE_HOST_SETTINGS_KEY}'
     AND (json_valid(NEW.value) = 0 OR COALESCE(json_extract(NEW.value, '$.version'), 0) < ${READWISE_HOST_SETTINGS_VERSION})
   BEGIN SELECT RAISE(ABORT, '${GUARD_ERROR}'); END`
] as const;

const READWISE_HOST_SETTINGS_CANONICAL_GUARDS = [
  `CREATE TRIGGER IF NOT EXISTS readwise_host_setting_record_insert_guard
   BEFORE INSERT ON setting_records WHEN NEW.key = '${READWISE_HOST_SETTINGS_KEY}'
     AND (json_valid(NEW.value_json) = 0 OR COALESCE(json_extract(NEW.value_json, '$.version'), 0) < ${READWISE_HOST_SETTINGS_VERSION})
   BEGIN SELECT RAISE(ABORT, '${GUARD_ERROR}'); END`,
  `CREATE TRIGGER IF NOT EXISTS readwise_host_setting_record_update_guard
   BEFORE UPDATE OF value_json ON setting_records WHEN NEW.key = '${READWISE_HOST_SETTINGS_KEY}'
     AND (json_valid(NEW.value_json) = 0 OR COALESCE(json_extract(NEW.value_json, '$.version'), 0) < ${READWISE_HOST_SETTINGS_VERSION})
   BEGIN SELECT RAISE(ABORT, '${GUARD_ERROR}'); END`
] as const;

export const READWISE_HOST_SETTINGS_VERSION_GUARDS = [
  ...READWISE_HOST_SETTINGS_PROJECTION_GUARDS,
  ...READWISE_HOST_SETTINGS_CANONICAL_GUARDS
] as const;

function migrateJson(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error('readwise_host_settings_migration_invalid_json');
  }
  return JSON.stringify(normalizeReadwiseHostSettings(parsed));
}

function migrateProjection(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'settings')) return;
  const rows = sqlite.prepare('SELECT value FROM settings WHERE key = ?')
    .all(READWISE_HOST_SETTINGS_KEY) as Array<{ value: string }>;
  for (const row of rows) {
    sqlite.prepare('UPDATE settings SET value = ? WHERE key = ?')
      .run(migrateJson(row.value), READWISE_HOST_SETTINGS_KEY);
  }
}

function migrateCanonicalRecords(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'setting_records')) return;
  const rows = sqlite.prepare(`SELECT key, scope, platform, form_factor, host_name, value_json, updated_at
    FROM setting_records WHERE key = ?`).all(READWISE_HOST_SETTINGS_KEY) as SettingRecordRow[];
  for (const row of rows) {
    const valueJson = migrateJson(row.value_json);
    const contentHash = computeSyncContentHash('setting', {
      form_factor: row.form_factor,
      host_name: row.host_name,
      key: row.key,
      platform: row.platform,
      scope: row.scope,
      value_json: valueJson
    });
    sqlite.prepare(`UPDATE setting_records SET value_json = ?, content_hash = ?
      WHERE key = ? AND scope = ? AND platform = ? AND form_factor = ? AND host_name = ?`)
      .run(valueJson, contentHash, row.key, row.scope, row.platform, row.form_factor, row.host_name);
    if (tableExists(sqlite, 'sync_object_state')) {
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
    }
  }
}

export function migrateReadwiseHostSettingsVersion(sqlite: DatabaseMigrationTarget) {
  if (tableExists(sqlite, 'settings')) {
    migrateProjection(sqlite);
    for (const statement of READWISE_HOST_SETTINGS_PROJECTION_GUARDS) sqlite.exec(statement);
  }
  if (tableExists(sqlite, 'setting_records')) {
    migrateCanonicalRecords(sqlite);
    for (const statement of READWISE_HOST_SETTINGS_CANONICAL_GUARDS) sqlite.exec(statement);
  }
}
