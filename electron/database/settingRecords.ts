import { resolveDesktopSettingIdentity, resolveDesktopSettingPolicy } from '../../lib/core/database/desktopSettingPolicy.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { loadOrCreateDatabaseDeviceId } from '../../lib/core/database/syncDeviceIdentity.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';

export interface SettingRecordInput {
  key: string;
  valueJson: string;
  updatedAt: string;
}

export function writeSettingRecord(driver: DatabaseDriver, input: SettingRecordInput) {
  if (!resolveDesktopSettingPolicy(input.key).canonical) return;
  const deviceId = loadOrCreateDatabaseDeviceId(driver, input.updatedAt);
  const identity = resolveDesktopSettingIdentity(input.key, deviceId);
  if (!identity) return;
  const contentHash = computeSyncContentHash('setting', {
    device_id: identity.deviceId,
    form_factor: identity.formFactor,
    key: input.key,
    platform: identity.platform,
    scope: identity.scope,
    value_json: input.valueJson
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
    [input.key, identity.scope, identity.platform, identity.formFactor, identity.deviceId,
      input.valueJson, contentHash, input.updatedAt]
  );
  upsertSyncObjectState(driver, {
    objectType: 'setting',
    objectId: identity.objectId,
    contentHash,
    lastModifiedByDeviceId: deviceId,
    updatedAt: input.updatedAt,
    syncDirty: true
  });
}
