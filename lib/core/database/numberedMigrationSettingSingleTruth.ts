import {
  DESKTOP_DECLARED_SETTING_KEYS,
  resolveDesktopSettingIdentity,
  resolveDesktopSettingPolicy
} from './desktopSettingPolicy.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { computeSyncContentHash } from './syncState.js';

interface ProjectionRow {
  updated_at: string;
  value: string;
}

interface RecordRow {
  content_hash: string;
  updated_at: string;
  value_json: string;
}

interface StateRow {
  content_hash: string;
  deleted_at: string | null;
  updated_at: string;
}

export function migrateSettingSingleTruth(sqlite: DatabaseMigrationTarget) {
  if (!['settings', 'setting_records', 'sync_object_state'].every((table) => tableExists(sqlite, table))) return;
  const currentDeviceId = readDeviceId(sqlite);
  if (!currentDeviceId) return;
  for (const key of DESKTOP_DECLARED_SETTING_KEYS) {
    if (!resolveDesktopSettingPolicy(key).canonical) continue;
    const identity = resolveDesktopSettingIdentity(key, currentDeviceId);
    if (identity) reconcileSetting(sqlite, identity, currentDeviceId);
  }
}

function reconcileSetting(
  sqlite: DatabaseMigrationTarget,
  identity: NonNullable<ReturnType<typeof resolveDesktopSettingIdentity>>,
  currentDeviceId: string
) {
  const projection = readProjection(sqlite, identity.key);
  const record = readRecord(sqlite, identity);
  const state = readState(sqlite, identity.objectId);
  const latestActiveAt = maxTimestamp(projection?.updated_at, record?.updated_at);
  if (state?.deleted_at && (!latestActiveAt || state.updated_at >= latestActiveAt)) {
    deleteProjectionAndRecord(sqlite, identity);
    return;
  }
  if (!record && projection) {
    writeCanonical(sqlite, identity, projection.value, projection.updated_at, currentDeviceId);
    return;
  }
  if (!record) return;
  if (projection && projection.updated_at > record.updated_at) {
    writeCanonical(sqlite, identity, projection.value, projection.updated_at, currentDeviceId);
    return;
  }
  writeProjection(sqlite, identity.key, record.value_json, record.updated_at);
  ensureCanonicalState(sqlite, identity, record, state, currentDeviceId);
}

function ensureCanonicalState(
  sqlite: DatabaseMigrationTarget,
  identity: NonNullable<ReturnType<typeof resolveDesktopSettingIdentity>>,
  record: RecordRow,
  state: StateRow | undefined,
  currentDeviceId: string
) {
  const contentHash = settingContentHash(identity, record.value_json);
  if (record.content_hash !== contentHash) {
    upsertRecord(sqlite, identity, record.value_json, contentHash, record.updated_at);
  }
  if (!state || state.deleted_at || state.content_hash !== contentHash) {
    upsertDirtyState(sqlite, identity.objectId, contentHash, currentDeviceId, record.updated_at);
  }
}

function writeCanonical(
  sqlite: DatabaseMigrationTarget,
  identity: NonNullable<ReturnType<typeof resolveDesktopSettingIdentity>>,
  valueJson: string,
  updatedAt: string,
  currentDeviceId: string
) {
  const contentHash = settingContentHash(identity, valueJson);
  upsertRecord(sqlite, identity, valueJson, contentHash, updatedAt);
  upsertDirtyState(sqlite, identity.objectId, contentHash, currentDeviceId, updatedAt);
  writeProjection(sqlite, identity.key, valueJson, updatedAt);
}

function upsertRecord(
  sqlite: DatabaseMigrationTarget,
  identity: NonNullable<ReturnType<typeof resolveDesktopSettingIdentity>>,
  valueJson: string,
  contentHash: string,
  updatedAt: string
) {
  sqlite.prepare(
    `INSERT INTO setting_records (key, scope, platform, form_factor, device_id, value_json, content_hash, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key, scope, platform, form_factor, device_id) DO UPDATE SET
       value_json = excluded.value_json, content_hash = excluded.content_hash,
       updated_at = excluded.updated_at, deleted_at = NULL`
  ).run(identity.key, identity.scope, identity.platform, identity.formFactor, identity.deviceId,
    valueJson, contentHash, updatedAt);
}

function upsertDirtyState(
  sqlite: DatabaseMigrationTarget,
  objectId: string,
  contentHash: string,
  currentDeviceId: string,
  updatedAt: string
) {
  sqlite.prepare(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('setting', ?, COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1), ?, ?, ?, 1)
     ON CONFLICT(object_type, object_id) DO UPDATE SET
       state_seq = excluded.state_seq, content_hash = excluded.content_hash,
       last_modified_by_device_id = excluded.last_modified_by_device_id,
       updated_at = excluded.updated_at, deleted_at = NULL, sync_dirty = 1`
  ).run(objectId, contentHash, currentDeviceId, updatedAt);
}

function writeProjection(sqlite: DatabaseMigrationTarget, key: string, value: string, updatedAt: string) {
  sqlite.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, updatedAt);
}

function deleteProjectionAndRecord(
  sqlite: DatabaseMigrationTarget,
  identity: NonNullable<ReturnType<typeof resolveDesktopSettingIdentity>>
) {
  sqlite.prepare('DELETE FROM settings WHERE key = ?').run(identity.key);
  sqlite.prepare(
    `DELETE FROM setting_records
     WHERE key = ? AND scope = ? AND platform = ? AND form_factor = ? AND device_id = ?`
  ).run(identity.key, identity.scope, identity.platform, identity.formFactor, identity.deviceId);
}

function readProjection(sqlite: DatabaseMigrationTarget, key: string) {
  return sqlite.prepare('SELECT value, updated_at FROM settings WHERE key = ?').all(key)[0] as ProjectionRow | undefined;
}

function readRecord(
  sqlite: DatabaseMigrationTarget,
  identity: NonNullable<ReturnType<typeof resolveDesktopSettingIdentity>>
) {
  return sqlite.prepare(
    `SELECT value_json, content_hash, updated_at FROM setting_records
     WHERE key = ? AND scope = ? AND platform = ? AND form_factor = ? AND device_id = ?`
  ).all(identity.key, identity.scope, identity.platform, identity.formFactor, identity.deviceId)[0] as RecordRow | undefined;
}

function readState(sqlite: DatabaseMigrationTarget, objectId: string) {
  return sqlite.prepare(
    `SELECT content_hash, updated_at, deleted_at FROM sync_object_state
     WHERE object_type = 'setting' AND object_id = ?`
  ).all(objectId)[0] as StateRow | undefined;
}

function readDeviceId(sqlite: DatabaseMigrationTarget) {
  for (const key of ['device_id', 'desktop_device_id']) {
    const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').all(key)[0] as { value?: string } | undefined;
    if (!row?.value) continue;
    try {
      const parsed = JSON.parse(row.value) as unknown;
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    } catch {
      if (row.value.trim()) return row.value.trim();
    }
  }
  return null;
}

function settingContentHash(
  identity: NonNullable<ReturnType<typeof resolveDesktopSettingIdentity>>,
  valueJson: string
) {
  return computeSyncContentHash('setting', {
    device_id: identity.deviceId,
    form_factor: identity.formFactor,
    key: identity.key,
    platform: identity.platform,
    scope: identity.scope,
    value_json: valueJson
  });
}

function maxTimestamp(left?: string, right?: string) {
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}
