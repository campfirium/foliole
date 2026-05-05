import { randomUUID } from 'node:crypto';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { appendSyncChangeLog, computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';

const DESKTOP_DEVICE_ID_KEY = 'desktop_device_id';
const PLATFORM = 'windows';
const FORM_FACTOR = 'desktop';

const USER_SPACE_KEYS = new Set(['app_settings', 'import_manager_settings', 'review_scheduler_settings']);
const SESSION_RESUME_KEYS = new Set(['readwise_book_epub_picker_state', 'window_state']);
const LOCAL_ONLY_KEYS = new Set([
  DESKTOP_DEVICE_ID_KEY,
  'readwise_books_inventory_state',
  'watch_import_cursor_state'
]);

type SettingScope = 'device' | 'local_only' | 'session_resume' | 'user_space';

interface SettingDeviceRow extends DatabaseRow {
  value: string;
}

export interface SettingRecordInput {
  key: string;
  valueJson: string;
  updatedAt: string;
}

function classifySettingScope(key: string): SettingScope {
  if (LOCAL_ONLY_KEYS.has(key)) return 'local_only';
  if (SESSION_RESUME_KEYS.has(key)) return 'session_resume';
  if (USER_SPACE_KEYS.has(key)) return 'user_space';
  return 'device';
}

function readDesktopDeviceId(driver: DatabaseDriver) {
  const row = driver.queryOne<SettingDeviceRow>('SELECT value FROM settings WHERE key = ?', [
    DESKTOP_DEVICE_ID_KEY
  ]);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
  } catch {
    return null;
  }
}

function resolveSettingDeviceId(scope: SettingScope, deviceId: string) {
  return scope === 'user_space' ? '*' : deviceId;
}

export function toSettingObjectId(input: { deviceId: string; key: string; scope: SettingScope }) {
  return `${input.scope}:${PLATFORM}:${FORM_FACTOR}:${resolveSettingDeviceId(input.scope, input.deviceId)}:${input.key}`;
}

export function writeSettingRecord(driver: DatabaseDriver, input: SettingRecordInput) {
  const scope = classifySettingScope(input.key);
  if (scope === 'local_only') return;

  const deviceId = readDesktopDeviceId(driver);
  if (!deviceId) return;

  const recordDeviceId = resolveSettingDeviceId(scope, deviceId);
  const contentHash = computeSyncContentHash('setting', {
    deviceId: recordDeviceId,
    formFactor: FORM_FACTOR,
    key: input.key,
    platform: PLATFORM,
    scope,
    valueJson: input.valueJson
  });

  driver.execute(
    `INSERT INTO setting_records (
       key,
       scope,
       platform,
       form_factor,
       device_id,
       value_json,
       content_hash,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key, scope, platform, form_factor, device_id) DO UPDATE SET
       value_json = excluded.value_json,
       content_hash = excluded.content_hash,
       updated_at = excluded.updated_at,
       deleted_at = NULL`,
    [input.key, scope, PLATFORM, FORM_FACTOR, recordDeviceId, input.valueJson, contentHash, input.updatedAt]
  );
  upsertSyncObjectState(driver, {
    objectType: 'setting',
    objectId: toSettingObjectId({ deviceId, key: input.key, scope }),
    contentHash,
    lastModifiedByDeviceId: deviceId,
    updatedAt: input.updatedAt,
    syncDirty: true
  });
  appendSyncChangeLog(driver, {
    changeId: randomUUID(),
    objectType: 'setting',
    objectId: toSettingObjectId({ deviceId, key: input.key, scope }),
    changeType: 'upsert',
    deviceId,
    contentHash,
    payloadJson: JSON.stringify({
      device_id: recordDeviceId,
      form_factor: FORM_FACTOR,
      key: input.key,
      platform: PLATFORM,
      scope,
      value_json: input.valueJson
    }),
    createdAt: input.updatedAt,
    appliedAt: input.updatedAt
  });
}
